import { Task, Column, Priority } from '@/types/board';

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

export const formatDate = (value?: string): string => {
  if (!value) return 'No date';
  const d = safeDate(value);
  if (!d) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const formatDateTime = (value?: string): string => {
  const d = safeDate(value);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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

export const buildCompletionOverview = (tasks: Task[], ctx: DoneCtx, rangeDays: number): CompletionOverviewData => {
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
    const created = safeDate(t.when);
    if (!created) return false;
    return Date.now() - created.getTime() <= 2 * DAY_MS;
  });

  let explanation: string;
  if (total === 0) {
    explanation = 'No tasks were created or completed in the selected period, so there is nothing to measure yet.';
  } else if (completed === 0) {
    explanation = `Completion is at 0% for the last ${rangeDays} days — ${created} task${created !== 1 ? 's were' : ' was'} added but none finished.`;
  } else if (lateAdded > 0 && lateAdded >= completed) {
    explanation = `Completion is ${completionRate}% because ${lateAdded} task${lateAdded !== 1 ? 's were' : ' was'} added in the last ${rangeDays} days and ${lateAdded === 1 ? 'is' : 'are'} still open — ${completed} completed in the same window.${addedLate.length > 0 ? ` ${addedLate.length} of those came in the final 48 hours, dragging the rate down.` : ''}`;
  } else if (completed > created) {
    explanation = `Completion is ${completionRate}% — ${completed} task${completed !== 1 ? 's' : ''} finished against ${created} added, so you are clearing the backlog faster than it grows.`;
  } else {
    explanation = `Completion is ${completionRate}% over the last ${rangeDays} days: ${completed} completed, ${created - completed} still open out of ${created} added.`;
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

export const buildOverdue = (tasks: Task[], ctx: DoneCtx): OverdueEntry[] =>
  tasks
    .filter(t => !isTaskDone(t, ctx))
    .map(t => ({ t, due: dueEnd(t) }))
    .filter((x): x is { t: Task; due: Date } => x.due !== null && x.due.getTime() < Date.now())
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .map(({ t, due }) => {
      const daysOverdue = Math.max(1, Math.floor((Date.now() - due.getTime()) / DAY_MS));
      const prio = t.priority === 'none' ? 'unprioritized' : PRIORITY_LABEL[t.priority].toLowerCase();
      const { subtaskTotal, subDone, checklistTotal, checklistDone } = taskBreakdown(t);
      const openWork = (subtaskTotal - subDone) + (checklistTotal - checklistDone);
      let reasoning: string;
      if (daysOverdue >= 14) {
        reasoning = `"${t.title}" has been overdue for ${daysOverdue} days — past the point where a deadline still feels real. ${openWork > 0 ? `It still has ${openWork} open item${openWork > 1 ? 's' : ''} of work attached.` : 'Its breakdown is done but the task was never closed.'} The longer an overdue task sits, the lower the odds it ever gets finished.`;
      } else if (daysOverdue >= 7) {
        reasoning = `"${t.title}" is ${daysOverdue} days past its due date (${formatDate(t.dueDate)}). At this stage it has dropped out of every "up next" ordering, so nothing pulls it back in. ${t.priority === 'urgent' || t.priority === 'high' ? `It is ${prio} priority, which makes the missed date harder to justify.` : ''}`;
      } else {
        reasoning = `"${t.title}" was due ${formatDate(t.dueDate)} — ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} ago — and is still ${openWork > 0 ? `carrying ${openWork} open item${openWork > 1 ? 's' : ''}` : 'unfinished'}. Fresh overdue tasks quietly become permanent ones when they are not re-dated or closed within the first few days.`;
      }
      return {
        id: t.id,
        title: t.title,
        dueDate: t.dueDate || '',
        dueTime: t.dueTime,
        daysOverdue,
        priority: t.priority,
        projectName: t.projectName,
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

export const buildPriorityGroups = (tasks: Task[], ctx: DoneCtx): PriorityGroup[] =>
  PRIORITY_ORDER.map(priority => {
    const group = tasks.filter(t => !isTaskDone(t, ctx) && t.priority === priority)
      .sort((a, b) => {
        const da = dueEnd(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const db = dueEnd(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return da - db;
      });
    return {
      priority,
      label: priority === 'none' ? 'Unprioritized' : PRIORITY_LABEL[priority],
      count: group.length,
      tasks: group,
      totalMinutes: group.reduce((s, t) => s + Math.max(0, Number(t.duration) || 0), 0),
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

  const days: DayActivity[] = MONDAY_FIRST.map((label, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return {
      dayIndex: i,
      label,
      dateLabel: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
  status: 'Strong' | 'On track' | 'Lagging' | 'At risk';
  statusTone: 'ok' | 'warn' | 'bad';
  tasks: Array<{ id: string; title: string; done: boolean; priority: Priority }>;
}

export const buildProjects = (tasks: Task[], columns: Column[], ctx: DoneCtx): ProjectInfo[] => {
  const map = new Map<number, ProjectInfo>();
  tasks.forEach(t => {
    if (t.projectId == null) return;
    const pid = t.projectId;
    const cur = map.get(pid) || {
      id: pid,
      name: t.projectName || 'Project',
      color: t.color || 'hsl(var(--label-blue))',
      total: 0,
      done: 0,
      overdue: 0,
      completionPct: 0,
      status: 'At risk' as ProjectInfo['status'],
      statusTone: 'bad' as ProjectInfo['statusTone'],
      tasks: [],
    };
    if (t.color) cur.color = t.color;
    if (t.projectName) cur.name = t.projectName;
    const done = isTaskDone(t, ctx);
    cur.total += 1;
    if (done) cur.done += 1;
    const due = dueEnd(t);
    if (!done && due && due.getTime() < Date.now()) cur.overdue += 1;
    cur.tasks.push({ id: t.id, title: t.title, done, priority: t.priority });
    map.set(pid, cur);
  });
  columns.forEach(c => {
    if (c.projectId == null) return;
    const cur = map.get(c.projectId);
    if (cur && c.color && c.color !== 'hsl(var(--muted-foreground))') cur.color = c.color;
  });

  return [...map.values()].map(p => {
    const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
    let status: ProjectInfo['status'];
    let tone: ProjectInfo['statusTone'];
    if (pct >= 80) { status = 'Strong'; tone = 'ok'; }
    else if (pct >= 50) { status = 'On track'; tone = 'ok'; }
    else if (pct >= 20) { status = 'Lagging'; tone = 'warn'; }
    else { status = 'At risk'; tone = 'bad'; }
    if (p.overdue > 0 && pct < 80) { status = p.overdue >= 2 ? 'At risk' : 'Lagging'; tone = p.overdue >= 2 ? 'bad' : 'warn'; }
    return { ...p, completionPct: pct, status, statusTone: tone, tasks: p.tasks.slice(0, 40) };
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
    days.push({ date: d, label: WEEKDAY_SHORT[d.getDay()] + ' ' + d.getDate(), count: 0, tasks: [] });
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
      weekLabel: `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      count: slice.reduce((s, d) => s + d.count, 0),
      days: slice,
    });
  }
  return { days, weeks };
};

export const trendExplanation = (day: TrendDay, prevCount: number): string | null => {
  if (day.count === 0) {
    if (prevCount > 0) return `No completions — the first quiet day after ${prevCount} on the previous day, so the trend dips.`;
    return 'No completions this day.';
  }
  if (prevCount === 0) {
    return `${day.count} task${day.count > 1 ? 's were' : ' was'} completed — breaking a quiet stretch and pushing the trend up.`;
  }
  if (day.count > prevCount) {
    return `${day.count} completions vs ${prevCount} the day before — a rise, likely from finishing work that had been building up.`;
  }
  if (day.count < prevCount) {
    return `${day.count} completions, down from ${prevCount} the day before — a dip.`;
  }
  return `${day.count} completions, matching the previous day.`;
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

export const buildAvgCompletion = (tasks: Task[], ctx: DoneCtx): { overallHours: number; groups: CompletionTimeGroup[] } => {
  const withDates = tasks
    .filter(t => isTaskDone(t, ctx) && t.createdAt && completedStamp(t))
    .map(t => {
      const start = safeDate(t.createdAt);
      const end = safeDate(completedStamp(t) || '');
      return { t, start, end };
    })
    .filter((x): x is { t: Task; start: Date; end: Date } => !!x.start && !!x.end && x.end.getTime() >= x.start.getTime());

  const groups: CompletionTimeGroup[] = PRIORITY_ORDER.map(priority => {
    const items = withDates.filter(x => x.t.priority === priority).map(({ t, start, end }) => {
      const actualHours = (end.getTime() - start.getTime()) / 3600000;
      const estimateMinutes = Number(t.duration) || undefined;
      let verdict: CompletionTimeTask['verdict'];
      let deltaLabel: string;
      if (!estimateMinutes) {
        verdict = 'under';
        deltaLabel = 'no estimate set';
      } else {
        const diff = actualHours * 60 - estimateMinutes;
        if (Math.abs(diff) < estimateMinutes * 0.25) {
          verdict = 'on';
          deltaLabel = `within 25% of the ${formatDuration(estimateMinutes)} estimate`;
        } else if (diff > 0) {
          verdict = 'over';
          deltaLabel = `${formatDuration(Math.round(diff))} over the ${formatDuration(estimateMinutes)} estimate`;
        } else {
          verdict = 'under';
          deltaLabel = `${formatDuration(Math.round(-diff))} under the ${formatDuration(estimateMinutes)} estimate`;
        }
      }
      return {
        id: t.id,
        title: t.title,
        actualHours,
        estimateMinutes,
        deltaLabel,
        verdict,
        completedAt: completedStamp(t) || '',
      };
    }).sort((a, b) => b.actualHours - a.actualHours);

    return {
      priority,
      label: priority === 'none' ? 'Unprioritized' : PRIORITY_LABEL[priority],
      tasks: items,
      avgHours: items.length > 0 ? items.reduce((s, i) => s + i.actualHours, 0) / items.length : 0,
    };
  }).filter(g => g.tasks.length > 0);

  const all = withDates.map(({ t, start, end }) => (end.getTime() - start.getTime()) / 3600000);
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
  const entries: BusyDayEntry[] = WEEKDAY_LABELS.map((label, i) => ({ weekday: i, label, count: 0, tasks: [] }));
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
      timeLabel: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
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

export const buildProjectComparison = (tasks: Task[], columns: Column[], ctx: DoneCtx): ProjectComparison[] => {
  const infos = buildProjects(tasks, columns, ctx);
  if (infos.length <= 1) return [];

  const avgPct = infos.reduce((s, p) => s + p.completionPct, 0) / infos.length;
  const completionHours = infos.map(p => {
    const pTasks = tasks.filter(t => t.projectId === p.id && isTaskDone(t, ctx) && t.createdAt && completedStamp(t));
    if (pTasks.length === 0) return null;
    const totalMs = pTasks.reduce((s, t) => {
      const start = safeDate(t.createdAt)?.getTime() || 0;
      const end = safeDate(completedStamp(t) || '')?.getTime() || 0;
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
    let verdict: string;
    if (vsAvgPct >= 10) verdict = `Completes ${vsAvgPct} points above the ${Math.round(avgPct)}% average across projects.`;
    else if (vsAvgPct <= -10) verdict = `Sits ${Math.abs(vsAvgPct)} points below the ${Math.round(avgPct)}% project average — the weakest of the set.`;
    else verdict = `Roughly in line with the ${Math.round(avgPct)}% project average.`;
    if (pAvg != null && vsAvgHours > 2) verdict += ` Tasks also take ${formatHours(vsAvgHours)} longer on average than other projects.`;
    else if (pAvg != null && vsAvgHours < -2) verdict += ` Tasks finish ${formatHours(-vsAvgHours)} faster than the project average.`;
    if (p.overdue > 0) verdict += ` ${p.overdue} overdue task${p.overdue > 1 ? 's' : ''} are dragging it down.`;
    return { ...p, avgHours: pAvg ?? 0, vsAvgPct, vsAvgHours, verdict };
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

const statusLabelOf = (t: Task): string => {
  const s = t.status;
  if (s === 'completed') return 'Completed';
  if (s === 'in_progress') return 'In Progress';
  if (s === 'review') return 'Review';
  return 'To Do';
};

export const buildSubtaskHealth = (tasks: Task[], ctx: DoneCtx): SubtaskHealthEntry[] =>
  tasks
    .filter(t => !isTaskDone(t, ctx))
    .map(t => {
      const { subtaskTotal, subDone, checklistTotal, checklistDone } = taskBreakdown(t);
      const totalItems = subtaskTotal + checklistTotal;
      const doneItems = subDone + checklistDone;
      const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : null;
      const lastTouchedDays = daysSince(t.updatedAt || t.createdAt);
      const stalled = pct !== null && pct === 0 && lastTouchedDays !== null && lastTouchedDays >= 7;

      let reasoning: string;
      let suggestion: string | undefined;
      if (totalItems === 0) {
        reasoning = `"${t.title}" has no sub-tasks or checklist items, so progress can only be tracked through its status (${statusLabelOf(t)}). Without a breakdown it is hard to tell "almost done" from "barely touched".`;
        suggestion = 'Add checklist items so progress becomes measurable, or finish it.';
      } else if (pct === 100) {
        reasoning = `All ${doneItems}/${totalItems} breakdown items are done, yet the task still reads as ${statusLabelOf(t)}. Everything planned is finished — the only step left is marking it completed.`;
        suggestion = 'Mark it completed — all breakdown work is done.';
      } else if (stalled) {
        reasoning = `${doneItems}/${totalItems} items done (${pct}%) and nothing has changed in ${lastTouchedDays} days. On paper it is ${pct}% complete, but in practice it has been idle for over a week — not slow progress, but stalled.`;
        suggestion = 'Restart it this week, or consciously cut it from the active set.';
      } else if (pct === 0) {
        reasoning = `The breakdown is fully untouched (0/${totalItems} items) but it was worked on ${lastTouchedDays === null ? 'recently' : lastTouchedDays === 0 ? 'today' : `${lastTouchedDays} day${lastTouchedDays > 1 ? 's' : ''} ago`} — early motion without execution yet.`;
        suggestion = lastTouchedDays !== null && lastTouchedDays <= 2 ? 'Start the first checklist item now, while the momentum exists.' : undefined;
      } else {
        reasoning = `${doneItems}/${totalItems} items done (${pct}%), last touched ${lastTouchedDays === null ? 'recently' : lastTouchedDays === 0 ? 'today' : `${lastTouchedDays} day${lastTouchedDays > 1 ? 's' : ''} ago`}. ${lastTouchedDays !== null && lastTouchedDays > 3 ? 'Work started, then paused — the remaining items still represent a real block of effort.' : 'This task is genuinely moving toward completion.'}`;
        suggestion = lastTouchedDays !== null && lastTouchedDays > 3 ? 'Pick it up again within the next few days, or it will slip from half-done to abandoned.' : undefined;
      }
      return {
        id: t.id,
        title: t.title,
        subtaskTotal,
        subDone,
        checklistTotal,
        checklistDone,
        totalItems,
        doneItems,
        pct,
        lastTouchedDays,
        stalled,
        statusLabel: statusLabelOf(t),
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
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + WEEKDAY_SHORT[d.getDay()],
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

export const buildAiScoreFallback = (tasks: Task[], ctx: DoneCtx) => {
  const today = new Date().toISOString().split('T')[0];
  const openTasks = tasks.filter(t => !isTaskDone(t, ctx));
  const overdueTasks = tasks.filter(t => t.dueDate && t.dueDate < today && !isTaskDone(t, ctx));
  const highOpen = openTasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
  const lowOpen = openTasks.filter(t => t.priority === 'low');
  const completedCount = tasks.filter(t => isTaskDone(t, ctx)).length;
  const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  let score = 50
    + Math.min(40, completedCount * 5)
    - Math.min(30, overdueTasks.length * 6)
    - Math.min(20, highOpen.length * 4)
    - Math.min(15, lowOpen.length * 2);
  score = Math.max(1, Math.min(99, score));

  const short = (t: Task) => t.title.length > 40 ? `${t.title.slice(0, 40)}…` : t.title;

  const contributors: Array<{ id: string; text: string }> = [];
  if (completedCount > 0) {
    contributors.push({ id: 'completed', text: `${completedCount} task${completedCount !== 1 ? 's' : ''} completed (${completionRate}%) — each worth about 5 points.` });
    const recentDone = tasks.filter(t => isTaskDone(t, ctx) && (t.priority === 'urgent' || t.priority === 'high')).slice(0, 3);
    recentDone.forEach(t => contributors.push({ id: t.id, text: `"${short(t)}" was completed — high-priority wins matter more than lower-priority work.` }));
  }
  if (overdueTasks.length === 0 && completedCount > 0) {
    contributors.push({ id: 'clean', text: 'No overdue tasks — nothing is being dragged down by missed deadlines.' });
  }

  const penalties: Array<{ id: string; text: string }> = [];
  overdueTasks.slice(0, 5).forEach(t => {
    penalties.push({ id: t.id, text: `"${short(t)}" is overdue (was due ${t.dueDate}) — costing about 6 points.` });
  });
  if (overdueTasks.length > 5) {
    penalties.push({ id: 'more-overdue', text: `${overdueTasks.length - 5} more overdue task${overdueTasks.length - 5 > 1 ? 's' : ''}, each costing about 6 points.` });
  }
  highOpen.slice(0, 4).forEach(t => {
    penalties.push({ id: t.id, text: `"${short(t)}" is still open despite being ${t.priority} priority — about 4 points lost.` });
  });
  lowOpen.slice(0, 3).forEach(t => {
    penalties.push({ id: t.id, text: `"${short(t)}" is a low-priority task left open — about 2 points lost.` });
  });
  if (penalties.length === 0 && completedCount > 0) {
    penalties.push({ id: 'none', text: 'Nothing critical is dragging the score down right now — keep the completion streak going.' });
  }

  return {
    overallScore: score,
    scoreRationale: `Starting from a neutral base of 50: ${completedCount} completions at +5 each${overdueTasks.length > 0 ? `, ${overdueTasks.length} overdue at −6 each` : ''}${highOpen.length > 0 ? `, ${highOpen.length} open urgent/high tasks at −4 each` : ''}${lowOpen.length > 0 ? `, ${lowOpen.length} open low-priority tasks at −2 each` : ''}. That lands the score at ${score}.`,
    contributors,
    penalties,
    insights: [
      `${tasks.length} total task${tasks.length !== 1 ? 's' : ''} with ${completedCount} completed (${completionRate}%).`,
      `${highOpen.length} urgent/high-priority task${highOpen.length !== 1 ? 's' : ''} still open${overdueTasks.length > 0 ? `, and ${overdueTasks.length} overdue` : ''}.`,
    ],
    recommendations: [
      overdueTasks.length > 0 ? `Clear overdue tasks first — starting with "${short(overdueTasks[0])}".` : 'Review the list for anything that can be archived or consolidated.',
      highOpen.length > 0 ? `Finish open ${highOpen[0].priority}-priority tasks before moving to medium or low ones.` : 'Break larger tasks into smaller subtasks for better progress tracking.',
    ],
  };
};
