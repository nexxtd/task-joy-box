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
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const now = currentTime;

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

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
    <div className="flex flex-col h-full overflow-hidden bg-gradient-to-b from-background to-muted/5">
      {/* Day headers */}
      <div className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-border/60 bg-gradient-to-r from-muted/30 via-background/80 to-muted/30 flex-shrink-0 backdrop-blur-sm">
        <div className="p-2 border-r border-border/20" />
        {weekDays.map((day, i) => (
          <div key={i} className={cn(
            "p-3 text-center border-r border-border/20 relative",
            isToday(day) && "bg-gradient-to-b from-primary/[0.04] to-transparent"
          )}>
            <p className={cn(
              "text-[10px] font-bold uppercase tracking-[0.1em] transition-colors",
              isToday(day) ? "text-primary" : "text-muted-foreground/70"
            )}>
              {format(day, 'EEE')}
            </p>
            <p className={cn(
              "text-sm font-bold mt-1 transition-all",
              isToday(day)
                ? "bg-primary text-primary-foreground w-8 h-8 rounded-full mx-auto flex items-center justify-center shadow-md shadow-primary/30 ring-2 ring-primary/20"
                : "text-foreground/80"
            )}>
              {format(day, 'd')}
            </p>
            {isToday(day) && (
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-6 h-0.5 bg-primary rounded-full" />
            )}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto relative" ref={gridRef}>
        {isToday(selectedDate) && (
          <div className="absolute left-[70px] right-0 z-20 pointer-events-none" style={{ top: `${currentTop}px` }}>
            <div className="h-[3px] bg-gradient-to-r from-red-500 via-red-500/80 to-transparent relative shadow-lg shadow-red-500/40 ml-2">
              <div className="absolute -left-[5px] -top-[5px] w-[13px] h-[13px] bg-red-500 rounded-full shadow-[0_0_12px_rgba(239,68,68,0.6)]" />
            </div>
          </div>
        )}

        <div className="relative min-h-full">
          {HOURS.map(hour => (
            <div key={hour} className="grid grid-cols-[70px_repeat(7,1fr)] border-b border-border/20">
              <div className="relative flex items-start justify-end" style={{ height: `${HOUR_HEIGHT}px` }}>
                <span className="absolute -top-2.5 right-2 text-[11px] font-semibold text-muted-foreground/70 select-none">
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
                      "border-l border-border/20 relative transition-colors group/col",
                      isToday(day) && "bg-primary/[0.015]",
                      isDropTarget && "bg-primary/10"
                    )}
                    style={{ height: `${HOUR_HEIGHT}px` }}
                    onDragOver={(e) => handleColumnDragOver(e, day)}
                    onDragLeave={handleColumnDragLeave}
                    onDrop={(e) => handleColumnDrop(e, day)}
                  >
                    <div className="absolute inset-0 border-b border-border/10" style={{ top: '50%' }} />
                    {isDropTarget && (
                      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
                    )}
                    <div className="opacity-0 group-hover/col:opacity-100 absolute inset-0 bg-gradient-to-b from-primary/[0.01] to-transparent pointer-events-none transition-opacity duration-200" />

                    {/* Preview */}
                    {preview && preview.date === dateStr && timeToMinutes(preview.start) >= timeToMinutes(`${hour.toString().padStart(2, '0')}:00`) &&
                      timeToMinutes(preview.start) < timeToMinutes(`${hour.toString().padStart(2, '0')}:00`) + 60 && (
                      <div
                        className="absolute left-1 right-1 z-10 rounded-lg border-2 border-primary/50 bg-primary/15 backdrop-blur-sm shadow-lg flex flex-col justify-center px-2"
                        style={{
                          top: `${topForTime(preview.start) - topForTime(`${hour.toString().padStart(2, '0')}:00`)}px`,
                          height: `${slotHeight(timeToMinutes(preview.end) - timeToMinutes(preview.start))}px`,
                        }}
                      >
                        <p className="text-xs font-bold text-primary truncate leading-snug">{preview.title}</p>
                        <p className="text-[10px] font-medium text-primary/70">{formatTimeDisplay(preview.start)}</p>
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
                    className="absolute rounded-lg border-2 cursor-pointer overflow-hidden transition-all duration-150 hover:shadow-lg hover:z-30 hover:opacity-90 select-none shadow-sm"
                    style={{
                      top: `${top}px`,
                      height: `${Math.max(height, 22)}px`,
                      left: `calc(${gridLeft}px + ${colIndex} * ${colWidth} + ${left}% + 4px)`,
                      width: `calc(${colWidth} * ${width / 100} - 8px)`,
                      backgroundColor: slot.color + '18',
                      borderColor: slot.color,
                      borderLeftWidth: '4px',
                      borderLeftColor: slot.color,
                      zIndex: 10 + si,
                    }}
                  >
                    <div className="px-2 py-1 h-full flex flex-col justify-center gap-0.5">
                      <p className="text-xs font-bold text-foreground leading-snug truncate">{slot.title}</p>
                      {height > 34 && (
                        <p className="text-[10px] font-semibold text-muted-foreground leading-tight">
                          {formatTimeDisplay(slot.startTime)} – {formatTimeDisplay(slot.endTime)}
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
                      className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize hover:bg-foreground/10 rounded-b-lg"
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
