import React, { useState } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { Task, PRIORITY_CONFIG } from '@/types/board';
import { ChevronLeft, ChevronRight, Plus, X, Edit3, Clock, Calendar as CalendarIcon } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';

interface CalendarViewProps {
  onTaskClick: (task: Task) => void;
  viewMode?: 'day' | 'week' | 'month';
  selectedDate?: Date;
  setSelectedDate?: (date: Date) => void;
  onAddTaskToDate?: (date: Date) => void;
  onMoveTaskToDate?: (taskId: string, newDate: Date) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ 
  onTaskClick, 
  viewMode = 'month', 
  selectedDate = new Date(), 
  setSelectedDate = () => {}, 
  onAddTaskToDate = () => {},
  onMoveTaskToDate = () => {}
}) => {
  const { board, addTask, updateTask } = useBoardContext();
  const [showTaskForm, setShowTaskForm] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  });

  const getTasksForDay = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return board.tasks.filter(t => t.dueDate === dateStr);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-primary/10');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-primary/10');
  };

  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-primary/10');
    const taskId = e.dataTransfer.getData('taskId');
    if (taskId && onMoveTaskToDate) {
      onMoveTaskToDate(taskId, date);
    }
  };

  const handleQuickAdd = (date: Date) => {
    if (newTitle.trim()) {
      addTask(
        board.columns[0]?.id || 'todo',
        newTitle.trim(),
        {
          priority: 'medium',
          dueDate: format(date, 'yyyy-MM-dd')
        }
      );
      setNewTitle('');
      setShowTaskForm(null);
    }
  };

  if (viewMode === 'day') {
    const dayTasks = getTasksForDay(selectedDate);
    return (
      <div className="flex-1 flex flex-col h-full bg-background overflow-hidden p-8">
        <div className="max-w-4xl mx-auto w-full flex flex-col gap-8">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="text-3xl font-black text-foreground tracking-tight">
                {format(selectedDate, 'EEEE')}
              </h2>
              <p className="text-muted-foreground font-medium">
                {format(selectedDate, 'MMMM do, yyyy')}
              </p>
            </div>
            <button
               onClick={() => setShowTaskForm(format(selectedDate, 'yyyy-MM-dd'))}
               className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-2xl font-bold shadow-lg hover:opacity-90 active:scale-95 transition-all"
            >
              <Plus className="w-5 h-5" />
              Add Task
            </button>
          </div>

          <div 
            className="grid gap-4 min-h-[400px]"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, selectedDate)}
          >
            {showTaskForm === format(selectedDate, 'yyyy-MM-dd') && (
              <div className="p-6 bg-card border-2 border-primary/20 rounded-3xl shadow-xl animate-scale-in">
                <input
                  autoFocus
                  placeholder="What needs to be done?"
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleQuickAdd(selectedDate)}
                  className="w-full text-lg font-bold bg-transparent focus:outline-none mb-4"
                />
                <div className="flex justify-end gap-3">
                  <button onClick={() => setShowTaskForm(null)} className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-xl">Cancel</button>
                  <button onClick={() => handleQuickAdd(selectedDate)} className="px-6 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-xl">Create Task</button>
                </div>
              </div>
            )}

            {dayTasks.length > 0 ? (
              dayTasks.map(task => (
                <div 
                  key={task.id}
                  onClick={() => onTaskClick(task)}
                  className="p-6 bg-card border border-border rounded-3xl hover:border-primary/20 hover:shadow-xl transition-all cursor-pointer group flex items-center justify-between"
                >
                  <div className="flex items-center gap-6">
                    <div 
                      className="w-2 h-12 rounded-full" 
                      style={{ backgroundColor: board.columns.find(c => c.id === task.columnId)?.color || 'hsl(var(--primary))' }} 
                    />
                    <div>
                      <h3 className="text-lg font-bold text-foreground mb-1 group-hover:text-primary transition-colors">{task.title}</h3>
                      <div className="flex items-center gap-3">
                        <span className={cn(
                          "text-[10px] font-black px-2 py-0.5 rounded uppercase",
                          PRIORITY_CONFIG[task.priority]?.className || "bg-muted"
                        )}>
                          {task.priority}
                        </span>
                        {task.startTime && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 font-bold">
                            <Clock className="w-3.5 h-3.5" />
                            {task.startTime}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-6 h-6 text-muted-foreground/30 group-hover:text-primary/50 transition-colors" />
                </div>
              ))
            ) : (
              <div className="py-20 text-center border-2 border-dashed border-border rounded-3xl">
                <p className="text-muted-foreground font-medium">Peaceful day. No tasks scheduled.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Month View
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden border border-border rounded-xl">
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
          <div key={day} className="p-4 text-center text-[10px] font-black text-muted-foreground uppercase tracking-widest">
            {day}
          </div>
        ))}
      </div>
      <div className="flex-1 grid grid-cols-7 border-collapse overflow-y-auto relative">
        {calendarDays.map((date, i) => {
          const dayTasks = getTasksForDay(date);
          const isCurrentMonth = isSameMonth(date, selectedDate);
          const isToday = isSameDay(date, new Date());
          const dateKey = format(date, 'yyyy-MM-dd');
          const isFormOpen = showTaskForm === dateKey;
          
          return (
            <div 
              key={i} 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, date)}
              className={cn(
                "min-h-[140px] border-b border-r border-border p-3 transition-all hover:bg-muted/[0.02] flex flex-col gap-2 relative group",
                !isCurrentMonth && "bg-muted/20 opacity-50",
                isToday && "bg-primary/[0.02]"
              )}
            >
              <div className="flex items-center justify-between z-10">
                <span className={cn(
                  "text-sm font-black w-8 h-8 flex items-center justify-center rounded-full transition-all",
                  isToday ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground"
                )}>
                  {format(date, 'd')}
                </span>
                <button 
                  onClick={() => setShowTaskForm(isFormOpen ? null : dateKey)}
                  className={cn(
                    "p-1.5 hover:bg-muted rounded-lg transition-all",
                    isFormOpen ? "opacity-100 bg-muted" : "opacity-0 group-hover:opacity-100"
                  )}
                >
                  {isFormOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4 text-muted-foreground" />}
                </button>
              </div>

              {isFormOpen ? (
                <div className="absolute inset-0 z-20 bg-background p-3 flex flex-col gap-2 animate-scale-in">
                  <input
                    autoFocus
                    placeholder="New task..."
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleQuickAdd(date)}
                    className="w-full text-xs font-bold bg-transparent focus:outline-none border-b border-primary/20 pb-1"
                  />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowTaskForm(null)} className="p-1 px-2 text-[10px] font-bold text-muted-foreground hover:bg-muted rounded">Cancel</button>
                    <button onClick={() => handleQuickAdd(date)} className="p-1 px-3 bg-primary text-primary-foreground text-[10px] font-bold rounded">Add</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-1 overflow-y-auto max-h-[80px] pr-1 scrollbar-hide">
                  {dayTasks.slice(0, 3).map(task => (
                    <div
                      key={task.id}
                      onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
                      className="px-2 py-1.5 text-[10px] font-bold rounded-lg truncate cursor-pointer transition-all hover:scale-[1.02] shadow-sm flex items-center gap-2 border border-border/50 bg-card"
                      style={{ borderLeft: `3px solid ${board.columns.find(c => c.id === task.columnId)?.color || 'hsl(var(--primary))'}` }}
                    >
                      {task.title}
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <span className="text-[9px] font-black text-primary px-2">+ {dayTasks.length - 3} more</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CalendarView;