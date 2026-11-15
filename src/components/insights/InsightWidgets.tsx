import { dateLocale } from '@/i18n/format';
import { useState, useMemo } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { CheckCircle2, AlertTriangle, Layers, Tag, FolderOpen, CalendarDays, StickyNote } from 'lucide-react';
import { Task, Column, Priority } from '@/types/board';
import { useNotesContext } from '@/context/NotesContext';
import {
  DoneCtx, isTaskDone, dueEnd, formatDate, formatDuration, PRIORITY_LABEL, ReportMetric,
  buildCompletionOverview, buildOverdue, buildPriorityGroups, buildWeeklyActivity,
  buildProjects, buildTags,
} from './insightData';
import { WidgetInsightBlock } from './WidgetInsightBlock';

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------

export type InsightWidgetType =
  | 'completion-overview' | 'active-vs-overdue' | 'tasks-by-priority' | 'weekly-activity'
  | 'project-breakdown' | 'tags-overview' | 'completion-trend' | 'avg-completion-time'
  | 'busiest-days-times' | 'multi-project-comparison' | 'subtask-checklist-health'
  | 'custom-report' | 'energy-insights' | 'ai-bottlenecks' | 'ai-score' | 'notes-overview';

export interface InsightWidget {
  id: string;
  type: InsightWidgetType;
  title: string;
  col: number;
  row: number;
  w: number;
  h: number;
  metric?: ReportMetric;
  range?: number;
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
  none: '#9ca3af',
};

export function useExpanded(initial: string[] = []) {
  const [expanded, setExpanded] = useState<string[]>(initial);
  const toggle = (id: string) =>
    setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const expandAll = (ids: string[]) => setExpanded(ids);
  const collapseAll = () => setExpanded([]);
  return { expanded, toggle, expandAll, collapseAll, setExpanded };
}

export function CollapseAllToggle({
  ids, expanded, expandAll, collapseAll,
}: {
  ids: string[];
  expanded: string[];
  expandAll: (ids: string[]) => void;
  collapseAll: () => void;
}) {
  const { t } = useLanguage();
  if (ids.length === 0) return null;
  const allExpanded = ids.every(id => expanded.includes(id));
  return (
    <button
      onClick={() => (allExpanded ? collapseAll() : expandAll(ids))}
      className="shrink-0 text-[11px] font-semibold text-label-pink hover:underline"
    >
      {allExpanded ? t('Collapse all') : t('Expand all')}
    </button>
  );
}

const TONE_DOT: Record<string, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  bad: 'bg-red-500',
  neutral: 'bg-muted-foreground/60',
};

export function CollapsibleRow({
  id, expanded, onToggle, title, subtitle, badge, children,
}: {
  id: string;
  expanded: boolean;
  onToggle: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  tone?: 'ok' | 'warn' | 'bad' | 'neutral';
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground truncate">{title}</span>
          {subtitle && <span className="block text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</span>}
        </span>
        {badge}
      </button>
      {expanded && <div className="px-3 pb-3 pt-0.5 space-y-1.5">{children}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
      <Icon className="w-7 h-7 opacity-40 text-muted-foreground" />
      <p className="text-xs text-muted-foreground max-w-[240px] leading-snug">{text}</p>
    </div>
  );
}

export function FactLine({ label, value, tone = 'neutral' }: { label: string; value: React.ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'neutral' }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[tone]}`} />
      <span className="text-foreground text-xs"><span className="font-semibold">{label}:</span> {value}</span>
    </div>
  );
}

export function PctBar({ pct, color = 'hsl(var(--primary))' }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted) / 0.6)' }}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
    </div>
  );
}

export const openTaskTarget = '/tasks';

// ---------------------------------------------------------------------------
// 1. Completion Overview
// ---------------------------------------------------------------------------

function CompletionOverviewBody({ widget, tasks, ctx, onUpdate }: {
  widget: InsightWidget;
  tasks: Task[];
  ctx: DoneCtx;
  onUpdate: (patch: Partial<InsightWidget> & Record<string, unknown>) => void;
}) {
  const { t, language } = useLanguage();
  const range = Math.max(7, Math.min(90, widget.range || 30));
  const data = useMemo(() => buildCompletionOverview(tasks, ctx, range, t), [tasks, ctx, range, language, t]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);

  const ids = ['completed', 'open'];
  const openCreated = data.createdInPeriod.filter(item => !item.completed);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {[7, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => onUpdate({ range: d })}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors ${range === d ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`}
          >
            {t('{{days}}d', { days: d })}
          </button>
        ))}
        <div className="flex-1" />
        <CollapseAllToggle ids={ids} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg" style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('Total')}</p>
          <p className="text-lg font-black text-foreground mt-0.5">{data.total}</p>
        </div>
        <div className="p-2.5 rounded-lg" style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('Completed')}</p>
          <p className="text-lg font-black text-emerald-600 mt-0.5">{data.completed}</p>
        </div>
        <div className="p-2.5 rounded-lg" style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t('Active')}</p>
          <p className="text-lg font-black text-orange-500 mt-0.5">{data.active}</p>
        </div>
      </div>

      <WidgetInsightBlock
        heading={t("What's driving it")}
        summary={data.explanation}
        detail={t('Window activity ({{days}}d): {{done}} completed vs {{created}} created ({{rate}}% completion rate).', {
          days: range,
          done: data.completedInPeriod.length,
          created: data.createdInPeriod.length,
          rate: data.completionRate,
        })}
        action={data.active > 0
          ? t('Close the oldest active items added in this window before taking on unprioritized work.')
          : t('Add your next milestone deliverables with clear due dates to sustain steady progress.')}
        actionLabel={t('Next action')}
        tone="primary"
        chips={[
          { label: `${data.completionRate}% ${t('Completion')}`, tone: data.completionRate >= 60 ? 'ok' : 'warn' },
          { label: `${data.active} ${t('Active')}`, tone: data.active > 0 ? 'warn' : 'ok' },
        ]}
      />

      <div className="space-y-1.5">
        <CollapsibleRow
          id="completed"
          expanded={expanded.includes('completed')}
          onToggle={() => toggle('completed')}
          title={t('Completed in period ({{count}})', { count: data.completedInPeriod.length })}
          badge={data.completedInPeriod.length > 0 ? <span className="text-[10px] font-semibold text-muted-foreground">{data.completionRate}%</span> : undefined}
          tone={data.completedInPeriod.length > 0 ? 'ok' : 'neutral'}
        >
          {data.completedInPeriod.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">{t('Nothing was completed in the last {{days}} days.', { days: range })}</p>
          ) : (
            data.completedInPeriod.slice(0, 12).map(item => (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                <span className="flex-1 min-w-0 text-foreground truncate">{item.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatDate(item.when)}</span>
              </div>
            ))
          )}
        </CollapsibleRow>

        <CollapsibleRow
          id="open"
          expanded={expanded.includes('open')}
          onToggle={() => toggle('open')}
          title={t('Added but still open ({{count}})', { count: openCreated.length })}
          tone={data.active > 0 ? 'warn' : 'ok'}
        >
          {openCreated.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">{t('Everything added in the period has been completed.')}</p>
          ) : (
            openCreated.slice(0, 12).map(item => (
              <div key={item.id} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIORITY_COLORS[item.priority] }} />
                <span className="flex-1 min-w-0 text-foreground truncate">{item.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{t('added {{date}}', { date: formatDate(item.when) })}</span>
              </div>
            ))
          )}
        </CollapsibleRow>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Active vs Overdue
// ---------------------------------------------------------------------------

function ActiveVsOverdueBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const { t, language } = useLanguage();
  const overdue = useMemo(() => buildOverdue(tasks, ctx, t), [tasks, ctx, language, t]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const criticalCount = overdue.filter(o => o.daysOverdue >= 7).length;
  const maxDaysOverdue = overdue.reduce((m, o) => Math.max(m, o.daysOverdue), 0);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-white bg-red-500/90 rounded-full px-2.5 py-1">
          {t('{{count}} Overdue', { count: overdue.length })}
        </span>
        <div className="flex-1" />
        <CollapseAllToggle ids={overdue.map(o => o.id)} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>

      {overdue.length === 0 ? (
        <EmptyState icon={CheckCircle2} text={t('All caught up — no overdue tasks. Nothing is being dragged down by missed deadlines.')} />
      ) : (
        <>
          <div className="space-y-1.5">
            {overdue.map(o => (
              <CollapsibleRow
                key={o.id}
                id={o.id}
                expanded={expanded.includes(o.id)}
                onToggle={() => toggle(o.id)}
                title={o.title}
                subtitle={`${formatDate(o.dueDate)} · ${o.projectName || t('No project')}`}
                badge={
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${o.daysOverdue >= 7 ? 'bg-destructive' : 'bg-label-orange'}`}>
                    {t('{{days}}d overdue', { days: o.daysOverdue })}
                  </span>
                }
              >
                <p className="text-xs text-muted-foreground leading-relaxed">{o.reasoning}</p>
                <FactLine label={t('Priority')} value={t(PRIORITY_LABEL[o.priority])} />
                <FactLine label={t('Due')} value={`${formatDate(o.dueDate)}${o.dueTime ? ` · ${o.dueTime}` : ''}`} tone="neutral" />
                <FactLine
                  label={t('Why it matters')}
                  value={o.daysOverdue >= 7
                    ? t('Every day overdue lowers closure odds — re-date or complete it this week.')
                    : t('Every day overdue lowers closure odds — re-date or finish it within 48 hours.')}
                  tone="warn"
                />
              </CollapsibleRow>
            ))}
          </div>

          <WidgetInsightBlock
            heading={t('Schedule health')}
            summary={t('{{count}} overdue task(s) need triage ({{critical}} stalled 7+ days, oldest slip {{maxDays}}d).', {
              count: overdue.length,
              critical: criticalCount,
              maxDays: maxDaysOverdue,
            })}
            action={t('Knock out the shortest overdue item first and set realistic target dates on blocked work.')}
            actionLabel={t('Next action')}
            tone="danger"
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Tasks by Priority
// ---------------------------------------------------------------------------

function TasksByPriorityBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const { t, language } = useLanguage();
  const groups = useMemo(() => buildPriorityGroups(tasks, ctx, t), [tasks, ctx, language, t]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const totalActive = groups.reduce((s, g) => s + g.count, 0);
  const urgentHigh = groups.filter(g => g.priority === 'urgent' || g.priority === 'high').reduce((s, g) => s + g.count, 0);
  const totalMinutes = groups.reduce((s, g) => s + g.totalMinutes, 0);
  const dominant = [...groups].sort((a, b) => b.count - a.count)[0];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{t('{{count}} active task(s) grouped by priority', { count: totalActive })}</p>
        <CollapseAllToggle ids={groups.map(g => g.priority)} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {groups.length === 0 ? (
        <EmptyState icon={Layers} text={t('No prioritized active tasks. Tag tasks with a priority to see them grouped here.')} />
      ) : (
        <>
          <div className="space-y-1.5">
            {groups.map(g => (
              <CollapsibleRow
                key={g.priority}
                id={g.priority}
                expanded={expanded.includes(g.priority)}
                onToggle={() => toggle(g.priority)}
                title={g.label}
                subtitle={g.totalMinutes > 0
                  ? t('~{{duration}} estimated · {{count}} task(s)', { duration: formatDuration(g.totalMinutes), count: g.count })
                  : t('{{count}} task(s)', { count: g.count })}
                tone={g.priority === 'urgent' || g.priority === 'high' ? 'warn' : 'neutral'}
                badge={<span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: PRIORITY_COLORS[g.priority] }}>{g.count}</span>}
              >
                {g.tasks.map(item => {
                  const due = dueEnd(item);
                  const isOver = due && due.getTime() < Date.now();
                  return (
                    <div key={item.id} className="flex items-center gap-2 text-xs py-0.5">
                      <span className="flex-1 min-w-0 text-foreground truncate">{item.title}</span>
                      {isOver && <span className="text-[9px] font-bold text-red-500 shrink-0">{t('Overdue')}</span>}
                      <span className="text-[10px] text-muted-foreground shrink-0">{due ? formatDate(item.dueDate) : t('No due date')}</span>
                    </div>
                  );
                })}
              </CollapsibleRow>
            ))}
          </div>

          <WidgetInsightBlock
            heading={t('Workload mix')}
            summary={t('{{urgent}} of {{total}} active task(s) ({{pct}}%) sit in Urgent/High priority.', {
              urgent: urgentHigh,
              total: totalActive,
              pct: totalActive > 0 ? Math.round((urgentHigh / totalActive) * 100) : 0,
            })}
            detail={dominant ? t('Largest priority group: {{label}} ({{count}} task(s){{est}}).', {
              label: dominant.label,
              count: dominant.count,
              est: totalMinutes > 0 ? `, ~${formatDuration(totalMinutes)}` : '',
            }) : undefined}
            action={urgentHigh > 0
              ? t('Protect focus blocks for urgent/high work before picking up lower-priority backlog items.')
              : t('Tag high-leverage tasks with priorities and time estimates to sharpen daily triage.')}
            actionLabel={t('Next action')}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Weekly Activity
// ---------------------------------------------------------------------------

function WeeklyActivityBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const { t, language } = useLanguage();
  const days = useMemo(() => buildWeeklyActivity(tasks, ctx), [tasks, ctx, language]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const total = days.reduce((s, d) => s + d.count, 0);
  const maxCount = Math.max(...days.map(d => d.count), 1);
  const activeDays = days.filter(d => d.count > 0).length;
  const peak = [...days].sort((a, b) => b.count - a.count)[0];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{t('{{count}} task(s) completed this week', { count: total })}</p>
        <CollapseAllToggle ids={days.map(d => String(d.dayIndex))} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {total === 0 ? (
        <EmptyState icon={CalendarDays} text={t('Nothing completed this week yet. Complete a task and it will show up here.')} />
      ) : (
        <>
          <div className="space-y-1.5">
            {days.map(d => (
              <CollapsibleRow
                key={d.dayIndex}
                id={String(d.dayIndex)}
                expanded={expanded.includes(String(d.dayIndex))}
                onToggle={() => toggle(String(d.dayIndex))}
                title={`${d.label} · ${d.dateLabel}`}
                subtitle={d.count > 0 ? t('{{count}} completed', { count: d.count }) : t('No completions')}
                tone={d.count === 0 ? 'neutral' : d.count >= maxCount * 0.6 ? 'ok' : 'neutral'}
                badge={d.count > 0 ? <span className="text-[10px] font-bold text-primary shrink-0">{d.count}</span> : undefined}
              >
                {d.tasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-1">{t('Nothing was completed on this day.')}</p>
                ) : (
                  d.tasks.map(item => {
                    const dt = item.completedAt ? new Date(item.completedAt) : null;
                    const timeStr = dt && !Number.isNaN(dt.getTime())
                      ? dt.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' })
                      : '';
                    return (
                      <div key={item.id} className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                        <span className="flex-1 min-w-0 text-foreground truncate">{item.title}</span>
                        {timeStr && <span className="text-[10px] text-muted-foreground shrink-0">{timeStr}</span>}
                      </div>
                    );
                  })
                )}
              </CollapsibleRow>
            ))}
          </div>

          <WidgetInsightBlock
            heading={t('Velocity')}
            summary={t('Closed {{total}} task(s) across {{days}} active day(s) this week (avg {{avg}}/day).', {
              total,
              days: activeDays,
              avg: (total / 7).toFixed(1),
            })}
            detail={peak ? t('Strongest day: {{day}} ({{date}}) with {{count}} completed.', {
              day: peak.label,
              date: peak.dateLabel,
              count: peak.count,
            }) : undefined}
            action={activeDays < 4
              ? t('Aim to close at least one small deliverable daily so progress does not bunch into one day.')
              : t('Steady multi-day cadence — protect the same focus window that drove your peak day.')}
            actionLabel={t('Next action')}
            tone="primary"
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Project Breakdown
// ---------------------------------------------------------------------------

function ProjectBreakdownBody({ tasks, columns, ctx }: { tasks: Task[]; columns: Column[]; ctx: DoneCtx }) {
  const { t, language } = useLanguage();
  const projects = useMemo(() => buildProjects(tasks, columns, ctx, t), [tasks, columns, ctx, language, t]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const maxPct = Math.max(...projects.map(p => p.completionPct), 1);
  const atRiskCount = projects.filter(p => p.statusTone !== 'ok').length;
  const overdueSum = projects.reduce((s, p) => s + p.overdue, 0);
  const topLagging = projects[0];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{t('{{count}} active project(s)', { count: projects.length })}</p>
        <CollapseAllToggle ids={projects.map(p => String(p.id))} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {projects.length === 0 ? (
        <EmptyState icon={FolderOpen} text={t('No projects yet. Create a project and assign tasks to it to see its breakdown here.')} />
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
                subtitle={`${t('{{total}} tasks · {{done}} done', { total: p.total, done: p.done })}${p.overdue > 0 ? ` · ${t('{{count}} overdue', { count: p.overdue })}` : ''}`}
                tone={p.statusTone}
                badge={
                  <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${p.statusTone === 'ok' ? 'bg-emerald-500/15 text-emerald-600' : p.statusTone === 'warn' ? 'bg-amber-500/15 text-amber-600' : 'bg-red-500/15 text-red-600'}`}>
                    {p.completionPct}% · {p.status}
                  </span>
                }
              >
                <PctBar pct={(p.completionPct / maxPct) * 100} color={p.color} />
                <FactLine label={t('Completion')} value={`${p.completionPct}% (${p.done}/${p.total})`} tone={p.statusTone} />
                <FactLine
                  label={t('Status')}
                  value={p.overdue > 0
                    ? t('{{count}} overdue item(s) in this project are pulling down completion.', { count: p.overdue })
                    : p.completionPct >= 50
                      ? t('On track with steady milestone completion across open tasks.')
                      : t('Early stage — most project deliverables remain open.')}
                  tone={p.statusTone}
                />
                {p.tasks.slice(0, 10).map(item => (
                  <div key={item.id} className="flex items-center gap-2 text-xs">
                    {item.done
                      ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                      : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIORITY_COLORS[item.priority] }} />}
                    <span className={`flex-1 min-w-0 truncate ${item.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{item.title}</span>
                  </div>
                ))}
              </CollapsibleRow>
            ))}
          </div>

          <WidgetInsightBlock
            heading={t('Breakdown')}
            summary={t('{{atRisk}} project(s) under 30% completion and {{overdue}} overdue project items need focused unblocking; top lagging project: {{top}} ({{pct}}%).', {
              atRisk: atRiskCount,
              overdue: overdueSum,
              top: topLagging.name,
              pct: topLagging.completionPct,
            })}
            action={topLagging.overdue > 0
              ? t('Resolve overdue tasks inside {{name}} before adding new subtasks elsewhere.', { name: topLagging.name })
              : t('Schedule one dedicated block for {{name}} to raise overall project parity.', { name: topLagging.name })}
            actionLabel={t('Next action')}
            tone={overdueSum > 0 ? 'warning' : 'neutral'}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. Tags Overview
// ---------------------------------------------------------------------------

function TagsOverviewBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const { t, language } = useLanguage();
  const tags = useMemo(() => buildTags(tasks, ctx), [tasks, ctx, language]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const topTag = tags[0];
  const openTagged = tags.reduce((s, tag) => s + tag.openCount, 0);
  const totalTagged = tags.reduce((s, tag) => s + tag.count, 0);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{t('{{count}} tag(s) in use', { count: tags.length })}</p>
        <CollapseAllToggle ids={tags.map(tag => tag.id)} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {tags.length === 0 ? (
        <EmptyState icon={Tag} text={t('No tags yet. Add tags to your tasks and they will be grouped here.')} />
      ) : (
        <>
          <div className="space-y-1.5">
            {tags.slice(0, 12).map(tag => (
              <CollapsibleRow
                key={tag.id}
                id={tag.id}
                expanded={expanded.includes(tag.id)}
                onToggle={() => toggle(tag.id)}
                title={
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: `hsl(var(--label-${tag.color}))` }} />
                    {tag.name}
                  </span>
                }
                subtitle={t('{{count}} task(s) · {{open}} open', { count: tag.count, open: tag.openCount })}
                badge={<span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: `hsl(var(--label-${tag.color}))` }}>{tag.count}</span>}
              >
                {tag.tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-2 text-xs">
                    {isTaskDone(task, ctx)
                      ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                      : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIORITY_COLORS[task.priority] }} />}
                    <span className={`flex-1 min-w-0 truncate ${isTaskDone(task, ctx) ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{task.title}</span>
                    {task.projectName && <span className="text-[10px] text-muted-foreground shrink-0">{task.projectName}</span>}
                  </div>
                ))}
              </CollapsibleRow>
            ))}
          </div>

          <WidgetInsightBlock
            heading={t('Breakdown')}
            summary={t('Top tag "{{name}}" spans {{count}} task(s) ({{open}} open) across {{tags}} active labels.', {
              name: topTag.name,
              count: topTag.count,
              open: topTag.openCount,
              tags: tags.length,
            })}
            detail={t('{{open}}/{{total}} tagged assignments remain incomplete.', { open: openTagged, total: totalTagged })}
            action={openTagged > 0
              ? t('Batch similar open tasks under "{{name}}" into one focused sprint to reduce switching costs.', { name: topTag.name })
              : t('All tagged work is complete — keep labeling new tasks by category to spot themes.')}
            actionLabel={t('Next action')}
          />
        </>
      )}
    </div>
  );
}

function NotesOverviewBody() {
  const { t, language } = useLanguage();
  const { board } = useNotesContext();
  const notes = board.tasks || [];
  const recent = useMemo(
    () => [...notes].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 8),
    [notes],
  );
  const recentWeek = notes.filter(n => n.createdAt && (Date.now() - new Date(n.createdAt).getTime()) <= 7 * 86400000).length;
  const withMedia = notes.filter(n => (n.attachments?.length || 0) > 0 || (n.images?.length || 0) > 0).length;
  const withChecklists = notes.filter(n => (n.checklists?.length || 0) > 0).length;

  if (notes.length === 0) return <EmptyState icon={StickyNote} text={t('No notes yet. Create a note to see it here.')} />;
  return (
    <div className="space-y-2.5" data-lang={language}>
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-foreground bg-muted/60 border border-border rounded-full px-2.5 py-1">
          {t('{{count}} notes', { count: notes.length })}
        </span>
        <span className="text-[11px] text-muted-foreground">{t('{{count}} recent', { count: recent.length })}</span>
      </div>
      <div className="space-y-1.5">
        {recent.map(n => (
          <div key={n.id} className="p-2 rounded-lg" style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
            <p className="text-xs font-medium text-foreground truncate">{n.title || t('Untitled note')}</p>
            {n.description && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{n.description.slice(0, 80)}</p>}
            <p className="text-[10px] text-muted-foreground mt-1">{n.createdAt ? new Date(n.createdAt).toLocaleDateString(dateLocale()) : ''}</p>
          </div>
        ))}
      </div>

      <WidgetInsightBlock
        heading={t('Breakdown')}
        summary={t('Notes library holds {{total}} notes ({{recent}} added this week, {{media}} with files/images, {{checklists}} with checklists). Convert actionable notes into tracked tasks.', {
          total: notes.length,
          recent: recentWeek,
          media: withMedia,
          checklists: withChecklists,
        })}
        action={withChecklists > 0
          ? t('Review checklist notes weekly and move unfinished action items onto your main task board.')
          : t('Add checklists or file attachments to key notes so ideas turn into trackable work.')}
        actionLabel={t('Next action')}
        tone="primary"
      />
    </div>
  );
}

export { CompletionOverviewBody, ActiveVsOverdueBody, TasksByPriorityBody, WeeklyActivityBody, ProjectBreakdownBody, TagsOverviewBody, NotesOverviewBody };
