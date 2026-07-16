import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  GripVertical,
  FolderKanban,
  Pin,
  Plus,
  Search,
  Tag,
  Sparkles,
  Star,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { SquareToggle } from '@/components/ToggleComponents';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ChecklistSubtaskEditor, { StatusSelector } from '@/components/ChecklistSubtaskEditor';
import type { Checklist, Subtask, TaskStatus } from '@/types/board';
import GoalRow from '@/components/goals/GoalRow';
import GoalCreateModal from '@/components/goals/GoalCreateModal';
import GoalDetailModal from '@/components/goals/GoalDetailModal';
import GoalAnalysisPanel from '@/components/goals/GoalAnalysisPanel';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';

interface GoalTag { id: number; name: string; color: string; }
interface SubGoal { id: string; title: string; completed: boolean; }
interface Goal {
  id: number; title: string; description: string;
  progress: number; target: number; unit: string;
  color: string; category: string; timeframe: string;
  subGoals: SubGoal[]; projectId?: number | null; columnId?: number | null;
  tags: GoalTag[]; pinned: boolean;
  images?: { id: string; fileName: string; fileUrl: string; fileSize: number; }[];
  checklists: Checklist[]; subtasks: Subtask[]; status: TaskStatus;
}
interface Project { id: number; name: string; color: string; }
interface ActivityLog { id: number; action: string; details?: string; createdAt: string; }

interface GoalTemplate {
  id: number;
  name: string;
  title: string;
  description: string;
  target: number;
  unit: string;
  timeframe: string;
  category: string;
  color: string;
  subGoals: SubGoal[];
  projectId: number | null;
}

const GOAL_CATEGORIES = ['Personal', 'Health', 'Career', 'Education', 'Finance', 'Creative', 'Social', 'Other'];
const GOAL_COLORS = ['hsl(var(--primary))', 'hsl(var(--label-green))', 'hsl(var(--label-blue))', 'hsl(var(--label-orange))', 'hsl(var(--label-purple))'];
const TAG_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
const TIMEFRAME_LABELS: Record<string, string> = {
  '1week': '1 Week', '1month': '1 Month', '3months': '3 Months',
  '6months': '6 Months', '1year': '1 Year',
};

const formatDate = (value?: string) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDuration = (minutes: number) => {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const isGoalCompleted = (g: Goal) => Math.round((g.progress / g.target) * 100) >= 100;

const randomTagColor = (): string => TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)] || '#3b82f6';

const Goals: React.FC = () => {
  const { user } = useAuth();

  const tier = user?.subscriptionTier || 'free';
  const isPremium = tier === 'premium' || tier === 'pro';
  const isPro = tier === 'pro';

  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [goalTags, setGoalTags] = useState<GoalTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editGoal, setEditGoal] = useState({ title: '', description: '', target: 10, unit: 'tasks', timeframe: '1month', category: 'Personal', subGoals: [] as SubGoal[], projectId: '' as string, columnId: '' as string, checklists: [] as Checklist[], subtasks: [] as Subtask[], status: 'to_do' as TaskStatus });
  const [editSubGoalTitle, setEditSubGoalTitle] = useState('');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [timeframeFilter, setTimeframeFilter] = useState<string>('all');
  const [projectFilterId, setProjectFilterId] = useState<number | 'all'>('all');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [tagFilterIds, setTagFilterIds] = useState<number[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [sortByTarget, setSortByTarget] = useState(false);
  const [sortTargetDesc, setSortTargetDesc] = useState(false);
  const [pinFilter, setPinFilter] = useState<'all' | 'pinned' | 'unpinned'>('all');

  const [myGoalsCollapsed, setMyGoalsCollapsed] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<number[]>(() => {
    try { const v = localStorage.getItem('goals-collapsed-projects'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [expandedGoalIds, setExpandedGoalIds] = useState<number[]>(() => {
    try { const v = localStorage.getItem('goals-expanded-ids'); return v ? JSON.parse(v) : []; } catch { return []; }
  });

  useEffect(() => { localStorage.setItem('goals-collapsed-projects', JSON.stringify(collapsedProjects)); }, [collapsedProjects]);
  useEffect(() => { localStorage.setItem('goals-expanded-ids', JSON.stringify(expandedGoalIds)); }, [expandedGoalIds]);

  const [completedOpen, setCompletedOpen] = useState(true);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedDeleteGoalIds, setSelectedDeleteGoalIds] = useState<number[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleDeleteGoalId, setSingleDeleteGoalId] = useState<number | null>(null);

  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const [tagPopupGoalId, setTagPopupGoalId] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [tagDeleteConfirm, setTagDeleteConfirm] = useState<number | null>(null);

  const [pendingDragMove, setPendingDragMove] = useState<{ goalId: number; srcDroppableId: string; dstDroppableId: string; srcIndex: number; dstIndex: number; dstProject: number | 'my-goals' | null } | null>(null);
  const [dontAsk, setDontAsk] = useState(false);

  const [orderedActiveIds, setOrderedActiveIds] = useState<number[]>([]);

  const [aiBuilderOpen, setAiBuilderOpen] = useState(false);
  const [aiBuilderInput, setAiBuilderInput] = useState('');
  const [aiBuilderLoading, setAiBuilderLoading] = useState(false);
  const [aiBuilderError, setAiBuilderError] = useState('');

  const [mainTmplPopupOpen, setMainTmplPopupOpen] = useState(false);
  const [templates, setTemplates] = useState<GoalTemplate[]>([]);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [loadTemplateOpen, setLoadTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateError, setTemplateError] = useState('');

  const [newGoalDraft, setNewGoalDraft] = useState({ title: '', description: '', target: 10, unit: 'tasks', timeframe: '1month', category: 'Personal', subGoals: [] as SubGoal[], projectId: '' as string, color: GOAL_COLORS[0] });

  useEffect(() => { if (!pendingDragMove) setDontAsk(false); }, [pendingDragMove]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const [goalsRes, projRes] = await Promise.all([
          fetch('/api/goals', { credentials: 'include' }),
          fetch('/api/projects', { credentials: 'include' }),
        ]);
        if (goalsRes.ok) {
          const data = await goalsRes.json();
          const goalsList = data.goals || data;
          const tagsList = data.tags || [];
          setGoalTags(tagsList);
          setGoals(goalsList.map((g: any) => ({
            id: g.id, title: g.title, description: g.description || '',
            progress: g.progress || 0, target: g.target || 100, unit: g.unit || 'tasks',
            color: g.color || GOAL_COLORS[0], category: g.category || 'Personal',
            timeframe: g.timeframe || '1month',
            subGoals: g.subGoals ? (typeof g.subGoals === 'string' ? JSON.parse(g.subGoals) : g.subGoals) : [],
            projectId: g.projectId, columnId: g.columnId, tags: g.tags || [], pinned: g.pinned || false,
            images: g.images || [],
            checklists: (() => { try { return g.checklists ? (typeof g.checklists === 'string' ? JSON.parse(g.checklists) : g.checklists) : []; } catch { return []; } })(),
            subtasks: (() => { try { return g.subtasks ? (typeof g.subtasks === 'string' ? JSON.parse(g.subtasks) : g.subtasks) : []; } catch { return []; } })(),
            status: (g.status as TaskStatus) || 'to_do',
          })));
        }
        if (projRes.ok) {
          const data = await projRes.json();
          setProjects(data.projects || data);
        }
      } catch { setError('Failed to load goals'); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const fetchGoals = async () => {
    try {
      const res = await fetch('/api/goals', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const goalsList = data.goals || data;
      const tagsList = data.tags || [];
      setGoalTags(tagsList);
      setGoals(goalsList.map((g: any) => ({
        id: g.id, title: g.title, description: g.description || '',
        progress: g.progress || 0, target: g.target || 100, unit: g.unit || 'tasks',
        color: g.color || GOAL_COLORS[0], category: g.category || 'Personal',
        timeframe: g.timeframe || '1month',
        subGoals: g.subGoals ? (typeof g.subGoals === 'string' ? JSON.parse(g.subGoals) : g.subGoals) : [],
        projectId: g.projectId, columnId: g.columnId, tags: g.tags || [], pinned: g.pinned || false,
        images: g.images || [],
        checklists: (() => { try { return g.checklists ? (typeof g.checklists === 'string' ? JSON.parse(g.checklists) : g.checklists) : []; } catch { return []; } })(),
        subtasks: (() => { try { return g.subtasks ? (typeof g.subtasks === 'string' ? JSON.parse(g.subtasks) : g.subtasks) : []; } catch { return []; } })(),
        status: (g.status as TaskStatus) || 'to_do',
      })));
    } catch {}
  };

  const handleCreateGoal = async (data: { title: string; description: string; target: number; unit: string; timeframe: string; category: string; subGoals: SubGoal[]; projectId: string; color: string }) => {
    if (!data.title.trim()) return;
    try {
      const res = await fetch('/api/goals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({
          title: data.title, description: data.description,
          target: data.target, unit: data.unit,
          color: data.color,
          category: data.category, timeframe: data.timeframe,
          subGoals: JSON.stringify(data.subGoals),
          projectId: data.projectId ? Number(data.projectId) : null,
        }),
      });
      if (!res.ok) throw new Error('Failed to create goal');
      const created = await res.json();
      const goal: Goal = {
        id: created.id, title: created.title, description: created.description || '',
        progress: created.progress || 0, target: created.target || 100,
        unit: created.unit || 'tasks', color: created.color || GOAL_COLORS[0],
        category: created.category || 'Personal', timeframe: created.timeframe || '1month',
        subGoals: created.subGoals ? (typeof created.subGoals === 'string' ? JSON.parse(created.subGoals) : created.subGoals) : [],
        projectId: created.projectId, columnId: created.columnId, tags: [], pinned: false, images: [],
        checklists: (() => { try { return created.checklists ? (typeof created.checklists === 'string' ? JSON.parse(created.checklists) : created.checklists) : []; } catch { return []; } })(),
        subtasks: (() => { try { return created.subtasks ? (typeof created.subtasks === 'string' ? JSON.parse(created.subtasks) : created.subtasks) : []; } catch { return []; } })(),
        status: (created.status as TaskStatus) || 'to_do',
      };
      setGoals(prev => [...prev, goal]);
      setAdding(false);
    } catch { alert('Failed to save goal. Please try again.'); }
  };

  const updateProgress = async (id: number, delta: number) => {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;
    const newProgress = Math.max(0, Math.min(goal.target, goal.progress + delta));
    setGoals(prev => prev.map(g => g.id === id ? { ...g, progress: newProgress } : g));
    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ progress: newProgress }),
      });
      if (!res.ok) throw new Error();
    } catch { setGoals(prev => prev.map(g => g.id === id ? { ...g, progress: goal.progress } : g)); }
  };

  const deleteGoal = async (id: number) => {
    try {
      const res = await fetch(`/api/goals/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete goal');
      setGoals(prev => prev.filter(g => g.id !== id));
    } catch { alert('Failed to delete goal. Please try again.'); }
  };

  const openEditGoal = (goal: Goal) => {
    setEditingGoal(goal);
    setEditGoal({
      title: goal.title, description: goal.description, target: goal.target,
      unit: goal.unit, timeframe: goal.timeframe, category: goal.category,
      subGoals: [...goal.subGoals], projectId: goal.projectId ? String(goal.projectId) : '',
      columnId: goal.columnId ? String(goal.columnId) : '',
      checklists: goal.checklists ? [...goal.checklists] : [],
      subtasks: goal.subtasks ? [...goal.subtasks] : [],
      status: goal.status || 'to_do',
    });
    setEditSubGoalTitle('');
    fetchActivity(goal.id);
  };

  const updateGoal = async () => {
    if (!editingGoal || !editGoal.title.trim()) return;
    const updatedFields = {
      title: editGoal.title, description: editGoal.description, target: editGoal.target,
      unit: editGoal.unit, timeframe: editGoal.timeframe, category: editGoal.category,
      subGoals: JSON.stringify(editGoal.subGoals), checklists: JSON.stringify(editGoal.checklists),
      subtasks: JSON.stringify(editGoal.subtasks), status: editGoal.status,
      projectId: editGoal.projectId ? Number(editGoal.projectId) : null,
      columnId: editGoal.columnId ? Number(editGoal.columnId) : null,
    };
    setGoals(goals.map(g => g.id === editingGoal.id ? { ...g, ...editGoal, projectId: editGoal.projectId ? Number(editGoal.projectId) : null, columnId: editGoal.columnId ? Number(editGoal.columnId) : null, subGoals: editGoal.subGoals, checklists: editGoal.checklists, subtasks: editGoal.subtasks, status: editGoal.status } : g));
    setEditingGoal(null);
    try {
      const res = await fetch(`/api/goals/${editingGoal.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(updatedFields),
      });
      if (!res.ok) throw new Error('Failed to update goal');
      fetchGoals();
    } catch { fetchGoals(); }
  };

  const addTagToGoal = async (goalId: number) => {
    if (!newTagName.trim()) return;
    try {
      const res = await fetch(`/api/goals/${goalId}/tags`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      if (res.ok) { setNewTagName(''); fetchGoals(); }
    } catch {}
  };

  const toggleTagOnGoal = async (goalId: number, tagId: number) => {
    try { await fetch(`/api/goals/${goalId}/tags/${tagId}/toggle`, { method: 'POST', credentials: 'include' }); fetchGoals(); } catch {}
  };

  const deleteGoalTag = async (tagId: number) => {
    try { await fetch(`/api/goals/tags/${tagId}`, { method: 'DELETE', credentials: 'include' }); fetchGoals(); } catch {}
  };

  const fetchActivity = async (goalId: number) => {
    try { const res = await fetch(`/api/goals/${goalId}/activity`, { credentials: 'include' }); if (res.ok) { const data = await res.json(); setActivityLogs(data); } } catch {}
  };

  const togglePin = (id: number) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, pinned: !g.pinned } : g));
    fetch(`/api/goals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ pinned: !goals.find(g => g.id === id)?.pinned }) }).catch(() => fetchGoals());
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(file); });

  const uploadGoalImages = async (goalId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newImages: { id: string; fileName: string; fileUrl: string; fileSize: number; }[] = [];
    for (const file of Array.from(files)) {
      const url = await fileToDataUrl(file);
      newImages.push({ id: crypto.randomUUID(), fileName: file.name, fileUrl: url, fileSize: file.size });
    }
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, images: [...(g.images || []), ...newImages] } : g));
  };

  const deleteGoalImage = (goalId: number, imageId: string) => {
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, images: (g.images || []).filter(img => img.id !== imageId) } : g));
  };

  const toggleSubGoalComplete = async (goal: Goal, subGoalId: string) => {
    const sg = goal.subGoals.find(s => s.id === subGoalId);
    if (!sg) return;
    const delta = sg.completed ? -1 : 1;
    updateProgress(goal.id, delta);
    setGoals(prev => prev.map(g => {
      if (g.id !== goal.id) return g;
      return { ...g, subGoals: g.subGoals.map(s => s.id === subGoalId ? { ...s, completed: !s.completed } : s) };
    }));
  };

  const toggleGoalTagFilter = (tagId: number) => {
    setTagFilterIds(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
  };

  const toggleSortByTarget = () => {
    if (!sortByTarget) { setSortByTarget(true); setSortTargetDesc(false); }
    else if (!sortTargetDesc) { setSortTargetDesc(true); }
    else { setSortByTarget(false); setSortTargetDesc(false); }
  };

  const filteredGoals = useMemo(() => {
    const term = search.toLowerCase().trim();
    return goals.filter(g => {
      const matchesSearch = !term || g.title.toLowerCase().includes(term) || g.description.toLowerCase().includes(term);
      const matchesCategory = categoryFilter === 'all' || g.category === categoryFilter;
      const matchesTimeframe = timeframeFilter === 'all' || g.timeframe === timeframeFilter;
      const matchesProject = projectFilterId === 'all' || g.projectId === projectFilterId;
      const matchesTags = tagFilterIds.length === 0 || tagFilterIds.every(id => g.tags?.some(t => t.id === id));
      const matchesPin = pinFilter === 'all' || (pinFilter === 'pinned' ? g.pinned : !g.pinned);
      return matchesSearch && matchesCategory && matchesTimeframe && matchesProject && matchesTags && matchesPin;
    });
  }, [goals, search, categoryFilter, timeframeFilter, projectFilterId, tagFilterIds, pinFilter]);

  const sortedGoals = useMemo(() => {
    const active = filteredGoals.filter(g => !isGoalCompleted(g));
    const completed = filteredGoals.filter(g => isGoalCompleted(g));

    const sortGoals = (a: Goal, b: Goal) => {
      if (sortByTarget) {
        const aPct = a.target > 0 ? a.progress / a.target : 0;
        const bPct = b.target > 0 ? b.progress / b.target : 0;
        return sortTargetDesc ? bPct - aPct : aPct - bPct;
      }
      if (orderedActiveIds.length > 0) {
        const aIdx = orderedActiveIds.indexOf(a.id);
        const bIdx = orderedActiveIds.indexOf(b.id);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
      }
      return (a as any).order || a.id - (b as any).order || b.id;
    };

    const completedSorted = [...completed].sort((a, b) => b.id - a.id);
    return { active: active.sort(sortGoals), completed: completedSorted };
  }, [filteredGoals, sortByTarget, sortTargetDesc, orderedActiveIds]);

  const myGoalsGroup = useMemo(() => sortedGoals.active.filter(g => !g.projectId), [sortedGoals.active]);
  const projectGoalGroups = useMemo(() => {
    return projects.map(project => {
      const goalItems = sortedGoals.active.filter(g => g.projectId === project.id);
      if (goalItems.length === 0) return null;
      return { project, goals: goalItems };
    }).filter(Boolean) as Array<{ project: Project; goals: Goal[] }>;
  }, [sortedGoals.active, projects]);

  const matchingCount = sortedGoals.active.length + sortedGoals.completed.length;

  const getProjectIdForDroppable = (id: string): number | 'my-goals' | null => {
    if (id === 'my-goals') return 'my-goals';
    if (id.startsWith('project-')) return Number(id.slice(8));
    return null;
  };

  const getGoalsForDroppable = (id: string): Goal[] | null => {
    if (id === 'my-goals') return myGoalsGroup;
    if (id.startsWith('project-')) {
      const pg = projectGoalGroups.find(p => p.project.id === Number(id.slice(8)));
      return pg?.goals ?? null;
    }
    return null;
  };

  const applyDragMoveDirect = (srcDroppableId: string, dstDroppableId: string, srcIndex: number, dstIndex: number, dstProject: number | 'my-goals' | null) => {
    const srcGoals = getGoalsForDroppable(srcDroppableId);
    const dstGoals = getGoalsForDroppable(dstDroppableId);
    if (!srcGoals || !dstGoals) return;
    if (srcGoals.length <= srcIndex || dstGoals.length < dstIndex) return;

    const movingGoalId = srcGoals[srcIndex]?.id;
    if (!movingGoalId) return;

    const updateFields: Record<string, any> = {};
    if (dstProject === 'my-goals') {
      updateFields.projectId = null;
    } else if (typeof dstProject === 'number') {
      updateFields.projectId = dstProject;
    }
    if (Object.keys(updateFields).length > 0) {
      fetch(`/api/goals/${movingGoalId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(updateFields),
      }).catch(() => fetchGoals());
    }
    setGoals(prev => prev.map(g => g.id === movingGoalId ? { ...g, ...updateFields } : g));

    const srcIds = srcGoals.map(g => g.id);
    const dstIds = dstGoals.map(g => g.id);
    const [removed] = srcIds.splice(srcIndex, 1);
    dstIds.splice(dstIndex, 0, removed);

    const base = orderedActiveIds.length > 0 ? [...orderedActiveIds] : sortedGoals.active.map(g => g.id);
    const srcSet = new Set(srcGoals.map(g => g.id));
    const dstSet = new Set(dstGoals.map(g => g.id));
    const resultIds: number[] = [];
    let srcInserted = false;
    let dstInserted = false;
    for (const id of base) {
      if (srcSet.has(id) && !srcInserted) { resultIds.push(...srcIds); srcInserted = true; }
      else if (dstSet.has(id) && !dstInserted) { resultIds.push(...dstIds); dstInserted = true; }
      else if (!srcSet.has(id) && !dstSet.has(id)) { resultIds.push(id); }
    }
    if (!srcInserted) resultIds.push(...srcIds);
    if (!dstInserted) resultIds.push(...dstIds);
    setOrderedActiveIds(resultIds);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || sortByTarget) return;

    const srcProject = getProjectIdForDroppable(result.source.droppableId);
    const dstProject = getProjectIdForDroppable(result.destination.droppableId);
    if (srcProject === null || dstProject === null) return;

    const srcId = result.source.droppableId;
    const dstId = result.destination.droppableId;
    const isCrossProject = srcProject !== dstProject;

    if (isCrossProject) {
      if (localStorage.getItem('goals-drag-confirm-project') === 'true') {
        applyDragMoveDirect(srcId, dstId, result.source.index, result.destination.index, dstProject);
        return;
      }
      const srcGoals = getGoalsForDroppable(srcId);
      if (!srcGoals) return;
      const movingGoalId = srcGoals[result.source.index]?.id;
      if (!movingGoalId) return;
      setPendingDragMove({ goalId: movingGoalId, srcDroppableId: srcId, dstDroppableId: dstId, srcIndex: result.source.index, dstIndex: result.destination.index, dstProject });
      return;
    }

    const sectionGoals = getGoalsForDroppable(srcId);
    if (!sectionGoals) return;

    const sectionGoalIds = sectionGoals.map(g => g.id);
    const ids = [...sectionGoalIds];
    const [removed] = ids.splice(result.source.index, 1);
    ids.splice(result.destination.index, 0, removed);

    const base = orderedActiveIds.length > 0 ? [...orderedActiveIds] : sortedGoals.active.map(g => g.id);
    const sectionIdSet = new Set(sectionGoalIds);
    const resultIds: number[] = [];
    let inserted = false;
    for (const id of base) {
      if (sectionIdSet.has(id)) {
        if (!inserted) {
          resultIds.push(...ids);
          inserted = true;
        }
      } else {
        resultIds.push(id);
      }
    }
    setOrderedActiveIds(resultIds);
  };

  const generateAIGoal = async () => {
    if (!aiBuilderInput.trim()) return;
    setAiBuilderLoading(true);
    setAiBuilderError('');
    try {
      const res = await fetch('/api/ai/goal-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ input: aiBuilderInput }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate goal');
      }
      const data: { title: string; description: string; target: number; unit: string; timeframe: string; category: string; color: string; subGoals: SubGoal[] } = await res.json();
      setNewGoalDraft({
        title: data.title || '',
        description: data.description || '',
        target: data.target || 10,
        unit: data.unit || 'tasks',
        timeframe: data.timeframe || '1month',
        category: data.category || 'Personal',
        subGoals: data.subGoals || [],
        projectId: '',
        color: data.color || GOAL_COLORS[0],
      });
      setAiBuilderOpen(false);
      setAiBuilderInput('');
      setAdding(true);
    } catch (err: any) {
      setAiBuilderError(err.message || 'Something went wrong');
    } finally {
      setAiBuilderLoading(false);
    }
  };

  const handleBulkDelete = () => {
    if (selectedDeleteGoalIds.length === 0) return;
    setDeleteConfirmOpen(true);
  };

  const confirmBulkDelete = () => {
    selectedDeleteGoalIds.forEach(id => deleteGoal(id));
    setSelectedDeleteGoalIds([]);
    setIsDeleteMode(false);
    setDeleteConfirmOpen(false);
  };

  const confirmSingleDelete = () => {
    if (singleDeleteGoalId) deleteGoal(singleDeleteGoalId);
    setSingleDeleteGoalId(null);
  };

  const toggleExpand = (goalId: number) => {
    setExpandedGoalIds(prev =>
      prev.includes(goalId) ? prev.filter(id => id !== goalId) : [...prev, goalId]
    );
  };

  const renderGoalRow = (goal: Goal, dragHandleProps?: any, isDragging?: boolean) => {
    const isExpanded = expandedGoalIds.includes(goal.id);
    const pct = goal.target > 0 ? Math.round((goal.progress / goal.target) * 100) : 0;
    const proj = goal.projectId ? projects.find(p => p.id === goal.projectId) : null;
    const subGoalCount = goal.subGoals?.length || 0;
    const subGoalDone = goal.subGoals?.filter(s => s.completed).length || 0;
    const goalTagsSlice = goal.tags.slice(0, 3);

    return (
      <div
        key={goal.id}
        onClick={() => {
          if (isDeleteMode) {
            setSelectedDeleteGoalIds(prev =>
              prev.includes(goal.id) ? prev.filter(id => id !== goal.id) : [...prev, goal.id]
            );
          } else {
            openEditGoal(goal);
          }
        }}
        className={`group border rounded-xl bg-card transition-all duration-200 cursor-pointer ${
          isDeleteMode
            ? selectedDeleteGoalIds.includes(goal.id)
              ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
              : 'border-border hover:bg-muted/20'
            : isDragging
              ? 'border-primary/40 shadow-lg rotate-[2deg]'
              : 'border-border hover:border-border/80 hover:shadow-sm'
        }`}
      >
        <div className="flex items-center gap-1 px-3 py-3">
          {dragHandleProps && (
            <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
              <GripVertical className="w-4 h-4" />
            </div>
          )}
          {isDeleteMode ? (
            <input
              type="checkbox"
              checked={selectedDeleteGoalIds.includes(goal.id)}
              onChange={() => {
                setSelectedDeleteGoalIds(prev =>
                  prev.includes(goal.id) ? prev.filter(id => id !== goal.id) : [...prev, goal.id]
                );
              }}
              onClick={e => e.stopPropagation()}
              className="w-4 h-4 rounded border-border accent-destructive flex-shrink-0 cursor-pointer"
            />
          ) : (
            <button
              onClick={e => { e.stopPropagation(); togglePin(goal.id); }}
              className={`p-1.5 rounded-md flex-shrink-0 transition-all ${goal.pinned ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
              title={goal.pinned ? 'Unpin goal' : 'Pin goal'}
            >
              <Pin className={`w-3.5 h-3.5 ${goal.pinned ? 'fill-current' : ''}`} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: goal.color }} />
              <span className="text-sm font-medium text-left text-foreground truncate">{goal.title}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {goal.tags.length > 0 && (
                <button
                  onClick={e => { e.stopPropagation(); setTagPopupGoalId(tagPopupGoalId === goal.id ? null : goal.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 bg-muted text-muted-foreground flex items-center gap-1"
                >
                  <Tag className="w-2.5 h-2.5" />
                  Tags
                </button>
              )}
              {goalTagsSlice.map(tag => (
                <button
                  key={tag.id}
                  onClick={e => { e.stopPropagation(); setTagPopupGoalId(tagPopupGoalId === goal.id ? null : goal.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </button>
              ))}
              {goal.tags.length > goalTagsSlice.length && (
                <button
                  onClick={e => { e.stopPropagation(); setTagPopupGoalId(tagPopupGoalId === goal.id ? null : goal.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0"
                >
                  +{goal.tags.length - goalTagsSlice.length}
                </button>
              )}
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase flex-shrink-0">{TIMEFRAME_LABELS[goal.timeframe] || goal.timeframe}</span>
              <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">{goal.category}</span>
              {proj && (
                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: proj.color }} />
                  {proj.name}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-24 hidden sm:block">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
              </div>
              <p className="text-[8px] text-muted-foreground mt-0.5 text-right">{goal.progress}/{goal.target} {goal.unit}</p>
            </div>
            <span className="text-sm font-bold text-foreground min-w-[40px] text-right">{pct}%</span>
            {!isDeleteMode && (
              <>
                <div className="flex items-center gap-0.5">
                  <button onClick={e => { e.stopPropagation(); updateProgress(goal.id, -1); }} className="w-6 h-6 rounded-md bg-muted hover:bg-muted/80 text-foreground text-xs font-bold flex items-center justify-center transition-colors">−</button>
                  <button onClick={e => { e.stopPropagation(); updateProgress(goal.id, 1); }} className="w-6 h-6 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold flex items-center justify-center transition-colors">+</button>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); toggleExpand(goal.id); }}
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </>
            )}
          </div>
        </div>
        {isExpanded && !isDeleteMode && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 space-y-4 bg-muted/10 rounded-b-xl">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Progress</h4>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground">{goal.progress}/{goal.target} {goal.unit}</span>
                <span className="text-xs font-semibold">{pct}%</span>
              </div>
            </div>
            {subGoalCount > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2">Sub-goals ({subGoalDone}/{subGoalCount})</h4>
                <div className="space-y-1.5">
                  {goal.subGoals.map(sg => (
                    <div key={sg.id} className="flex items-center gap-2.5 text-sm">
                      <input
                        type="checkbox"
                        checked={sg.completed}
                        onChange={() => toggleSubGoalComplete(goal, sg.id)}
                        className="rounded border-border accent-primary"
                      />
                      <span className={sg.completed ? 'line-through text-muted-foreground' : 'text-foreground'}>{sg.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-card/30">
        <div>
          <h1 className="text-lg font-bold text-foreground">All Goals</h1>
          <p className="text-xs text-muted-foreground">{matchingCount} goals matching filters</p>
        </div>
        <div className="flex items-center gap-2">

          <button
            onClick={() => {
              if (isDeleteMode) {
                setIsDeleteMode(false);
                setSelectedDeleteGoalIds([]);
              } else {
                setIsDeleteMode(true);
                setSelectedDeleteGoalIds([]);
              }
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border transition-all ${
              isDeleteMode
                ? 'bg-destructive/15 border-destructive/30 text-destructive'
                : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {isDeleteMode ? 'Exit Delete' : 'Delete'}
          </button>

          <div className="relative">
            <button
              onClick={async () => {
                try {
                  const stored = localStorage.getItem('goal-templates');
                  setTemplates(stored ? JSON.parse(stored) : []);
                  setMainTmplPopupOpen(true);
                } catch { setTemplates([]); setMainTmplPopupOpen(true); }
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border transition-all bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Star className="w-4 h-4" />
              Templates
            </button>
            {mainTmplPopupOpen && (
              <div className="absolute right-0 mt-1.5 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Templates</h3>
                  </div>
                  <button onClick={() => setMainTmplPopupOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                {templates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center mb-2">
                      <Star className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-foreground">No templates yet</p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-border">
                    {templates.map(tmpl => (
                      <div key={tmpl.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-all group">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-lg bg-primary/5 flex items-center justify-center flex-shrink-0">
                            <Star className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium text-foreground block truncate">{tmpl.name}</span>
                            {tmpl.title && <span className="text-[11px] text-muted-foreground truncate block">{tmpl.title}</span>}
                          </div>
                        </div>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all ml-2">
                          <button
                            onClick={() => {
                              setMainTmplPopupOpen(false);
                              setNewGoalDraft({
                                title: tmpl.title || '',
                                description: tmpl.description || '',
                                target: tmpl.target || 10,
                                unit: tmpl.unit || 'tasks',
                                timeframe: tmpl.timeframe || '1month',
                                category: tmpl.category || 'Personal',
                                subGoals: tmpl.subGoals || [],
                                projectId: tmpl.projectId ? String(tmpl.projectId) : '',
                                color: tmpl.color || GOAL_COLORS[0],
                              });
                              setAdding(true);
                            }}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
                            title="Use template"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              const stored = localStorage.getItem('goal-templates');
                              const all: GoalTemplate[] = stored ? JSON.parse(stored) : [];
                              localStorage.setItem('goal-templates', JSON.stringify(all.filter(t => t.id !== tmpl.id)));
                              setTemplates(prev => prev.filter(t => t.id !== tmpl.id));
                            }}
                            className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-all"
                            title="Delete template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Goal
          </button>
        </div>
      </header>

      <div className="px-6 py-4 border-b border-border bg-card/10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search goals..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-muted/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border">
            {['all', ...GOAL_CATEGORIES].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                  categoryFilter === cat
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 min-w-0">
            {tagFilterIds.length > 0 && (
              <button
                onClick={() => setTagFilterIds([])}
                className="px-3 py-1.5 text-xs rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                Clear tags
              </button>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setTagPickerOpen(prev => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <Tag className="w-3.5 h-3.5" />
              Tags
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {tagPickerOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setTagPickerOpen(false)} />
                <div className="absolute left-0 mt-1.5 w-96 max-w-[95vw] bg-card border border-border rounded-2xl shadow-xl z-30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Tag filter</p>
                      <p className="text-xs text-muted-foreground">Filter goals by tag.</p>
                    </div>
                    <button onClick={() => setTagPickerOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {goalTags.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">No tags yet.</p>
                    )}
                    {goalTags.map(tag => {
                      const isActive = tagFilterIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          onClick={() => toggleGoalTagFilter(tag.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left ${
                            isActive
                              ? 'border-primary/30 bg-primary/5 shadow-sm'
                              : 'border-border/60 hover:bg-muted/40'
                          }`}
                        >
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                          <span className="text-sm text-foreground flex-1">{tag.name}</span>
                          {isActive && <span className="text-[10px] text-primary font-bold">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setProjectDropdownOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border transition-all ${
                projectFilterId !== 'all'
                  ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
                  : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>
                {projectFilterId === 'all'
                  ? 'Project Filter'
                  : `Project: ${projects.find(project => project.id === projectFilterId)?.name || 'Selected'}`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            </button>
            {projectDropdownOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setProjectDropdownOpen(false)} />
              <div className="absolute left-0 mt-1.5 w-64 bg-card border border-border rounded-xl shadow-lg z-30 p-2">
                <button
                  onClick={() => { setProjectFilterId('all'); setProjectDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted"
                >
                  All projects
                </button>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {projects.map(project => (
                    <button
                      key={project.id}
                      onClick={() => { setProjectFilterId(project.id); setProjectDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted flex items-center gap-2 ${
                        projectFilterId === project.id ? 'bg-primary/10 text-primary' : ''
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                      <span className="flex-1 truncate">{project.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleSortByTarget}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border transition-all ${
                sortByTarget
                  ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                  : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
              }`}
              title={sortByTarget ? (sortTargetDesc ? 'Least progress first — click to disable' : 'Most progress first — click for least progress') : 'Sort by progress'}
            >
              {sortByTarget && sortTargetDesc ? (
                <ArrowDown className="w-3.5 h-3.5" />
              ) : sortByTarget ? (
                <ArrowUp className="w-3.5 h-3.5" />
              ) : (
                <ArrowUp className="w-3.5 h-3.5 opacity-40" />
              )}
              Sort by Progress
            </button>
            <button
              onClick={() => { setAnalysisPanelOpen(true); }}
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 transition-all"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Goal Analysis
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 relative">
        <DragDropContext onDragEnd={handleDragEnd}>
        <div className="max-w-5xl mx-auto space-y-2 pb-24">
          {loading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground mt-3">Loading goals...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-sm text-destructive">{error}</p>
              <button onClick={() => window.location.reload()} className="mt-2 text-sm text-primary hover:underline">Try again</button>
            </div>
          ) : myGoalsGroup.length === 0 && projectGoalGroups.length === 0 && sortedGoals.completed.length === 0 ? (
            <div className="text-center py-16">
              <Target className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No goals found</p>
            </div>
          ) : (
            <>
              {/* MY GOALS section */}
              {myGoalsGroup.length > 0 && (
                <div className="mb-3">
                  <button
                    onClick={() => setMyGoalsCollapsed(prev => !prev)}
                    className="flex items-center gap-2 w-full px-2 py-2 text-left hover:bg-muted/30 rounded-lg transition-all mb-1"
                  >
                    {myGoalsCollapsed
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className="text-xs font-bold tracking-wider text-muted-foreground">My Goals</span>
                    <span className="text-[10px] text-muted-foreground/50 ml-1">({myGoalsGroup.length})</span>
                  </button>
                  {!myGoalsCollapsed && (
                    <Droppable droppableId="my-goals">
                      {(dropProvided, snapshot) => (
                        <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="space-y-1.5">
                          {myGoalsGroup.map((goal, index) => (
                            <Draggable key={goal.id} draggableId={String(goal.id)} index={index}>
                              {(goalProvided, goalSnapshot) => (
                                <div ref={goalProvided.innerRef} {...goalProvided.draggableProps}>
                                  {renderGoalRow(goal, goalProvided.dragHandleProps, goalSnapshot.isDragging)}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {dropProvided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  )}
                </div>
              )}

              {myGoalsGroup.length > 0 && projectGoalGroups.length > 0 && <div className="w-full h-0.5 bg-border/40 my-4" />}

              {/* Project sections */}
              {projectGoalGroups.map(({ project, goals: projectGoals }, idx) => {
                const isProjectCollapsed = collapsedProjects.includes(project.id);
                return (
                  <div key={project.id} className="mb-3">
                    {idx > 0 && <div className="w-full h-0.5 bg-border/40 my-4" />}
                    <button
                      onClick={() => setCollapsedProjects(prev =>
                        prev.includes(project.id) ? prev.filter(id => id !== project.id) : [...prev, project.id]
                      )}
                      className="flex items-center gap-2 w-full px-2 py-2 text-left hover:bg-muted/30 rounded-lg transition-all mb-1"
                    >
                      {isProjectCollapsed
                        ? <ChevronDown className="w-3.5 h-3.5" style={{ color: project.color }} />
                        : <ChevronUp className="w-3.5 h-3.5" style={{ color: project.color }} />}
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                      <span className="text-xs font-bold tracking-wider text-foreground">{project.name}</span>
                      <span className="text-[10px] text-muted-foreground/50 ml-1">({projectGoals.length})</span>
                    </button>
                    {!isProjectCollapsed && (
                      <div className="pl-4">
                        <Droppable droppableId={"project-" + project.id}>
                          {(dropProvided, snapshot) => (
                            <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="space-y-1.5">
                              {projectGoals.map((goal, index) => (
                                <Draggable key={goal.id} draggableId={String(goal.id)} index={index}>
                                  {(goalProvided, goalSnapshot) => (
                                    <div ref={goalProvided.innerRef} {...goalProvided.draggableProps}>
                                      {renderGoalRow(goal, goalProvided.dragHandleProps, goalSnapshot.isDragging)}
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {dropProvided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Completed section */}
              {sortedGoals.completed.length > 0 && (
                <div className="mt-6 pt-4 border-t border-border/80">
                  <div className="border border-label-green/20 rounded-xl bg-label-green/5">
                    <button
                      onClick={() => setCompletedOpen(prev => !prev)}
                      className="w-full flex items-center justify-between px-4 py-3"
                    >
                      <span className="text-sm font-semibold text-label-green flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Completed ({sortedGoals.completed.length})
                      </span>
                      {completedOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </button>
                    {completedOpen && (
                      <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                        {sortedGoals.completed.map(goal => {
                          const pct = goal.target > 0 ? Math.round((goal.progress / goal.target) * 100) : 0;
                          return (
                            <div
                              key={goal.id}
                              onClick={() => {
                                if (isDeleteMode) {
                                  setSelectedDeleteGoalIds(prev =>
                                    prev.includes(goal.id) ? prev.filter(id => id !== goal.id) : [...prev, goal.id]
                                  );
                                } else {
                                  openEditGoal(goal);
                                }
                              }}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all group ${
                                isDeleteMode
                                  ? selectedDeleteGoalIds.includes(goal.id)
                                    ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
                                    : 'border-border bg-background/50 hover:bg-muted/20'
                                  : 'border-label-green/15 bg-background/70 hover:bg-muted/40'
                              }`}
                            >
                              {isDeleteMode ? (
                                <input
                                  type="checkbox"
                                  checked={selectedDeleteGoalIds.includes(goal.id)}
                                  onChange={() => {
                                    setSelectedDeleteGoalIds(prev =>
                                      prev.includes(goal.id) ? prev.filter(id => id !== goal.id) : [...prev, goal.id]
                                    );
                                  }}
                                  onClick={e => e.stopPropagation()}
                                  className="w-4 h-4 rounded border-border accent-destructive flex-shrink-0 cursor-pointer"
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-label-green/20 flex items-center justify-center flex-shrink-0">
                                  <svg className="w-3 h-3 text-label-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                </div>
                              )}
                              <span className={`text-sm text-left flex-1 ${isDeleteMode ? 'text-foreground font-medium' : 'text-muted-foreground/80 line-through'}`}>
                                {goal.title}
                              </span>
                              <span className="text-xs text-muted-foreground flex-shrink-0">{goal.progress}/{goal.target} {goal.unit}</span>
                              <button
                                onClick={e => { e.stopPropagation(); setSingleDeleteGoalId(goal.id); }}
                                className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                                title="Delete goal"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        </DragDropContext>

        {/* Floating AI Goal button */}
        <button
          onClick={() => setAiBuilderOpen(true)}
          className="fixed bottom-8 right-8 z-40 w-14 h-14 rounded-full bg-foreground text-background shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200"
          title="AI Goal Builder"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      </div>

      <GoalCreateModal
        open={adding}
        onClose={() => setAdding(false)}
        onSave={handleCreateGoal}
        projects={projects}
        goalColors={GOAL_COLORS}
        goalCategories={GOAL_CATEGORIES}
      />

      <GoalDetailModal
        goal={editingGoal ? { ...editingGoal, ...editGoal, id: editingGoal.id } : null}
        projects={projects}
        goalColors={GOAL_COLORS}
        goalCategories={GOAL_CATEGORIES}
        tags={goalTags}
        goalTags={goalTags}
        images={editingGoal?.images}
        activityLogs={activityLogs}
        onFieldChange={(field, value) => setEditGoal(prev => ({ ...prev, [field]: value }))}
        onSave={updateGoal}
        onClose={() => setEditingGoal(null)}
        onDelete={() => { if (editingGoal) { deleteGoal(editingGoal.id); setEditingGoal(null); } }}
        onTagPopup={() => setTagPopupGoalId(editingGoal ? editingGoal.id : null)}
        onTagToggle={(tagId) => { if (editingGoal) toggleTagOnGoal(editingGoal.id, tagId); }}
        onAddTag={(name, color) => { if (editingGoal) addTagToGoal(editingGoal.id); }}
        onDeleteTag={deleteGoalTag}
        onImageUpload={(files) => { if (editingGoal) uploadGoalImages(editingGoal.id, files); }}
        onImageDelete={(imageId) => { if (editingGoal) deleteGoalImage(editingGoal.id, imageId); }}
        onSubGoalToggle={(subGoalId) => { if (editingGoal) toggleSubGoalComplete(editingGoal, subGoalId); }}
        tagPopupOpen={tagPopupGoalId !== null}
        tagPopupGoalId={tagPopupGoalId}
      />

      <GoalAnalysisPanel
        open={analysisPanelOpen}
        onClose={() => setAnalysisPanelOpen(false)}
        goals={filteredGoals}
        loading={analysisLoading}
      />

      {isDeleteMode && (
        <div className="sticky bottom-0 left-0 right-0 z-30 p-4 bg-background/80 backdrop-blur-md border-t border-border flex justify-center animate-fade-in">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center text-destructive flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-foreground">
                {selectedDeleteGoalIds.length === 0
                  ? 'Select goals to delete'
                  : `${selectedDeleteGoalIds.length} goal${selectedDeleteGoalIds.length === 1 ? '' : 's'} selected`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSelectedDeleteGoalIds([]); setIsDeleteMode(false); }}
                className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-muted text-muted-foreground transition-all"
              >
                Cancel
              </button>
              <button
                disabled={selectedDeleteGoalIds.length === 0}
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-destructive text-destructive-foreground rounded-lg disabled:opacity-40 hover:bg-destructive/95 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete selected — {selectedDeleteGoalIds.length} goal{selectedDeleteGoalIds.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <DeleteConfirmDialog
          count={selectedDeleteGoalIds.length}
          itemName="goal"
          onConfirm={confirmBulkDelete}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}

      {singleDeleteGoalId && (
        <DeleteConfirmDialog
          count={1}
          itemName="goal"
          onConfirm={confirmSingleDelete}
          onCancel={() => setSingleDeleteGoalId(null)}
        />
      )}

      {aiBuilderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setAiBuilderOpen(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">AI Goal Builder</h2>
                  <p className="text-xs text-muted-foreground">Describe your goal and AI will structure it for you</p>
                </div>
              </div>
              <button onClick={() => setAiBuilderOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {!isPro ? (
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Pro Feature</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">AI Goal Builder is available exclusively for Pro users. Upgrade to unlock AI-powered goal creation.</p>
                <button
                  onClick={() => window.location.href = '/pricing'}
                  className="px-6 py-2.5 text-sm font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all"
                >
                  Upgrade to Pro
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <textarea
                  autoFocus
                  value={aiBuilderInput}
                  onChange={e => setAiBuilderInput(e.target.value)}
                  placeholder="Describe your goal in detail...&#10;&#10;e.g. 'I want to read 20 books this year, focusing on non-fiction about psychology and business.'"
                  rows={7}
                  className="w-full bg-muted/40 border border-border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {aiBuilderError && (
                  <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{aiBuilderError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setAiBuilderOpen(false)}
                    className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={generateAIGoal}
                    disabled={!aiBuilderInput.trim() || aiBuilderLoading}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
                  >
                    {aiBuilderLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {pendingDragMove && (() => {
        const { srcDroppableId, dstDroppableId, srcIndex, dstIndex, dstProject } = pendingDragMove;

        const confirmMove = () => {
          if (dontAsk) {
            localStorage.setItem('goals-drag-confirm-project', 'true');
          }
          applyDragMoveDirect(srcDroppableId, dstDroppableId, srcIndex, dstIndex, dstProject);
          setPendingDragMove(null);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPendingDragMove(null)}>
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-foreground">Move goal?</h3>
              <p className="text-xs text-muted-foreground mt-2">
                Are you sure you want to move this goal? It will change the goal's project.
              </p>
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input type="checkbox" checked={dontAsk} onChange={e => setDontAsk(e.target.checked)} className="rounded border-border" />
                <span className="text-xs text-muted-foreground">Don't ask me again</span>
              </label>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setPendingDragMove(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                <button onClick={confirmMove} className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:opacity-90">Move</button>
              </div>
            </div>
          </div>
        );
      })()}

      {tagDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setTagDeleteConfirm(null)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-foreground">Delete tag everywhere?</h3>
            <p className="text-xs text-muted-foreground mt-2">This will remove this tag from the whole app. This action cannot be undone.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setTagDeleteConfirm(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={async () => {
                if (tagDeleteConfirm) await deleteGoalTag(tagDeleteConfirm);
                setTagDeleteConfirm(null);
                setTagPopupGoalId(null);
              }} className="px-4 py-2 text-sm font-semibold bg-destructive text-destructive-foreground rounded-xl hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}

      {tagPopupGoalId && (() => {
        const popupGoal = goals.find(g => g.id === tagPopupGoalId);
        if (!popupGoal) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setTagPopupGoalId(null)}>
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
            <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-foreground">Tags</h3>
                <button onClick={() => setTagPopupGoalId(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>
              <div className="max-h-60 space-y-2 overflow-y-auto mb-4">
                {goalTags.map(tag => {
                  const active = popupGoal.tags.some(t => t.id === tag.id);
                  return (
                    <div key={tag.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                      <button onClick={() => toggleTagOnGoal(popupGoal.id, tag.id)} className="flex flex-1 items-center gap-2 text-left">
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                        <span className="text-sm text-foreground">{tag.name}</span>
                        {active && <span className="ml-auto text-[10px] text-primary font-semibold">Selected</span>}
                      </button>
                      <button onClick={() => setTagDeleteConfirm(tag.id)} className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border pt-4">
                <div className="flex gap-2 mb-2">
                  <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Create tag"
                    className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                  <button onClick={() => setNewTagColor(TAG_COLORS[(TAG_COLORS.indexOf(newTagColor) + 1) % TAG_COLORS.length])} className="w-11 rounded-xl border border-border" style={{ backgroundColor: newTagColor }} title="Random color" />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => addTagToGoal(popupGoal.id)}
                    disabled={!newTagName.trim()}
                    className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                  >
                    Add tag
                  </button>
                  <button onClick={() => setTagPopupGoalId(null)} className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground">Done</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

export default Goals;
