import React, { useState, useEffect } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { Task, PRIORITY_CONFIG } from '@/types/board';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronRight, GripVertical, Clock, Target, Flame, AlertCircle } from 'lucide-react';

interface SidebarGoal {
  id: number;
  title: string;
  progress: number;
  target: number;
  unit: string;
  color: string;
  subGoals: { id: string; title: string; completed: boolean }[];
  completed: boolean;
}

interface SidebarHabit {
  id: number;
  title: string;
  streak: number;
  color: string;
  category: string;
  completedDays: string[];
}

interface CalendarSidebarProps {
  onTaskClick: (task: Task) => void;
}

const CalendarSidebar: React.FC<CalendarSidebarProps> = ({ onTaskClick }) => {
  const { board } = useBoardContext();
  const [goals, setGoals] = useState<SidebarGoal[]>([]);
  const [habits, setHabits] = useState<SidebarHabit[]>([]);
  const [goalsOpen, setGoalsOpen] = useState(true);
  const [habitsOpen, setHabitsOpen] = useState(true);
  const [tasksOpen, setTasksOpen] = useState(true);
  const [loading, setLoading] = useState({ goals: true, habits: true });

  useEffect(() => {
    fetchGoals();
    fetchHabits();
  }, []);

  const fetchGoals = async () => {
    try {
      setLoading(g => ({ ...g, goals: true }));
      const res = await fetch('/api/goals', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setGoals(data.map((g: any) => ({
          id: g.id,
          title: g.title,
          progress: g.progress || 0,
          target: g.target || 100,
          unit: g.unit || 'tasks',
          color: g.color || 'hsl(var(--primary))',
          subGoals: g.subGoals ? (typeof g.subGoals === 'string' ? JSON.parse(g.subGoals) : g.subGoals) : [],
          completed: g.completed || false,
        })));
      }
    } catch (err) {
      console.error('Error fetching goals:', err);
    } finally {
      setLoading(g => ({ ...g, goals: false }));
    }
  };

  const fetchHabits = async () => {
    try {
      setLoading(g => ({ ...g, habits: true }));
      const res = await fetch('/api/habits', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setHabits(data.map((h: any) => ({
          id: h.id,
          title: h.title,
          streak: h.streak || 0,
          color: h.color || 'primary',
          category: h.category || 'Personal',
          completedDays: h.completedDays || [],
        })));
      }
    } catch (err) {
      console.error('Error fetching habits:', err);
    } finally {
      setLoading(g => ({ ...g, habits: false }));
    }
  };

  const unscheduledTasks = board.tasks.filter(t => !t.dueDate && !t.completed);
  const activeGoals = goals.filter(g => !g.completed);
  const today = new Date().toISOString().split('T')[0];
  const undoneHabits = habits.filter(h => !h.completedDays.includes(today));

  const handleDragStart = (e: React.DragEvent, type: string, item: any) => {
    e.dataTransfer.setData('application/x-calendar-item', JSON.stringify({ type, ...item }));
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget instanceof HTMLElement) {
      const rect = e.currentTarget.getBoundingClientRect();
      e.dataTransfer.setDragImage(e.currentTarget, rect.width / 2, 20);
    }
  };

  return (
    <div className="w-80 flex flex-col h-full overflow-y-auto bg-muted/5 border-r border-border">
      <div className="p-4 border-b border-border">
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Productivity</h2>
      </div>

      <div className="flex-1 space-y-1 p-3">
        {/* Unscheduled Tasks */}
        <CollapsibleSection
          title={`Unscheduled Tasks`}
          count={unscheduledTasks.length}
          icon={<AlertCircle className="w-3.5 h-3.5 text-primary" />}
          open={tasksOpen}
          onToggle={() => setTasksOpen(!tasksOpen)}
        >
          {unscheduledTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">
              All tasks are scheduled
            </p>
          ) : (
            <div className="space-y-1.5">
              {unscheduledTasks.map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, 'task', {
                    id: task.id,
                    title: task.title,
                    duration: task.duration || 30,
                    color: task.color || '#4f46e5',
                    priority: task.priority,
                    subtasks: task.subtasks,
                  })}
                  onClick={() => onTaskClick(task)}
                  className="group p-3 bg-card border border-border rounded-xl hover:border-primary/20 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing flex items-start gap-2.5"
                >
                  <GripVertical className="w-3.5 h-3.5 text-muted-foreground/30 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase",
                        PRIORITY_CONFIG[task.priority]?.className || "bg-muted text-muted-foreground"
                      )}>
                        {task.priority}
                      </span>
                      {task.duration && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {task.duration}min
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Goals */}
        <CollapsibleSection
          title="Goals"
          count={activeGoals.length}
          icon={<Target className="w-3.5 h-3.5 text-emerald-500" />}
          open={goalsOpen}
          onToggle={() => setGoalsOpen(!goalsOpen)}
        >
          {loading.goals ? (
            <div className="text-center py-4 text-xs text-muted-foreground">Loading...</div>
          ) : activeGoals.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">
              No active goals
            </p>
          ) : (
            <div className="space-y-1.5">
              {activeGoals.map(goal => (
                <div
                  key={goal.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, 'goal', {
                    id: goal.id,
                    title: goal.title,
                    duration: 30,
                    color: goal.color,
                    subGoals: goal.subGoals,
                  })}
                  className="group p-3 bg-card border border-border rounded-xl hover:border-primary/20 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-bold text-foreground truncate flex-1">{goal.title}</p>
                    <span className="text-[10px] font-bold ml-2" style={{ color: goal.color }}>
                      {Math.round((goal.progress / goal.target) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 mb-1.5">
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, (goal.progress / goal.target) * 100)}%`,
                        backgroundColor: goal.color,
                      }}
                    />
                  </div>
                  <p className="text-[9px] text-muted-foreground">
                    {goal.progress} / {goal.target} {goal.unit}
                    {goal.subGoals.length > 0 && ` · ${goal.subGoals.filter(s => !s.completed).length} sub-goals`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Habits */}
        <CollapsibleSection
          title="Habits"
          count={undoneHabits.length}
          icon={<Flame className="w-3.5 h-3.5 text-orange-500" />}
          open={habitsOpen}
          onToggle={() => setHabitsOpen(!habitsOpen)}
        >
          {loading.habits ? (
            <div className="text-center py-4 text-xs text-muted-foreground">Loading...</div>
          ) : undoneHabits.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6 border border-dashed border-border rounded-xl">
              All habits completed today
            </p>
          ) : (
            <div className="space-y-1.5">
              {undoneHabits.map(habit => (
                <div
                  key={habit.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, 'habit', {
                    id: habit.id,
                    title: habit.title,
                    duration: 15,
                    color: habit.color === 'primary' ? '#d97706' : habit.color,
                  })}
                  className="group p-3 bg-card border border-border rounded-xl hover:border-primary/20 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Flame className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                      <p className="text-xs font-bold text-foreground truncate">{habit.title}</p>
                    </div>
                    <span className="text-[10px] font-bold text-orange-500 ml-2 flex-shrink-0">
                      {habit.streak} day streak
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1 capitalize">{habit.category}</p>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
};

function CollapsibleSection({
  title, count, icon, open, onToggle, children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-bold text-foreground">{title}</span>
          <span className="text-[10px] font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        </div>
        {open ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {open && (
        <div className="p-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

export default CalendarSidebar;
