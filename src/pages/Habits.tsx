import React, { useState, useEffect } from 'react';
import { Flame, Plus, Check, RotateCcw, TrendingUp, Calendar, Zap, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { CircleToggle } from '@/components/ToggleComponents';

interface Habit {
  id: number;
  title: string;
  streak: number;
  completedDays: string[]; // ISO dates
  color: string;
  category: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  'Health': 'text-label-green bg-label-green/10',
  'Personal': 'text-label-blue bg-label-blue/10',
  'Work': 'text-label-orange bg-label-orange/10',
  'Learning': 'text-label-purple bg-label-purple/10',
};

const Habits: React.FC = () => {
  const { user } = useAuth();
  const isPro = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  const [habits, setHabits] = useState<Habit[]>([]);
  const [adding, setAdding] = useState(false);
  const [newHabit, setNewHabit] = useState({ title: '', category: 'Personal' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Use UTC date for consistency with server
  const getTodayUTC = () => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  };
  const today = getTodayUTC();

  // Fetch habits on mount - habits are FREE for all users
  useEffect(() => {
    fetchHabits();
  }, []);

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
      console.error('Error fetching habits:', err);
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

    // Optimistic update - backend will calculate the correct streak
    setHabits(prev => prev.map(h =>
      h.id === id
        ? { ...h, completedDays: newCompletedDays }
        : h
    ));

    try {
      const res = await fetch(`/api/habits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ completedDays: newCompletedDays }),
      });
      if (!res.ok) throw new Error('Failed to update habit');
      
      // Refresh habits to get the correct streak from backend
      fetchHabits();
    } catch (err) {
      console.error('Error updating habit:', err);
      // Revert on error and refresh to get correct data
      setHabits(prev => prev.map(h =>
        h.id === id
          ? { ...h, completedDays: habit.completedDays }
          : h
      ));
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
          title: newHabit.title,
          category: newHabit.category,
          color: 'primary',
        }),
      });

      if (!res.ok) throw new Error('Failed to create habit');

      const created = await res.json();
      const habit: Habit = {
        id: created.id,
        title: created.title,
        streak: 0,
        completedDays: [],
        category: created.category || 'Personal',
        color: created.color || 'primary',
      };

      setHabits(prev => [...prev, habit]);
      setNewHabit({ title: '', category: 'Personal' });
      setAdding(false);
    } catch (err) {
      console.error('Error creating habit:', err);
      alert('Failed to save habit. Please try again.');
    }
  };

  const deleteHabit = async (id: number) => {
    try {
      const res = await fetch(`/api/habits/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete habit');
      setHabits(prev => prev.filter(h => h.id !== id));
    } catch (err) {
      console.error('Error deleting habit:', err);
      alert('Failed to delete habit. Please try again.');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background/50">
      <header className="px-8 py-4 border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Flame className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Habit Tracker</h1>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Add New Habit
          </button>
        </div>
      </header>

      <div className="p-8 max-w-5xl mx-auto space-y-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Active Streaks</p>
              <div className="flex items-center gap-2">
                 <span className="text-2xl font-black text-foreground">{habits.filter(h => h.streak > 0).length}</span>
                 <Flame className="w-5 h-5 text-orange-500 fill-current" />
              </div>
           </div>
           <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Completion Today</p>
              <div className="flex items-center gap-2">
                 <span className="text-2xl font-black text-foreground">
                    {Math.round((habits.filter(h => h.completedDays.includes(today)).length / (habits.length || 1)) * 100)}%
                 </span>
                 <Check className="w-5 h-5 text-label-green" />
              </div>
           </div>
           <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Total Consistent Hacks</p>
              <div className="flex items-center gap-2">
                 <span className="text-2xl font-black text-foreground">{habits.length}</span>
                 <Zap className="w-5 h-5 text-primary" />
              </div>
           </div>
        </div>

        {adding && (
          <div className="bg-card border-2 border-primary/20 rounded-2xl p-6 shadow-2xl animate-in slide-in-from-top-4">
             <h3 className="text-base font-bold mb-4">Create New Habit</h3>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input
                  autoFocus
                  placeholder="Drink 2L Water, Workout, Code..."
                  value={newHabit.title}
                  onChange={e => setNewHabit(prev => ({ ...prev, title: e.target.value }))}
                  className="bg-muted px-4 py-3 rounded-xl border border-border focus:ring-2 focus:ring-primary/20 outline-none font-medium"
                />
                <select
                  value={newHabit.category}
                  onChange={e => setNewHabit(prev => ({ ...prev, category: e.target.value }))}
                  className="bg-muted px-4 py-3 rounded-xl border border-border outline-none font-medium"
                >
                  {Object.keys(CATEGORY_COLORS).map(cat => (
                    <option key={cat}>{cat}</option>
                  ))}
                </select>
             </div>
             <div className="flex justify-end gap-3">
                <button onClick={() => setAdding(false)} className="px-4 py-2 text-sm font-bold text-muted-foreground">Cancel</button>
                <button 
                  onClick={addHabit}
                  className="px-6 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-bold"
                >Create Habit</button>
             </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {habits.map(habit => (
             <div key={habit.id} className="group bg-card border border-border rounded-2xl p-5 hover:border-primary/30 hover:shadow-xl transition-all duration-300">
                <div className="flex items-start justify-between mb-4">
                   <div className="flex items-center gap-3">
                      <CircleToggle
                        completed={habit.completedDays.includes(today)}
                        onClick={e => { e.stopPropagation(); toggleHabit(habit.id); }}
                        size="lg"
                        title={habit.completedDays.includes(today) ? 'Mark incomplete' : 'Mark complete'}
                        className={cn(
                          "w-14 h-14 !rounded-2xl transition-all",
                          habit.completedDays.includes(today) ? "scale-110 shadow-lg shadow-primary/20" : ""
                        )}
                      />
                      <div>
                         <h3 className="text-base font-bold text-foreground">{habit.title}</h3>
                         <span className={cn("text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full mt-1 inline-block", CATEGORY_COLORS[habit.category])}>
                            {habit.category}
                         </span>
                      </div>
                   </div>
                   <div className="text-right">
                      <div className="flex items-center gap-1">
                         <span className="text-lg font-black text-orange-500">{habit.streak}</span>
                         <Flame className={cn("w-4 h-4 fill-current", habit.streak > 0 ? "text-orange-500" : "text-muted-foreground")} />
                      </div>
                      <p className="text-[9px] font-bold text-muted-foreground uppercase">Day Streak</p>
                   </div>
                </div>

                <div className="flex gap-1.5 h-6">
                   {Array.from({ length: 7 }).map((_, i) => {
                      const d = new Date();
                      d.setUTCDate(d.getUTCDate() - (6 - i));
                      const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
                      const active = habit.completedDays.includes(dateStr);
                      return (
                        <div
                          key={i}
                          className={cn("flex-1 rounded-sm transition-all duration-500", active ? "bg-primary" : "bg-muted/50 border border-border")}
                          title={dateStr}
                        />
                      );
                   })}
                </div>
             </div>
           ))}
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground mt-3">Loading habits...</p>
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={fetchHabits}
              className="mt-2 text-sm text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        ) : habits.length === 0 && !adding ? (
          <div className="text-center py-20 bg-card/50 border border-dashed border-border rounded-3xl">
             <Plus className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
             <p className="text-sm font-bold text-muted-foreground">Begin Your First Habit Hack</p>
             <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">Track your daily progress and witness your consistency grow every single day.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Habits;
