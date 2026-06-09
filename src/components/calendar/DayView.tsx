import React, { useRef, useState, useEffect } from 'react';
import { format, isSameDay } from 'date-fns';
import { CalendarSlot } from '@/types/calendar';
import { cn } from '@/lib/utils';
import {
  HOUR_HEIGHT, START_HOUR, END_HOUR,
  timeToMinutes, topForTime, timeForPosition,
  slotHeight, formatTimeDisplay,
} from '@/utils/calendarUtils';

interface DayViewProps {
  date: Date;
  slots: CalendarSlot[];
  onSlotsChange: (slots: CalendarSlot[]) => void;
  onSlotClick: (slot: CalendarSlot) => void;
  onSlotDrop: (date: string, startTime: string, dragData: any) => void;
}

const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const DRAG_THRESHOLD = 6;

const DayView: React.FC<DayViewProps> = ({ date, slots, onSlotsChange, onSlotClick, onSlotDrop }) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ slotId: string; origStart: string; origEnd: string; startY: number; moved: boolean } | null>(null);
  const resizeRef = useRef<{ slotId: string; origEnd: string; startY: number } | null>(null);
  const wasDragRef = useRef(false);
  const [dragGhost, setDragGhost] = useState<{ start: string; end: string; top: number; height: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const now = currentTime;

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  const daySlots = slots
    .filter(s => s.date === format(date, 'yyyy-MM-dd'))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  // ── HTML5 drag-drop from sidebar ──
  const [dropHighlight, setDropHighlight] = useState<{ time: string } | null>(null);
  const [dropPreview, setDropPreview] = useState<{ start: string; end: string; title: string; color: string } | null>(null);

  const handleGridDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top + gridRef.current.scrollTop;
    const time = timeForPosition(y, 0);
    setDropHighlight({ time });
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/x-calendar-item'));
      if (data) {
        const dur = data.duration || 30;
        const endMin = timeToMinutes(time) + dur;
        setDropPreview({
          start: time,
          end: `${Math.floor(endMin / 60) % 24}:${(endMin % 60).toString().padStart(2, '0')}`,
          title: data.title || 'New Slot',
          color: data.color || '#4f46e5',
        });
      }
    } catch {}
  };

  const handleGridDragLeave = () => { setDropHighlight(null); setDropPreview(null); };

  const handleGridDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropHighlight(null);
    setDropPreview(null);
    if (!gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    const y = e.clientY - rect.top + gridRef.current.scrollTop;
    const time = timeForPosition(y, 0);
    try {
      const raw = e.dataTransfer.getData('application/x-calendar-item');
      onSlotDrop(format(date, 'yyyy-MM-dd'), time, JSON.parse(raw));
    } catch {}
  };

  // ── Internal slot drag ──
  const handleSlotMouseDown = (e: React.MouseEvent, slot: CalendarSlot) => {
    if ((e.target as HTMLElement).dataset.resize) {
      e.preventDefault();
      e.stopPropagation();
      resizeRef.current = { slotId: slot.id, origEnd: slot.endTime, startY: e.clientY };
      setResizing(true);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    wasDragRef.current = false;
    const slotEl = e.currentTarget as HTMLElement;
    slotEl.style.cursor = 'grabbing';
    dragRef.current = {
      slotId: slot.id, origStart: slot.startTime, origEnd: slot.endTime,
      startY: e.clientY, moved: false,
    };
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (resizeRef.current) {
        if (!gridRef.current) return;
        const rect = gridRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top + gridRef.current.scrollTop;
        const newEnd = timeForPosition(y, 0);
        const slot = slots.find(s => s.id === resizeRef.current!.slotId);
        if (!slot) return;
        const minEnd = timeToMinutes(slot.startTime) + 5;
        const newEndMin = Math.max(minEnd, timeToMinutes(newEnd));
        onSlotsChange(slots.map(s =>
          s.id === resizeRef.current!.slotId
            ? { ...s, endTime: `${Math.floor(newEndMin / 60) % 24}:${(newEndMin % 60).toString().padStart(2, '0')}` }
            : s
        ));
        return;
      }

      if (!dragRef.current) return;
      if (Math.abs(e.clientY - dragRef.current.startY) > DRAG_THRESHOLD) {
        dragRef.current.moved = true;
        wasDragRef.current = true;
      }
      if (!dragRef.current.moved) return;
      if (!gridRef.current) return;

      const rect = gridRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top + gridRef.current.scrollTop;
      const time = timeForPosition(y, 0);
      const dur = timeToMinutes(dragRef.current.origEnd) - timeToMinutes(dragRef.current.origStart);
      const endMin = timeToMinutes(time) + dur;
      setDragGhost({
        start: time,
        end: `${Math.floor(endMin / 60) % 24}:${(endMin % 60).toString().padStart(2, '0')}`,
        top: topForTime(time),
        height: slotHeight(dur),
      });
    };

    const onMouseUp = (e: MouseEvent) => {
      if (resizeRef.current) {
        resizeRef.current = null;
        setResizing(false);
        return;
      }

      const drag = dragRef.current;
      dragRef.current = null;
      setDragGhost(null);

      if (!drag?.moved || !gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      const y = e.clientY - rect.top + gridRef.current.scrollTop;
      const newStart = timeForPosition(y, 0);
      const dur = timeToMinutes(drag.origEnd) - timeToMinutes(drag.origStart);
      const endMin = timeToMinutes(newStart) + dur;
      onSlotsChange(slots.map(s =>
        s.id === drag.slotId
          ? { ...s, startTime: newStart, endTime: `${Math.floor(endMin / 60) % 24}:${(endMin % 60).toString().padStart(2, '0')}` }
          : s
      ));
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [slots, onSlotsChange]);

  const currentTop = topForTime(format(now, 'HH:mm'));

  return (
    <div className="flex flex-col h-full overflow-hidden select-none">
      <div className="flex-1 overflow-y-auto relative rounded-lg" ref={gridRef}
        onDragOver={handleGridDragOver}
        onDragLeave={handleGridDragLeave}
        onDrop={handleGridDrop}
      >
        <div className="absolute inset-0 pointer-events-none z-20">
          {isSameDay(date, now) && (
            <div className="absolute left-[80px] right-0 z-20 pointer-events-none" style={{ top: `${currentTop}px` }}>
              <div className="h-[3px] bg-gradient-to-r from-red-500 via-red-500/80 to-transparent relative shadow-lg shadow-red-500/40">
                <div className="absolute -left-[5px] -top-[5px] w-[13px] h-[13px] bg-red-500 rounded-full shadow-[0_0_12px_rgba(239,68,68,0.6)]" />
              </div>
            </div>
          )}

          {dropPreview && dropHighlight && (
            <div
              className="absolute left-20 right-2 rounded-lg border-2 border-dashed border-primary/50 bg-primary/10 flex items-center justify-center z-10"
              style={{
                top: `${topForTime(dropPreview.start)}px`,
                height: `${slotHeight(timeToMinutes(dropPreview.end) - timeToMinutes(dropPreview.start))}px`,
              }}
            >
              <span className="text-xs font-bold text-primary bg-background/80 px-2 py-0.5 rounded">
                {formatTimeDisplay(dropPreview.start)} → {formatTimeDisplay(dropPreview.end)}
              </span>
            </div>
          )}

          {dragGhost && (
            <div
              className="absolute left-20 right-2 z-30 rounded-xl border-2 border-primary shadow-xl bg-primary/15 backdrop-blur-md"
              style={{ top: `${dragGhost.top}px`, height: `${Math.max(dragGhost.height, 22)}px`, pointerEvents: 'none' }}
            >
              <div className="px-3 py-1.5 h-full flex flex-col justify-center gap-0.5">
                <p className="text-sm font-bold text-primary truncate">
                  {slots.find(s => s.id === dragRef.current?.slotId)?.title || 'Moving...'}
                </p>
                <p className="text-xs font-medium text-primary/80">{formatTimeDisplay(dragGhost.start)}</p>
              </div>
            </div>
          )}

          {resizing && resizeRef.current && (
            <div
              className="absolute left-20 right-2 z-30 border-t-2 border-dashed border-primary/50"
              style={{ top: `${topForTime(slots.find(s => s.id === resizeRef.current!.slotId)?.endTime || '00:00')}px` }}
            />
          )}
        </div>

        <div className="relative min-h-full">
          {HOURS.map(hour => (
            <div key={hour} className="flex border-b border-border/20">
              <div className="w-20 flex-shrink-0 relative flex items-start justify-end" style={{ height: `${HOUR_HEIGHT}px` }}>
                <span className="text-[11px] font-semibold text-muted-foreground/70 -mt-2.5 pr-4 select-none">
                  {hour === 0 ? '' : format(new Date().setHours(hour, 0, 0, 0), 'ha')}
                </span>
              </div>
              <div className="flex-1 relative border-l border-border/20" style={{ height: `${HOUR_HEIGHT}px` }}>
                <div className="absolute inset-0 border-b border-border/10" style={{ top: '50%' }} />
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
              const isDragging = dragRef.current?.slotId === slot.id && (dragRef.current?.moved ?? false);

              return (
                <div
                  key={slot.id}
                  onMouseDown={(e) => handleSlotMouseDown(e, slot)}
                  onClick={() => {
                    if (wasDragRef.current) { wasDragRef.current = false; return; }
                    onSlotClick(slot);
                  }}
                  className={cn(
                    "absolute rounded-lg border-2 overflow-hidden select-none shadow-sm",
                    isDragging ? "opacity-20 cursor-grabbing" : "cursor-pointer hover:shadow-lg hover:opacity-90",
                    "transition-shadow duration-150",
                  )}
                  style={{
                    top: `${top}px`,
                    height: `${Math.max(height, 22)}px`,
                    left: `${left}%`,
                    width: `${width}%`,
                    backgroundColor: slot.color + '18',
                    borderColor: slot.color,
                    borderLeftWidth: '4px',
                    borderLeftColor: slot.color,
                    zIndex: isDragging ? 5 : 10 + si,
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
                    className="absolute bottom-0 left-0 right-0 h-3 cursor-s-resize hover:bg-foreground/10 rounded-b-lg"
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
