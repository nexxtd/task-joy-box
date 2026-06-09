import React, { useRef, useState, useCallback, useEffect } from 'react';
import { format, isSameDay } from 'date-fns';
import { CalendarSlot } from '@/types/calendar';
import { cn } from '@/lib/utils';
import {
  HOUR_HEIGHT, START_HOUR, END_HOUR,
  timeToMinutes, topForTime, timeForPosition,
  slotHeight, formatTimeDisplay, generateId,
} from '@/utils/calendarUtils';

interface DayViewProps {
  date: Date;
  slots: CalendarSlot[];
  onSlotsChange: (slots: CalendarSlot[]) => void;
  onSlotClick: (slot: CalendarSlot) => void;
  onSlotDrop: (date: string, startTime: string, dragData: any) => void;
}

const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

const DayView: React.FC<DayViewProps> = ({ date, slots, onSlotsChange, onSlotClick, onSlotDrop }) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{ slotId: string; startY: number; origStart: string; origEnd: string } | null>(null);
  const [resizing, setResizing] = useState<{ slotId: string; startY: number; origEnd: string } | null>(null);
  const [dropHighlight, setDropHighlight] = useState<{ y: number; time: string } | null>(null);
  const [preview, setPreview] = useState<{ start: string; end: string; title: string; color: string } | null>(null);
  const now = new Date();

  const daySlots = slots
    .filter(s => s.date === format(date, 'yyyy-MM-dd'))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  const handleGridDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top + gridRef.current.scrollTop;
    const time = timeForPosition(y, 0);
    setDropHighlight({ y, time });

    try {
      const data = JSON.parse(e.dataTransfer.getData('application/x-calendar-item'));
      if (data) {
        const dur = data.duration || 30;
        const endMin = timeToMinutes(time) + dur;
        const endH = Math.floor(endMin / 60) % 24;
        const endM = endMin % 60;
        const endTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
        setPreview({
          start: time,
          end: endTime,
          title: data.title || 'New Slot',
          color: data.color || '#4f46e5',
        });
      }
    } catch {}
  };

  const handleGridDragLeave = () => {
    setDropHighlight(null);
    setPreview(null);
  };

  const handleGridDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top + gridRef.current.scrollTop;
    const time = timeForPosition(y, 0);

    try {
      const raw = e.dataTransfer.getData('application/x-calendar-item');
      const data = JSON.parse(raw);
      onSlotDrop(format(date, 'yyyy-MM-dd'), time, data);
    } catch {}

    setDropHighlight(null);
    setPreview(null);
  };

  const handleSlotMouseDown = (e: React.MouseEvent, slot: CalendarSlot) => {
    if ((e.target as HTMLElement).dataset.resize) {
      e.preventDefault();
      setResizing({ slotId: slot.id, startY: e.clientY, origEnd: slot.endTime });
      return;
    }
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    setDragging({ slotId: slot.id, startY: e.clientY, origStart: slot.startTime, origEnd: slot.endTime });
  };

  useEffect(() => {
    if (!dragging) return;
    const handleMouseMove = (e: MouseEvent) => {};
    const handleMouseUp = (e: MouseEvent) => {
      if (!dragging || !gridRef.current) { setDragging(null); return; }
      const rect = gridRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top + gridRef.current.scrollTop;
      const newStart = timeForPosition(y, 0);
      const dur = timeToMinutes(dragging.origEnd) - timeToMinutes(dragging.origStart);
      const endMin = timeToMinutes(newStart) + dur;
      const endH = Math.floor(endMin / 60) % 24;
      const endM = endMin % 60;
      const newEnd = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
      onSlotsChange(slots.map(s =>
        s.id === dragging.slotId ? { ...s, startTime: newStart, endTime: newEnd } : s
      ));
      setDragging(null);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, slots, onSlotsChange]);

  useEffect(() => {
    if (!resizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!gridRef.current || !resizing) return;
      const rect = gridRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top + gridRef.current.scrollTop;
      const newEnd = timeForPosition(y, 0);
      const slot = slots.find(s => s.id === resizing.slotId);
      if (!slot) return;
      const minEnd = timeToMinutes(slot.startTime) + 5;
      const newEndMin = Math.max(minEnd, timeToMinutes(newEnd));
      const endH = Math.floor(newEndMin / 60) % 24;
      const endM = newEndMin % 60;
      onSlotsChange(slots.map(s =>
        s.id === resizing.slotId ? { ...s, endTime: `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}` } : s
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
      <div className="flex-1 overflow-y-auto relative" ref={gridRef}
        onDragOver={handleGridDragOver}
        onDragLeave={handleGridDragLeave}
        onDrop={handleGridDrop}
      >
        <div className="absolute inset-0 pointer-events-none z-20">
          {isSameDay(date, now) && (
            <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: `${currentTop}px` }}>
              <div className="h-0.5 bg-red-500 relative">
                <div className="absolute -left-1 -top-1.5 w-3 h-3 bg-red-500 rounded-full shadow-md" />
              </div>
            </div>
          )}
          {preview && dropHighlight && (
            <div
              className="absolute left-20 right-2 rounded-lg border-2 border-dashed border-primary/50 bg-primary/10 z-10 flex items-center justify-center"
              style={{
                top: `${topForTime(preview.start)}px`,
                height: `${slotHeight(timeToMinutes(preview.end) - timeToMinutes(preview.start))}px`,
              }}
            >
              <span className="text-[10px] font-bold text-primary bg-background/80 px-2 py-0.5 rounded">
                {formatTimeDisplay(preview.start)} → {formatTimeDisplay(preview.end)}
              </span>
            </div>
          )}
        </div>

        <div className="relative min-h-full">
          {HOURS.map(hour => (
            <div key={hour} className="flex border-b border-border/30">
              <div className="w-20 flex-shrink-0 text-right pr-3 pt-0 relative" style={{ height: `${HOUR_HEIGHT}px` }}>
                <span className="text-[10px] font-bold text-muted-foreground -mt-2 absolute right-3 top-0">
                  {hour === 0 ? '' : format(new Date().setHours(hour, 0, 0, 0), 'ha')}
                </span>
              </div>
              <div className="flex-1 relative border-l border-border/30" style={{ height: `${HOUR_HEIGHT}px` }}>
                {hour % 1 === 0 && (
                  <div className="absolute inset-0 border-b border-border/20" style={{ top: '50%' }} />
                )}
              </div>
            </div>
          ))}

          {computeOverlaps(daySlots).map((group, gi) =>
            group.map((slot, si) => {
              const top = topForTime(slot.startTime);
              const dur = timeToMinutes(slot.endTime) - timeToMinutes(slot.startTime);
              const height = slotHeight(dur);
              const total = group.length;
              const width = Math.max(60, (100 / total) - 2);
              const left = 2 + (si * (100 / total));

              return (
                <div
                  key={slot.id}
                  onMouseDown={(e) => handleSlotMouseDown(e, slot)}
                  onClick={() => onSlotClick(slot)}
                  className="absolute rounded-lg border cursor-pointer overflow-hidden transition-all hover:z-30 hover:opacity-90 select-none"
                  style={{
                    top: `${top}px`,
                    height: `${Math.max(height, 18)}px`,
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: slot.color + '22',
                    borderColor: slot.color,
                    borderLeftWidth: '3px',
                    borderLeftColor: slot.color,
                    zIndex: 10 + si,
                  }}
                >
                  <div className="px-1.5 py-0.5 h-full flex flex-col justify-center">
                    <p className="text-[10px] font-bold text-foreground leading-tight truncate">{slot.title}</p>
                    {height > 30 && (
                      <p className="text-[8px] text-muted-foreground leading-tight">
                        {formatTimeDisplay(slot.startTime)} – {formatTimeDisplay(slot.endTime)}
                      </p>
                    )}
                  </div>
                  <div
                    data-resize
                    className="absolute bottom-0 left-0 right-0 h-2 cursor-s-resize hover:bg-foreground/10"
                  />
                </div>
              );
            })
          )}
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

export default DayView;
