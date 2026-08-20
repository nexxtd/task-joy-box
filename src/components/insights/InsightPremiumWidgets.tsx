import { useMemo } from 'react';
import { CheckCircle2, AlertTriangle, Layers, FolderOpen, CalendarDays, Bot, Gauge, RefreshCw, BarChart } from 'lucide-react';
import { Task, Column } from '@/types/board';
import {
  DoneCtx, dueEnd, formatDate, formatDuration, formatHours, daysSince,
  buildCompletionTrend, trendExplanation, buildAvgCompletion, buildBusiest, buildProjectComparison,
  buildSubtaskHealth, buildReport, ReportMetric,
} from './insightData';
import {
  InsightWidget, useExpanded, CollapseAllToggle, CollapsibleRow, EmptyState, FactLine, PctBar,
  PRIORITY_COLORS,
} from './InsightWidgets';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function MiniBars({ values, color = 'hsl(var(--primary))', active }: { values: number[]; color?: string; active?: number }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[2px] h-16">
      {values.map((v, i) => (
        <div key={i} className="flex-1 flex items-end h-full" title={`${v} completed`}>
          <div
            className="w-full rounded-t-sm transition-all duration-300"
            style={{
              height: v > 0 ? `${Math.max(8, (v / max) * 100)}%` : '3px',
              background: active != null && i === active ? color : active != null ? `${color}26` : v > 0 ? color : 'hsl(var(--muted-foreground) / 0.25)',
            }}
          />
        </div>
      ))}
    </div>
  );
}

export interface AiWidgetsData {
  loading: boolean;
  error: string | null;
  bottlenecks: Array<{ id: string; reason: string; suggestion?: string }> | null;
  score: { score: number; summary: string; focusAreas: string[] } | null;
  onRetry: () => void;
}

export interface AiScoreData {
  loading: boolean;
  error: string | null;
  data: {
    overallScore: number;
    scoreRationale?: string;
    contributors?: Array<{ id: string; text: string }>;
    penalties?: Array<{ id: string; text: string }>;
    insights?: string[];
    recommendations?: string[];
  } | null;
  onRetry: () => void;
}

// ---------------------------------------------------------------------------
// 7. Completion Trend (30-Day)
// ---------------------------------------------------------------------------

export function CompletionTrendBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const data = useMemo(() => buildCompletionTrend(tasks, ctx), [tasks, ctx]);
  const { expanded: expDays, toggle: toggleDay } = useExpanded([]);
  const { expanded: expWeeks, toggle: toggleWeek, expandAll, collapseAll } = useExpanded([]);
  const total = data.days.reduce((s, d) => s + d.count, 0);
  const peakIdx = data.days.reduce((pi, d, i) => (d.count > data.days[pi].count ? i : pi), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{total} completed in the last 30 days</p>
        <CollapseAllToggle ids={data.weeks.map(w => w.weekLabel)} expanded={expWeeks} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      <MiniBars values={data.days.map(d => d.count)} active={peakIdx} />
      {total === 0 ? (
        <EmptyState icon={Layers} text="No completions in the last 30 days. Complete a task and the trend will start building here." />
      ) : (
        <div className="space-y-1.5">
          {data.weeks.map(w => (
            <CollapsibleRow
              key={w.weekLabel}
              id={w.weekLabel}
              expanded={expWeeks.includes(w.weekLabel)}
              onToggle={() => toggleWeek(w.weekLabel)}
              title={`Week of ${w.weekLabel}`}
              subtitle={w.count > 0 ? `${w.count} task${w.count > 1 ? 's' : ''} completed` : 'No completions this week'}
              tone={w.count === 0 ? 'neutral' : 'ok'}
              badge={<span className="shrink-0 text-[10px] font-bold text-primary">{w.count}</span>}
            >
              <div className="space-y-1.5">
                {w.days.map((d, di) => {
                  const prev = di > 0 ? w.days[di - 1].count : 0;
                  const explanation = trendExplanation(d, prev);
                  return (
                    <CollapsibleRow
                      key={d.label}
                      id={d.label}
                      expanded={expDays.includes(d.label)}
                      onToggle={() => toggleDay(d.label)}
                      title={d.label}
                      subtitle={d.count > 0 ? `${d.count} completed` : 'No completions'}
                      tone={d.count > 0 ? 'ok' : 'neutral'}
                      badge={d.count > 0 ? <span className="shrink-0 text-[10px] font-bold text-primary">{d.count}</span> : undefined}
                    >
                      <p className="text-xs text-muted-foreground leading-relaxed">{explanation}</p>
                      {d.tasks.length > 0 && (
                        <div className="space-y-0.5 pt-1">
                          {d.tasks.map(t => (
                            <div key={t.id} className="flex items-center gap-2 text-xs">
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                              <span className="flex-1 min-w-0 text-foreground truncate">{t.title}</span>
                              {t.projectName && <span className="text-[10px] text-muted-foreground shrink-0">{t.projectName}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </CollapsibleRow>
                  );
                })}
              </div>
            </CollapsibleRow>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. Average Completion Time
// ---------------------------------------------------------------------------

export function AvgCompletionTimeBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const data = useMemo(() => buildAvgCompletion(tasks, ctx), [tasks, ctx]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Average completion</span>
        <span className="text-base font-black text-foreground">{formatHours(data.overallHours)}</span>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{data.groups.reduce((s, g) => s + g.tasks.length, 0)} completed tasks measured</p>
        <CollapseAllToggle ids={data.groups.map(g => g.priority)} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {data.groups.length === 0 ? (
        <EmptyState icon={AlertTriangle} text="No completed tasks with dates yet. Complete a few tasks and their actual completion time will appear here." />
      ) : (
        <div className="space-y-1.5">
          {data.groups.map(g => (
            <CollapsibleRow
              key={g.priority}
              id={g.priority}
              expanded={expanded.includes(g.priority)}
              onToggle={() => toggle(g.priority)}
              title={`${g.label}`}
              subtitle={`${g.tasks.length} task${g.tasks.length > 1 ? 's' : ''} · avg ${formatHours(g.avgHours)}`}
              badge={<span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: PRIORITY_COLORS[g.priority] }}>{g.tasks.length}</span>}
            >
              {g.tasks.slice(0, 10).map(t => (
                <div key={t.id} className="rounded-lg px-2 py-1.5" style={{ background: 'hsl(var(--muted) / 0.25)' }}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex-1 min-w-0 text-foreground truncate font-medium">{t.title}</span>
                    <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${t.verdict === 'on' ? 'bg-emerald-500/15 text-emerald-600' : t.verdict === 'over' ? 'bg-red-500/15 text-red-600' : 'bg-muted text-muted-foreground'}`}>
                      {t.verdict === 'on' ? 'on estimate' : t.verdict === 'over' ? 'over estimate' : 'under estimate'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground mt-1">
                    <span>Actual: <span className="font-semibold text-foreground">{formatHours(t.actualHours)}</span></span>
                    <span>Estimate: <span className="font-semibold text-foreground">{t.estimateMinutes ? formatDuration(t.estimateMinutes) : '—'}</span></span>
                    <span>{t.deltaLabel}</span>
                  </div>
                </div>
              ))}
            </CollapsibleRow>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 9. Busiest Days & Times
// ---------------------------------------------------------------------------

export function BusiestDaysBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const entries = useMemo(() => buildBusiest(tasks, ctx), [tasks, ctx]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const total = entries.reduce((s, e) => s + e.count, 0);
  const peak = entries[0];
  const maxCount = entries.reduce((m, e) => Math.max(m, e.count), 1);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {total} completions{peak && peak.count > 0 ? ` · peak on ${peak.label}` : ''}
        </p>
        <CollapseAllToggle ids={entries.map(e => String(e.weekday))} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {total === 0 ? (
        <EmptyState icon={CalendarDays} text="No completed tasks with timestamps yet. Complete tasks to reveal your real work patterns." />
      ) : (
        <div className="space-y-1.5">
          {entries.filter(e => e.count > 0).map(e => {
            const avgHour = Math.round(e.tasks.reduce((s, t) => s + t.hour, 0) / e.tasks.length);
            return (
              <CollapsibleRow
                key={e.weekday}
                id={String(e.weekday)}
                expanded={expanded.includes(String(e.weekday))}
                onToggle={() => toggle(String(e.weekday))}
                title={e.label}
                subtitle={`${e.count} completed · typically ${avgHour < 5 ? 'late night' : avgHour < 12 ? 'morning' : avgHour < 17 ? 'afternoon' : 'evening'}`}
                tone={e.count >= maxCount * 0.6 ? 'ok' : 'neutral'}
                badge={<span className="shrink-0 text-[10px] font-bold text-primary">{e.count}</span>}
              >
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {e.count === peak?.count ? `Your busiest day — ${e.count} of this week's ${total} completions happened here.` : `${e.count} completions landed on ${e.label}.`}
                </p>
                {e.tasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                    <span className="flex-1 min-w-0 text-foreground truncate">{t.title}</span>
                    {t.projectName && <span className="text-[10px] text-muted-foreground shrink-0">{t.projectName}</span>}
                    <span className="text-[10px] text-muted-foreground shrink-0">{t.timeLabel}</span>
                  </div>
                ))}
              </CollapsibleRow>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 10. Multi-Project Comparison
// ---------------------------------------------------------------------------

export function MultiProjectBody({ tasks, columns, ctx }: { tasks: Task[]; columns: Column[]; ctx: DoneCtx }) {
  const projects = useMemo(() => buildProjectComparison(tasks, columns, ctx), [tasks, columns, ctx]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const avgPct = projects.length > 0 ? Math.round(projects.reduce((s, p) => s + p.completionPct, 0) / projects.length) : 0;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{projects.length} project{projects.length !== 1 ? 's' : ''} compared · average {avgPct}%</p>
        <CollapseAllToggle ids={projects.map(p => String(p.id))} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {projects.length === 0 ? (
        <EmptyState icon={FolderOpen} text="Need at least two projects to compare. Create more projects and assign tasks to them." />
      ) : (
        <div className="space-y-1.5">
          {projects.map(p => (
            <CollapsibleRow
              key={p.id}
              id={String(p.id)}
              expanded={expanded.includes(String(p.id))}
              onToggle={() => toggle(String(p.id))}
              title={p.name}
              subtitle={`${p.total} tasks · ${p.done} done · avg ${formatHours(p.avgHours)}`}
              tone={p.vsAvgPct >= 0 ? 'ok' : 'bad'}
              badge={
                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${p.vsAvgPct >= 0 ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600'}`}>
                  {p.vsAvgPct >= 0 ? '+' : ''}{p.vsAvgPct}% vs avg
                </span>
              }
            >
              <FactLine label="Completion" value={`${p.completionPct}% (${p.done}/${p.total})`} tone={p.vsAvgPct >= 0 ? 'ok' : 'bad'} />
              <FactLine label="vs projects" value={`${p.vsAvgPct >= 0 ? '+' : ''}${p.vsAvgPct} points vs the ${avgPct}% average`} tone={p.vsAvgPct >= 0 ? 'ok' : 'bad'} />
              <FactLine label="Avg completion time" value={`${formatHours(p.avgHours)}${p.vsAvgHours !== 0 ? ` (${p.vsAvgHours > 0 ? '+' : ''}${p.vsAvgHours}h vs average)` : ''}`} tone={p.vsAvgHours > 0 ? 'warn' : 'ok'} />
              <FactLine label="Overdue" value={p.overdue > 0 ? `${p.overdue} task${p.overdue > 1 ? 's' : ''} past due` : 'None'} tone={p.overdue > 0 ? 'warn' : 'ok'} />
              <p className="text-xs text-muted-foreground leading-relaxed pt-1">{p.verdict}</p>
              <div className="pt-1">
                <PctBar pct={p.completionPct} color={p.color} />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">{p.completionPct}% complete</span>
                  <span className="text-[10px] text-muted-foreground">avg {avgPct}%</span>
                </div>
              </div>
            </CollapsibleRow>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 11. Sub-task & Checklist Health
// ---------------------------------------------------------------------------

export function SubtaskHealthBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const entries = useMemo(() => buildSubtaskHealth(tasks, ctx), [tasks, ctx]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const stalledCount = entries.filter(e => e.stalled).length;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {entries.length} tasks with breakdowns{stalledCount > 0 ? ` · ${stalledCount} stalled` : ''}
        </p>
        <CollapseAllToggle ids={entries.map(e => e.id)} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {entries.length === 0 ? (
        <EmptyState icon={Layers} text="No tasks with sub-tasks or checklist items yet. Break a task down and progress tracking will appear here." />
      ) : (
        <div className="space-y-1.5">
          {entries.map(e => (
            <CollapsibleRow
              key={e.id}
              id={e.id}
              expanded={expanded.includes(e.id)}
              onToggle={() => toggle(e.id)}
              title={e.title}
              subtitle={`${e.statusLabel} · ${e.subtaskTotal > 0 ? `${e.subDone}/${e.subtaskTotal} sub-tasks` : ''}${e.subtaskTotal > 0 && e.checklistTotal > 0 ? ' · ' : ''}${e.checklistTotal > 0 ? `${e.checklistDone}/${e.checklistTotal} checklist` : ''} · last activity ${e.lastTouchedDays == null ? '—' : e.lastTouchedDays === 0 ? 'today' : `${e.lastTouchedDays}d ago`}`}
              tone={e.stalled ? 'bad' : e.pct === 100 ? 'ok' : e.pct === 0 ? 'warn' : 'neutral'}
              badge={
                e.stalled ? (
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600">Stalled</span>
                ) : e.pct === 100 ? (
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">Done</span>
                ) : e.pct != null ? (
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{e.pct}%</span>
                ) : undefined
              }
            >
              <p className="text-xs text-muted-foreground leading-relaxed">{e.reasoning}</p>
              <FactLine label="Sub-tasks" value={e.subtaskTotal > 0 ? `${e.subDone}/${e.subtaskTotal} done` : 'None'} tone={e.subtaskTotal > 0 && e.subDone === e.subtaskTotal ? 'ok' : 'neutral'} />
              <FactLine label="Checklist" value={e.checklistTotal > 0 ? `${e.checklistDone}/${e.checklistTotal} done` : 'None'} tone={e.checklistTotal > 0 && e.checklistDone === e.checklistTotal ? 'ok' : 'neutral'} />
              <FactLine label="Progress" value={e.pct == null ? 'No breakdown' : `${e.doneItems}/${e.totalItems} items (${e.pct}%)`} tone={e.pct === 100 ? 'ok' : 'neutral'} />
              {e.suggestion && <p className="text-xs font-semibold text-primary pt-0.5">Next step: {e.suggestion}</p>}
            </CollapsibleRow>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 12. Custom Report Builder
// ---------------------------------------------------------------------------

export function CustomReportBody({
  widget, tasks, ctx, onUpdate,
}: {
  widget: InsightWidget;
  tasks: Task[];
  ctx: DoneCtx;
  onUpdate: (patch: Partial<InsightWidget>) => void;
}) {
  const metric = widget.metric || 'completed';
  const range = widget.range || 14;
  const data = useMemo(() => buildReport(tasks, ctx, metric, range), [tasks, ctx, metric, range]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const total = data.reduce((s, d) => s + d.count, 0);
  const metricLabel = metric === 'created' ? 'Created' : metric === 'checklist' ? 'Checklist items done' : 'Completed';

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <Select value={metric} onValueChange={v => onUpdate({ metric: v as ReportMetric })}>
          <SelectTrigger className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground h-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="created">Created</SelectItem>
            <SelectItem value="checklist">Checklist items</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(range)} onValueChange={v => onUpdate({ range: Number(v) })}>
          <SelectTrigger className="rounded-lg px-2 py-1.5 text-xs font-medium text-foreground h-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="14">14 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{total} {metricLabel.toLowerCase()} in {range} days</p>
        <CollapseAllToggle ids={data.map(d => d.key)} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>

      {total === 0 ? (
        <EmptyState icon={BarChart} text={`No ${metricLabel.toLowerCase()} in this range yet. Pick a different metric or range to explore.`} />
      ) : (
        <div className="space-y-1.5">
          {data.filter(d => d.count > 0).map(d => (
            <CollapsibleRow
              key={d.key}
              id={d.key}
              expanded={expanded.includes(d.key)}
              onToggle={() => toggle(d.key)}
              title={d.label}
              subtitle={d.count > 0 ? `${d.count} ${metricLabel.toLowerCase()}` : 'Nothing'}
              tone={d.count > 0 ? 'ok' : 'neutral'}
              badge={<span className="shrink-0 text-[10px] font-bold text-primary">{d.count}</span>}
            >
              <div className="space-y-0.5">
                {d.items.slice(0, 10).map(item => (
                  <div key={item.id} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                    <span className="flex-1 min-w-0 text-foreground truncate">{item.title}</span>
                  </div>
                ))}
                {d.items.length > 10 && (
                  <p className="text-[10px] text-muted-foreground">+{d.items.length - 10} more on this day</p>
                )}
              </div>
            </CollapsibleRow>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 13. AI Bottleneck Detector
// ---------------------------------------------------------------------------

export function AiBottlenecksBody({ tasks, aiData }: { tasks: Task[]; aiData: AiWidgetsData }) {
  const bottlenecks = aiData.bottlenecks;

  if (aiData.loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
        <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground">AI is scanning for bottlenecks…</p>
      </div>
    );
  }
  if (aiData.error) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
        <AlertTriangle className="w-6 h-6 text-destructive" />
        <p className="text-xs text-muted-foreground max-w-[240px] leading-snug">{aiData.error}</p>
        <button onClick={aiData.onRetry} className="text-[11px] font-bold text-primary hover:underline">Try again</button>
      </div>
    );
  }
  if (bottlenecks === null) {
    return <EmptyState icon={Bot} text="Run the analysis to find tasks that are quietly stalling." />;
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{bottlenecks.length} stalling task{bottlenecks.length !== 1 ? 's' : ''} flagged</p>
        <button onClick={aiData.onRetry} className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      {bottlenecks.length === 0 ? (
        <EmptyState icon={CheckCircle2} text="No bottlenecks detected — the AI found no tasks that appear to be stalling." />
      ) : (
        <div className="space-y-1.5">
          {bottlenecks.map(b => {
            const task = tasks.find(t => String(t.id) === String(b.id));
            return (
              <div key={b.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-red-500/20 bg-red-500/5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate flex-1">{task?.title || 'Task'}</span>
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600">Bottleneck</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 14. AI Productivity Score & Insights
// ---------------------------------------------------------------------------

export function AiScoreBody({ scoreData }: { scoreData: AiScoreData }) {
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const d = scoreData.data;

  if (scoreData.loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
        <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground">AI is scoring your productivity…</p>
      </div>
    );
  }
  if (scoreData.error) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
        <AlertTriangle className="w-6 h-6 text-destructive" />
        <p className="text-xs text-muted-foreground max-w-[240px] leading-snug">{scoreData.error}</p>
        <button onClick={scoreData.onRetry} className="text-[11px] font-bold text-primary hover:underline">Try again</button>
      </div>
    );
  }
  if (!d) {
    return <EmptyState icon={Gauge} text="Run the analysis to see your AI productivity score and what is driving it." />;
  }

  const contributors = d.contributors || [];
  const penalties = d.penalties || [];
  const insights = d.insights || [];
  const recommendations = d.recommendations || [];
  const sectionIds = ['contributors', 'penalties', 'insights', 'recommendations'];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 flex-shrink-0">
          <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" strokeWidth="9" style={{ stroke: 'hsl(var(--muted) / 0.5)' }} />
            <circle
              cx="40" cy="40" r="32" fill="none" strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${Math.max(0, Math.min(100, d.overallScore)) * 2.01} 201`}
              style={{ stroke: d.overallScore >= 70 ? 'hsl(var(--label-green))' : d.overallScore >= 40 ? 'hsl(var(--label-yellow))' : 'hsl(var(--label-red))' }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-black text-foreground">{d.overallScore}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-foreground uppercase tracking-wide">AI Productivity Score</p>
          {d.scoreRationale && <p className="text-xs text-muted-foreground leading-snug mt-1">{d.scoreRationale}</p>}
        </div>
        <button onClick={scoreData.onRetry} className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{contributors.length} positive · {penalties.length} negative</p>
        <CollapseAllToggle ids={sectionIds} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>

      <div className="space-y-1.5">
        <CollapsibleRow
          id="contributors"
          expanded={expanded.includes('contributors')}
          onToggle={() => toggle('contributors')}
          title="What's helping"
          subtitle={`${contributors.length} contributing factor${contributors.length !== 1 ? 's' : ''}`}
          tone="ok"
          badge={contributors.length > 0 ? <span className="shrink-0 text-[10px] font-bold text-emerald-600">{contributors.length}</span> : undefined}
        >
          {contributors.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">Nothing positive to report yet — the score is held up entirely by a clean (non-overdue) workload.</p>
          ) : (
            contributors.map(c => (
              <div key={c.id} className="flex items-start gap-2 text-xs">
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-emerald-500" />
                <span className="text-foreground leading-relaxed">{c.text}</span>
              </div>
            ))
          )}
        </CollapsibleRow>

        <CollapsibleRow
          id="penalties"
          expanded={expanded.includes('penalties')}
          onToggle={() => toggle('penalties')}
          title="What's dragging it down"
          subtitle={`${penalties.length} negative factor${penalties.length !== 1 ? 's' : ''}`}
          tone="bad"
          badge={penalties.length > 0 ? <span className="shrink-0 text-[10px] font-bold text-red-600">{penalties.length}</span> : undefined}
        >
          {penalties.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">Nothing critical is dragging the score down right now.</p>
          ) : (
            penalties.map(c => (
              <div key={c.id} className="flex items-start gap-2 text-xs">
                <span className="mt-1 w-1.5 h-1.5 rounded-full shrink-0 bg-red-500" />
                <span className="text-foreground leading-relaxed">{c.text}</span>
              </div>
            ))
          )}
        </CollapsibleRow>

        <CollapsibleRow
          id="insights"
          expanded={expanded.includes('insights')}
          onToggle={() => toggle('insights')}
          title="Key insights"
          subtitle={`${insights.length} insight${insights.length !== 1 ? 's' : ''}`}
          tone="neutral"
        >
          {insights.map((text, i) => (
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
          subtitle={`${recommendations.length} suggested action${recommendations.length !== 1 ? 's' : ''}`}
          tone="neutral"
        >
          {recommendations.map((text, i) => (
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
