import { Router } from 'express';
import { sendWeeklyEmails, generateWeeklySummaryForUser } from '../lib/weeklyEmail.js';
import { isAdmin } from '../lib/adminUtils.js';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { sendEmail } from '../lib/email.js';
import { db } from '../db.js';
import { users } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

const router = Router();

router.post('/weekly-ai-summary', async (req: any, res) => {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = req.headers['x-cron-secret'] as string | undefined;
  const userId = req.userId as number | undefined;

  let authorized = false;
  if (cronSecret && headerSecret === cronSecret) authorized = true;
  if (!authorized && userId) {
    const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (u && isAdmin(u.email)) authorized = true;
  }
  if (!authorized) return res.status(401).json({ error: 'Unauthorized cron' });

  try {
    const result = await sendWeeklyEmails();
    res.json({ ok: true, ...result });
  } catch (e: any) {
    console.error('weekly cron failed', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

router.get('/weekly-ai-summary/test', async (req: any, res) => {
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = req.headers['x-cron-secret'] as string | undefined;
  if (!cronSecret || headerSecret !== cronSecret) {
    const userId = req.userId as number | undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized cron' });
    const [u0] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u0 || !isAdmin(u0.email)) return res.status(401).json({ error: 'Unauthorized cron' });
  }
  const email = (req.query.email as string) || '';
  if (!email) return res.status(400).json({ error: 'email query required' });
  const { generateWeeklySummaryForUser } = await import('../lib/weeklyEmail.js');
  const { users: usersTable } = await import('../../shared/schema.js');
  const { eq: eq2 } = await import('drizzle-orm');
  const [u] = await db.select().from(usersTable).where(eq2(usersTable.email, email.toLowerCase())).limit(1);
  if (!u) return res.status(404).json({ error: 'User not found' });
  const content = await generateWeeklySummaryForUser(u.id);
  if (!content) return res.status(500).json({ error: 'Failed to generate' });
  const { sendEmail } = await import('../lib/email.js');
  const ok = await sendEmail({ to: email, subject: content.subject, html: content.html, text: content.text });
  res.json({ ok, subject: content.subject });
});

// Admin-only: send the weekly AI summary to yourself instantly,
// without waiting for the weekly cron run.
router.post('/weekly-ai-summary/send-now', requireAuth, async (req: AuthRequest, res) => {
  const [u] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
  if (!u || !isAdmin(u.email)) return res.status(403).json({ error: 'Admin only' });
  try {
    const content = await generateWeeklySummaryForUser(u.id);
    if (!content) return res.status(500).json({ error: 'Failed to generate summary' });
    const ok = await sendEmail({ to: u.email, subject: content.subject, html: content.html, text: content.text });
    if (!ok) return res.status(500).json({ error: 'Failed to send email' });
    res.json({ ok: true, subject: content.subject });
  } catch (e: any) {
    console.error('send-now summary failed', e);
    res.status(500).json({ error: e.message || String(e) });
  }
});

export default router;
