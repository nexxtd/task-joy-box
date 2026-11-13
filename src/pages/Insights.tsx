import { useLanguage } from '@/context/LanguageContext';
import { tt } from '@/i18n/translations';
import { dateLocale } from '@/i18n/format';
import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, Battery, Bot, CalendarClock, CalendarDays, Clock, Crown, FileText,
  FolderOpen, Gauge, GitCompare, GripVertical, Layers, LayoutDashboard, ListChecks,
  Lock, Pencil, RefreshCw, Sparkles, Tag, Target, TrendingUp, X,
} from 'lucide-react';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';
import { DoneCtx, buildAiScoreFallback } from '@/components/insights/insightData';
import TagsModal from '@/components/shared/TagsModal';
import { createTag, deleteTag, fetchTags, updateTag, type SharedTag } from '@/services/tagService';
import { Label, LabelColor, DEFAULT_LABELS } from '@/types/board';
import {
  InsightWidget, InsightWidgetType,
  CompletionOverviewBody, ActiveVsOverdueBody, TasksByPriorityBody,
  WeeklyActivityBody, ProjectBreakdownBody, TagsOverviewBody, NotesOverviewBody,
} from '@/components/insights/InsightWidgets';
import type {
  AiWidgetsData, AiScoreData,
} from '@/components/insights/InsightPremiumWidgets';
import { GridWidgetDef, useWidgetGrid, cellStyle, WidgetTier } from '@/hooks/useWidgetGrid';
// Premium/AI/energy bodies parse only when actually placed on the board —
// never part of first paint. Same chunk, loaded once on first use.
const CompletionTrendBody = lazy(() => import('@/components/insights/InsightPremiumWidgets').then(m => ({ default: m.CompletionTrendBody })));
const AvgCompletionTimeBody = lazy(() => import('@/components/insights/InsightPremiumWidgets').then(m => ({ default: m.AvgCompletionTimeBody })));
const BusiestDaysBody = lazy(() => import('@/components/insights/InsightPremiumWidgets').then(m => ({ default: m.BusiestDaysBody })));
const MultiProjectBody = lazy(() => import('@/components/insights/InsightPremiumWidgets').then(m => ({ default: m.MultiProjectBody })));
const SubtaskHealthBody = lazy(() => import('@/components/insights/InsightPremiumWidgets').then(m => ({ default: m.SubtaskHealthBody })));
const CustomReportBody = lazy(() => import('@/components/insights/InsightPremiumWidgets').then(m => ({ default: m.CustomReportBody })));
const AiBottlenecksBody = lazy(() => import('@/components/insights/InsightPremiumWidgets').then(m => ({ default: m.AiBottlenecksBody })));
const AiScoreBody = lazy(() => import('@/components/insights/InsightPremiumWidgets').then(m => ({ default: m.AiScoreBody })));
const EnergyInsightsBody = lazy(() => import('@/components/insights/EnergyInsightsWidget').then(m => ({ default: m.EnergyInsightsBody })));

/** Short skeleton matching the widget body layout while a lazy body loads. */
const WidgetBodySkeleton = () => (
  <div className="space-y-2 py-2" aria-busy="true">
    <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
    <div className="h-16 w-full rounded bg-muted animate-pulse" />
    <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
  </div>
);
import { trackUsage, trackPageVisit } from '@/lib/usage';
import { WidgetCatalog } from '@/components/shared/WidgetCatalog';
import { PLAN_LIMITS, normalizePlanTier, getLimitButtonProps } from '@/lib/planLimits';
import { Download, FileDown, FileSpreadsheet } from 'lucide-react';
import './Insights.css';

const SHARED_TAG_PREFIX = 'shared-tag-';

const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ');

const sharedTagToLabel = (tag: SharedTag): Label => ({
  id: `${SHARED_TAG_PREFIX}${tag.id}`,
  name: tag.name,
  color: tag.color as LabelColor,
});

const WIDGET_DEFS: GridWidgetDef<InsightWidgetType>[] = [
  { type: 'completion-overview', title: 'Completion Overview', desc: 'Total, completed & active tasks with what drives the rate', icon: Target, accent: 'label-green', w: 6, h: 4, tier: 'free', minW: 6, minH: 4, maxW: 12, maxH: 6 },
  { type: 'active-vs-overdue', title: 'Active vs Overdue', desc: 'Every overdue task, how far past due, and why it matters', icon: AlertTriangle, accent: 'label-red', w: 6, h: 4, tier: 'free', minW: 6, minH: 4, maxW: 12, maxH: 7 },
  { type: 'tasks-by-priority', title: 'Tasks by Priority', desc: 'Active tasks grouped by urgent, high, medium and low', icon: Layers, accent: 'label-orange', w: 6, h: 4, tier: 'free', minW: 6, minH: 4, maxW: 10, maxH: 6 },
  { type: 'weekly-activity', title: 'Weekly Activity', desc: 'What you completed on each day of the current week', icon: CalendarDays, accent: 'label-blue', w: 6, h: 4, tier: 'free', minW: 6, minH: 4, maxW: 12, maxH: 6 },
  { type: 'project-breakdown', title: 'Project Breakdown', desc: 'Per-project completion, status and overdue items', icon: FolderOpen, accent: 'label-purple', w: 6, h: 4, tier: 'free', minW: 6, minH: 4, maxW: 12, maxH: 8 },
  { type: 'tags-overview', title: 'Tags Overview', desc: 'Every tag with the tasks carrying it', icon: Tag, accent: 'label-yellow', w: 6, h: 4, tier: 'free', minW: 6, minH: 4, maxW: 12, maxH: 7 },
  { type: 'notes-overview', title: 'Notes Overview', desc: 'Total notes and recent notes activity', icon: FileText, accent: 'label-orange', w: 6, h: 4, tier: 'free', minW: 6, minH: 4, maxW: 10, maxH: 6 },
  { type: 'completion-trend', title: 'Completion Trend', desc: '30-day trend with per-day explanations for every rise and dip', icon: TrendingUp, accent: 'label-green', w: 12, h: 4, tier: 'premium', minW: 8, minH: 4, maxW: 12, maxH: 8 },
  { type: 'avg-completion-time', title: 'Average Completion Time', desc: 'Actual vs estimated completion time grouped by priority', icon: Clock, accent: 'label-blue', w: 6, h: 4, tier: 'premium', minW: 6, minH: 4, maxW: 12, maxH: 7 },
  { type: 'busiest-days-times', title: 'Busiest Days & Times', desc: 'When you finish the most work, day by day', icon: CalendarClock, accent: 'label-orange', w: 6, h: 4, tier: 'premium', minW: 6, minH: 4, maxW: 12, maxH: 7 },
  { type: 'multi-project-comparison', title: 'Multi-Project Comparison', desc: 'Completion %, speed and health across your projects', icon: GitCompare, accent: 'label-purple', w: 12, h: 4, tier: 'premium', minW: 8, minH: 4, maxW: 12, maxH: 8 },
  { type: 'subtask-checklist-health', title: 'Sub-task & Checklist Health', desc: 'Breakdown progress, stalled tasks and suggested next steps', icon: ListChecks, accent: 'label-yellow', w: 6, h: 4, tier: 'premium', minW: 6, minH: 4, maxW: 12, maxH: 8 },
  { type: 'custom-report', title: 'Custom Report Builder', desc: 'Build your own report from a metric and a date range', icon: FileText, accent: 'label-red', w: 6, h: 4, tier: 'premium', minW: 6, minH: 4, maxW: 12, maxH: 8 },
  { type: 'energy-insights', title: 'Energy Insights', desc: 'Peak hours, consistency and what to change — analysed from your logged energy', icon: Battery, accent: 'label-orange', w: 12, h: 5, tier: 'premium', minW: 8, minH: 4, maxW: 12, maxH: 8 },
  { type: 'ai-bottlenecks', title: 'AI Bottleneck Detector', desc: 'AI-flagged stalling tasks with reasoning and next steps', icon: Bot, accent: 'label-purple', w: 6, h: 4, tier: 'pro', minW: 6, minH: 4, maxW: 12, maxH: 8 },
  { type: 'ai-score', title: 'AI Productivity Score', desc: 'Live AI score with what is helping and what is dragging you down', icon: Gauge, accent: 'label-blue', w: 6, h: 4, tier: 'pro', minW: 6, minH: 4, maxW: 12, maxH: 7 },
];

const w = (id: string, type: InsightWidgetType, title: string, col: number, row: number, ww: number, hh: number): InsightWidget =>
  ({ id, type, title, col, row, w: ww, h: hh });

const defaultLayout = (): InsightWidget[] => [
  w('w1', 'completion-overview', 'Completion Overview', 1, 1, 6, 4),
  w('w2', 'active-vs-overdue', 'Active vs Overdue', 7, 1, 6, 4),
  w('w3', 'tasks-by-priority', 'Tasks by Priority', 1, 5, 6, 4),
  w('w4', 'weekly-activity', 'Weekly Activity', 7, 5, 6, 4),
  w('w5', 'project-breakdown', 'Project Breakdown', 1, 9, 6, 4),
  w('w6', 'tags-overview', 'Tags Overview', 7, 9, 6, 4),
  w('w7', 'notes-overview', 'Notes Overview', 1, 13, 6, 4),
];


const LockedAiWidget: React.FC<{ onUpgrade: () => void; label?: string }> = ({ onUpgrade, label = 'Pro' }) => (
  <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
    <div className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center">
      <Lock className="w-4 h-4 text-muted-foreground" />
    </div>
    <p className="text-[11px] font-bold text-foreground uppercase tracking-wide">{label} widget</p>
    <p className="text-xs text-muted-foreground max-w-[220px] leading-snug">Upgrade your plan to unlock this widget on your insights board.</p>
    <button onClick={onUpgrade} className="mt-1 px-4 py-2 text-xs font-bold text-white rounded-lg bg-primary hover:bg-primary/90 transition-all">
      Upgrade
    </button>
  </div>
);

// Module-level cache so the analysis survives page navigation: the request keeps
// running in the background and the result is restored if the user comes back.
// Persisted to sessionStorage so a full page reload also restores the last result.
type AnalysisCache = {
  bottlenecks: Array<{ id: string; reason: string; suggestion?: string }> | null;
  scoreData: AiScoreData['data'];
  lastAnalysis: { text: string; time: string; error: boolean } | null;
};
const ANALYSIS_CACHE_KEY = 'insights-analysis-cache-v1';
let analysisCache: AnalysisCache | null = null;
try {
  const raw = sessionStorage.getItem(ANALYSIS_CACHE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as AnalysisCache;
    if (parsed && !parsed.lastAnalysis?.error && !parsed.lastAnalysis?.text?.toLowerCase().includes('unavailable')) {
      analysisCache = parsed;
    } else {
      sessionStorage.removeItem(ANALYSIS_CACHE_KEY);
    }
  }
} catch { /* corrupt or unavailable storage */ }
let analysisInFlight: Promise<void> | null = null;

const Insights: React.FC = () => {
  // Subscribe to language changes so dates/numbers and auto-translated JSX update straight away with no refresh.
  useLanguage();
  const navigate = useNavigate();
  const { board, updateTask } = useBoardContext();
  const { user } = useAuth();
  const tier: WidgetTier = user?.subscriptionTier === 'pro'
    ? 'pro'
    : user?.subscriptionTier === 'premium'
      ? 'premium'
      : 'free';
  const planTier = normalizePlanTier(tier);
  const maxWidgets = PLAN_LIMITS.widgets[planTier];

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    if (exportMenuOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [exportMenuOpen]);

  const exportCsvReport = () => {
    if (planTier === 'free') {
      navigate('/pricing');
      return;
    }
    const completedCount = tasks.filter(t => doneColIds.includes(t.columnId)).length;
    const overdueCount = tasks.filter(t => !doneColIds.includes(t.columnId) && t.dueDate && new Date(t.dueDate) < new Date()).length;
    const completionRate = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
    const rows = [
      ['MyPlanner Insights Report'],
      ['Generated', new Date().toLocaleString(dateLocale())],
      ['Plan Tier', tier.toUpperCase()],
      ['Productivity Score', `${scoreData?.overallScore ?? 0}/100`],
      ['Total Tasks', tasks.length],
      ['Completed Tasks', completedCount],
      ['Active Overdue Tasks', overdueCount],
      ['Completion Rate', `${completionRate}%`],
      [],
      ['Task ID', 'Title', 'Priority', 'Status', 'Due Date', 'Duration (min)'],
      ...tasks.map(t => [
        t.id,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        t.priority || 'none',
        doneColIds.includes(t.columnId) ? 'Completed' : 'Active',
        t.dueDate || 'None',
        t.duration || 0,
      ])
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(rows.map(e => e.join(',')).join('\n'));
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `insights_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportMenuOpen(false);
    toast({ title: 'Report exported', description: 'CSV report downloaded successfully.' });
  };

  const exportPdfReport = () => {
    if (planTier !== 'pro') {
      navigate('/pricing');
      return;
    }
    setExportMenuOpen(false);
    window.print();
  };

  const tasks = board?.tasks || [];
  const columns = board?.columns || [];

  useEffect(() => { trackPageVisit('insights'); }, []);

  const doneColIds = useMemo(
    () => (board?.columns || []).filter(c => /done|completed|finish/i.test(c.title)).map(c => c.id),
    [board]
  );
  const ctx: DoneCtx = useMemo(() => ({ doneColIds }), [doneColIds]);

  const {
    layout, previewLayout, draft, activeDragId, suppressMotion, displacedIds, gridHeight,
    gridRef, scrollElRef, bodyRefs, hasWidget, addWidget, removeWidget, updateWidget, startGesture,
    onPanelItemPointerDown, showCustomize, setShowCustomize, panelClosing, resetToDefault, canAccessTier,
  } = useWidgetGrid<InsightWidgetType>({
    defs: WIDGET_DEFS,
    storageKey: 'insights-grid-v1',
    defaultLayout,
    tier,
  });

  const isWidgetLimitReached = layout.length >= maxWidgets;

  // ---- AI widget data (Pro) ----
  const [aiLoading, setAiLoading] = useState(false);
  const [bottleneckError, setBottleneckError] = useState<string | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [bottlenecks, setBottlenecks] = useState<Array<{ id: string; reason: string; suggestion?: string }> | null>(null);
  const [scoreData, setScoreData] = useState<AiScoreData['data']>(null);
  const [lastAnalysis, setLastAnalysis] = useState<{ text: string; time: string; error: boolean } | null>(null);
  const aiFetchedRef = useRef(false);

  // ---- Global tags manager (open from the Tags Overview widget header) ----
  const [tagsModalOpen, setTagsModalOpen] = useState(false);
  const [sharedTags, setSharedTags] = useState<SharedTag[]>([]);

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

  const runAi = useCallback(async () => {
    // Reuse the request already in flight so navigating back to this page
    // mid-analysis never starts a duplicate AI call.
    if (analysisInFlight) return analysisInFlight;
    const run = (async () => {
      setAiLoading(true);
      setBottleneckError(null);
      setScoreError(null);
      const markDone = (text: string, error: boolean) => {
        const info = { text, time: new Date().toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' }), error };
        setLastAnalysis(info);
        return info;
      };
      const commit = (result: AnalysisCache) => {
        analysisCache = result;
        try {
          sessionStorage.setItem(ANALYSIS_CACHE_KEY, JSON.stringify(result));
        } catch { /* storage may be unavailable */ }
      };
      try {
        const res = await fetch('/api/ai/pro/dashboard-widgets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ tasks }),
        });
        const fallback = buildAiScoreFallback(tasks, ctx);
        if (!res.ok) {
          setBottleneckError(null);
          setBottlenecks([]);
          setScoreData(fallback);
          const parts: string[] = [`Score ${fallback.overallScore}/100`];
          if (fallback.insights.length > 0) parts.push(`Focus: ${fallback.insights.slice(0, 2).join(', ')}`);
          if (fallback.scoreRationale) parts.push(fallback.scoreRationale);
          const info = markDone(parts.join(' · '), false);
          commit({ bottlenecks: [], scoreData: fallback, lastAnalysis: info });
          toast({ title: 'AI analysis ready', description: `Score ${fallback.overallScore}/100` });
          return;
        }
        const data = await res.json();
        const bns = Array.isArray(data.bottlenecks) ? data.bottlenecks : [];
        setBottlenecks(bns);
        const ps = data.productivityScore || {};
        const s = Number(ps.score);
        const focusAreas = Array.isArray(ps.focusAreas) ? ps.focusAreas.map(String) : [];
        const finalScore = Number.isFinite(s) ? Math.round(s) : fallback.overallScore;
        const scoreResult: AiScoreData['data'] = {
          overallScore: finalScore,
          scoreRationale: typeof ps.summary === 'string' && ps.summary ? ps.summary : fallback.scoreRationale,
          contributors: fallback.contributors,
          penalties: fallback.penalties,
          insights: focusAreas.length > 0 ? focusAreas : fallback.insights,
          recommendations: fallback.recommendations,
        };
        setScoreData(scoreResult);
        const parts: string[] = [`Score ${finalScore}/100`];
        if (focusAreas.length > 0) parts.push(`Focus: ${focusAreas.slice(0, 3).join(', ')}`);
        if (bns.length > 0) parts.push(`${bns.length} bottleneck${bns.length !== 1 ? 's' : ''} detected`);
        if (typeof ps.summary === 'string' && ps.summary) parts.push(ps.summary);
        const info = markDone(parts.join(' · '), false);
        commit({ bottlenecks: bns, scoreData: scoreResult, lastAnalysis: info });
        toast({ title: 'AI analysis ready', description: `Score ${finalScore}/100${bns.length > 0 ? ` · ${bns.length} bottleneck${bns.length !== 1 ? 's' : ''}` : ''}` });
      } catch (e) {
        console.error('AI dashboard-widgets fetch failed:', e);
        const fb = buildAiScoreFallback(tasks, ctx);
        setScoreData(fb);
        const activeCount = tasks.filter(t => !t.completed).length;
        const info = markDone(`Score ${fb.overallScore}/100 · ${activeCount} active task${activeCount !== 1 ? 's' : ''} analyzed`, false);
        commit({ bottlenecks: [], scoreData: fb, lastAnalysis: info });
        toast({ title: 'Analysis ready', description: `Score ${fb.overallScore}/100` });
      } finally {
        setAiLoading(false);
      }
    })();
    analysisInFlight = run;
    try {
      await run;
    } finally {
      if (analysisInFlight === run) analysisInFlight = null;
    }
  }, [tasks, ctx]);

  // Restore the last analysis if the user navigates back to this page — the
  // request is never cancelled by navigation, it just keeps running.
  const restoredCacheRef = useRef(false);
  useEffect(() => {
    if (analysisCache && !restoredCacheRef.current) {
      restoredCacheRef.current = true;
      aiFetchedRef.current = true;
      setBottlenecks(analysisCache.bottlenecks);
      setScoreData(analysisCache.scoreData);
      setLastAnalysis(analysisCache.lastAnalysis);
    }
  }, []);

  const wantsAi = hasWidget('ai-bottlenecks') || hasWidget('ai-score');
  const canUseAi = canAccessTier('pro');
  useEffect(() => {
    if (!canUseAi) {
      aiFetchedRef.current = false;
      return;
    }
    if (wantsAi && !aiFetchedRef.current) {
      aiFetchedRef.current = true;
      if (analysisInFlight) {
        // The user navigated back while the previous run is still going —
        // wait for it and rehydrate from the cache it commits.
        setAiLoading(true);
        analysisInFlight.then(() => {
          setAiLoading(false);
          if (analysisCache) {
            setBottlenecks(analysisCache.bottlenecks);
            setScoreData(analysisCache.scoreData);
            setLastAnalysis(analysisCache.lastAnalysis);
          }
        });
      } else {
        runAi();
      }
    }
  }, [wantsAi, runAi, canUseAi]);

  const aiWidgetsData: AiWidgetsData = useMemo(() => ({
    loading: aiLoading,
    error: bottleneckError,
    bottlenecks,
    score: null,
    onRetry: runAi,
  }), [aiLoading, bottleneckError, bottlenecks, runAi]);

  const aiScoreData: AiScoreData = useMemo(() => ({
    loading: aiLoading,
    error: scoreError,
    data: scoreData,
    onRetry: runAi,
  }), [aiLoading, scoreError, scoreData, runAi]);

  const renderBody = (widget: InsightWidget) => {
    const definition = WIDGET_DEFS.find(def => def.type === widget.type);
    if (definition && !canAccessTier(definition.tier)) {
      return <LockedAiWidget label={definition.tier === 'pro' ? 'Pro' : 'Premium'} onUpgrade={() => navigate('/pricing')} />;
    }
    switch (widget.type) {
      case 'completion-overview':
        return <CompletionOverviewBody widget={widget} tasks={tasks} ctx={ctx} onUpdate={patch => updateWidget(widget.id, patch)} />;
      case 'active-vs-overdue':
        return <ActiveVsOverdueBody tasks={tasks} ctx={ctx} />;
      case 'tasks-by-priority':
        return <TasksByPriorityBody tasks={tasks} ctx={ctx} />;
      case 'weekly-activity':
        return <WeeklyActivityBody tasks={tasks} ctx={ctx} />;
      case 'project-breakdown':
        return <ProjectBreakdownBody tasks={tasks} columns={columns} ctx={ctx} />;
      case 'tags-overview':
        return <TagsOverviewBody tasks={tasks} ctx={ctx} />;
      case 'notes-overview':
        return <NotesOverviewBody />;
      case 'completion-trend':
        return <Suspense fallback={<WidgetBodySkeleton />}><CompletionTrendBody tasks={tasks} ctx={ctx} /></Suspense>;
      case 'avg-completion-time':
        return <Suspense fallback={<WidgetBodySkeleton />}><AvgCompletionTimeBody tasks={tasks} ctx={ctx} /></Suspense>;
      case 'busiest-days-times':
        return <Suspense fallback={<WidgetBodySkeleton />}><BusiestDaysBody tasks={tasks} ctx={ctx} /></Suspense>;
      case 'multi-project-comparison':
        return <Suspense fallback={<WidgetBodySkeleton />}><MultiProjectBody tasks={tasks} columns={columns} ctx={ctx} /></Suspense>;
      case 'subtask-checklist-health':
        return <Suspense fallback={<WidgetBodySkeleton />}><SubtaskHealthBody tasks={tasks} ctx={ctx} /></Suspense>;
      case 'custom-report':
        return <Suspense fallback={<WidgetBodySkeleton />}><CustomReportBody widget={widget} tasks={tasks} ctx={ctx} onUpdate={patch => updateWidget(widget.id, patch)} /></Suspense>;
      case 'energy-insights':
        if (!canAccessTier('premium')) return <LockedAiWidget label="Premium" onUpgrade={() => navigate('/pricing')} />;
        return <Suspense fallback={<WidgetBodySkeleton />}><EnergyInsightsBody /></Suspense>;
      case 'ai-bottlenecks':
        if (!canAccessTier('pro')) return <LockedAiWidget onUpgrade={() => navigate('/pricing')} />;
        return <Suspense fallback={<WidgetBodySkeleton />}><AiBottlenecksBody tasks={tasks} aiData={aiWidgetsData} /></Suspense>;
      case 'ai-score':
        if (!canAccessTier('pro')) return <LockedAiWidget onUpgrade={() => navigate('/pricing')} />;
        return <Suspense fallback={<WidgetBodySkeleton />}><AiScoreBody scoreData={aiScoreData} /></Suspense>;
    }
  };

  return (
    <div ref={scrollElRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto" style={{ background: 'hsl(var(--background))' }}>
      <header className="page-toolbar px-4 sm:px-6 py-2 min-h-16 border-b border-border bg-card/30 backdrop-blur-sm shrink-0 flex items-center justify-between gap-2">
        <div className="page-toolbar-title flex items-baseline gap-2 min-w-0 flex-1">
          <h1 className="text-base font-bold text-foreground truncate">Insights &amp; Analytics</h1>
          <p className="hidden lg:block text-xs text-muted-foreground truncate">Live analytics — recalculated on every change</p>
        </div>
        <div className="page-toolbar-actions flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => {
                if (planTier === 'free') {
                  navigate('/pricing');
                } else {
                  setExportMenuOpen(prev => !prev);
                }
              }}
              title={planTier === 'free' ? 'Export Report (Premium feature)' : 'Export Report'}
              className="flex items-center gap-2 px-2.5 sm:px-4 py-2.5 min-h-[44px] text-sm rounded-xl font-bold border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export Report</span>
              {planTier === 'free' && <Lock className="w-3 h-3 text-muted-foreground ml-0.5" />}
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border border-border bg-card p-1 shadow-lg z-50 animate-in fade-in-50 zoom-in-95">
                <button
                  onClick={exportCsvReport}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg text-foreground hover:bg-muted transition-colors text-left"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Export CSV Report</span>
                </button>
                <button
                  onClick={exportPdfReport}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-lg transition-colors text-left ${
                    planTier === 'pro'
                      ? 'text-foreground hover:bg-muted'
                      : 'text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileDown className="w-4 h-4 text-blue-600" />
                    <span>Export PDF Report</span>
                  </div>
                  {planTier !== 'pro' && <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">PRO</span>}
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => { trackUsage('insights', 'run-ai-analysis'); runAi(); }}
            disabled={aiLoading}
            className="flex items-center gap-2 px-2.5 sm:px-4 py-2.5 min-h-[44px] text-sm rounded-xl font-bold border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${aiLoading ? 'animate-spin' : ''}`} /> <span className="hidden sm:inline">Run AI Analysis</span><span className="sm:hidden">AI</span>
          </button>
          <button
            onClick={() => { trackUsage('insights', 'customize'); setShowCustomize(true); }}
            aria-label="Customize insights"
            className="flex items-center gap-2 px-2.5 sm:px-4 py-2.5 min-h-[44px] text-sm rounded-xl font-bold border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <LayoutDashboard className="w-4 h-4" /> <span className="hidden sm:inline">Customize Insights</span>
          </button>
        </div>
      </header>

      {lastAnalysis && (
        <div className="px-6 pt-4">
          <div className="flex items-start justify-between gap-3 rounded-xl border px-4 py-3 border-border bg-card/60">
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center" style={{ background: 'hsl(var(--label-purple) / 0.12)' }}>
                <Sparkles className="w-3.5 h-3.5" style={{ color: 'hsl(var(--label-purple))' }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-2 flex-wrap">
                  AI Analysis · {lastAnalysis.time}
                  {aiLoading && <span className="w-3.5 h-3.5 rounded-full border-2 border-primary/30 border-t-primary animate-spin shrink-0" />}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{lastAnalysis.text}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-1">
                  Details are in the AI Productivity Score and AI Bottleneck Detector widgets — add them via Customize Insights.
                </p>
              </div>
            </div>
            <button onClick={() => setLastAnalysis(null)} className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <div className="insights-widgets p-4 sm:p-6">
        {layout.length === 0 && !previewLayout ? (
          <div ref={gridRef} className="relative text-center py-20" style={{ height: Math.max(gridHeight, 320) }}>
            <Sparkles className="w-10 h-10 mx-auto mb-3" style={{ color: 'hsl(var(--label-orange))' }} />
            <p className="text-base font-semibold text-foreground">Your insights board is empty</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Open Customize Insights to add widgets</p>
            <button
              {...getLimitButtonProps({
                isLimitReached: isWidgetLimitReached,
                tier: planTier,
                defaultLabel: 'Add widgets',
                onAction: () => { trackUsage('insights', 'customize'); setShowCustomize(true); },
                onNavigatePricing: () => navigate('/pricing'),
              })}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                isWidgetLimitReached
                  ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                  : 'text-white bg-primary hover:bg-primary/90'
              }`}
            />
          </div>
        ) : (
          <>
          {/* Desktop 12-column grid */}
          <div ref={gridRef} className="hidden md:block insights-widget-grid relative" style={{ height: gridHeight }}>
            {(previewLayout ?? layout).map(widget => {
              const def = WIDGET_DEFS.find(d => d.type === widget.type);
              const accent = def?.accent || 'label-blue';
              const isDisplaced = displacedIds.has(widget.id);
              return (
                <div
                  key={widget.id}
                  className={`insights-widget relative group/widget rounded-2xl overflow-hidden flex flex-col ${isDisplaced ? 'animate-widget-flash' : ''} ${activeDragId === widget.id ? 'z-10' : ''}`}
                  style={{
                    position: 'absolute',
                    ...cellStyle(widget),
                    background: 'hsl(var(--card))',
                    border: activeDragId === widget.id ? '2px dashed hsl(var(--primary) / 0.55)' : '1px solid hsl(var(--border))',
                    boxShadow: '0 12px 30px -30px hsl(228 25% 25% / 0.4)',
                    transition: suppressMotion || activeDragId === widget.id
                      ? 'none'
                      : 'left 180ms cubic-bezier(0.22, 1, 0.36, 1), top 180ms cubic-bezier(0.22, 1, 0.36, 1), width 180ms cubic-bezier(0.22, 1, 0.36, 1), height 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  <div className="flex items-center justify-between px-4 pt-3 pb-1 select-none shrink-0">
                    <div className={`insights-widget-leading-actions flex items-center gap-0.5 min-w-0 transition-opacity ${draft ? 'pointer-events-none opacity-0' : 'opacity-0 group-hover/widget:opacity-100'}`}>
                      <button
                        onPointerDown={e => startGesture(e, widget, 'move')}
                        className="insights-widget-move p-1.5 rounded-md hover:bg-black/5 cursor-grab active:cursor-grabbing touch-none"
                        title="Move"
                      >
                        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      {widget.type === 'tags-overview' && (
                        <button
                          onClick={() => setTagsModalOpen(true)}
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted"
                          title="Edit tags"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="insights-widget-heading flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 flex-shrink-0 rounded-md flex items-center justify-center" style={{ background: `hsl(var(--${accent}) / 0.15)` }}>
                        {def && <def.icon className="w-3.5 h-3.5" style={{ color: `hsl(var(--${accent}))` }} />}
                      </div>
                      <h3 className="text-[11px] font-bold text-foreground truncate uppercase tracking-wide">{tt(widget.title)}</h3>
                    </div>
                    <div className={`insights-widget-actions flex items-center gap-0.5 transition-opacity ${draft ? 'pointer-events-none opacity-0' : 'opacity-0 group-hover/widget:opacity-100'}`}>
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
                    className="insights-widget-body px-4 pb-4 overflow-y-auto min-h-0 flex-1"
                  >
                    {renderBody(widget as InsightWidget)}
                  </div>
                  <div
                    onPointerDown={e => startGesture(e, widget, 'resize')}
                    className="insights-widget-resize absolute bottom-1 right-1 w-4 h-4 cursor-se-resize touch-none rounded-br-lg opacity-0 group-hover/widget:opacity-100"
                    style={{ background: 'linear-gradient(135deg, transparent 42%, hsl(0 0% 40% / 0.35))' }}
                    title="Resize"
                  />
                </div>
              );
            })}
          </div>

          {/* Mobile view: purpose-built stacked layout */}
          <div className="md:hidden space-y-4">
            {layout.map(widget => {
              const def = WIDGET_DEFS.find(d => d.type === widget.type);
              const accent = def?.accent || 'label-blue';
              return (
                <section
                  key={widget.id}
                  aria-label={tt(widget.title)}
                  className="rounded-2xl flex flex-col overflow-hidden bg-card border border-border shadow-sm"
                >
                  <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                    <div className="w-6 h-6 flex-shrink-0 rounded-md flex items-center justify-center" style={{ background: `hsl(var(--${accent}) / 0.15)` }}>
                      {def && <def.icon className="w-3.5 h-3.5" style={{ color: `hsl(var(--${accent}))` }} />}
                    </div>
                    <h3 className="text-[11px] font-bold text-foreground truncate uppercase tracking-wide flex-1">{tt(widget.title)}</h3>
                    <button
                      onClick={() => removeWidget(widget.id)}
                      className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-500"
                      title="Remove"
                      aria-label={`Remove ${tt(widget.title)}`}
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="px-4 pb-4 pt-1">
                    {renderBody(widget as InsightWidget)}
                  </div>
                </section>
              );
            })}
          </div>
          </>
        )}
      </div>

      {showCustomize && (
        <WidgetCatalog<GridWidgetDef<InsightWidgetType>>
          definitions={WIDGET_DEFS}
          surface="insights"
          closing={panelClosing}
          hasWidget={hasWidget}
          canAccessTier={canAccessTier}
          widgetCount={layout.length}
          maxWidgets={maxWidgets}
          currentTier={planTier}
          onStartDrag={definition => event => {
            // Compact cards are a reading stack; use Add rather than interpreting
            // their positions with the saved twelve-column desktop geometry.
            const grid = gridRef.current;
            if (grid && getComputedStyle(grid).display === 'flex') return;
            onPanelItemPointerDown(definition)(event);
          }}
          onAdd={addWidget}
          onClose={() => setShowCustomize(false)}
          onUpgrade={() => navigate('/pricing')}
          onReset={resetToDefault}
        />
      )}

      {tagsModalOpen && (
        <TagsModal
          open={tagsModalOpen}
          onClose={() => setTagsModalOpen(false)}
          title="Tags"
          tags={allTags}
          selectedIds={[]}
          onToggle={() => {}}
          onCreate={async (name, color) => {
            const tag = await createTag({ name, color });
            setSharedTags(prev => prev.some(t => t.id === tag.id) ? prev : [...prev, tag]);
          }}
          onDelete={deleteTagEverywhere}
          onRename={renameTagEverywhere}
          onColorChange={changeTagColorEverywhere}
          emptyText="No tags yet. Create one below."
        />
      )}
    </div>
  );
};

export default Insights;
