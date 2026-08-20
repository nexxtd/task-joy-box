import { Router, Response } from 'express';
import { google } from 'googleapis';
import crypto from 'crypto';
import { db } from '../db.js';
import { googleCalendarTokens } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { encrypt, decrypt } from '../lib/encryption.js';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const OAUTH_STATE_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || '';

function getRedirectUri(req: AuthRequest): string {
  const host = req.get('host') || process.env.HOST || 'localhost:3001';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${host}/api/calendar/callback`;
}

function createOAuth2Client(redirectUri: string) {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
}

function signState(data: object): string {
  const payload = JSON.stringify(data);
  const signature = crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload: data, signature })).toString('base64url');
}

function verifyState(signedState: string): any {
  try {
    const { payload, signature } = JSON.parse(Buffer.from(signedState, 'base64url').toString());
    const expected = crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(JSON.stringify(payload)).digest('hex');
    if (signature !== expected) return null;
    return payload;
  } catch {
    return null;
  }
}

router.get('/auth', requireAuth, (req: AuthRequest, res: Response) => {
  if (!GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Google Calendar not configured. GOOGLE_CLIENT_SECRET missing.' });
  }

  const redirectUri = getRedirectUri(req);
  const oauth2Client = createOAuth2Client(redirectUri);

  const state = signState({
    userId: req.userId,
    redirectUri,
    ts: Date.now(),
  });

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent',
  });

  res.json({ authUrl });
});

router.get('/callback', async (req: AuthRequest, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5000'}/settings?calendarError=${encodeURIComponent(error)}`);
  }

  try {
    const stateData = verifyState(state as string);
    if (!stateData) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5000'}/settings?calendarError=invalid_state`);
    }
    const { userId, redirectUri } = stateData;

    if (!userId || Date.now() - stateData.ts > 10 * 60 * 1000) {
      return res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5000'}/settings?calendarError=expired`);
    }

    const oauth2Client = createOAuth2Client(redirectUri);
    const { tokens } = await oauth2Client.getToken(code);

    await db.delete(googleCalendarTokens).where(eq(googleCalendarTokens.userId, userId));
    await db.insert(googleCalendarTokens).values({
      userId,
      accessToken: encrypt(tokens.access_token!) ?? tokens.access_token!,
      refreshToken: tokens.refresh_token ? (encrypt(tokens.refresh_token) ?? tokens.refresh_token) : null,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    });

    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5000'}/settings?calendarConnected=true`);
  } catch (e) {
    console.error('Calendar callback error:', e);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5000'}/settings?calendarError=auth_failed`);
  }
});

router.get('/status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [token] = await db.select().from(googleCalendarTokens).where(eq(googleCalendarTokens.userId, req.userId!)).limit(1);
    res.json({ connected: !!token, configured: !!GOOGLE_CLIENT_SECRET });
  } catch {
    res.json({ connected: false, configured: !!GOOGLE_CLIENT_SECRET });
  }
});

// New route to fetch Google Calendar events
router.get('/events', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [tokenRow] = await db.select().from(googleCalendarTokens).where(eq(googleCalendarTokens.userId, req.userId!)).limit(1);
    if (!tokenRow) return res.status(400).json({ error: 'Google Calendar not connected' });

    const redirectUri = getRedirectUri(req);
    const oauth2Client = createOAuth2Client(redirectUri);
    oauth2Client.setCredentials({
      access_token: tokenRow.accessToken,
      refresh_token: tokenRow.refreshToken || undefined,
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await db.update(googleCalendarTokens).set({
          accessToken: tokens.access_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        }).where(eq(googleCalendarTokens.userId, req.userId!));
      }
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Get events from the last 30 days to the next 90 days
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 30);
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 90);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];

    // Format events to match our task structure
    const formattedEvents = events.map(event => {
      const startDate = event.start?.date || event.start?.dateTime?.split('T')[0];
      const endDate = event.end?.date || event.end?.dateTime?.split('T')[0];
      
      return {
        id: event.id,
        title: event.summary || 'Untitled Event',
        description: event.description || '',
        startDate,
        endDate,
        startTime: event.start?.dateTime ? new Date(event.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
        endTime: event.end?.dateTime ? new Date(event.end.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
        allDay: !!event.start?.date, // If it has a date but no time, it's an all-day event
      };
    });

    res.json({ events: formattedEvents });
  } catch (e) {
    console.error('Fetch events error:', e);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// Route to sync app tasks TO Google Calendar
router.post('/sync-to-google', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [tokenRow] = await db.select().from(googleCalendarTokens).where(eq(googleCalendarTokens.userId, req.userId!)).limit(1);
    if (!tokenRow) return res.status(400).json({ error: 'Google Calendar not connected' });

    const redirectUri = getRedirectUri(req);
    const oauth2Client = createOAuth2Client(redirectUri);
    oauth2Client.setCredentials({
      access_token: tokenRow.accessToken,
      refresh_token: tokenRow.refreshToken || undefined,
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await db.update(googleCalendarTokens).set({
          accessToken: tokens.access_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        }).where(eq(googleCalendarTokens.userId, req.userId!));
      }
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const { tasks } = req.body as { tasks: Array<{ title: string; dueDate?: string; description?: string }> };

    if (!tasks?.length) return res.json({ synced: 0 });

    const tasksWithDates = tasks.filter(t => t.dueDate);
    let synced = 0;

    for (const task of tasksWithDates) {
      try {
        const date = task.dueDate!;
        await calendar.events.insert({
          calendarId: 'primary',
          requestBody: {
            summary: task.title,
            description: task.description || '',
            start: { date },
            end: { date },
            source: { title: 'TaskJoyBox', url: process.env.FRONTEND_URL || 'https://task-joy-box.onrender.com' },
          },
        });
        synced++;
      } catch (e) {
        console.error('Failed to sync task:', task.title, e);
      }
    }

    res.json({ synced, total: tasksWithDates.length });
  } catch (e) {
    console.error('Sync to Google error:', e);
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Route to sync FROM Google Calendar to the app
router.post('/sync-from-google', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [tokenRow] = await db.select().from(googleCalendarTokens).where(eq(googleCalendarTokens.userId, req.userId!)).limit(1);
    if (!tokenRow) return res.status(400).json({ error: 'Google Calendar not connected' });

    const redirectUri = getRedirectUri(req);
    const oauth2Client = createOAuth2Client(redirectUri);
    oauth2Client.setCredentials({
      access_token: decrypt(tokenRow.accessToken) ?? tokenRow.accessToken,
      refresh_token: tokenRow.refreshToken ? (decrypt(tokenRow.refreshToken) ?? tokenRow.refreshToken) : undefined,
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await db.update(googleCalendarTokens).set({
          accessToken: encrypt(tokens.access_token) ?? tokens.access_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        }).where(eq(googleCalendarTokens.userId, req.userId!));
      }
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Get events from the past year to the next year to sync all upcoming events
    const timeMin = new Date();
    timeMin.setFullYear(timeMin.getFullYear() - 1);
    const timeMax = new Date();
    timeMax.setFullYear(timeMax.getFullYear() + 1);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    
    // Return the events so the frontend can handle them
    const formattedEvents = events.map(event => {
      const startDate = event.start?.date || event.start?.dateTime?.split('T')[0];
      const endDate = event.end?.date || event.end?.dateTime?.split('T')[0];
      
      return {
        id: event.id,
        title: event.summary || 'Untitled Event',
        description: event.description || '',
        startDate,
        endDate,
        startTime: event.start?.dateTime ? new Date(event.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
        endTime: event.end?.dateTime ? new Date(event.end.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
        allDay: !!event.start?.date,
      };
    });

    res.json({ events: formattedEvents, count: formattedEvents.length });
  } catch (e) {
    console.error('Sync from Google error:', e);
    res.status(500).json({ error: 'Failed to sync from Google' });
  }
});

router.delete('/disconnect', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db.delete(googleCalendarTokens).where(eq(googleCalendarTokens.userId, req.userId!));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// Shared helper so the AI chat endpoint can see the user's Google Calendar too.
export async function getCalendarEventsForAI(userId: number): Promise<{
  connected: boolean;
  events: Array<{
    title: string;
    startDate: string | null;
    endDate: string | null;
    startTime: string | null;
    endTime: string | null;
    allDay: boolean;
  }>;
}> {
  try {
    const [tokenRow] = await db.select().from(googleCalendarTokens).where(eq(googleCalendarTokens.userId, userId)).limit(1);
    if (!tokenRow) return { connected: false, events: [] };

    const oauth2Client = createOAuth2Client('http://localhost');
    oauth2Client.setCredentials({
      access_token: decrypt(tokenRow.accessToken) ?? tokenRow.accessToken,
      refresh_token: tokenRow.refreshToken ? (decrypt(tokenRow.refreshToken) ?? tokenRow.refreshToken) : undefined,
    });

    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await db.update(googleCalendarTokens).set({
          accessToken: encrypt(tokens.access_token) ?? tokens.access_token,
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        }).where(eq(googleCalendarTokens.userId, userId));
      }
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 1);
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 14);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = response.data.items || [];
    const formatted = events.map(event => {
      const startDate = event.start?.date || event.start?.dateTime?.split('T')[0] || null;
      const endDate = event.end?.date || event.end?.dateTime?.split('T')[0] || null;
      return {
        title: event.summary || 'Untitled Event',
        startDate,
        endDate,
        startTime: event.start?.dateTime ? new Date(event.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
        endTime: event.end?.dateTime ? new Date(event.end.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
        allDay: !!event.start?.date,
      };
    });

    return { connected: true, events: formatted };
  } catch (e) {
    console.error('AI calendar events fetch failed:', e);
    return { connected: false, events: [] };
  }
}

export default router;
