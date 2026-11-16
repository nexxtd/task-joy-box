import { Router, Response } from 'express';
import OpenAI from 'openai';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '../db.js';
import { energyLogs, userSettings } from '../../shared/schema.js';
import { AuthRequest, requireAuth } from '../middleware/auth.js';
import { normalizeLanguageCode } from '../lib/language.js';
import { languageDisplayLabel, translateAnalytics } from '../../shared/analyticsI18n.js';

const router = Router();

const VALID_SLOTS = new Set(['morning', 'midday', 'afternoon']);
const VALID_LEVELS = new Set(['low', 'medium', 'high']);

const LANGUAGE_LABELS: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  zh: 'Simplified Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  hi: 'Hindi',
  ru: 'Russian',
  nl: 'Dutch',
  tr: 'Turkish',
  vi: 'Vietnamese',
  he: 'Hebrew',
};

interface GroupedEnergyEntry {
  date: string;
  morning?: 'low' | 'medium' | 'high';
  midday?: 'low' | 'medium' | 'high';
  afternoon?: 'low' | 'medium' | 'high';
}

function groupRows(rows: Array<{ date: string; timeSlot: string; energyLevel: string }>): GroupedEnergyEntry[] {
  const byDate = new Map<string, GroupedEnergyEntry>();
  for (const r of rows) {
    if (!r.date || !VALID_SLOTS.has(r.timeSlot) || !VALID_LEVELS.has(r.energyLevel)) continue;
    let item = byDate.get(r.date);
    if (!item) {
      item = { date: r.date };
      byDate.set(r.date, item);
    }
    (item as any)[r.timeSlot] = r.energyLevel;
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

async function upsertEnergySlot(userId: number, date: string, timeSlot: string, energyLevel: string) {
  const existing = await db
    .select()
    .from(energyLogs)
    .where(and(eq(energyLogs.userId, userId), eq(energyLogs.date, date), eq(energyLogs.timeSlot, timeSlot)))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(energyLogs)
      .set({ energyLevel })
      .where(eq(energyLogs.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(energyLogs)
    .values({ userId, date, timeSlot, energyLevel })
    .returning();
  return created;
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(energyLogs)
      .where(eq(energyLogs.userId, req.userId!))
      .orderBy(asc(energyLogs.date), asc(energyLogs.id));

    res.json({
      logs: rows,
      grouped: groupRows(rows),
    });
  } catch (err) {
    console.error('Failed to load energy logs:', err);
    res.status(500).json({ error: 'Failed to load energy logs' });
  }
});

router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { date, timeSlot, energyLevel } = req.body || {};
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Invalid date format (expected YYYY-MM-DD)' });
    }
    if (!VALID_SLOTS.has(String(timeSlot))) {
      return res.status(400).json({ error: 'Invalid timeSlot' });
    }
    if (!VALID_LEVELS.has(String(energyLevel))) {
      return res.status(400).json({ error: 'Invalid energyLevel' });
    }

    const log = await upsertEnergySlot(req.userId!, date, String(timeSlot), String(energyLevel));
    res.json({ ok: true, log });
  } catch (err) {
    console.error('Failed to save energy log:', err);
    res.status(500).json({ error: 'Failed to save energy log' });
  }
});

router.post('/sync', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries.slice(0, 400) : [];
    const existingRows = await db
      .select()
      .from(energyLogs)
      .where(eq(energyLogs.userId, req.userId!));

    const existingMap = new Set(existingRows.map(r => `${r.date}:${r.timeSlot}`));

    for (const entry of entries) {
      if (!entry || typeof entry.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) continue;
      for (const slot of ['morning', 'midday', 'afternoon'] as const) {
        const level = entry[slot];
        if (VALID_LEVELS.has(String(level)) && !existingMap.has(`${entry.date}:${slot}`)) {
          await upsertEnergySlot(req.userId!, entry.date, slot, String(level));
          existingMap.add(`${entry.date}:${slot}`);
        }
      }
    }

    const allRows = await db
      .select()
      .from(energyLogs)
      .where(eq(energyLogs.userId, req.userId!))
      .orderBy(asc(energyLogs.date), asc(energyLogs.id));

    res.json({
      logs: allRows,
      grouped: groupRows(allRows),
    });
  } catch (err) {
    console.error('Failed to sync energy logs:', err);
    res.status(500).json({ error: 'Failed to sync energy logs' });
  }
});

const RANGE_LABELS: Record<string, { days: number; label: string; key: string }> = {
  '1w': { days: 7, label: 'last 7 days (1 week)', key: 'last week' },
  '1m': { days: 30, label: 'last 30 days (1 month)', key: 'last month' },
  '6m': { days: 180, label: 'last 6 months', key: 'last 6 months' },
  '1y': { days: 365, label: 'last 1 year', key: 'last year' },
};

const LEVEL_SCORE: Record<string, number> = { low: 1, medium: 2, high: 3 };


const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Precise, verifiable stats computed from the user's logs; fed to the AI so it cites real numbers. */
function computeEnergyStats(inWindow: GroupedEnergyEntry[], windowDays: number) {
  const sorted = [...inWindow].sort((a, b) => a.date.localeCompare(b.date));
  const slots = ['morning', 'midday', 'afternoon'] as const;
  const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const pct = (n: number) => Math.round(((n - 1) / 2) * 100); // low=0%, medium=50%, high=100%
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const dayAvg = (e: GroupedEnergyEntry): number | null => {
    const v = slots.map(s => e[s]).filter(Boolean).map(l => LEVEL_SCORE[l as string]);
    return v.length ? mean(v) : null;
  };

  const slotStats = Object.fromEntries(slots.map(s => {
    const levels = sorted.map(e => e[s]).filter(Boolean) as string[];
    const scores = levels.map(l => LEVEL_SCORE[l]);
    return [s, {
      logged: scores.length,
      energyPct: scores.length ? pct(mean(scores)) : null,
      lowCount: levels.filter(l => l === 'low').length,
      highCount: levels.filter(l => l === 'high').length,
    }];
  }));

  const daily = sorted
    .map(e => ({ date: e.date, avg: dayAvg(e) }))
    .filter((d): d is { date: string; avg: number } => d.avg !== null);
  const half = Math.floor(daily.length / 2);
  const trendDelta = daily.length >= 4
    ? r1((mean(daily.slice(half).map(d => d.avg)) - mean(daily.slice(0, half).map(d => d.avg))) * 50)
    : 0;
  const trend = daily.length < 4 ? 'not enough data' : trendDelta > 5 ? 'improving' : trendDelta < -5 ? 'declining' : 'steady';

  const byWeekday: Record<string, number[]> = {};
  for (const d of daily) {
    const wd = WEEKDAY_NAMES[new Date(`${d.date}T12:00:00Z`).getUTCDay()];
    (byWeekday[wd] ||= []).push(d.avg);
  }
  const weekdays = Object.entries(byWeekday)
    .filter(([, v]) => v.length >= 2)
    .map(([day, v]) => ({ day, energyPct: pct(mean(v)), samples: v.length }))
    .sort((a, b) => b.energyPct - a.energyPct);

  const withBoth = sorted.filter(e => e.morning && e.afternoon);
  const drops = withBoth.filter(e => LEVEL_SCORE[e.afternoon!] < LEVEL_SCORE[e.morning!]).length;
  const rises = withBoth.filter(e => LEVEL_SCORE[e.afternoon!] > LEVEL_SCORE[e.morning!]).length;

  const m = mean(daily.map(d => d.avg));
  const stdDev = daily.length > 1 ? Math.sqrt(mean(daily.map(d => (d.avg - m) ** 2))) : 0;
  let run = 0, maxLowRun = 0;
  for (const d of daily) { run = d.avg < 1.67 ? run + 1 : 0; maxLowRun = Math.max(maxLowRun, run); }
  const last7 = daily.slice(-7);

  return {
    windowDays,
    daysLogged: daily.length,
    fullDays: sorted.filter(e => slots.every(s => e[s])).length,
    overallEnergyPct: daily.length ? pct(m) : null,
    last7LoggedDaysEnergyPct: last7.length ? pct(mean(last7.map(d => d.avg))) : null,
    slots: slotStats,
    trend,
    trendDeltaPctPoints: trendDelta,
    morningToAfternoon: { compared: withBoth.length, drops, rises, same: withBoth.length - drops - rises },
    weekdays,
    variability: stdDev < 0.35 ? 'stable' : stdDev < 0.7 ? 'moderate' : 'volatile',
    longestLowEnergyStreakDays: maxLowRun,
    lowDays: daily.filter(d => d.avg < 1.67).length,
    highDays: daily.filter(d => d.avg > 2.33).length,
  };
}

function buildLocalDeepEnergyAnalysis(
  range: string,
  entries: GroupedEnergyEntry[],
  langCode: string = 'en',
): {
  headline: string;
  patternSummary: string;
  peakStrategy: string;
  dipMitigation: string;
  consistencyNote: string;
  aiPowered: boolean;
} {
  const cfg = RANGE_LABELS[range] || RANGE_LABELS['1w'];
  const rangeLabel = translateAnalytics(langCode, cfg.key);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (cfg.days - 1));
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  const inWindow = entries.filter(e => e.date >= cutoffKey);

  const slotScores: Record<'morning' | 'midday' | 'afternoon', number[]> = {
    morning: [],
    midday: [],
    afternoon: [],
  };
  for (const e of inWindow) {
    if (e.morning) slotScores.morning.push(LEVEL_SCORE[e.morning]);
    if (e.midday) slotScores.midday.push(LEVEL_SCORE[e.midday]);
    if (e.afternoon) slotScores.afternoon.push(LEVEL_SCORE[e.afternoon]);
  }
  const avg = (arr: number[]) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const slotAvgs = [
    { slot: 'Morning', avg: avg(slotScores.morning), count: slotScores.morning.length },
    { slot: 'Midday', avg: avg(slotScores.midday), count: slotScores.midday.length },
    { slot: 'Afternoon', avg: avg(slotScores.afternoon), count: slotScores.afternoon.length },
  ].filter(s => s.avg !== null) as Array<{ slot: string; avg: number; count: number }>;

  slotAvgs.sort((a, b) => b.avg - a.avg);
  const peak = slotAvgs[0];
  const trough = slotAvgs[slotAvgs.length - 1];
  const allScores = [...slotScores.morning, ...slotScores.midday, ...slotScores.afternoon];
  const overallAvg = avg(allScores) || 0;
  const overallPct = Math.round(overallAvg * (100 / 3));

  const swing = peak && trough ? +(peak.avg - trough.avg).toFixed(2) : 0;
  const fullDays = inWindow.filter(e => e.morning && e.midday && e.afternoon).length;
  const coveragePct = Math.min(100, Math.round((inWindow.length / Math.max(1, Math.min(cfg.days, 30))) * 100));

  const peakLabel = peak ? translateAnalytics(langCode, peak.slot) : '';
  const troughLabel = trough ? translateAnalytics(langCode, trough.slot) : '';
  const peakPct = peak ? Math.round(peak.avg * (100 / 3)) : 0;
  const troughPct = trough ? Math.round(trough.avg * (100 / 3)) : 0;

  const stats = computeEnergyStats(inWindow, cfg.days);
  const extra: string[] = [];
  if (stats.trend === 'improving' || stats.trend === 'declining') {
    extra.push(`Your daily energy is ${stats.trend} (${stats.trendDeltaPctPoints > 0 ? '+' : ''}${stats.trendDeltaPctPoints} points between the first and second half of this period).`);
  }
  if (stats.morningToAfternoon.compared >= 3) {
    extra.push(`On ${stats.morningToAfternoon.drops} of ${stats.morningToAfternoon.compared} days your energy fell between morning and afternoon.`);
  }
  if (stats.weekdays.length >= 2) {
    const best = stats.weekdays[0];
    const worst = stats.weekdays[stats.weekdays.length - 1];
    if (best.energyPct !== worst.energyPct) extra.push(`${best.day}s are your strongest day (${best.energyPct}%) and ${worst.day}s your weakest (${worst.energyPct}%).`);
  }
  if (stats.longestLowEnergyStreakDays >= 2) {
    extra.push(`You had a ${stats.longestLowEnergyStreakDays}-day low-energy streak; check sleep, workload or stress around those dates.`);
  }
  const extraText = langCode === 'en' && extra.length ? ' ' + extra.join(' ') : '';

  return {
    aiPowered: false,
    headline: translateAnalytics(
      langCode,
      'Across the {{range}}, your average energy index is {{pct}}% across {{days}} logged days ({{checks}} checks).',
      { range: rangeLabel, pct: overallPct, days: inWindow.length, checks: allScores.length }
    ),
    patternSummary: (peak && trough && peak.slot !== trough.slot
      ? translateAnalytics(
          langCode,
          'Your energy follows a measurable daily curve with a {{swing}}-point spread between your strongest window ({{peak}} at {{peakPct}}%) and your lowest window ({{trough}} at {{troughPct}}%).',
          { swing: swing.toFixed(1), peak: peakLabel, peakPct, trough: troughLabel, troughPct }
        )
      : translateAnalytics(
          langCode,
          'Your energy stays fairly balanced across logged time slots with {{days}} recorded days in this window.',
          { days: inWindow.length }
        )) + extraText,
    peakStrategy: peak
      ? translateAnalytics(
          langCode,
          'Schedule high-focus problem solving, complex planning, and demanding creative tasks during your {{peak}} window when alertness scores highest ({{peakPct}}%).',
          { peak: peakLabel, peakPct }
        )
      : translateAnalytics(langCode, 'Complete your daily energy checks to identify your personal deep-work peak hours.'),
    dipMitigation: trough
      ? translateAnalytics(
          langCode,
          'Expect natural cognitive drift during {{trough}}. Protect that window with lower-friction routine tasks, short hydration/walk breaks, or quick inbox cleanup rather than heavy analytical work.',
          { trough: troughLabel }
        )
      : translateAnalytics(langCode, 'Once recurring low-energy periods appear, Planora highlights targeted recovery habits and lighter task blocks.'),
    consistencyNote: translateAnalytics(
      langCode,
      'You completed all 3 checks on {{full}} of {{days}} logged days ({{pct}}% tracking rhythm). Continuing steady check-ins across 1 month, 6 months, and 1 year makes seasonal and weekly recovery trends clearer.',
      { full: fullDays, days: inWindow.length, pct: coveragePct }
    ),
  };
}

router.post('/ai-analysis', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const range = typeof req.body?.range === 'string' && RANGE_LABELS[req.body.range] ? req.body.range : '1w';
    const cfg = RANGE_LABELS[range];

    const [settings] = await db.select({ language: userSettings.language }).from(userSettings).where(eq(userSettings.userId, req.userId!)).limit(1);
    const langCode = normalizeLanguageCode(req.body?.language || settings?.language || 'en');
    const langName = languageDisplayLabel(langCode) || LANGUAGE_LABELS[langCode] || 'English';
    const rangeLabel = translateAnalytics(langCode, cfg.key);

    const dbRows = await db
      .select()
      .from(energyLogs)
      .where(eq(energyLogs.userId, req.userId!))
      .orderBy(asc(energyLogs.date));
    const dbGrouped = groupRows(dbRows);
    const bodyEntries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const entries: GroupedEnergyEntry[] = dbGrouped.length >= bodyEntries.length ? dbGrouped : bodyEntries;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (cfg.days - 1));
    const cutoffKey = cutoff.toISOString().slice(0, 10);
    const inWindow = entries.filter(e => e.date >= cutoffKey);

    if (inWindow.length === 0) {
      return res.json({
        aiPowered: false,
        headline: translateAnalytics(langCode, 'No energy check-ins logged in the {{range}}.', { range: rangeLabel }),
        patternSummary: translateAnalytics(
          langCode,
          'Log morning, midday, and afternoon energy checks to unlock AI analysis across 1 week, 1 month, 6 months, and 1 year windows.'
        ),
        peakStrategy: translateAnalytics(langCode, 'Complete your daily energy checks to identify your personal deep-work peak hours.'),
        dipMitigation: translateAnalytics(
          langCode,
          'Once recurring low-energy periods appear, Planora highlights targeted recovery habits and lighter task blocks.'
        ),
        consistencyNote: translateAnalytics(langCode, 'Tip: You can record today’s energy levels directly from Settings → History.'),
      });
    }

    const fallback = buildLocalDeepEnergyAnalysis(range, entries, langCode);
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.json(fallback);
    }

    try {
      const client = new OpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey });
      const recentSample = inWindow.slice(-60);
      const stats = computeEnergyStats(inWindow, cfg.days);
      const prompt = `You are an expert circadian-rhythm and productivity analyst. Analyze the user's energy check-ins for the ${cfg.label}.
Target language: ${langName} (${langCode}). EVERY string in your JSON response MUST be written naturally in ${langName}.

Scale: each check-in is low / medium / high (energyPct: low=0%, medium=50%, high=100%). Check-ins are at morning (~8am), midday (~12pm) and afternoon (~4pm).

PRE-COMPUTED STATS (authoritative and exact; use these numbers, do not recompute or invent others):
${JSON.stringify(stats, null, 2)}

Raw entries (${inWindow.length} days in window, up to 60 most recent):
${JSON.stringify(recentSample)}

Rules:
- Accuracy first: every number you mention MUST appear in the stats above or be directly countable from the raw entries. Never fabricate.
- If daysLogged < 5, say plainly that data is limited and keep conclusions tentative.
- Be insightful, not generic: explain WHY the pattern likely happens (post-lunch dip, sleep debt, weekly workload, weekend recovery) and give specific, actionable advice tied to their actual times and weekdays.
- Cover the trend, weekday differences, the morning-to-afternoon pattern and any low-energy streaks when the stats show something meaningful.
- 2-3 sentences per field. No platitudes.

Return ONLY valid JSON with these exact keys:
{
  "headline": "one-sentence key finding with the most important number",
  "patternSummary": "daily curve + trend + weekday pattern, with likely reasons",
  "peakStrategy": "when exactly to schedule deep work and why",
  "dipMitigation": "when dips occur, likely cause, and concrete countermeasures",
  "consistencyNote": "logging coverage, stability, and what more data would reveal"
}`;

      const completion = await client.chat.completions.create({
        model: process.env.OPENROUTER_MODEL || 'openrouter/free',
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: `Respond strictly with valid JSON in ${langName}. No markdown fences.` },
          { role: 'user', content: prompt },
        ],
      });
      const text = completion?.choices?.[0]?.message?.content || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed && parsed.headline && parsed.patternSummary) {
          return res.json({
            aiPowered: true,
            headline: String(parsed.headline),
            patternSummary: String(parsed.patternSummary),
            peakStrategy: String(parsed.peakStrategy || fallback.peakStrategy),
            dipMitigation: String(parsed.dipMitigation || fallback.dipMitigation),
            consistencyNote: String(parsed.consistencyNote || fallback.consistencyNote),
          });
        }
      }
    } catch (aiErr) {
      console.warn('Energy AI analysis fell back to deterministic analysis:', (aiErr as any)?.message || aiErr);
    }

    res.json(fallback);
  } catch (err) {
    console.error('Energy AI analysis failed:', err);
    res.status(500).json({ error: 'Failed to analyze energy data' });
  }
});

export default router;
