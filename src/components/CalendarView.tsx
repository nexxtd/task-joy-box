import React, { useState } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { Task, PRIORITY_CONFIG } from '@/types/board';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarViewProps {
  onTaskClick: (task: Task) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({ onTaskClick }) => {
  const { board } = useBoardContext();
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const tasksWithDates = board.tasks.filter(t => t.dueDate);

  const getTasksForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return tasksWithDates.filter(t => t.dueDate === dateStr);
  };

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-foreground">{monthName}</h2>
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="text-xs text-primary hover:underline px-2 py-1"
            >
              Today
            </button>
            <button onClick={nextMonth} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Week headers */}
        <div className="grid grid-cols-7 mb-1">
          {weekDays.map(d => (
            <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7 border-t border-l border-border">
          {days.map((day, i) => {
            const isToday = day && today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
            const dayTasks = day ? getTasksForDay(day) : [];

            return (
              <div
                key={i}
                className={`min-h-[100px] border-r border-b border-border p-1.5 ${
                  day ? 'bg-card' : 'bg-muted/20'
                }`}
              >
                {day && (
                  <>
                    <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${
                      isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                    }`}>
                      {day}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayTasks.map(task => {
                        const column = board.columns.find(c => c.id === task.columnId);
                        return (
                          <button
                            key={task.id}
                            onClick={() => onTaskClick(task)}
                            className="w-full text-left px-1.5 py-1 rounded text-[10px] font-medium truncate transition-colors hover:opacity-80"
                            style={{ backgroundColor: column?.color || 'hsl(var(--muted))', color: 'hsl(var(--primary-foreground))' }}
                          >
                            {task.title}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default CalendarView;
