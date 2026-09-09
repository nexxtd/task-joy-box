import { Router } from 'express';
import { sendWeeklyEmails } from '../lib/weeklyEmail.js';
import { isAdmin } from '../lib/adminUtils.js';
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

export default router;
