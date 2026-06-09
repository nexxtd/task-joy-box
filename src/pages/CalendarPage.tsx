import React, { useState, useEffect, useCallback } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import TaskDetailModal from '@/components/TaskDetailModal';
import { Task } from '@/types/board';
import { CalendarSlot, CalendarViewMode, SchedulingPopupData } from '@/types/calendar';
import CalendarSidebar from '@/components/CalendarSidebar';
import DayView from '@/components/calendar/DayView';
import WeekView from '@/components/calendar/WeekView';
import MonthView from '@/components/calendar/MonthView';
import SchedulingPopup from '@/components/calendar/SchedulingPopup';
import {
  ChevronLeft, ChevronRight, Sparkles, X, Sun, Clock, Grid3X3,
  Zap, Calendar as CalendarIcon, ListChecks, Plus, Coffee,
} from 'lucide-react';
import { format, addDays, subDays, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { generateId, formatTimeDisplay, timeToMinutes, addMinutesToTime } from '@/utils/calendarUtils';

type ViewMode = 'day' | 'week' | 'month';

const CalendarPage: React.FC = () => {
  const { user } = useAuth();
  const { board, updateTask, addTask } = useBoardContext();
  const isPro = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('week');

  // Calendar slots state
  const [slots, setSlots] = useState<CalendarSlot[]>([]);

  // Scheduling popup
  const [popup, setPopup] = useState<SchedulingPopupData>({
    open: false, type: null, date: '', startTime: '', endTime: '',
  });
  const [popupSubItems, setPopupSubItems] = useState<{ id: string; title: string }[] | undefined>(undefined);

  // AI panel
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiMode, setAiMode] = useState<'schedule' | 'plan' | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [aiError, setAiError] = useState('');
  const [smartScheduleApplied, setSmartScheduleApplied] = useState(false);

  // Init slots from board tasks that have dueDate
  useEffect(() => {
    const taskSlots: CalendarSlot[] = board.tasks
      .filter(t => t.dueDate && !t.completed)
      .map(t => {
        const start = t.startTime || '09:00';
        const dur = t.duration || 60;
        const endM = timeToMinutes(start) + dur;
        return {
          id: `task-${t.id}`,
          title: t.title,
          type: 'task' as const,
          startTime: start,
          endTime: `${Math.floor(endM / 60) % 24}:${(endM % 60).toString().padStart(2, '0')}`,
          date: t.dueDate!,
          color: t.color || '#4f46e5',
          description: t.description,
          recurrence: (t.recurrencePattern as 'daily' | 'weekly' | 'monthly' | null) || null,
          linkedId: t.id,
          linkedType: 'task',
          duration: dur,
        };
      });
    setSlots(prev => {
      const nonTask = prev.filter(s => s.type !== 'task');
      return [...nonTask, ...taskSlots];
    });
  }, [board.tasks]);

  const currentTask = selectedTask ? board.tasks.find(t => t.id === selectedTask.id) : null;

  // Navigation
  const goToday = () => setSelectedDate(new Date());
  const goPrev = () => {
    if (viewMode === 'day') setSelectedDate(subDays(selectedDate, 1));
    else if (viewMode === 'week') setSelectedDate(subWeeks(selectedDate, 1));
    else setSelectedDate(subMonths(selectedDate, 1));
  };
  const goNext = () => {
    if (viewMode === 'day') setSelectedDate(addDays(selectedDate, 1));
    else if (viewMode === 'week') setSelectedDate(addWeeks(selectedDate, 1));
    else setSelectedDate(addMonths(selectedDate, 1));
  };

  const headerTitle = () => {
    if (viewMode === 'day') return format(selectedDate, 'EEEE, MMMM d');
    if (viewMode === 'week') return `Week of ${format(selectedDate, 'MMM d')}`;
    return format(selectedDate, 'MMMM yyyy');
  };

  // Handle slot drop from sidebar or drag
  const handleSlotDrop = useCallback((date: string, startTime: string, dragData: any) => {
    const type = dragData.type || 'task';
    const endM = timeToMinutes(startTime) + (dragData.duration || 30);
    const endTime = `${Math.floor(endM / 60) % 24}:${(endM % 60).toString().padStart(2, '0')}`;

    let subItems: { id: string; title: string }[] | undefined;

    if (type === 'task' && dragData.subtasks) {
      subItems = dragData.subtasks.map((s: any) => ({ id: s.id, title: s.title }));
    }
    if (type === 'goal' && dragData.subGoals) {
      subItems = dragData.subGoals.map((s: any) => ({ id: s.id, title: s.title }));
    }

    setPopupSubItems(subItems);
    setPopup({
      open: true,
      type,
      date,
      startTime,
      endTime,
      linkedItem: dragData,
    });
  }, []);

  // Handle popup save
  const handlePopupSave = useCallback((slot: CalendarSlot) => {
    setSlots(prev => [...prev, slot]);

    // If it's a task, also update the board task
    if (slot.linkedType === 'task' && slot.linkedId) {
      updateTask(slot.linkedId, {
        dueDate: slot.date,
        startTime: slot.startTime,
        duration: slot.duration,
      });
    }
  }, [updateTask]);

  // Handle slot click -> open popup for viewing
  const handleSlotClick = useCallback((slot: CalendarSlot) => {
    if (slot.linkedType === 'task' && slot.linkedId) {
      const task = board.tasks.find(t => t.id === slot.linkedId);
      if (task) setSelectedTask(task);
    }
  }, [board.tasks]);

  // Handle existing slot move
  const handleSlotsChange = useCallback((newSlots: CalendarSlot[]) => {
    setSlots(newSlots);
    // Sync task updates
    newSlots.filter(s => s.linkedType === 'task' && s.linkedId).forEach(s => {
      updateTask(s.linkedId!, {
        dueDate: s.date,
        startTime: s.startTime,
        duration: s.duration,
      });
    });
  }, [updateTask]);

  // Fixed Event / Break drag start
  const handleFixedDragStart = (e: React.DragEvent, type: 'fixed-event' | 'break') => {
    const data = {
      type,
      title: type === 'fixed-event' ? 'Fixed Event' : 'Break',
      duration: type === 'break' ? 15 : 60,
      color: type === 'fixed-event' ? '#7c3aed' : '#0891b2',
    };
    e.dataTransfer.setData('application/x-calendar-item', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
  };

  // AI functions
  const runAI = async (mode: 'schedule' | 'plan') => {
    if (!isPro) {
      setAiError('Pro or Premium subscription required');
      return;
    }
    setAiMode(mode);
    setAiLoading(true);
    setAiError('');
    setAiResult(null);
    setSmartScheduleApplied(false);

    try {
      const tasks = board.tasks.filter(t => !t.completed).map(t => ({
        title: t.title,
        priority: t.priority,
        duration: t.duration || 60,
        dueDate: t.dueDate,
      }));

      let prompt = 'You are a productivity assistant. Respond with valid JSON only, no markdown. ';
      if (mode === 'schedule') {
        prompt += `Create an optimized schedule for ${format(selectedDate, 'yyyy-MM-dd')} using these tasks: ${JSON.stringify(tasks)}. `;
        prompt += `Prioritize: overdue items, urgent deadlines, high priority tasks, habits, then lower priority. `;
        prompt += `Avoid overlaps. Space demanding work realistically. `;
        prompt += `Return JSON: { "schedule": [{ "time": "09:00", "task": "Task name", "reason": "Why placed here", "duration": 60 }], "tips": ["Tip"] }`;
      } else {
        prompt += `Create a daily plan for ${format(selectedDate, 'yyyy-MM-dd')} with these tasks: ${JSON.stringify(tasks)}. `;
        prompt += `Focus on today only. Include breaks. `;
        prompt += `Return JSON: { "plan": [{ "time": "09:00", "task": "Task name", "reason": "Why", "duration": 60 }], "overview": "Brief summary" }`;
      }

      const res = await fetch('https://text.pollinations.ai/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          jsonMode: true,
        }),
      });

      if (!res.ok) throw new Error('AI request failed');
      const text = await res.text();
      let clean = text.trim();
      if (clean.startsWith('```json')) clean = clean.substring(7);
      if (clean.startsWith('```')) clean = clean.substring(3);
      if (clean.endsWith('```')) clean = clean.substring(0, clean.length - 3);
      setAiResult(JSON.parse(clean.trim()));
    } catch (e: any) {
      setAiError(e.message || 'AI request failed');
    } finally {
      setAiLoading(false);
    }
  };

  const applySmartSchedule = () => {
    if (!aiResult?.schedule && !aiResult?.plan) return;
    const items = aiResult.schedule || aiResult.plan || [];
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const newSlots: CalendarSlot[] = items.map((item: any) => {
      const start = item.time || '09:00';
      const dur = item.duration || 60;
      const endM = timeToMinutes(start) + dur;
      return {
        id: generateId(),
        title: item.task,
        type: 'task' as const,
        startTime: start,
        endTime: `${Math.floor(endM / 60) % 24}:${(endM % 60).toString().padStart(2, '0')}`,
        date: dateStr,
        color: '#4f46e5',
        duration: dur,
      };
    });
    setSlots(prev => [...prev.filter(s => s.date !== dateStr || s.linkedType !== 'task'), ...newSlots]);
    setSmartScheduleApplied(true);
    setTimeout(() => { setAiPanelOpen(false); setSmartScheduleApplied(false); }, 1500);
  };

  return (
    <div className="flex w-full h-[calc(100vh-64px)] overflow-hidden bg-background">
      {/* Left Sidebar */}
      <CalendarSidebar onTaskClick={setSelectedTask} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background relative">
        {/* Top Navigation Bar */}
        <header className="px-6 py-3 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur-md sticky top-0 z-20 flex-shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold text-foreground">{headerTitle()}</h1>
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg border border-border">
              <button onClick={goPrev} className="p-1.5 hover:bg-background rounded-md transition-all">
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <button onClick={goToday} className="px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-background rounded-md transition-all">
                Today
              </button>
              <button onClick={goNext} className="p-1.5 hover:bg-background rounded-md transition-all">
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center p-0.5 bg-muted/50 rounded-lg border border-border">
              {[
                { id: 'day' as ViewMode, icon: Sun, label: 'Day' },
                { id: 'week' as ViewMode, icon: Clock, label: 'Week' },
                { id: 'month' as ViewMode, icon: Grid3X3, label: 'Month' },
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => setViewMode(v.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold rounded-md transition-all",
                    viewMode === v.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <v.icon className="w-3.5 h-3.5" />
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* Fixed Event and Break Buttons */}
        <div className="px-6 py-2 flex gap-2 border-b border-border bg-muted/10 flex-shrink-0">
          <div
            draggable
            onDragStart={(e) => handleFixedDragStart(e, 'fixed-event')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 border border-purple-500/30 rounded-full text-[11px] font-bold text-purple-600 cursor-grab active:cursor-grabbing hover:bg-purple-500/20 transition-all"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            Fixed Event
          </div>
          <div
            draggable
            onDragStart={(e) => handleFixedDragStart(e, 'break')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-[11px] font-bold text-cyan-600 cursor-grab active:cursor-grabbing hover:bg-cyan-500/20 transition-all"
          >
            <Coffee className="w-3.5 h-3.5" />
            Break
          </div>
          <span className="text-[10px] text-muted-foreground self-center ml-1">Drag onto calendar</span>
        </div>

        {/* Calendar Grid */}
        <main className="flex-1 overflow-hidden">
          {viewMode === 'day' && (
            <DayView
              date={selectedDate}
              slots={slots}
              onSlotsChange={handleSlotsChange}
              onSlotClick={handleSlotClick}
              onSlotDrop={handleSlotDrop}
            />
          )}
          {viewMode === 'week' && (
            <WeekView
              selectedDate={selectedDate}
              slots={slots}
              onSlotsChange={handleSlotsChange}
              onSlotClick={handleSlotClick}
              onSlotDrop={handleSlotDrop}
            />
          )}
          {viewMode === 'month' && (
            <MonthView
              selectedDate={selectedDate}
              slots={slots}
              onDateChange={setSelectedDate}
              onSlotClick={handleSlotClick}
              onSlotDrop={handleSlotDrop}
            />
          )}
        </main>

        {/* Floating AI Button */}
        <button
          onClick={() => setAiPanelOpen(true)}
          className={cn(
            "absolute bottom-8 right-8 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-2xl",
            "flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 z-30",
            "before:absolute before:inset-0 before:rounded-full before:animate-ping before:bg-primary/30"
          )}
        >
          <Sparkles className="w-6 h-6" />
        </button>
      </div>

      {/* AI Side Panel */}
      {aiPanelOpen && (
        <div className="w-96 border-l border-border bg-card flex flex-col overflow-hidden shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-40">
          <header className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-foreground">AI Productivity Assistant</span>
            </div>
            <button onClick={() => setAiPanelOpen(false)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all">
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-1 gap-3">
              <AIActionCard
                icon={CalendarIcon}
                title="Smart Schedule"
                desc="AI builds an optimised schedule from your data"
                onClick={() => runAI('schedule')}
              />
              <AIActionCard
                icon={Zap}
                title="Daily Plan"
                desc="Focused schedule for today"
                onClick={() => runAI('plan')}
              />
            </div>

            {aiLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-10 h-10 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
                <span className="text-sm font-medium text-muted-foreground">Analysing your schedule...</span>
              </div>
            )}

            {aiError && (
              <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-xl">
                <p className="text-xs font-bold text-destructive">{aiError}</p>
              </div>
            )}

            {aiResult && !aiLoading && (
              <div className="space-y-4">
                {(aiResult.schedule || aiResult.plan) && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {aiMode === 'schedule' ? 'Suggested Schedule' : 'Daily Plan'}
                    </p>
                    {(aiResult.schedule || aiResult.plan).map((item: any, i: number) => (
                      <div key={i} className="p-3 bg-muted/40 rounded-xl border border-border">
                        <span className="text-[10px] font-bold text-primary">{item.time}</span>
                        <p className="text-sm font-bold text-foreground mt-0.5">{item.task}</p>
                        {item.reason && <p className="text-[11px] text-muted-foreground mt-1">{item.reason}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {aiResult.overview && (
                  <div className="p-3 bg-primary/5 rounded-xl border border-primary/10">
                    <p className="text-sm font-medium">{aiResult.overview}</p>
                  </div>
                )}

                {aiResult.tips && (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Tips</p>
                    {aiResult.tips.map((tip: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span> {tip}
                      </p>
                    ))}
                  </div>
                )}

                {(aiResult.schedule || aiResult.plan) && (
                  <button
                    onClick={applySmartSchedule}
                    disabled={smartScheduleApplied}
                    className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-bold text-sm hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {smartScheduleApplied ? '✓ Applied!' : aiMode === 'schedule' ? 'Apply Smart Schedule' : 'Apply Daily Plan'}
                  </button>
                )}
              </div>
            )}

            {!aiLoading && !aiResult && !aiError && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Sparkles className="w-10 h-10 text-muted-foreground/30 mb-4" />
                <p className="text-sm font-bold text-foreground mb-1">AI Productivity Assistant</p>
                <p className="text-xs text-muted-foreground">Choose Smart Schedule or Daily Plan above</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scheduling Popup */}
      <SchedulingPopup
        open={popup.open}
        type={popup.type}
        date={popup.date}
        startTime={popup.startTime}
        endTime={popup.endTime}
        linkedItem={popup.linkedItem}
        subItems={popupSubItems}
        onClose={() => setPopup(prev => ({ ...prev, open: false }))}
        onSave={handlePopupSave}
      />

      {/* Task Detail Modal */}
      {currentTask && (
        <TaskDetailModal task={currentTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
};

function AIActionCard({
  icon: Icon, title, desc, onClick,
}: {
  icon: React.FC<{ className?: string }>;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border hover:border-primary/20 hover:bg-background hover:shadow-sm transition-all text-left group"
    >
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </button>
  );
}

export default CalendarPage;
