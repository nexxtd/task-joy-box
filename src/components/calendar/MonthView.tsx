import React, { useState, useEffect } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Target, Coffee, Brain, Clock } from 'lucide-react';
import { TimeBlock, CalendarPreferences } from '@/types/calendar';
import { Task } from '@/types/board';
import { useBoardContext } from '@/context/BoardContext';
import { cn } from '@/lib/utils';

interface MonthViewProps {
  selectedDate: Date;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onDateChange: (date: Date) => void;
  preferences: CalendarPreferences;
}

const MonthView: React.FC<MonthViewProps> = ({
  selectedDate,
  tasks,
  onTaskClick,
  onDateChange,
  preferences,
}) => {
  const [currentMonth, setCurrentMonth] = useState(selectedDate);
  const [calendarDays, setCalendarDays] = useState<Date[]>([]);
  const [tasksByDate, setTasksByDate] = useState<Record<string, Task[]>>({});

  // Generate calendar days
  useEffect(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days = eachDayOfInterval({
      start: calendarStart,
      end: calendarEnd,
    });

    setCalendarDays(days);
  }, [currentMonth]);

  // Group tasks by date
  useEffect(() => {
    const grouped: Record<string, Task[]> = {};
    
    tasks.forEach(task => {
      if (task.dueDate) {
        if (!grouped[task.dueDate]) {
          grouped[task.dueDate] = [];
        }
        grouped[task.dueDate].push(task);
      }
    });

    setTasksByDate(grouped);
  }, [tasks]);

  const navigateMonth = (direction: number) => {
    const newMonth = direction > 0 ? addMonths(currentMonth, 1) : subMonths(currentMonth, 1);
    setCurrentMonth(newMonth);
  };

  const handleDateClick = (date: Date) => {
    onDateChange(date);
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'urgent': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '⚪';
      default: return '🔵';
    }
  };

  const getPriorityColor = (priority: string) => {
    const colors = {
      urgent: 'bg-red-500',
      high: 'bg-orange-500',
      medium: 'bg-yellow-500',
      low: 'bg-gray-400',
      none: 'bg-blue-500',
    };
    return colors[priority as keyof typeof colors] || 'bg-gray-400';
  };

  const getDayStats = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const dayTasks = tasksByDate[dateStr] || [];
    
    const completedCount = dayTasks.filter(t => t.columnId?.toLowerCase().includes('complete')).length;
    const totalCount = dayTasks.length;
    const hasHighPriority = dayTasks.some(t => t.priority === 'urgent' || t.priority === 'high');
    
    return {
      count: totalCount,
      completed: completedCount,
      hasHighPriority,
      completionRate: totalCount > 0 ? (completedCount / totalCount) * 100 : 0,
    };
  };

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekDayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-gradient-to-r from-background to-muted/20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateMonth(-1)}
            className="p-2.5 hover:bg-accent rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md bg-card border border-border/50"
          >
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
          <div className="px-4">
            <h2 className="text-xl font-bold text-foreground tracking-tight">
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              {tasks.length} tasks scheduled
            </p>
          </div>
          <button
            onClick={() => navigateMonth(1)}
            className="p-2.5 hover:bg-accent rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md bg-card border border-border/50"
          >
            <ChevronRight className="w-4 h-4 text-foreground" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 text-sm font-medium">
            <Plus className="w-4 h-4" />
            Add Task
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 p-5">
        <div className="grid grid-cols-7 gap-2 h-full">
          {/* Week day headers */}
          {weekDayLabels.map((day, index) => (
            <div
              key={index}
              className="text-center text-xs font-semibold text-muted-foreground/80 py-3 uppercase tracking-wider"
            >
              {day}
            </div>
          ))}

          {/* Calendar days */}
          {calendarDays.map((day, index) => {
            const stats = getDayStats(day);
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isSelected = isSameDay(day, selectedDate);
            const isTodayDate = isToday(day);
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayTasks = tasksByDate[dateStr] || [];

            return (
              <div
                key={index}
                onClick={() => handleDateClick(day)}
                className={cn(
                  'group relative rounded-2xl p-2.5 min-h-[90px] cursor-pointer transition-all duration-300 ease-out',
                  'border border-border/60 hover:border-border hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5',
                  !isCurrentMonth && 'bg-muted/20 opacity-40 grayscale-[0.3]',
                  isSelected && 'bg-gradient-to-br from-primary/15 to-primary/5 border-primary/60 ring-2 ring-primary/20 shadow-lg shadow-primary/10',
                  isTodayDate && !isSelected && 'bg-gradient-to-br from-primary/10 to-background border-primary/40 shadow-md shadow-primary/5',
                  isCurrentMonth && !isSelected && !isTodayDate && 'bg-card hover:bg-accent/30'
                )}
              >
                <div className="flex flex-col h-full">
                  {/* Date */}
                  <div className={cn(
                    'text-sm font-semibold mb-2 transition-colors',
                    isTodayDate && 'text-primary',
                    isSelected && 'text-primary',
                    !isTodayDate && !isSelected && 'text-foreground/80 group-hover:text-foreground'
                  )}>
                    <span className={cn(
                      'inline-flex items-center justify-center w-7 h-7 rounded-full transition-all duration-200',
                      isTodayDate && 'bg-primary text-primary-foreground shadow-md',
                      isSelected && !isTodayDate && 'bg-primary/20'
                    )}>
                      {format(day, 'd')}
                    </span>
                  </div>

                  {/* Task indicators */}
                  <div className="flex-1 space-y-1.5">
                    {/* Priority dots */}
                    {dayTasks.slice(0, 3).map((task, taskIndex) => (
                      <div
                        key={task.id}
                        className={cn(
                          'flex items-center gap-2 text-xs group/item cursor-pointer',
                          'p-1.5 -mx-1 rounded-lg transition-all duration-200 hover:bg-accent/50'
                        )}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTaskClick(task);
                        }}
                      >
                        <div
                          className={cn(
                            'w-2 h-2 rounded-full shrink-0 shadow-sm',
                            getPriorityColor(task.priority || 'none')
                          )}
                        />
                        <span className="truncate flex-1 leading-tight font-medium text-foreground/80 group-hover/item:text-foreground">
                          {task.title}
                        </span>
                      </div>
                    ))}

                    {/* More tasks indicator */}
                    {dayTasks.length > 3 && (
                      <div className="text-xs font-medium text-muted-foreground/70 bg-muted/50 rounded-md px-2 py-1 text-center">
                        +{dayTasks.length - 3} more
                      </div>
                    )}

                    {/* Completion indicator */}
                    {stats.count > 0 && (
                      <div className="mt-auto pt-2 border-t border-border/40">
                        <div className="flex items-center justify-between text-xs">
                          <span className={cn(
                            'font-medium',
                            stats.completionRate === 100 ? 'text-green-600' : 'text-muted-foreground'
                          )}>
                            {stats.completed}/{stats.count}
                          </span>
                          <div className="flex gap-1">
                            {stats.hasHighPriority && (
                              <div className="w-2 h-2 bg-red-500 rounded-full shadow-sm" title="High priority tasks" />
                            )}
                            {stats.completionRate > 0 && (
                              <div
                                className={cn(
                                  'w-2 h-2 rounded-full shadow-sm',
                                  stats.completionRate === 100 ? 'bg-green-500' : 'bg-yellow-500'
                                )}
                                title={stats.completionRate === 100 ? 'All tasks completed' : 'In progress'}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Empty state */}
                    {stats.count === 0 && isCurrentMonth && (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20 group-hover:bg-muted-foreground/30 transition-colors" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Month Summary */}
      <div className="border-t border-border/60 p-5 bg-gradient-to-r from-muted/30 via-muted/20 to-muted/30">
        <div className="grid grid-cols-4 gap-4 text-center">
          <div className="group">
            <div className="text-2xl font-bold text-foreground mb-1 group-hover:scale-110 transition-transform duration-200">
              {tasks.length}
            </div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Tasks</div>
          </div>
          <div className="group">
            <div className="text-2xl font-bold text-green-600 mb-1 group-hover:scale-110 transition-transform duration-200">
              {tasks.filter(t => t.columnId?.toLowerCase().includes('complete')).length}
            </div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Completed</div>
          </div>
          <div className="group">
            <div className="text-2xl font-bold text-orange-500 mb-1 group-hover:scale-110 transition-transform duration-200">
              {tasks.filter(t => t.priority === 'urgent' || t.priority === 'high').length}
            </div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">High Priority</div>
          </div>
          <div className="group">
            <div className="text-2xl font-bold text-blue-500 mb-1 group-hover:scale-110 transition-transform duration-200">
              {Math.round((tasks.filter(t => t.columnId?.toLowerCase().includes('complete')).length / Math.max(tasks.length, 1)) * 100)}%
            </div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Completion</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthView;
