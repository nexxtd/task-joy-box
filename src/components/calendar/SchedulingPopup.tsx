import React, { useState } from 'react';
import { X, Clock, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalendarSlot } from '@/types/calendar';
import { generateId, formatTimeDisplay, RECURRING_OPTIONS } from '@/utils/calendarUtils';

interface SchedulingPopupProps {
  open: boolean;
  type: 'task' | 'goal' | 'habit' | 'fixed-event' | 'break' | null;
  date: string;
  startTime: string;
  endTime: string;
  linkedItem?: any;
  subItems?: { id: string; title: string }[];
  onClose: () => void;
  onSave: (slot: CalendarSlot) => void;
}

const SchedulingPopup: React.FC<SchedulingPopupProps> = ({
  open, type, date, startTime, endTime, linkedItem, subItems, onClose, onSave,
}) => {
  const [name, setName] = useState(linkedItem?.title || '');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30);
  const [recurrence, setRecurrence] = useState<string | null>(null);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [color, setColor] = useState('#4f46e5');
  const [icon, setIcon] = useState('');

  React.useEffect(() => {
    if (linkedItem?.title) setName(linkedItem.title);
    if (linkedItem?.duration) setDuration(linkedItem.duration);
    if (linkedItem?.color) setColor(linkedItem.color);
  }, [linkedItem]);

  if (!open || !type) return null;

  const handleSave = () => {
    const slot: CalendarSlot = {
      id: generateId(),
      title: name || linkedItem?.title || 'Untitled',
      type: type as CalendarSlot['type'],
      startTime,
      endTime: endTime || startTime,
      date,
      color,
      icon: icon || undefined,
      description: description || undefined,
      recurrence: recurrence as 'daily' | 'weekly' | 'monthly' | null,
      linkedId: linkedItem?.id,
      linkedType: type === 'task' ? 'task' : type === 'goal' ? 'goal' : type === 'habit' ? 'habit' : undefined,
      linkedSubId: selectedSubId || undefined,
      linkedSubType: selectedSubId ? (type === 'task' ? 'subtask' : 'subgoal') : undefined,
      duration,
    };
    onSave(slot);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-bold text-foreground">
            {type === 'fixed-event' ? 'Schedule Fixed Event' :
             type === 'break' ? 'Schedule Break' :
             type === 'task' ? 'Schedule Task' :
             type === 'goal' ? 'Schedule Goal' : 'Schedule Habit'}
          </h3>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {type !== 'fixed-event' && type !== 'break' && (
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                {type === 'task' ? 'Task Name' : type === 'goal' ? 'Goal Name' : 'Habit Name'}
              </label>
              <div className="px-3 py-2.5 bg-muted/50 rounded-xl border border-border text-sm font-medium text-foreground">
                {linkedItem?.title || name}
              </div>
            </div>
          )}

          {type === 'fixed-event' && (
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Event Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Team Meeting"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}

          {(type === 'fixed-event' || type === 'break') && (
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>
          )}

          {subItems && subItems.length > 0 && (type === 'task' || type === 'goal') && (
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                {type === 'task' ? 'Sub-task to focus on' : 'Sub-goal to focus on'}
              </label>
              <select
                value={selectedSubId || ''}
                onChange={(e) => setSelectedSubId(e.target.value || null)}
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">None — work on main item</option>
                {subItems.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              <Clock className="w-3 h-3 inline mr-1" />
              Duration (minutes)
            </label>
            <div className="flex gap-2">
              {[15, 30, 45, 60, 90, 120].map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={cn(
                    "px-3 py-2 text-xs font-bold rounded-xl border transition-all",
                    duration === d
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/30"
                  )}
                >
                  {d < 60 ? `${d}m` : `${d / 60}h`}
                </button>
              ))}
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Math.max(5, parseInt(e.target.value) || 5))}
                className="w-16 px-2 py-2 bg-background border border-border rounded-xl text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {(type === 'fixed-event' || type === 'break') && (
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Colour
              </label>
              <div className="flex gap-2">
                {['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'].map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 transition-all",
                      color === c ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}

          {(type === 'fixed-event' || type === 'break') && (
            <div>
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Icon
              </label>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="e.g. coffee, meeting, workout"
                className="w-full px-3 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              <RotateCcw className="w-3 h-3 inline mr-1" />
              Recurring
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setRecurrence(null)}
                className={cn(
                  "px-3 py-2 text-xs font-bold rounded-xl border transition-all",
                  !recurrence
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/30"
                )}
              >
                None
              </button>
              {RECURRING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRecurrence(opt.value)}
                  className={cn(
                    "px-3 py-2 text-xs font-bold rounded-xl border transition-all",
                    recurrence === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/30"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl border border-border">
            <Clock className="w-3 h-3 inline mr-1" />
            {formatTimeDisplay(startTime)} → {formatTimeDisplay(addMinutes(startTime, duration))} · {date}
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-bold text-muted-foreground bg-muted rounded-xl hover:bg-muted/80 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 text-sm font-bold text-primary-foreground bg-primary rounded-xl hover:opacity-90 transition-all"
          >
            {type === 'fixed-event' || type === 'break' ? 'Save' : 'Create Slot'}
          </button>
        </div>
      </div>
    </div>
  );
};

function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + mins;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${nh.toString().padStart(2, '0')}:${nm.toString().padStart(2, '0')}`;
}

export default SchedulingPopup;
