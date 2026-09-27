import { db } from '../db.js';
import { users, userSettings, boardSnapshots, noteSnapshots } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';
import { sendEmail } from './email.js';

function formatDate(d: Date) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function formatLong(d: Date) { return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); }

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function shortTitle(t: unknown, n = 60): string {
  const s = String((t as any)?.title ?? t ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function safeDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function dayKey(d: Date): number {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dueEnd(t: any): Date | null {
  if (!t?.dueDate) return null;
  const d = new Date(`${t.dueDate}T${t.dueTime || '23:59:59'}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function completedStamp(t: any): Date | null {
  return safeDate(t?.completedAt) || safeDate(t?.updatedAt);
}

// ---------------------------------------------------------------------------
// Strip chain-of-thought / meta preamble the model sometimes emits, e.g.
// "Okay, the user wants me to act as a productivity coach and create a
// weekly summary for dads based on specific stats ..." — none of that inner
// reasoning should ever reach the email body.
// ---------------------------------------------------------------------------
function sanitizeAiSummary(raw: unknown): string {
  let s = String(raw ?? '').trim();
  if (!s) return '';
  // Remove code fences and surrounding quotes.
  s = s.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, '').trim();
  s = s.replace(/^["'“”]+|["'“”]+$/g, '').trim();
  // Remove markdown emphasis / headers / bullets.
  s = s.replace(/^[#>*\-\d.)\s]+/gm, '').replace(/[*_`#]/g, '').trim();
  s = s.replace(/\s+/g, ' ').trim();

  const preambleRe = /user wants|as an? .*?(coach|assistant)|based on .*stats?|specific stats|act as|for dads?|here'?s your (weekly )?summary/i;
  const fillerStartRe = /^(okay|ok|so|alright|sure|here|well|great)\b/i;

  // Split into sentences and drop leading meta sentences.
  const parts = s.split(/(?<=[.!?])\s+/);
  let i = 0;
  while (i < parts.length && (preambleRe.test(parts[i]) || (fillerStartRe.test(parts[i]) && /user|coach|stats?|summar/i.test(parts[i])))) {
    i++;
  }
  let kept = parts.slice(i);
  // Drop any remaining sentence that is pure meta-talk or invents an audience.
  kept = kept.filter(p => !preambleRe.test(p) && !/\bdads?\b/i.test(p));
  s = kept.join(' ').replace(/\s+/g, ' ').trim();

  if (s.length < 40) return '';
  return s.slice(0, 600);
}

interface OverdueInfo { id: string; title: string; daysOverdue: number; priority: string; dueDate: string }
interface ProjectStat { id: string; name: string; total: number; done: number; pct: number; status: string }

export async function generateWeeklySummaryForUser(userId: number): Promise<{ subject: string; html: string; text: string } | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const [boardRow] = await db.select().from(boardSnapshots).where(eq(boardSnapshots.userId, userId)).limit(1);
  const [noteRow] = await db.select().from(noteSnapshots).where(eq(noteSnapshots.userId, userId)).limit(1);

  let tasks: any[] = [];
  let columns: any[] = [];
  let notes: any[] = [];
  try {
    const snap = JSON.parse(boardRow?.snapshot || '{}');
    if (Array.isArray(snap)) tasks = snap;
    else {
      tasks = Array.isArray(snap.tasks) ? snap.tasks : [];
      columns = Array.isArray(snap.columns) ? snap.columns : [];
    }
  } catch {}
  try {
    const snap = JSON.parse(noteRow?.snapshot || '{}');
    if (Array.isArray(snap)) notes = snap;
    else if (Array.isArray(snap.tasks)) notes = snap.tasks;
    else if (Array.isArray(snap.notes)) notes = snap.notes;
    else if (Array.isArray(snap.board?.tasks)) notes = snap.board.tasks;
  } catch {}

  const doneColIds = new Set(
    columns.filter((c: any) => /done|completed|finish/i.test(String(c?.title || ''))).map((c: any) => String(c?.id))
  );
  const isDone = (t: any) =>
    t?.completed === true ||
    /^(completed|done)$/i.test(String(t?.status || '')) ||
    (t?.columnId != null && doneColIds.has(String(t.columnId)));

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);

  const total = tasks.length;
  const doneTasks = tasks.filter(isDone);
  const completed = doneTasks.length;
  const active = tasks.filter(t => !isDone(t));
  const rate = total ? Math.round((completed / total) * 100) : 0;

  const overdue: OverdueInfo[] = active
    .map(t => ({ t, due: dueEnd(t) }))
    .filter((x): x is { t: any; due: Date } => x.due !== null && x.due.getTime() < now.getTime())
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .map(({ t, due }) => ({
      id: String(t.id ?? ''),
      title: String(t.title || 'Untitled task'),
      daysOverdue: Math.max(1, Math.floor((now.getTime() - due.getTime()) / DAY_MS)),
      priority: String(t.priority || 'none'),
      dueDate: String(t.dueDate || ''),
    }));

  const createdThisWeek = tasks.filter(t => {
    const d = safeDate(t?.createdAt);
    return d !== null && d >= weekAgo;
  }).length;
  const completedThisWeek = doneTasks.filter(t => {
    const d = completedStamp(t);
    return d !== null && d >= weekAgo;
  }).length;

  // Daily completions over the last 7 days (rolling).
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const last7: Array<{ label: string; dateLabel: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    last7.push({
      label: dayNames[d.getDay()],
      dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count: 0,
    });
  }
  for (const t of doneTasks) {
    const d = completedStamp(t);
    if (!d) continue;
    const base = dayKey(now);
    const target = dayKey(d);
    const diff = Math.round((base - target) / DAY_MS);
    if (diff >= 0 && diff <= 6) last7[6 - diff].count += 1;
  }
  const bestDay = last7.reduce((b, d) => (d.count > b.count ? d : b), last7[0]);

  // Open tasks by priority.
  const prioOrder = ['urgent', 'high', 'medium', 'low', 'none'];
  const prioGroups = prioOrder
    .map(p => {
      const list = active.filter(t => String(t.priority || 'none') === p);
      return {
        priority: p,
        label: p === 'none' ? 'Unprioritized' : p[0].toUpperCase() + p.slice(1),
        count: list.length,
        minutes: list.reduce((s, t) => s + Math.max(0, Number(t.duration) || 0), 0),
        top: list
          .sort((a, b) => {
            const da = dueEnd(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
            const db = dueEnd(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
            return da - db;
          })
          .slice(0, 2)
          .map(t => String(t.title || 'Untitled task')),
      };
    })
    .filter(g => g.count > 0);
  const urgentHighOpen = active.filter(t => t.priority === 'urgent' || t.priority === 'high').length;

  // Projects.
  const projMap = new Map<string, ProjectStat & { overdue: number }>();
  for (const t of tasks) {
    if (t?.projectId == null) continue;
    const pid = String(t.projectId);
    const cur = projMap.get(pid) || { id: pid, name: String(t.projectName || 'Project'), total: 0, done: 0, pct: 0, status: 'At risk', overdue: 0 };
    if (t.projectName) cur.name = String(t.projectName);
    cur.total += 1;
    if (isDone(t)) cur.done += 1;
    projMap.set(pid, cur);
  }
  for (const o of overdue) {
    const t = tasks.find(x => String(x.id) === o.id);
    if (t?.projectId != null) {
      const cur = projMap.get(String(t.projectId));
      if (cur) cur.overdue += 1;
    }
  }
  const projects: ProjectStat[] = [...projMap.values()]
    .map(p => {
      const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
      let status = 'At risk';
      if (pct >= 80 && p.overdue === 0) status = 'Strong';
      else if (pct >= 50) status = 'On track';
      else if (pct >= 20 || p.overdue === 1) status = 'Lagging';
      return { id: p.id, name: p.name, total: p.total, done: p.done, pct, status };
    })
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 6);
  const projectCount = projMap.size;

  // Notes.
  const notesThisWeek = notes.filter(n => {
    const d = safeDate((n as any)?.createdAt) || safeDate((n as any)?.updatedAt);
    return d !== null && d >= weekAgo;
  }).length;

  // Deterministic productivity score (same formula as the Insights board fallback).
  const highOpen = active.filter(t => t.priority === 'urgent' || t.priority === 'high');
  const lowOpen = active.filter(t => t.priority === 'low');
  let score = 50 + Math.min(40, completed * 5) - Math.min(30, overdue.length * 6) - Math.min(20, highOpen.length * 4) - Math.min(15, lowOpen.length * 2);
  score = Math.max(1, Math.min(99, score));
  const scoreRationale =
    `Starting from a neutral base of 50: ${completed} completions at +5 each` +
    (overdue.length > 0 ? `, ${overdue.length} overdue at −6 each` : '') +
    (highOpen.length > 0 ? `, ${highOpen.length} open urgent/high at −4 each` : '') +
    (lowOpen.length > 0 ? `, ${lowOpen.length} open low-priority at −2 each` : '') +
    `. That lands the score at ${score}.`;

  // Bottlenecks: oldest open tasks by creation date (stale work stalls boards).
  const bottlenecks = [...active]
    .map(t => ({ t, age: safeDate(t?.createdAt) ? Math.floor((now.getTime() - safeDate(t.createdAt)!.getTime()) / DAY_MS) : 0 }))
    .sort((a, b) => b.age - a.age)
    .slice(0, 3)
    .map(({ t, age }) => ({
      title: String(t.title || 'Untitled task'),
      detail: age > 0 ? `open for ~${age} day${age === 1 ? '' : 's'}` : 'recently opened',
      step: overdue.length > 0 && String(t.id) === overdue[0].id
        ? 'Re-date it or close it today so it stops dragging the board.'
        : 'Break it into one small subtask and finish just that piece today.',
    }));

  // Next up: most overdue first, then urgent/high by due date (deduplicated).
  const _seen = new Set<string>();
  const nextUp: Array<{ title: string; reason: string }> = [];
  for (const o of overdue.slice(0, 2)) {
    _seen.add(o.id);
    nextUp.push({ title: o.title, reason: `overdue by ${o.daysOverdue} day${o.daysOverdue === 1 ? '' : 's'} — clearing it lifts completion fastest` });
  }
  for (const t of [...highOpen].sort((a, b) => (dueEnd(a)?.getTime() ?? Number.MAX_SAFE_INTEGER) - (dueEnd(b)?.getTime() ?? Number.MAX_SAFE_INTEGER))) {
    if (nextUp.length >= 3) break;
    if (_seen.has(String((t as any).id))) continue;
    nextUp.push({ title: String((t as any).title || 'Untitled task'), reason: `${String((t as any).priority)} priority${(t as any).dueDate ? `, due ${String((t as any).dueDate)}` : ''} — do before medium/low work` });
  }

  // Week-over-week style explanation for created vs completed.
  let weekExplanation: string;
  if (createdThisWeek === 0 && completedThisWeek === 0) {
    weekExplanation = 'No tasks were created or completed in the last 7 days, so there is no weekly momentum to measure yet.';
  } else if (completedThisWeek === 0) {
    weekExplanation = `Activity without finishes: ${createdThisWeek} task${createdThisWeek === 1 ? ' was' : 's were'} added in the last 7 days but none completed — intake is outpacing output.`;
  } else if (completedThisWeek > createdThisWeek) {
    weekExplanation = `${completedThisWeek} completed against ${createdThisWeek} added — you are clearing the backlog faster than it grows.`;
  } else {
    weekExplanation = `${completedThisWeek} completed out of ${createdThisWeek} added in the last 7 days — steady throughput with ${createdThisWeek - completedThisWeek} still open from this intake.`;
  }

  // ---- AI coach note: strictly grounded, preamble stripped ----
  let aiSummary = '';
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (openRouterKey && total > 0) {
    try {
      const statsLine =
        `${total} total tasks, ${completed} completed (${rate}%), ${active.length} active, ${overdue.length} overdue, ` +
        `${completedThisWeek} completed in the last 7 days, ${createdThisWeek} created in the last 7 days, ` +
        `${urgentHighOpen} open urgent/high-priority, ${projectCount} projects, ${notes.length} notes. ` +
        `Top overdue: ${overdue.slice(0, 3).map(o => `"${o.title}" (${o.daysOverdue}d overdue)`).join('; ') || 'none'}.`;
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openRouterKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.AI_MODEL || 'openrouter/auto',
          temperature: 0.3,
          max_tokens: 250,
          messages: [
            {
              role: 'system',
              content: 'You are a concise productivity coach writing an in-app weekly summary. Output ONLY 3-4 plain sentences. Rules: no preamble, no reasoning, no meta-commentary, never describe what the user asked for, never mention stats or data as a topic, no greeting, no bullet points, no markdown, no quotation marks around the text, no invented tasks, numbers, or people.',
            },
            { role: 'user', content: `Write the weekly summary from these real stats: ${statsLine} Mention what went well and one actionable tip for next week. Be encouraging and concise.` },
          ],
        }),
      });
      if (r.ok) {
        const j: any = await r.json();
        aiSummary = sanitizeAiSummary(j.choices?.[0]?.message?.content);
      }
    } catch {}
  }
  if (!aiSummary) {
    if (total === 0) aiSummary = `You haven't created any tasks yet — start by adding your first task and project to build momentum next week.`;
    else if (rate >= 70) aiSummary = `Strong week — you completed ${completedThisWeek} tasks in the last 7 days and sit at ${rate}% overall. Keep the daily close rate up and tackle the ${overdue.length} overdue item${overdue.length !== 1 ? 's' : ''} early next week.`;
    else if (overdue.length > 0) aiSummary = `You have ${active.length} active tasks with ${overdue.length} overdue dragging your ${rate}% completion. Focus on clearing one overdue today to lift the rate above ${Math.min(100, rate + 5)}% next week.`;
    else aiSummary = `Steady progress — ${completedThisWeek} completed this week out of ${total} total. Try to beat that by 1-2 next week by scheduling your most important tasks first.`;
  }

  const escTitle = (t: string) => esc(t);
  const bar = (count: number, max: number) => {
    const pct = max > 0 ? Math.round((count / max) * 100) : 0;
    return `<div style="background:#eee;border-radius:6px;height:8px;margin-top:4px"><div style="width:${pct}%;background:#000;height:8px;border-radius:6px"></div></div>`;
  };
  const maxDay = Math.max(1, ...last7.map(d => d.count));
  const card = (value: string, label: string, color = '#111', bg = '#f5f5f5') =>
    `<div style="flex:1;background:${bg};border-radius:12px;padding:12px;text-align:center;min-width:0"><div style="font-size:22px;font-weight:800;color:${color}">${value}</div><div style="font-size:11px;color:#666">${label}</div></div>`;

  const subject = `Your weekly summary — ${formatDate(now)} · ${rate}% completed`;
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
<h2 style="margin:0 0 8px">Weekly summary for ${esc(user.name)}</h2>
<p style="color:#666;font-size:13px;margin:0 0 16px">${esc(formatLong(now))}</p>
<div style="display:flex;gap:12px;margin:16px 0">
${card(String(total), 'TOTAL')}
${card(`${completed} · ${rate}%`, 'DONE', '#059669', '#ecfdf5')}
${card(String(overdue.length), 'OVERDUE', '#d97706', '#fff7ed')}
${card(String(completedThisWeek), 'THIS WEEK', '#111', '#f0f0ff')}
</div>
<p style="background:#f0f0ff;border:1px solid #e0e0ff;border-radius:12px;padding:12px;font-size:14px;line-height:1.5">${esc(aiSummary)}</p>

<h3 style="margin:20px 0 6px;font-size:14px">Week in numbers</h3>
<p style="font-size:13px;color:#333;margin:0 0 4px">Created (7d): <b>${createdThisWeek}</b> · Completed (7d): <b>${completedThisWeek}</b> · Active now: <b>${active.length}</b></p>
<p style="font-size:12px;color:#666;margin:0">${esc(weekExplanation)}</p>

<h3 style="margin:20px 0 6px;font-size:14px">Daily completions (last 7 days)</h3>
${last7.map(d => `<div style="font-size:12px;color:#333;margin-bottom:6px"><span><b>${esc(d.label)}</b> <span style="color:#999">${esc(d.dateLabel)}</span> — ${d.count} completed</span>${bar(d.count, maxDay)}</div>`).join('')}
<p style="font-size:12px;color:#666;margin:6px 0 0">${bestDay.count > 0 ? `Best day: <b>${esc(bestDay.label)}</b> with ${bestDay.count} completion${bestDay.count === 1 ? '' : 's'}.` : 'No completions in the last 7 days — any finished task next week will restart the trend.'}</p>

<h3 style="margin:20px 0 6px;font-size:14px">Open work by priority</h3>
${prioGroups.length === 0 ? '<p style="font-size:12px;color:#666;margin:0">Nothing open — the board is clear.</p>' : prioGroups.map(g => `<p style="font-size:12px;color:#333;margin:0 0 4px"><b>${esc(g.label)}</b>: ${g.count} open${g.minutes > 0 ? ` · ~${Math.round(g.minutes / 60 * 10) / 10}h estimated` : ''}${g.top.length > 0 ? ` — e.g. ${escTitle(g.top[0])}` : ''}</p>`).join('')}
${urgentHighOpen > 0 ? `<p style="font-size:12px;color:#666;margin:6px 0 0">Why it matters: ${urgentHighOpen} urgent/high task${urgentHighOpen === 1 ? ' is' : 's are'} still open, and high-priority work sets the tone for the whole board.</p>` : ''}

<h3 style="margin:20px 0 6px;font-size:14px">Needs attention (overdue)</h3>
${overdue.length === 0 ? '<p style="font-size:12px;color:#666;margin:0">Nothing overdue — every dated task is on track.</p>' : `<ul style="font-size:12px;color:#333;margin:0;padding-left:18px">${overdue.slice(0, 5).map(o => `<li><b>${escTitle(o.title)}</b> — ${o.daysOverdue} day${o.daysOverdue === 1 ? '' : 's'} overdue${o.priority && o.priority !== 'none' ? ` · ${esc(o.priority)} priority` : ''}</li>`).join('')}</ul>${overdue.length > 5 ? `<p style="font-size:12px;color:#666;margin:6px 0 0">…plus ${overdue.length - 5} more overdue.</p>` : ''}`}

<h3 style="margin:20px 0 6px;font-size:14px">Projects</h3>
${projects.length === 0 ? '<p style="font-size:12px;color:#666;margin:0">No project tasks yet — group work into a project to track progress per area.</p>' : projects.map(p => `<p style="font-size:12px;color:#333;margin:0 0 4px"><b>${esc(p.name)}</b>: ${p.done}/${p.total} (${p.pct}%) — ${esc(p.status)}</p>`).join('')}

<h3 style="margin:20px 0 6px;font-size:14px">Notes</h3>
<p style="font-size:12px;color:#333;margin:0">${notes.length} note${notes.length === 1 ? '' : 's'}${notesThisWeek > 0 ? `, ${notesThisWeek} added this week` : ''}. Notes with dates and tags are easier to find when planning next week.</p>

<h3 style="margin:20px 0 6px;font-size:14px">Productivity score: ${score}/100</h3>
<p style="font-size:12px;color:#666;margin:0 0 4px">${esc(scoreRationale)}</p>

<h3 style="margin:20px 0 6px;font-size:14px">Stuck work (bottlenecks)</h3>
${bottlenecks.length === 0 ? '<p style="font-size:12px;color:#666;margin:0">No open work to stall — nothing is stuck right now.</p>' : `<ul style="font-size:12px;color:#333;margin:0;padding-left:18px">${bottlenecks.map(b => `<li><b>${escTitle(b.title)}</b> (${esc(b.detail)}). Next step: ${esc(b.step)}</li>`).join('')}</ul>`}

<h3 style="margin:20px 0 6px;font-size:14px">Next up</h3>
${nextUp.length === 0 ? '<p style="font-size:12px;color:#666;margin:0">Nothing queued — add your first task to get a recommendation here.</p>' : `<ul style="font-size:12px;color:#333;margin:0;padding-left:18px">${nextUp.map(n => `<li><b>${escTitle(n.title)}</b> — ${esc(n.reason)}</li>`).join('')}</ul>`}

<p style="margin-top:20px"><a href="${((process.env.FRONTEND_URL || 'https://task-joy-box.onrender.com').replace(/\/$/, ''))}/insights" style="display:inline-block;background:#000;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-size:13px">Open Insights</a></p>
<p style="font-size:11px;color:#999;margin-top:16px">You receive this because Email Notifications is enabled in Settings. Turn it off in Settings → Notifications.</p>
</div>`;

  const textLines = [
    `Weekly summary for ${user.name} (${formatLong(now)})`,
    ``,
    aiSummary,
    ``,
    `Total: ${total}, Done: ${completed} (${rate}%), Active: ${active.length}, Overdue: ${overdue.length}, Completed this week: ${completedThisWeek}, Created this week: ${createdThisWeek}`,
    weekExplanation,
    ``,
    `Daily completions (last 7 days): ${last7.map(d => `${d.label} ${d.count}`).join(', ')}. ${bestDay.count > 0 ? `Best: ${bestDay.label} (${bestDay.count}).` : 'No completions in 7 days.'}`,
    prioGroups.length > 0 ? `Open by priority: ${prioGroups.map(g => `${g.label} ${g.count}`).join(', ')}.` : 'Nothing open.',
    overdue.length > 0 ? `Overdue: ${overdue.slice(0, 5).map(o => `"${o.title}" (${o.daysOverdue}d)`).join('; ')}${overdue.length > 5 ? ` +${overdue.length - 5} more` : ''}.` : 'Nothing overdue.',
    projects.length > 0 ? `Projects: ${projects.map(p => `${p.name} ${p.done}/${p.total} (${p.pct}%, ${p.status})`).join('; ')}.` : 'No project tasks.',
    `Notes: ${notes.length}${notesThisWeek > 0 ? ` (${notesThisWeek} this week)` : ''}.`,
    `Productivity score: ${score}/100. ${scoreRationale}`,
    bottlenecks.length > 0 ? `Bottlenecks: ${bottlenecks.map(b => `"${b.title}" (${b.detail}) — ${b.step}`).join('; ')}.` : 'Nothing stuck.',
    nextUp.length > 0 ? `Next up: ${nextUp.map(n => `"${n.title}" — ${n.reason}`).join('; ')}.` : 'Nothing queued.',
  ];
  return { subject, html, text: textLines.join('\n') };
}

export async function sendWeeklyEmails(): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const allSettings = await db.select().from(userSettings).where(eq(userSettings.emailNotifs, true));
  let sent = 0, skipped = 0;
  const errors: string[] = [];
  for (const s of allSettings) {
    const [u] = await db.select().from(users).where(eq(users.id, s.userId)).limit(1);
    if (!u) { skipped++; continue; }
    const tier = (u.subscriptionTier || 'free').toLowerCase();
    const isTopTier = tier === 'pro';
    if (!isTopTier) { skipped++; continue; }
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
