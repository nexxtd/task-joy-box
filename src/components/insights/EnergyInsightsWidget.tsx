import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { Battery, Brain, RefreshCw, Sparkles, Clock, Target, ShieldAlert } from 'lucide-react';
import { CollapsibleRow, CollapseAllToggle, EmptyState, useExpanded } from './InsightWidgets';
import { ENERGY_UPDATED_EVENT } from '@/utils/energyStats';
import { useLanguage } from '@/context/LanguageContext';

type Slot = 'morning' | 'midday' | 'afternoon';
type Level = 'low' | 'medium' | 'high';
export type EnergyTimeRange = '1w' | '1m' | '6m' | '1y';

const RANGES: Array<{ id: EnergyTimeRange; label: string }> = [
  { id: '1w', label: '1 Week' },
  { id: '1m', label: '1 Month' },
  { id: '6m', label: '6 Months' },
  { id: '1y', label: '1 Year' },
];

const RANGE_DAYS: Record<EnergyTimeRange, number> = {
  '1w': 7,
  '1m': 30,
  '6m': 180,
  '1y': 365,
};

interface EnergyEntry {
  date: string;
  morning?: Level;
  midday?: Level;
  afternoon?: Level;
  evening?: Level;
}

interface DeepEnergyAnalysis {
  headline: string;
  patternSummary: string;
  peakStrategy: string;
  dipMitigation: string;
  consistencyNote: string;
  aiPowered?: boolean;
}

const STORAGE_KEY = 'energy_history';
const SLOT_LABELS: Record<Slot, string> = { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon' };
const SLOT_WINDOWS: Record<Slot, string> = { morning: '8am–12pm', midday: '12pm–4pm', afternoon: '4pm onward' };

function mergeEnergyEntries(local: EnergyEntry[], remote: EnergyEntry[]): EnergyEntry[] {
  const byDate = new Map<string, EnergyEntry>();
  for (const item of local) {
    if (item?.date) byDate.set(item.date, { ...item });
  }
  for (const item of remote) {
    if (!item?.date) continue;
    const prev = byDate.get(item.date);
    byDate.set(item.date, {
      date: item.date,
      morning: item.morning ?? prev?.morning,
      midday: item.midday ?? prev?.midday,
      afternoon: item.afternoon ?? prev?.afternoon,
      evening: item.evening ?? prev?.evening,
    });
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

const numeric = (level?: Level): number => (level === 'high' ? 3 : level === 'medium' ? 2 : level === 'low' ? 1 : 0);
const fmt = (v: number) => v.toFixed(1);

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Analysis {
  windowDays: number;
  overallScore: number;
  daysLogged: number;
  checksCount: number;
  fullDays: number;
  slots: Record<Slot, { avg: number; logged: number }>;
  peak: Slot | null;
  trough: Slot | null;
  trend: 'improving' | 'declining' | 'steady';
  trendDelta: number;
  contributors: string[];
  penalties: string[];
  insights: string[];
  recommendations: string[];
}

type TranslateFn = (phrase: string, vars?: Record<string, string | number>) => string;

function buildAnalysis(
  entries: EnergyEntry[],
  timeRange: EnergyTimeRange = '1w',
  t: TranslateFn = (s) => s,
): Analysis | null {
  const windowDays = RANGE_DAYS[timeRange] || 7;
  const now = new Date();
  const currentCutoff = dayKey(new Date(now.getTime() - (windowDays - 1) * 86400000));
  const prevCutoff = dayKey(new Date(now.getTime() - (windowDays * 2 - 1) * 86400000));
  const recent = entries.filter(e => e.date >= currentCutoff);
  const prevWindow = entries.filter(e => e.date >= prevCutoff && e.date < currentCutoff);
  if (recent.length === 0 && prevWindow.length === 0) return null;

  const slots: Record<Slot, { avg: number; logged: number }> = {
    morning: { avg: 0, logged: 0 },
    midday: { avg: 0, logged: 0 },
    afternoon: { avg: 0, logged: 0 },
  };

  let sum = 0;
  let count = 0;
  const dates = new Set<string>();
  let fullDays = 0;
  const daysAllLogged = new Map<string, number>();

  recent.forEach(entry => {
    dates.add(entry.date);
    let loggedInDay = 0;
    (['morning', 'midday', 'afternoon'] as Slot[]).forEach(slot => {
      const v = numeric(entry[slot]);
      if (v === 0) return;
      slots[slot].logged += 1;
      slots[slot].avg += v;
      sum += v;
      count += 1;
      loggedInDay += 1;
    });
    daysAllLogged.set(entry.date, loggedInDay);
    if (loggedInDay === 3) fullDays += 1;
  });
  (['morning', 'midday', 'afternoon'] as Slot[]).forEach(slot => {
    if (slots[slot].logged > 0) slots[slot].avg = slots[slot].avg / slots[slot].logged;
  });

  let prevSum = 0;
  let prevCount = 0;
  prevWindow.forEach(entry => {
    (['morning', 'midday', 'afternoon'] as Slot[]).forEach(slot => {
      const v = numeric(entry[slot]);
      if (v > 0) {
        prevSum += v;
        prevCount += 1;
      }
    });
  });

  const daysLogged = dates.size;
  const checksCount = count;
  const avgAll = count > 0 ? sum / count : 0;
  const prevAvgAll = prevCount > 0 ? prevSum / prevCount : avgAll;
  const delta = avgAll - prevAvgAll;
  const trend: Analysis['trend'] = prevCount === 0
    ? 'steady'
    : delta >= 0.15 ? 'improving' : delta <= -0.15 ? 'declining' : 'steady';

  const slotOrder: Slot[] = ['morning', 'midday', 'afternoon'];
  const loggedSlots = slotOrder.filter(s => slots[s].logged > 0);
  let peak: Slot | null = null;
  let trough: Slot | null = null;
  if (loggedSlots.length > 0) {
    peak = loggedSlots.reduce((best, s) => (slots[s].avg > slots[best].avg ? s : best), loggedSlots[0]);
    trough = loggedSlots.reduce((worst, s) => (slots[s].avg < slots[worst].avg ? s : worst), loggedSlots[0]);
  }
  const swing = peak && trough ? slots[peak].avg - slots[trough].avg : 0;

  const contributors: string[] = [];
  const penalties: string[] = [];
  const insights: string[] = [];
  const recommendations: string[] = [];

  if (peak && slots[peak].avg >= 2.5) {
    contributors.push(
      t('{{slot}} energy averages {{avg}}/3 — {{slot}} is your strongest window for demanding work.', {
        slot: t(SLOT_LABELS[peak]),
        avg: fmt(slots[peak].avg),
      })
    );
  }
  if (daysLogged >= Math.min(5, Math.ceil(windowDays * 0.7))) {
    contributors.push(
      t('You logged energy on {{days}} of the last {{window}} days — the analysis is built on fresh, reliable data.', {
        days: daysLogged,
        window: windowDays,
      })
    );
  }
  if (trend === 'improving') {
    contributors.push(
      t('Energy is trending up over the comparison window (+{{delta}}/3) — whatever you changed is working.', {
        delta: fmt(delta),
      })
    );
  }
  if (fullDays === daysLogged && daysLogged >= 3) {
    contributors.push(t('You completed all three daily checks on every logged day — the daily pattern is fully visible.'));
  }

  if (trough && slots[trough].avg <= 1.5) {
    penalties.push(
      t('{{slot}} energy averages just {{avg}}/3 — expect a hard dip in that window.', {
        slot: t(SLOT_LABELS[trough]),
        avg: fmt(slots[trough].avg),
      })
    );
  }
  if (daysLogged >= 3 && fullDays < daysLogged) {
    penalties.push(
      t('Only {{full}} of {{days}} logged days include all three checks — skipped slots leave blind spots in the analysis.', {
        full: fullDays,
        days: daysLogged,
      })
    );
  }
  if (swing >= 1.2) {
    penalties.push(
      t('Energy swings {{swing}} points between your peak and your lowest slot — time-of-day planning is less predictable.', {
        swing: fmt(swing),
      })
    );
  }
  if (trend === 'declining') {
    penalties.push(
      t('Energy has dropped {{delta}}/3 over the comparison window — review sleep, workload and recovery.', {
        delta: fmt(-delta),
      })
    );
  }
  if (avgAll > 0 && avgAll < 1.8) {
    penalties.push(
      t('Overall energy is running low ({{avg}}/3) — consider rest and lighter scheduling.', {
        avg: fmt(avgAll),
      })
    );
  }

  if (peak && slots[peak].logged >= 2) {
    insights.push(
      t('Your peak window is {{slot}} (avg {{avg}}/3, {{window}}).', {
        slot: t(SLOT_LABELS[peak]),
        avg: fmt(slots[peak].avg),
        window: SLOT_WINDOWS[peak],
      })
    );
  }
  const mostConsistent = slotOrder
    .filter(s => slots[s].logged > 0)
    .reduce((best, s) => (slots[s].logged > slots[best].logged ? s : best), loggedSlots[0]);
  if (mostConsistent && daysLogged > 0 && slots[mostConsistent].logged >= 2) {
    insights.push(
      t('Your {{slot}} check is your most consistent — logged {{logged}} of {{days}} days.', {
        slot: t(SLOT_LABELS[mostConsistent]),
        logged: slots[mostConsistent].logged,
        days: daysLogged,
      })
    );
  }
  if (checksCount > 0) {
    insights.push(
      t('You logged {{checks}} energy checks across the last {{window}} days.', {
        checks: checksCount,
        window: windowDays,
      })
    );
  }
  insights.push(
    t('Across the {{range}}, your average energy index is {{pct}}% across {{days}} logged days ({{checks}} checks).', {
      range: t(timeRange === '1w' ? 'last week' : timeRange === '1m' ? 'last month' : timeRange === '6m' ? 'last 6 months' : 'last year'),
      pct: Math.round(avgAll * (100 / 3)),
      days: daysLogged,
      checks: checksCount,
    })
  );

  if (peak) {
    if (peak === 'morning') {
      recommendations.push(`Protect ${SLOT_WINDOWS.morning} for deep, high-concentration work — your logs show this is when you're strongest.`);
    } else if (peak === 'midday') {
      recommendations.push(`Schedule your most demanding tasks around the mid-day window (${SLOT_WINDOWS.midday}) — that's your peak.`);
    } else {
      recommendations.push(`Plan deep work for the afternoon (${SLOT_WINDOWS.afternoon}) and use mornings for warm-ups and lighter tasks.`);
    }
  }
  if (trough && trough !== peak) {
    recommendations.push(`Keep the ${SLOT_LABELS[trough].toLowerCase()} window (${SLOT_WINDOWS[trough]}) for routine work — emails, admin and quick sessions.`);
  }
  if (daysLogged >= 3 && slots.midday.logged < daysLogged * 0.6) {
    recommendations.push(`The 12pm midday check is the one you skip most — a short reminder at noon keeps the analysis (and your planning) accurate.`);
  }
  if (trend === 'declining') {
    recommendations.push(`Keep logging for 7 more days, then re-read this analysis — the trend will confirm whether the dip is a week of fatigue or a pattern.`);
  }
  if (trend === 'improving' || (trend === 'steady' && peak)) {
    recommendations.push(`Match task difficulty to your logged energy: deep work inside your ${peak ? SLOT_LABELS[peak].toLowerCase() : 'peak'} window, light work in your trough.`);
  }

  return {
    windowDays,
    overallScore: Math.round(avgAll * (100 / 3)),
    daysLogged,
    checksCount,
    fullDays,
    slots,
    peak,
    trough,
    trend,
    trendDelta: delta,
    contributors,
    penalties,
    insights,
    recommendations,
  };
}

const scoreTone = (score: number) =>
  score >= 70 ? 'hsl(var(--label-green))' : score >= 40 ? 'hsl(var(--label-yellow))' : 'hsl(var(--label-red))';

export function EnergyInsightsBody() {
  const { lang, t } = useLanguage();
  const [timeRange, setTimeRange] = useState<EnergyTimeRange>('1w');
  const [entries, setEntries] = useState<EnergyEntry[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [aiByKey, setAiByKey] = useState<Record<string, DeepEnergyAnalysis>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const lastFetchedRef = useRef<string>('');

  const readLocalEntries = useCallback((): EnergyEntry[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const syncRemoteEntries = useCallback(async () => {
    const local = readLocalEntries();
    try {
      const res = await fetch('/api/energy', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.grouped)) {
        const merged = mergeEnergyEntries(local, data.grouped);
        setEntries(merged);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch {}
      }
    } catch {
      // Fall back to local entries silently when offline or unauthenticated
    }
  }, [readLocalEntries]);

  useEffect(() => {
    void syncRemoteEntries();
    const refresh = () => {
      setEntries(readLocalEntries());
      void syncRemoteEntries();
    };
    window.addEventListener('storage', refresh);
    window.addEventListener(ENERGY_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener(ENERGY_UPDATED_EVENT, refresh);
    };
  }, [readLocalEntries, syncRemoteEntries]);

  const analysisKey = `${timeRange}:${lang}:${entries.length}:${entries[entries.length - 1]?.date || ''}`;

  const fetchDeepAnalysis = useCallback(async (force = false) => {
    if (entries.length === 0) return;
    if (!force && lastFetchedRef.current === analysisKey) return;
    lastFetchedRef.current = analysisKey;
    setAiLoading(true);
    try {
      const res = await fetch('/api/energy/ai-analysis', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ range: timeRange, language: lang, entries }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.headline && data?.patternSummary) {
        setAiByKey(prev => ({ ...prev, [analysisKey]: data }));
      }
    } catch {
      // Keep deterministic local analysis if request fails
    } finally {
      setAiLoading(false);
    }
  }, [analysisKey, entries, lang, timeRange]);

  useEffect(() => {
    void fetchDeepAnalysis(false);
  }, [fetchDeepAnalysis]);

  const analysis = useMemo(() => buildAnalysis(entries, timeRange, t), [entries, timeRange, t]);
  const deepAnalysis = aiByKey[analysisKey];
  const { expanded, toggle, expandAll, collapseAll } = useExpanded(['ai-deep']);
  const sectionIds = ['ai-deep', 'contributors', 'penalties', 'insights', 'recommendations'];

  if (!analysis) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between pb-1">
          <div className="inline-flex flex-wrap rounded-lg border border-border/60 bg-muted/40 p-0.5 text-[10px] font-semibold">
            {RANGES.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setTimeRange(r.id)}
                className={`px-2 py-0.5 rounded transition-all ${
                  timeRange === r.id
                    ? 'bg-background text-foreground shadow-xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t(r.label)}
              </button>
            ))}
          </div>
        </div>
        <EmptyState
          icon={Battery}
          text={t('Log your energy at the 8am, 12pm and 4pm checks — an analysis of your peak hours, consistency and what to change will build here from your logs.')}
        />
      </div>
    );
  }

  const score = analysis.overallScore;
  const trendLabel = analysis.trend === 'improving' ? t('Improving') : analysis.trend === 'declining' ? t('Declining') : t('Steady');
  const trendTone = analysis.trend === 'improving' ? 'text-emerald-600' : analysis.trend === 'declining' ? 'text-red-600' : 'text-muted-foreground';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-border/40">
        <div className="inline-flex flex-wrap rounded-lg border border-border/60 bg-muted/40 p-0.5 text-[10px] font-semibold">
          {RANGES.map(r => (
            <button
              key={r.id}
              type="button"
              onClick={() => setTimeRange(r.id)}
              className={`px-2 py-0.5 rounded transition-all ${
                timeRange === r.id
                  ? 'bg-background text-foreground shadow-xs font-bold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t(r.label)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchDeepAnalysis(true)}
            disabled={aiLoading}
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline disabled:opacity-50"
            title={t('Refresh AI analysis')}
          >
            <RefreshCw className={`w-3 h-3 ${aiLoading ? 'animate-spin' : ''}`} />
            {t('Refresh AI')}
          </button>
          <CollapseAllToggle ids={sectionIds} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" strokeWidth="9" style={{ stroke: 'hsl(var(--muted) / 0.5)' }} />
            <circle
              cx="40" cy="40" r="32" fill="none" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${Math.max(0, Math.min(100, score)) * 2.01} 201`}
              style={{ stroke: scoreTone(score) }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-foreground">{score}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-foreground uppercase tracking-wide">{t('Energy Analysis')}</p>
          <p className="text-xs text-muted-foreground leading-snug mt-1">
            {t('{{days}} of the last {{window}} days logged · {{checks}} check-ins', {
              days: analysis.daysLogged,
              window: analysis.windowDays,
              checks: analysis.checksCount,
            })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(['morning', 'midday', 'afternoon'] as Slot[]).map(slot => {
          const s = analysis.slots[slot];
          return (
            <div key={slot} className="rounded-xl border border-border bg-muted/30 px-2 py-2 text-center">
              <p className="text-[9px] font-black uppercase tracking-wide text-muted-foreground">{t(SLOT_LABELS[slot])}</p>
              <p className="text-sm font-black text-foreground mt-0.5">{s.logged > 0 ? `${fmt(s.avg)}/3` : '—'}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{s.logged > 0 ? `${s.logged} ${t('logged')}` : t('No logs')}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {analysis.contributors.length} {t('positive')} · {analysis.penalties.length} {t('negative')}{' '}
          · <span className={trendTone}>{t('trend')} {trendLabel}</span>
        </p>
        <CollapseAllToggle ids={sectionIds} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>

      <div className="space-y-1.5">
        <CollapsibleRow
          id="ai-deep"
          expanded={expanded.includes('ai-deep')}
          onToggle={() => toggle('ai-deep')}
          title={t('AI Deep Energy Analysis')}
          subtitle={deepAnalysis ? t(RANGES.find(r => r.id === timeRange)?.label || '1 Week') : aiLoading ? t('Analyzing logs...') : t('Pattern & circadian breakdown')}
          tone="neutral"
          badge={
            deepAnalysis?.aiPowered ? (
              <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary uppercase">AI</span>
            ) : undefined
          }
        >
          {aiLoading && !deepAnalysis ? (
            <p className="text-xs text-muted-foreground py-1 flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5 text-primary animate-pulse" />
              {t('Generating deep analysis for {{range}}...', {
                range: t(RANGES.find(r => r.id === timeRange)?.label || '1 Week'),
              })}
            </p>
          ) : deepAnalysis ? (
            <div className="space-y-2 py-1 text-xs">
              <p className="font-semibold text-foreground leading-relaxed">{deepAnalysis.headline}</p>
              <div className="space-y-1.5 text-muted-foreground leading-relaxed">
                <p><span className="font-semibold text-foreground">{t('Pattern')}:</span> {deepAnalysis.patternSummary}</p>
                <p><span className="font-semibold text-foreground">{t('Peak strategy')}:</span> {deepAnalysis.peakStrategy}</p>
                <p><span className="font-semibold text-foreground">{t('Dip mitigation')}:</span> {deepAnalysis.dipMitigation}</p>
                <p><span className="font-semibold text-foreground">{t('Consistency')}:</span> {deepAnalysis.consistencyNote}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-1">
              {t('Keep logging energy across days to unlock deeper timeframe pattern analysis.')}
            </p>
          )}
        </CollapsibleRow>

        <CollapsibleRow
          id="contributors"
          expanded={expanded.includes('contributors')}
          onToggle={() => toggle('contributors')}
          title={t("What's helping")}
          subtitle={`${analysis.contributors.length} ${analysis.contributors.length !== 1 ? t('positive factors') : t('positive factor')}`}
          tone="ok"
          badge={analysis.contributors.length > 0 ? <span className="shrink-0 text-[10px] font-bold text-emerald-600">{analysis.contributors.length}</span> : undefined}
        >
          {analysis.contributors.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">{t('Nothing stands out as a strength yet — keep logging and a peak window will show up here.')}</p>
          ) : (
            analysis.contributors.map((text, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
                <span className="text-foreground leading-relaxed">{t(text)}</span>
              </div>
            ))
          )}
        </CollapsibleRow>

        <CollapsibleRow
          id="penalties"
          expanded={expanded.includes('penalties')}
          onToggle={() => toggle('penalties')}
          title={t("What's dragging it down")}
          subtitle={`${analysis.penalties.length} ${analysis.penalties.length !== 1 ? t('negative factors') : t('negative factor')}`}
          tone="bad"
          badge={analysis.penalties.length > 0 ? <span className="shrink-0 text-[10px] font-bold text-red-600">{analysis.penalties.length}</span> : undefined}
        >
          {analysis.penalties.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">{t('No major energy issues detected — your pattern is stable and usable.')}</p>
          ) : (
            analysis.penalties.map((text, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-red-500" />
                <span className="text-foreground leading-relaxed">{t(text)}</span>
              </div>
            ))
          )}
        </CollapsibleRow>

        <CollapsibleRow
          id="insights"
          expanded={expanded.includes('insights')}
          onToggle={() => toggle('insights')}
          title={t('Key insights')}
          subtitle={`${analysis.insights.length} ${analysis.insights.length !== 1 ? t('insights') : t('insight')}`}
          tone="neutral"
        >
          {analysis.insights.map((text, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-primary" />
              <span className="text-foreground leading-relaxed">{t(text)}</span>
            </div>
          ))}
        </CollapsibleRow>

        <CollapsibleRow
          id="recommendations"
          expanded={expanded.includes('recommendations')}
          onToggle={() => toggle('recommendations')}
          title={t('What to change')}
          subtitle={`${analysis.recommendations.length} ${analysis.recommendations.length !== 1 ? t('suggestions') : t('suggestion')}`}
          tone="neutral"
        >
          {analysis.recommendations.map((text, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="mt-1 text-primary font-bold">→</span>
              <span className="text-foreground leading-relaxed">{t(text)}</span>
            </div>
          ))}
        </CollapsibleRow>
      </div>
    </div>
  );
}