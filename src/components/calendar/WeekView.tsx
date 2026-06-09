import React, { useRef, useState, useEffect } from 'react';
import { format, startOfWeek, addDays, isSameDay, isToday } from 'date-fns';
import { CalendarSlot } from '@/types/calendar';
import { cn } from '@/lib/utils';
import {
  HOUR_HEIGHT, START_HOUR, END_HOUR,
  timeToMinutes, topForTime, timeForPosition,
  slotHeight, formatTimeDisplay,
} from '@/utils/calendarUtils';

interface WeekViewProps {
  selectedDate: Date;
  slots: CalendarSlot[];
  onSlotsChange: (slots: CalendarSlot[]) => void;
  onSlotClick: (slot: CalendarSlot) => void;
  onSlotDrop: (date: string, startTime: string, dragData: any) => void;
}

const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

const WeekView: React.FC<WeekViewProps> = ({ selectedDate, slots, onSlotsChange, onSlotClick, onSlotDrop }) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const [resizing, setResizing] = useState<{ slotId: string; origEnd: string; date: string; startY: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ date: string; time: string } | null>(null);
  const [preview, setPreview] = useState<{ date: string; start: string; end: string; title: string; color: string } | null>(null);
  const now = new Date();

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getSlotsForDay = (date: Date) =>
    slots
      .filter(s => s.date === format(date, 'yyyy-MM-dd'))
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const handleColumnDragOver = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (!gridRef.current) return;
    const col = e.currentTarget as HTMLElement;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + col.scrollTop;
    const time = timeForPosition(y, 0);
    const dateStr = format(date, 'yyyy-MM-dd');
    setDropTarget({ date: dateStr, time });

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/x-calendar-item'));
      if (data) {
        const dur = data.duration || 30;
        const endMin = timeToMinutes(time) + dur;
        setPreview({
          date: dateStr,
          start: time,
          end: `${Math.floor(endMin / 60) % 24}:${(endMin % 60).toString().padStart(2, '0')}`,
          title: data.title || 'New Slot',
          color: data.color || '#4f46e5',
        });
      }
    } catch {}
  };

  const handleColumnDragLeave = () => {
    setDropTarget(null);
    setPreview(null);
  };

  const handleColumnDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    if (!gridRef.current) return;
    const col = e.currentTarget as HTMLElement;
    const rect = col.getBoundingClientRect();
    const y = e.clientY - rect.top + col.scrollTop;
    const time = timeForPosition(y, 0);
    const dateStr = format(date, 'yyyy-MM-dd');

    try {
      const raw = e.dataTransfer.getData('application/x-calendar-item');
      const data = JSON.parse(raw);
      onSlotDrop(dateStr, time, data);
    } catch {}

    setDropTarget(null);
    setPreview(null);
  };

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!gridRef.current || !resizing) return;
      const slot = slots.find(s => s.id === resizing.slotId);
      if (!slot) return;
      const rect = gridRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top + gridRef.current.scrollTop;
      const newEnd = timeForPosition(y, 0);
      const minEnd = timeToMinutes(slot.startTime) + 5;
      const newEndMin = Math.max(minEnd, timeToMinutes(newEnd));
      onSlotsChange(slots.map(s =>
        s.id === resizing.slotId
          ? { ...s, endTime: `${Math.floor(newEndMin / 60) % 24}:${(newEndMin % 60).toString().padStart(2, '0')}` }
          : s
      ));
    };
    const handleMouseUp = () => setResizing(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, slots, onSlotsChange]);

  const currentTop = topForTime(format(now, 'HH:mm'));

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-border bg-muted/20 flex-shrink-0">
        <div className="p-2" />
        {weekDays.map((day, i) => (
          <div key={i} className={cn(
            "p-2 text-center border-l border-border",
            isToday(day) && "bg-primary/5"
          )}>
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-wider",
              isToday(day) ? "text-primary" : "text-muted-foreground"
            )}>
              {format(day, 'EEE')}
            </p>
            <p className={cn(
              "text-sm font-bold mt-0.5",
              isToday(day) && "bg-primary text-primary-foreground w-8 h-8 rounded-full mx-auto flex items-center justify-center"
            )}>
              {format(day, 'd')}
            </p>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto relative" ref={gridRef}>
        {isToday(selectedDate) && (
          <div className="absolute left-[70px] right-0 z-20 pointer-events-none" style={{ top: `${currentTop}px` }}>
            <div className="h-0.5 bg-red-500 relative ml-2">
              <div className="absolute -left-1 -top-1.5 w-3 h-3 bg-red-500 rounded-full shadow-md" />
            </div>
          </div>
        )}

        <div className="relative min-h-full">
          {HOURS.map(hour => (
            <div key={hour} className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-border/30">
              <div className="relative" style={{ height: `${HOUR_HEIGHT}px` }}>
                <span className="absolute -top-2 right-2 text-[10px] font-bold text-muted-foreground">
                  {hour === 0 ? '' : format(new Date().setHours(hour, 0, 0, 0), 'ha')}
                </span>
              </div>
              {weekDays.map((day, di) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isDropTarget = dropTarget?.date === dateStr;
                return (
                  <div
                    key={di}
                    className={cn(
                      "border-l border-border/30 relative transition-colors",
                      isToday(day) && "bg-primary/[0.02]",
                      isDropTarget && "bg-primary/10"
                    )}
                    style={{ height: `${HOUR_HEIGHT}px` }}
                    onDragOver={(e) => handleColumnDragOver(e, day)}
                    onDragLeave={handleColumnDragLeave}
                    onDrop={(e) => handleColumnDrop(e, day)}
                  >
                    {hour % 1 === 0 && <div className="absolute inset-0 border-b border-border/20" style={{ top: '50%' }} />}

                    {/* Preview */}
                    {preview && preview.date === dateStr && timeToMinutes(preview.start) >= timeToMinutes(`${hour.toString().padStart(2, '0')}:00`) &&
                      timeToMinutes(preview.start) < timeToMinutes(`${hour.toString().padStart(2, '0')}:00`) + 60 && (
                      <div
                        className="absolute left-1 right-1 rounded border-2 border-dashed border-primary/50 bg-primary/10 z-10 flex items-center justify-center"
                        style={{
                          top: `${topForTime(preview.start) - topForTime(`${hour.toString().padStart(2, '0')}:00`)}px`,
                          height: `${slotHeight(timeToMinutes(preview.end) - timeToMinutes(preview.start))}px`,
                        }}
                      >
                        <span className="text-[8px] font-bold text-primary bg-background/80 px-1 rounded">
                          {formatTimeDisplay(preview.start)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Slots */}
          {weekDays.map((day) => {
            const daySlots = getSlotsForDay(day);
            return computeOverlaps(daySlots).map((group, gi) =>
              group.map((slot, si) => {
                const top = topForTime(slot.startTime);
                const dur = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime);
                const height = slotHeight(dur);
                const total = group.length;
                const width = Math.max(55, (95 / total));
                const left = si * width;

                const colIndex = weekDays.indexOf(day);
                const gridLeft = 70;
                const colWidth = `calc((100% - 70px) / 7)`;

                return (
                  <div
                    key={slot.id}
                    onClick={() => onSlotClick(slot)}
                    className="absolute rounded-lg border cursor-pointer overflow-hidden transition-all hover:z-30 select-none"
                    style={{
                      top: `${top}px`,
                      height: `${Math.max(height, 18)}px`,
                      left: `calc(${gridLeft}px + ${colIndex} * ${colWidth} + ${left}% + 4px)`,
                      width: `calc(${colWidth} * ${width / 100} - 8px)`,
                      backgroundColor: slot.color + '22',
                      borderColor: slot.color,
                      borderLeftWidth: '3px',
                      borderLeftColor: slot.color,
                      zIndex: 10 + si,
                    }}
                  >
                    <div className="px-1 py-0.5 h-full flex flex-col justify-center">
                      <p className="text-[9px] font-bold text-foreground leading-tight truncate">{slot.title}</p>
                      {height > 28 && (
                        <p className="text-[7px] text-muted-foreground leading-tight">
                          {formatTimeDisplay(slot.startTime)}
                        </p>
                      )}
                    </div>
                    <div
                      data-resize
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setResizing({ slotId: slot.id, origEnd: slot.endTime, date: slot.date, startY: e.clientY });
                      }}
                      className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize hover:bg-foreground/10"
                    />
                  </div>
                );
              })
            );
          })}
        </div>
      </div>
    </div>
  );
};

function computeOverlaps(slots: CalendarSlot[]): CalendarSlot[][] {
  const groups: CalendarSlot[][] = [];
  let i = 0;
  while (i < slots.length) {
    const group: CalendarSlot[] = [slots[i]];
    let j = i + 1;
    while (j < slots.length && timeToMinutes(slots[j].startTime) < timeToMinutes(slots[i].endTime)) {
      group.push(slots[j]);
      j++;
    }
    groups.push(group);
    i = j;
  }
  return groups;
}

export default WeekView;
