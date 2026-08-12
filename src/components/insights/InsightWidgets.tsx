import { useState, useMemo, useEffect, useCallback } from 'react';
import { ChevronRight, CheckCircle2, AlertTriangle, Layers, Tag, FolderOpen, CalendarDays, Pencil } from 'lucide-react';
import { Task, Column, Priority, Label, LabelColor, DEFAULT_LABELS } from '@/types/board';
import { fetchTags, createTag, deleteTag, updateTag, type SharedTag } from '@/services/tagService';
import TagsModal from '@/components/shared/TagsModal';
import { useBoardContext } from '@/context/BoardContext';
import {
  DoneCtx, isTaskDone, dueEnd, formatDate, formatDateTime, formatDuration, PRIORITY_LABEL, ReportMetric,
  buildCompletionOverview, buildOverdue, buildPriorityGroups, buildWeeklyActivity,
  buildProjects, buildTags,
} from './insightData';

// ---------------------------------------------------------------------------
// Shared UI
// ---------------------------------------------------------------------------

export type InsightWidgetType =
  | 'completion-overview' | 'active-vs-overdue' | 'tasks-by-priority' | 'weekly-activity'
  | 'project-breakdown' | 'tags-overview' | 'completion-trend' | 'avg-completion-time'
  | 'busiest-days-times' | 'multi-project-comparison' | 'subtask-checklist-health'
  | 'custom-report' | 'ai-bottlenecks' | 'ai-score';

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
  if (ids.length === 0) return null;
  const allExpanded = ids.every(id => expanded.includes(id));
  return (
    <button
      onClick={() => (allExpanded ? collapseAll() : expandAll(ids))}
      className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
    >
      {allExpanded ? 'Collapse all' : 'Expand all'}
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
  id, expanded, onToggle, title, subtitle, badge, tone = 'neutral', children,
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
        <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[tone]}`} />
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
  const range = Math.max(7, Math.min(90, widget.range || 30));
  const data = useMemo(() => buildCompletionOverview(tasks, ctx, range), [tasks, ctx, range]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);

  const ids = ['completed', 'open'];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {[7, 30, 90].map(d => (
          <button
            key={d}
            onClick={() => onUpdate({ range: d })}
            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-colors ${range === d ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:text-foreground'}`}
          >
            {d}d
          </button>
        ))}
        <div className="flex-1" />
        <CollapseAllToggle ids={ids} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="p-2.5 rounded-lg" style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="text-lg font-black text-foreground mt-0.5">{data.total}</p>
        </div>
        <div className="p-2.5 rounded-lg" style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Completed</p>
          <p className="text-lg font-black text-emerald-600 mt-0.5">{data.completed}</p>
        </div>
        <div className="p-2.5 rounded-lg" style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Active</p>
          <p className="text-lg font-black text-orange-500 mt-0.5">{data.active}</p>
        </div>
      </div>

      <div className="px-3 py-2.5 rounded-xl text-xs leading-relaxed text-muted-foreground" style={{ background: 'hsl(var(--primary) / 0.05)', border: '1px solid hsl(var(--primary) / 0.15)' }}>
        <span className="font-bold text-foreground">What's driving it: </span>{data.explanation}
      </div>

      <div className="space-y-1.5">
        <CollapsibleRow
          id="completed"
          expanded={expanded.includes('completed')}
          onToggle={() => toggle('completed')}
          title={`Completed in period (${data.completedInPeriod.length})`}
          badge={data.completedInPeriod.length > 0 ? <span className="text-[10px] font-semibold text-muted-foreground">{data.completionRate}%</span> : undefined}
          tone={data.completedInPeriod.length > 0 ? 'ok' : 'neutral'}
        >
          {data.completedInPeriod.length === 0 ? (
            <p className="text-xs text-muted-foreground py-1">Nothing was completed in the last {range} days.</p>
          ) : (
            data.completedInPeriod.slice(0, 12).map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                <span className="flex-1 min-w-0 text-foreground truncate">{t.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatDate(t.when)}</span>
              </div>
            ))
          )}
        </CollapsibleRow>

        <CollapsibleRow
          id="open"
          expanded={expanded.includes('open')}
          onToggle={() => toggle('open')}
          title={`Added but still open (${data.createdInPeriod.filter(t => !t.completed).length})`}
          tone={data.active > 0 ? 'warn' : 'ok'}
        >
          {data.active === 0 ? (
            <p className="text-xs text-muted-foreground py-1">Everything added in the period has been completed.</p>
          ) : (
            data.createdInPeriod.filter(t => !t.completed).slice(0, 12).map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIORITY_COLORS[t.priority] }} />
                <span className="flex-1 min-w-0 text-foreground truncate">{t.title}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">added {formatDate(t.when)}</span>
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
  const overdue = useMemo(() => buildOverdue(tasks, ctx), [tasks, ctx]);
  const active = useMemo(() => tasks.filter(t => !isTaskDone(t, ctx)).length, [tasks, ctx]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold text-foreground bg-muted/60 border border-border rounded-full px-2.5 py-1">{active} active</span>
        <span className="text-[11px] font-bold text-white bg-red-500/90 rounded-full px-2.5 py-1">{overdue.length} overdue</span>
        <div className="flex-1" />
        <CollapseAllToggle ids={overdue.map(o => o.id)} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>

      {overdue.length === 0 ? (
        <EmptyState icon={CheckCircle2} text="All caught up — no overdue tasks. Nothing is being dragged down by missed deadlines." />
      ) : (
        <div className="space-y-1.5">
          {overdue.map(o => (
            <CollapsibleRow
              key={o.id}
              id={o.id}
              expanded={expanded.includes(o.id)}
              onToggle={() => toggle(o.id)}
              title={o.title}
              subtitle={`Due ${formatDate(o.dueDate)} · ${o.projectName || 'No project'}`}
              tone={o.daysOverdue >= 7 ? 'bad' : 'warn'}
              badge={
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: o.daysOverdue >= 7 ? '#ef4444' : '#f97316' }}>
                  {o.daysOverdue}d overdue
                </span>
              }
            >
              <p className="text-xs text-muted-foreground leading-relaxed">{o.reasoning}</p>
              <FactLine label="Priority" value={PRIORITY_LABEL[o.priority]} />
              <FactLine label="Due" value={`${formatDate(o.dueDate)}${o.dueTime ? ` · ${o.dueTime}` : ''}`} tone="neutral" />
              <FactLine label="Why it matters" value={`Every day overdue lowers the odds it gets finished — ${o.daysOverdue >= 7 ? 're-date it or close it this week.' : 're-date or complete it within 48 hours.'}`} tone="warn" />
            </CollapsibleRow>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Tasks by Priority
// ---------------------------------------------------------------------------

function TasksByPriorityBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const groups = useMemo(() => buildPriorityGroups(tasks, ctx), [tasks, ctx]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{groups.reduce((s, g) => s + g.count, 0)} active tasks with a priority</p>
        <CollapseAllToggle ids={groups.map(g => g.priority)} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {groups.length === 0 ? (
        <EmptyState icon={Layers} text="No prioritized active tasks. Tag tasks with a priority to see them grouped here." />
      ) : (
        <div className="space-y-1.5">
          {groups.map(g => (
            <CollapsibleRow
              key={g.priority}
              id={g.priority}
              expanded={expanded.includes(g.priority)}
              onToggle={() => toggle(g.priority)}
              title={`${g.label}`}
              subtitle={g.totalMinutes > 0 ? `~${formatDuration(g.totalMinutes)} of estimated work` : `${g.count} task${g.count > 1 ? 's' : ''}`}
              tone={g.priority === 'urgent' || g.priority === 'high' ? 'warn' : 'neutral'}
              badge={<span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: PRIORITY_COLORS[g.priority] }}>{g.count}</span>}
            >
              {g.tasks.map(t => {
                const due = dueEnd(t);
                const overdue = due && due.getTime() < Date.now();
                return (
                  <div key={t.id} className="flex items-center gap-2 text-xs py-0.5">
                    <span className="flex-1 min-w-0 text-foreground truncate">{t.title}</span>
                    {overdue && <span className="text-[9px] font-bold text-red-500 shrink-0">overdue</span>}
                    <span className="text-[10px] text-muted-foreground shrink-0">{due ? formatDate(t.dueDate) : 'no date'}</span>
                  </div>
                );
              })}
            </CollapsibleRow>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. Weekly Activity
// ---------------------------------------------------------------------------

function WeeklyActivityBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const days = useMemo(() => buildWeeklyActivity(tasks, ctx), [tasks, ctx]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const total = days.reduce((s, d) => s + d.count, 0);
  const maxCount = Math.max(...days.map(d => d.count), 1);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{total} task{total !== 1 ? 's' : ''} completed this week</p>
        <CollapseAllToggle ids={days.map(d => String(d.dayIndex))} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {total === 0 ? (
        <EmptyState icon={CalendarDays} text="Nothing completed this week yet. Complete a task and it will show up here." />
      ) : (
        <div className="space-y-1.5">
          {days.map(d => (
            <CollapsibleRow
              key={d.dayIndex}
              id={String(d.dayIndex)}
              expanded={expanded.includes(String(d.dayIndex))}
              onToggle={() => toggle(String(d.dayIndex))}
              title={`${d.label} · ${d.dateLabel}`}
              subtitle={d.count > 0 ? `${d.count} completed` : 'No completions'}
              tone={d.count === 0 ? 'neutral' : d.count >= maxCount * 0.6 ? 'ok' : 'neutral'}
              badge={d.count > 0 ? <span className="text-[10px] font-bold text-primary shrink-0">{d.count}</span> : undefined}
            >
              {d.tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground py-1">Nothing was completed on this day.</p>
              ) : (
                d.tasks.map(t => (
                  <div key={t.id} className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                    <span className="flex-1 min-w-0 text-foreground truncate">{t.title}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatDateTime(t.completedAt).split(' · ')[1]}</span>
                  </div>
                ))
              )}
            </CollapsibleRow>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Project Breakdown
// ---------------------------------------------------------------------------

function ProjectBreakdownBody({ tasks, columns, ctx }: { tasks: Task[]; columns: Column[]; ctx: DoneCtx }) {
  const projects = useMemo(() => buildProjects(tasks, columns, ctx), [tasks, columns, ctx]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const maxPct = Math.max(...projects.map(p => p.completionPct), 1);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        <CollapseAllToggle ids={projects.map(p => String(p.id))} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {projects.length === 0 ? (
        <EmptyState icon={FolderOpen} text="No projects yet. Create a project and assign tasks to it to see its breakdown here." />
      ) : (
        <div className="space-y-1.5">
          {projects.map(p => (
            <CollapsibleRow
              key={p.id}
              id={String(p.id)}
              expanded={expanded.includes(String(p.id))}
              onToggle={() => toggle(String(p.id))}
              title={p.name}
              subtitle={`${p.total} tasks · ${p.done} done${p.overdue > 0 ? ` · ${p.overdue} overdue` : ''}`}
              tone={p.statusTone}
              badge={
                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${p.statusTone === 'ok' ? 'bg-emerald-500/15 text-emerald-600' : p.statusTone === 'warn' ? 'bg-amber-500/15 text-amber-600' : 'bg-red-500/15 text-red-600'}`}>
                  {p.completionPct}% · {p.status}
                </span>
              }
            >
              <PctBar pct={(p.completionPct / maxPct) * 100} color={p.color} />
              <FactLine label="Completion" value={`${p.completionPct}% (${p.done}/${p.total})`} tone={p.statusTone} />
              <FactLine label="Status" value={p.overdue > 0 ? `At risk — ${p.overdue} overdue task${p.overdue > 1 ? 's' : ''} need attention.` : p.completionPct >= 50 ? 'On track — steady progress.' : 'Early stage — most tasks still open.'} tone={p.statusTone} />
              {p.tasks.slice(0, 10).map(t => (
                <div key={t.id} className="flex items-center gap-2 text-xs">
                  {t.done
                    ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                    : <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIORITY_COLORS[t.priority] }} />}
                  <span className={`flex-1 min-w-0 truncate ${t.done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{t.title}</span>
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
// 6. Tags Overview
// ---------------------------------------------------------------------------

const SHARED_TAG_PREFIX = 'shared-tag-';
const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ');

const sharedTagToLabel = (tag: SharedTag): Label => ({
  id: `${SHARED_TAG_PREFIX}${tag.id}`,
  name: tag.name,
  color: tag.color as LabelColor,
});

function TagsOverviewBody({ tasks, ctx }: { tasks: Task[]; ctx: DoneCtx }) {
  const tags = useMemo(() => buildTags(tasks, ctx), [tasks, ctx]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);
  const { board, updateTask } = useBoardContext();
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [sharedTags, setSharedTags] = useState<SharedTag[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetched = await fetchTags();
        if (!cancelled) setSharedTags(fetched);
      } catch (error) {
        console.error('Failed to load shared tags:', error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allTags = useMemo<Label[]>(() => {
    const byName = new Map<string, Label>();
    DEFAULT_LABELS.forEach(label => byName.set(normalizeTagName(label.name).toLowerCase(), label));
    sharedTags.forEach(tag => byName.set(normalizeTagName(tag.name).toLowerCase(), sharedTagToLabel(tag)));
    return Array.from(byName.values());
  }, [sharedTags]);

  const updateTaskLabels = useCallback((tagId: string, patch: (label: Label) => Label) => {
    board.tasks.forEach(t => {
      if (t.labels.some(label => label.id === tagId)) {
        updateTask(t.id, { labels: t.labels.map(label => label.id === tagId ? patch(label) : label) });
      }
    });
  }, [board.tasks, updateTask]);

  const deleteTagEverywhere = useCallback(async (tagId: string) => {
    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          await deleteTag(sharedTagId);
        } catch (error) {
          console.error('Failed to delete shared tag:', error);
          return;
        }
      }
    }
    board.tasks.forEach(t => {
      if (t.labels.some(label => label.id === tagId)) {
        updateTask(t.id, { labels: t.labels.filter(label => label.id !== tagId) });
      }
    });
  }, [board.tasks, updateTask]);
  const renameTagEverywhere = useCallback(async (tagId: string, newName: string) => {
    const name = normalizeTagName(newName);
    if (!name) return;

    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          const updated = await updateTag(sharedTagId, { name });
          setSharedTags(prev => prev.map(tag => tag.id === sharedTagId ? { ...tag, name: updated.name } : tag));
        } catch (error) {
          console.error('Failed to rename shared tag:', error);
          return;
        }
      }
    }
    updateTaskLabels(tagId, label => ({ ...label, name }));
  }, [updateTaskLabels]);

  const changeTagColorEverywhere = useCallback(async (tagId: string, color: LabelColor) => {
    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          const updated = await updateTag(sharedTagId, { color });
          setSharedTags(prev => prev.map(tag => tag.id === sharedTagId ? { ...tag, color: updated.color } : tag));
        } catch (error) {
          console.error('Failed to update tag color:', error);
          return;
        }
      }
    }
    updateTaskLabels(tagId, label => ({ ...label, color }));
  }, [updateTaskLabels]);

  const handleCreateTag = useCallback(async (name: string, color: LabelColor) => {
    await createTag({ name, color });
    const fetched = await fetchTags();
    setSharedTags(fetched);
  }, []);

  return (
    <>
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">{tags.length} tag{tags.length !== 1 ? 's' : ''} in use</p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTagsModalOpen(true)}
              className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
              title="Edit tags"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <CollapseAllToggle ids={tags.map(t => t.id)} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
          </div>
        </div>
        {tags.length === 0 ? (
          <EmptyState icon={Tag} text="No tags yet. Add tags to your tasks and they will be grouped here." />
        ) : (
          <div className="space-y-1.5">
            {tags.slice(0, 12).map(t => (
              <CollapsibleRow
                key={t.id}
                id={t.id}
                expanded={expanded.includes(t.id)}
                onToggle={() => toggle(t.id)}
                title={
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: `hsl(var(--label-${t.color}))` }} />
                    {t.name}
                  </span>
                }
                subtitle={`${t.count} task${t.count > 1 ? 's' : ''} · ${t.openCount} open`}
                badge={<span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: `hsl(var(--label-${t.color}))` }}>{t.count}</span>}
              >
                {t.tasks.map(task => (
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
        )}
      </div>
      <TagsModal
        open={tagsModalOpen}
        onClose={() => setTagsModalOpen(false)}
        title="Tags"
        tags={allTags}
        selectedIds={[]}
        onToggle={() => {}}
        onCreate={handleCreateTag}
        onDelete={deleteTagEverywhere}
        onRename={renameTagEverywhere}
        onColorChange={changeTagColorEverywhere}
        emptyText="No tags yet. Create one below."
      />
    </>
  );
}

export { CompletionOverviewBody, ActiveVsOverdueBody, TasksByPriorityBody, WeeklyActivityBody, ProjectBreakdownBody, TagsOverviewBody };
