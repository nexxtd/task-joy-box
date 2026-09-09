import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import crypto from 'crypto';
import { db } from '../db.js';
import { pool } from '../db.js';
import { users, passwordResetTokens, emailVerificationTokens, pendingSignups, twoFactorTokens, userSettings } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { isAdmin } from '../lib/adminUtils.js'; // Import the new utility
import { getSettingNumber, getSettingBoolean, getSetting } from '../lib/settings.js';
import { sendEmail, verificationEmailHtml, resetEmailHtml } from '../lib/email.js';

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

    const existingUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser.length > 0) return res.status(400).json({ error: 'Email already in use' });
    const existingPending = await db.select().from(pendingSignups).where(eq(pendingSignups.email, email)).limit(1);
    if (existingPending.length > 0) {
      if (new Date(existingPending[0].expiresAt) > new Date()) {
        return res.status(400).json({ error: 'Verification email already sent. Please check your inbox.' });
      } else {
        await db.delete(pendingSignups).where(eq(pendingSignups.email, email));
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const vToken = crypto.randomBytes(32).toString('hex');
    const vExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.insert(pendingSignups).values({ name, email, passwordHash, token: vToken, expiresAt: vExpiresAt });

    const frontend = process.env.FRONTEND_URL || process.env.BACKEND_URL || 'http://localhost:5173';
    const link = `${frontend.replace(/\/$/, '')}/verify-email?token=${vToken}`;
    let emailSent = false;
    try {
      emailSent = await sendEmail({ to: email, subject: 'Verify your email — MyPlanner', html: verificationEmailHtml(name, link), text: `Hi ${name}, verify your email: ${link}` });
    } catch (e) { console.error('verification email failed', e); }
    if (!emailSent) console.log(`[signup] verification link for ${email}: ${link}`);

    res.status(201).json({
      message: emailSent ? 'Account created. Please check your email to verify your address.' : 'Account created. Verification email could not be sent — check server logs for the link.',
      email,
      requiresVerification: true,
      debugLink: process.env.NODE_ENV !== 'production' || !emailSent ? link : undefined,
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

    if (!(user as any).emailVerified && !user.googleId) {
      return res.status(403).json({ error: 'Please verify your email before logging in. Check your inbox for the verification link.', code: 'EMAIL_NOT_VERIFIED', email: user.email });
    }

    if ((user as any).twoFactorEnabled) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await db.insert(twoFactorTokens).values({ userId: user.id, code, expiresAt });
      try {
        const { twoFactorEmailHtml } = await import('../lib/email.js');
        const { sendEmail: send2FA } = await import('../lib/email.js');
        await send2FA({ to: user.email, subject: 'Your login code — MyPlanner', html: twoFactorEmailHtml(user.name, code), text: `Your code is ${code} (expires in 10 min)` });
      } catch (e) { console.error('2fa email failed', e); }
      console.log(`[2FA] code for ${user.email}: ${code}`);
      return res.json({ requires2FA: true, email: user.email, message: 'Two-factor code sent to your email. Please enter it to continue.' });
    }

    // Trial enforcement: once the trial window has passed, fall back to free/inactive.
    const trialDays = await getSettingNumber('trial_days', 0);
    if (user.subscriptionStatus === 'trialing' && trialDays > 0 && user.createdAt) {
      const trialEnd = new Date(new Date(user.createdAt).getTime() + trialDays * 24 * 60 * 60 * 1000);
      if (new Date() > trialEnd && user.subscriptionTier === 'free') {
        await db.update(users).set({ subscriptionStatus: 'inactive' }).where(eq(users.id, user.id));
        user.subscriptionStatus = 'inactive';
      }
    }

    await issueToken(res, user.id, user.email);
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        emailVerified: (user as any).emailVerified ?? false,
        twoFactorEnabled: (user as any).twoFactorEnabled ?? false,
        subscriptionTier: user.subscriptionTier || 'free',
        subscriptionStatus: user.subscriptionStatus || 'inactive',
        isAdmin: isAdmin(user.email),
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
      const googleInsert: Record<string, any> = { name, email, googleId, avatarUrl, emailVerified: true };
      if (trialDays > 0) googleInsert.subscriptionStatus = 'trialing';
      [user] = await db.insert(users).values(googleInsert as any).returning();
      await db.insert(userSettings).values({ userId: user.id, language: defaultLanguage }).onConflictDoNothing();
    } else {
      const updates: Record<string, any> = {};
      if (!user.googleId) updates.googleId = googleId;
      if (avatarUrl && user.avatarUrl !== avatarUrl) updates.avatarUrl = avatarUrl;
      if (!(user as any).emailVerified) updates.emailVerified = true;
      if (Object.keys(updates).length) await db.update(users).set(updates).where(eq(users.id, user.id));
    }

    await issueToken(res, user.id, user.email);
    res.json({
      user: {
        id: user.id,
        name: user.name || name,
        email: user.email,
        avatarUrl: avatarUrl || user.avatarUrl,
        emailVerified: true,
        twoFactorEnabled: (user as any).twoFactorEnabled ?? false,
        subscriptionTier: user.subscriptionTier || 'free',
        subscriptionStatus: user.subscriptionStatus || 'inactive',
        isAdmin: isAdmin(user.email),
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

    try {
      const frontend = process.env.FRONTEND_URL || process.env.BACKEND_URL || 'http://localhost:5173';
      const link = `${frontend.replace(/\/$/, '')}/reset-password?token=${token}`;
      await sendEmail({ to: email, subject: 'Reset your password — MyPlanner', html: resetEmailHtml(user.name || email, link), text: `Hi ${user.name || email}, reset your password: ${link}` });
    } catch (e) { console.error('reset email failed', e); }

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

router.get('/me', async (req: Request, res: Response) => {
  try {
    const token = (req as any).cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.json({ user: null });
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return res.json({ user: null });
    let payload: any;
    try { payload = jwt.verify(token, jwtSecret) as any; } catch { return res.json({ user: null }); }
    const userId = payload.userId;
    if (!userId) return res.json({ user: null });
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      res.clearCookie('token');
      return res.json({ user: null });
    }
    
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        emailVerified: (user as any).emailVerified ?? false,
        twoFactorEnabled: (user as any).twoFactorEnabled ?? false,
        subscriptionTier: user.subscriptionTier || 'free',
        subscriptionStatus: user.subscriptionStatus || 'inactive',
        isAdmin: isAdmin(user.email),
      },
    });
  } catch (e) {
    console.error('Error in /api/auth/me:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const token = sanitize(req.body.token || req.query.token as string || '');
    if (!token) return res.status(400).json({ error: 'Token required' });
    const [pending] = await db.select().from(pendingSignups).where(eq(pendingSignups.token, token)).limit(1);
    if (pending) {
      if (new Date(pending.expiresAt) < new Date()) return res.status(400).json({ error: 'Invalid or expired token' });
      const existing = await db.select().from(users).where(eq(users.email, pending.email)).limit(1);
      if (existing.length > 0) {
        await db.delete(pendingSignups).where(eq(pendingSignups.token, token));
        return res.json({ message: 'Email already verified. Please log in.' });
      }
      const trialDays = await getSettingNumber('trial_days', 0);
      const defaultLanguage = languageNameFromCode(await getSetting('default_language', 'en'));
      const insertValues: Record<string, any> = { name: pending.name, email: pending.email, passwordHash: pending.passwordHash, emailVerified: true };
      if (trialDays > 0) insertValues.subscriptionStatus = 'trialing';
      const [user] = await db.insert(users).values(insertValues as any).returning();
      await db.insert(userSettings).values({ userId: user.id, language: defaultLanguage }).onConflictDoNothing();
      await db.delete(pendingSignups).where(eq(pendingSignups.token, token));
      return res.json({ message: 'Email verified successfully. You can now log in.' });
    }
    const [record] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.token, token)).limit(1);
    if (!record || record.used || new Date(record.expiresAt) < new Date()) return res.status(400).json({ error: 'Invalid or expired token' });
    await db.update(users).set({ emailVerified: true } as any).where(eq(users.id, record.userId));
    await db.update(emailVerificationTokens).set({ used: true }).where(eq(emailVerificationTokens.id, record.id));
    res.json({ message: 'Email verified successfully' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.get('/verify-email', async (req: Request, res: Response) => {
  const token = sanitize((req.query.token as string) || '');
  if (!token) return res.status(400).send('Missing token');
  const [pending] = await db.select().from(pendingSignups).where(eq(pendingSignups.token, token)).limit(1);
  if (pending) {
    if (new Date(pending.expiresAt) < new Date()) return res.status(400).send('Invalid or expired token');
    const existing = await db.select().from(users).where(eq(users.email, pending.email)).limit(1);
    if (existing.length > 0) {
      await db.delete(pendingSignups).where(eq(pendingSignups.token, token));
      const frontend2 = process.env.FRONTEND_URL || '/';
      return res.redirect(`${frontend2.replace(/\/$/, '')}/verify-email?success=1`);
    }
    const trialDays = await getSettingNumber('trial_days', 0);
    const defaultLanguage = languageNameFromCode(await getSetting('default_language', 'en'));
    const insertValues: Record<string, any> = { name: pending.name, email: pending.email, passwordHash: pending.passwordHash, emailVerified: true };
    if (trialDays > 0) insertValues.subscriptionStatus = 'trialing';
    const [user] = await db.insert(users).values(insertValues as any).returning();
    await db.insert(userSettings).values({ userId: user.id, language: defaultLanguage }).onConflictDoNothing();
    await db.delete(pendingSignups).where(eq(pendingSignups.token, token));
    const frontend = process.env.FRONTEND_URL || '/';
    return res.redirect(`${frontend.replace(/\/$/, '')}/verify-email?success=1`);
  }
  const [record] = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.token, token)).limit(1);
  if (!record || record.used || new Date(record.expiresAt) < new Date()) return res.status(400).send('Invalid or expired token');
  await db.update(users).set({ emailVerified: true } as any).where(eq(users.id, record.userId));
  await db.update(emailVerificationTokens).set({ used: true }).where(eq(emailVerificationTokens.id, record.id));
  const frontend = process.env.FRONTEND_URL || '/';
  return res.redirect(`${frontend.replace(/\/$/, '')}/verify-email?success=1`);
});

router.post('/resend-verification', async (req: Request, res: Response) => {
  try {
    const email = sanitize(req.body.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email required' });
    const [pending] = await db.select().from(pendingSignups).where(eq(pendingSignups.email, email)).limit(1);
    if (pending) {
      if (new Date(pending.expiresAt) > new Date()) {
        const frontend = process.env.FRONTEND_URL || process.env.BACKEND_URL || 'http://localhost:5173';
        const link = `${frontend.replace(/\/$/, '')}/verify-email?token=${pending.token}`;
        await sendEmail({ to: email, subject: 'Verify your email — MyPlanner', html: verificationEmailHtml(pending.name, link), text: `Verify: ${link}` });
        return res.json({ message: 'Verification email resent. Please check your inbox.' });
      } else {
        await db.delete(pendingSignups).where(eq(pendingSignups.email, email));
      }
    }
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) return res.json({ message: 'If that email exists, a verification link has been sent.' });
    if ((user as any).emailVerified) return res.json({ message: 'Email already verified' });
    const vToken = crypto.randomBytes(32).toString('hex');
    const vExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db.insert(emailVerificationTokens).values({ userId: user.id, token: vToken, expiresAt: vExpiresAt });
    const frontend = process.env.FRONTEND_URL || process.env.BACKEND_URL || 'http://localhost:5173';
    const link = `${frontend.replace(/\/$/, '')}/verify-email?token=${vToken}`;
    await sendEmail({ to: email, subject: 'Verify your email — MyPlanner', html: verificationEmailHtml(user.name, link), text: `Verify: ${link}` });
    res.json({ message: 'If that email exists, a verification link has been sent.' });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.post('/two-factor/verify', async (req: Request, res: Response) => {
  try {
    const email = sanitize(req.body.email || '').toLowerCase();
    const code = sanitize(req.body.code || '');
    if (!email || !code) return res.status(400).json({ error: 'Email and code required' });
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) return res.status(400).json({ error: 'Invalid code' });
    const [record] = await db.select().from(twoFactorTokens).where(eq(twoFactorTokens.userId, user.id)).limit(1);
    const valid = record && !record.used && record.code === code && new Date(record.expiresAt) > new Date();
    if (!valid) {
      const [latest] = await db.select().from(twoFactorTokens).where(eq(twoFactorTokens.userId, user.id)).limit(1);
      if (latest && latest.code === code) {
        if (latest.used) return res.status(400).json({ error: 'Code already used' });
        if (new Date(latest.expiresAt) < new Date()) return res.status(400).json({ error: 'Code expired' });
      }
      return res.status(400).json({ error: 'Invalid code' });
    }
    await db.update(twoFactorTokens).set({ used: true }).where(eq(twoFactorTokens.id, record.id));
    await issueToken(res, user.id, user.email);
    res.json({ user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl, emailVerified: (user as any).emailVerified ?? true, subscriptionTier: user.subscriptionTier || 'free', subscriptionStatus: user.subscriptionStatus || 'inactive', isAdmin: isAdmin(user.email) } });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.post('/two-factor/enable', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const enabled = Boolean(req.body.enabled);
    await db.update(users).set({ twoFactorEnabled: enabled } as any).where(eq(users.id, req.userId!));
    if (enabled) {
      const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await db.insert(twoFactorTokens).values({ userId: req.userId!, code, expiresAt });
      try { const { twoFactorEmailHtml: html2 } = await import('../lib/email.js'); await sendEmail({ to: user.email, subject: '2FA enabled — MyPlanner', html: html2(user.name, code), text: `Your 2FA test code is ${code}` }); } catch {}
      console.log(`[2FA enable] code for ${user.email}: ${code}`);
    }
    res.json({ enabled });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
});

router.post('/logout', (_req, res: Response) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

router.delete('/account', requireAuth, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  try {
    await pool.query('BEGIN');
    const tables = [
      'email_verification_tokens', 'password_reset_tokens', 'sessions', 'user_settings',
      'board_snapshots', 'note_snapshots', 'goal_snapshots', 'habit_snapshots',
      'task_tag_assignments', 'note_tag_assignments', 'goal_tag_assignments', 'habit_tag_assignments',
      'tags', 'notes', 'goals', 'habits', 'documents', 'deep_focus_sessions',
      'support_tickets', 'ticket_messages', 'pending_user_changes', 'user_notifications',
      'activity_logs', 'energy_logs', 'ai_requests', 'google_calendar_tokens',
      'dashboard_widget_usage', 'project_members', 'workspace_members', 'organization_members',
      'group_members', 'task_templates', 'note_templates', 'goal_templates', 'habit_templates',
      'project_chat_messages', 'chat_messages', 'milestones', 'board_snapshots'
    ];
    for (const tbl of tables) {
      try { await pool.query(`DELETE FROM ${tbl} WHERE user_id = $1`, [userId]); } catch {}
      try { await pool.query(`DELETE FROM ${tbl} WHERE owner_id = $1`, [userId]); } catch {}
      try { await pool.query(`DELETE FROM ${tbl} WHERE sender_id = $1`, [userId]); } catch {}
      try { await pool.query(`DELETE FROM ${tbl} WHERE assigned_to_user_id = $1`, [userId]); } catch {}
      try { await pool.query(`DELETE FROM ${tbl} WHERE created_by_user_id = $1`, [userId]); } catch {}
    }
    try { await pool.query('DELETE FROM projects WHERE owner_id = $1', [userId]); } catch {}
    try { await pool.query('DELETE FROM workspaces WHERE owner_id = $1', [userId]); } catch {}
    try { await pool.query('DELETE FROM organizations WHERE owner_id = $1', [userId]); } catch {}
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('COMMIT');
    res.clearCookie('token');
    res.json({ message: 'Account deleted' });
  } catch (e) {
    try { await pool.query('ROLLBACK'); } catch {}
    console.error('delete account failed', e);
    try {
      await db.delete(users).where(eq(users.id, userId));
      res.clearCookie('token');
      return res.json({ message: 'Account deleted' });
    } catch (e2) {
      console.error(e2);
      res.status(500).json({ error: 'Failed to delete account. Please contact support.' });
    }
  }
});

export default router;