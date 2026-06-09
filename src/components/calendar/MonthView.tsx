import React from 'react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
} from 'date-fns';
import { CalendarSlot } from '@/types/calendar';
import { cn } from '@/lib/utils';
import { formatTimeDisplay } from '@/utils/calendarUtils';

interface MonthViewProps {
  selectedDate: Date;
  slots: CalendarSlot[];
  onDateChange: (date: Date) => void;
  onSlotClick: (slot: CalendarSlot) => void;
  onSlotDrop: (date: string, startTime: string, dragData: any) => void;
}

const MonthView: React.FC<MonthViewProps> = ({ selectedDate, slots, onDateChange, onSlotClick, onSlotDrop }) => {
  const monthStart = startOfMonth(selectedDate);
  const monthEnd = endOfMonth(monthStart);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calStart, end: calEnd });

  const getSlotsForDay = (date: Date) =>
    slots.filter(s => s.date === format(date, 'yyyy-MM-dd'));

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.currentTarget.classList.add('bg-primary/[0.06]', 'border-primary/30');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-primary/[0.06]', 'border-primary/30');
  };

  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-primary/[0.06]', 'border-primary/30');
    try {
      const raw = e.dataTransfer.getData('application/x-calendar-item');
      const data = JSON.parse(raw);
      onSlotDrop(format(date, 'yyyy-MM-dd'), '09:00', data);
    } catch {}
  };

  return (
    <div className="flex flex-col h-full overflow-hidden rounded-xl border border-border/60 bg-card/50 shadow-sm">
      <div className="grid grid-cols-7 border-b border-border/60 bg-gradient-to-r from-muted/30 via-muted/10 to-muted/30">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
          <div key={d} className={cn(
            "p-3 text-center text-[10px] font-bold uppercase tracking-[0.15em]",
            i >= 5 ? "text-muted-foreground/50" : "text-muted-foreground/70"
          )}>
            {d}
          </div>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-7 overflow-y-auto">
        {days.map((date, i) => {
          const daySlots = getSlotsForDay(date);
          const inMonth = isSameMonth(date, selectedDate);
          const today = isToday(date);

          return (
            <div
              key={i}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, date)}
              onClick={() => onDateChange(date)}
              className={cn(
                "min-h-[110px] border-b border-r border-border/30 p-2 transition-all duration-150 group hover:bg-muted/20 cursor-pointer relative",
                !inMonth && "opacity-30",
                today && "bg-primary/[0.02] hover:bg-primary/[0.04]"
              )}
            >
              {/* Top gradient for today */}
              {today && (
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
              )}

              <div className={cn(
                "text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full mb-1.5 transition-all",
                today
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/30"
                  : inMonth
                    ? "text-foreground/80 group-hover:text-foreground"
                    : "text-muted-foreground/50"
              )}>
                {format(date, 'd')}
              </div>

              <div className="space-y-0.5">
                {daySlots.slice(0, 3).map(slot => (
                  <div
                    key={slot.id}
                    onClick={(e) => { e.stopPropagation(); onSlotClick(slot); }}
                    className="px-1.5 py-0.5 text-[10px] font-bold rounded-md truncate cursor-pointer hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all duration-150 flex items-center gap-1 shadow-sm"
                    style={{
                      backgroundColor: slot.color + '18',
                      borderLeft: `2.5px solid ${slot.color}`,
                      color: slot.color,
                    }}
                  >
                    <span className="text-[8px] font-bold opacity-70 flex-shrink-0">{formatTimeDisplay(slot.startTime)}</span>
                    <span className="truncate">{slot.title}</span>
                  </div>
                ))}
                {daySlots.length > 3 && (
                  <div className="flex items-center gap-1 px-1.5 py-0.5">
                    <div className="flex -space-x-1">
                      {daySlots.slice(3, 6).map(s => (
                        <div key={s.id} className="w-2 h-2 rounded-full border border-background" style={{ backgroundColor: s.color }} />
                      ))}
                    </div>
                    <span className="text-[9px] font-bold text-primary/70">+{daySlots.length - 3}</span>
                  </div>
                )}
              </div>

              {/* Hover indicator */}
              <div className="absolute inset-0 rounded-none pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-[inset_0_0_0_1px] shadow-primary/10" />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthView;
