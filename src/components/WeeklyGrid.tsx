import React from 'react';
import { format, startOfWeek, addDays, isSameDay } from 'date-fns';
import { Task, PRIORITY_CONFIG } from '@/types/board';
import { useBoardContext } from '@/context/BoardContext';
import { cn } from '@/lib/utils';
import { GripVertical, Plus } from 'lucide-react';

interface WeeklyGridProps {
  tasks: Task[];
  selectedDate: Date;
  onTaskClick: (task: Task) => void;
  onMoveTask: (taskId: string, newDate: string, startTime: string) => void;
  dayOnly?: boolean; // When true, shows only selectedDate as a single-day view
}

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 06:00–22:00

const WeeklyGrid: React.FC<WeeklyGridProps> = ({ tasks, selectedDate, onTaskClick, onMoveTask, dayOnly = false }) => {
  const { board, addTask } = useBoardContext();
  const startDate = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = dayOnly
    ? [selectedDate]
    : Array.from({ length: 7 }, (_, i) => addDays(startDate, i));

  const getTasksForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return tasks.filter(t => t.dueDate === dateStr);
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('bg-primary/10', 'ring-2', 'ring-primary/20', 'ring-inset');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-primary/10', 'ring-2', 'ring-primary/20', 'ring-inset');
  };

  const handleDrop = (e: React.DragEvent, date: Date, hour: number) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-primary/10', 'ring-2', 'ring-primary/20', 'ring-inset');
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId) {
      const dateStr = format(date, 'yyyy-MM-dd');
      const timeStr = `${hour.toString().padStart(2, '0')}:00`;
      onMoveTask(taskId, dateStr, timeStr);
    }
  };

  const colCount = weekDays.length;
  const gridTemplate = dayOnly ? 'grid-cols-[100px_1fr]' : 'grid-cols-[100px_repeat(7,1fr)]';

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden border border-border rounded-xl">
      {/* Header */}
      <div className={cn('grid border-b border-border bg-muted/30', gridTemplate)}>
        {/* Time gutter header */}
        <div className="p-4 border-r border-border flex items-center justify-center">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Time</span>
        </div>
        {weekDays.map((date, i) => (
          <div
            key={i}
            className={cn(
              'p-4 text-center border-r border-border last:border-r-0 flex flex-col items-center gap-1',
              isSameDay(date, new Date()) && 'bg-primary/5'
            )}
          >
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {format(date, dayOnly ? 'EEEE' : 'EEEE')}
            </span>
            <div className={cn(
              'text-sm font-bold flex items-center justify-center w-9 h-9 rounded-full transition-colors',
              isSameDay(date, new Date()) ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30' : 'text-foreground hover:bg-muted'
            )}>
              {dayOnly ? format(date, 'd MMM') : format(date, 'd MMM')}
            </div>
          </div>
        ))}
      </div>

      {/* Scrollable Grid */}
      <div className="flex-1 overflow-y-auto relative">
        <div className={cn('grid min-h-full', gridTemplate)}>
          {HOURS.map(hour => (
            <React.Fragment key={hour}>
              {/* Time Label — prominent left gutter */}
              <div className="h-16 border-b border-r border-border flex items-start justify-end pr-3 pt-2 bg-muted/20 sticky-ish">
                <span className={cn(
                  'text-xs font-bold tabular-nums',
                  hour === new Date().getHours() ? 'text-primary' : 'text-muted-foreground'
                )}>
                  {hour.toString().padStart(2, '0')}:00
                </span>
              </div>

              {/* Day columns for this hour */}
              {weekDays.map((date, dayIdx) => {
                const dayTasks = getTasksForDay(date);
                const hourStr = `${hour.toString().padStart(2, '0')}:00`;
                
                // Tasks with matching startTime OR tasks with no startTime (shown at 9am by default)
                const slotTasks = dayTasks.filter(t => {
                  if (t.startTime) {
                    return t.startTime === hourStr;
                  }
                  // If no startTime, show at 9am (09:00) by default
                  return hour === 9;
                });

                // Current hour highlight
                const isCurrentHour = isSameDay(date, new Date()) && hour === new Date().getHours();

                return (
                  <div
                    key={dayIdx}
                    onClick={() => {
                      const dateStr = format(date, 'yyyy-MM-dd');
                      const hourStr = `${hour.toString().padStart(2, '0')}:00`;
                      addTask(board.columns[0]?.id || 'todo', 'New Task', {
                        priority: 'medium',
                        dueDate: dateStr,
                        startTime: hourStr,
                        duration: 60
                      });
                    }}
                    className={cn(
                      'h-16 border-b border-r border-border last:border-r-0 p-1 transition-colors relative group/slot cursor-pointer',
                      isCurrentHour
                        ? 'bg-primary/[0.06]'
                        : isSameDay(date, new Date())
                          ? 'bg-primary/[0.015] hover:bg-primary/[0.04]'
                          : 'hover:bg-muted/40'
                    )}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, date, hour)}
                  >
                    {/* Current-hour line indicator */}
                    {isCurrentHour && (
                      <div className="absolute left-0 right-0 top-0 h-0.5 bg-primary/60 z-20" />
                    )}

                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/slot:opacity-100 transition-opacity pointer-events-none">
                      <Plus className="w-4 h-4 text-muted-foreground/30" />
                    </div>

                    {slotTasks.map((task, taskIdx) => {
                      const column = board.columns.find(c => c.id === task.columnId);
                      // Calculate position to allow stacking - shift right if multiple tasks
                      const stackOffset = taskIdx * 8; // 8px offset for each stacked task
                      const maxWidth = Math.max(40, 100 - (slotTasks.length * 8)); // Ensure min width
                      
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, task.id); }}
                          onDragOver={(e) => e.preventDefault()}
                          onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
                          className="absolute rounded-lg border border-border p-2 shadow-sm cursor-pointer transition-all hover:shadow-md hover:scale-[1.02] z-10 overflow-hidden bg-card group/task"
                          style={{
                            left: `${4 + stackOffset}px`,
                            right: `${4 + stackOffset}px`,
                            top: `${4}px`,
                            height: task.duration ? `${(task.duration / 60) * 64 - 8}px` : '56px',
                            borderLeftWidth: '3px',
                            borderLeftColor: column?.color || 'hsl(var(--primary))',
                            zIndex: 10 + taskIdx,
                            maxWidth: `${maxWidth}%`,
                          }}
                        >
                          <div className="flex flex-col h-full">
                            <div className="flex items-start justify-between gap-1 mb-1">
                              <span className="text-xs font-bold text-foreground truncate leading-tight">
                                {task.title}
                              </span>
                              <GripVertical className="w-3 h-3 text-muted-foreground opacity-0 group-hover/task:opacity-100 transition-opacity flex-shrink-0" />
                            </div>
                            <div className="flex items-center gap-2 mt-auto">
                              <div className={cn(
                                'text-[9px] px-1.5 py-0.5 rounded font-bold uppercase',
                                PRIORITY_CONFIG[task.priority]?.className || 'bg-muted text-muted-foreground'
                              )}>
                                {task.priority}
                              </div>
                              {task.duration && (
                                <span className="text-[9px] text-muted-foreground font-medium">
                                  {task.duration}min
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WeeklyGrid;
