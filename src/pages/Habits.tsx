import React, { useState, useEffect, useMemo } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Flame, Plus, Search, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CircleToggle } from '@/components/ToggleComponents';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Habit {
  id: number;
  title: string;
  streak: number;
  completedDays: string[];
  color: string;
  category: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Health': 'text-label-green bg-label-green/10',
  'Personal': 'text-label-blue bg-label-blue/10',
  'Work': 'text-label-orange bg-label-orange/10',
  'Learning': 'text-label-purple bg-label-purple/10',
};

const CATEGORY_OPTIONS = ['Health', 'Personal', 'Work', 'Learning'];

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
  const [habits, setHabits] = useState<Habit[]>([]);
  const [adding, setAdding] = useState(false);
  const [newHabit, setNewHabit] = useState({ title: '', category: 'Personal' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<number[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<number | null>(null);
  const [completedOpen, setCompletedOpen] = useState(true);

  const getTodayUTC = () => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  };
  const today = getTodayUTC();

  useEffect(() => { fetchHabits(); }, []);

  const fetchHabits = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/habits', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch habits');
      const data = await res.json();
      setHabits(data.map((h: any) => ({
        id: h.id,
        title: h.title,
        streak: h.streak || 0,
        completedDays: h.completedDays || [],
        color: h.color || 'primary',
        category: h.category || 'Personal',
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
        body: JSON.stringify({ title: newHabit.title, category: newHabit.category, color: 'primary' }),
      });
      if (!res.ok) throw new Error('Failed to create habit');
      const created = await res.json();
      setHabits(prev => [...prev, {
        id: created.id,
        title: created.title,
        streak: 0,
        completedDays: [],
        category: created.category || 'Personal',
        color: created.color || 'primary',
      }]);
      setNewHabit({ title: '', category: 'Personal' });
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

  const filteredHabits = useMemo(() => {
    const term = search.toLowerCase().trim();
    return habits.filter(habit => {
      const matchesSearch = !term || habit.title.toLowerCase().includes(term);
      const matchesCategory = categoryFilter === 'all' || habit.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [habits, search, categoryFilter]);

  const completedToday = useMemo(() => filteredHabits.filter(h => h.completedDays.includes(today)), [filteredHabits, today]);
  const notCompletedToday = useMemo(() => filteredHabits.filter(h => !h.completedDays.includes(today)), [filteredHabits, today]);

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
          }
        }}
      >
        <div className="flex items-center gap-1 px-3 py-3">
          {isDeleteMode ? (
            <input
              type="checkbox"
              checked={selectedDeleteIds.includes(habit.id)}
              onChange={() => {}}
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

          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className={cn('text-sm font-medium text-left truncate', isCompleted ? 'line-through text-muted-foreground' : 'text-foreground')}>
              {habit.title}
            </span>
            <span className={cn('text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0', CATEGORY_COLORS[habit.category])}>
              {habit.category}
            </span>
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

          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Flame className="w-3.5 h-3.5 text-orange-500" />
              <span>{habits.filter(h => h.streak > 0).length} active streaks</span>
            </div>
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
          ) : filteredHabits.length === 0 && !adding ? (
            <div className="text-center py-16">
              <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No habits found</p>
            </div>
          ) : (
            <>
              {notCompletedToday.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 px-2 py-2 mb-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">To Complete Today</span>
                    <span className="text-[10px] text-muted-foreground/50">({notCompletedToday.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {notCompletedToday.map(habit => renderHabitRow(habit))}
                  </div>
                </div>
              )}

              {completedToday.length > 0 && (
                <div className="mt-6 pt-4 border-t border-border/80">
                  <div className="border border-label-green/20 rounded-xl bg-label-green/5">
                    <button
                      onClick={() => setCompletedOpen(prev => !prev)}
                      className="w-full flex items-center justify-between px-4 py-3"
                    >
                      <span className="text-sm font-semibold text-label-green flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Completed Today ({completedToday.length})
                      </span>
                      {completedOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </button>
                    {completedOpen && (
                      <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                        {completedToday.map(habit => renderHabitRow(habit))}
                      </div>
                    )}
                  </div>
                </div>
              )}
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
    </div>
  );
};

export default Habits;
