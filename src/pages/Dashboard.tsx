import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useDeepFocus } from '@/hooks/useDeepFocus';
import EnergyTaskRecommendations from '@/components/EnergyTaskRecommendations';
import { getPeakEnergyHours } from '@/utils/energyTaskScheduler';
import {
  CheckSquare, Clock, Plus, ArrowRight,
  TrendingUp, Bot, Calendar, Zap, X,
  LayoutDashboard, GripVertical, FolderOpen, BarChart3, ListChecks, Sparkles,
  AlertTriangle, Flag, History, PieChart, Tags, LineChart, SlidersHorizontal,
  GitCompareArrows, Gauge, ListOrdered, Siren, MessageSquareText, RefreshCw,
  Flame, Crown, Lock, CheckCircle2, Pencil
} from 'lucide-react';
import { PRIORITY_CONFIG, Priority, Task, Label, LabelColor, DEFAULT_LABELS } from '@/types/board';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CreateTaskModal from '@/components/CreateTaskModal';
import TagsModal from '@/components/shared/TagsModal';
import { createTag, deleteTag, fetchTags, updateTag, type SharedTag } from '@/services/tagService';
import { buildTags } from '@/components/insights/insightData';
import { CollapsibleRow, useExpanded, CollapseAllToggle } from '@/components/insights/InsightWidgets';

const SHARED_TAG_PREFIX = 'shared-tag-';

const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ');

const sharedTagToLabel = (tag: SharedTag): Label => ({
  id: `${SHARED_TAG_PREFIX}${tag.id}`,
  name: tag.name,
  color: tag.color as LabelColor,
});

type DashboardWidgetType =
  | 'stats' | 'tasks' | 'projects' | 'project-tasks' | 'insights'
  | 'energy' | 'peak-hours' | 'weekly' | 'account'
  | 'overdue' | 'deadlines' | 'project-progress' | 'recently-completed' | 'priority-breakdown' | 'tags-overview'
  | 'advanced-insights' | 'custom-report' | 'multi-project'
  | 'ai-score' | 'ai-prioritize' | 'ai-bottlenecks' | 'ai-weekly';

type DashboardWidgetTier = 'free' | 'premium' | 'pro';
type ReportMetric = 'completed' | 'created' | 'checklist';

interface DashboardWidget {
  id: string;
  type: DashboardWidgetType;
  title: string;
  col: number;
  row: number;
  w: number;
  h: number;
  projectId?: number | null;
  metric?: ReportMetric;
  range?: number;
}

interface WidgetDef {
  type: DashboardWidgetType;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent: string;
  w: number;
  h: number;
  tier: DashboardWidgetTier;
}

const WIDGET_DEFS: WidgetDef[] = [
  { type: 'stats', title: 'Stats Overview', desc: 'Tasks Active, Completion, Deep Work & Streak', icon: LayoutDashboard, accent: 'label-purple', w: 8, h: 2, tier: 'free' },
  { type: 'tasks', title: 'Tasks', desc: 'Today\'s priority tasks & quick actions', icon: ListChecks, accent: 'label-blue', w: 8, h: 3, tier: 'free' },
  { type: 'projects', title: 'Projects', desc: 'All your active projects at a glance', icon: FolderOpen, accent: 'label-pink', w: 4, h: 3, tier: 'free' },
  { type: 'project-tasks', title: 'Tasks within a Project', desc: 'Lift one project\'s tasks onto the dashboard', icon: CheckSquare, accent: 'label-red', w: 4, h: 3, tier: 'free' },
  { type: 'insights', title: 'Insights', desc: 'Completion, active & completed snapshot', icon: BarChart3, accent: 'label-purple', w: 4, h: 2, tier: 'free' },
  { type: 'energy', title: 'Energy-Aware Recommendations', desc: 'Tasks best matched to your energy today', icon: Zap, accent: 'label-orange', w: 4, h: 3, tier: 'free' },
  { type: 'peak-hours', title: 'Your Peak Hours', desc: 'Times of day when you work best', icon: Clock, accent: 'label-green', w: 4, h: 1, tier: 'free' },
  { type: 'weekly', title: 'Weekly Activity', desc: 'Tasks completed across the last 7 days', icon: BarChart3, accent: 'label-blue', w: 4, h: 2, tier: 'free' },
  { type: 'account', title: 'Account Status', desc: 'Your plan and completed work', icon: Bot, accent: 'label-blue', w: 4, h: 1, tier: 'free' },
  { type: 'overdue', title: 'Overdue Tasks', desc: 'Tasks past their due date, with days overdue', icon: AlertTriangle, accent: 'label-red', w: 4, h: 2, tier: 'free' },
  { type: 'deadlines', title: 'Upcoming Deadlines', desc: 'Tasks due in the next 3-7 days, soonest first', icon: Flag, accent: 'label-orange', w: 4, h: 2, tier: 'free' },
  { type: 'project-progress', title: 'Project Progress', desc: 'Completion % bar per active project', icon: TrendingUp, accent: 'label-green', w: 4, h: 2, tier: 'free' },
  { type: 'recently-completed', title: 'Recently Completed', desc: 'Latest tasks & checklist items finished', icon: History, accent: 'label-blue', w: 4, h: 3, tier: 'free' },
  { type: 'priority-breakdown', title: 'Priority Breakdown', desc: 'Active tasks by High / Medium / Low priority', icon: PieChart, accent: 'label-purple', w: 4, h: 2, tier: 'free' },
  { type: 'tags-overview', title: 'Tags Overview', desc: 'Tasks grouped by tag with count per tag', icon: Tags, accent: 'label-pink', w: 4, h: 2, tier: 'free' },
  { type: 'advanced-insights', title: 'Advanced Insights', desc: 'Avg completion time, busiest day, 30-day trend', icon: LineChart, accent: 'label-blue', w: 4, h: 3, tier: 'premium' },
  { type: 'custom-report', title: 'Custom Report Widget', desc: 'Pick a metric and date range to track', icon: SlidersHorizontal, accent: 'label-purple', w: 4, h: 3, tier: 'premium' },
  { type: 'multi-project', title: 'Multi-Project Comparison', desc: 'Side-by-side progress bars across projects', icon: GitCompareArrows, accent: 'label-orange', w: 4, h: 3, tier: 'premium' },
  { type: 'ai-score', title: 'AI Productivity Score', desc: 'AI-generated score and focus areas, live', icon: Gauge, accent: 'label-green', w: 4, h: 2, tier: 'pro' },
  { type: 'ai-prioritize', title: 'AI Task Prioritizer', desc: 'AI-ranked "what to do next" with reasons', icon: ListOrdered, accent: 'label-blue', w: 4, h: 3, tier: 'pro' },
  { type: 'ai-bottlenecks', title: 'AI Bottleneck Detector', desc: 'AI-flagged stalling tasks and why', icon: Siren, accent: 'label-red', w: 4, h: 3, tier: 'pro' },
  { type: 'ai-weekly', title: 'AI Weekly Summary', desc: 'Natural-language recap of your week', icon: MessageSquareText, accent: 'label-purple', w: 8, h: 2, tier: 'pro' },
];

const TIER_SECTIONS: { tier: DashboardWidgetTier; label: string }[] = [
  { tier: 'free', label: 'Free' },
  { tier: 'premium', label: 'Premium' },
  { tier: 'pro', label: 'Pro' },
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

const packLayout = (widgets: DashboardWidget[]): DashboardWidget[] => {
  const sorted = [...widgets].sort((a, b) => (a.row - b.row) || (a.col - b.col));
  const result: DashboardWidget[] = [];
  for (const w of sorted) {
    const cur = { ...w };
    let guard = 0;
    // Pull the widget up to the highest free position so gaps above get filled.
    while (guard < 200) {
      if (cur.row <= 1) break;
      const up = { ...cur, row: cur.row - 1 };
      if (result.some(o => intersects(up, o))) break;
      cur.row = up.row;
      guard += 1;
    }
    // If it still overlaps a previously placed (upper) widget — because it could
    // not move up — push it down below that widget so nothing stacks on top of
    // another. Without this, dropped/removed/loaded layouts can leave widgets
    // overlapping ("hovering" on one another).
    guard = 0;
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

// Guarantee no two widgets intersect. If a `movedId` is supplied the moved
// widget keeps its target position and every colliding widget is pushed down
// beneath it; otherwise the whole set is packed (pulled up + pushed down).
// This is the single source of truth for non-overlapping placement and is
// applied to every layout-affecting operation and to the rendered layout.
const resolveCollisions = (widgets: DashboardWidget[], movedId?: string): DashboardWidget[] => {
  if (movedId) {
    const moved = widgets.find(w => w.id === movedId);
    if (!moved) return packLayout(widgets);
    const rest = widgets.filter(w => w.id !== movedId).sort((a, b) => (a.row - b.row) || (a.col - b.col));
    const placed: DashboardWidget[] = [{ ...moved }];
    for (const w of rest) {
      let cur = { ...w };
      let guard = 0;
      while (guard < 200) {
        const hit = placed.find(o => intersects(cur, o));
        if (!hit) break;
        cur.row = hit.row + hit.h;
        guard += 1;
      }
      placed.push(cur);
    }
    return placed;
  }
  return packLayout(widgets);
};

type Gesture =
  | { mode: 'move' | 'resize'; w: DashboardWidget; sx: number; sy: number; lastX: number; lastY: number; col: number; row: number; ww: number; hh: number }
  | { mode: 'panel'; def: WidgetDef; sx: number; sy: number; lastX: number; lastY: number; col: number; row: number; ww: number; hh: number };

const GRID_GAP_TOTAL = (GRID_COLS - 1) * GAP_PX;

const cellStyle = (r: Rect): React.CSSProperties => ({
  left: `calc((100% - ${GRID_GAP_TOTAL}px) * ${(r.col - 1) / GRID_COLS} + ${(r.col - 1) * GAP_PX}px)`,
  top: (r.row - 1) * CELL_H,
  width: `calc((100% - ${GRID_GAP_TOTAL}px) * ${r.w / GRID_COLS} + ${(r.w - 1) * GAP_PX}px)`,
  height: r.h * ROW_PX + (r.h - 1) * GAP_PX,
});

const DAY_MS = 24 * 60 * 60 * 1000;
const localDayKey = (d: Date) => { const c = new Date(d); c.setHours(0, 0, 0, 0); return c.getTime(); };
const dueEnd = (t: Task) => t.dueTime ? new Date(`${t.dueDate}T${t.dueTime}`) : new Date(`${t.dueDate}T23:59:59`);
const isTaskDone = (t: Task, doneColIds: string[]) => Boolean(t.completed || t.status === 'completed' || doneColIds.includes(t.columnId));

const formatShortDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const timeAgo = (ts: number) => {
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return 'just now';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
};

const AiWidgetStatus: React.FC<{ loading?: boolean; error?: string | null; onRetry: () => void }> = ({ loading, error, onRetry }) => (
  <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
    {loading ? (
      <>
        <div className="w-6 h-6 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <p className="text-xs text-muted-foreground">AI is analysing your tasks…</p>
      </>
    ) : error ? (
      <>
        <div className="w-9 h-9 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-4 h-4 text-destructive" />
        </div>
        <p className="text-xs text-muted-foreground max-w-[220px] leading-snug">{error}</p>
        <button onClick={onRetry} className="text-[11px] font-bold text-primary hover:underline">Try again</button>
      </>
    ) : null}
  </div>
);

const MiniBars: React.FC<{ values: number[]; accent: string; active?: number; containerClass?: string }> = ({ values, accent, active, containerClass }) => {
  const max = Math.max(...values, 1);
  return (
    <div className={`flex items-end gap-[3px] ${containerClass || 'h-16'}`}>
      {values.map((v, i) => (
        <div key={i} className="flex-1 flex items-end h-full">
          <div
            className="w-full rounded-t-sm transition-all duration-500"
            style={{
              height: v > 0 ? `${Math.max(10, (v / max) * 100)}%` : '5px',
              background: active != null && i === active ? `hsl(var(--${accent}))` : `hsl(var(--${accent}) / 0.22)`,
              boxShadow: active != null && i === active ? `0 6px 14px -8px hsl(var(--${accent}) / 0.5)` : 'none',
            }}
          />
        </div>
      ))}
    </div>
  );
};

const LockedWidget: React.FC<{ tierLabel: string; onUpgrade: () => void }> = ({ tierLabel, onUpgrade }) => (
  <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
    <div className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center">
      <Lock className="w-4 h-4 text-muted-foreground" />
    </div>
    <p className="text-[11px] font-bold text-foreground uppercase tracking-wide">{tierLabel} widget</p>
    <p className="text-xs text-muted-foreground max-w-[220px] leading-snug">Upgrade your plan to unlock this widget on your dashboard.</p>
    <button onClick={onUpgrade} className="mt-1 px-4 py-2 text-xs font-bold text-white rounded-lg bg-primary hover:bg-primary/90 transition-all">
      Upgrade
    </button>
  </div>
);

const Dashboard: React.FC = () => {
  const { board, updateTask } = useBoardContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { open: openDeepFocus } = useDeepFocus();
  const [showAddTask, setShowAddTask] = useState(false);
  const [energySettings, setEnergySettings] = useState({
    energyMorning: 'medium' as 'low' | 'medium' | 'high',
    energyAfternoon: 'high' as 'low' | 'medium' | 'high',
    energyEvening: 'low' as 'low' | 'medium' | 'high',
  });
  const [energyConfigured, setEnergyConfigured] = useState(false);
  const [deepFocusMinutes, setDeepFocusMinutes] = useState(0);
  const [sharedTags, setSharedTags] = useState<SharedTag[]>([]);
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [taskPickerQuery, setTaskPickerQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tags = await fetchTags();
        if (!cancelled) setSharedTags(tags);
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

  const deleteTagEverywhere = async (tagId: string) => {
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
  };

  const renameTagEverywhere = async (tagId: string, newName: string) => {
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

    board.tasks.forEach(t => {
      if (t.labels.some(label => label.id === tagId)) {
        updateTask(t.id, { labels: t.labels.map(label => label.id === tagId ? { ...label, name } : label) });
      }
    });
  };

  const changeTagColorEverywhere = async (tagId: string, color: LabelColor) => {
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

    board.tasks.forEach(t => {
      if (t.labels.some(label => label.id === tagId)) {
        updateTask(t.id, { labels: t.labels.map(label => label.id === tagId ? { ...label, color } : label) });
      }
    });
  };

  const [showCustomize, setShowCustomize] = useState(false);
  const [layout, setLayout] = useState<DashboardWidget[]>([]);
  const [draft, setDraft] = useState<Rect | null>(null);
  const [previewLayout, setPreviewLayout] = useState<DashboardWidget[] | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [suppressMotion, setSuppressMotion] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollElRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const draftRef = useRef<Rect | null>(null);
  const layoutRef = useRef<DashboardWidget[]>([]);
  const bodyRefs = useRef(new Map<string, HTMLDivElement | null>());
  const panelPendingRef = useRef<{ def: WidgetDef; sx: number; sy: number } | null>(null);
  const autoScrollRaf = useRef(0);

  const layoutKey = `dash_widgets_v2_${user?.id ?? 'anon'}`;

  const defaultLayout = (): DashboardWidget[] => {
    const w = (type: DashboardWidgetType, title: string, col: number, row: number, wd: number, ht: number, projectId?: number | null): DashboardWidget => ({
      id: `${type}-${row}-${col}-${genKey()}`, type, title, col, row, w: wd, h: ht, projectId,
    });
    return [
      w('stats', 'Stats Overview', 1, 1, 8, 2),
      w('tasks', 'Tasks', 1, 3, 8, 3),
      w('peak-hours', 'Your Peak Hours', 9, 1, 4, 1),
      w('energy', 'Energy-Aware Recommendations', 9, 2, 4, 3),
      w('weekly', 'Weekly Activity', 9, 5, 4, 2),
      w('account', 'Account Status', 5, 7, 4, 1),
      w('insights', 'Insights', 1, 8, 4, 2),
    ];
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(layoutKey);
      if (raw) {
        const parsed = JSON.parse(raw) as DashboardWidget[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const known = parsed.filter((w: DashboardWidget) => WIDGET_DEFS.some(d => d.type === w.type));
          if (known.length > 0) { setLayout(packLayout(known)); return; }
        }
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

  const pickedTasks = useMemo(() => {
    const q = taskPickerQuery.trim().toLowerCase();
    const sorted = [...activeTasks].sort((a, b) => {
      const order = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      return (order[a.priority] - order[b.priority]) || a.title.localeCompare(b.title);
    });
    if (!q) return sorted;
    return sorted.filter(t =>
      t.title.toLowerCase().includes(q) || (t.projectName || '').toLowerCase().includes(q)
    );
  }, [activeTasks, taskPickerQuery]);

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

  const tier: DashboardWidgetTier = user?.subscriptionTier === 'pro'
    ? 'pro'
    : user?.subscriptionTier === 'premium'
      ? 'premium'
      : 'free';
  const TIER_RANK: Record<DashboardWidgetTier, number> = { free: 0, premium: 1, pro: 2 };
  const canAccessTier = (widgetTier: DashboardWidgetTier) => TIER_RANK[tier] >= TIER_RANK[widgetTier];

  const streakDays = useMemo(() => {
    const days = new Set<number>();
    for (const t of board.tasks) {
      if (!isTaskDone(t, doneColIds)) continue;
      const src = t.completedAt || t.updatedAt;
      if (!src) continue;
      const d = new Date(src);
      if (Number.isNaN(d.getTime())) continue;
      days.add(localDayKey(d));
    }
    let streak = 0;
    const cursor = new Date();
    if (!days.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    while (days.has(localDayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }, [board.tasks, doneColIds]);

  const overdueTasks = useMemo(
    () => activeTasks
      .filter(t => t.dueDate && !Number.isNaN(dueEnd(t).getTime()) && dueEnd(t).getTime() < Date.now())
      .sort((a, b) => dueEnd(a).getTime() - dueEnd(b).getTime()),
    [activeTasks]
  );

  const upcomingDeadlines = useMemo(
    () => activeTasks
      .filter(t => {
        if (!t.dueDate) return false;
        const due = dueEnd(t);
        if (Number.isNaN(due.getTime())) return false;
        const days = (due.getTime() - Date.now()) / DAY_MS;
        return days >= 3 && days <= 7;
      })
      .sort((a, b) => dueEnd(a).getTime() - dueEnd(b).getTime()),
    [activeTasks]
  );

  const recentlyCompleted = useMemo(() => {
    const feed: Array<{ id: string; title: string; time: number; items: string[] }> = [];
    for (const t of board.tasks) {
      if (!isTaskDone(t, doneColIds)) continue;
      const src = t.completedAt || t.updatedAt;
      if (!src) continue;
      const d = new Date(src);
      if (Number.isNaN(d.getTime())) continue;
      const items = t.checklists.flatMap(l => l.items.filter(i => i.completed).map(i => i.text));
      feed.push({ id: t.id, title: t.title, time: d.getTime(), items });
    }
    return feed.sort((a, b) => b.time - a.time).slice(0, 6);
  }, [board.tasks, doneColIds]);

  const priorityBreakdown = useMemo(() => {
    const order: Array<Exclude<Priority, 'none'>> = ['urgent', 'high', 'medium', 'low'];
    return order.map(p => ({
      priority: p,
      count: activeTasks.filter(t => t.priority === p).length,
      className: PRIORITY_CONFIG[p]?.className || 'bg-muted',
    }));
  }, [activeTasks]);

  const advancedInsights = useMemo(() => {
    const completedWithDates: Array<{ start: number; end: number; weekday: number }> = [];
    for (const t of board.tasks) {
      if (!isTaskDone(t, doneColIds)) continue;
      const endSrc = t.completedAt || t.updatedAt;
      if (!endSrc) continue;
      const end = new Date(endSrc);
      if (Number.isNaN(end.getTime())) continue;
      if (t.createdAt) {
        const start = new Date(t.createdAt);
        if (!Number.isNaN(start.getTime()) && end.getTime() >= start.getTime()) {
          completedWithDates.push({ start: start.getTime(), end: end.getTime(), weekday: end.getDay() });
        }
      }
    }
    const avgHours = completedWithDates.length > 0
      ? completedWithDates.reduce((s, c) => s + (c.end - c.start), 0) / completedWithDates.length / 3600000
      : null;
    const weekdayCounts = new Array(7).fill(0);
    for (const c of completedWithDates) weekdayCounts[c.weekday] += 1;
    const busiestIdx = weekdayCounts.indexOf(Math.max(...weekdayCounts));
    const busiestDay = Math.max(...weekdayCounts) > 0
      ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][busiestIdx]
      : null;
    const trend30 = new Array(30).fill(0);
    const todayStart = localDayKey(new Date());
    for (const t of board.tasks) {
      if (!isTaskDone(t, doneColIds)) continue;
      const src = t.completedAt || t.updatedAt;
      if (!src) continue;
      const d = new Date(src);
      if (Number.isNaN(d.getTime())) continue;
      const idx = Math.floor((todayStart - localDayKey(d)) / DAY_MS);
      if (idx >= 0 && idx < 30) trend30[29 - idx] += 1;
    }
    return { avgHours, busiestDay, trend30 };
  }, [board.tasks, doneColIds]);

  const buildReportSeries = useCallback((metric: ReportMetric, days: number): number[] => {
    const series = new Array(days).fill(0);
    const startKey = localDayKey(new Date()) - (days - 1) * DAY_MS;
    for (const t of board.tasks) {
      const done = isTaskDone(t, doneColIds);
      if (metric === 'checklist' && done) {
        for (const l of t.checklists) {
          for (const item of l.items) {
            if (!item.completed) continue;
            const src = t.completedAt || t.updatedAt;
            if (!src) continue;
            const d = new Date(src);
            if (Number.isNaN(d.getTime())) continue;
            const k = localDayKey(d);
            if (k >= startKey && k <= startKey + (days - 1) * DAY_MS) series[(k - startKey) / DAY_MS] += 1;
          }
        }
      }
      const src = metric === 'created' ? t.createdAt : done ? (t.completedAt || t.updatedAt) : null;
      if (!src) continue;
      const d = new Date(src);
      if (Number.isNaN(d.getTime())) continue;
      const k = localDayKey(d);
      if (k >= startKey && k <= startKey + (days - 1) * DAY_MS) series[(k - startKey) / DAY_MS] += 1;
    }
    return series;
  }, [board.tasks, doneColIds]);

  const [aiState, setAiState] = useState<{ data: any; loading: boolean; error: string | null }>({ data: null, loading: false, error: null });

  const hasAiWidget = useMemo(
    () => layout.some(w => ['ai-score', 'ai-prioritize', 'ai-bottlenecks', 'ai-weekly'].includes(w.type)),
    [layout]
  );

  const loadAiWidgets = useCallback(async () => {
    if (!canAccessTier('pro')) {
      setAiState({ data: null, loading: false, error: null });
      return;
    }
    setAiState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch('/api/ai/pro/dashboard-widgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tasks: board.tasks.map(t => ({
            id: t.id,
            title: t.title,
            priority: t.priority,
            status: t.status || (isTaskDone(t, doneColIds) ? 'completed' : 'to_do'),
            completed: isTaskDone(t, doneColIds),
            dueDate: t.dueDate || null,
            dueTime: t.dueTime || null,
            duration: Number(t.duration) || 0,
            projectName: t.projectName || null,
            createdAt: t.createdAt || null,
            completedAt: t.completedAt || null,
            updatedAt: t.updatedAt || null,
          })),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'AI request failed');
      }
      setAiState({ data: await res.json(), loading: false, error: null });
    } catch (err) {
      setAiState(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'AI request failed. Please try again.',
      }));
    }
  }, [board.tasks, doneColIds]);

  useEffect(() => {
    if (hasAiWidget) loadAiWidgets();
  }, [hasAiWidget, loadAiWidgets]);

  const stats = [
    { label: 'Tasks Active', value: activeTasks.length, icon: CheckSquare, accent: 'label-purple' },
    { label: 'Completion', value: `${completionRate}%`, icon: TrendingUp, accent: 'label-green' },
    { label: 'Deep Work', value: `${(deepFocusMinutes / 60).toFixed(1)}h`, icon: Clock, accent: 'label-blue' },
    { label: 'Daily Streak', value: `${streakDays}d`, icon: Flame, accent: 'label-orange' },
  ];

  const handleAddTask = () => {
    setShowAddTask(true);
  };

  const cellFromPoint = useCallback((clientX: number, clientY: number) => {
    const el = gridRef.current;
    if (!el) return { col: 1, row: 1 };
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return { col: 1, row: 1 };
    const colW = rect.width / GRID_COLS;
    const x = clientX - rect.left;
    const y = clientY - rect.top + (scrollElRef.current ? scrollElRef.current.scrollTop : 0);
    return {
      col: clamp(Math.floor(x / colW) + 1, 1, GRID_COLS),
      row: Math.max(1, Math.floor(y / CELL_H) + 1),
    };
  }, []);

  const hasWidget = (type: DashboardWidgetType) => layout.some(w => w.type === type);

  const removeWidget = (id: string) => setLayout(prev => packLayout(prev.filter(w => w.id !== id)));
  const updateWidget = (id: string, patch: Partial<DashboardWidget>) =>
    setLayout(prev => resolveCollisions(prev.map(w => w.id === id ? { ...w, ...patch } : w), id));

  const solveLayout = (g: NonNullable<typeof gestureRef.current>, rect: Rect) => {
    const others = layoutRef.current.filter(o => g.mode === 'panel' || o.id !== g.w.id);
    const active: DashboardWidget = g.mode === 'panel'
      ? { id: '__dragging__', type: g.def.type, title: g.def.title, col: rect.col, row: rect.row, w: rect.w, h: rect.h }
      : { ...g.w, col: rect.col, row: rect.row, w: rect.w, h: rect.h };
    // Place the dragged widget at its target first and push colliding widgets
    // down, so moving upward never fights the user.
    const rest = [...others].sort((a, b) => (a.row - b.row) || (a.col - b.col));
    const placed: DashboardWidget[] = [active];
    for (const w of rest) {
      let cur = { ...w };
      let guard = 0;
      while (guard < 200) {
        const hit = placed.find(o => intersects(cur, o));
        if (!hit) break;
        cur.row = hit.row + hit.h;
        guard += 1;
      }
      placed.push(cur);
    }
    const solved = placed.find(o => o.id === active.id) ?? active;
    return { widgets: placed, activeRect: { col: solved.col, row: solved.row, w: solved.w, h: solved.h } };
  };

  const stopAutoScroll = () => {
    if (autoScrollRaf.current) cancelAnimationFrame(autoScrollRaf.current);
    autoScrollRaf.current = 0;
  };

  const startAutoScroll = () => {
    if (autoScrollRaf.current) return;
    const tick = () => {
      const g = gestureRef.current;
      const el = scrollElRef.current;
      if (!g || !el) { autoScrollRaf.current = 0; return; }
      const r = el.getBoundingClientRect();
      const margin = 70;
      let dy = 0;
      if (g.lastY < r.top + margin) dy = -((r.top + margin - g.lastY) / margin) * 22;
      else if (g.lastY > r.bottom - margin) dy = ((g.lastY - (r.bottom - margin)) / margin) * 22;
      if (dy !== 0) el.scrollTop = clamp(el.scrollTop + dy, 0, Math.max(0, el.scrollHeight - el.clientHeight));
      autoScrollRaf.current = requestAnimationFrame(tick);
    };
    autoScrollRaf.current = requestAnimationFrame(tick);
  };

  const onGestureMove = (e: PointerEvent) => {
    const g = gestureRef.current;
    const el = gridRef.current;
    if (!g || !el) return;
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    const bounds = el.getBoundingClientRect();
    const tol = 24;
    // Allow dragging below the grid's bottom edge so widgets can be moved
    // beneath everything else (the grid grows as the drag goes further down).
    if (e.clientX < bounds.left - tol || e.clientX > bounds.right + tol ||
        e.clientY < bounds.top - tol) {
      cancelGesture();
      return;
    }
    const cell = cellFromPoint(e.clientX, e.clientY);
    let rect: Rect;
    if (g.mode === 'resize') {
      const colW = bounds.width / GRID_COLS;
      const dw = Math.round((e.clientX - g.sx) / colW);
      const dh = Math.round((e.clientY - g.sy) / CELL_H);
      rect = { col: g.col, row: g.row, w: clamp(g.ww + dw, 1, GRID_COLS - g.col + 1), h: clamp(g.hh + dh, 1, 30) };
    } else {
      const col = clamp(cell.col - Math.round((g.ww - 1) / 2), 1, GRID_COLS - g.ww + 1);
      const row = Math.max(1, cell.row - Math.round((g.hh - 1) / 2));
      rect = { col, row, w: g.ww, h: g.hh };
    }
    const { widgets, activeRect } = solveLayout(g, rect);
    draftRef.current = activeRect;
    setDraft(activeRect);
    setPreviewLayout(widgets);
  };

  const onGestureEnd = () => {
    const g = gestureRef.current;
    window.removeEventListener('pointermove', onGestureMove);
    window.removeEventListener('pointerup', onGestureEnd);
    window.removeEventListener('pointercancel', onGestureEnd);
    window.removeEventListener('keydown', onGestureKey);
    stopAutoScroll();
    const finalRect = draftRef.current;
    gestureRef.current = null;
    draftRef.current = null;
    setDraft(null);
    setPreviewLayout(null);
    setActiveDragId(null);
    if (g && finalRect) {
      if (g.mode === 'panel') {
        const def = g.def;
        const widget: DashboardWidget = { id: genKey(), type: def.type, title: def.title, col: finalRect.col, row: finalRect.row, w: def.w, h: def.h };
        setLayout(prev => packLayout([...prev, widget]));
      } else {
        setLayout(prev => packLayout(prev.map(wg => wg.id === g.w.id
          ? { ...wg, col: finalRect.col, row: finalRect.row, w: finalRect.w, h: finalRect.h }
          : wg)));
      }
    }
  };

  const cancelGesture = () => {
    const g = gestureRef.current;
    if (!g) return;
    window.removeEventListener('pointermove', onGestureMove);
    window.removeEventListener('pointerup', onGestureEnd);
    window.removeEventListener('pointercancel', onGestureEnd);
    window.removeEventListener('keydown', onGestureKey);
    stopAutoScroll();
    gestureRef.current = null;
    panelPendingRef.current = null;
    draftRef.current = null;
    setDraft(null);
    setPreviewLayout(null);
    setActiveDragId(null);
    setSuppressMotion(true);
    requestAnimationFrame(() => setSuppressMotion(false));
  };

  const onGestureKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cancelGesture();
  };

  const startGesture = (e: React.PointerEvent, widget: DashboardWidget, mode: 'move' | 'resize') => {
    if (e.button !== 0) return;
    e.preventDefault();
    gestureRef.current = { mode, w: widget, sx: e.clientX, sy: e.clientY, lastX: e.clientX, lastY: e.clientY, col: widget.col, row: widget.row, ww: widget.w, hh: widget.h };
    const start: Rect = { col: widget.col, row: widget.row, w: widget.w, h: widget.h };
    draftRef.current = start;
    setDraft(start);
    setActiveDragId(widget.id);
    setSuppressMotion(false);
    const solved = solveLayout(gestureRef.current, start);
    setPreviewLayout(solved.widgets);
    window.addEventListener('pointermove', onGestureMove);
    window.addEventListener('pointerup', onGestureEnd);
    window.addEventListener('pointercancel', onGestureEnd);
    window.addEventListener('keydown', onGestureKey);
    startAutoScroll();
  };

  const onPanelItemPointerDown = (def: WidgetDef) => (e: React.PointerEvent) => {
    if (hasWidget(def.type)) return;
    if (e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    panelPendingRef.current = { def, sx, sy };
    const onMove = (ev: PointerEvent) => {
      const p = panelPendingRef.current;
      if (!p) return;
      if (Math.hypot(ev.clientX - p.sx, ev.clientY - p.sy) < 6) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      panelPendingRef.current = null;
      setPanelClosing(true);
      window.setTimeout(() => { setShowCustomize(false); setPanelClosing(false); }, 200);
      const cell = cellFromPoint(ev.clientX, ev.clientY);
      gestureRef.current = { mode: 'panel', def: p.def, sx, sy, lastX: ev.clientX, lastY: ev.clientY, col: 1, row: 1, ww: p.def.w, hh: p.def.h };
      setActiveDragId('__dragging__');
      setSuppressMotion(false);
      const rect: Rect = { col: clamp(cell.col - Math.round((p.def.w - 1) / 2), 1, GRID_COLS - p.def.w + 1), row: Math.max(1, cell.row - Math.round((p.def.h - 1) / 2)), w: p.def.w, h: p.def.h };
      const solved = solveLayout(gestureRef.current, rect);
      draftRef.current = solved.activeRect;
      setDraft(solved.activeRect);
      setPreviewLayout(solved.widgets);
      window.addEventListener('pointermove', onGestureMove);
      window.addEventListener('pointerup', onGestureEnd);
      window.addEventListener('pointercancel', onGestureEnd);
      window.addEventListener('keydown', onGestureKey);
      startAutoScroll();
    };
    const onUp = () => {
      panelPendingRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const renderWidgetBody = (widget: DashboardWidget) => {
    const def = WIDGET_DEFS.find(d => d.type === widget.type);
    const accent = def?.accent || 'label-blue';
    switch (widget.type) {
      case 'stats':
        return (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-1">
            {stats.map((stat, i) => {
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
                {priorityTasks.map((task, i) => {
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
                        {task.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>}
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium border border-border text-muted-foreground bg-muted/50">
                        {col?.title}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              className="w-full mt-3 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 text-white transition-all duration-200 hover:scale-[1.01]"
              style={{ background: 'hsl(var(--primary))', boxShadow: '0 8px 18px -12px hsl(228 25% 25% / 0.4)' }}
              onClick={() => setShowTaskPicker(true)}
            >
              <Zap className="w-4 h-4" /> Start Deep Work
            </button>
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
                {projectsInfo.slice(0, 6).map(p => (
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
          ? board.tasks.filter(t => t.projectId === proj.id && !(doneColIds.includes(t.columnId) || t.completed)).slice(0, 6)
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
                  <Select
                    value={String(widget.projectId ?? proj?.id ?? '')}
                    onValueChange={v => {
                      const n = Number(v);
                      updateWidget(widget.id, { projectId: Number.isFinite(n) && n > 0 ? n : null });
                    }}
                  >
                    <SelectTrigger className="w-full rounded-lg px-3 py-2 text-sm font-medium text-foreground h-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {projectsInfo.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
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
            <button onClick={() => navigate('/insights')}
              className="mt-3 w-full py-2 rounded-lg text-xs font-bold text-white flex items-center justify-center gap-1.5 transition-all hover:scale-[1.01]"
style={{ background: 'hsl(var(--primary))' }}>
              Open full Insights <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        );
      case 'peak-hours':
        return (
          <div className="flex flex-wrap gap-2 mt-1">
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
        );
      case 'weekly':
        return (
          <div className="flex items-end gap-2 h-24 mt-1">
            {weekDays.map((day, i) => {
              const height = weeklyData[i] > 0 ? Math.max(10, (weeklyData[i] / maxWeekly) * 80) : 6;
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
                  <span className="text-[10px] text-muted-foreground">{day}</span>
                </div>
              );
            })}
          </div>
        );
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
          </div>
        );
      }
      case 'overdue':
        return (
          <div>
            {overdueTasks.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle2 className="w-8 h-8 opacity-40 mx-auto mb-2" style={{ color: 'hsl(var(--label-green))' }} />
                <p className="text-sm text-muted-foreground">All caught up — no overdue tasks!</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {overdueTasks.slice(0, 5).map(t => {
                  const overdueDays = Math.max(1, Math.floor((Date.now() - dueEnd(t).getTime()) / DAY_MS));
                  const cfg = t.priority !== 'none' ? PRIORITY_CONFIG[t.priority] : null;
                  return (
                    <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg"
                      style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(var(--label-red))' }} />
                      <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">{t.title}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: 'hsl(var(--label-red))' }}>
                        {cfg ? cfg.label : 'Open'} · {overdueDays}d late
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {overdueTasks.length > 5 && (
              <p className="text-[10px] text-muted-foreground text-center mt-2">+{overdueTasks.length - 5} more overdue</p>
            )}
          </div>
        );
      case 'deadlines':
        return (
          <div>
            {upcomingDeadlines.length === 0 ? (
              <div className="text-center py-6">
                <Flag className="w-8 h-8 opacity-40 mx-auto mb-2" style={{ color: `hsl(var(--${accent}))` }} />
                <p className="text-sm text-muted-foreground">No deadlines in the next 7 days</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {upcomingDeadlines.slice(0, 5).map(t => {
                  const days = Math.max(1, Math.ceil((dueEnd(t).getTime() - Date.now()) / DAY_MS));
                  const cfg = t.priority !== 'none' ? PRIORITY_CONFIG[t.priority] : null;
                  return (
                    <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg"
                      style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
                      <Flag className="w-3.5 h-3.5 flex-shrink-0" style={{ color: `hsl(var(--${accent}))` }} />
                      <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">{t.title}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${cfg?.className || 'bg-muted'} text-primary-foreground shrink-0`}>
                        {cfg?.label || ''} {days}d
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      case 'project-progress':
        return (
          <div className="space-y-2.5 mt-1">
            {projectsInfo.length === 0 ? (
              <div className="text-center py-6">
                <FolderOpen className="w-8 h-8 opacity-40 mx-auto mb-2" style={{ color: `hsl(var(--${accent}))` }} />
                <p className="text-sm text-muted-foreground">No projects yet</p>
              </div>
            ) : (
              projectsInfo.slice(0, 6).map(p => {
                const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1.5 min-w-0 text-xs font-medium text-foreground truncate">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted) / 0.6)' }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'hsl(var(--label-green))' }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        );
      case 'recently-completed':
        return (
          <div>
            {recentlyCompleted.length === 0 ? (
              <div className="text-center py-6">
                <History className="w-8 h-8 opacity-40 mx-auto mb-2" style={{ color: `hsl(var(--${accent}))` }} />
                <p className="text-sm text-muted-foreground">No completed tasks yet</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentlyCompleted.map(r => (
                  <div key={r.id} className="p-2 rounded-lg"
                    style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(var(--label-green))' }} />
                      <span className="flex-1 min-w-0 text-xs font-medium text-foreground truncate">{r.title}</span>
                      <span className="text-[9px] font-medium text-muted-foreground shrink-0">{timeAgo(r.time)}</span>
                    </div>
                    {r.items.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5 pl-5">
                        {r.items.slice(0, 3).map((item, i) => (
                          <span key={i} className="text-[9px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground bg-muted/50">
                            {item}
                          </span>
                        ))}
                        {r.items.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">+{r.items.length - 3} more</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'priority-breakdown': {
        const maxCount = Math.max(...priorityBreakdown.map(p => p.count), 1);
        return (
          <div className="mt-1">
            {priorityBreakdown.every(p => p.count === 0) ? (
              <div className="text-center py-6">
                <PieChart className="w-8 h-8 opacity-40 mx-auto mb-2" style={{ color: `hsl(var(--${accent}))` }} />
                <p className="text-sm text-muted-foreground">No prioritized active tasks</p>
              </div>
            ) : (
              <div className="space-y-2">
                {priorityBreakdown.map(p => (
                  <div key={p.priority}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-foreground capitalize">
                        <span className={`w-2 h-2 rounded-full ${p.className}`} />
                        {p.priority}
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground">{p.count}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted) / 0.6)' }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(p.count / maxCount) * 100}%`,
                          background: `hsl(var(--${accent}))`,
                          opacity: p.count === 0 ? 0.25 : 1,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }
      case 'tags-overview':
        return <TagsOverviewWidget tasks={board.tasks} doneColIds={doneColIds} />;
      case 'advanced-insights': {
        const total30 = advancedInsights.trend30.reduce((s, v) => s + v, 0);
        return (
          <div className="space-y-2.5 mt-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2.5 rounded-lg" style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
                <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Avg completion</p>
                <p className="text-base font-black text-foreground mt-0.5">
                  {advancedInsights.avgHours != null ? `${advancedInsights.avgHours.toFixed(1)}h` : '—'}
                </p>
              </div>
              <div className="p-2.5 rounded-lg" style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
                <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Busiest day</p>
                <p className="text-base font-black text-foreground mt-0.5">{advancedInsights.busiestDay || '—'}</p>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground">30-day trend</p>
                <p className="text-[10px] font-semibold text-muted-foreground">{total30} completed</p>
              </div>
              <MiniBars values={advancedInsights.trend30} accent={accent} containerClass="h-12" />
            </div>
          </div>
        );
      }
      case 'custom-report': {
        const metric = widget.metric || 'completed';
        const range = widget.range || 14;
        const series = buildReportSeries(metric, range);
        const total = series.reduce((s, v) => s + v, 0);
        const maxSeries = Math.max(...series, 1);
        const metricLabel = metric === 'created' ? 'Created' : metric === 'checklist' ? 'Checklist items done' : 'Completed';
        return (
          <div className="mt-1">
            <div className="flex gap-2 mb-3">
              <Select value={metric} onValueChange={v => updateWidget(widget.id, { metric: v as ReportMetric })}>
                <SelectTrigger className="flex-1 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground h-auto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="checklist">Checklist items</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(range)} onValueChange={v => updateWidget(widget.id, { range: Number(v) })}>
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
            {total === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-muted-foreground">No {metricLabel.toLowerCase()} in this range yet</p>
              </div>
            ) : (
              <>
                <MiniBars values={series} accent={accent} containerClass="h-14" />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[10px] font-bold text-foreground">{total} {metricLabel.toLowerCase()}</p>
                  <p className="text-[10px] text-muted-foreground">peak {maxSeries}/day</p>
                </div>
              </>
            )}
          </div>
        );
      }
      case 'multi-project':
        return (
          <div className="space-y-2.5 mt-1">
            {projectsInfo.length === 0 ? (
              <div className="text-center py-6">
                <GitCompareArrows className="w-8 h-8 opacity-40 mx-auto mb-2" style={{ color: `hsl(var(--${accent}))` }} />
                <p className="text-sm text-muted-foreground">No projects yet</p>
              </div>
            ) : (
              projectsInfo.slice(0, 6).map(p => {
                const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="flex items-center gap-1.5 min-w-0 text-xs font-medium text-foreground truncate">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        {p.name}
                      </span>
                      <span className="text-[10px] font-semibold text-muted-foreground">{p.done}/{p.total} · {pct}%</span>
                    </div>
                    <div className="flex gap-1 h-2 rounded-full overflow-hidden" style={{ background: 'hsl(var(--muted) / 0.6)' }}>
                      <div className="rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: 'hsl(var(--label-green))' }} />
                      <div className="rounded-full flex-1 transition-all duration-500" style={{ background: `hsl(var(--${accent}) / 0.25)` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        );
      case 'ai-score': {
        if (!canAccessTier('pro')) return <LockedWidget tierLabel="Pro" onUpgrade={() => navigate('/pricing')} />;
        if (aiState.loading || aiState.error) return <AiWidgetStatus loading={aiState.loading} error={aiState.error} onRetry={loadAiWidgets} />;
        const score = aiState.data?.productivityScore;
        return (
          <div className="mt-1">
            {score ? (
              <div className="flex items-start gap-4">
                <div className="relative w-20 h-20 flex-shrink-0">
                  <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="32" fill="none" strokeWidth="9" style={{ stroke: `hsl(var(--${accent}) / 0.14)` }} />
                    <circle cx="40" cy="40" r="32" fill="none" strokeWidth="9" strokeLinecap="round"
                      strokeDasharray={`${Math.max(0, Math.min(100, score.score)) * 2.01} 201`} style={{ stroke: `hsl(var(--${accent}))` }} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-lg font-black text-foreground">{score.score}</span>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <p className="text-[11px] font-bold text-foreground uppercase tracking-wide">AI Productivity Score</p>
                  <p className="text-xs text-muted-foreground leading-snug">{score.summary}</p>
                  {score.focusAreas.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {score.focusAreas.map((f: string, i: number) => (
                        <span key={i} className="text-[9px] font-bold px-2 py-0.5 rounded-full text-primary-foreground" style={{ background: 'hsl(var(--label-orange))' }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  <button onClick={loadAiWidgets} className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors">
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </button>
                </div>
              </div>
            ) : (
              <AiWidgetStatus onRetry={loadAiWidgets} />
            )}
          </div>
        );
      }
      case 'ai-prioritize': {
        if (!canAccessTier('pro')) return <LockedWidget tierLabel="Pro" onUpgrade={() => navigate('/pricing')} />;
        if (aiState.loading || aiState.error) return <AiWidgetStatus loading={aiState.loading} error={aiState.error} onRetry={loadAiWidgets} />;
        const nextTasks = Array.isArray(aiState.data?.nextTasks) ? aiState.data.nextTasks : null;
        return (
          <div className="mt-1">
            {nextTasks === null ? (
              <AiWidgetStatus onRetry={loadAiWidgets} />
            ) : nextTasks.length === 0 ? (
              <div className="text-center py-6">
                <ListOrdered className="w-8 h-8 opacity-40 mx-auto mb-2" style={{ color: `hsl(var(--${accent}))` }} />
                <p className="text-sm text-muted-foreground">No tasks to prioritize right now</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {nextTasks.map((nt: { id: string; reason: string }, i: number) => {
                  const task = board.tasks.find(t => String(t.id) === String(nt.id));
                  const cfg = task && task.priority !== 'none' ? PRIORITY_CONFIG[task.priority] : null;
                  return (
                    <div key={nt.id} className="flex items-start gap-2 p-2 rounded-lg"
                      style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
                      <span className="w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center text-[10px] font-black text-white mt-0.5"
                        style={{ background: `hsl(var(--${accent}))` }}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-foreground truncate">{task?.title || 'Task'}</p>
                          {cfg && <span className={`text-[8px] font-bold uppercase px-1 py-0.5 rounded ${cfg.className} text-primary-foreground shrink-0`}>{cfg.label}</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{nt.reason}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }
      case 'ai-bottlenecks': {
        if (!canAccessTier('pro')) return <LockedWidget tierLabel="Pro" onUpgrade={() => navigate('/pricing')} />;
        if (aiState.loading || aiState.error) return <AiWidgetStatus loading={aiState.loading} error={aiState.error} onRetry={loadAiWidgets} />;
        const bottlenecks = Array.isArray(aiState.data?.bottlenecks) ? aiState.data.bottlenecks : null;
        return (
          <div className="mt-1">
            {bottlenecks === null ? (
              <AiWidgetStatus onRetry={loadAiWidgets} />
            ) : bottlenecks.length === 0 ? (
              <div className="text-center py-6">
                <Siren className="w-8 h-8 opacity-40 mx-auto mb-2" style={{ color: 'hsl(var(--label-green))' }} />
                <p className="text-sm text-muted-foreground">No bottlenecks detected</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {bottlenecks.map((bn: { id: string; reason: string }) => {
                  const task = board.tasks.find(t => String(t.id) === String(bn.id));
                  return (
                    <div key={bn.id} className="p-2 rounded-lg"
                      style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
                      <div className="flex items-center gap-2">
                        <Siren className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'hsl(var(--label-red))' }} />
                        <p className="flex-1 min-w-0 text-xs font-semibold text-foreground truncate">{task?.title || 'Task'}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-snug mt-1 pl-5">{bn.reason}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }
      case 'ai-weekly': {
        if (!canAccessTier('pro')) return <LockedWidget tierLabel="Pro" onUpgrade={() => navigate('/pricing')} />;
        if (aiState.loading || aiState.error) return <AiWidgetStatus loading={aiState.loading} error={aiState.error} onRetry={loadAiWidgets} />;
        const summary = aiState.data?.weeklySummary || null;
        return (
          <div className="mt-1">
            {summary === null ? (
              <AiWidgetStatus onRetry={loadAiWidgets} />
            ) : (
              <div className="flex gap-2 p-3 rounded-lg"
                style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
                <MessageSquareText className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: `hsl(var(--${accent}))` }} />
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{summary}</p>
              </div>
            )}
          </div>
        );
      }
      case 'energy':
        return <EnergyTaskRecommendations tasks={board.tasks} energySettings={energySettings} configured={energyConfigured} />;
      default:
        return null;
    }
  };

  const gridHeight = useMemo(() => {
    const src = previewLayout ?? safeLayout;
    const bottom = src.reduce((mx, w) => Math.max(mx, (w.row - 1) * CELL_H + w.h * ROW_PX + (w.h - 1) * GAP_PX), 0);
    return bottom + GAP_PX;
  }, [layout, previewLayout]);

  const displacedIds = useMemo(() => {
    if (!previewLayout) return new Set<string>();
    const rest = new Map(layout.map(w => [w.id, w]));
    const out = new Set<string>();
    for (const w of previewLayout) {
      const orig = rest.get(w.id);
      if (!orig) continue;
      if (orig.col !== w.col || orig.row !== w.row || orig.w !== w.w || orig.h !== w.h) out.add(w.id);
    }
    return out;
  }, [layout, previewLayout]);

  // Final safety net: never render overlapping widgets, no matter how the
  // layout state was produced (load, resize, move, remove, edit, or a stale
  // persisted layout). Both previewLayout (during a gesture) and the committed
  // layout are guaranteed collision-free here.
  const safeLayout = useMemo(() => resolveCollisions(layout), [layout]);

  return (
    <>
      <div
        ref={scrollElRef}
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
          {layout.length === 0 && !previewLayout ? (
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
              className="relative"
              style={{ height: gridHeight }}
            >
              {(previewLayout ?? safeLayout).map(widget => {
                const def = WIDGET_DEFS.find(d => d.type === widget.type);
                const accent = def?.accent || 'label-blue';
                const isDisplaced = displacedIds.has(widget.id);
                return (
                  <div
                    key={widget.id}
                    className={`relative group/widget rounded-2xl overflow-hidden flex flex-col ${isDisplaced ? 'animate-widget-flash' : ''} ${activeDragId === widget.id ? 'z-10' : ''}`}
                    style={{
                      position: 'absolute',
                      ...cellStyle(widget),
                      background: cardStyle(accent).background,
                      border: activeDragId === widget.id ? '2px dashed hsl(var(--primary) / 0.55)' : cardStyle(accent).border,
                      boxShadow: cardStyle(accent).boxShadow,
                      transition: suppressMotion || activeDragId === widget.id
                        ? 'none'
                        : 'left 180ms cubic-bezier(0.22, 1, 0.36, 1), top 180ms cubic-bezier(0.22, 1, 0.36, 1), width 180ms cubic-bezier(0.22, 1, 0.36, 1), height 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                  >
                    <div className="flex items-center justify-between px-4 pt-3 pb-1 select-none shrink-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 flex-shrink-0 rounded-md flex items-center justify-center" style={{ background: `hsl(var(--${accent}) / 0.15)` }}>
                          {def && <def.icon className="w-3.5 h-3.5" style={{ color: `hsl(var(--${accent}))` }} />}
                        </div>
                        <h3 className="text-[11px] font-bold text-foreground truncate uppercase tracking-wide">{widget.title}</h3>
                      </div>
                      <div className={`flex items-center gap-0.5 transition-opacity ${draft ? 'pointer-events-none opacity-0' : 'opacity-0 group-hover/widget:opacity-100'}`}>
                        {widget.type === 'tags-overview' && (
                          <button
                            onClick={() => setTagsModalOpen(true)}
                            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted"
                            title="Edit tags"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onPointerDown={e => startGesture(e, widget, 'move')}
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
                    <div
                      ref={(el) => { if (el) bodyRefs.current.set(widget.id, el); else bodyRefs.current.delete(widget.id); }}
                      onWheel={(e) => {
                        const el = bodyRefs.current.get(widget.id);
                        if (!el) return;
                        const canScrollDown = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
                        const canScrollUp = el.scrollTop > 1;
                        if ((e.deltaY > 0 && canScrollDown) || (e.deltaY < 0 && canScrollUp)) {
                          e.preventDefault();
                          e.stopPropagation();
                          el.scrollBy({ top: e.deltaY, behavior: 'auto' });
                        }
                      }}
                      className="px-4 pb-4 overflow-y-auto min-h-0 flex-1"
                    >
                      {renderWidgetBody(widget)}
                    </div>
                    <div
                      onPointerDown={e => startGesture(e, widget, 'resize')}
                      className="absolute bottom-1 right-1 w-4 h-4 cursor-se-resize touch-none rounded-br-lg opacity-0 group-hover/widget:opacity-100"
                      style={{ background: 'linear-gradient(135deg, transparent 42%, hsl(0 0% 40% / 0.35))' }}
                      title="Resize"
                    />
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
            className={panelClosing ? 'absolute inset-0 pointer-events-none' : 'absolute inset-0 bg-black/20 backdrop-blur-[2px]'}
            onClick={() => setShowCustomize(false)}
          />
          <div className={`relative w-full max-w-sm h-full bg-card border-l border-border shadow-2xl overflow-y-auto ${panelClosing ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}>
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
            <div className="p-3 space-y-4">
              {TIER_SECTIONS.map(section => {
                const defs = WIDGET_DEFS.filter(d => d.tier === section.tier);
                const lockedCount = defs.filter(d => !canAccessTier(d.tier)).length;
                return (
                  <div key={section.tier}>
                    <div className="flex items-center justify-between px-1 mb-1.5">
                      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">{section.label}</p>
                      {lockedCount > 0 && <span className="text-[10px] font-bold text-muted-foreground">{lockedCount} locked</span>}
                    </div>
                    <div className="space-y-2">
                      {defs.map(def => {
                        const placed = hasWidget(def.type);
                        const unlocked = canAccessTier(def.tier);
                        const Icon = def.icon;
                        const tierClass = def.tier === 'pro'
                          ? 'bg-label-purple/15 text-[hsl(268_60%_60%)]'
                          : def.tier === 'premium'
                            ? 'bg-label-yellow/15 text-[hsl(38_92%_50%)]'
                            : 'bg-muted/60 text-muted-foreground';
                        return (
                          <div
                            key={def.type}
                            onClick={!placed && !unlocked ? () => navigate('/pricing') : undefined}
                            onPointerDown={placed || !unlocked ? undefined : onPanelItemPointerDown(def)}
                            className={placed
                              ? 'p-3 rounded-2xl border opacity-60'
                              : unlocked
                                ? 'p-3 rounded-2xl border cursor-grab active:cursor-grabbing touch-none select-none'
                                : 'p-3 rounded-2xl border cursor-pointer select-none'}
                            style={{
                              borderColor: 'hsl(var(--border))',
                              borderRadius: 16,
                              background: placed ? 'hsl(var(--muted))' : 'hsl(var(--card))',
                              boxShadow: unlocked ? '0 6px 18px -18px hsl(228 25% 25% / 0.4)' : 'none',
                            }}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center" style={{ background: unlocked ? `hsl(var(--${def.accent}) / 0.12)` : 'hsl(var(--muted) / 0.6)' }}>
                                {unlocked ? (
                                  <Icon className="w-4 h-4" style={{ color: `hsl(var(--${def.accent}))` }} />
                                ) : (
                                  <Lock className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold ${unlocked ? 'text-foreground' : 'text-muted-foreground'}`}>{def.title}</p>
                                <p className={`text-xs mt-0.5 ${unlocked ? 'text-muted-foreground' : 'text-muted-foreground/70'}`}>{def.desc}</p>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                {(def.tier === 'premium' || def.tier === 'pro') && (
                                  <span className={`flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${tierClass}`}>
                                    <Crown className="w-2.5 h-2.5" /> {def.tier}
                                  </span>
                                )}
                                {placed ? (
                                  <span className="text-[10px] font-bold uppercase text-muted-foreground bg-black/5 px-2 py-1 rounded-full">On board</span>
                                ) : unlocked ? (
                                  <span className="text-[10px] font-bold uppercase text-muted-foreground px-2 py-1 rounded-full border" style={{ borderColor: 'hsl(var(--border))' }}>
                                    Drag to add
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-bold uppercase text-primary px-2 py-1 rounded-full bg-primary/10">Upgrade</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
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

      {tagsModalOpen && (
        <TagsModal
          open={tagsModalOpen}
          onClose={() => setTagsModalOpen(false)}
          title="Tags"
          tags={allTags}
          selectedIds={[]}
          onToggle={() => {}}
          onCreate={async (name, color) => { await createTag({ name, color }); await fetchTags().then(setSharedTags).catch(() => {}); }}
          onDelete={deleteTagEverywhere}
          onRename={renameTagEverywhere}
          onColorChange={changeTagColorEverywhere}
          emptyText="No tags yet. Create one below."
        />
      )}

      {showTaskPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowTaskPicker(false)} />
          <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" /> Start Deep Work
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">Pick a task to focus on</p>
              </div>
              <button onClick={() => setShowTaskPicker(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 border-b border-border shrink-0">
              <input
                autoFocus
                value={taskPickerQuery}
                onChange={e => setTaskPickerQuery(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') setShowTaskPicker(false);
                }}
                placeholder="Search tasks…"
                className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-0">
              {pickedTasks.length === 0 ? (
                <div className="text-center py-10">
                  <CheckSquare className="w-8 h-8 opacity-40 mx-auto mb-2" style={{ color: 'hsl(var(--label-blue))' }} />
                  <p className="text-sm text-muted-foreground">
                    {activeTasks.length === 0 ? 'No active tasks. Add some to get started!' : 'No tasks match your search'}
                  </p>
                </div>
              ) : (
                pickedTasks.map(task => {
                  const cfg = task.priority !== 'none' ? PRIORITY_CONFIG[task.priority] : null;
                  return (
                    <button
                      key={task.id}
                      onClick={() => {
                        setTaskPickerQuery('');
                        setShowTaskPicker(false);
                        navigate('/tasks');
                        openDeepFocus(task);
                      }}
                      className="w-full flex items-center gap-2.5 p-2.5 rounded-lg text-left transition-all hover:bg-muted/40 hover:shadow-sm"
                      style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}
                    >
                      {cfg ? (
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${cfg.className} text-primary-foreground shrink-0`}>{cfg.label}</span>
                      ) : (
                        <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">Open</span>
                      )}
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-foreground truncate">{task.title}</span>
                        {task.projectName && <span className="block text-[11px] text-muted-foreground truncate">{task.projectName}</span>}
                      </span>
                      <Zap className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {showAddTask && (
        <CreateTaskModal open={showAddTask} onClose={() => setShowAddTask(false)} />
      )}
    </>
  );
};

const TagsOverviewWidget: React.FC<{ tasks: Task[]; doneColIds: string[] }> = ({ tasks, doneColIds }) => {
  const tags = useMemo(() => buildTags(tasks, { doneColIds }), [tasks, doneColIds]);
  const { expanded, toggle, expandAll, collapseAll } = useExpanded([]);

  if (tags.length === 0) {
    return (
      <div className="text-center py-6">
        <Tags className="w-8 h-8 opacity-40 mx-auto mb-2" style={{ color: `hsl(var(--label-pink))` }} />
        <p className="text-sm text-muted-foreground">No tags on tasks yet</p>
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{tags.length} tag{tags.length !== 1 ? 's' : ''} in use</p>
        <CollapseAllToggle ids={tags.map(t => t.id)} expanded={expanded} expandAll={expandAll} collapseAll={collapseAll} />
      </div>
      {tags.slice(0, 12).map(t => (
        <CollapsibleRow
          key={t.id}
          id={t.id}
          expanded={expanded.includes(t.id)}
          onToggle={() => toggle(t.id)}
          title={(
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: `hsl(var(--label-${t.color}))` }} />
              {t.name}
            </span>
          )}
          subtitle={`${t.count} task${t.count > 1 ? 's' : ''} · ${t.openCount} open`}
          badge={<span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: `hsl(var(--label-${t.color}))` }}>{t.count}</span>}
        >
          {t.tasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 text-xs">
              {isTaskDone(task, doneColIds) ? (
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
              ) : (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_CONFIG[task.priority]?.className || 'bg-muted'}`} />
              )}
              <span className={`flex-1 min-w-0 truncate ${isTaskDone(task, doneColIds) ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{task.title}</span>
              {task.projectName && <span className="text-[10px] text-muted-foreground shrink-0">{task.projectName}</span>}
            </div>
          ))}
        </CollapsibleRow>
      ))}
    </div>
  );
};

export default Dashboard;