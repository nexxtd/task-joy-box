import React, { useState } from 'react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, isSameMonth, isSameDay, isToday,
} from 'date-fns';
import { CalendarSlot } from '@/types/calendar';
import { cn } from '@/lib/utils';
import { timeToMinutes, formatTimeDisplay } from '@/utils/calendarUtils';

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
    e.currentTarget.classList.add('bg-primary/10');
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.currentTarget.classList.remove('bg-primary/10');
  };

  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    e.currentTarget.classList.remove('bg-primary/10');
    try {
      const raw = e.dataTransfer.getData('application/x-calendar-item');
      const data = JSON.parse(raw);
      onSlotDrop(format(date, 'yyyy-MM-dd'), '09:00', data);
    } catch {}
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden border border-border rounded-xl">
      <div className="grid grid-cols-7 border-b border-border bg-muted/20">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="p-3 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
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
              className={cn(
                "min-h-[110px] border-b border-r border-border p-2 transition-colors group",
                !inMonth && "bg-muted/10 opacity-40",
                today && "bg-primary/[0.03]"
              )}
            >
              <div className={cn(
                "text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full mb-1",
                today ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}>
                {format(date, 'd')}
              </div>

              <div className="space-y-0.5">
                {daySlots.slice(0, 3).map(slot => (
                  <div
                    key={slot.id}
                    onClick={() => onSlotClick(slot)}
                    className="px-1.5 py-0.5 text-[9px] font-bold rounded truncate cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1"
                    style={{
                      backgroundColor: slot.color + '22',
                      borderLeft: `2px solid ${slot.color}`,
                    }}
                  >
                    <span className="text-[7px] opacity-60">{formatTimeDisplay(slot.startTime)}</span>
                    <span className="truncate">{slot.title}</span>
                  </div>
                ))}
                {daySlots.length > 3 && (
                  <span className="text-[8px] font-bold text-primary px-1">+{daySlots.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MonthView;
