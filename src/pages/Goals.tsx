import React, { useState, useEffect } from 'react';
import { Target, Plus, Trash2, TrendingUp } from 'lucide-react';
import { CircleToggle } from '@/components/ToggleComponents';

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

const Goals: React.FC = () => {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [adding, setAdding] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: '', description: '', target: 10, unit: 'tasks', timeframe: '1month', category: 'Personal', subGoals: [] as SubGoal[] });
  const [newSubGoalTitle, setNewSubGoalTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  // Fetch goals on mount
  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/goals', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch goals');
      const data = await res.json();
      setGoals(data.map((g: any) => ({
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
      })));
    } catch (err) {
      setError('Failed to load goals');
      console.error('Error fetching goals:', err);
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
          title: newGoal.title,
          description: newGoal.description,
          target: newGoal.target,
          unit: newGoal.unit,
          color: GOAL_COLORS[goals.length % GOAL_COLORS.length],
          category: newGoal.category,
          timeframe: newGoal.timeframe,
          subGoals: JSON.stringify(newGoal.subGoals),
        }),
      });
      
      if (!res.ok) throw new Error('Failed to create goal');
      
      const created = await res.json();
      const goal: Goal = {
        id: created.id,
        title: created.title,
        description: created.description || '',
        progress: created.progress || 0,
        target: created.target || 100,
        unit: created.unit || 'tasks',
        color: created.color || GOAL_COLORS[0],
        category: created.category || 'Personal',
        timeframe: created.timeframe || '1month',
        subGoals: created.subGoals ? (typeof created.subGoals === 'string' ? JSON.parse(created.subGoals) : created.subGoals) : [],
      };
      
      setGoals(prev => [...prev, goal]);
      setNewGoal({ title: '', description: '', target: 10, unit: 'tasks', timeframe: '1month', category: 'Personal', subGoals: [] });
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
    
    // Optimistic update
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
      // Revert on error
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

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="px-6 py-3 border-b border-border flex items-center justify-between">
        <h1 className="text-base font-bold text-foreground">Goals</h1>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all duration-200 hover:scale-105"
        >
          <Plus className="w-4 h-4" />
          New Goal
        </button>
      </header>

      <div className="p-6 max-w-4xl mx-auto">
        {/* Add Goal Form */}
        {adding && (
          <div className="mb-8 bg-card border-2 border-primary/20 rounded-2xl p-6 shadow-2xl animate-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Target className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Set a New Milestone</h3>
                <p className="text-xs text-muted-foreground">Define what you want to achieve and track your progress.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
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
                  <select
                    value={newGoal.category}
                    onChange={e => setNewGoal(g => ({ ...g, category: e.target.value }))}
                    className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                  >
                    {GOAL_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
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
                    <select
                      value={newGoal.timeframe}
                      onChange={e => setNewGoal(g => ({ ...g, timeframe: e.target.value }))}
                      className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    >
                      {Object.entries(TIMEFRAME_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
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
        )}

        {/* Goals List - Active */}
        {loading ? (
        <div className="text-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">Loading goals...</p>
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-sm text-destructive">{error}</p>
          <button 
            onClick={fetchGoals}
            className="mt-2 text-sm text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      ) : goals.length === 0 && !adding ? (
          <div className="text-center py-16 animate-fade-in">
            <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-2">No goals yet</p>
            <p className="text-xs text-muted-foreground">Set goals to track your progress and stay motivated.</p>
          </div>
        ) : (
          <>
          {/* Active Goals */}
          <div className="space-y-4 mb-8">
            {goals.filter(g => Math.round((g.progress / g.target) * 100) < 100).map((goal, i) => {
              const pct = goal.target > 0 ? Math.round((goal.progress / goal.target) * 100) : 0;
              return (
                <div
                  key={goal.id}
                  className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-all duration-200 animate-fade-in group"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-foreground">{goal.title}</h3>
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase">{TIMEFRAME_LABELS[goal.timeframe] || goal.timeframe}</span>
                        <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{goal.category}</span>
                      </div>
                      {goal.description && <p className="text-xs text-muted-foreground mt-0.5">{goal.description}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold text-foreground">{pct}%</span>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${pct}%`, backgroundColor: goal.color }}
                    />
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-muted-foreground">Progress: {goal.progress} of {goal.target} {goal.unit}</span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => updateProgress(goal.id, -1)}
                        className="w-7 h-7 rounded-lg bg-muted hover:bg-muted/80 text-foreground text-sm font-bold flex items-center justify-center transition-colors"
                      >
                        −
                      </button>
                      <button
                        onClick={() => updateProgress(goal.id, 1)}
                        className="w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-sm font-bold flex items-center justify-center transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  {goal.subGoals && goal.subGoals.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-border">
                      {goal.subGoals.map(sg => (
                        <div key={sg.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <CircleToggle
                            completed={sg.completed}
                            onClick={e => {
                              e.stopPropagation();
                            }}
                            size="sm"
                          />
                          <span className={sg.completed ? 'line-through opacity-60' : ''}>{sg.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Completed Goals Section */}
          {goals.filter(g => Math.round((g.progress / g.target) * 100) >= 100).length > 0 && (
            <div>
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-2 mb-4 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-label-green/20 flex items-center justify-center">
                  <svg className="w-3 h-3 text-label-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                Completed Goals ({goals.filter(g => Math.round((g.progress / g.target) * 100) >= 100).length})
                <span className="text-xs">{showCompleted ? '▼' : '▶'}</span>
              </button>
              {showCompleted && (
                <div className="space-y-3">
                  {goals.filter(g => Math.round((g.progress / g.target) * 100) >= 100).map(goal => (
                    <div
                      key={goal.id}
                      className="bg-card/50 border border-label-green/20 rounded-xl p-4 flex items-center justify-between opacity-80 animate-fade-in"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-label-green/20 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-label-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-foreground line-through">{goal.title}</h3>
                          <p className="text-xs text-muted-foreground">{goal.progress} / {goal.target} {goal.unit} • {goal.category}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => deleteGoal(goal.id)}
                        className="p-1 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
};

export default Goals;
