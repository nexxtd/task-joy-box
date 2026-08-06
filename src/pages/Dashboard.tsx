import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useDeepFocus } from '@/hooks/useDeepFocus';
import EnergyTaskRecommendations from '@/components/EnergyTaskRecommendations';
import { getPeakEnergyHours } from '@/utils/energyTaskScheduler';
import {
  CheckSquare, Target, Clock, Flame, Plus, ArrowRight,
  TrendingUp, Bot, Calendar, Zap, X, Maximize2, Minimize2,
  LayoutDashboard, GripVertical, FolderOpen, BarChart3, ListChecks, Sparkles
} from 'lucide-react';
import { PRIORITY_CONFIG, Priority } from '@/types/board';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type DashboardWidgetType =
  | 'stats' | 'tasks' | 'projects' | 'project-tasks' | 'insights'
  | 'energy' | 'peak-hours' | 'weekly' | 'goals' | 'account';

interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  title: string;
  col: number;
  row: number;
  w: number;
  h: number;
  projectId?: number | null;
  expanded?: boolean;
}

interface WidgetSize {
  w: number;
  h: number;
}

interface WidgetDef {
  type: DashboardWidgetType;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent: string;
  small: WidgetSize;
  large: WidgetSize;
  defaultSize: 'small' | 'large';
}

const WIDGET_DEFS: WidgetDef[] = [
  { type: 'stats', title: 'Stats Overview', desc: 'Tasks Active, Completion, Deep Work & Streak', icon: LayoutDashboard, accent: 'label-purple', small: { w: 4, h: 2 }, large: { w: 8, h: 2 }, defaultSize: 'large' },
  { type: 'tasks', title: 'Tasks', desc: 'Today\'s priority tasks & quick actions', icon: ListChecks, accent: 'label-blue', small: { w: 4, h: 2 }, large: { w: 8, h: 3 }, defaultSize: 'large' },
  { type: 'projects', title: 'Projects', desc: 'All your active projects at a glance', icon: FolderOpen, accent: 'label-pink', small: { w: 4, h: 2 }, large: { w: 8, h: 3 }, defaultSize: 'small' },
  { type: 'project-tasks', title: 'Tasks within a Project', desc: 'Lift one project\'s tasks onto the dashboard', icon: CheckSquare, accent: 'label-red', small: { w: 4, h: 2 }, large: { w: 8, h: 3 }, defaultSize: 'small' },
  { type: 'insights', title: 'Insights', desc: 'Completion, active & completed snapshot', icon: BarChart3, accent: 'label-purple', small: { w: 4, h: 2 }, large: { w: 8, h: 2 }, defaultSize: 'small' },
  { type: 'energy', title: 'Energy-Aware Recommendations', desc: 'Tasks best matched to your energy today', icon: Zap, accent: 'label-orange', small: { w: 4, h: 3 }, large: { w: 8, h: 4 }, defaultSize: 'small' },
  { type: 'peak-hours', title: 'Your Peak Hours', desc: 'Times of day when you work best', icon: Clock, accent: 'label-green', small: { w: 4, h: 1 }, large: { w: 8, h: 1 }, defaultSize: 'small' },
  { type: 'weekly', title: 'Weekly Activity', desc: 'Tasks completed across the last 7 days', icon: BarChart3, accent: 'label-blue', small: { w: 4, h: 1 }, large: { w: 8, h: 2 }, defaultSize: 'small' },
  { type: 'goals', title: 'Top Goals', desc: 'Your current goals and targets', icon: Target, accent: 'label-green', small: { w: 4, h: 1 }, large: { w: 8, h: 2 }, defaultSize: 'small' },
  { type: 'account', title: 'Account Status', desc: 'Your plan and completed work', icon: Bot, accent: 'label-blue', small: { w: 4, h: 1 }, large: { w: 8, h: 1 }, defaultSize: 'small' },
];

const GRID_COLS = 12;
const ROW_PX = 112;
const GAP_PX = 16;
const CELL_H = ROW_PX + GAP_PX;

const genKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Rect {
  id?: string;
  col: number;
  row: number;
  w: number;
  h: number;
}

const intersects = (a: Rect, b: Rect) =>
  !(a.col >= b.col + b.w || a.col + a.w <= b.col || a.row >= b.row + b.h || a.row + a.h <= b.row);

const cardStyle = (accent: string, alpha = 0.06, borderAlpha = 0.18): React.CSSProperties => ({
  background: 'hsl(var(--card))',
  border: `1px solid hsl(var(--border))`,
  boxShadow: '0 12px 30px -30px hsl(228 25% 25% / 0.4)',
});

const isExpanded = (widget: DashboardWidget, def?: WidgetDef): boolean => {
  if (widget.expanded !== undefined) return widget.expanded;
  if (!def) return false;
  return widget.w >= def.large.w && widget.h >= def.large.h;
};

const normalizeSizes = (widgets: DashboardWidget[]): DashboardWidget[] =>
  widgets.map(wg => {
    const def = WIDGET_DEFS.find(d => d.type === wg.type);
    if (!def) return wg;
    const expanded = isExpanded(wg, def);
    const dims = expanded ? def.large : def.small;
    return { ...wg, col: Math.min(wg.col, GRID_COLS - dims.w + 1), w: dims.w, h: dims.h, expanded };
  });

const packLayout = (widgets: DashboardWidget[]): DashboardWidget[] => {
  const sorted = [...widgets].sort((a, b) => (a.row - b.row) || (a.col - b.col));
  const result: DashboardWidget[] = [];
  for (const w of sorted) {
    const cur = { ...w };
    let guard = 0;
    while (guard < 200) {
      const hit = result.find(o => intersects(cur, o));
      if (!hit) break;
      cur.row = hit.row + hit.h;
      guard += 1;
    }
    result.push(cur);
  }
  return result;
};

const Dashboard: React.FC = () => {
  const { board, addTask } = useBoardContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { open: openDeepFocus } = useDeepFocus();
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('none');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskDueTime, setNewTaskDueTime] = useState('');
  const [newTaskColumn, setNewTaskColumn] = useState('');
  const [habitStreak, setHabitStreak] = useState(0);
  const [energySettings, setEnergySettings] = useState({
    energyMorning: 'medium' as 'low' | 'medium' | 'high',
    energyAfternoon: 'high' as 'low' | 'medium' | 'high',
    energyEvening: 'low' as 'low' | 'medium' | 'high',
  });
  const [energyConfigured, setEnergyConfigured] = useState(false);
  const [deepFocusMinutes, setDeepFocusMinutes] = useState(0);
  const [goalsData, setGoalsData] = useState<Array<{ id: number; title: string; progress: number; target: number; unit: string; status: string; completed: boolean }>>([]);

  const [showCustomize, setShowCustomize] = useState(false);
  const [layout, setLayout] = useState<DashboardWidget[]>([]);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [draftConflicts, setDraftConflicts] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<{ w: DashboardWidget; sx: number; sy: number; col: number; row: number; ww: number; hh: number } | null>(null);
  const draftRef = useRef<Rect | null>(null);
  const layoutRef = useRef<DashboardWidget[]>([]);

  const layoutKey = `dash_widgets_v2_${user?.id ?? 'anon'}`;

  const defaultLayout = (): DashboardWidget[] => {
    const w = (type: DashboardWidgetType, title: string, col: number, row: number, projectId?: number | null): DashboardWidget => {
      const def = WIDGET_DEFS.find(d => d.type === type)!;
      const expanded = def.defaultSize === 'large';
      const dims = expanded ? def.large : def.small;
      return { id: `${type}-${row}-${col}-${genKey()}`, type, title, col, row, w: dims.w, h: dims.h, projectId, expanded };
    };
    return [
      w('stats', 'Stats Overview', 1, 1),
      w('tasks', 'Tasks', 1, 3),
      w('peak-hours', 'Your Peak Hours', 9, 1),
      w('energy', 'Energy-Aware Recommendations', 9, 2),
      w('weekly', 'Weekly Activity', 9, 5),
      w('goals', 'Top Goals', 1, 7),
      w('account', 'Account Status', 5, 7),
      w('insights', 'Insights', 1, 8),
    ];
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(layoutKey);
      if (raw) {
        const parsed = JSON.parse(raw) as DashboardWidget[];
        if (Array.isArray(parsed) && parsed.length > 0) { setLayout(normalizeSizes(parsed)); return; }
      }
    } catch { }
    setLayout(defaultLayout());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  useEffect(() => {
    if (layout.length > 0) {
      layoutRef.current = layout;
      try { localStorage.setItem(layoutKey, JSON.stringify(layout)); } catch { }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  useEffect(() => {
    let cancelled = false;
    const morning = localStorage.getItem('energyMorning');
    const afternoon = localStorage.getItem('energyAfternoon');
    const evening = localStorage.getItem('energyEvening');
    if (morning || afternoon || evening) {
      setEnergyConfigured(true);
      setEnergySettings({
        energyMorning: (morning as 'low' | 'medium' | 'high') || 'medium',
        energyAfternoon: (afternoon as 'low' | 'medium' | 'high') || 'medium',
        energyEvening: (evening as 'low' | 'medium' | 'high') || 'medium',
      });
    }
    fetch('/api/settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (!data || cancelled) return;
        const hasAny = data.energyMorning || data.energyAfternoon || data.energyEvening;
        if (hasAny) setEnergyConfigured(true);
        setEnergySettings(prev => ({
          energyMorning: data.energyMorning || prev.energyMorning,
          energyAfternoon: data.energyAfternoon || prev.energyAfternoon,
          energyEvening: data.energyEvening || prev.energyEvening,
        }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    fetch('/api/deep-focus/sessions/today', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data) setDeepFocusMinutes(Number(data.minutes) || 0);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/goals', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: any) => {
        if (data && Array.isArray(data.goals)) {
          setGoalsData(data.goals.map((g: any) => ({
            id: g.id, title: g.title || 'Untitled goal',
            progress: Number(g.progress) || 0, target: Number(g.target) || 0,
            unit: g.unit || '', status: g.status || 'to_do', completed: Boolean(g.completed),
          })));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/habits', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((habits: any[]) => {
        const maxStreak = habits.reduce((max: number, h: any) => Math.max(max, h.streak || 0), 0);
        setHabitStreak(maxStreak);
      })
      .catch(() => {});
  }, []);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const doneColIds = useMemo(() =>
    board.columns.filter(c => /done|completed|finish/i.test(c.title)).map(c => c.id),
    [board.columns]
  );

  const activeTasks = board.tasks.filter(t => !doneColIds.includes(t.columnId) && !t.completed);
  const completedTasks = board.tasks.filter(t => doneColIds.includes(t.columnId) || t.completed);
  const completionRate = board.tasks.length > 0
    ? Math.round((completedTasks.length / board.tasks.length) * 100)
    : 0;

  const priorityTasks = activeTasks
    .filter(t => t.priority !== 'none')
    .sort((a, b) => {
      const order = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      return order[a.priority] - order[b.priority];
    })
    .slice(0, 5);

  const projectsInfo = useMemo(() => {
    const map = new Map<number, { id: number; name: string; color: string; active: number; done: number; total: number }>();
    board.tasks.forEach(t => {
      if (t.projectId == null) return;
      const pid = t.projectId;
      const cur = map.get(pid) || { id: pid, name: t.projectName || 'Project', color: t.color || 'hsl(var(--label-blue))', active: 0, done: 0, total: 0 };
      if (t.color) cur.color = t.color;
      if (t.projectName) cur.name = t.projectName;
      cur.total += 1;
      if (doneColIds.includes(t.columnId) || t.completed) cur.done += 1;
      else cur.active += 1;
      map.set(pid, cur);
    });
    board.columns.forEach(c => {
      if (c.projectId == null) return;
      const cur = map.get(c.projectId);
      if (cur && c.color && c.color !== 'hsl(var(--muted-foreground))') cur.color = c.color;
    });
    return [...map.values()];
  }, [board, doneColIds]);

  const peakHours = useMemo(() => getPeakEnergyHours(energySettings), [energySettings]);

  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const weeklyData = useMemo(() => {
    const data = new Array(7).fill(0);
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeek = new Date(today);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(today.getDate() + mondayOffset);
    for (const task of board.tasks) {
      const col = board.columns.find(c => c.id === task.columnId);
      const isCompleted = Boolean(task.completed || col?.title?.toLowerCase() === 'completed');
      if (!isCompleted) continue;
      const completionSource = task.completedAt ?? task.updatedAt;
      if (!completionSource) continue;
      const completedAt = new Date(completionSource);
      if (Number.isNaN(completedAt.getTime())) continue;
      const dayStart = new Date(completedAt);
      dayStart.setHours(0, 0, 0, 0);
      const dayIndex = Math.floor((dayStart.getTime() - startOfWeek.getTime()) / (24 * 60 * 60 * 1000));
      if (dayIndex >= 0 && dayIndex <= 6) data[dayIndex] += 1;
    }
    return data;
  }, [board.tasks, board.columns]);

  const maxWeekly = Math.max(...weeklyData, 1);
  const peakDay = weeklyData.indexOf(Math.max(...weeklyData));

  const stats = [
    { label: 'Tasks Active', value: activeTasks.length, icon: CheckSquare, accent: 'label-purple' },
    { label: 'Completion', value: `${completionRate}%`, icon: TrendingUp, accent: 'label-green' },
    { label: 'Deep Work', value: `${(deepFocusMinutes / 60).toFixed(1)}h`, icon: Clock, accent: 'label-blue' },
    { label: 'Daily Streak', value: habitStreak, icon: Flame, accent: 'label-orange' },
  ];

  const handleAddTask = () => {
    if (newTaskTitle.trim() && newTaskColumn) {
      addTask(newTaskColumn, newTaskTitle.trim(), {
        description: newTaskDescription,
        priority: newTaskPriority,
        dueDate: newTaskDueDate || undefined,
        dueTime: newTaskDueTime || undefined,
      });
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskPriority('none');
      setNewTaskDueDate('');
      setNewTaskDueTime('');
      setNewTaskColumn('');
      setShowAddTask(false);
    }
  };

  const cellFromPoint = useCallback((clientX: number, clientY: number) => {
    const el = gridRef.current;
    if (!el) return { col: 1, row: 1 };
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return { col: 1, row: 1 };
    const colW = rect.width / GRID_COLS;
    const x = clientX - rect.left;
    const y = clientY - rect.top + el.scrollTop;
    return {
      col: clamp(Math.floor(x / colW) + 1, 1, GRID_COLS),
      row: Math.max(1, Math.floor(y / CELL_H) + 1),
    };
  }, []);

  const hasWidget = (type: DashboardWidgetType) => layout.some(w => w.type === type);

  const resolveRowPush = (others: DashboardWidget[], rect: Rect): Rect => {
    let candidate = { ...rect };
    let guard = 0;
    while (candidate.row < 400 && guard < 200) {
      const hit = others.find(o => intersects(candidate, o));
      if (!hit) break;
      candidate = { ...candidate, row: hit.row + hit.h };
      guard += 1;
    }
    return candidate;
  };

  const findFreeSlot = (w: number, h: number): Rect => {
    for (let row = 1; row < 400; row++) {
      for (let col = 1; col <= GRID_COLS - w + 1; col++) {
        const rect: Rect = { col, row, w, h };
        if (!layout.some(o => intersects(rect, o))) return rect;
      }
    }
    const maxRow = layout.reduce((mx, o) => Math.max(mx, o.row + o.h), 1);
    return { col: 1, row: maxRow, w, h };
  };

  const addWidget = (type: DashboardWidgetType, at?: Rect) => {
    if (hasWidget(type)) return;
    const def = WIDGET_DEFS.find(d => d.type === type);
    if (!def) return;
    const expanded = def.defaultSize === 'large';
    const dims = expanded ? def.large : def.small;
    const slot = at ? at : findFreeSlot(dims.w, dims.h);
    const others = layout.map(o => ({ ...o }));
    const placed = resolveRowPush(others, { ...slot, w: dims.w, h: dims.h });
    const widget: DashboardWidget = {
      id: genKey(), type, title: def.title,
      col: placed.col, row: placed.row, w: dims.w, h: dims.h, expanded,
    };
    setLayout(prev => packLayout([...prev, widget]));
  };

  const removeWidget = (id: string) => setLayout(prev => packLayout(prev.filter(w => w.id !== id)));
  const updateWidget = (id: string, patch: Partial<DashboardWidget>) =>
    setLayout(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w));

  const toggleSize = (id: string) => {
    setLayout(prev => {
      const next = prev.map(wg => {
        if (wg.id !== id) return wg;
        const def = WIDGET_DEFS.find(d => d.type === wg.type);
        if (!def) return wg;
        const expanded = !isExpanded(wg, def);
        const dims = expanded ? def.large : def.small;
        return { ...wg, col: Math.min(wg.col, GRID_COLS - dims.w + 1), w: dims.w, h: dims.h, expanded };
      });
      return packLayout(next);
    });
  };

  const onGestureMove = useCallback((e: PointerEvent) => {
    const g = gestureRef.current;
    if (!g) return;
    const cell = cellFromPoint(e.clientX, e.clientY);
    const current = layoutRef.current;
    const col = clamp(cell.col, 1, GRID_COLS - g.ww + 1);
    const rect: Rect = { col, row: Math.max(1, cell.row), w: g.ww, h: g.hh };
    const others = current.filter(o => o.id !== g.w.id);
    draftRef.current = rect;
    setDraft(rect);
    setDraftConflicts(others.some(o => intersects(rect, o)));
  }, [cellFromPoint]);

  const onGestureEnd = useCallback(() => {
    const g = gestureRef.current;
    window.removeEventListener('pointermove', onGestureMove);
    window.removeEventListener('pointerup', onGestureEnd);
    window.removeEventListener('pointercancel', onGestureEnd);
    gestureRef.current = null;
    const finalRect = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    setDraftConflicts(false);
    if (g && finalRect) {
      setLayout(prev => {
        const next = prev.map(wg => {
          if (wg.id !== g.w.id) return wg;
          const others = prev.filter(o => o.id !== wg.id);
          const pushed = resolveRowPush(others, { ...finalRect });
          return { ...wg, col: pushed.col, row: pushed.row, w: finalRect.w, h: finalRect.h };
        });
        return packLayout(next);
      });
    }
  }, [onGestureMove]);

  const startGesture = (e: React.PointerEvent, widget: DashboardWidget) => {
    if (e.button !== 0) return;
    e.preventDefault();
    gestureRef.current = { w: widget, sx: e.clientX, sy: e.clientY, col: widget.col, row: widget.row, ww: widget.w, hh: widget.h };
    const start: Rect = { col: widget.col, row: widget.row, w: widget.w, h: widget.h };
    draftRef.current = start;
    setDraft(start);
    setDraftConflicts(false);
    window.addEventListener('pointermove', onGestureMove);
    window.addEventListener('pointerup', onGestureEnd);
    window.addEventListener('pointercancel', onGestureEnd);
  };

  const onGridDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/widget') as DashboardWidgetType;
    const def = WIDGET_DEFS.find(d => d.type === type);
    if (!def) return;
    const dims = def.defaultSize === 'large' ? def.large : def.small;
    const cell = cellFromPoint(e.clientX, e.clientY);
    const rect: Rect = { col: clamp(cell.col, 1, GRID_COLS - dims.w + 1), row: Math.max(1, cell.row), w: dims.w, h: dims.h };
    setDraft(rect);
    setDraftConflicts(layout.some(o => intersects(rect, o)));
  };

  const onGridDragLeave = () => { setDraft(null); setDraftConflicts(false); };

  const onGridDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('text/widget') as DashboardWidgetType;
    const cell = cellFromPoint(e.clientX, e.clientY);
    setDraft(null);
    setDraftConflicts(false);
    const def = WIDGET_DEFS.find(d => d.type === type);
    if (!def) return;
    const dims = def.defaultSize === 'large' ? def.large : def.small;
    addWidget(type, { col: clamp(cell.col, 1, GRID_COLS - dims.w + 1), row: Math.max(1, cell.row), w: 1, h: 1 });
  };

  const renderGhost = () => {
    if (!draft) return null;
    return (
      <div
        className={`pointer-events-none absolute z-10 rounded-2xl border-2 border-dashed ${draftConflicts ? 'border-red-400 bg-red-500/15' : 'border-primary bg-primary/10'}`}
        style={{
          left: `${((draft.col - 1) / GRID_COLS) * 100}%`,
          top: (draft.row - 1) * CELL_H,
          width: `${(draft.w / GRID_COLS) * 100}%`,
          height: draft.h * ROW_PX + (draft.h - 1) * GAP_PX,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-muted-foreground">
          {draftConflicts ? 'Will snap below' : 'Release to place'}
        </div>
      </div>
    );
  };

  const renderWidgetBody = (widget: DashboardWidget, expanded: boolean) => {
    const def = WIDGET_DEFS.find(d => d.type === widget.type);
    const accent = def?.accent || 'label-blue';
    switch (widget.type) {
      case 'stats':
        return (
          <div className={`grid gap-3 mt-1 ${expanded ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2'}`}>
            {(expanded ? stats : stats.slice(0, 2)).map((stat, i) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-xl p-3.5 bg-card border border-border transition-all duration-300 hover:shadow-sm">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-2.5" style={{ background: `hsl(var(--${stat.accent}) / 0.12)` }}>
                    <Icon className="w-4 h-4" style={{ color: `hsl(var(--${stat.accent}))` }} />
                  </div>
                  <p className="text-2xl font-black text-foreground leading-none">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1.5">{stat.label}</p>
                </div>
              );
            })}
          </div>
        );
      case 'tasks':
        return (
          <div>
            {priorityTasks.length === 0 ? (
              <div className="text-center py-6">
                <CheckSquare className="w-8 h-8 opacity-40 mx-auto mb-2" style={{ color: `hsl(var(--${accent}))` }} />
                <p className="text-sm text-muted-foreground">No priority tasks. Add some to get started!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {priorityTasks.slice(0, expanded ? 5 : 3).map((task, i) => {
                  const col = board.columns.find(c => c.id === task.columnId);
                  const config = task.priority !== 'none' ? PRIORITY_CONFIG[task.priority] : null;
                  return (
                    <div key={task.id} className="flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all duration-200 hover:bg-muted/30 hover:shadow-sm animate-fade-in"
                      style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))', animationDelay: `${i * 50}ms` }}
                      onClick={() => navigate('/tasks')}
                    >
                      {config && (
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${config.className} text-primary-foreground`}>
                          {config.label}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                        {expanded && task.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>}
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium border border-border text-muted-foreground bg-muted/50">
                        {col?.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {expanded && (
            <button
              className="w-full mt-3 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 text-white transition-all duration-200 hover:scale-[1.01]"
              style={{ background: 'hsl(var(--primary))', boxShadow: '0 8px 18px -12px hsl(228 25% 25% / 0.4)' }}
              onClick={() => openDeepFocus()}
            >
              <Zap className="w-4 h-4" /> Start Deep Work
            </button>
            )}
          </div>
        );
      case 'projects':
        return (
          <div>
            {projectsInfo.length === 0 ? (
              <div className="text-center py-6">
                <FolderOpen className="w-8 h-8 opacity-40 mx-auto mb-2" style={{ color: `hsl(var(--${accent}))` }} />
                <p className="text-sm text-muted-foreground">No projects yet</p>
                <button onClick={() => navigate('/projects')} className="text-xs text-primary hover:underline mt-2">Create one</button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {projectsInfo.slice(0, expanded ? 6 : 3).map(p => (
                  <button key={p.id} onClick={() => navigate('/projects')}
                    className="w-full flex items-center gap-2 p-2 rounded-lg text-left transition-all hover:bg-muted/30 hover:shadow-sm"
                    style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">{p.name}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border text-muted-foreground bg-muted/50">
                      {p.active} active
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      case 'project-tasks': {
        const proj = projectsInfo.find(p => p.id === widget.projectId) || projectsInfo[0];
        const projTasks = proj
          ? board.tasks.filter(t => t.projectId === proj.id && !(doneColIds.includes(t.columnId) || t.completed)).slice(0, expanded ? 6 : 3)
          : [];
        return (
          <div>
            {projectsInfo.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">No projects to show</p>
              </div>
            ) : (
              <>
                <div className="mb-3">
                  <select
                    value={widget.projectId ?? proj?.id ?? ''}
                    onChange={e => updateWidget(widget.id, { projectId: Number(e.target.value) || null })}
                    className="w-full rounded-lg px-3 py-2 text-sm font-medium text-foreground bg-background focus:outline-none focus:ring-2"
                    style={{ border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  >
                    {projectsInfo.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                {projTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-5">No open tasks in this project</p>
                ) : (
                  <div className="space-y-1.5">
                    {projTasks.map(t => {
                      const col = board.columns.find(c => c.id === t.columnId);
                      const cfg = t.priority !== 'none' ? PRIORITY_CONFIG[t.priority] : null;
                      return (
                        <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg"
                          style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${cfg?.className || 'bg-muted'} text-primary-foreground`}>
                            {cfg?.label || 'Open'}
                          </span>
                          <span className="flex-1 text-xs font-medium text-foreground truncate">{t.title}</span>
                          {col && (
                            <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full border border-border text-muted-foreground bg-muted/50">
                              {col.title}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        );
      }
      case 'insights':
        return (
          <div>
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 flex-shrink-0">
                <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" fill="none" strokeWidth="10" style={{ stroke: `hsl(var(--${accent}) / 0.14)` }} />
                  <circle cx="40" cy="40" r="32" fill="none" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${(completionRate / 100) * 201} 201`} style={{ stroke: `hsl(var(--${accent}))` }} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-black text-foreground">{completionRate}%</span>
              </div>
              <div className="flex-1 space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  <span className="font-bold text-foreground">{activeTasks.length}</span> active · <span className="font-bold text-foreground">{completedTasks.length}</span> completed
                </p>
                <p className="text-xs text-muted-foreground">{projectsInfo.length} project{projectsInfo.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
            {expanded && (
            <button onClick={() => navigate('/insights')}
              className="mt-3 w-full py-2 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all hover:scale-[1.01]"
style={{ background: 'hsl(var(--primary))' }}>
              Open full Insights <ArrowRight className="w-3 h-3" />
            </button>
            )}
          </div>
        );
      case 'peak-hours':
        return (
          <div className="mt-1">
            <div className="flex flex-wrap gap-2">
              {!energyConfigured ? (
                <p className="text-sm text-muted-foreground">Set your energy preferences in Settings to see your peak hours.</p>
              ) : peakHours.length > 0 ? (
                peakHours.map((h, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-xs font-bold shadow-sm" style={{ background: 'hsl(var(--label-green))' }}>
                    <Zap className="w-3 h-3" /> {h}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No peak energy hours detected</p>
              )}
            </div>
            {expanded && (
              <p className="text-xs text-muted-foreground mt-3">
                Schedule high-priority tasks during these times for optimal performance
              </p>
            )}
          </div>
        );
      case 'weekly':
        return (
          <div className="flex items-end gap-2 mt-1" style={{ height: expanded ? 96 : 64 }}>
            {weekDays.map((day, i) => {
              const height = weeklyData[i] > 0 ? Math.max(expanded ? 10 : 8, (weeklyData[i] / maxWeekly) * (expanded ? 80 : 50)) : 6;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full">
                    <div className={`w-full rounded-t-md transition-all duration-500`}
                      style={{
                        height: `${height}px`,
                        background: i === peakDay
                          ? `hsl(var(--${accent}))`
                          : `hsl(var(--${accent}) / 0.20)`,
                        boxShadow: i === peakDay ? `0 8px 18px -10px hsl(var(--${accent}) / 0.45)` : 'none',
                      }}
                    />
                  </div>
                  {expanded && <span className="text-[10px] text-muted-foreground">{day}</span>}
                </div>
              );
            })}
          </div>
        );
      case 'goals': {
        const activeGoals = goalsData
          .filter(g => !g.completed && g.status !== 'completed')
          .slice(0, expanded ? 4 : 2);
        if (activeGoals.length === 0) {
          return (
            <div className="flex items-center gap-3 mt-1.5">
              <div className="flex-1 text-center">
                <Target className="w-6 h-6 mx-auto mb-1 opacity-60" style={{ color: `hsl(var(--${accent}))` }} />
                <p className="text-xs text-muted-foreground">No active goals</p>
              </div>
              <button onClick={() => navigate('/goals')} className="text-xs text-primary hover:underline">Set a goal</button>
            </div>
          );
        }
        return (
          <div className="space-y-2 mt-1">
            {activeGoals.map(g => {
              const pct = g.target > 0 ? Math.min(100, Math.round((g.progress / g.target) * 100)) : 0;
              return (
                <div key={g.id} className="rounded-lg p-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                  style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}
                  onClick={() => navigate('/goals')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-foreground truncate">{g.title}</p>
                    <span className="text-[10px] font-medium text-muted-foreground flex-shrink-0">{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'hsl(var(--primary))' }} />
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
      case 'account': {
        const tier = user?.subscriptionTier || 'free';
        const tierLabel = tier === 'pro' ? 'Pro' : tier === 'premium' ? 'Premium' : 'Free';
        const isPaid = tier === 'pro' || tier === 'premium';
        return (
          <div className="space-y-2.5 mt-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-2"><Sparkles className="w-3.5 h-3.5" /> Plan</span>
              <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${isPaid ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground border border-border'}`}>
                {tierLabel}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground flex items-center gap-2"><CheckSquare className="w-3.5 h-3.5" /> Tasks completed</span>
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-muted/50 text-muted-foreground border border-border">{completedTasks.length}</span>
            </div>
            {expanded && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-2"><FolderOpen className="w-3.5 h-3.5" /> Projects</span>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-muted/50 text-muted-foreground border border-border">{projectsInfo.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-2"><Sparkles className="w-3.5 h-3.5" /> Signed in</span>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-muted/50 text-muted-foreground border border-border">{user?.name || '—'}</span>
                </div>
              </>
            )}
          </div>
        );
      }
      case 'energy':
        return <EnergyTaskRecommendations tasks={board.tasks} energySettings={energySettings} configured={energyConfigured} limit={expanded ? 5 : 3} showPeakHours={expanded} />;
      default:
        return null;
    }
  };

  return (
    <>
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: 'hsl(var(--background))' }}
      >
        <header className="px-6 py-4 border-b border-border bg-card/30 backdrop-blur-sm"
          style={{ borderColor: 'hsl(var(--border))' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">{dateStr}</p>
              <h1 className="text-xl font-bold text-foreground mt-0.5 animate-fade-in">{greeting}, {user?.name || 'there'}!</h1>
              <p className="text-sm text-muted-foreground mt-1">
                You have <span className="text-primary font-medium">{activeTasks.length} tasks</span> active. Let's make it productive!
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCustomize(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <LayoutDashboard className="w-4 h-4" /> Customize Dashboard
              </button>
              <button
                onClick={() => navigate('/projects')}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <Calendar className="w-4 h-4" /> View Schedule
              </button>
              <button
                onClick={() => setShowAddTask(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all"
              >
                <Plus className="w-4 h-4" /> Add Task
              </button>
            </div>
          </div>
        </header>

        <div className="p-6">
          {layout.length === 0 ? (
            <div className="text-center py-20">
              <Sparkles className="w-10 h-10 mx-auto mb-3" style={{ color: 'hsl(var(--label-orange))' }} />
              <p className="text-base font-semibold text-foreground">Your dashboard is empty</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">Open Customize Dashboard to add widgets</p>
              <button
                onClick={() => setShowCustomize(true)}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-all"
              >
                Add widgets
              </button>
            </div>
          ) : (
            <div
              ref={gridRef}
              onDragOver={onGridDragOver}
              onDragLeave={onGridDragLeave}
              onDrop={onGridDrop}
              className="relative grid grid-cols-12 gap-4 auto-rows-[112px]"
            >
              {renderGhost()}
              {layout.map(widget => {
                const def = WIDGET_DEFS.find(d => d.type === widget.type);
                const accent = def?.accent || 'label-blue';
                const expanded = isExpanded(widget, def);
                return (
                  <div
                    key={widget.id}
                    className="relative group/widget rounded-2xl overflow-hidden"
                    style={{
                      gridColumn: `${widget.col} / span ${widget.w}`,
                      gridRow: `${widget.row} / span ${widget.h}`,
                      background: cardStyle(accent).background,
                      border: cardStyle(accent).border,
                      boxShadow: cardStyle(accent).boxShadow,
                    }}
                  >
                    <div className="flex items-center justify-between px-4 pt-3 pb-1 select-none">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 flex-shrink-0 rounded-md flex items-center justify-center" style={{ background: `hsl(var(--${accent}) / 0.15)` }}>
                          {def && <def.icon className="w-3.5 h-3.5" style={{ color: `hsl(var(--${accent}))` }} />}
                        </div>
                        <h3 className="text-[11px] font-bold text-foreground truncate uppercase tracking-wide">{widget.title}</h3>
                      </div>
                      <div className={`flex items-center gap-0.5 transition-opacity ${draft ? 'pointer-events-none opacity-0' : 'opacity-0 group-hover/widget:opacity-100'}`}>
                        <button
                          onPointerDown={e => startGesture(e, widget)}
                          className="p-1.5 rounded-md hover:bg-black/5 cursor-grab active:cursor-grabbing touch-none"
                          title="Move"
                        >
                          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => removeWidget(widget.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500"
                          title="Remove"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="px-4 pb-4 overflow-y-auto">
                      {renderWidgetBody(widget, expanded)}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); toggleSize(widget.id); }}
                      className="absolute bottom-1 right-1 p-1.5 rounded-md text-muted-foreground hover:bg-black/5 opacity-0 group-hover/widget:opacity-100 transition-opacity"
                      title={expanded ? 'Shrink widget' : 'Expand widget'}
                    >
                      {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showCustomize && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
            onClick={() => setShowCustomize(false)}
            onDragOver={onGridDragOver}
            onDragLeave={onGridDragLeave}
            onDrop={onGridDrop}
          />
          <div className="relative w-full max-w-sm h-full bg-card border-l border-border shadow-2xl animate-slide-in overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-primary" /> Customize Dashboard
              </h2>
              <button onClick={() => setShowCustomize(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="px-5 pt-3 text-xs text-muted-foreground leading-relaxed">
              Drag a widget from the list onto the dashboard grid to place it — it snaps into place automatically. Grab the grip to move a widget, drag its corner to resize, and use <span className="font-semibold">×</span> to remove it.
            </p>
            <div className="p-3 space-y-2">
              {WIDGET_DEFS.map(def => {
                const placed = hasWidget(def.type);
                const Icon = def.icon;
                return (
                  <div
                    key={def.type}
                    draggable={!placed}
                    onDragStart={(e) => { e.dataTransfer.setData('text/widget', def.type); e.dataTransfer.effectAllowed = 'copy'; }}
                    className={placed ? 'p-3 rounded-2xl border opacity-60' : 'p-3 rounded-2xl border cursor-grab active:cursor-grabbing'}
                    style={{
                      borderColor: placed ? 'hsl(var(--border))' : 'hsl(var(--border))',
                      borderRadius: 16,
                      background: placed ? 'hsl(var(--muted))' : 'hsl(var(--card))',
                      boxShadow: '0 6px 18px -18px hsl(228 25% 25% / 0.4)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center" style={{ background: `hsl(var(--${def.accent}) / 0.12)` }}>
                        <Icon className="w-4 h-4" style={{ color: `hsl(var(--${def.accent}))` }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-foreground">{def.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{def.desc}</p>
                      </div>
                      {placed ? (
                        <span className="text-[10px] font-bold uppercase text-muted-foreground bg-black/5 px-2 py-1 rounded-full">On board</span>
                      ) : (
                        <span className="text-[10px] font-bold uppercase text-muted-foreground px-2 py-1 rounded-full border" style={{ borderColor: 'hsl(var(--border))' }}>
                          Drag to add
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="p-3 pt-1">
              <button
                onClick={() => { setLayout(defaultLayout()); setShowCustomize(false); }}
                className="w-full py-2.5 rounded-xl text-sm font-bold border transition-colors hover:bg-muted"
                style={{ borderColor: 'hsl(var(--border))', color: 'hsl(228 14% 40%)' }}
              >
                Reset to default layout
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddTask && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4" onClick={() => setShowAddTask(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Add New Task</h2>
              <button onClick={() => setShowAddTask(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Title</label>
                <input
                  autoFocus
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                  placeholder="Task title..."
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Description</label>
                <textarea
                  value={newTaskDescription}
                  onChange={e => setNewTaskDescription(e.target.value)}
                  placeholder="Task description..."
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                  rows={3}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Column</label>
                <Select value={newTaskColumn} onValueChange={setNewTaskColumn}>
                  <SelectTrigger className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring h-10">
                    <SelectValue placeholder="Select a column..." />
                  </SelectTrigger>
                  <SelectContent>
                    {board.columns.map(col => (
                      <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Priority</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setNewTaskPriority('none')}
                    className={`text-xs px-3 py-1.5 rounded-md border transition-all ${newTaskPriority === 'none' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                  >
                    None
                  </button>
                  {(Object.entries(PRIORITY_CONFIG) as [Exclude<Priority, 'none'>, { label: string; className: string }][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setNewTaskPriority(key)}
                      className={`text-xs px-3 py-1.5 rounded-md transition-all ${newTaskPriority === key ? `${cfg.className} text-primary-foreground` : 'border border-border text-muted-foreground hover:text-foreground'}`}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Due Date</label>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={e => setNewTaskDueDate(e.target.value)}
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Due Time</label>
                <input
                  type="time"
                  value={newTaskDueTime}
                  onChange={e => setNewTaskDueTime(e.target.value)}
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
              <button onClick={() => setShowAddTask(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button onClick={handleAddTask} disabled={!newTaskTitle.trim() || !newTaskColumn} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Dashboard;