import { dateLocale } from '@/i18n/format';
import { Task, Column, Priority } from '@/types/board';

export type TranslateFn = (phrase: string, vars?: Record<string, string | number>) => string;

export const defaultTranslate: TranslateFn = (phrase, vars) => {
  if (!vars) return phrase;
  return phrase.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = vars[key];
    return val === undefined || val === null ? match : String(val);
  });
};

export interface DoneCtx {
  doneColIds: string[];
}

export const isTaskDone = (t: Task, ctx: DoneCtx) =>
  Boolean(t.completed || t.status === 'completed' || ctx.doneColIds.includes(t.columnId));

export const dueEnd = (t: Task): Date | null => {
  if (!t.dueDate) return null;
  const d = new Date(`${t.dueDate}T${t.dueTime || '23:59'}`);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const safeDate = (v?: string): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const DAY_MS = 24 * 60 * 60 * 1000;

export const localDayKey = (d: Date) => {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c.getTime();
};

export const formatDate = (value?: string, t: TranslateFn = defaultTranslate): string => {
  if (!value) return t('No date');
  const d = safeDate(value);
  if (!d) return value;
  return d.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' });
};

export const formatDateTime = (value?: string): string => {
  const d = safeDate(value);
  if (!d) return '—';
  return d.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' });
};

export const formatDuration = (minutes?: number): string => {
  if (!minutes || minutes <= 0) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

export const formatHours = (hours: number): string => {
  if (hours <= 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(1)}h`;
};

export const daysSince = (iso?: string): number | null => {
  const d = safeDate(iso);
  if (!d) return null;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / DAY_MS));
};

export const completedStamp = (t: Task): string | null =>
  t.completedAt || t.updatedAt || null;

export const timeAgoLabel = (ts: number): string => {
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return 'just now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
};

export const WEEKDAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONDAY_FIRST = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None',
};

export const PRIORITY_ORDER: Priority[] = ['urgent', 'high', 'medium', 'low', 'none'];

export const taskBreakdown = (t: Task) => {
  const legacySubtasks = t.checklists.find(list => list.title.toLowerCase().trim() === 'subtasks');
  const subtasks = (t.subtasks && t.subtasks.length > 0) ? t.subtasks : (legacySubtasks?.items || []);
  const subDone = subtasks.filter(s => s.completed).length;
  const checklistLists = t.checklists.filter(list => list.id !== legacySubtasks?.id);
  const checklistTotal = checklistLists.reduce((s, l) => s + l.items.length, 0);
  const checklistDone = checklistLists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
  return { subtaskTotal: subtasks.length, subDone, checklistTotal, checklistDone };
};

// ---------------------------------------------------------------------------
// 1. Completion Overview
// ---------------------------------------------------------------------------

export interface CompletionOverviewEntry {
  id: string;
  title: string;
  when: string;
  projectName?: string;
  priority: Priority;
  completed?: boolean;
}

export interface CompletionOverviewData {
  rangeDays: number;
  createdInPeriod: CompletionOverviewEntry[];
  completedInPeriod: CompletionOverviewEntry[];
  total: number;
  completed: number;
  active: number;
  completionRate: number;
  explanation: string;
}

export const buildCompletionOverview = (
  tasks: Task[],
  ctx: DoneCtx,
  rangeDays: number,
  t: TranslateFn = defaultTranslate,
): CompletionOverviewData => {
  const startKey = localDayKey(new Date()) - (rangeDays - 1) * DAY_MS;

  const createdInPeriod: CompletionOverviewEntry[] = tasks
    .filter(t => {
      const k = localDayKey(safeDate(t.createdAt) || new Date(0));
      return k >= startKey;
    })
    .sort((a, b) => (safeDate(b.createdAt)?.getTime() || 0) - (safeDate(a.createdAt)?.getTime() || 0))
    .map(t => ({
      id: t.id,
      title: t.title,
      when: t.createdAt || '',
      projectName: t.projectName,
      priority: t.priority,
      completed: isTaskDone(t, ctx),
    }));

  const completedInPeriod: CompletionOverviewEntry[] = tasks
    .filter(t => {
      const stamp = completedStamp(t);
      if (!stamp) return false;
      const k = localDayKey(safeDate(stamp) || new Date(0));
      return isTaskDone(t, ctx) && k >= startKey;
    })
    .sort((a, b) => (safeDate(completedStamp(b))?.getTime() || 0) - (safeDate(completedStamp(a))?.getTime() || 0))
    .map(t => ({
      id: t.id,
      title: t.title,
      when: completedStamp(t) || '',
      projectName: t.projectName,
      priority: t.priority,
    }));

  const completed = completedInPeriod.length;
  const created = createdInPeriod.length;
  const active = Math.max(0, created - completed);
  const total = Math.max(created, completed);
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const lateAdded = createdInPeriod.filter(t => !t.completed).length;
  const addedLate = createdInPeriod.filter(t => {
    if (t.completed) return false;
    const createdDate = safeDate(t.when);
    if (!createdDate) return false;
    return Date.now() - createdDate.getTime() <= 2 * DAY_MS;
  });

  let explanation: string;
  if (total === 0) {
    explanation = t('No tasks were created or completed in the last {{days}} days. Add or complete deliverables to generate completion velocity analysis.', { days: rangeDays });
  } else if (completed === 0) {
    explanation = t('Completion sits at 0% for the last {{days}} days — {{created}} task(s) were added without a closure yet. Finish the smallest item to start momentum.', { days: rangeDays, created });
  } else if (lateAdded > 0 && lateAdded >= completed) {
    explanation = t('Completion is {{rate}}% over {{days}} days: {{completed}} completed vs {{open}} still open out of {{created}} created ({{late}} added in the final 48h). Prioritize clearing older items first.', {
      rate: completionRate,
      days: rangeDays,
      completed,
      open: lateAdded,
      created,
      late: addedLate.length,
    });
  } else if (completed > created) {
    explanation = t('Completion is {{rate}}% over {{days}} days — {{completed}} finished vs {{created}} created, meaning backlog debt is actively shrinking.', {
      rate: completionRate,
      days: rangeDays,
      completed,
      created,
    });
  } else {
    explanation = t('Completion is {{rate}}% over the last {{days}} days: {{completed}} completed and {{open}} still open out of {{created}} created.', {
      rate: completionRate,
      days: rangeDays,
      completed,
      open: Math.max(0, created - completed),
      created,
    });
  }

  return {
    rangeDays,
    createdInPeriod,
    completedInPeriod,
    total,
    completed,
    active,
    completionRate,
    explanation,
  };
};

// ---------------------------------------------------------------------------
// 2. Active vs Overdue
// ---------------------------------------------------------------------------

export interface OverdueEntry {
  id: string;
  title: string;
  dueDate: string;
  dueTime?: string;
  daysOverdue: number;
  priority: Priority;
  projectName?: string;
  reasoning: string;
}

export const buildOverdue = (
  tasks: Task[],
  ctx: DoneCtx,
  t: TranslateFn = defaultTranslate,
): OverdueEntry[] =>
  tasks
    .filter(task => !isTaskDone(task, ctx))
    .map(task => ({ task, due: dueEnd(task) }))
    .filter((x): x is { task: Task; due: Date } => x.due !== null && x.due.getTime() < Date.now())
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .map(({ task, due }) => {
      const daysOverdue = Math.max(1, Math.floor((Date.now() - due.getTime()) / DAY_MS));
      const prioLabel = t(task.priority === 'none' ? 'Unprioritized' : PRIORITY_LABEL[task.priority]);
      const dateStr = formatDate(task.dueDate, t);
      const { subtaskTotal, subDone, checklistTotal, checklistDone } = taskBreakdown(task);
      const openWork = (subtaskTotal - subDone) + (checklistTotal - checklistDone);
      const workNote = openWork > 0
        ? t('Still carries {{count}} open sub-item(s).', { count: openWork })
        : t('All breakdown steps are done, yet the task itself is still open.');
      let reasoning: string;
      if (daysOverdue >= 14) {
        reasoning = t(
          '"{{title}}" has been overdue for {{days}} days — past the point where deadlines feel urgent. {{work}} The longer it sits overdue, the lower the chance it gets closed.',
          { title: task.title, days: daysOverdue, work: workNote }
        );
      } else if (daysOverdue >= 7) {
        reasoning = t(
          '"{{title}}" is {{days}} days past due ({{date}}). At {{priority}} priority, leaving it open pushes dependent schedules out of alignment.',
          { title: task.title, days: daysOverdue, date: dateStr, priority: prioLabel }
        );
      } else {
        reasoning = t(
          '"{{title}}" was due {{date}} ({{days}}d ago) and still remains open. Re-date or close fresh overdue items within 48h to avoid backlog buildup.',
          { title: task.title, date: dateStr, days: daysOverdue }
        );
      }
      return {
        id: task.id,
        title: task.title,
        dueDate: task.dueDate || '',
        dueTime: task.dueTime,
        daysOverdue,
        priority: task.priority,
        projectName: task.projectName,
        reasoning,
      };
    });

// ---------------------------------------------------------------------------
// 3. Tasks by Priority
// ---------------------------------------------------------------------------

export interface PriorityGroup {
  priority: Priority;
  label: string;
  count: number;
  tasks: Task[];
  totalMinutes: number;
}

export const buildPriorityGroups = (
  tasks: Task[],
  ctx: DoneCtx,
  t: TranslateFn = defaultTranslate,
): PriorityGroup[] =>
  PRIORITY_ORDER.map(priority => {
    const group = tasks.filter(task => !isTaskDone(task, ctx) && task.priority === priority)
      .sort((a, b) => {
        const da = dueEnd(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const db = dueEnd(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return da - db;
      });
    return {
      priority,
      label: priority === 'none' ? t('Unprioritized') : t(PRIORITY_LABEL[priority]),
      count: group.length,
      tasks: group,
      totalMinutes: group.reduce((s, task) => s + Math.max(0, Number(task.duration) || 0), 0),
    };
  }).filter(g => g.count > 0);

// ---------------------------------------------------------------------------
// 4. Weekly Activity
// ---------------------------------------------------------------------------

export interface DayActivity {
  dayIndex: number;
  label: string;
  dateLabel: string;
  count: number;
  tasks: Array<{ id: string; title: string; completedAt: string; projectName?: string; priority: Priority }>;
}

export const buildWeeklyActivity = (tasks: Task[], ctx: DoneCtx): DayActivity[] => {
  const today = new Date();
  const dow = today.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const startOfWeek = new Date(today);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(today.getDate() + mondayOffset);

  const days: DayActivity[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return {
      dayIndex: i,
      label: d.toLocaleDateString(dateLocale(), { weekday: 'short' }),
      dateLabel: d.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' }),
      count: 0,
      tasks: [],
    };
  });

  for (const t of tasks) {
    if (!isTaskDone(t, ctx)) continue;
    const stamp = completedStamp(t);
    const d = safeDate(stamp);
    if (!d) continue;
    const dayStart = localDayKey(d);
    const idx = Math.floor((dayStart - localDayKey(startOfWeek)) / DAY_MS);
    if (idx < 0 || idx > 6) continue;
    days[idx].count += 1;
    days[idx].tasks.push({
      id: t.id,
      title: t.title,
      completedAt: stamp || '',
      projectName: t.projectName,
      priority: t.priority,
    });
  }

  return days.map(day => ({
    ...day,
    tasks: day.tasks.sort((a, b) => safeDate(b.completedAt)?.getTime() || 0 - (safeDate(a.completedAt)?.getTime() || 0)),
  }));
};

// ---------------------------------------------------------------------------
// 5. Project Breakdown
// ---------------------------------------------------------------------------

export interface ProjectInfo {
  id: number;
  name: string;
  color: string;
  total: number;
  done: number;
  overdue: number;
  completionPct: number;
  statusKey: 'Strong' | 'On track' | 'Lagging' | 'At risk';
  status: string;
  statusTone: 'ok' | 'warn' | 'bad';
  tasks: Array<{ id: string; title: string; done: boolean; priority: Priority }>;
}

export const buildProjects = (
  tasks: Task[],
  columns: Column[],
  ctx: DoneCtx,
  t: TranslateFn = defaultTranslate,
): ProjectInfo[] => {
  const map = new Map<number, ProjectInfo>();
  tasks.forEach(task => {
    if (task.projectId == null) return;
    const pid = task.projectId;
    const cur = map.get(pid) || {
      id: pid,
      name: task.projectName || t('Project'),
      color: task.color || 'hsl(var(--label-blue))',
      total: 0,
      done: 0,
      overdue: 0,
      completionPct: 0,
      statusKey: 'At risk' as ProjectInfo['statusKey'],
      status: t('At risk'),
      statusTone: 'bad' as ProjectInfo['statusTone'],
      tasks: [],
    };
    if (task.color) cur.color = task.color;
    if (task.projectName) cur.name = task.projectName;
    const done = isTaskDone(task, ctx);
    cur.total += 1;
    if (done) cur.done += 1;
    const due = dueEnd(task);
    if (!done && due && due.getTime() < Date.now()) cur.overdue += 1;
    cur.tasks.push({ id: task.id, title: task.title, done, priority: task.priority });
    map.set(pid, cur);
  });
  columns.forEach(c => {
    if (c.projectId == null) return;
    const cur = map.get(c.projectId);
    if (cur && c.color && c.color !== 'hsl(var(--muted-foreground))') cur.color = c.color;
  });

  return [...map.values()].map(p => {
    const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
    let statusKey: ProjectInfo['statusKey'];
    let tone: ProjectInfo['statusTone'];
    if (pct >= 80) { statusKey = 'Strong'; tone = 'ok'; }
    else if (pct >= 50) { statusKey = 'On track'; tone = 'ok'; }
    else if (pct >= 20) { statusKey = 'Lagging'; tone = 'warn'; }
    else { statusKey = 'At risk'; tone = 'bad'; }
    if (p.overdue > 0 && pct < 80) { statusKey = p.overdue >= 2 ? 'At risk' : 'Lagging'; tone = p.overdue >= 2 ? 'bad' : 'warn'; }
    return { ...p, completionPct: pct, statusKey, status: t(statusKey), statusTone: tone, tasks: p.tasks.slice(0, 40) };
  }).sort((a, b) => a.completionPct - b.completionPct);
};

// ---------------------------------------------------------------------------
// 6. Tags Overview
// ---------------------------------------------------------------------------

export interface TagEntry {
  id: string;
  name: string;
  color: string;
  count: number;
  openCount: number;
  tasks: Task[];
}

export const buildTags = (tasks: Task[], ctx: DoneCtx): TagEntry[] => {
  const map = new Map<string, TagEntry>();
  tasks.forEach(t => {
    t.labels.forEach(label => {
      const cur = map.get(label.id) || { id: label.id, name: label.name, color: label.color, count: 0, openCount: 0, tasks: [] };
      cur.count += 1;
      if (!isTaskDone(t, ctx)) cur.openCount += 1;
      cur.tasks.push(t);
      map.set(label.id, cur);
    });
  });
  return [...map.values()].sort((a, b) => b.count - a.count);
};

// ---------------------------------------------------------------------------
// 7. Completion Trend (30-day)
// ---------------------------------------------------------------------------

export interface TrendDay {
  date: Date;
  label: string;
  count: number;
  tasks: Array<{ id: string; title: string; projectName?: string }>;
}

export interface TrendWeek {
  weekLabel: string;
  count: number;
  days: TrendDay[];
}

export const buildCompletionTrend = (tasks: Task[], ctx: DoneCtx): { days: TrendDay[]; weeks: TrendWeek[] } => {
  const days: TrendDay[] = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    days.push({
      date: d,
      label: `${d.toLocaleDateString(dateLocale(), { weekday: 'short' })} ${d.getDate()}`,
      count: 0,
      tasks: [],
    });
  }
  for (const t of tasks) {
    if (!isTaskDone(t, ctx)) continue;
    const stamp = completedStamp(t);
    const d = safeDate(stamp);
    if (!d) continue;
    const idx = Math.floor((localDayKey(d) - localDayKey(days[0].date)) / DAY_MS);
    if (idx < 0 || idx >= 30) continue;
    days[idx].count += 1;
    days[idx].tasks.push({ id: t.id, title: t.title, projectName: t.projectName });
  }

  const weeks: TrendWeek[] = [];
  for (let w = 0; w < 5; w++) {
    const slice = days.slice(w * 6, w * 6 + 6);
    if (slice.length === 0) continue;
    const start = slice[0].date;
    const end = slice[slice.length - 1].date;
    weeks.push({
      weekLabel: `${start.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' })}`,
      count: slice.reduce((s, d) => s + d.count, 0),
      days: slice,
    });
  }
  return { days, weeks };
};

export const trendExplanation = (
  day: TrendDay,
  prevCount: number,
  t: TranslateFn = defaultTranslate,
): string | null => {
  if (day.count === 0) {
    if (prevCount > 0) {
      return t('No completions recorded this day following {{prev}} on the prior day — a post-push cool-down dip.', { prev: prevCount });
    }
    return t('No completions logged on this day.');
  }
  if (prevCount === 0) {
    return t('{{count}} task(s) closed today — breaking a quiet stretch and lifting the rolling trend.', { count: day.count });
  }
  if (day.count > prevCount) {
    return t('{{count}} completions vs {{prev}} the day before — stronger output momentum.', { count: day.count, prev: prevCount });
  }
  if (day.count < prevCount) {
    return t('{{count}} completions vs {{prev}} the day before — slightly lighter throughput.', { count: day.count, prev: prevCount });
  }
  return t('{{count}} completions — matching the exact pace of the prior day.', { count: day.count });
};

// ---------------------------------------------------------------------------
// 8. Average Completion Time
// ---------------------------------------------------------------------------

export interface CompletionTimeTask {
  id: string;
  title: string;
  actualHours: number;
  estimateMinutes?: number;
  deltaLabel: string;
  verdict: 'on' | 'over' | 'under';
  completedAt: string;
}

export interface CompletionTimeGroup {
  priority: Priority;
  label: string;
  tasks: CompletionTimeTask[];
  avgHours: number;
}

export const buildAvgCompletion = (
  tasks: Task[],
  ctx: DoneCtx,
  t: TranslateFn = defaultTranslate,
): { overallHours: number; groups: CompletionTimeGroup[] } => {
  const withDates = tasks
    .filter(task => isTaskDone(task, ctx) && task.createdAt && completedStamp(task))
    .map(task => {
      const start = safeDate(task.createdAt);
      const end = safeDate(completedStamp(task) || '');
      return { t: task, start, end };
    })
    .filter((x): x is { t: Task; start: Date; end: Date } => !!x.start && !!x.end && x.end.getTime() >= x.start.getTime());

  const groups: CompletionTimeGroup[] = PRIORITY_ORDER.map(priority => {
    const items = withDates.filter(x => x.t.priority === priority).map(({ t: task, start, end }) => {
      const actualHours = (end.getTime() - start.getTime()) / 3600000;
      const estimateMinutes = Number(task.duration) || undefined;
      let verdict: CompletionTimeTask['verdict'];
      let deltaLabel: string;
      if (!estimateMinutes) {
        verdict = 'under';
        deltaLabel = t('no estimate set');
      } else {
        const est = formatDuration(estimateMinutes);
        const diff = actualHours * 60 - estimateMinutes;
        if (Math.abs(diff) < estimateMinutes * 0.25) {
          verdict = 'on';
          deltaLabel = t('within 25% of the {{est}} estimate', { est });
        } else if (diff > 0) {
          verdict = 'over';
          deltaLabel = t('{{diff}} over the {{est}} estimate', { diff: formatDuration(Math.round(diff)), est });
        } else {
          verdict = 'under';
          deltaLabel = t('{{diff}} under the {{est}} estimate', { diff: formatDuration(Math.round(-diff)), est });
        }
      }
      return {
        id: task.id,
        title: task.title,
        actualHours,
        estimateMinutes,
        deltaLabel,
        verdict,
        completedAt: completedStamp(task) || '',
      };
    }).sort((a, b) => b.actualHours - a.actualHours);

    return {
      priority,
      label: priority === 'none' ? t('Unprioritized') : t(PRIORITY_LABEL[priority]),
      tasks: items,
      avgHours: items.length > 0 ? items.reduce((s, i) => s + i.actualHours, 0) / items.length : 0,
    };
  }).filter(g => g.tasks.length > 0);

  const all = withDates.map(({ start, end }) => (end.getTime() - start.getTime()) / 3600000);
  return {
    overallHours: all.length > 0 ? all.reduce((s, v) => s + v, 0) / all.length : 0,
    groups,
  };
};

// ---------------------------------------------------------------------------
// 9. Busiest Days & Times
// ---------------------------------------------------------------------------

export interface BusyDayEntry {
  weekday: number;
  label: string;
  count: number;
  tasks: Array<{ id: string; title: string; hour: number; timeLabel: string; projectName?: string; completedAt: string }>;
}

export const buildBusiest = (tasks: Task[], ctx: DoneCtx): BusyDayEntry[] => {
  const fmt = new Intl.DateTimeFormat(dateLocale(), { weekday: 'long' });
  const entries: BusyDayEntry[] = Array.from({ length: 7 }, (_, i) => ({
    weekday: i,
    label: fmt.format(new Date(2024, 0, 7 + i)),
    count: 0,
    tasks: [],
  }));
  for (const t of tasks) {
    if (!isTaskDone(t, ctx)) continue;
    const stamp = completedStamp(t);
    const d = safeDate(stamp);
    if (!d) continue;
    const weekday = d.getDay();
    const hour = d.getHours();
    entries[weekday].count += 1;
    entries[weekday].tasks.push({
      id: t.id,
      title: t.title,
      hour,
      timeLabel: d.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' }),
      projectName: t.projectName,
      completedAt: stamp || '',
    });
  }
  return entries
    .map(e => ({ ...e, tasks: e.tasks.sort((a, b) => a.hour - b.hour) }))
    .sort((a, b) => b.count - a.count || a.weekday - b.weekday);
};

// ---------------------------------------------------------------------------
// 10. Multi-Project Comparison
// ---------------------------------------------------------------------------

export interface ProjectComparison {
  id: number;
  name: string;
  color: string;
  total: number;
  done: number;
  completionPct: number;
  overdue: number;
  avgHours: number;
  vsAvgPct: number;
  vsAvgHours: number;
  verdict: string;
}

export const buildProjectComparison = (
  tasks: Task[],
  columns: Column[],
  ctx: DoneCtx,
  t: TranslateFn = defaultTranslate,
): ProjectComparison[] => {
  const infos = buildProjects(tasks, columns, ctx, t);
  if (infos.length <= 1) return [];

  const avgPct = infos.reduce((s, p) => s + p.completionPct, 0) / infos.length;
  const completionHours = infos.map(p => {
    const pTasks = tasks.filter(task => task.projectId === p.id && isTaskDone(task, ctx) && task.createdAt && completedStamp(task));
    if (pTasks.length === 0) return null;
    const totalMs = pTasks.reduce((s, task) => {
      const start = safeDate(task.createdAt)?.getTime() || 0;
      const end = safeDate(completedStamp(task) || '')?.getTime() || 0;
      return s + Math.max(0, end - start);
    }, 0);
    return totalMs / pTasks.length / 3600000;
  });
  const avgHours = completionHours.filter((v): v is number => v !== null);
  const groupAvgHours = avgHours.length > 0 ? avgHours.reduce((s, v) => s + v, 0) / avgHours.length : 0;

  return infos.map((p, i) => {
    const pAvg = completionHours[i];
    const vsAvgPct = Math.round(p.completionPct - avgPct);
    const vsAvgHours = pAvg != null ? Math.round((pAvg - groupAvgHours) * 10) / 10 : 0;
    const parts: string[] = [];
    if (vsAvgPct >= 10) parts.push(t('Completes {{diff}} points above the {{avg}}% project average.', { diff: vsAvgPct, avg: Math.round(avgPct) }));
    else if (vsAvgPct <= -10) parts.push(t('Sits {{diff}} points below the {{avg}}% project average — needs focus to catch up.', { diff: Math.abs(vsAvgPct), avg: Math.round(avgPct) }));
    else parts.push(t('Roughly in line with the {{avg}}% project average.', { avg: Math.round(avgPct) }));

    if (pAvg != null && vsAvgHours > 2) parts.push(t('Tasks also run {{delta}} slower than the cross-project pace.', { delta: formatHours(vsAvgHours) }));
    else if (pAvg != null && vsAvgHours < -2) parts.push(t('Tasks finish {{delta}} faster than the cross-project pace.', { delta: formatHours(-vsAvgHours) }));
    if (p.overdue > 0) parts.push(t('{{count}} overdue item(s) in this project are pulling down completion.', { count: p.overdue }));
    return { ...p, avgHours: pAvg ?? 0, vsAvgPct, vsAvgHours, verdict: parts.join(' ') };
  }).sort((a, b) => a.completionPct - b.completionPct);
};

// ---------------------------------------------------------------------------
// 11. Sub-task & Checklist Health
// ---------------------------------------------------------------------------

export interface SubtaskHealthEntry {
  id: string;
  title: string;
  subtaskTotal: number;
  subDone: number;
  checklistTotal: number;
  checklistDone: number;
  totalItems: number;
  doneItems: number;
  pct: number | null;
  lastTouchedDays: number | null;
  stalled: boolean;
  statusLabel: string;
  reasoning: string;
  suggestion?: string;
}

const statusLabelOf = (task: Task, t: TranslateFn): string => {
  const s = task.status;
  if (s === 'completed') return t('Completed');
  if (s === 'in_progress') return t('In Progress');
  if (s === 'review') return t('Review');
  return t('To Do');
};

export const buildSubtaskHealth = (
  tasks: Task[],
  ctx: DoneCtx,
  t: TranslateFn = defaultTranslate,
): SubtaskHealthEntry[] =>
  tasks
    .filter(task => !isTaskDone(task, ctx))
    .map(task => {
      const { subtaskTotal, subDone, checklistTotal, checklistDone } = taskBreakdown(task);
      const totalItems = subtaskTotal + checklistTotal;
      const doneItems = subDone + checklistDone;
      const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : null;
      const lastTouchedDays = daysSince(task.updatedAt || task.createdAt);
      const stalled = pct !== null && pct === 0 && lastTouchedDays !== null && lastTouchedDays >= 7;
      const statusLabel = statusLabelOf(task, t);

      let reasoning = '';
      let suggestion: string | undefined;
      if (totalItems === 0) {
        reasoning = t('"{{title}}" has no breakdown items yet ({{status}}).', { title: task.title, status: statusLabel });
        suggestion = t('Start the first checklist item while context is fresh.');
      } else if (pct === 100) {
        reasoning = t('All {{done}}/{{total}} breakdown steps are completed while the task still reads {{status}}. Mark the task done cleanly.', {
          done: doneItems,
          total: totalItems,
          status: statusLabel,
        });
        suggestion = t('Mark it completed — all breakdown work is done.');
      } else if (stalled) {
        reasoning = t('{{done}}/{{total}} steps done ({{pct}}%) and untouched for {{days}} days — stalled rather than progressing steadily.', {
          done: doneItems,
          total: totalItems,
          pct: pct ?? 0,
          days: lastTouchedDays ?? 0,
        });
        suggestion = t('Restart it this week or remove stale scope.');
      } else if (pct === 0) {
        reasoning = t('0/{{total}} steps completed despite recent edits — start the first 10-minute sub-item today.', {
          total: totalItems,
        });
        suggestion = lastTouchedDays !== null && lastTouchedDays <= 2
          ? t('Start the first checklist item while context is fresh.')
          : undefined;
      } else {
        reasoning = t('{{done}}/{{total}} steps finished ({{pct}}%), updated {{days}}d ago. Keep momentum by closing the next checklist block.', {
          done: doneItems,
          total: totalItems,
          pct: pct ?? 0,
          days: lastTouchedDays ?? 0,
        });
        suggestion = lastTouchedDays !== null && lastTouchedDays > 3
          ? t('Schedule a concrete sprint before it slips further.')
          : undefined;
      }
      return {
        id: task.id,
        title: task.title,
        subtaskTotal,
        subDone,
        checklistTotal,
        checklistDone,
        totalItems,
        doneItems,
        pct,
        lastTouchedDays,
        stalled,
        statusLabel,
        reasoning,
        suggestion,
      };
    })
    .filter(e => e.totalItems > 0)
    .sort((a, b) => (a.pct ?? -1) - (b.pct ?? -1));

// ---------------------------------------------------------------------------
// 12. Custom Report
// ---------------------------------------------------------------------------

export type ReportMetric = 'completed' | 'created' | 'checklist';

export interface ReportDayEntry {
  key: string;
  label: string;
  count: number;
  items: Array<{ id: string; title: string }>;
}

export const buildReport = (tasks: Task[], ctx: DoneCtx, metric: ReportMetric, rangeDays: number): ReportDayEntry[] => {
  const startKey = localDayKey(new Date()) - (rangeDays - 1) * DAY_MS;
  const map = new Map<number, ReportDayEntry>();
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(startKey + i * DAY_MS);
    map.set(startKey + i * DAY_MS, {
      key: String(startKey + i * DAY_MS),
      label: d.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric', weekday: 'short' }),
      count: 0,
      items: [],
    });
  }
  const stampOf = (t: Task): string | null => {
    if (metric === 'created') return t.createdAt;
    return completedStamp(t);
  };
  for (const t of tasks) {
    const stamp = stampOf(t);
    const d = safeDate(stamp);
    if (!d) continue;
    const k = localDayKey(d);
    if (k < startKey || k >= startKey + rangeDays * DAY_MS) continue;
    if (metric === 'completed' && !isTaskDone(t, ctx)) continue;
    const entry = map.get(k);
    if (!entry) continue;
    if (metric === 'checklist') {
      if (!isTaskDone(t, ctx)) continue;
      let added = 0;
      for (const cl of t.checklists) {
        for (const item of cl.items) {
          if (!item.completed) continue;
          entry.count += 1;
          added += 1;
          entry.items.push({ id: `${t.id}-${cl.id}-${item.id}`, title: `${item.text} (in "${t.title}")` });
        }
      }
      if (added === 0) {
        entry.items.push({ id: t.id, title: t.title });
        entry.count += 1;
      }
    } else {
      entry.count += 1;
      entry.items.push({ id: t.id, title: t.title });
    }
  }
  return [...map.values()];
};

// ---------------------------------------------------------------------------
// AI helpers
// ---------------------------------------------------------------------------

export const buildAiScoreFallback = (
  tasks: Task[],
  ctx: DoneCtx,
  t: TranslateFn = defaultTranslate,
) => {
  const today = new Date().toISOString().split('T')[0];
  const openTasks = tasks.filter(task => !isTaskDone(task, ctx));
  const overdueTasks = tasks.filter(task => task.dueDate && task.dueDate < today && !isTaskDone(task, ctx));
  const unscheduledOpen = openTasks.filter(task => !task.dueDate).length;
  const highOpen = openTasks.filter(task => task.priority === 'urgent' || task.priority === 'high');
  const lowOpen = openTasks.filter(task => task.priority === 'low');
  const completedCount = tasks.filter(task => isTaskDone(task, ctx)).length;
  const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  let score = 50
    + Math.min(40, completedCount * 5)
    - Math.min(30, overdueTasks.length * 6)
    - Math.min(20, highOpen.length * 4)
    - Math.min(15, lowOpen.length * 2);
  score = Math.max(1, Math.min(99, score));

  const short = (task: Task) => task.title.length > 40 ? `${task.title.slice(0, 40)}…` : task.title;

  const contributors: Array<{ id: string; text: string }> = [];
  if (completedCount > 0) {
    contributors.push({
      id: 'completed',
      text: t('{{count}} completed task(s) ({{pct}}% rate) contributed positively to momentum and lifted your baseline score.', {
        count: completedCount,
        pct: completionRate,
      }),
    });
    const recentDone = tasks.filter(task => isTaskDone(task, ctx) && (task.priority === 'urgent' || task.priority === 'high')).slice(0, 3);
    recentDone.forEach(task => contributors.push({
      id: task.id,
      text: t('"{{title}}" completed — closing urgent and high-priority items weighs heavily in your favor.', { title: short(task) }),
    }));
  }
  if (overdueTasks.length === 0 && completedCount > 0) {
    contributors.push({
      id: 'clean',
      text: t('Zero overdue tasks — every scheduled deadline is currently protected from timeline drift.'),
    });
  }

  const penalties: Array<{ id: string; text: string }> = [];
  overdueTasks.slice(0, 5).forEach(task => {
    penalties.push({
      id: task.id,
      text: t('"{{title}}" is overdue ({{date}}) — missed deadlines reduce predictability and score weight.', {
        title: short(task),
        date: task.dueDate || '',
      }),
    });
  });
  if (overdueTasks.length > 5) {
    penalties.push({
      id: 'more-overdue',
      text: t('{{count}} more overdue task(s) require immediate triage or updated target dates.', {
        count: overdueTasks.length - 5,
      }),
    });
  }
  highOpen.slice(0, 4).forEach(task => {
    penalties.push({
      id: task.id,
      text: t('"{{title}}" remains open at {{priority}} priority — resolve or break down its prerequisites.', {
        title: short(task),
        priority: t(PRIORITY_LABEL[task.priority]),
      }),
    });
  });
  lowOpen.slice(0, 3).forEach(task => {
    penalties.push({
      id: task.id,
      text: t('"{{title}}" sits open at low priority — archive or consolidate aging low-impact items.', {
        title: short(task),
      }),
    });
  });
  if (penalties.length === 0 && completedCount > 0) {
    penalties.push({
      id: 'none',
      text: t('No severe penalties detected right now — keep closing prioritized tasks consistently.'),
    });
  }

  return {
    overallScore: score,
    scoreRationale: t('Score {{score}}/100 reflects {{completed}} completion(s), {{overdue}} overdue item(s), and {{high}} open urgent/high priorities.', {
      score,
      completed: completedCount,
      overdue: overdueTasks.length,
      high: highOpen.length,
    }),
    contributors,
    penalties,
    insights: [
      t('Productivity score stands at {{score}}/100 with {{compRate}}% completion across {{total}} tasks ({{completed}} done, {{active}} active).', {
        score,
        compRate: completionRate,
        total: tasks.length,
        completed: completedCount,
        active: openTasks.length,
      }),
      t('Schedule pressure: {{overdue}} overdue items and {{unscheduled}} unscheduled tasks are competing with {{highPri}} urgent/high active priorities.', {
        overdue: overdueTasks.length,
        unscheduled: unscheduledOpen,
        highPri: highOpen.length,
      }),
    ],
    recommendations: [
      overdueTasks.length > 0
        ? t('Clear {{count}} overdue deliverable(s) first to eliminate schedule drag and unblock downstream goals.', { count: overdueTasks.length })
        : t('Add target due dates to {{count}} unscheduled active task(s) so workload stays visible on the timeline.', { count: unscheduledOpen }),
      highOpen.length > 0
        ? t('Protect morning focus blocks for {{count}} urgent/high priority task(s) before handling routine messages.', { count: highOpen.length })
        : t('Maintain steady daily closure cadence across {{count}} active task(s) and review completed milestones weekly.', { count: openTasks.length }),
    ],
  };
};
