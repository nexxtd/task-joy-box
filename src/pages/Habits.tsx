import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Flame, Plus, Search, Trash2, X, Tag, BarChart3, Pin, Image, Paperclip, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CircleToggle } from '@/components/ToggleComponents';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface HabitTag {
  id: number;
  name: string;
  color: string;
}

interface Habit {
  id: number;
  title: string;
  streak: number;
  completedDays: string[];
  color: string;
  category: string;
  projectId?: number | null;
  columnId?: number | null;
  tags: HabitTag[];
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

const CATEGORY_COLORS: Record<string, string> = {
  'Health': 'text-label-green bg-label-green/10',
  'Personal': 'text-label-blue bg-label-blue/10',
  'Work': 'text-label-orange bg-label-orange/10',
  'Learning': 'text-label-purple bg-label-purple/10',
};

const CATEGORY_OPTIONS = ['Health', 'Personal', 'Work', 'Learning'];
const TAG_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

const DeleteConfirmDialog: React.FC<{
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ count, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onCancel} />
    <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
          <Trash2 className="w-5 h-5 text-destructive" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Delete {count} habit{count === 1 ? '' : 's'}?</h3>
          <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all">Cancel</button>
        <button onClick={onConfirm} className="px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-all">Delete {count} habit{count === 1 ? '' : 's'}</button>
      </div>
    </div>
  </div>
);

const Habits: React.FC = () => {
  const toggleHabitTagFilter = (tagId: number) => {
    setSelectedHabitTagIds(prev =>
      prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]
    );
  };

  const togglePin = (id: number) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, pinned: !h.pinned } : h));
    fetch(`/api/habits/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ pinned: !habits.find(h => h.id === id)?.pinned }) }).catch(() => fetchHabits());
  };

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const uploadHabitImages = async (habitId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newImages: { id: string; fileName: string; fileUrl: string; fileSize: number; }[] = [];
    for (const file of Array.from(files)) {
      const url = await fileToDataUrl(file);
      newImages.push({ id: crypto.randomUUID(), fileName: file.name, fileUrl: url, fileSize: file.size });
    }
    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, images: [...(h.images || []), ...newImages] } : h));
    setUploading(false);
  };

  const deleteHabitImage = (habitId: number, imageId: string) => {
    setHabits(prev => prev.map(h => h.id === habitId ? { ...h, images: (h.images || []).filter(img => img.id !== imageId) } : h));
  };

  const moveHabitImage = (habitId: number, imageId: string, direction: 'up' | 'down') => {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h;
      const imgs = [...(h.images || [])];
      const idx = imgs.findIndex(img => img.id === imageId);
      if (idx === -1) return h;
      if (direction === 'up' && idx === 0) return h;
      if (direction === 'down' && idx === imgs.length - 1) return h;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [imgs[idx], imgs[swapIdx]] = [imgs[swapIdx], imgs[idx]];
      return { ...h, images: imgs };
    }));
  };

  const [habits, setHabits] = useState<Habit[]>([]);
  const [adding, setAdding] = useState(false);
  const [newHabit, setNewHabit] = useState({ title: '', category: 'Personal', projectId: '' as string, columnId: '' as string });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<number[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<number | null>(null);

  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [editHabit, setEditHabit] = useState({ title: '', category: 'Personal', projectId: '' as string, columnId: '' as string });
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [habitTags, setHabitTags] = useState<HabitTag[]>([]);
  const [tagPopupHabitId, setTagPopupHabitId] = useState<number | null>(null);
  const [selectedHabitTagIds, setSelectedHabitTagIds] = useState<number[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [myHabitsCollapsed, setMyHabitsCollapsed] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<number[]>([]);
  const [pinFilter, setPinFilter] = useState<'all' | 'pinned' | 'unpinned'>('all');
  const [imagesCollapsed, setImagesCollapsed] = useState(false);
  const [uploading, setUploading] = useState(false);

  const getTodayUTC = () => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  };
  const today = getTodayUTC();

  useEffect(() => { fetchHabits(); fetchProjects(); }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects', { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setProjects(data.projects || data); }
    } catch {}
  };

  const fetchHabits = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/habits', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch habits');
      const data = await res.json();
      const habitsList = data.habits || data;
      const tagsList = data.tags || [];
      setHabitTags(tagsList);
      setHabits(habitsList.map((h: any) => ({
        id: h.id,
        title: h.title,
        streak: h.streak || 0,
        completedDays: h.completedDays || [],
        color: h.color || 'primary',
        category: h.category || 'Personal',
        projectId: h.projectId,
        columnId: h.columnId,
        tags: h.tags || [],
        pinned: h.pinned || false,
        images: h.images || [],
      })));
    } catch (err) {
      setError('Failed to load habits');
    } finally {
      setLoading(false);
    }
  };

  const toggleHabit = async (id: number) => {
    const habit = habits.find(h => h.id === id);
    if (!habit) return;
    const isCompletedToday = habit.completedDays.includes(today);
    const newCompletedDays = isCompletedToday
      ? habit.completedDays.filter(d => d !== today)
      : [...habit.completedDays, today];

    setHabits(prev => prev.map(h => h.id === id ? { ...h, completedDays: newCompletedDays } : h));
    try {
      const res = await fetch(`/api/habits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ completedDays: newCompletedDays }),
      });
      if (!res.ok) throw new Error('Failed to update habit');
      fetchHabits();
    } catch {
      setHabits(prev => prev.map(h => h.id === id ? { ...h, completedDays: habit.completedDays } : h));
      fetchHabits();
    }
  };

  const addHabit = async () => {
    if (!newHabit.title.trim()) return;
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: newHabit.title, category: newHabit.category, color: 'primary',
          projectId: newHabit.projectId ? Number(newHabit.projectId) : null,
          columnId: newHabit.columnId ? Number(newHabit.columnId) : null,
        }),
      });
      if (!res.ok) throw new Error('Failed to create habit');
      const created = await res.json();
      setHabits(prev => [...prev, {
        id: created.id, title: created.title, streak: 0, completedDays: [],
        category: created.category || 'Personal', color: created.color || 'primary',
        projectId: created.projectId, columnId: created.columnId, tags: [],
        pinned: false, images: [],
      }]);
      setNewHabit({ title: '', category: 'Personal', projectId: '', columnId: '' });
      setAdding(false);
    } catch {
      alert('Failed to save habit. Please try again.');
    }
  };

  const deleteHabit = async (id: number) => {
    try {
      const res = await fetch(`/api/habits/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete habit');
      setHabits(prev => prev.filter(h => h.id !== id));
    } catch {
      alert('Failed to delete habit. Please try again.');
    }
  };

  const updateHabit = async () => {
    if (!editingHabit || !editHabit.title.trim()) return;
    const prev = editingHabit;
    setHabits(prev_ => prev_.map(h => h.id === editingHabit.id ? { ...h, title: editHabit.title, category: editHabit.category, projectId: editHabit.projectId ? Number(editHabit.projectId) : null, columnId: editHabit.columnId ? Number(editHabit.columnId) : null } : h));
    setEditingHabit(null);
    try {
      const res = await fetch(`/api/habits/${editingHabit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: editHabit.title, category: editHabit.category,
          projectId: editHabit.projectId ? Number(editHabit.projectId) : null,
          columnId: editHabit.columnId ? Number(editHabit.columnId) : null,
        }),
      });
      if (!res.ok) throw new Error('Failed to update habit');
      fetchHabits();
    } catch {
      setHabits(p => p.map(h => h.id === prev.id ? prev : h));
      fetchHabits();
    }
  };

  const openEditHabit = (habit: Habit) => {
    setEditingHabit(habit);
    setEditHabit({ title: habit.title, category: habit.category, projectId: habit.projectId ? String(habit.projectId) : '', columnId: habit.columnId ? String(habit.columnId) : '' });
    fetchActivity(habit.id);
  };

  // --- TAG FUNCTIONS ---
  const addTagToHabit = async (habitId: number) => {
    if (!newTagName.trim()) return;
    try {
      const res = await fetch(`/api/habits/${habitId}/tags`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: newTagName.trim(), color: newTagColor }),
      });
      if (res.ok) { setNewTagName(''); fetchHabits(); }
    } catch {}
  };

  const toggleTagOnHabit = async (habitId: number, tagId: number) => {
    try {
      await fetch(`/api/habits/${habitId}/tags/${tagId}/toggle`, { method: 'POST', credentials: 'include' });
      fetchHabits();
    } catch {}
  };

  const deleteHabitTag = async (tagId: number) => {
    try {
      await fetch(`/api/habits/tags/${tagId}`, { method: 'DELETE', credentials: 'include' });
      fetchHabits();
    } catch {}
  };

  const fetchActivity = async (habitId: number) => {
    try {
      const res = await fetch(`/api/habits/${habitId}/activity`, { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setActivityLogs(data); }
    } catch {}
  };

  const filteredHabits = useMemo(() => {
    const term = search.toLowerCase().trim();
    return habits.filter(habit => {
      const matchesSearch = !term || habit.title.toLowerCase().includes(term);
      const matchesCategory = categoryFilter === 'all' || habit.category === categoryFilter;
      const matchesTags = selectedHabitTagIds.length === 0 || selectedHabitTagIds.every(id => habit.tags?.some(t => t.id === id));
      const matchesPin = pinFilter === 'all' || (pinFilter === 'pinned' ? habit.pinned : !habit.pinned);
      return matchesSearch && matchesCategory && matchesTags && matchesPin;
    });
  }, [habits, search, categoryFilter, selectedHabitTagIds, pinFilter]);

  const myHabitsGroup = useMemo(() => filteredHabits.filter(h => !h.projectId), [filteredHabits]);
  const projectHabitGroups = useMemo(() => {
    return projects.map(project => {
      const habitItems = filteredHabits.filter(h => h.projectId === project.id);
      if (habitItems.length === 0) return null;
      return { project, habits: habitItems };
    }).filter(Boolean) as Array<{ project: Project; habits: Habit[] }>;
  }, [filteredHabits, projects]);

  const matchingCount = filteredHabits.length;

  const handleBulkDelete = () => {
    if (selectedDeleteIds.length === 0) return;
    setDeleteConfirmOpen(true);
  };

  const confirmBulkDelete = async () => {
    for (const id of selectedDeleteIds) await deleteHabit(id);
    setSelectedDeleteIds([]);
    setIsDeleteMode(false);
    setDeleteConfirmOpen(false);
  };

  const confirmSingleDelete = async () => {
    if (singleDeleteId !== null) await deleteHabit(singleDeleteId);
    setSingleDeleteId(null);
  };

  const renderHabitRow = (habit: Habit) => {
    const isCompleted = habit.completedDays.includes(today);
    return (
      <div
        key={habit.id}
        className={cn(
          'group border rounded-xl bg-card transition-all duration-200 cursor-pointer',
          isDeleteMode
            ? selectedDeleteIds.includes(habit.id)
              ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
              : 'border-border hover:bg-muted/20'
            : 'border-border hover:border-border/80 hover:shadow-sm'
        )}
        onClick={() => {
          if (isDeleteMode) {
            setSelectedDeleteIds(prev =>
              prev.includes(habit.id) ? prev.filter(id => id !== habit.id) : [...prev, habit.id]
            );
          } else {
            openEditHabit(habit);
          }
        }}
      >
        <div className="flex items-center gap-1 px-3 py-3">
          {isDeleteMode ? (
            <input
              type="checkbox"
              checked={selectedDeleteIds.includes(habit.id)}
              onChange={() => {
                setSelectedDeleteIds(prev =>
                  prev.includes(habit.id) ? prev.filter(id => id !== habit.id) : [...prev, habit.id]
                );
              }}
              onClick={e => e.stopPropagation()}
              className="w-4 h-4 rounded border-border accent-destructive flex-shrink-0 cursor-pointer"
            />
          ) : (
            <div onClick={e => { e.stopPropagation(); toggleHabit(habit.id); }}>
              <CircleToggle
                completed={isCompleted}
                onClick={e => { e.stopPropagation(); toggleHabit(habit.id); }}
                size="md"
                title={isCompleted ? 'Mark incomplete' : 'Mark complete'}
              />
            </div>
          )}

          {!isDeleteMode && (
            <button
              onClick={e => { e.stopPropagation(); togglePin(habit.id); }}
              className={`p-1.5 rounded-md flex-shrink-0 transition-all ${habit.pinned ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
              title={habit.pinned ? 'Unpin habit' : 'Pin habit'}
            >
              <Pin className={`w-3.5 h-3.5 ${habit.pinned ? 'fill-current' : ''}`} />
            </button>
          )}

          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className={cn('text-sm font-medium text-left truncate', isCompleted ? 'line-through text-muted-foreground' : 'text-foreground')}>
              {habit.title}
            </span>
            {habit.tags?.map(tag => (
              <span key={tag.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-white" style={{ backgroundColor: tag.color }}>
                {tag.name}
              </span>
            ))}
            <span className={cn('text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0', CATEGORY_COLORS[habit.category])}>
              {habit.category}
            </span>
            {habit.projectId && (() => {
              const p = projects.find(pr => pr.id === habit.projectId);
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
            <div className="hidden sm:flex gap-1 h-5">
              {Array.from({ length: 7 }).map((_, i) => {
                const d = new Date();
                d.setUTCDate(d.getUTCDate() - (6 - i));
                const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
                const active = habit.completedDays.includes(dateStr);
                return (
                  <div
                    key={i}
                    className={cn('w-4 h-5 rounded-sm transition-all duration-500', active ? 'bg-primary' : 'bg-muted/50 border border-border')}
                    title={dateStr}
                  />
                );
              })}
            </div>

            <div className="text-right min-w-[52px]">
              <div className="flex items-center gap-1 justify-end">
                <span className="text-sm font-black text-orange-500">{habit.streak}</span>
                <Flame className={cn('w-3.5 h-3.5 fill-current', habit.streak > 0 ? 'text-orange-500' : 'text-muted-foreground')} />
              </div>
              <p className="text-[8px] font-bold text-muted-foreground uppercase">Streak</p>
            </div>

            {!isDeleteMode && (
              <button
                onClick={e => { e.stopPropagation(); setSingleDeleteId(habit.id); }}
                className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                title="Delete habit"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-card/30">
        <div>
          <h1 className="text-lg font-bold text-foreground">Habit Tracker</h1>
          <p className="text-xs text-muted-foreground">{matchingCount} habits matching filters</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (isDeleteMode) { setIsDeleteMode(false); setSelectedDeleteIds([]); }
              else { setIsDeleteMode(true); setSelectedDeleteIds([]); }
            }}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border transition-all',
              isDeleteMode
                ? 'bg-destructive/15 border-destructive/30 text-destructive'
                : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Trash2 className="w-4 h-4" />
            {isDeleteMode ? 'Exit Delete' : 'Delete'}
          </button>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Habit
          </button>
        </div>
      </header>

      <div className="px-6 py-4 border-b border-border bg-card/10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search habits..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-muted/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border">
            {['all', ...CATEGORY_OPTIONS].map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-lg transition-all',
                  categoryFilter === cat
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>

          {habitTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 min-w-0">
              <Tag className="w-3.5 h-3.5 text-muted-foreground self-center" />
              {habitTags.map(tag => {
                const active = selectedHabitTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    onClick={() => toggleHabitTagFilter(tag.id)}
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
              {selectedHabitTagIds.length > 0 && (
                <button
                  onClick={() => setSelectedHabitTagIds([])}
                  className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/50"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Flame className="w-3.5 h-3.5 text-orange-500" />
              <span>{habits.filter(h => h.streak > 0).length} active streaks</span>
            </div>
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

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-2 pb-24">
          {loading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground mt-3">Loading habits...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-sm text-destructive">{error}</p>
              <button onClick={fetchHabits} className="mt-2 text-sm text-primary hover:underline">Try again</button>
            </div>
          ) : myHabitsGroup.length === 0 && projectHabitGroups.length === 0 && !adding ? (
            <div className="text-center py-16">
              <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No habits found</p>
            </div>
          ) : (
            <>
              {/* My Habits section */}
              {myHabitsGroup.length > 0 && (
                <div className="mb-3">
                  <button
                    onClick={() => setMyHabitsCollapsed(prev => !prev)}
                    className="flex items-center gap-2 w-full px-2 py-2 text-left hover:bg-muted/30 rounded-lg transition-all mb-1"
                  >
                    {myHabitsCollapsed
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">My Habits</span>
                    <span className="text-[10px] text-muted-foreground/50 ml-1">({myHabitsGroup.length})</span>
                  </button>
                  {!myHabitsCollapsed && (
                    <div className="space-y-1.5">
                      {myHabitsGroup.map(habit => renderHabitRow(habit))}
                    </div>
                  )}
                </div>
              )}

              {/* Project sections */}
              {projectHabitGroups.map(({ project, habits: projectHabits }) => {
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
                      <span className="text-[10px] text-muted-foreground/50 ml-1">({projectHabits.length})</span>
                    </button>
                    {!isCollapsed && (
                      <div className="pl-4 space-y-1.5">
                        {projectHabits.map(habit => renderHabitRow(habit))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={() => setAdding(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Create Habit</h2>
              <button onClick={() => setAdding(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Habit title</label>
                <input
                  autoFocus
                  placeholder="e.g. Drink 2L Water, Workout, Code..."
                  value={newHabit.title}
                  onChange={e => setNewHabit(prev => ({ ...prev, title: e.target.value }))}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Category</label>
                <Select value={newHabit.category} onValueChange={v => setNewHabit(prev => ({ ...prev, category: v }))}>
                  <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Project</label>
                <Select value={newHabit.projectId || 'none'} onValueChange={v => setNewHabit(prev => ({ ...prev, projectId: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                    <SelectValue placeholder="My Tasks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">My Tasks</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setAdding(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button
                onClick={addHabit}
                disabled={!newHabit.title.trim()}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editingHabit && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={() => setEditingHabit(null)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Edit Habit</h2>
              <button onClick={() => setEditingHabit(null)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Habit title</label>
                <input
                  autoFocus
                  placeholder="e.g. Drink 2L Water, Workout, Code..."
                  value={editHabit.title}
                  onChange={e => setEditHabit(prev => ({ ...prev, title: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') updateHabit(); if (e.key === 'Escape') setEditingHabit(null); }}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Category</label>
                  <Select value={editHabit.category} onValueChange={v => setEditHabit(prev => ({ ...prev, category: v }))}>
                    <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Project</label>
                  <Select value={editHabit.projectId || 'none'} onValueChange={v => setEditHabit(prev => ({ ...prev, projectId: v === 'none' ? '' : v }))}>
                    <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                      <SelectValue placeholder="My Tasks" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">My Tasks</SelectItem>
                      {projects.map(p => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tags Section */}
              <div className="rounded-2xl border border-border bg-muted/20">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Tags</h3>
                  </div>
                </div>
                <div className="border-t border-border/60 px-4 py-3">
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {editingHabit.tags.map(tag => (
                      <span key={tag.id} className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full text-white" style={{ backgroundColor: tag.color }}>
                        {tag.name}
                        <button onClick={() => toggleTagOnHabit(editingHabit.id, tag.id)} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                  <button onClick={() => setTagPopupHabitId(editingHabit.id)} className="text-xs text-primary hover:underline">+ Add tag</button>
                </div>
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
              <div className="rounded-2xl border border-border bg-muted/20">
                <button
                  onClick={() => setImagesCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Images</h3>
                    {editingHabit.images && editingHabit.images.length > 0 && (
                      <span className="text-xs text-muted-foreground">({editingHabit.images.length})</span>
                    )}
                  </div>
                  {imagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                {!imagesCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-3">
                    <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                      <div className="flex flex-col items-center justify-center py-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                          <Paperclip className="w-5 h-5 text-primary" />
                        </div>
                        <p className="text-sm font-medium text-foreground">Click to upload</p>
                        <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF (max 10MB)</p>
                      </div>
                      <input type="file" multiple accept="image/*" onChange={e => { uploadHabitImages(editingHabit.id, e.target.files); e.target.value = ''; }} disabled={uploading} className="hidden" />
                    </label>
                    {uploading && (
                      <div className="flex items-center justify-center gap-2 py-2">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                        <span className="text-xs text-muted-foreground">Uploading...</span>
                      </div>
                    )}
                    {editingHabit.images && editingHabit.images.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {editingHabit.images.map((img, idx) => (
                          <div key={img.id} className="relative group/img rounded-xl border border-border bg-muted/40 overflow-hidden">
                            {img.fileUrl.match(/^data:image/) ? (
                              <img src={img.fileUrl} alt={img.fileName} className="w-full h-32 object-cover" />
                            ) : (
                              <div className="w-full h-32 flex items-center justify-center"><Paperclip className="w-6 h-6 text-muted-foreground" /></div>
                            )}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
                              <p className="text-xs font-medium text-white truncate">{img.fileName}</p>
                              <p className="text-[10px] text-white/70">{(img.fileSize / 1024).toFixed(1)} KB</p>
                            </div>
                            <button onClick={() => deleteHabitImage(editingHabit.id, img.id)} className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/img:opacity-100 transition-all shadow-sm"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-between">
              <button
                onClick={() => { if (editingHabit) { setSingleDeleteId(editingHabit.id); setEditingHabit(null); } }}
                className="px-4 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-all"
              >
                Delete habit
              </button>
              <div className="flex gap-2">
                <button onClick={() => setEditingHabit(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                <button
                  onClick={updateHabit}
                  disabled={!editHabit.title.trim()}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isDeleteMode && (
        <div className="sticky bottom-0 left-0 right-0 z-30 p-4 bg-background/80 backdrop-blur-md border-t border-border flex justify-center animate-fade-in">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center text-destructive flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-foreground">
                {selectedDeleteIds.length === 0
                  ? 'Select habits to delete'
                  : `${selectedDeleteIds.length} habit${selectedDeleteIds.length === 1 ? '' : 's'} selected`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSelectedDeleteIds([]); setIsDeleteMode(false); }}
                className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-muted text-muted-foreground transition-all"
              >
                Cancel
              </button>
              <button
                disabled={selectedDeleteIds.length === 0}
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-destructive text-destructive-foreground rounded-lg disabled:opacity-40 hover:bg-destructive/95 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete selected — {selectedDeleteIds.length} habit{selectedDeleteIds.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <DeleteConfirmDialog count={selectedDeleteIds.length} onConfirm={confirmBulkDelete} onCancel={() => setDeleteConfirmOpen(false)} />
      )}

      {singleDeleteId !== null && (
        <DeleteConfirmDialog count={1} onConfirm={confirmSingleDelete} onCancel={() => setSingleDeleteId(null)} />
      )}

      {tagPopupHabitId && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setTagPopupHabitId(null)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Tags</h3>
              <button onClick={() => setTagPopupHabitId(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-60 space-y-2 overflow-y-auto mb-4">
              {habitTags.map(tag => {
                const habit = habits.find(h => h.id === tagPopupHabitId);
                const active = habit?.tags.some(t => t.id === tag.id);
                return (
                  <div key={tag.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                    <button onClick={() => toggleTagOnHabit(tagPopupHabitId!, tag.id)} className="flex flex-1 items-center gap-2 text-left">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                      <span className="text-sm text-foreground">{tag.name}</span>
                      {active && <span className="ml-auto text-[10px] font-semibold text-primary">Selected</span>}
                    </button>
                    <button onClick={() => deleteHabitTag(tag.id)} className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border pt-4">
              <div className="flex gap-2">
                <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Create tag"
                  className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                <button onClick={() => setNewTagColor(TAG_COLORS[(TAG_COLORS.indexOf(newTagColor) + 1) % TAG_COLORS.length])} className="w-10 rounded-xl border border-border" style={{ backgroundColor: newTagColor }} />
                <button onClick={() => addTagToHabit(tagPopupHabitId!)} disabled={!newTagName.trim()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Add</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Habits;
