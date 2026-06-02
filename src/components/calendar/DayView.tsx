import React, { useState, useCallback } from 'react';
import { format, addMinutes, isSameDay, startOfDay, endOfDay } from 'date-fns';
import { Clock, Plus, Coffee, Brain, Target, Edit3, Trash2, Play, Pause } from 'lucide-react';
import { TimeBlock, CalendarPreferences, CalendarDay } from '@/types/calendar';
import { Task } from '@/types/board';
import { useBoardContext } from '@/context/BoardContext';
import { cn } from '@/lib/utils';
import { minutesToTime, timeToMinutes, calculateDuration } from '@/utils/calendarUtils';

interface DayViewProps {
  date: Date;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  preferences: CalendarPreferences;
  onTimeBlockUpdate?: (timeBlock: TimeBlock) => void;
  onTimeBlockDelete?: (timeBlockId: string) => void;
}

const DayView: React.FC<DayViewProps> = ({
  date,
  tasks,
  onTaskClick,
  preferences,
  onTimeBlockUpdate,
  onTimeBlockDelete,
}) => {
  const { updateTask, addTask } = useBoardContext();
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [draggedBlock, setDraggedBlock] = useState<TimeBlock | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<TimeBlock | null>(null);
  const [isAddingBlock, setIsAddingBlock] = useState(false);
  const [newBlockStartTime, setNewBlockStartTime] = useState<string>('');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute
  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Generate time blocks from tasks
  React.useEffect(() => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const blocks: TimeBlock[] = [];

    // Convert tasks to time blocks
    tasks.forEach(task => {
      if (task.dueDate === dateStr) {
        const startTime = task.startTime || preferences.workDayStart;
        const duration = task.duration || 60;
        const endTime = minutesToTime(timeToMinutes(startTime) + duration);

        blocks.push({
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

    // Add breaks (auto-scheduled)
    if (preferences.autoScheduleBreaks) {
      const workStart = timeToMinutes(preferences.workDayStart);
      const workEnd = timeToMinutes(preferences.workDayEnd);
      
      // Add lunch break
      blocks.push({
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

      // Add short breaks every 90 minutes
      let lastBreakTime = workStart;
      blocks.forEach(block => {
        if (block.type === 'task') {
          const blockStart = timeToMinutes(block.startTime);
          const blockEnd = timeToMinutes(block.endTime);
          
          if (blockStart - lastBreakTime >= preferences.breakFrequency) {
            const breakStart = minutesToTime(blockStart - 5);
            blocks.push({
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
        }
      });
    }

    setTimeBlocks(blocks.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)));
  }, [tasks, date, preferences]);

  const handleDragStart = (block: TimeBlock) => {
    setDraggedBlock(block);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetTime: string) => {
    e.preventDefault();
    if (!draggedBlock) return;

    const duration = calculateDuration(draggedBlock.startTime, draggedBlock.endTime);
    const newEndTime = minutesToTime(timeToMinutes(targetTime) + duration);

    const updatedBlock = {
      ...draggedBlock,
      startTime: targetTime,
      endTime: newEndTime,
    };

    setTimeBlocks(prev => 
      prev.map(block => block.id === draggedBlock.id ? updatedBlock : block)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
    );

    // Update task if it's a task block
    if (draggedBlock.taskId) {
      updateTask(draggedBlock.taskId, {
        startTime: targetTime,
        duration,
      });
    }

    setDraggedBlock(null);
  };

  const handleBlockClick = (block: TimeBlock) => {
    setSelectedBlock(block);
  };

  const handleAddBlock = (startTime: string) => {
    setNewBlockStartTime(startTime);
    setIsAddingBlock(true);
  };

  const handleCreateBlock = (type: 'task' | 'break' | 'focus') => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const newBlock: TimeBlock = {
      id: `block-${Date.now()}-${Math.random()}`,
      title: type === 'task' ? 'New Task' : type === 'break' ? 'Break' : 'Focus Time',
      type,
      startTime: newBlockStartTime,
      endTime: minutesToTime(timeToMinutes(newBlockStartTime) + (type === 'break' ? 15 : 60)),
      date: dateStr,
      isBreak: type === 'break',
      autoScheduled: false,
    };

    setTimeBlocks(prev => [...prev, newBlock].sort((a, b) => 
      timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    ));

    if (type === 'task') {
      addTask('todo', newBlock.title, {
        dueDate: dateStr,
        startTime: newBlockStartTime,
        duration: calculateDuration(newBlock.startTime, newBlock.endTime),
      });
    }

    setIsAddingBlock(false);
    setNewBlockStartTime('');
  };

  const handleDeleteBlock = (blockId: string) => {
    setTimeBlocks(prev => prev.filter(block => block.id !== blockId));
    if (onTimeBlockDelete) {
      onTimeBlockDelete(blockId);
    }
  };

  const getBlockIcon = (type: TimeBlock['type']) => {
    switch (type) {
      case 'task': return <Target className="w-4 h-4" />;
      case 'break': return <Coffee className="w-4 h-4" />;
      case 'focus': return <Brain className="w-4 h-4" />;
      case 'meeting': return <Clock className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
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
    
    // Task colors based on priority
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
        <div>
          <h2 className="text-xl font-bold text-foreground tracking-tight">
            {format(date, 'EEEE, MMMM d, yyyy')}
          </h2>
          <p className="text-xs text-muted-foreground font-medium mt-1 flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(currentTime, 'h:mm a')}
            </span>
            <span className="text-border">•</span>
            <span>{timeBlocks.filter(b => b.type === 'task').length} tasks</span>
            <span className="text-border">•</span>
            <span>{timeBlocks.filter(b => b.type === 'break').length} breaks</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleAddBlock(preferences.workDayStart)}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all duration-200 hover:shadow-lg hover:scale-105 active:scale-95 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add Block
          </button>
        </div>
      </div>

      {/* Time Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative">
          {/* Current Time Line */}
          {isSameDay(date, currentTime) && (
            <div
              className="absolute left-0 right-0 z-20"
              style={{
                top: `${((currentMinutes - workStart) / (workEnd - workStart)) * 100}%`,
              }}
            >
              <div className="absolute inset-x-0 h-px bg-gradient-to-r from-red-500 via-red-400 to-transparent" />
              <div className="absolute -left-1 -top-1.5 w-3 h-3 bg-red-500 rounded-full shadow-md shadow-red-500/30 ring-2 ring-white" />
              <span className="absolute -top-5 left-4 text-xs font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full shadow-sm">
                {format(currentTime, 'h:mm a')}
              </span>
            </div>
          )}

          {/* Time Slots */}
          {timeSlots.map((slotTime, index) => {
            const slotBlocks = timeBlocks.filter(block => 
              timeToMinutes(block.startTime) <= timeToMinutes(slotTime) && 
              timeToMinutes(block.endTime) > timeToMinutes(slotTime)
            );

            return (
              <div
                key={slotTime}
                className={cn(
                  'relative flex border-b border-border/40 min-h-[70px] transition-colors duration-200',
                  isCurrentTimeSlot(slotTime) && 'bg-gradient-to-r from-red-50/30 to-transparent'
                )}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, slotTime)}
              >
                {/* Time Label */}
                <div className={cn(
                  'w-20 py-3 px-3 text-sm font-semibold border-r border-border/40 flex flex-col justify-center',
                  isCurrentTimeSlot(slotTime) ? 'text-red-500' : 'text-muted-foreground/70'
                )}>
                  {slotTime}
                  {isCurrentTimeSlot(slotTime) && (
                    <span className="text-[10px] font-bold text-red-400">NOW</span>
                  )}
                </div>

                {/* Time Blocks */}
                <div className="flex-1 relative p-1">
                  {slotBlocks.map(block => {
                    const duration = calculateDuration(block.startTime, block.endTime);
                    const height = (duration / 30) * 70; // 70px per 30 minutes
                    
                    return (
                      <div
                        key={block.id}
                        draggable={block.type !== 'break' || !block.autoScheduled}
                        onDragStart={() => handleDragStart(block)}
                        onClick={() => handleBlockClick(block)}
                        className={cn(
                          'absolute left-2 right-2 rounded-xl border p-3 cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.01]',
                          getBlockColor(block),
                          draggedBlock?.id === block.id && 'opacity-50 scale-95'
                        )}
                        style={{
                          top: '6px',
                          height: `${height - 12}px`,
                          zIndex: block.type === 'break' ? 1 : 2,
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2.5">
                            <div className="p-1 rounded-lg bg-white/50">
                              {getBlockIcon(block.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm truncate">
                                {block.title}
                              </div>
                              <div className="text-xs opacity-70 font-medium">
                                {block.startTime} - {block.endTime} ({duration}min)
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5">
                            {block.type === 'task' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const task = tasks.find(t => t.id === block.taskId);
                                  if (task) onTaskClick(task);
                                }}
                                className="p-1.5 hover:bg-white/30 rounded-lg transition-colors"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!block.autoScheduled && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteBlock(block.id);
                                }}
                                className="p-1.5 hover:bg-white/30 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Empty slot indicator */}
                  {slotBlocks.length === 0 && (
                    <div
                      className="absolute inset-3 border-2 border-dashed border-border/40 rounded-xl flex items-center justify-center opacity-0 hover:opacity-100 transition-all duration-200 cursor-pointer hover:border-primary/40 hover:bg-primary/5"
                      onClick={() => handleAddBlock(slotTime)}
                    >
                      <Plus className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Block Modal */}
      {isAddingBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl p-6 max-w-md w-full shadow-2xl border border-border/50">
            <h3 className="text-lg font-bold mb-1">Add Time Block</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Starting at <span className="font-semibold text-foreground">{newBlockStartTime}</span>
            </p>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => handleCreateBlock('task')}
                className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 rounded-xl hover:from-blue-100 hover:to-blue-200 transition-all duration-200 hover:scale-105 hover:shadow-lg border border-blue-200"
              >
                <Target className="w-6 h-6 mx-auto mb-2" />
                <div className="text-xs font-semibold">Task</div>
              </button>
              <button
                onClick={() => handleCreateBlock('break')}
                className="p-4 bg-gradient-to-br from-green-50 to-green-100 text-green-700 rounded-xl hover:from-green-100 hover:to-green-200 transition-all duration-200 hover:scale-105 hover:shadow-lg border border-green-200"
              >
                <Coffee className="w-6 h-6 mx-auto mb-2" />
                <div className="text-xs font-semibold">Break</div>
              </button>
              <button
                onClick={() => handleCreateBlock('focus')}
                className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 text-purple-700 rounded-xl hover:from-purple-100 hover:to-purple-200 transition-all duration-200 hover:scale-105 hover:shadow-lg border border-purple-200"
              >
                <Brain className="w-6 h-6 mx-auto mb-2" />
                <div className="text-xs font-semibold">Focus</div>
              </button>
            </div>
            <button
              onClick={() => setIsAddingBlock(false)}
              className="w-full mt-6 p-3 bg-muted text-muted-foreground rounded-xl hover:bg-muted/80 transition-all duration-200 font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DayView;
