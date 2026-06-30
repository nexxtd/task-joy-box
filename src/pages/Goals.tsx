import React, { useState, useEffect, useMemo } from 'react';
import { Target, Plus, Trash2, X, Tag, BarChart3, ChevronDown, ChevronUp, Search, FolderKanban, Pin, GripVertical, Image, Paperclip, Edit3, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface GoalTag {
  id: number;
  name: string;
  color: string;
}

interface SubGoal {
  id: string;
  title: string;
  completed: boolean;
}

interface Goal {
  id: number;
  title: string;
  description: string;
  progress: number;
  target: number;
  unit: string;
  color: string;
  category: string;
  timeframe: string;
  subGoals: SubGoal[];
  projectId?: number | null;
  columnId?: number | null;
  tags: GoalTag[];
  pinned: boolean;
  images?: { id: string; fileName: string; fileUrl: string; fileSize: number; }[];
}

interface Project {
  id: number;
  name: string;
  color: string;
}

interface ActivityLog {
  id: number;
  action: string;
  details?: string;
  createdAt: string;
}

const GOAL_COLORS = ['hsl(var(--primary))', 'hsl(var(--label-green))', 'hsl(var(--label-blue))', 'hsl(var(--label-orange))', 'hsl(var(--label-purple))'];
const GOAL_CATEGORIES = ['Personal', 'Health', 'Career', 'Education', 'Finance', 'Creative', 'Social', 'Other'];
const TIMEFRAME_LABELS: Record<string, string> = {
  '1week': '1 Week',
  '1month': '1 Month',
  '3months': '3 Months',
  '6months': '6 Months',
  '1year': '1 Year',
};
const TAG_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

const Goals: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [adding, setAdding] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: '', description: '', target: 10, unit: 'tasks', timeframe: '1month', category: 'Personal', subGoals: [] as SubGoal[], projectId: '' as string, columnId: '' as string });
  const [newSubGoalTitle, setNewSubGoalTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [editGoal, setEditGoal] = useState({ title: '', description: '', target: 10, unit: 'tasks', timeframe: '1month', category: 'Personal', subGoals: [] as SubGoal[], projectId: '' as string, columnId: '' as string });
  const [editSubGoalTitle, setEditSubGoalTitle] = useState('');

  const [projects, setProjects] = useState<Project[]>([]);
  const [goalTags, setGoalTags] = useState<GoalTag[]>([]);
  const [tagPopupGoalId, setTagPopupGoalId] = useState<number | null>(null);
  const [selectedGoalTagIds, setSelectedGoalTagIds] = useState<number[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityCollapsed, setActivityCollapsed] = useState(false);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [timeframeFilter, setTimeframeFilter] = useState<string>('all');
  const [projectFilterId, setProjectFilterId] = useState<number | 'all'>('all');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [sortByTarget, setSortByTarget] = useState(false);
  const [sortTargetDesc, setSortTargetDesc] = useState(false);

  const [myGoalsCollapsed, setMyGoalsCollapsed] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<number[]>([]);
  const [pinFilter, setPinFilter] = useState<'all' | 'pinned' | 'unpinned'>('all');
  const [imagesCollapsed, setImagesCollapsed] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchGoals();
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects', { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setProjects(data.projects || data); }
    } catch {}
  };

  const fetchGoals = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/goals', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch goals');
      const data = await res.json();
      const goalsList = data.goals || data;
      const tagsList = data.tags || [];
      setGoalTags(tagsList);
      setGoals(goalsList.map((g: any) => ({
        id: g.id,
        title: g.title,
        description: g.description || '',
        progress: g.progress || 0,
        target: g.target || 100,
        unit: g.unit || 'tasks',
        color: g.color || GOAL_COLORS[0],
        category: g.category || 'Personal',
        timeframe: g.timeframe || '1month',
        subGoals: g.subGoals ? (typeof g.subGoals === 'string' ? JSON.parse(g.subGoals) : g.subGoals) : [],
        projectId: g.projectId,
        columnId: g.columnId,
        tags: g.tags || [],
        pinned: g.pinned || false,
        images: g.images || [],
      })));
    } catch (err) {
      setError('Failed to load goals');
    } finally {
      setLoading(false);
    }
  };

  const addGoal = async () => {
    if (!newGoal.title.trim()) return;

    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: newGoal.title, description: newGoal.description,
          target: newGoal.target, unit: newGoal.unit,
          color: GOAL_COLORS[goals.length % GOAL_COLORS.length],
          category: newGoal.category, timeframe: newGoal.timeframe,
          subGoals: JSON.stringify(newGoal.subGoals),
          projectId: newGoal.projectId ? Number(newGoal.projectId) : null,
          columnId: newGoal.columnId ? Number(newGoal.columnId) : null,
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
      };

      setGoals(prev => [...prev, goal]);
      setNewGoal({ title: '', description: '', target: 10, unit: 'tasks', timeframe: '1month', category: 'Personal', subGoals: [], projectId: '', columnId: '' });
      setNewSubGoalTitle('');
      setAdding(false);
    } catch (err) {
      console.error('Error creating goal:', err);
      alert('Failed to save goal. Please try again.');
    }
  };

  const updateProgress = async (id: number, delta: number) => {
    const goal = goals.find(g => g.id === id);
    if (!goal) return;

    const newProgress = Math.max(0, Math.min(goal.target, goal.progress + delta));

    setGoals(prev => prev.map(g =>
      g.id === id ? { ...g, progress: newProgress } : g
    ));

    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ progress: newProgress }),
      });

      if (!res.ok) throw new Error('Failed to update goal');
    } catch (err) {
      console.error('Error updating goal:', err);
      setGoals(prev => prev.map(g =>
        g.id === id ? { ...g, progress: goal.progress } : g
      ));
    }
  };

  const deleteGoal = async (id: number) => {
    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) throw new Error('Failed to delete goal');

      setGoals(prev => prev.filter(g => g.id !== id));
    } catch (err) {
      console.error('Error deleting goal:', err);
      alert('Failed to delete goal. Please try again.');
    }
  };

  const openEditGoal = (goal: Goal) => {
    setEditingGoal(goal);
    setEditGoal({
      title: goal.title, description: goal.description, target: goal.target,
      unit: goal.unit, timeframe: goal.timeframe, category: goal.category,
      subGoals: [...goal.subGoals], projectId: goal.projectId ? String(goal.projectId) : '',
      columnId: goal.columnId ? String(goal.columnId) : '',
    });
    setEditSubGoalTitle('');
    fetchActivity(goal.id);
  };

  const updateGoal = async () => {
    if (!editingGoal || !editGoal.title.trim()) return;
    const prev = editingGoal;
    const updatedFields = {
      title: editGoal.title, description: editGoal.description, target: editGoal.target,
      unit: editGoal.unit, timeframe: editGoal.timeframe, category: editGoal.category,
      subGoals: JSON.stringify(editGoal.subGoals),
      projectId: editGoal.projectId ? Number(editGoal.projectId) : null,
      columnId: editGoal.columnId ? Number(editGoal.columnId) : null,
    };
    setGoals(goals.map(g => g.id === editingGoal.id ? { ...g, ...editGoal, projectId: editGoal.projectId ? Number(editGoal.projectId) : null, columnId: editGoal.columnId ? Number(editGoal.columnId) : null, subGoals: editGoal.subGoals } : g));
    setEditingGoal(null);
    try {
      const res = await fetch(`/api/goals/${editingGoal.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(updatedFields),
      });
      if (!res.ok) throw new Error('Failed to update goal');
      fetchGoals();
    } catch {
      setGoals(prev_ => prev_.map(g => g.id === prev.id ? prev : g));
      fetchGoals();
    }
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
    try {
      await fetch(`/api/goals/${goalId}/tags/${tagId}/toggle`, { method: 'POST', credentials: 'include' });
      fetchGoals();
    } catch {}
  };

  const deleteGoalTag = async (tagId: number) => {
    try {
      await fetch(`/api/goals/tags/${tagId}`, { method: 'DELETE', credentials: 'include' });
      fetchGoals();
    } catch {}
  };

  const fetchActivity = async (goalId: number) => {
    try {
      const res = await fetch(`/api/goals/${goalId}/activity`, { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setActivityLogs(data); }
    } catch {}
  };

  const toggleGoalTagFilter = (tagId: number) => {
    setSelectedGoalTagIds(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const toggleSortByTarget = () => {
    if (!sortByTarget) {
      setSortByTarget(true);
      setSortTargetDesc(false);
    } else if (!sortTargetDesc) {
      setSortTargetDesc(true);
    } else {
      setSortByTarget(false);
      setSortTargetDesc(false);
    }
  };

  const togglePin = (id: number) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, pinned: !g.pinned } : g));
    fetch(`/api/goals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ pinned: !goals.find(g => g.id === id)?.pinned }) }).catch(() => fetchGoals());
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const uploadGoalImages = async (goalId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newImages: { id: string; fileName: string; fileUrl: string; fileSize: number; }[] = [];
    for (const file of Array.from(files)) {
      const url = await fileToDataUrl(file);
      newImages.push({ id: crypto.randomUUID(), fileName: file.name, fileUrl: url, fileSize: file.size });
    }
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, images: [...(g.images || []), ...newImages] } : g));
    setUploading(false);
  };

  const deleteGoalImage = (goalId: number, imageId: string) => {
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, images: (g.images || []).filter(img => img.id !== imageId) } : g));
  };

  const moveGoalImage = (goalId: number, imageId: string, direction: 'up' | 'down') => {
    setGoals(prev => prev.map(g => {
      if (g.id !== goalId) return g;
      const imgs = [...(g.images || [])];
      const idx = imgs.findIndex(img => img.id === imageId);
      if (idx === -1) return g;
      if (direction === 'up' && idx === 0) return g;
      if (direction === 'down' && idx === imgs.length - 1) return g;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [imgs[idx], imgs[swapIdx]] = [imgs[swapIdx], imgs[idx]];
      return { ...g, images: imgs };
    }));
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

  const isGoalCompleted = (g: Goal) => Math.round((g.progress / g.target) * 100) >= 100;

  const filteredGoals = useMemo(() => {
    const term = search.toLowerCase().trim();
    return goals.filter(g => {
      const matchesSearch = !term || g.title.toLowerCase().includes(term) || g.description.toLowerCase().includes(term);
      const matchesCategory = categoryFilter === 'all' || g.category === categoryFilter;
      const matchesTimeframe = timeframeFilter === 'all' || g.timeframe === timeframeFilter;
      const matchesProject = projectFilterId === 'all' || g.projectId === projectFilterId;
      const matchesTags = selectedGoalTagIds.length === 0 || selectedGoalTagIds.every(id => g.tags?.some(t => t.id === id));
      const matchesPin = pinFilter === 'all' || (pinFilter === 'pinned' ? g.pinned : !g.pinned);
      return matchesSearch && matchesCategory && matchesTimeframe && matchesProject && matchesTags && matchesPin;
    });
  }, [goals, search, categoryFilter, timeframeFilter, projectFilterId, selectedGoalTagIds, pinFilter]);

  const sortedGoals = useMemo(() => {
    const active = filteredGoals.filter(g => !isGoalCompleted(g));
    const completed = filteredGoals.filter(g => isGoalCompleted(g));

    const sortGoals = (a: Goal, b: Goal) => {
      if (sortByTarget) {
        const aPct = a.target > 0 ? a.progress / a.target : 0;
        const bPct = b.target > 0 ? b.progress / b.target : 0;
        const diff = aPct - bPct;
        return sortTargetDesc ? -diff : diff;
      }
      return a.id - b.id;
    };

    return {
      active: active.sort(sortGoals),
      completed: completed.sort((a, b) => b.id - a.id),
    };
  }, [filteredGoals, sortByTarget, sortTargetDesc]);

  const myGoalsGroup = useMemo(() => sortedGoals.active.filter(g => !g.projectId), [sortedGoals.active]);
  const projectGoalGroups = useMemo(() => {
    return projects.map(project => {
      const goalItems = sortedGoals.active.filter(g => g.projectId === project.id);
      if (goalItems.length === 0) return null;
      return { project, goals: goalItems };
    }).filter(Boolean) as Array<{ project: Project; goals: Goal[] }>;
  }, [sortedGoals.active, projects]);

  const matchingCount = filteredGoals.length;

  const renderGoalRow = (goal: Goal) => {
    const pct = goal.target > 0 ? Math.round((goal.progress / goal.target) * 100) : 0;
    return (
      <div
        key={goal.id}
        className="group border rounded-xl bg-card transition-all duration-200 cursor-pointer border-border hover:border-border/80 hover:shadow-sm animate-fade-in"
        onClick={() => openEditGoal(goal)}
      >
        <div className="flex items-center gap-1 px-3 py-3">
          <button
            onClick={e => { e.stopPropagation(); togglePin(goal.id); }}
            className={`p-1.5 rounded-md flex-shrink-0 transition-all ${goal.pinned ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
            title={goal.pinned ? 'Unpin goal' : 'Pin goal'}
          >
            <Pin className={`w-3.5 h-3.5 ${goal.pinned ? 'fill-current' : ''}`} />
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-left text-foreground truncate">{goal.title}</span>
            {goal.tags?.length > 0 && <Tag className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
            {goal.tags?.map(tag => (
              <span key={tag.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-white" style={{ backgroundColor: tag.color }}>
                {tag.name}
              </span>
            ))}
            <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase flex-shrink-0">{TIMEFRAME_LABELS[goal.timeframe] || goal.timeframe}</span>
            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full flex-shrink-0">{goal.category}</span>
            {goal.projectId && (() => {
              const p = projects.find(pr => pr.id === goal.projectId);
              if (!p) return null;
              return (
                <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground flex-shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                  {p.name}
                </span>
              );
            })()}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-24 hidden sm:block">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: goal.color }} />
              </div>
              <p className="text-[8px] text-muted-foreground mt-0.5 text-right">{goal.progress}/{goal.target} {goal.unit}</p>
            </div>
            <span className="text-sm font-bold text-foreground min-w-[40px] text-right">{pct}%</span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={e => { e.stopPropagation(); updateProgress(goal.id, -1); }}
                className="w-6 h-6 rounded-md bg-muted hover:bg-muted/80 text-foreground text-xs font-bold flex items-center justify-center transition-colors"
              >−</button>
              <button
                onClick={e => { e.stopPropagation(); updateProgress(goal.id, 1); }}
                className="w-6 h-6 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold flex items-center justify-center transition-colors"
              >+</button>
            </div>
            <button
              onClick={e => { e.stopPropagation(); deleteGoal(goal.id); }}
              className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
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

          {goalTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 min-w-0">
              <Tag className="w-3.5 h-3.5 text-muted-foreground self-center" />
              {goalTags.map(tag => {
                const active = selectedGoalTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleGoalTagFilter(tag.id)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition-all ${
                      active
                        ? 'border-foreground/20 text-foreground shadow-sm'
                        : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </button>
                );
              })}
              {selectedGoalTagIds.length > 0 && (
                <button
                  onClick={() => setSelectedGoalTagIds([])}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50"
                >
                  Clear
                </button>
              )}
            </div>
          )}

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
                  : `Project: ${projects.find(p => p.id === projectFilterId)?.name || 'Selected'}`}
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
            >
              Sort by Progress
            </button>
            <button
              onClick={() => setPinFilter(prev => prev === 'all' ? 'pinned' : prev === 'pinned' ? 'unpinned' : 'all')}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border transition-all ${
                pinFilter !== 'all'
                  ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
                  : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Pin className={`w-3.5 h-3.5 ${pinFilter === 'pinned' ? 'fill-current' : ''}`} />
              <span>{pinFilter === 'all' ? 'Pinned' : pinFilter === 'pinned' ? 'Pinned' : 'Unpinned'}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 relative">
        <div className="max-w-5xl mx-auto space-y-2 pb-24">
          {loading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground mt-3">Loading goals...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-sm text-destructive">{error}</p>
              <button onClick={fetchGoals} className="mt-2 text-sm text-primary hover:underline">Try again</button>
            </div>
          ) : myGoalsGroup.length === 0 && projectGoalGroups.length === 0 && sortedGoals.completed.length === 0 ? (
            <div className="text-center py-16">
              <Target className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No goals found</p>
            </div>
          ) : (
            <>
              {/* My Goals section */}
              {myGoalsGroup.length > 0 && (
                <div className="mb-3">
                  <button
                    onClick={() => setMyGoalsCollapsed(prev => !prev)}
                    className="flex items-center gap-2 w-full px-2 py-2 text-left hover:bg-muted/30 rounded-lg transition-all mb-1"
                  >
                    {myGoalsCollapsed
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">My Goals</span>
                    <span className="text-[10px] text-muted-foreground/50 ml-1">({myGoalsGroup.length})</span>
                  </button>
                  {!myGoalsCollapsed && (
                    <div className="space-y-1.5">
                      {myGoalsGroup.map(goal => renderGoalRow(goal))}
                    </div>
                  )}
                </div>
              )}

              {/* Project sections */}
              {projectGoalGroups.map(({ project, goals: projectGoals }) => {
                const isCollapsed = collapsedProjects.includes(project.id);
                return (
                  <div key={project.id} className="mb-3">
                    <button
                      onClick={() => setCollapsedProjects(prev =>
                        prev.includes(project.id) ? prev.filter(id => id !== project.id) : [...prev, project.id]
                      )}
                      className="flex items-center gap-2 w-full px-2 py-2 text-left hover:bg-muted/30 rounded-lg transition-all mb-1"
                    >
                      {isCollapsed
                        ? <ChevronDown className="w-3.5 h-3.5" style={{ color: project.color }} />
                        : <ChevronUp className="w-3.5 h-3.5" style={{ color: project.color }} />}
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">{project.name}</span>
                      <span className="text-[10px] text-muted-foreground/50 ml-1">({projectGoals.length})</span>
                    </button>
                    {!isCollapsed && (
                      <div className="pl-4 space-y-1.5">
                        {projectGoals.map(goal => renderGoalRow(goal))}
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
                      onClick={() => setShowCompleted(prev => !prev)}
                      className="w-full flex items-center justify-between px-4 py-3"
                    >
                      <span className="text-sm font-semibold text-label-green flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-label-green/20 flex items-center justify-center">
                          <svg className="w-3 h-3 text-label-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        Completed Goals ({sortedGoals.completed.length})
                      </span>
                      {showCompleted ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </button>
                    {showCompleted && (
                      <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                        {sortedGoals.completed.map(goal => (
                          <div
                            key={goal.id}
                            className="group flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all border-label-green/15 bg-background/70 hover:bg-muted/40"
                            onClick={() => openEditGoal(goal)}
                          >
                            <div className="w-5 h-5 rounded-full bg-label-green/20 flex items-center justify-center flex-shrink-0">
                              <svg className="w-3 h-3 text-label-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                            <div className="flex-1 min-w-0 flex items-center gap-1.5">
                              <span className="text-sm font-medium text-foreground line-through truncate">{goal.title}</span>
                              {goal.tags?.length > 0 && <Tag className="w-3 h-3 text-muted-foreground flex-shrink-0 opacity-70" />}
                              {goal.tags?.map(tag => (
                                <span key={tag.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-white opacity-70" style={{ backgroundColor: tag.color }}>
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                            <span className="text-xs text-muted-foreground flex-shrink-0">{goal.progress}/{goal.target} {goal.unit}</span>
                            <button
                              onClick={e => { e.stopPropagation(); deleteGoal(goal.id); }}
                              className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Goal Form Modal */}
      {adding && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={() => setAdding(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Target className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Set a New Milestone</h3>
                  <p className="text-xs text-muted-foreground">Define what you want to achieve and track your progress.</p>
                </div>
              </div>
              <button onClick={() => setAdding(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Goal Title</label>
                    <input
                      autoFocus
                      value={newGoal.title}
                      onChange={e => setNewGoal(g => ({ ...g, title: e.target.value }))}
                      placeholder="e.g. Master React, Read 10 Books..."
                      className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                      onKeyDown={e => { if (e.key === 'Enter') addGoal(); if (e.key === 'Escape') setAdding(false); }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Context / Description</label>
                    <textarea
                      value={newGoal.description}
                      onChange={e => setNewGoal(g => ({ ...g, description: e.target.value }))}
                      placeholder="Why is this goal important?"
                      className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Category</label>
                    <Select value={newGoal.category} onValueChange={(value) => setNewGoal(g => ({ ...g, category: value }))}>
                      <SelectTrigger className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer h-9">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {GOAL_CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Project</label>
                    <Select value={newGoal.projectId || 'none'} onValueChange={(value) => setNewGoal(g => ({ ...g, projectId: value === 'none' ? '' : value }))}>
                      <SelectTrigger className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground h-9">
                        <SelectValue placeholder="My Goals" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">My Goals</SelectItem>
                        {projects.map(p => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">How many?</label>
                      <input
                        type="number"
                        value={newGoal.target}
                        onChange={e => setNewGoal(g => ({ ...g, target: parseInt(e.target.value) || 1 }))}
                        className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Unit</label>
                      <input
                        value={newGoal.unit}
                        onChange={e => setNewGoal(g => ({ ...g, unit: e.target.value }))}
                        placeholder="tasks, hours, pages..."
                        className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Deadline</label>
                      <Select value={newGoal.timeframe} onValueChange={(value) => setNewGoal(g => ({ ...g, timeframe: value }))}>
                        <SelectTrigger className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all h-9">
                          <SelectValue placeholder="Select timeframe" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(TIMEFRAME_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Sub-goals</label>
                    <div className="space-y-1">
                      {newGoal.subGoals.map((sg, i) => (
                        <div key={sg.id} className="flex items-center gap-2 text-xs bg-muted/30 border border-border rounded-lg px-3 py-1.5">
                          <input type="checkbox" checked={sg.completed} onChange={() => {
                            const next = [...newGoal.subGoals];
                            next[i] = { ...sg, completed: !sg.completed };
                            setNewGoal(g => ({ ...g, subGoals: next }));
                          }} className="rounded" />
                          <span className="flex-1 text-foreground">{sg.title}</span>
                          <button onClick={() => setNewGoal(g => ({ ...g, subGoals: g.subGoals.filter((_, idx) => idx !== i) }))} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <input
                          value={newSubGoalTitle}
                          onChange={e => setNewSubGoalTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newSubGoalTitle.trim()) { setNewGoal(g => ({ ...g, subGoals: [...g.subGoals, { id: crypto.randomUUID(), title: newSubGoalTitle.trim(), completed: false }] })); setNewSubGoalTitle(''); } } }}
                          placeholder="Add a sub-goal..."
                          className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                        <button onClick={() => { if (newSubGoalTitle.trim()) { setNewGoal(g => ({ ...g, subGoals: [...g.subGoals, { id: crypto.randomUUID(), title: newSubGoalTitle.trim(), completed: false }] })); setNewSubGoalTitle(''); } }} className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all text-xs font-bold">Add</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <button
                  onClick={() => setAdding(false)}
                  className="px-5 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all"
                >
                  Discard
                </button>
                <button
                  onClick={addGoal}
                  disabled={!newGoal.title.trim()}
                  className="px-8 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 active:scale-95"
                >
                  Create Goal
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Goal Modal */}
      {editingGoal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={() => setEditingGoal(null)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Edit Goal</h2>
              <button onClick={() => setEditingGoal(null)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Goal Title</label>
                    <input autoFocus value={editGoal.title} onChange={e => setEditGoal(g => ({ ...g, title: e.target.value }))}
                      placeholder="e.g. Master React, Read 10 Books..."
                      className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 font-medium"
                      onKeyDown={e => { if (e.key === 'Enter') updateGoal(); if (e.key === 'Escape') setEditingGoal(null); }} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Context / Description</label>
                    <textarea value={editGoal.description} onChange={e => setEditGoal(g => ({ ...g, description: e.target.value }))}
                      placeholder="Why is this goal important?"
                      className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none" rows={2} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Category</label>
                    <Select value={editGoal.category} onValueChange={(value) => setEditGoal(g => ({ ...g, category: value }))}>
                      <SelectTrigger className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground h-9">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {GOAL_CATEGORIES.map(cat => (<SelectItem key={cat} value={cat}>{cat}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Project</label>
                    <Select value={editGoal.projectId || 'none'} onValueChange={(value) => setEditGoal(g => ({ ...g, projectId: value === 'none' ? '' : value }))}>
                      <SelectTrigger className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground h-9">
                        <SelectValue placeholder="My Tasks" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">My Tasks</SelectItem>
                        {projects.map(p => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">How many?</label>
                      <input type="number" value={editGoal.target} onChange={e => setEditGoal(g => ({ ...g, target: parseInt(e.target.value) || 1 }))}
                        className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Unit</label>
                      <input value={editGoal.unit} onChange={e => setEditGoal(g => ({ ...g, unit: e.target.value }))}
                        placeholder="tasks, hours, pages..."
                        className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Deadline</label>
                      <Select value={editGoal.timeframe} onValueChange={(value) => setEditGoal(g => ({ ...g, timeframe: value }))}>
                        <SelectTrigger className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground h-9">
                          <SelectValue placeholder="Select timeframe" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(TIMEFRAME_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Sub-goals</label>
                    <div className="space-y-1">
                      {editGoal.subGoals.map((sg, i) => (
                        <div key={sg.id} className="flex items-center gap-2 text-xs bg-muted/30 border border-border rounded-lg px-3 py-1.5">
                          <input type="checkbox" checked={sg.completed} onChange={() => {
                            toggleSubGoalComplete(editingGoal, sg.id);
                            const next = [...editGoal.subGoals]; next[i] = { ...sg, completed: !sg.completed };
                            setEditGoal(g => ({ ...g, subGoals: next }));
                          }} className="rounded" />
                          <span className="flex-1 text-foreground">{sg.title}</span>
                          <button onClick={() => setEditGoal(g => ({ ...g, subGoals: g.subGoals.filter((_, idx) => idx !== i) }))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <input value={editSubGoalTitle} onChange={e => setEditSubGoalTitle(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (editSubGoalTitle.trim()) { setEditGoal(g => ({ ...g, subGoals: [...g.subGoals, { id: crypto.randomUUID(), title: editSubGoalTitle.trim(), completed: false }] })); setEditSubGoalTitle(''); } } }}
                          placeholder="Add a sub-goal..."
                          className="flex-1 bg-muted/30 border border-border rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
                        <button onClick={() => { if (editSubGoalTitle.trim()) { setEditGoal(g => ({ ...g, subGoals: [...g.subGoals, { id: crypto.randomUUID(), title: editSubGoalTitle.trim(), completed: false }] })); setEditSubGoalTitle(''); } }} className="px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 text-xs font-bold">Add</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tags Section */}
              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-semibold text-foreground">Tags</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {editingGoal.tags.map(tag => (
                    <span key={tag.id} className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full text-white" style={{ backgroundColor: tag.color }}>
                      {tag.name}
                      <button onClick={() => toggleTagOnGoal(editingGoal.id, tag.id)} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
                <button onClick={() => setTagPopupGoalId(editingGoal.id)} className="text-xs text-primary hover:underline">+ Add tag</button>
              </div>

              {/* Activity Section */}
              <div className="rounded-2xl border border-border bg-muted/20">
                <button
                  onClick={() => setActivityCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Activity</h3>
                  </div>
                  {activityCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                {!activityCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-2 max-h-56 overflow-y-auto">
                    {activityLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No activity yet</p>
                    ) : activityLogs.map(log => (
                      <div key={log.id} className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                        <p className="text-sm text-foreground capitalize">{log.action}{log.details ? ` — ${log.details}` : ''}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">{new Date(log.createdAt).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Images Section */}
              <div className="space-y-2">
                <button
                  onClick={() => setImagesCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-1 py-1.5 rounded-lg hover:bg-muted/30 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Images</h3>
                    {editingGoal.images && editingGoal.images.length > 0 && (
                      <span className="text-xs text-muted-foreground">({editingGoal.images.length})</span>
                    )}
                  </div>
                  {imagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                {!imagesCollapsed && (
                  <div className="space-y-3">
                    <label className="flex flex-col items-center justify-center w-full min-h-[80px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                      <div className="flex flex-col items-center justify-center py-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-1.5">
                          <Paperclip className="w-4 h-4 text-primary" />
                        </div>
                        <p className="text-xs font-medium text-foreground">Click to upload images</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG, GIF (max 10MB)</p>
                      </div>
                      <input type="file" multiple accept="image/*" onChange={e => { uploadGoalImages(editingGoal.id, e.target.files); e.target.value = ''; }} disabled={uploading} className="hidden" />
                    </label>
                    {uploading && (
                      <div className="flex items-center justify-center gap-2 py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-xs text-muted-foreground">Uploading...</span>
                      </div>
                    )}
                    {editingGoal.images && editingGoal.images.length > 0 && (
                      <div className="space-y-2">
                        {editingGoal.images.map((img, idx) => (
                          <div key={img.id} className="relative group/img flex items-center gap-2 p-2 rounded-xl border border-border bg-muted/30">
                            <div className="flex flex-col gap-0.5 flex-shrink-0">
                              <button onClick={() => moveGoalImage(editingGoal.id, img.id, 'up')} disabled={idx === 0} className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"><ChevronUp className="w-3 h-3" /></button>
                              <button onClick={() => moveGoalImage(editingGoal.id, img.id, 'down')} disabled={idx === editingGoal.images!.length - 1} className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"><ChevronDown className="w-3 h-3" /></button>
                            </div>
                            {img.fileUrl.match(/^data:image/) ? (
                              <img src={img.fileUrl} alt={img.fileName} className="w-12 h-12 rounded-lg object-cover border border-border flex-shrink-0" />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-background border border-border flex items-center justify-center flex-shrink-0"><Paperclip className="w-5 h-5 text-muted-foreground" /></div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-foreground truncate">{img.fileName}</p>
                              <p className="text-[10px] text-muted-foreground">{(img.fileSize / 1024).toFixed(1)} KB</p>
                            </div>
                            <button onClick={() => deleteGoalImage(editingGoal.id, img.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/img:opacity-100 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-between">
              <button onClick={() => { if (editingGoal) { deleteGoal(editingGoal.id); setEditingGoal(null); } }}
                className="px-4 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-all">Delete goal</button>
              <div className="flex gap-2">
                <button onClick={() => setEditingGoal(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                <button onClick={updateGoal} disabled={!editGoal.title.trim()}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tag Popup */}
      {tagPopupGoalId && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setTagPopupGoalId(null)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Tags</h3>
              <button onClick={() => setTagPopupGoalId(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-60 space-y-2 overflow-y-auto mb-4">
              {goalTags.map(tag => {
                const goal = goals.find(g => g.id === tagPopupGoalId);
                const active = goal?.tags.some(t => t.id === tag.id);
                return (
                  <div key={tag.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                    <button onClick={() => toggleTagOnGoal(tagPopupGoalId!, tag.id)} className="flex flex-1 items-center gap-2 text-left">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                      <span className="text-sm text-foreground">{tag.name}</span>
                      {active && <span className="ml-auto text-[10px] font-semibold text-primary">Selected</span>}
                    </button>
                    <button onClick={() => deleteGoalTag(tag.id)} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border pt-4">
              <div className="flex gap-2">
                <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Create tag"
                  className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                <button onClick={() => setNewTagColor(TAG_COLORS[(TAG_COLORS.indexOf(newTagColor) + 1) % TAG_COLORS.length])} className="w-10 rounded-xl border border-border" style={{ backgroundColor: newTagColor }} />
                <button onClick={() => addTagToGoal(tagPopupGoalId!)} disabled={!newTagName.trim()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Add</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Goals;
