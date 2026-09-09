import { db } from '../db.js';
import { users, userSettings, boardSnapshots, noteSnapshots } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import { sendEmail } from './email.js';

function formatDate(d: Date) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

export async function generateWeeklySummaryForUser(userId: number): Promise<{ subject: string; html: string; text: string } | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const [boardRow] = await db.select().from(boardSnapshots).where(eq(boardSnapshots.userId, userId)).limit(1);
  const [noteRow] = await db.select().from(noteSnapshots).where(eq(noteSnapshots.userId, userId)).limit(1);

  let tasks: any[] = [];
  let notes: any[] = [];
  try { if (boardRow?.snapshot) tasks = JSON.parse(boardRow.snapshot).tasks || []; } catch {}
  try { if (noteRow?.snapshot) notes = JSON.parse(noteRow.snapshot).tasks || []; } catch {}

  const total = tasks.length;
  const completed = tasks.filter((t: any) => t.completed || t.status === 'completed').length;
  const active = total - completed;
  const overdue = tasks.filter((t: any) => t.dueDate && !t.completed && new Date(`${t.dueDate}T${t.dueTime || '23:59:59'}`) < new Date()).length;
  const rate = total ? Math.round((completed / total) * 100) : 0;

  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const completedThisWeek = tasks.filter((t: any) => {
    const src = t.completedAt || t.updatedAt;
    if (!src) return false;
    const d = new Date(src);
    return d >= weekStart;
  }).length;

  const projects = new Set(tasks.filter((t: any) => t.projectId != null).map((t: any) => t.projectId)).size;

  let aiSummary = '';
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey && tasks.length > 0) {
    try {
      const prompt = `You are a productivity coach. Write a 3-4 sentence weekly summary for ${user.name}. Stats: ${total} total tasks, ${completed} completed (${rate}%), ${active} active, ${overdue} overdue, ${completedThisWeek} completed this week, ${notes.length} notes, ${projects} projects. Be encouraging, mention what went well and one actionable tip for next week. Keep it concise and friendly.`;
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openRouterKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: process.env.AI_MODEL || 'openrouter/auto', messages: [{ role: 'user', content: prompt }], max_tokens: 300 }),
      });
      if (r.ok) {
        const j: any = await r.json();
        aiSummary = j.choices?.[0]?.message?.content?.trim() || '';
      }
    } catch {}
  }
  if (!aiSummary) {
    if (total === 0) aiSummary = `You haven't created any tasks yet — start by adding your first task and project to build momentum next week.`;
    else if (rate >= 70) aiSummary = `Strong week — you completed ${completedThisWeek} tasks in the last 7 days and sit at ${rate}% overall. Keep the daily close rate up and tackle the ${overdue} overdue item${overdue !== 1 ? 's' : ''} early next week.`;
    else if (overdue > 0) aiSummary = `You have ${active} active tasks with ${overdue} overdue dragging your ${rate}% completion. Focus on clearing one overdue today to lift the rate above ${Math.min(100, rate + 5)}% next week.`;
    else aiSummary = `Steady progress — ${completedThisWeek} completed this week out of ${total} total. Try to beat that by 1-2 next week by scheduling your most important tasks first.`;
  }

  const subject = `Your weekly summary — ${formatDate(new Date())} · ${rate}% completed`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
<h2 style="margin:0 0 8px">Weekly summary for ${user.name}</h2>
<p style="color:#666;font-size:13px;margin:0 0 16px">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
<div style="display:flex;gap:12px;margin:16px 0">
<div style="flex:1;background:#f5f5f5;border-radius:12px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:800">${total}</div><div style="font-size:11px;color:#666">TOTAL</div></div>
<div style="flex:1;background:#ecfdf5;border-radius:12px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:800;color:#059669">${completed}</div><div style="font-size:11px;color:#666">DONE</div></div>
<div style="flex:1;background:#fff7ed;border-radius:12px;padding:12px;text-align:center"><div style="font-size:22px;font-weight:800;color:#d97706">${overdue}</div><div style="font-size:11px;color:#666">OVERDUE</div></div>
</div>
<p style="background:#f0f0ff;border:1px solid #e0e0ff;border-radius:12px;padding:12px;font-size:14px;line-height:1.5">${aiSummary}</p>
<p style="font-size:12px;color:#666;margin-top:16px">Projects: ${projects} · Notes: ${notes.length} · Active: ${active} · Completed this week: ${completedThisWeek}</p>
<p style="margin-top:16px"><a href="${(process.env.FRONTEND_URL || 'https://task-joy-box.onrender.com').replace(/\/$/, '')}/insights" style="display:inline-block;background:#000;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:13px">Open Insights</a></p>
<p style="font-size:11px;color:#999;margin-top:16px">You receive this because Email Notifications is enabled in Settings. Turn it off in Settings → Notifications.</p>
</div>`;
  const text = `Weekly summary for ${user.name}\n${aiSummary}\nTotal: ${total}, Done: ${completed} (${rate}%), Overdue: ${overdue}, This week: ${completedThisWeek}`;
  return { subject, html, text };
}

export async function sendWeeklyEmails(): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const allSettings = await db.select().from(userSettings).where(eq(userSettings.emailNotifs, true));
  let sent = 0, skipped = 0;
  const errors: string[] = [];
  for (const s of allSettings) {
    const [u] = await db.select().from(users).where(eq(users.id, s.userId)).limit(1);
    if (!u) { skipped++; continue; }
    const tier = (u.subscriptionTier || 'free').toLowerCase();
    const isPaid = tier === 'premium' || tier === 'pro';
    if (!isPaid) { skipped++; continue; }
    try {
      const content = await generateWeeklySummaryForUser(u.id);
      if (!content) { skipped++; continue; }
      const ok = await sendEmail({ to: u.email, subject: content.subject, html: content.html, text: content.text });
      if (ok) sent++; else errors.push(`Failed to send to ${u.email}`);
    } catch (e: any) {
      errors.push(`${u.email}: ${e.message || String(e)}`);
    }
  }
  return { sent, skipped, errors };
}
