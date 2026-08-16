import 'dotenv/config';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { db } from '../db';
import { users, passwordResetTokens, userSettings } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { isAdmin } from '../lib/adminUtils'; // Import the new utility
import { getSettingNumber, getSettingBoolean, getSetting } from '../lib/settings';

const LANGUAGE_NAMES: Record<string, string> = { en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch' };
function languageNameFromCode(code: string): string {
  return LANGUAGE_NAMES[code] || 'English';
}

const router = Router();
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID || undefined);

// Cookie options - make sure these are consistent
const COOKIE_OPTS_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // Secure in production only
  sameSite: process.env.NODE_ENV === 'production' ? 'none' as const : 'lax' as const, // Important for cross-site requests in production
  maxAge: 24 * 60 * 60 * 1000, // default 24h; overridden with session_timeout_hours
};

// Function to issue JWT token
async function issueToken(res: Response, userId: number, email: string) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error('JWT_SECRET is not configured');
  const sessionHours = await getSettingNumber('session_timeout_hours', 24);
  const token = jwt.sign({ userId, email }, jwtSecret, { expiresIn: `${sessionHours}h` });
  
  // In production, we need secure cookies with SameSite=None for cross-site requests
  const cookieOpts = { ...COOKIE_OPTS_BASE, maxAge: sessionHours * 60 * 60 * 1000 };
  
  // Set the token as HTTP-only cookie
  res.cookie('token', token, cookieOpts);
}

function sanitize(str: string): string {
  return str.trim().replace(/<[^>]*>/g, '').slice(0, 500);
}

router.post('/signup', async (req: Request, res: Response) => {
  try {
    const name = sanitize(req.body.name || '');
    const email = sanitize(req.body.email || '').toLowerCase();
    const password = req.body.password || '';

    if (!name || !email || !password) return res.status(400).json({ error: 'All fields are required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Invalid email' });

    if (!(await getSettingBoolean('signup_open', true))) {
      return res.status(403).json({ error: 'Registrations are currently closed. Please try again later.' });
    }

    const minPasswordLength = await getSettingNumber('min_password_length', 8);
    if (password.length < minPasswordLength) {
      return res.status(400).json({ error: `Password must be at least ${minPasswordLength} characters` });
    }

    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) return res.status(400).json({ error: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, 12);
    const trialDays = await getSettingNumber('trial_days', 0);
    const defaultLanguage = languageNameFromCode(await getSetting('default_language', 'en'));
    const insertValues: Record<string, any> = { name, email, passwordHash };
    if (trialDays > 0) insertValues.subscriptionStatus = 'trialing';
    const [user] = await db.insert(users).values(insertValues as any).returning();
    await db.insert(userSettings).values({ userId: user.id, language: defaultLanguage }).onConflictDoNothing();

    await issueToken(res, user.id, user.email);
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        subscriptionTier: user.subscriptionTier || 'free',
        subscriptionStatus: user.subscriptionStatus || 'inactive',
        isAdmin: isAdmin(user.email),  // Use the imported function
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const email = sanitize(req.body.email || '').toLowerCase();
    const password = req.body.password || '';

    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid email or password' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    // Trial enforcement: once the trial window has passed, fall back to free/inactive.
    const trialDays = await getSettingNumber('trial_days', 0);
    if (user.subscriptionStatus === 'trialing' && trialDays > 0 && user.createdAt) {
      const trialEnd = new Date(new Date(user.createdAt).getTime() + trialDays * 24 * 60 * 60 * 1000);
      if (new Date() > trialEnd && user.subscriptionTier === 'free') {
        await db.update(users).set({ subscriptionStatus: 'inactive' }).where(eq(users.id, user.id));
        user.subscriptionStatus = 'inactive';
      }
    }

    await await issueToken(res, user.id, user.email);
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        subscriptionTier: user.subscriptionTier || 'free',
        subscriptionStatus: user.subscriptionStatus || 'inactive',
        isAdmin: isAdmin(user.email),  // Use the imported function
      },
    });
  } catch (e: any) {
    console.error('Login error');
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/google', async (req: Request, res: Response) => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      console.error('GOOGLE_CLIENT_ID is not configured');
      return res.status(503).json({ 
        error: 'Google authentication is not configured. Contact the administrator to set up Google authentication.' 
      });
    }

    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Missing credential' });

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    if (!payload?.email) return res.status(400).json({ error: 'Invalid Google token - no email' });

    const email = payload.email.toLowerCase();
    const name = payload.name || email.split('@')[0];
    const googleId = payload.sub;
    const avatarUrl = payload.picture || null;

    let [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      if (!(await getSettingBoolean('signup_open', true))) {
        return res.status(403).json({ error: 'Registrations are currently closed. Please try again later.' });
      }
      // Create new user if doesn't exist
      const trialDays = await getSettingNumber('trial_days', 0);
      const defaultLanguage = languageNameFromCode(await getSetting('default_language', 'en'));
      const googleInsert: Record<string, any> = { name, email, googleId, avatarUrl };
      if (trialDays > 0) googleInsert.subscriptionStatus = 'trialing';
      [user] = await db.insert(users).values(googleInsert as any).returning();
      await db.insert(userSettings).values({ userId: user.id, language: defaultLanguage }).onConflictDoNothing();
    } else if (!user.googleId) {
      // Update existing user with Google ID if not already set
      await db.update(users).set({ googleId, avatarUrl }).where(eq(users.id, user.id));
    }

    await issueToken(res, user.id, user.email);
    res.json({
      user: {
        id: user.id,
        name: user.name || name,
        email: user.email,
        avatarUrl: avatarUrl || user.avatarUrl,
        subscriptionTier: user.subscriptionTier || 'free',
        subscriptionStatus: user.subscriptionStatus || 'inactive',
        isAdmin: isAdmin(user.email),  // Use the imported function
      },
    });
  } catch (e: any) {
    console.error('Google authentication error');
    
    if (e.message?.includes('invalid_grant') || e.message?.includes('idpiframe_initialization_failed')) {
      return res.status(500).json({ 
        error: 'Google authentication failed. Check Google Cloud Console for authorized origins.' 
      });
    }
    
    res.status(500).json({ error: 'Google authentication failed' });
  }
});

router.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const email = sanitize(req.body.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email required' });

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await db.insert(passwordResetTokens).values({ userId: user.id, token, expiresAt });

    const shouldExposeResetToken =
      process.env.NODE_ENV !== 'production' && process.env.EXPOSE_RESET_TOKEN === 'true';
    res.json({
      message: 'If that email exists, a reset link has been sent.',
      resetToken: shouldExposeResetToken ? token : undefined,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required' });
    const resetMinLength = await getSettingNumber('min_password_length', 8);
    if (password.length < resetMinLength) return res.status(400).json({ error: `Password must be at least ${resetMinLength} characters` });

    const [resetRecord] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token)).limit(1);
    if (!resetRecord || resetRecord.used || new Date(resetRecord.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await db.update(users).set({ passwordHash }).where(eq(users.id, resetRecord.userId));
    await db.update(passwordResetTokens).set({ used: true }).where(eq(passwordResetTokens.id, resetRecord.id));

    res.json({ message: 'Password updated successfully' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    if (!user) {
      // Clear the invalid token cookie and return unauthorized
      res.clearCookie('token');
      return res.status(401).json({ user: null });
    }
    
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        subscriptionTier: user.subscriptionTier || 'free',
        subscriptionStatus: user.subscriptionStatus || 'inactive',
        isAdmin: isAdmin(user.email),  // Use the imported function
      },
    });
  } catch (e) {
    console.error('Error in /api/auth/me:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', (_req, res: Response) => {
  // Clear the JWT token cookie
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

export default router;