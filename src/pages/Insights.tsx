import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  WeeklyActivityBody, ProjectBreakdownBody, TagsOverviewBody,
} from '@/components/insights/InsightWidgets';
import {
  CompletionTrendBody, AvgCompletionTimeBody, BusiestDaysBody, MultiProjectBody,
  SubtaskHealthBody, CustomReportBody, AiBottlenecksBody, AiScoreBody,
  AiWidgetsData, AiScoreData,
} from '@/components/insights/InsightPremiumWidgets';
import { GridWidgetDef, useWidgetGrid, cellStyle, WidgetTier } from '@/hooks/useWidgetGrid';
import { EnergyInsightsBody } from '@/components/insights/EnergyInsightsWidget';

const SHARED_TAG_PREFIX = 'shared-tag-';

const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ');

const sharedTagToLabel = (tag: SharedTag): Label => ({
  id: `${SHARED_TAG_PREFIX}${tag.id}`,
  name: tag.name,
  color: tag.color as LabelColor,
});

const WIDGET_DEFS: GridWidgetDef<InsightWidgetType>[] = [
  { type: 'completion-overview', title: 'Completion Overview', desc: 'Total, completed & active tasks with what drives the rate', icon: Target, accent: 'label-green', w: 4, h: 3, tier: 'free' },
  { type: 'active-vs-overdue', title: 'Active vs Overdue', desc: 'Every overdue task, how far past due, and why it matters', icon: AlertTriangle, accent: 'label-red', w: 4, h: 3, tier: 'free' },
  { type: 'tasks-by-priority', title: 'Tasks by Priority', desc: 'Active tasks grouped by urgent, high, medium and low', icon: Layers, accent: 'label-orange', w: 4, h: 3, tier: 'free' },
  { type: 'weekly-activity', title: 'Weekly Activity', desc: 'What you completed on each day of the current week', icon: CalendarDays, accent: 'label-blue', w: 4, h: 3, tier: 'free' },
  { type: 'project-breakdown', title: 'Project Breakdown', desc: 'Per-project completion, status and overdue items', icon: FolderOpen, accent: 'label-purple', w: 4, h: 3, tier: 'free' },
  { type: 'tags-overview', title: 'Tags Overview', desc: 'Every tag with the tasks carrying it', icon: Tag, accent: 'label-yellow', w: 4, h: 3, tier: 'free' },
  { type: 'completion-trend', title: 'Completion Trend', desc: '30-day trend with per-day explanations for every rise and dip', icon: TrendingUp, accent: 'label-green', w: 4, h: 4, tier: 'premium' },
  { type: 'avg-completion-time', title: 'Average Completion Time', desc: 'Actual vs estimated completion time grouped by priority', icon: Clock, accent: 'label-blue', w: 4, h: 4, tier: 'premium' },
  { type: 'busiest-days-times', title: 'Busiest Days & Times', desc: 'When you finish the most work, day by day', icon: CalendarClock, accent: 'label-orange', w: 4, h: 4, tier: 'premium' },
  { type: 'multi-project-comparison', title: 'Multi-Project Comparison', desc: 'Completion %, speed and health across your projects', icon: GitCompare, accent: 'label-purple', w: 4, h: 4, tier: 'premium' },
  { type: 'subtask-checklist-health', title: 'Sub-task & Checklist Health', desc: 'Breakdown progress, stalled tasks and suggested next steps', icon: ListChecks, accent: 'label-yellow', w: 4, h: 4, tier: 'premium' },
  { type: 'custom-report', title: 'Custom Report Builder', desc: 'Build your own report from a metric and a date range', icon: FileText, accent: 'label-red', w: 4, h: 4, tier: 'premium' },
  { type: 'energy-insights', title: 'Energy Insights', desc: 'Peak hours, consistency and what to change — analysed from your logged energy', icon: Battery, accent: 'label-orange', w: 4, h: 4, tier: 'premium' },
  { type: 'ai-bottlenecks', title: 'AI Bottleneck Detector', desc: 'AI-flagged stalling tasks with reasoning and next steps', icon: Bot, accent: 'label-purple', w: 4, h: 4, tier: 'pro' },
  { type: 'ai-score', title: 'AI Productivity Score', desc: 'Live AI score with what is helping and what is dragging you down', icon: Gauge, accent: 'label-blue', w: 4, h: 4, tier: 'pro' },
];

const w = (id: string, type: InsightWidgetType, title: string, col: number, row: number, ww: number, hh: number): InsightWidget =>
  ({ id, type, title, col, row, w: ww, h: hh });

const defaultLayout = (): InsightWidget[] => [
  w('w1', 'completion-overview', 'Completion Overview', 1, 1, 4, 3),
  w('w2', 'active-vs-overdue', 'Active vs Overdue', 5, 1, 4, 3),
  w('w3', 'tasks-by-priority', 'Tasks by Priority', 9, 1, 4, 3),
  w('w4', 'weekly-activity', 'Weekly Activity', 1, 4, 4, 3),
  w('w5', 'project-breakdown', 'Project Breakdown', 5, 4, 4, 3),
  w('w6', 'tags-overview', 'Tags Overview', 9, 4, 4, 3),
  w('w9', 'energy-insights', 'Energy Insights', 1, 7, 4, 4),
];

const TIER_SECTIONS: { tier: WidgetTier; label: string }[] = [
  { tier: 'free', label: 'Free' },
  { tier: 'premium', label: 'Premium' },
  { tier: 'pro', label: 'Pro' },
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
  if (raw) analysisCache = JSON.parse(raw) as AnalysisCache;
} catch { /* corrupt or unavailable storage */ }
let analysisInFlight: Promise<void> | null = null;

const Insights: React.FC = () => {
  const navigate = useNavigate();
  const { board, updateTask } = useBoardContext();
  const { user } = useAuth();
  const tier: WidgetTier = user?.subscriptionTier === 'pro'
    ? 'pro'
    : user?.subscriptionTier === 'premium'
      ? 'premium'
      : 'free';

  const tasks = board?.tasks || [];
  const columns = board?.columns || [];

  const doneColIds = useMemo(
    () => (board?.columns || []).filter(c => /done|completed|finish/i.test(c.title)).map(c => c.id),
    [board]
  );
  const ctx: DoneCtx = useMemo(() => ({ doneColIds }), [doneColIds]);

  const {
    layout, previewLayout, draft, activeDragId, suppressMotion, displacedIds, gridHeight,
    gridRef, scrollElRef, bodyRefs, hasWidget, removeWidget, updateWidget, startGesture,
    onPanelItemPointerDown, showCustomize, setShowCustomize, panelClosing, resetToDefault, canAccessTier,
  } = useWidgetGrid<InsightWidgetType>({
    defs: WIDGET_DEFS,
    storageKey: 'insights-grid-v1',
    defaultLayout,
    tier,
  });

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
        const info = { text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), error };
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
          let msg = 'AI service is currently unavailable.';
          try {
            const j = await res.json();
            if (j?.error) msg = String(j.error);
          } catch { /* ignore */ }
          setBottleneckError(msg);
          setBottlenecks(null);
          setScoreData(fallback);
          const info = markDone(`AI service unavailable (${msg}). Showing the offline fallback score instead: ${fallback.overallScore}/100.`, true);
          commit({ bottlenecks: null, scoreData: fallback, lastAnalysis: info });
          toast({ title: 'AI analysis finished', description: `${info.text}`, variant: 'destructive' });
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
      } catch {
        setBottleneckError('Could not reach the AI service. Check your connection and try again.');
        setBottlenecks(null);
        const fb = buildAiScoreFallback(tasks, ctx);
        setScoreData(fb);
        const info = markDone(`Could not reach the AI service. Showing the offline fallback score instead: ${fb.overallScore}/100.`, true);
        commit({ bottlenecks: null, scoreData: fb, lastAnalysis: info });
        toast({ title: 'AI analysis failed', description: 'Could not reach the AI service. Showing the offline score instead.', variant: 'destructive' });
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
  useEffect(() => {
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
  }, [wantsAi, runAi]);

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
      case 'completion-trend':
        return <CompletionTrendBody tasks={tasks} ctx={ctx} />;
      case 'avg-completion-time':
        return <AvgCompletionTimeBody tasks={tasks} ctx={ctx} />;
      case 'busiest-days-times':
        return <BusiestDaysBody tasks={tasks} ctx={ctx} />;
      case 'multi-project-comparison':
        return <MultiProjectBody tasks={tasks} columns={columns} ctx={ctx} />;
      case 'subtask-checklist-health':
        return <SubtaskHealthBody tasks={tasks} ctx={ctx} />;
      case 'custom-report':
        return <CustomReportBody widget={widget} tasks={tasks} ctx={ctx} onUpdate={patch => updateWidget(widget.id, patch)} />;
      case 'energy-insights':
        if (!canAccessTier('premium')) return <LockedAiWidget label="Premium" onUpgrade={() => navigate('/pricing')} />;
        return <EnergyInsightsBody />;
      case 'ai-bottlenecks':
        if (!canAccessTier('pro')) return <LockedAiWidget onUpgrade={() => navigate('/pricing')} />;
        return <AiBottlenecksBody tasks={tasks} aiData={aiWidgetsData} />;
      case 'ai-score':
        if (!canAccessTier('pro')) return <LockedAiWidget onUpgrade={() => navigate('/pricing')} />;
        return <AiScoreBody scoreData={aiScoreData} />;
    }
  };

  return (
    <div ref={scrollElRef} className="flex-1 overflow-y-auto" style={{ background: 'hsl(var(--background))' }}>
      <header className="px-6 h-16 border-b border-border bg-card/30 backdrop-blur-sm shrink-0 flex items-center justify-between">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="text-base font-bold text-foreground whitespace-nowrap">Insights &amp; Analytics</h1>
          <p className="text-xs text-muted-foreground truncate">Live analytics — recalculated on every change</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runAi}
            disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${aiLoading ? 'animate-spin' : ''}`} /> Run AI Analysis
          </button>
          <button
            onClick={() => setShowCustomize(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
          >
            <LayoutDashboard className="w-4 h-4" /> Customize Insights
          </button>
        </div>
      </header>

      {lastAnalysis && (
        <div className="px-6 pt-4">
          <div className={`flex items-start justify-between gap-3 rounded-xl border px-4 py-3 ${lastAnalysis.error ? 'border-destructive/30 bg-destructive/5' : 'border-border bg-card/60'}`}>
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-7 h-7 flex-shrink-0 rounded-lg flex items-center justify-center" style={{ background: 'hsl(var(--label-purple) / 0.12)' }}>
                {lastAnalysis.error
                  ? <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                  : <Sparkles className="w-3.5 h-3.5" style={{ color: 'hsl(var(--label-purple))' }} />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground uppercase tracking-wide flex items-center gap-2 flex-wrap">
                  {lastAnalysis.error && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 border border-destructive/30 text-destructive normal-case tracking-normal">
                      <AlertTriangle className="w-3 h-3" />Automated Message
                    </span>
                  )}
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

      <div className="p-6">
        {layout.length === 0 && !previewLayout ? (
          <div className="text-center py-20">
            <Sparkles className="w-10 h-10 mx-auto mb-3" style={{ color: 'hsl(var(--label-orange))' }} />
            <p className="text-base font-semibold text-foreground">Your insights board is empty</p>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Open Customize Insights to add widgets</p>
            <button
              onClick={() => setShowCustomize(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-all"
            >
              Add widgets
            </button>
          </div>
        ) : (
          <div ref={gridRef} className="relative" style={{ height: gridHeight }}>
            {(previewLayout ?? layout).map(widget => {
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
                    background: 'hsl(var(--card))',
                    border: activeDragId === widget.id ? '2px dashed hsl(var(--primary) / 0.55)' : '1px solid hsl(var(--border))',
                    boxShadow: '0 12px 30px -30px hsl(228 25% 25% / 0.4)',
                    transition: suppressMotion || activeDragId === widget.id
                      ? 'none'
                      : 'left 180ms cubic-bezier(0.22, 1, 0.36, 1), top 180ms cubic-bezier(0.22, 1, 0.36, 1), width 180ms cubic-bezier(0.22, 1, 0.36, 1), height 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  <div className="flex items-center justify-between px-4 pt-3 pb-1 select-none shrink-0">
                    <div className={`flex items-center gap-0.5 min-w-0 transition-opacity ${draft ? 'pointer-events-none opacity-0' : 'opacity-0 group-hover/widget:opacity-100'}`}>
                      <button
                        onPointerDown={e => startGesture(e, widget, 'move')}
                        className="p-1.5 rounded-md hover:bg-black/5 cursor-grab active:cursor-grabbing touch-none"
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
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 flex-shrink-0 rounded-md flex items-center justify-center" style={{ background: `hsl(var(--${accent}) / 0.15)` }}>
                        {def && <def.icon className="w-3.5 h-3.5" style={{ color: `hsl(var(--${accent}))` }} />}
                      </div>
                      <h3 className="text-[11px] font-bold text-foreground truncate uppercase tracking-wide">{widget.title}</h3>
                    </div>
                    <div className={`flex items-center gap-0.5 transition-opacity ${draft ? 'pointer-events-none opacity-0' : 'opacity-0 group-hover/widget:opacity-100'}`}>
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
                    {renderBody(widget as InsightWidget)}
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

      {showCustomize && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className={panelClosing ? 'absolute inset-0 pointer-events-none' : 'absolute inset-0 bg-black/20 backdrop-blur-[2px]'}
            onClick={() => setShowCustomize(false)}
          />
          <div className={`relative w-full max-w-sm h-full bg-card border-l border-border shadow-2xl overflow-y-auto ${panelClosing ? 'animate-slide-out-right' : 'animate-slide-in-right'}`}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4 text-primary" /> Customize Insights
              </h2>
              <button onClick={() => setShowCustomize(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="px-5 pt-3 text-xs text-muted-foreground leading-relaxed">
              Drag a widget from the list onto the board to place it — it snaps into place automatically. Grab the grip to move a widget, drag its corner to resize, and use <span className="font-semibold">×</span> to remove it.
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
                onClick={() => { resetToDefault(); }}
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
    </div>
  );
};

export default Insights;
