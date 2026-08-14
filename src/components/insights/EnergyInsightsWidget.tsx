import { useMemo } from 'react';
import { Battery } from 'lucide-react';
import { CollapsibleRow, CollapseAllToggle, EmptyState, useExpanded } from './InsightWidgets';

type Slot = 'morning' | 'midday' | 'afternoon';
type Level = 'low' | 'medium' | 'high';

interface EnergyEntry {
  date: string;
  morning?: Level;
  midday?: Level;
  afternoon?: Level;
  evening?: Level;
}

const STORAGE_KEY = 'energy_history';
const SLOT_LABELS: Record<Slot, string> = { morning: 'Morning', midday: 'Midday', afternoon: 'Afternoon' };
const SLOT_WINDOWS: Record<Slot, string> = { morning: '8am–12pm', midday: '12pm–4pm', afternoon: '4pm onward' };

const numeric = (level?: Level): number => (level === 'high' ? 3 : level === 'medium' ? 2 : level === 'low' ? 1 : 0);
const fmt = (v: number) => v.toFixed(1);

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

interface Analysis {
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

function buildAnalysis(entries: EnergyEntry[]): Analysis | null {
  const now = new Date();
  const sevenAgo = dayKey(new Date(now.getTime() - 6 * 86400000));
  const fourteenAgo = dayKey(new Date(now.getTime() - 13 * 86400000));
  const recent = entries.filter(e => e.date >= sevenAgo);
  const prevWindow = entries.filter(e => e.date >= fourteenAgo && e.date < sevenAgo);
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
      `${SLOT_LABELS[peak]} energy averages ${fmt(slots[peak].avg)}/3 — ${SLOT_LABELS[peak].toLowerCase()} is your strongest window for demanding work.`
    );
  }
  if (daysLogged >= 5) {
    contributors.push(`You logged energy on ${daysLogged} of the last 7 days — the analysis is built on fresh, reliable data.`);
  }
  if (trend === 'improving') {
    contributors.push(`Energy is trending up over the last two weeks (+${fmt(delta)}/3) — whatever you changed is working.`);
  }
  if (fullDays === daysLogged && daysLogged >= 3) {
    contributors.push(`You completed all three daily checks on every logged day — the daily pattern is fully visible.`);
  }

  if (trough && slots[trough].avg <= 1.5) {
    penalties.push(`${SLOT_LABELS[trough]} energy averages just ${fmt(slots[trough].avg)}/3 — expect a hard dip in that window.`);
  }
  if (daysLogged >= 3 && fullDays < daysLogged) {
    penalties.push(`Only ${fullDays} of ${daysLogged} logged days include all three checks — skipped slots leave blind spots in the analysis.`);
  }
  if (swing >= 1.2) {
    penalties.push(`Energy swings ${fmt(swing)} points between your peak and your lowest slot — time-of-day planning is less predictable.`);
  }
  if (trend === 'declining') {
    penalties.push(`Energy has dropped ${fmt(-delta)}/3 over the last two weeks — review sleep, workload and recovery.`);
  }
  if (avgAll > 0 && avgAll < 1.8) {
    penalties.push(`Overall energy is running low (${fmt(avgAll)}/3) — consider rest and lighter scheduling this week.`);
  }

  if (peak && slots[peak].logged >= 2) {
    insights.push(`Your peak window is the ${SLOT_LABELS[peak].toLowerCase()} (avg ${fmt(slots[peak].avg)}/3, ${SLOT_WINDOWS[peak]}).`);
  }
  const mostConsistent = slotOrder
    .filter(s => slots[s].logged > 0)
    .reduce((best, s) => (slots[s].logged > slots[best].logged ? s : best), loggedSlots[0]);
  if (mostConsistent && daysLogged > 0 && slots[mostConsistent].logged >= 2) {
    insights.push(`The ${SLOT_LABELS[mostConsistent].toLowerCase()} check is your most consistent — logged ${slots[mostConsistent].logged} of ${daysLogged} days.`);
  }
  if (checksCount > 0) {
    insights.push(`You logged ${checksCount} energy check${checksCount !== 1 ? 's' : ''} in the last 7 days.`);
  }

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
  const analysis = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const entries: EnergyEntry[] = raw ? JSON.parse(raw) : [];
      return buildAnalysis(entries);
    } catch {
      return null;
    }
  }, []);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const sectionIds = ['contributors', 'penalties', 'insights', 'recommendations'];

  if (!analysis) {
    return (
      <EmptyState
        icon={Battery}
        text="Log your energy at the 8am, 12pm and 4pm checks — an analysis of your peak hours, consistency and what to change will build here from your last two weeks of logs."
      />
    );
  }

  const score = analysis.overallScore;
  const trendLabel = analysis.trend === 'improving' ? 'Improving' : analysis.trend === 'declining' ? 'Declining' : 'Steady';
  const trendTone = analysis.trend === 'improving' ? 'text-emerald-600' : analysis.trend === 'declining' ? 'text-red-600' : 'text-muted-foreground';

  return (
    <div className="space-y-3">
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
          <p className="text-[11px] font-bold text-foreground uppercase tracking-wide">Energy Analysis</p>
          <p className="text-xs text-muted-foreground leading-snug mt-1">
            {analysis.daysLogged} of the last 7 days logged · {analysis.checksCount} check{analysis.checksCount !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {(['morning', 'midday', 'afternoon'] as Slot[]).map(slot => {
          const s = analysis.slots[slot];
          return (
            <div key={slot} className="rounded-xl border border-border bg-muted/30 px-2 py-2 text-center">
              <p className="text-[9px] font-black uppercase tracking-wide text-muted-foreground">{SLOT_LABELS[slot]}</p>
              <p className="text-sm font-black text-foreground mt-0.5">{s.logged > 0 ? `${fmt(s.avg)}/3` : '—'}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{s.logged > 0 ? `${s.logged} logged` : 'No logs'}</p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {analysis.contributors.length} positive · {analysis.penalties.length} negative{' '}
          · <span className={trendTone}>trend {trendLabel}</span>
        </p>
        <CollapseAllToggle ids={sectionIds} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>

      <div className="space-y-1.5">
        <CollapsibleRow
          id="contributors"
          expanded={expanded.includes('contributors')}
          onToggle={() => toggle('contributors')}
          title="What's helping"
          subtitle={`${analysis.contributors.length} positive factor${analysis.contributors.length !== 1 ? 's' : ''}`}
          tone="ok"
          badge={analysis.contributors.length > 0 ? <span className="shrink-0 text-[10px] font-bold text-emerald-600">{analysis.contributors.length}</span> : undefined}
        >
          {analysis.contributors.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">Nothing stands out as a strength yet — keep logging and a peak window will show up here.</p>
          ) : (
            analysis.contributors.map((text, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
                <span className="text-foreground leading-relaxed">{text}</span>
              </div>
            ))
          )}
        </CollapsibleRow>

        <CollapsibleRow
          id="penalties"
          expanded={expanded.includes('penalties')}
          onToggle={() => toggle('penalties')}
          title="What's dragging it down"
          subtitle={`${analysis.penalties.length} negative factor${analysis.penalties.length !== 1 ? 's' : ''}`}
          tone="bad"
          badge={analysis.penalties.length > 0 ? <span className="shrink-0 text-[10px] font-bold text-red-600">{analysis.penalties.length}</span> : undefined}
        >
          {analysis.penalties.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">No major energy issues detected — your pattern is stable and usable.</p>
          ) : (
            analysis.penalties.map((text, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-red-500" />
                <span className="text-foreground leading-relaxed">{text}</span>
              </div>
            ))
          )}
        </CollapsibleRow>

        <CollapsibleRow
          id="insights"
          expanded={expanded.includes('insights')}
          onToggle={() => toggle('insights')}
          title="Key insights"
          subtitle={`${analysis.insights.length} insight${analysis.insights.length !== 1 ? 's' : ''}`}
          tone="neutral"
        >
          {analysis.insights.map((text, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-primary" />
              <span className="text-foreground leading-relaxed">{text}</span>
            </div>
          ))}
        </CollapsibleRow>

        <CollapsibleRow
          id="recommendations"
          expanded={expanded.includes('recommendations')}
          onToggle={() => toggle('recommendations')}
          title="Recommendations"
          subtitle={`${analysis.recommendations.length} suggested action${analysis.recommendations.length !== 1 ? 's' : ''}`}
          tone="neutral"
        >
          {analysis.recommendations.map((text, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="mt-1 text-primary font-bold">→</span>
              <span className="text-foreground leading-relaxed">{text}</span>
            </div>
          ))}
        </CollapsibleRow>
      </div>
    </div>
  );
}