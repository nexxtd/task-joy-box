import React, { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, isSameDay, isToday } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Coffee, Brain, Target, Clock, Calendar } from 'lucide-react';
import { TimeBlock, CalendarPreferences } from '@/types/calendar';
import { Task } from '@/types/board';
import { useBoardContext } from '@/context/BoardContext';
import { cn } from '@/lib/utils';
import { minutesToTime, timeToMinutes, calculateDuration } from '@/utils/calendarUtils';

interface WeekViewProps {
  selectedDate: Date;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onDateChange: (date: Date) => void;
  preferences: CalendarPreferences;
}

const WeekView: React.FC<WeekViewProps> = ({
  selectedDate,
  tasks,
  onTaskClick,
  onDateChange,
  preferences,
}) => {
  const [weekDays, setWeekDays] = useState<Date[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<Record<string, TimeBlock[]>>({});
  const [currentTime, setCurrentTime] = useState(new Date());

  // Generate week days
  useEffect(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    setWeekDays(days);
  }, [selectedDate]);

  // Update current time
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Generate time blocks for each day
  useEffect(() => {
    const blocks: Record<string, TimeBlock[]> = {};
    
    weekDays.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayBlocks: TimeBlock[] = [];

      // Convert tasks to time blocks
      tasks.forEach(task => {
        if (task.dueDate === dateStr) {
          const startTime = task.startTime || preferences.workDayStart;
          const duration = task.duration || 60;
          const endTime = minutesToTime(timeToMinutes(startTime) + duration);

          dayBlocks.push({
            id: `task-${task.id}`,
            taskId: task.id,
            title: task.title,
            type: 'task',
            startTime,
            endTime,
            date: dateStr,
            color: task.color,
            completed: false,
            priority: task.priority,
            description: task.description,
          });
        }
      });

      // Add breaks
      if (preferences.autoScheduleBreaks) {
        // Lunch break
        dayBlocks.push({
          id: `break-lunch-${dateStr}`,
          title: 'Lunch Break',
          type: 'break',
          startTime: '12:00',
          endTime: '12:30',
          date: dateStr,
          isBreak: true,
          breakType: 'lunch',
          autoScheduled: true,
        });

        // Short breaks
        const workStart = timeToMinutes(preferences.workDayStart);
        const workEnd = timeToMinutes(preferences.workDayEnd);
        let lastBreakTime = workStart;

        dayBlocks
          .filter(block => block.type === 'task')
          .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
          .forEach(block => {
            const blockStart = timeToMinutes(block.startTime);
            if (blockStart - lastBreakTime >= preferences.breakFrequency) {
              const breakStart = minutesToTime(blockStart - 5);
              dayBlocks.push({
                id: `break-${Date.now()}-${Math.random()}`,
                title: 'Short Break',
                type: 'break',
                startTime: breakStart,
                endTime: minutesToTime(timeToMinutes(breakStart) + preferences.breakDuration.short),
                date: dateStr,
                isBreak: true,
                breakType: 'short',
                autoScheduled: true,
              });
              lastBreakTime = blockStart;
            }
          });
      }

      blocks[dateStr] = dayBlocks.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    });

    setTimeBlocks(blocks);
  }, [weekDays, tasks, preferences]);

  const navigateWeek = (direction: number) => {
    const newDate = addDays(selectedDate, direction * 7);
    onDateChange(newDate);
  };

  const getBlockIcon = (type: TimeBlock['type']) => {
    switch (type) {
      case 'task': return <Target className="w-3 h-3" />;
      case 'break': return <Coffee className="w-3 h-3" />;
      case 'focus': return <Brain className="w-3 h-3" />;
      case 'meeting': return <Clock className="w-3 h-3" />;
      default: return <Clock className="w-3 h-3" />;
    }
  };

  const getBlockColor = (block: TimeBlock) => {
    if (block.type === 'break') {
      return block.breakType === 'lunch' 
        ? 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200 text-orange-700 shadow-sm' 
        : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 text-green-700 shadow-sm';
    }
    if (block.type === 'focus') {
      return 'bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200 text-purple-700 shadow-sm';
    }
    if (block.type === 'meeting') {
      return 'bg-gradient-to-r from-blue-50 to-sky-50 border-blue-200 text-blue-700 shadow-sm';
    }
    
    const priorityColors = {
      urgent: 'bg-gradient-to-r from-red-50 to-rose-50 border-red-200 text-red-700 shadow-sm',
      high: 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200 text-orange-700 shadow-sm',
      medium: 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200 text-yellow-700 shadow-sm',
      low: 'bg-gradient-to-r from-slate-50 to-gray-50 border-slate-200 text-slate-600 shadow-sm',
      none: 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200 text-gray-600 shadow-sm',
    };
    
    return priorityColors[block.priority || 'none'];
  };

  // Generate time slots
  const workStart = timeToMinutes(preferences.workDayStart);
  const workEnd = timeToMinutes(preferences.workDayEnd);
  const timeSlots = [];
  for (let time = workStart; time <= workEnd; time += 30) {
    timeSlots.push(minutesToTime(time));
  }

  const currentMinutes = timeToMinutes(format(currentTime, 'HH:mm'));
  const isCurrentTimeSlot = (slotTime: string) => {
    const slotMinutes = timeToMinutes(slotTime);
    return currentMinutes >= slotMinutes && currentMinutes < slotMinutes + 30;
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/60 bg-gradient-to-r from-background to-muted/20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigateWeek(-1)}
            className="p-2.5 hover:bg-accent rounded-xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md bg-card border border-border/50"
          >
            <ChevronLeft className="w-4 h-4 text-foreground" />
          </button>
          <div className="px-4">
            <h2 className="text-xl font-bold text-foreground tracking-tight">
              Week of {format(weekDays[0] || selectedDate, 'MMM d')}
            </h2>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              {format(weekDays[0] || selectedDate, 'MMM d')} - {format(weekDays[6] || selectedDate, 'MMM d, yyyy')}
            </p>
          </div>
          <button
            onClick={() => navigateWeek(1)}
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

      {/* Week Grid */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[800px]">
          {/* Day Headers */}
          <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border/60 bg-gradient-to-r from-muted/40 via-muted/30 to-muted/40">
            <div className="p-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Time
            </div>
            {weekDays.map((day, index) => (
              <div
                key={index}
                className={cn(
                  'p-3 text-center border-l border-border/40 transition-all duration-200',
                  isToday(day) && 'bg-gradient-to-b from-primary/10 to-primary/5',
                  isSameDay(day, selectedDate) && 'bg-gradient-to-b from-primary/15 to-primary/5'
                )}
              >
                <div className={cn(
                  'text-xs font-semibold uppercase tracking-wider',
                  isToday(day) ? 'text-primary' : 'text-muted-foreground/80'
                )}>
                  {format(day, 'EEE')}
                </div>
                <div className={cn(
                  'text-sm font-bold mt-1.5 transition-all duration-200',
                  isToday(day) && 'text-primary',
                  isSameDay(day, selectedDate) && 'bg-primary text-primary-foreground w-8 h-8 rounded-full mx-auto flex items-center justify-center shadow-md'
                )}>
                  {!isSameDay(day, selectedDate) && format(day, 'd')}
                  {isSameDay(day, selectedDate) && format(day, 'd')}
                </div>
              </div>
            ))}
          </div>

          {/* Time Slots */}
          <div className="relative">
            {timeSlots.map((slotTime, index) => {
              const slotMinutes = timeToMinutes(slotTime);
              const isCurrentSlot = isCurrentTimeSlot(slotTime);

              return (
                <div
                  key={slotTime}
                  className={cn(
                    'grid grid-cols-[80px_repeat(7,1fr)] border-b border-border/30 transition-colors duration-200',
                    isCurrentSlot && 'bg-gradient-to-r from-red-50/40 via-red-50/20 to-transparent'
                  )}
                >
                  {/* Time Label */}
                  <div className="p-2 text-center flex flex-col items-center justify-center">
                    <div className={cn(
                      'text-xs font-semibold transition-colors',
                      isCurrentSlot ? 'text-red-500' : 'text-muted-foreground/70'
                    )}>
                      {slotTime}
                    </div>
                    {isCurrentSlot && (
                      <div className="text-[10px] font-bold text-red-500 mt-0.5 bg-red-100 px-1.5 py-0.5 rounded-full">
                        NOW
                      </div>
                    )}
                  </div>

                  {/* Day Columns */}
                  {weekDays.map((day, dayIndex) => {
                    const dateStr = format(day, 'yyyy-MM-dd');
                    const dayBlocks = timeBlocks[dateStr] || [];
                    const slotBlocks = dayBlocks.filter(block => 
                      timeToMinutes(block.startTime) <= slotMinutes && 
                      timeToMinutes(block.endTime) > slotMinutes
                    );

                    return (
                      <div
                        key={dayIndex}
                        className={cn(
                          'border-l border-border/30 relative min-h-[50px] transition-colors duration-200',
                          isToday(day) && 'bg-gradient-to-b from-primary/5 to-transparent'
                        )}
                      >
                        {slotBlocks.map(block => {
                          const duration = calculateDuration(block.startTime, block.endTime);
                          const top = ((timeToMinutes(block.startTime) - workStart) / 30) * 50;
                          const height = (duration / 30) * 50;

                          return (
                            <div
                              key={block.id}
                              className={cn(
                                'absolute left-1.5 right-1.5 rounded-xl p-2 cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02]',
                                getBlockColor(block),
                                'overflow-hidden border'
                              )}
                              style={{
                                top: `${top}px`,
                                height: `${height}px`,
                                zIndex: block.type === 'break' ? 1 : 2,
                              }}
                              onClick={() => {
                                const task = tasks.find(t => t.id === block.taskId);
                                if (task) onTaskClick(task);
                              }}
                            >
                              <div className="flex items-center gap-1.5">
                                {getBlockIcon(block.type)}
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-semibold truncate leading-tight">
                                    {block.title}
                                  </div>
                                  <div className="text-[10px] opacity-70 leading-tight font-medium">
                                    {block.startTime}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Empty slot indicator */}
                        {slotBlocks.length === 0 && isToday(day) && isCurrentSlot && (
                          <div className="absolute left-2 right-2 top-1 bottom-1 border-2 border-dashed border-red-300/60 rounded-lg flex items-center justify-center opacity-40 hover:opacity-70 transition-opacity cursor-pointer hover:border-red-400">
                            <Plus className="w-4 h-4 text-red-400" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Week Summary */}
      <div className="border-t border-border/60 p-5 bg-gradient-to-r from-muted/30 via-muted/20 to-muted/30">
        <div className="grid grid-cols-7 gap-3 text-center">
          {weekDays.map((day, index) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayBlocks = timeBlocks[dateStr] || [];
            const taskCount = dayBlocks.filter(b => b.type === 'task').length;
            const breakCount = dayBlocks.filter(b => b.type === 'break').length;
            const totalWorkTime = dayBlocks
              .filter(b => b.type === 'task')
              .reduce((total, b) => total + calculateDuration(b.startTime, b.endTime), 0);

            return (
              <div 
                key={index} 
                className={cn(
                  'text-xs p-3 rounded-xl transition-all duration-200 hover:bg-accent/30',
                  isToday(day) && 'bg-gradient-to-b from-primary/10 to-primary/5 ring-1 ring-primary/20'
                )}
              >
                <div className={cn(
                  'font-semibold mb-1',
                  isToday(day) ? 'text-primary' : 'text-foreground'
                )}>
                  {format(day, 'EEE')}
                </div>
                <div className="text-muted-foreground font-medium">
                  {taskCount} tasks
                </div>
                <div className="text-muted-foreground/80">
                  {Math.round(totalWorkTime / 60)}h
                </div>
                {breakCount > 0 && (
                  <div className="text-green-600 font-medium text-[10px] mt-1 bg-green-50 rounded-full px-2 py-0.5 inline-block">
                    {breakCount} breaks
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default WeekView;
