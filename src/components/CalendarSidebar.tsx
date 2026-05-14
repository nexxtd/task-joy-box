import React, { useState, useEffect } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { Task, PRIORITY_CONFIG } from '@/types/board';
import { cn } from '@/lib/utils';
import { Plus, GripVertical, Target, BarChart3, Clock, Loader2 } from 'lucide-react';

interface Goal {
  id: number;
  title: string;
  description: string;
  progress: number;
  target: number;
  unit: string;
  color: string;
}

interface CalendarSidebarProps {
  onTaskClick: (task: Task) => void;
}

const CalendarSidebar: React.FC<CalendarSidebarProps> = ({ onTaskClick }) => {
  const { board, addTask } = useBoardContext();
  const [quickTask, setQuickTask] = useState('');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);

  // Fetch goals from API
  useEffect(() => {
    fetchGoals();
  }, []);

  const fetchGoals = async () => {
    try {
      setGoalsLoading(true);
      const res = await fetch('/api/goals', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setGoals(data);
      }
    } catch (error) {
      console.error('Error fetching goals:', error);
    } finally {
      setGoalsLoading(false);
    }
  };

  const unscheduledTasks = board.tasks.filter(t => !t.dueDate);

  const handleQuickAdd = () => {
    if (quickTask.trim()) {
      addTask(
        board.columns[0]?.id || 'todo',
        quickTask.trim(),
        { priority: 'medium' }
      );
      setQuickTask('');
    }
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-80 flex flex-col gap-6 p-6 h-full overflow-y-auto bg-muted/10 border-r border-border">
      {/* Unscheduled Section */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            Unscheduled ({unscheduledTasks.length})
          </h3>
        </div>
        
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Quick add task..."
            value={quickTask}
            onChange={(e) => setQuickTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickAdd()}
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button 
            onClick={handleQuickAdd}
            className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          {unscheduledTasks.length > 0 ? (
            unscheduledTasks.map(task => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => handleDragStart(e, task.id)}
                onClick={() => onTaskClick(task)}
                className="group p-4 bg-card border border-border rounded-xl shadow-sm hover:shadow-md hover:border-primary/20 transition-all cursor-grab active:cursor-grabbing flex items-start gap-3"
              >
                <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground truncate mb-2">{task.title}</p>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                      PRIORITY_CONFIG[task.priority]?.className || "bg-muted text-muted-foreground"
                    )}>
                      {task.priority}
                    </span>
                    {task.duration && (
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                        <Clock className="w-3 h-3" />
                        {task.duration}min
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 border-2 border-dashed border-border rounded-xl">
              <p className="text-xs text-muted-foreground">Drag tasks or subtasks into the grid</p>
            </div>
          )}
        </div>
      </section>

      {/* Goals Section */}
      <section className="flex flex-col gap-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Target className="w-4 h-4" />
          Goals ({goals.length})
        </h3>
        {goalsLoading ? (
          <div className="text-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto" />
          </div>
        ) : goals.length > 0 ? (
          <div className="flex flex-col gap-2">
            {goals.map(goal => (
              <div 
                key={goal.id} 
                className="p-3 bg-card border border-border rounded-xl hover:border-primary/20 transition-all cursor-pointer"
                onClick={() => window.location.href = '/goals'}
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-foreground truncate">{goal.title}</p>
                  <span className="text-xs font-bold" style={{ color: goal.color }}>
                    {Math.round((goal.progress / goal.target) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div 
                    className="h-1.5 rounded-full transition-all"
                    style={{ 
                      width: `${Math.min(100, (goal.progress / goal.target) * 100)}%`,
                      backgroundColor: goal.color 
                    }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {goal.progress} / {goal.target} {goal.unit}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 bg-card/50 border border-border border-dashed rounded-xl">
            <p className="text-xs text-muted-foreground">No goals set.</p>
            <button 
              onClick={() => window.location.href = '/goals'}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Create a goal
            </button>
          </div>
        )}
      </section>

      {/* Weekly Overview Section */}
      <section className="flex flex-col gap-4">
        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Weekly Overview
        </h3>
        <div className="text-center py-10 bg-card/50 border border-border border-dashed rounded-xl px-4">
          <p className="text-xs text-muted-foreground">Empty week. Drag items to plan.</p>
        </div>
      </section>
    </div>
  );
};

export default CalendarSidebar;
