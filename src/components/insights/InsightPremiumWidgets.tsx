import { useMemo } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { CheckCircle2, AlertTriangle, Layers, FolderOpen, CalendarDays, Bot, Gauge, RefreshCw, BarChart } from 'lucide-react';
import { Task, Column } from '@/types/board';
import {
  DoneCtx, formatDuration, formatHours,
  buildCompletionTrend, trendExplanation, buildAvgCompletion, buildBusiest, buildProjectComparison,
  buildSubtaskHealth, buildReport, ReportMetric,
} from './insightData';
import {
  InsightWidget, useExpanded, CollapseAllToggle, CollapsibleRow, EmptyState, FactLine, PctBar,
  PRIORITY_COLORS,
} from './InsightWidgets';
import { WidgetInsightBlock } from './WidgetInsightBlock';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function MiniBars({ values, color = 'hsl(var(--primary))', active }: { values: number[]; color?: string; active?: number }) {
  const { t } = useLanguage();
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[2px] h-16">
      {values.map((v, i) => (
        <div key={i} className="flex-1 flex items-end h-full" title={t('{{count}} completed', { count: v })}>
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
  const { language, t } = useLanguage();
  const data = useMemo(() => buildCompletionTrend(tasks, ctx), [tasks, ctx, language]);
  const { expanded: expDays, toggle: toggleDay } = useExpanded([]);
  const { expanded: expWeeks, toggle: toggleWeek, expandAll, collapseAll } = useExpanded([]);
  const total = data.days.reduce((s, d) => s + d.count, 0);
  const peakIdx = data.days.reduce((pi, d, i) => (d.count > data.days[pi].count ? i : pi), 0);
  const peakDay = data.days[peakIdx];
  const activeDays = data.days.filter(d => d.count > 0).length;
  const last7 = data.days.slice(-7).reduce((s, d) => s + d.count, 0);
  const prev7 = data.days.slice(-14, -7).reduce((s, d) => s + d.count, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{t('{{count}} completed in the last 30 days', { count: total })}</p>
        <CollapseAllToggle ids={data.weeks.map(w => w.weekLabel)} expanded={expWeeks} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      <MiniBars values={data.days.map(d => d.count)} active={peakIdx} />
      {total === 0 ? (
        <EmptyState icon={Layers} text={t('No completions in the last 30 days. Complete a task and the trend will start building here.')} />
      ) : (
        <>
          <div className="space-y-1.5">
            {data.weeks.map(w => (
              <CollapsibleRow
                key={w.weekLabel}
                id={w.weekLabel}
                expanded={expWeeks.includes(w.weekLabel)}
                onToggle={() => toggleWeek(w.weekLabel)}
                title={t('Week of {{range}}', { range: w.weekLabel })}
                subtitle={w.count > 0 ? t('{{count}} task(s) completed', { count: w.count }) : t('No completions this week')}
                tone={w.count === 0 ? 'neutral' : 'ok'}
                badge={<span className="shrink-0 text-[10px] font-bold text-primary">{w.count}</span>}
              >
                <div className="space-y-1.5">
                  {w.days.map((d, di) => {
                    const prev = di > 0 ? w.days[di - 1].count : 0;
                    const explanation = trendExplanation(d, prev, t);
                    return (
                      <CollapsibleRow
                        key={d.label}
                        id={d.label}
                        expanded={expDays.includes(d.label)}
                        onToggle={() => toggleDay(d.label)}
                        title={d.label}
                        subtitle={d.count > 0 ? t('{{count}} completed', { count: d.count }) : t('No completions')}
                        tone={d.count > 0 ? 'ok' : 'neutral'}
                        badge={d.count > 0 ? <span className="shrink-0 text-[10px] font-bold text-primary">{d.count}</span> : undefined}
                      >
                        <p className="text-xs text-muted-foreground leading-relaxed">{explanation}</p>
                        {d.tasks.length > 0 && (
                          <div className="space-y-0.5 pt-1">
                            {d.tasks.map(item => (
                              <div key={item.id} className="flex items-center gap-2 text-xs">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                                <span className="flex-1 min-w-0 text-foreground truncate">{item.title}</span>
                                {item.projectName && <span className="text-[10px] text-muted-foreground shrink-0">{item.projectName}</span>}
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

          <WidgetInsightBlock
            heading={t('Velocity')}
            summary={t('Completed {{total}} tasks in 30 days across {{days}} active days; peak on {{peakDate}} ({{peakCount}}).', {
              total,
              days: activeDays,
              peakDate: peakDay?.label || '—',
              peakCount: peakDay?.count || 0,
            })}
            detail={t('Recent 7-day pace: {{last7}} completed vs {{prev7}} in the prior 7 days.', { last7, prev7 })}
            action={last7 >= prev7
              ? t('Output trajectory is holding or accelerating — maintain your current daily focus blocks.')
              : t('Recent weekly throughput cooled slightly — pick one high-impact task to close early tomorrow.')}
            actionLabel={t('Next action')}
            tone="primary"
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 8. Average Completion Time
// ---------------------------------------------------------------------------

export function AvgCompletionTimeBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const { language, t } = useLanguage();
  const data = useMemo(() => buildAvgCompletion(tasks, ctx, t), [tasks, ctx, language, t]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const allItems = data.groups.flatMap(g => g.tasks);
  const measuredCount = allItems.length;
  const withEst = allItems.filter(i => Boolean(i.estimateMinutes));
  const overCount = withEst.filter(i => i.verdict === 'over').length;
  const slowestGroup = [...data.groups].sort((a, b) => b.avgHours - a.avgHours)[0];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t('Average completion')}</span>
        <span className="text-base font-black text-foreground">{formatHours(data.overallHours)}</span>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{t('{{count}} completed task(s) measured', { count: measuredCount })}</p>
        <CollapseAllToggle ids={data.groups.map(g => g.priority)} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {data.groups.length === 0 ? (
        <EmptyState icon={AlertTriangle} text={t('No completed tasks with dates yet. Complete a few tasks and their actual completion time will appear here.')} />
      ) : (
        <>
          <div className="space-y-1.5">
            {data.groups.map(g => (
              <CollapsibleRow
                key={g.priority}
                id={g.priority}
                expanded={expanded.includes(g.priority)}
                onToggle={() => toggle(g.priority)}
                title={g.label}
                subtitle={t('{{count}} task(s) · avg {{avg}}', { count: g.tasks.length, avg: formatHours(g.avgHours) })}
                badge={<span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: PRIORITY_COLORS[g.priority] }}>{g.tasks.length}</span>}
              >
                {g.tasks.slice(0, 10).map(item => (
                  <div key={item.id} className="rounded-lg px-2 py-1.5" style={{ background: 'hsl(var(--muted) / 0.25)' }}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex-1 min-w-0 text-foreground truncate font-medium">{item.title}</span>
                      <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${item.verdict === 'on' ? 'bg-emerald-500/15 text-emerald-600' : item.verdict === 'over' ? 'bg-red-500/15 text-red-600' : 'bg-muted text-muted-foreground'}`}>
                        {item.verdict === 'on' ? t('on estimate') : item.verdict === 'over' ? t('over estimate') : t('under estimate')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground mt-1">
                      <span>{t('Actual')}: <span className="font-semibold text-foreground">{formatHours(item.actualHours)}</span></span>
                      <span>{t('Estimate')}: <span className="font-semibold text-foreground">{item.estimateMinutes ? formatDuration(item.estimateMinutes) : '—'}</span></span>
                      <span>{item.deltaLabel}</span>
                    </div>
                  </div>
                ))}
              </CollapsibleRow>
            ))}
          </div>

          <WidgetInsightBlock
            heading={t('Velocity')}
            summary={t('Average turnaround is {{overall}} across {{count}} completed tasks; {{over}}/{{est}} estimated tasks ran over budget.', {
              overall: formatHours(data.overallHours),
              count: measuredCount,
              over: overCount,
              est: withEst.length,
            })}
            detail={slowestGroup ? t('Slowest turnaround priority: {{label}} averaging {{avg}}.', {
              label: slowestGroup.label,
              avg: formatHours(slowestGroup.avgHours),
            }) : undefined}
            action={overCount > 0
              ? t('Add a 25–50% time buffer on complex tasks and split multi-hour deliverables earlier.')
              : t('Time estimates align well with actual delivery — keep using duration budgets for daily capacity planning.')}
            actionLabel={t('Next action')}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 9. Busiest Days & Times
// ---------------------------------------------------------------------------

export function BusiestDaysBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const { language, t } = useLanguage();
  const entries = useMemo(() => buildBusiest(tasks, ctx), [tasks, ctx, language]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const total = entries.reduce((s, e) => s + e.count, 0);
  const peak = entries[0];
  const maxCount = entries.reduce((m, e) => Math.max(m, e.count), 1);
  const activeWeekdays = entries.filter(e => e.count > 0);
  const quietDays = 7 - activeWeekdays.length;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {peak && peak.count > 0
            ? t('{{count}} completions · peak on {{day}}', { count: total, day: peak.label })
            : t('{{count}} completions', { count: total })}
        </p>
        <CollapseAllToggle ids={entries.map(e => String(e.weekday))} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {total === 0 ? (
        <EmptyState icon={CalendarDays} text={t('No completed tasks with timestamps yet. Complete tasks to reveal your real work patterns.')} />
      ) : (
        <>
          <div className="space-y-1.5">
            {activeWeekdays.map(e => {
              const avgHour = Math.round(e.tasks.reduce((s, item) => s + item.hour, 0) / e.tasks.length);
              const periodKey = avgHour < 5 ? 'late night' : avgHour < 12 ? 'morning' : avgHour < 17 ? 'afternoon' : 'evening';
              return (
                <CollapsibleRow
                  key={e.weekday}
                  id={String(e.weekday)}
                  expanded={expanded.includes(String(e.weekday))}
                  onToggle={() => toggle(String(e.weekday))}
                  title={e.label}
                  subtitle={t('{{count}} completed · typically {{period}}', { count: e.count, period: t(periodKey) })}
                  tone={e.count >= maxCount * 0.6 ? 'ok' : 'neutral'}
                  badge={<span className="shrink-0 text-[10px] font-bold text-primary">{e.count}</span>}
                >
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {e.count === peak?.count
                      ? t('Your busiest day — {{count}} of {{total}} completions happened here.', { count: e.count, total })
                      : t('{{count}} completions landed on {{day}}.', { count: e.count, day: e.label })}
                  </p>
                  {e.tasks.map(item => (
                    <div key={item.id} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                      <span className="flex-1 min-w-0 text-foreground truncate">{item.title}</span>
                      {item.projectName && <span className="text-[10px] text-muted-foreground shrink-0">{item.projectName}</span>}
                      <span className="text-[10px] text-muted-foreground shrink-0">{item.timeLabel}</span>
                    </div>
                  ))}
                </CollapsibleRow>
              );
            })}
          </div>

          <WidgetInsightBlock
            heading={t('Pattern')}
            summary={t('Most closures happen on {{day}} ({{peakCount}}/{{total}}); {{active}} of 7 weekdays record completed work.', {
              day: peak?.label || '—',
              peakCount: peak?.count || 0,
              total,
              active: activeWeekdays.length,
            })}
            detail={quietDays > 0 ? t('{{quiet}} weekday(s) currently show zero logged completions.', { quiet: quietDays }) : undefined}
            action={t('Schedule your hardest deep-work deliverables on {{day}} while using quieter days for planning and cleanup.', { day: peak?.label || '' })}
            actionLabel={t('Next action')}
            tone="primary"
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 10. Multi-Project Comparison
// ---------------------------------------------------------------------------

export function MultiProjectBody({ tasks, columns, ctx }: { tasks: Task[]; columns: Column[]; ctx: DoneCtx }) {
  const { language, t } = useLanguage();
  const projects = useMemo(() => buildProjectComparison(tasks, columns, ctx, t), [tasks, columns, ctx, language, t]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const avgPct = projects.length > 0 ? Math.round(projects.reduce((s, p) => s + p.completionPct, 0) / projects.length) : 0;
  const leader = projects[projects.length - 1];
  const trailer = projects[0];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{t('{{count}} project(s) compared · average {{avg}}%', { count: projects.length, avg: avgPct })}</p>
        <CollapseAllToggle ids={projects.map(p => String(p.id))} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {projects.length === 0 ? (
        <EmptyState icon={FolderOpen} text={t('Need at least two projects to compare. Create more projects and assign tasks to them.')} />
      ) : (
        <>
          <div className="space-y-1.5">
            {projects.map(p => (
              <CollapsibleRow
                key={p.id}
                id={String(p.id)}
                expanded={expanded.includes(String(p.id))}
                onToggle={() => toggle(String(p.id))}
                title={p.name}
                subtitle={t('{{total}} tasks · {{done}} done · avg {{avg}}', { total: p.total, done: p.done, avg: formatHours(p.avgHours) })}
                tone={p.vsAvgPct >= 0 ? 'ok' : 'bad'}
                badge={
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${p.vsAvgPct >= 0 ? 'bg-emerald-500/15 text-emerald-600' : 'bg-red-500/15 text-red-600'}`}>
                    {t('{{delta}}% vs avg', { delta: `${p.vsAvgPct >= 0 ? '+' : ''}${p.vsAvgPct}` })}
                  </span>
                }
              >
                <FactLine label={t('Completion')} value={`${p.completionPct}% (${p.done}/${p.total})`} tone={p.vsAvgPct >= 0 ? 'ok' : 'bad'} />
                <FactLine
                  label={t('vs projects')}
                  value={t('{{delta}} pts vs {{avg}}% avg', { delta: `${p.vsAvgPct >= 0 ? '+' : ''}${p.vsAvgPct}`, avg: avgPct })}
                  tone={p.vsAvgPct >= 0 ? 'ok' : 'bad'}
                />
                <FactLine
                  label={t('Avg completion time')}
                  value={`${formatHours(p.avgHours)}${p.vsAvgHours !== 0 ? ` (${p.vsAvgHours > 0 ? '+' : ''}${p.vsAvgHours}h)` : ''}`}
                  tone={p.vsAvgHours > 0 ? 'warn' : 'ok'}
                />
                <FactLine
                  label={t('Overdue')}
                  value={p.overdue > 0 ? t('{{count}} overdue', { count: p.overdue }) : t('None')}
                  tone={p.overdue > 0 ? 'warn' : 'ok'}
                />
                <p className="text-xs text-muted-foreground leading-relaxed pt-1">{p.verdict}</p>
                <div className="pt-1">
                  <PctBar pct={p.completionPct} color={p.color} />
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">{t('{{pct}}% complete', { pct: p.completionPct })}</span>
                    <span className="text-[10px] text-muted-foreground">{t('avg {{pct}}%', { pct: avgPct })}</span>
                  </div>
                </div>
              </CollapsibleRow>
            ))}
          </div>

          {leader && trailer && (
            <WidgetInsightBlock
              heading={t('Breakdown')}
              summary={t('Leading project: {{leader}} ({{leaderPct}}%) vs trailing: {{trailer}} ({{trailerPct}}%) — {{spread}}-point completion spread.', {
                leader: leader.name,
                leaderPct: leader.completionPct,
                trailer: trailer.name,
                trailerPct: trailer.completionPct,
                spread: Math.max(0, leader.completionPct - trailer.completionPct),
              })}
              action={trailer.overdue > 0
                ? t('Shift focus toward {{trailer}} first to clear {{count}} overdue deliverable(s).', { trailer: trailer.name, count: trailer.overdue })
                : t('Rebalance upcoming task intake toward {{trailer}} to narrow the completion gap.', { trailer: trailer.name })}
              actionLabel={t('Next action')}
              tone={trailer.overdue > 0 ? 'warning' : 'neutral'}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 11. Sub-task & Checklist Health
// ---------------------------------------------------------------------------

export function SubtaskHealthBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const { language, t } = useLanguage();
  const entries = useMemo(() => buildSubtaskHealth(tasks, ctx, t), [tasks, ctx, language, t]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const stalledCount = entries.filter(e => e.stalled).length;
  const readyToClose = entries.filter(e => e.pct === 100).length;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {t('{{count}} tasks with breakdowns', { count: entries.length })}
          {stalledCount > 0 ? ` · ${t('{{count}} stalled', { count: stalledCount })}` : ''}
        </p>
        <CollapseAllToggle ids={entries.map(e => e.id)} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {entries.length === 0 ? (
        <EmptyState icon={Layers} text={t('No tasks with sub-tasks or checklist items yet. Break a task down and progress tracking will appear here.')} />
      ) : (
        <>
          <div className="space-y-1.5">
            {entries.map(e => (
              <CollapsibleRow
                key={e.id}
                id={e.id}
                expanded={expanded.includes(e.id)}
                onToggle={() => toggle(e.id)}
                title={e.title}
                subtitle={[
                  e.statusLabel,
                  e.subtaskTotal > 0 ? `${e.subDone}/${e.subtaskTotal} ${t('sub-tasks')}` : '',
                  e.checklistTotal > 0 ? `${e.checklistDone}/${e.checklistTotal} ${t('checklist')}` : '',
                  e.lastTouchedDays == null ? '—' : e.lastTouchedDays === 0 ? t('today') : t('{{days}}d ago', { days: e.lastTouchedDays }),
                ].filter(Boolean).join(' · ')}
                tone={e.stalled ? 'bad' : e.pct === 100 ? 'ok' : e.pct === 0 ? 'warn' : 'neutral'}
                badge={
                  e.stalled ? (
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600">{t('Stalled')}</span>
                  ) : e.pct === 100 ? (
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600">{t('Done')}</span>
                  ) : e.pct != null ? (
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">{e.pct}%</span>
                  ) : undefined
                }
              >
                <p className="text-xs text-muted-foreground leading-relaxed">{e.reasoning}</p>
                <FactLine
                  label={t('Sub-tasks')}
                  value={e.subtaskTotal > 0 ? t('{{done}}/{{total}} done', { done: e.subDone, total: e.subtaskTotal }) : t('None')}
                  tone={e.subtaskTotal > 0 && e.subDone === e.subtaskTotal ? 'ok' : 'neutral'}
                />
                <FactLine
                  label={t('Checklist')}
                  value={e.checklistTotal > 0 ? t('{{done}}/{{total}} done', { done: e.checklistDone, total: e.checklistTotal }) : t('None')}
                  tone={e.checklistTotal > 0 && e.checklistDone === e.checklistTotal ? 'ok' : 'neutral'}
                />
                <FactLine
                  label={t('Progress')}
                  value={e.pct == null ? t('No breakdown') : `${e.doneItems}/${e.totalItems} (${e.pct}%)`}
                  tone={e.pct === 100 ? 'ok' : 'neutral'}
                />
                {e.suggestion && <p className="text-xs font-semibold text-primary pt-0.5">{t('Next action')}: {e.suggestion}</p>}
              </CollapsibleRow>
            ))}
          </div>

          <WidgetInsightBlock
            heading={t('Breakdown')}
            summary={t('{{total}} broken-down active tasks tracked: {{stalled}} stalled 7+ days and {{ready}} at 100% sub-item completion.', {
              total: entries.length,
              stalled: stalledCount,
              ready: readyToClose,
            })}
            action={readyToClose > 0
              ? t('Mark the {{count}} 100%-complete task(s) done right away and restart or drop stalled items.', { count: readyToClose })
              : stalledCount > 0
                ? t('Pick one stalled task to either break into a 10-minute first step or archive cleanly.')
                : t('Keep checking off intermediate subtasks to maintain visible progress toward closure.')}
            actionLabel={t('Next action')}
            tone={stalledCount > 0 ? 'warning' : 'neutral'}
          />
        </>
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
  const { language, t } = useLanguage();
  const metric = widget.metric || 'completed';
  const range = widget.range || 14;
  const data = useMemo(() => buildReport(tasks, ctx, metric, range), [tasks, ctx, metric, range, language]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const total = data.reduce((s, d) => s + d.count, 0);
  const activeDays = data.filter(d => d.count > 0).length;
  const peakEntry = [...data].sort((a, b) => b.count - a.count)[0];
  const metricLabel = metric === 'created'
    ? t('Created')
    : metric === 'checklist'
      ? t('Checklist items')
      : t('Completed');

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <Select value={metric} onValueChange={v => onUpdate({ metric: v as ReportMetric })}>
          <SelectTrigger className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground h-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="completed">{t('Completed')}</SelectItem>
            <SelectItem value="created">{t('Created')}</SelectItem>
            <SelectItem value="checklist">{t('Checklist items')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(range)} onValueChange={v => onUpdate({ range: Number(v) })}>
          <SelectTrigger className="rounded-lg px-2 py-1.5 text-xs font-medium text-foreground h-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">{t('{{days}} days', { days: 7 })}</SelectItem>
            <SelectItem value="14">{t('{{days}} days', { days: 14 })}</SelectItem>
            <SelectItem value="30">{t('{{days}} days', { days: 30 })}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {t('{{count}} in {{days}} days · {{metric}}', { count: total, days: range, metric: metricLabel })}
        </p>
        <CollapseAllToggle ids={data.map(d => d.key)} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>

      {total === 0 ? (
        <EmptyState icon={BarChart} text={t('No entries in this range yet. Pick a different metric or timeframe to explore.')} />
      ) : (
        <>
          <div className="space-y-1.5">
            {data.filter(d => d.count > 0).map(d => (
              <CollapsibleRow
                key={d.key}
                id={d.key}
                expanded={expanded.includes(d.key)}
                onToggle={() => toggle(d.key)}
                title={d.label}
                subtitle={`${d.count} · ${metricLabel}`}
                tone="ok"
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
                    <p className="text-[10px] text-muted-foreground">{t('+{{count}} more on this day', { count: d.items.length - 10 })}</p>
                  )}
                </div>
              </CollapsibleRow>
            ))}
          </div>

          <WidgetInsightBlock
            heading={t('Breakdown')}
            summary={t('Recorded {{total}} entries across {{active}} of {{range}} days (avg {{avg}}/day).', {
              total,
              active: activeDays,
              range,
              avg: (total / range).toFixed(1),
            })}
            detail={peakEntry && peakEntry.count > 0 ? t('Peak day: {{day}} with {{count}} logged.', { day: peakEntry.label, count: peakEntry.count }) : undefined}
            action={t('Compare Completed vs Created over the same {{days}}-day window to spot scope creep early.', { days: range })}
            actionLabel={t('Next action')}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 13. AI Bottleneck Detector
// ---------------------------------------------------------------------------

export function AiBottlenecksBody({ tasks, aiData }: { tasks: Task[]; aiData: AiWidgetsData }) {
  const { t } = useLanguage();
  const bottlenecks = aiData.bottlenecks;

  if (aiData.loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
        <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground">{t('AI is scanning for bottlenecks…')}</p>
      </div>
    );
  }
  if (aiData.error) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
        <AlertTriangle className="w-6 h-6 text-destructive" />
        <p className="text-xs text-muted-foreground max-w-[240px] leading-snug">{aiData.error}</p>
        <button onClick={aiData.onRetry} className="text-[11px] font-bold text-primary hover:underline">{t('Try again')}</button>
      </div>
    );
  }
  if (bottlenecks === null) {
    return <EmptyState icon={Bot} text={t('Run the analysis to find tasks that are quietly stalling.')} />;
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{t('{{count}} stalling task(s) flagged', { count: bottlenecks.length })}</p>
        <button onClick={aiData.onRetry} className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="w-3 h-3" /> {t('Refresh')}
        </button>
      </div>
      {bottlenecks.length === 0 ? (
        <EmptyState icon={CheckCircle2} text={t('No bottlenecks detected — the AI found no tasks that appear to be stalling.')} />
      ) : (
        <div className="space-y-1.5">
          {bottlenecks.map(b => {
            const task = tasks.find(item => String(item.id) === String(b.id));
            return (
              <div key={b.id} className="px-3 py-2.5 rounded-xl border border-red-500/20 bg-red-500/5 space-y-1">
                <div className="flex items-center gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span className="text-xs font-semibold text-foreground truncate flex-1">{task?.title || t('Task')}</span>
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-600">{t('Bottleneck')}</span>
                </div>
                {b.reason && <p className="text-[11px] text-muted-foreground leading-relaxed pl-4">{b.reason}</p>}
                {b.suggestion && <p className="text-[11px] font-medium text-primary leading-relaxed pl-4">{t('Next action')}: {b.suggestion}</p>}
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
  const { t } = useLanguage();
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const d = scoreData.data;

  if (scoreData.loading) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
        <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground">{t('AI is scoring your productivity…')}</p>
      </div>
    );
  }
  if (scoreData.error) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
        <AlertTriangle className="w-6 h-6 text-destructive" />
        <p className="text-xs text-muted-foreground max-w-[240px] leading-snug">{scoreData.error}</p>
        <button onClick={scoreData.onRetry} className="text-[11px] font-bold text-primary hover:underline">{t('Try again')}</button>
      </div>
    );
  }
  if (!d) {
    return <EmptyState icon={Gauge} text={t('Run the analysis to see your AI productivity score and what is driving it.')} />;
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
          <p className="text-[11px] font-bold text-foreground uppercase tracking-wide">{t('AI Productivity Score')}</p>
          {d.scoreRationale && <p className="text-xs text-muted-foreground leading-snug mt-1">{d.scoreRationale}</p>}
        </div>
        <button onClick={scoreData.onRetry} className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <RefreshCw className="w-3 h-3" /> {t('Refresh')}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {t('{{pos}} positive · {{neg}} negative', { pos: contributors.length, neg: penalties.length })}
        </p>
        <CollapseAllToggle ids={sectionIds} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>

      <div className="space-y-1.5">
        <CollapsibleRow
          id="contributors"
          expanded={expanded.includes('contributors')}
          onToggle={() => toggle('contributors')}
          title={t("What's helping")}
          subtitle={`${contributors.length} ${t(contributors.length === 1 ? 'positive factor' : 'positive factors')}`}
          tone="ok"
          badge={contributors.length > 0 ? <span className="shrink-0 text-[10px] font-bold text-emerald-600">{contributors.length}</span> : undefined}
        >
          {contributors.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">{t('Nothing positive to report yet — keep closing tasks and preventing overdue deadlines.')}</p>
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
          title={t("What's dragging it down")}
          subtitle={`${penalties.length} ${t(penalties.length === 1 ? 'negative factor' : 'negative factors')}`}
          tone="bad"
          badge={penalties.length > 0 ? <span className="shrink-0 text-[10px] font-bold text-red-600">{penalties.length}</span> : undefined}
        >
          {penalties.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">{t('No severe penalties detected right now — keep closing prioritized tasks consistently.')}</p>
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
          title={t('Key insights')}
          subtitle={`${insights.length} ${t(insights.length === 1 ? 'insight' : 'insights')}`}
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
          title={t('What to change')}
          subtitle={`${recommendations.length} ${t(recommendations.length === 1 ? 'suggestion' : 'suggestions')}`}
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
