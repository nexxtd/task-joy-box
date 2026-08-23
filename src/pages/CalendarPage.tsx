import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
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
  const { t } = useLanguage();
  const { board, updateTask, addTask } = useBoardContext();
  const isPro = user?.subscriptionTier === 'pro';

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
    if (viewMode === 'week') return t('Week of {{date}}', { date: format(selectedDate, 'MMM d') });
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
      title: type === 'fixed-event' ? t('Fixed Event') : t('Break'),
      duration: type === 'break' ? 15 : 60,
      color: type === 'fixed-event' ? '#7c3aed' : '#0891b2',
    };
    e.dataTransfer.setData('application/x-calendar-item', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
  };

  // AI functions - single in-flight request only + cooldown
  const aiAbortRef = useRef<AbortController | null>(null);
  const aiRunningRef = useRef(false);
  const aiCooldownRef = useRef(false);

  const runAI = async (mode: 'schedule' | 'plan') => {
    if (!isPro) {
      setAiError(t('Pro subscription required'));
      return;
    }
    if (aiLoading || aiRunningRef.current || aiCooldownRef.current) return;

    aiAbortRef.current?.abort();
    const ctrl = new AbortController();
    aiAbortRef.current = ctrl;
    aiRunningRef.current = true;

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

      const endpoint = mode === 'schedule' ? '/api/ai/suggest-schedule' : '/api/ai/daily-plan';
      const body = mode === 'schedule'
        ? { tasks, energyLevels: {} }
        : { tasks, date: format(selectedDate, 'yyyy-MM-dd') };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After');
        const msg = retryAfter
          ? t('Server is busy. Try again in {{retryAfter}}s', { retryAfter })
          : t('Server is busy right now. Wait 15s then try again.');
        throw new Error(msg);
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || t('Request failed ({{status}})', { status: res.status }));
      }

      const data = await res.json();

      if (data.plan) {
        setAiResult(data);
      } else if (data.schedule) {
        setAiResult(data);
      } else if (data.insight || data.tips) {
        setAiResult(data);
      } else {
        throw new Error(t('Unexpected AI response format'));
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      setAiError(e.message || t('Something went wrong'));
      // 15s cooldown so user can't hammer the button
      aiCooldownRef.current = true;
      setTimeout(() => { aiCooldownRef.current = false; }, 15000);
    } finally {
      aiRunningRef.current = false;
      if (aiAbortRef.current === ctrl) {
        setAiLoading(false);
        aiAbortRef.current = null;
      }
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
    <div className="flex w-full h-full overflow-hidden bg-gradient-to-br from-background via-background to-muted/30">
      {/* Left Sidebar */}
      <CalendarSidebar onTaskClick={setSelectedTask} />

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-background/80 backdrop-blur-sm relative">
        {/* Top Navigation Bar */}
        <header className="px-6 h-16 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-20 flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-baseline gap-2 min-w-0">
              <h1 className="text-lg font-bold text-foreground tracking-tight whitespace-nowrap">{headerTitle()}</h1>
              {viewMode === 'day' && (
                <span className="text-[10px] font-medium text-muted-foreground">
                  {format(selectedDate, 'yyyy')}
                </span>
              )}
            </div>
            <div className="flex items-center gap-0.5 bg-card p-0.5 rounded-xl border border-border/60 shadow-sm">
              <button onClick={goPrev} className="p-1.5 hover:bg-muted rounded-lg transition-all text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={goToday} className="px-3 py-1 text-xs font-bold text-foreground hover:bg-muted rounded-lg transition-all">
                {t('Today')}
              </button>
              <button onClick={goNext} className="p-1.5 hover:bg-muted rounded-lg transition-all text-muted-foreground hover:text-foreground">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center p-0.5 bg-card rounded-xl border border-border/60 shadow-sm">
              {[
                { id: 'day' as ViewMode, icon: Sun, label: 'Day' },
                { id: 'week' as ViewMode, icon: Clock, label: 'Week' },
                { id: 'month' as ViewMode, icon: Grid3X3, label: 'Month' },
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => setViewMode(v.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all duration-200",
                    viewMode === v.id
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
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
        <div className="px-6 py-2.5 flex items-center gap-2.5 border-b border-border/40 bg-gradient-to-r from-primary/[0.02] via-transparent to-primary/[0.02] flex-shrink-0">
          <div
            draggable
            onDragStart={(e) => handleFixedDragStart(e, 'fixed-event')}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/15 to-purple-600/10 border border-purple-500/30 rounded-xl text-xs font-bold text-purple-600 dark:text-purple-400 cursor-grab active:cursor-grabbing hover:from-purple-500/25 hover:to-purple-600/20 hover:shadow-md hover:shadow-purple-500/10 active:scale-95 transition-all duration-200 select-none"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            Fixed Event
          </div>
          <div
            draggable
            onDragStart={(e) => handleFixedDragStart(e, 'break')}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500/15 to-teal-500/10 border border-cyan-500/30 rounded-xl text-xs font-bold text-cyan-600 dark:text-cyan-400 cursor-grab active:cursor-grabbing hover:from-cyan-500/25 hover:to-teal-500/20 hover:shadow-md hover:shadow-cyan-500/10 active:scale-95 transition-all duration-200 select-none"
          >
            <Coffee className="w-3.5 h-3.5" />
            Break
          </div>
          <span className="text-[10px] text-muted-foreground/60 self-center ml-auto tracking-wide">Drag onto calendar grid</span>
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
            "absolute bottom-8 right-8 w-14 h-14 rounded-full",
            "flex items-center justify-center z-30 group",
            "bg-gradient-to-br from-primary via-primary to-primary/80",
            "text-primary-foreground shadow-2xl shadow-primary/30",
            "hover:scale-110 hover:shadow-3xl hover:shadow-primary/40",
            "active:scale-95 transition-all duration-300",
            "before:absolute before:inset-0 before:rounded-full before:animate-ping before:bg-primary/40",
            "after:absolute after:inset-[-2px] after:rounded-full after:bg-gradient-to-br after:from-primary/20 after:via-transparent after:to-transparent after:opacity-0 after:group-hover:opacity-100 after:transition-opacity after:duration-500"
          )}
        >
          <Sparkles className="w-6 h-6 relative z-10" />
        </button>
      </div>

      {/* AI Side Panel */}
      {aiPanelOpen && (
        <div className="w-[28rem] border-l border-border/60 bg-gradient-to-b from-card to-background flex flex-col overflow-hidden shadow-[-8px_0_40px_rgba(0,0,0,0.06)] z-40 animate-in slide-in-from-right duration-300">
          <header className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-gradient-to-r from-primary/[0.02] to-transparent">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-bold text-foreground">AI Assistant</span>
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
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <div className="relative">
                  <div className="w-12 h-12 border-[3px] border-primary/10 border-t-primary rounded-full animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-primary/40" />
                  </div>
                </div>
                <span className="text-sm font-medium text-muted-foreground tracking-tight animate-pulse">Analysing your schedule...</span>
              </div>
            )}

            {aiError && (
              <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-xl shadow-sm">
                <div className="flex items-start gap-2.5">
                  <div className="w-2 h-2 rounded-full bg-destructive/50 mt-1 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-destructive">{aiError}</p>
                    <p className="text-[10px] text-destructive/60 mt-1">Please wait before trying again</p>
                  </div>
                </div>
              </div>
            )}

            {aiResult && !aiLoading && (
              <div className="space-y-4">
                {(aiResult.schedule || aiResult.plan) && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-px flex-1 bg-gradient-to-r from-primary/20 to-transparent" />
                      <span className="text-[10px] font-bold text-primary uppercase tracking-[0.2em]">
                        {aiMode === 'schedule' ? 'Suggested Schedule' : 'Daily Plan'}
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-l from-primary/20 to-transparent" />
                    </div>
                    {(aiResult.schedule || aiResult.plan).map((item: any, i: number) => (
                      <div key={i} className="p-4 bg-card/80 backdrop-blur-sm rounded-xl border border-border/60 shadow-sm hover:shadow-md hover:border-primary/20 transition-all duration-200">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                            {item.time}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {item.duration ? `${item.duration}min` : ''}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-foreground">{item.task}</p>
                        {item.reason && <p className="text-[11px] text-muted-foreground/70 mt-1.5 leading-relaxed">{item.reason}</p>}
                      </div>
                    ))}
                  </div>
                )}

                {aiResult.overview && (
                  <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/[0.02] rounded-xl border border-primary/10">
                    <p className="text-sm font-medium text-foreground/80 leading-relaxed">{aiResult.overview}</p>
                  </div>
                )}

                {aiResult.tips && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Tips</p>
                    {aiResult.tips.map((tip: string, i: number) => (
                      <p key={i} className="text-xs text-muted-foreground/80 flex items-start gap-2.5 leading-relaxed">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/40 mt-1.5 flex-shrink-0" />
                        {tip}
                      </p>
                    ))}
                  </div>
                )}

                {(aiResult.schedule || aiResult.plan) && (
                  <button
                    onClick={applySmartSchedule}
                    disabled={smartScheduleApplied}
                    className="w-full py-3 bg-gradient-to-r from-primary to-primary/90 text-primary-foreground rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {smartScheduleApplied ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 rounded-full bg-green-400 flex items-center justify-center text-[8px]">✓</span>
                        Applied!
                      </span>
                    ) : (
                      aiMode === 'schedule' ? 'Apply Smart Schedule' : 'Apply Daily Plan'
                    )}
                  </button>
                )}
              </div>
            )}

            {!aiLoading && !aiResult && !aiError && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/5 to-primary/[0.02] border border-primary/10 mb-5">
                  <Sparkles className="w-8 h-8 text-primary/40" />
                </div>
                <p className="text-sm font-bold text-foreground mb-1">AI Productivity Assistant</p>
                <p className="text-xs text-muted-foreground/70 max-w-[200px] mx-auto">Choose Smart Schedule or Daily Plan above</p>
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
      className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-card via-card to-muted/50 border border-border/60 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-200 text-left group"
    >
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center flex-shrink-0 group-hover:scale-110 group-hover:from-primary/25 group-hover:to-primary/10 transition-all duration-200 ring-1 ring-primary/10">
        <Icon className="w-4.5 h-4.5 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{title}</p>
        <p className="text-[11px] text-muted-foreground/70 mt-0.5 leading-snug">{desc}</p>
      </div>
      <div className="w-6 h-6 rounded-full bg-muted/50 flex items-center justify-center group-hover:bg-primary/10 group-hover:translate-x-0.5 transition-all">
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
      </div>
    </button>
  );
}

export default CalendarPage;
