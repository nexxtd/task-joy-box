import React, { useState } from 'react';
import { X, Clock, RotateCcw, Calendar, Coffee, ListChecks, Target, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalendarSlot } from '@/types/calendar';
import { generateId, formatTimeDisplay, RECURRING_OPTIONS } from '@/utils/calendarUtils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-gradient-to-b from-card to-background rounded-2xl shadow-2xl shadow-black/10 border border-border/60 w-full max-w-md mx-4 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-gradient-to-r from-primary/[0.02] to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10">
              {type === 'fixed-event' ? <Calendar className="w-4 h-4 text-purple-500" /> :
               type === 'break' ? <Coffee className="w-4 h-4 text-cyan-500" /> :
               type === 'task' ? <ListChecks className="w-4 h-4 text-primary" /> :
               type === 'goal' ? <Target className="w-4 h-4 text-emerald-500" /> :
               <Flame className="w-4 h-4 text-orange-500" />}
            </div>
            <h3 className="text-sm font-bold text-foreground">
              {type === 'fixed-event' ? 'Schedule Fixed Event' :
               type === 'break' ? 'Schedule Break' :
               type === 'task' ? 'Schedule Task' :
               type === 'goal' ? 'Schedule Goal' : 'Schedule Habit'}
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {type !== 'fixed-event' && type !== 'break' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] flex items-center gap-1.5">
                <ListChecks className="w-3 h-3" />
                {type === 'task' ? 'Task Name' : type === 'goal' ? 'Goal Name' : 'Habit Name'}
              </label>
              <div className="px-3.5 py-3 bg-muted/30 rounded-xl border border-border/50 text-sm font-medium text-foreground shadow-sm">
                {linkedItem?.title || name}
              </div>
            </div>
          )}

          {type === 'fixed-event' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] flex items-center gap-1.5">
                <Calendar className="w-3 h-3 text-purple-500" />
                Event Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Team Meeting"
                className="w-full px-3.5 py-3 bg-background border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all placeholder:text-muted-foreground/40"
              />
            </div>
          )}

          {(type === 'fixed-event' || type === 'break') && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] flex items-center gap-1.5">
                {type === 'fixed-event' ? <Calendar className="w-3 h-3" /> : <Coffee className="w-3 h-3" />}
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description..."
                rows={2}
                className="w-full px-3.5 py-3 bg-background border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all resize-none placeholder:text-muted-foreground/40"
              />
            </div>
          )}

          {subItems && subItems.length > 0 && (type === 'task' || type === 'goal') && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em]">
                {type === 'task' ? 'Sub-task to focus on' : 'Sub-goal to focus on'}
              </label>
              <Select
                value={selectedSubId || ''}
                onValueChange={v => setSelectedSubId(v || null)}
              >
                <SelectTrigger className="w-full px-3.5 py-3 bg-background border border-border/60 rounded-xl text-sm h-auto">
                  <SelectValue placeholder="None — work on main item" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None — work on main item</SelectItem>
                  {subItems.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] flex items-center gap-1.5">
              <Clock className="w-3 h-3" />
              Duration (minutes)
            </label>
            <div className="flex gap-2 flex-wrap">
              {[15, 30, 45, 60, 90, 120].map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={cn(
                    "px-3.5 py-2 text-xs font-bold rounded-xl border transition-all duration-150",
                    duration === d
                      ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                      : "bg-background text-muted-foreground border-border/60 hover:border-primary/30 hover:text-foreground hover:shadow-sm"
                  )}
                >
                  {d < 60 ? `${d}m` : `${d / 60}h`}
                </button>
              ))}
              <div className="relative">
                <input
                  type="number"
                  value={duration}
                  onChange={(e) => setDuration(Math.max(5, parseInt(e.target.value) || 5))}
                  className="w-16 h-full px-2 py-2 bg-background border border-border/60 rounded-xl text-xs text-center focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
                />
                <span className="absolute -right-3 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/50">min</span>
              </div>
            </div>
          </div>

          {(type === 'fixed-event' || type === 'break') && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full border border-current" style={{ backgroundColor: color }} />
                Colour
              </label>
              <div className="flex gap-2.5 flex-wrap">
                {['#4f46e5', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'].map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      "w-8 h-8 rounded-xl border-2 transition-all duration-150 hover:scale-110 active:scale-95",
                      color === c ? "border-foreground scale-110 shadow-sm" : "border-border/40 hover:border-border"
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          )}

          {(type === 'fixed-event' || type === 'break') && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em]">
                Icon
              </label>
              <input
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="e.g. coffee, meeting, workout"
                className="w-full px-3.5 py-3 bg-background border border-border/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all placeholder:text-muted-foreground/40"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] flex items-center gap-1.5">
              <RotateCcw className="w-3 h-3" />
              Recurring
            </label>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setRecurrence(null)}
                className={cn(
                  "px-3.5 py-2 text-xs font-bold rounded-xl border transition-all duration-150",
                  !recurrence
                    ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                    : "bg-background text-muted-foreground border-border/60 hover:border-primary/30 hover:text-foreground"
                )}
              >
                None
              </button>
              {RECURRING_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setRecurrence(opt.value)}
                  className={cn(
                    "px-3.5 py-2 text-xs font-bold rounded-xl border transition-all duration-150",
                    recurrence === opt.value
                      ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                      : "bg-background text-muted-foreground border-border/60 hover:border-primary/30 hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 px-3.5 py-3 bg-gradient-to-r from-muted/40 to-muted/10 rounded-xl border border-border/50 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5 text-primary/60" />
            <span className="font-medium">{formatTimeDisplay(startTime)}</span>
            <span className="text-muted-foreground/40">→</span>
            <span className="font-medium">{formatTimeDisplay(addMinutes(startTime, duration))}</span>
            <span className="mx-1.5 w-1 h-1 rounded-full bg-muted-foreground/20" />
            <span className="text-[10px] font-medium text-muted-foreground/60">{date}</span>
          </div>
        </div>

        <div className="flex gap-3 px-5 py-4 border-t border-border/60 bg-gradient-to-b from-muted/10 to-transparent">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-bold text-muted-foreground bg-muted/50 rounded-xl hover:bg-muted/80 hover:text-foreground transition-all active:scale-[0.98]"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 text-sm font-bold text-primary-foreground bg-gradient-to-r from-primary to-primary/90 rounded-xl hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.01] active:scale-[0.98] transition-all duration-200"
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
