import React, { useState, useEffect, useCallback } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import TaskDetailModal from '@/components/TaskDetailModal';
import { Task } from '@/types/board';
import CalendarView from '@/components/CalendarView';
import CalendarSidebar from '@/components/CalendarSidebar';
import WeeklyGrid from '@/components/WeeklyGrid';
import { Sparkles, X, ChevronLeft, ChevronRight, Loader2, Zap, BarChart3, ListChecks, Calendar, Grid3X3, Sun, Clock, Plus } from 'lucide-react';
import { format, addDays, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

import { useAuth } from '@/context/AuthContext';

type AiMode = 'schedule' | 'analyze' | 'subtasks' | 'plan';
type ViewMode = 'day' | 'week' | 'month';

interface AiResult {
  type: AiMode;
  data: any;
}

const CalendarPage: React.FC = () => {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const { user } = useAuth();
  const isPremium = user?.subscriptionTier === 'premium';
  const isPro = user?.subscriptionTier === 'pro' || isPremium;
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  const { board, updateTask } = useBoardContext();
  const currentTask = selectedTask ? board.tasks.find(t => t.id === selectedTask.id) : null;
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiMode, setAiMode] = useState<AiMode>('schedule');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiError, setAiError] = useState('');
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [scheduleFeedback, setScheduleFeedback] = useState<{scheduled: number, notFound: string[]} | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);

  // Check calendar connection status on mount
  useEffect(() => {
    fetchCalendarStatus();
  }, []);

  const fetchCalendarStatus = async () => {
    try {
      const res = await fetch('/api/calendar/status', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCalendarConnected(data.connected);
      }
    } catch (error) {
      console.error('Error checking calendar status:', error);
    }
  };

  // Auto-sync tasks to Google Calendar when enabled
  const syncToGoogleCalendar = useCallback(async () => {
    if (!calendarConnected || !isPro) return;
    
    try {
      const tasks = board.tasks.filter(t => t.dueDate).map(t => ({
        title: t.title,
        description: t.description || '',
        dueDate: t.dueDate,
        startTime: t.startTime || '09:00',
      }));
      
      if (tasks.length === 0) return;
      
      await fetch('/api/calendar/sync-to-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tasks }),
      });
      
      setLastSyncTime(new Date());
    } catch (error) {
      console.error('Auto-sync error:', error);
    }
  }, [board.tasks, calendarConnected, isPro]);

  // Set up auto-sync interval when enabled
  useEffect(() => {
    if (!autoSyncEnabled || !calendarConnected) return;
    
    // Initial sync
    syncToGoogleCalendar();
    
    // Sync every 5 minutes
    const interval = setInterval(syncToGoogleCalendar, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [autoSyncEnabled, calendarConnected, syncToGoogleCalendar]);

  const activeTasks = board.tasks.map(t => ({
    title: t.title,
    priority: t.priority,
    dueDate: t.dueDate,
    status: board.columns.find(c => c.id === t.columnId)?.title,
    id: t.id,
    duration: t.duration || 60,
    startTime: t.startTime,
    color: t.color,
    icon: t.icon,
    checklists: t.checklists,
  }));

  // Add break slots for calendar
  const breakSlots = [
    { id: 'break-morning', title: 'Morning Break', type: 'break', duration: 15, startTime: '10:30', color: '#10b981' },
    { id: 'break-lunch', title: 'Lunch Break', type: 'break', duration: 45, startTime: '12:30', color: '#3b82f6' },
    { id: 'break-afternoon', title: 'Afternoon Break', type: 'break', duration: 15, startTime: '15:30', color: '#f59e0b' },
  ];

  async function callAI(endpoint: string, body: any) {
    let prompt = "You are a highly capable productivity assistant. You must respond purely with valid JSON. Do not include markdown formatting or backticks. ";
    if (endpoint === 'suggest-schedule') {
        prompt += `Given these tasks: ${JSON.stringify(body.tasks)} and energy levels: ${JSON.stringify(body.energyLevels)}, suggest a schedule. Return JSON: { "insight": "A brief insightful tip about scheduling", "schedule": [{ "time": "09:00", "task": "Task name", "reason": "Why at this time" }], "tips": ["Tip 1", "Tip 2"] }`;
    } else if (endpoint === 'analyze-tasks') {
        prompt += `Analyze these tasks: ${JSON.stringify(body.tasks)}. Return JSON: { "overallScore": 85, "focusArea": "Main area of focus", "insights": ["Insight 1", "Insight 2"], "recommendations": ["Recommendation 1", "Recommendation 2"] }`;
    } else if (endpoint === 'generate-subtasks') {
        prompt += `Break down this task title "${body.title}" into subtasks. Return JSON: { "estimatedHours": 2, "difficulty": "medium", "subtasks": ["Subtask 1", "Subtask 2"] }`;
    } else if (endpoint === 'daily-plan') {
        prompt += `Create a daily plan for ${body.date} given these tasks: ${JSON.stringify(body.tasks)}. Return JSON: { "greeting": "Good morning!", "priorityAlert": "Urgent task details", "plan": [{ "period": "Morning", "focus": "Deep work", "tasks": ["Task 1", "Task 2"] }], "motivation": "Motivational quote" }`;
    }

    const res = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: prompt }],
        jsonMode: true,
      }),
    });

    if (!res.ok) {
      throw new Error('AI request failed');
    }
    const text = await res.text();
    try {
       let cleanText = text.trim();
       if (cleanText.startsWith('```json')) cleanText = cleanText.substring(7);
       if (cleanText.startsWith('```')) cleanText = cleanText.substring(3);
       if (cleanText.endsWith('```')) cleanText = cleanText.substring(0, cleanText.length - 3);
       return JSON.parse(cleanText.trim());
    } catch {
       throw new Error('Failed to parse AI response. Please try again.');
    }
  }

  const runAI = async (mode: AiMode) => {
    if (!isPro) {
      setAiError('Pro or Premium subscription required');
      return;
    }
    setAiMode(mode);
    setAiLoading(true);
    setAiError('');
    setAiResult(null);
    try {
      let data: any;
      if (mode === 'schedule') {
        data = await callAI('suggest-schedule', { tasks: activeTasks, energyLevels: { morning: 'medium', afternoon: 'high', evening: 'low' } });
      } else if (mode === 'analyze') {
        data = await callAI('analyze-tasks', { tasks: activeTasks });
      } else if (mode === 'subtasks') {
        if (!subtaskTitle.trim()) { setAiError('Enter a task title first'); setAiLoading(false); return; }
        data = await callAI('generate-subtasks', { title: subtaskTitle.trim(), description: '' });
      } else if (mode === 'plan') {
        data = await callAI('daily-plan', { tasks: activeTasks, date: new Date().toDateString() });
      }
      setAiResult({ type: mode, data });
    } catch (e: any) {
      setAiError(e.message || 'AI request failed');
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiSchedule = () => {
    if (aiResult?.type === 'schedule' && aiResult.data.schedule) {
      let scheduled = 0;
      const notFound: string[] = [];
      
      aiResult.data.schedule.forEach((item: any) => {
        // Try to find task by exact title match first, then fuzzy match
        const task = board.tasks.find(t => 
          t.title.toLowerCase().trim() === item.task.toLowerCase().trim() || 
          t.title.toLowerCase().includes(item.task.toLowerCase()) ||
          item.task.toLowerCase().includes(t.title.toLowerCase())
        );
        
        if (task) {
          updateTask(task.id, { 
            dueDate: format(selectedDate, 'yyyy-MM-dd'),
            startTime: item.time 
          });
          scheduled++;
        } else {
          notFound.push(item.task);
        }
      });
      
      setScheduleFeedback({ scheduled, notFound });
      
      // Close panel after 2 seconds if tasks were scheduled
      if (scheduled > 0) {
        setTimeout(() => {
          setAiPanelOpen(false);
          setScheduleFeedback(null);
        }, 2000);
      }
    }
  };

  const handleMoveTask = (taskId: string, newDate: string, startTime: string) => {
    updateTask(taskId, { dueDate: newDate, startTime });
  };

  const nextPeriod = () => {
    if (viewMode === 'day') setSelectedDate(addDays(selectedDate, 1));
    else if (viewMode === 'week') setSelectedDate(addDays(selectedDate, 7));
    else setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1));
  };

  const prevPeriod = () => {
    if (viewMode === 'day') setSelectedDate(subDays(selectedDate, 1));
    else if (viewMode === 'week') setSelectedDate(subDays(selectedDate, 7));
    else setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));
  };

  return (
    <div className="flex w-full h-[calc(100vh-64px)] overflow-hidden bg-background">
      {/* 1. Left Sidebar */}
      <CalendarSidebar onTaskClick={setSelectedTask} />

      {/* 2. Main Content (Calendar Grid) */}
      <div className="flex-1 flex flex-col min-w-0 bg-background relative">
        <header className="px-8 py-4 flex items-center justify-between border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-foreground">
              {viewMode === 'week' ? `Week of ${format(selectedDate, 'MMMM d')}` : format(selectedDate, 'MMMM yyyy')}
            </h1>
            
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-xl border border-border">
              <button 
                onClick={prevPeriod}
                className="p-1.5 hover:bg-background hover:shadow-sm rounded-lg transition-all"
              >
                <ChevronLeft className="w-5 h-5 text-muted-foreground" />
              </button>
              <button 
                onClick={() => setSelectedDate(new Date())}
                className="px-3 py-1 text-xs font-bold text-foreground hover:bg-background hover:shadow-sm rounded-lg transition-all"
              >
                Today
              </button>
              <button 
                onClick={nextPeriod}
                className="p-1.5 hover:bg-background hover:shadow-sm rounded-lg transition-all"
              >
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* View Mode Selector */}
            <div className="flex items-center p-1 bg-muted/50 rounded-xl border border-border shadow-inner">
              {[
                { id: 'day', icon: Sun, label: 'Day' },
                { id: 'week', icon: Clock, label: 'Week' },
                { id: 'month', icon: Grid3X3, label: 'Month' }
              ].map((v) => (
                <button
                  key={v.id}
                  onClick={() => setViewMode(v.id as ViewMode)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all duration-200",
                    viewMode === v.id 
                      ? "bg-background text-primary shadow-sm ring-1 ring-border" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <v.icon className={cn("w-3.5 h-3.5", viewMode === v.id ? "text-primary" : "text-muted-foreground")} />
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* The Grid */}
        <main className="flex-1 overflow-hidden p-6">
          <div className="h-full animate-fade-in shadow-2xl shadow-primary/5 rounded-2xl overflow-hidden border border-border">
            {viewMode === 'week' ? (
              <WeeklyGrid 
                tasks={board.tasks} 
                selectedDate={selectedDate} 
                onTaskClick={setSelectedTask} 
                onMoveTask={handleMoveTask}
              />
            ) : (
              <CalendarView 
                onTaskClick={setSelectedTask} 
                viewMode={viewMode}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                onAddTaskToDate={() => {}} // Improved logic in CalendarView later
                onMoveTaskToDate={(id, date) => handleMoveTask(id, format(date, 'yyyy-MM-dd'), "09:00")}
              />
            )}
          </div>
        </main>

        {/* Floating AI Button */}
        <button
          onClick={() => setAiPanelOpen(true)}
          className="absolute bottom-8 right-8 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300 group z-30"
        >
          <Sparkles className="w-6 h-6 group-hover:animate-pulse" />
        </button>
      </div>

      {/* 3. AI Side Panel (Right) */}
      {aiPanelOpen && (
        <div className="w-96 border-l border-border bg-card flex flex-col animate-slide-in-right overflow-hidden shadow-[-10px_0_30px_rgba(0,0,0,0.05)] z-40">
          <header className="flex items-center justify-between px-6 py-5 border-b border-border bg-card/50 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <span className="text-sm font-bold text-foreground tracking-tight">AI Productivity Assistant</span>
            </div>
            <button
              onClick={() => setAiPanelOpen(false)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
             {/* AI Actions */}
             <div className="grid grid-cols-1 gap-3">
               {[
                 { id: 'schedule', icon: Calendar, title: 'Smart Schedule', desc: 'Optimal time blocks for your tasks', action: 'schedule' },
                 { id: 'plan', icon: Zap, title: 'Daily Plan', desc: 'AI-crafted plan for today', action: 'plan' },
                 { id: 'analyze', icon: BarChart3, title: 'Task Analysis', desc: 'Productivity insights & tips', action: 'analyze' }
               ].map((item) => (
                 <button
                   key={item.id}
                   onClick={() => runAI(item.action as AiMode)}
                   className="flex items-center gap-4 p-4 rounded-2xl bg-muted/30 border border-transparent hover:border-primary/20 hover:bg-background hover:shadow-lg hover:shadow-primary/5 transition-all text-left group"
                 >
                   <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                     <item.icon className="w-5 h-5 text-primary" />
                   </div>
                   <div>
                     <p className="text-sm font-bold text-foreground">{item.title}</p>
                     <p className="text-[11px] text-muted-foreground mt-0.5">{item.desc}</p>
                   </div>
                 </button>
               ))}
               
               <div className="mt-4 p-4 rounded-2xl bg-primary/5 border border-primary/10 space-y-3">
                 <div className="flex items-center gap-2 mb-1">
                    <ListChecks className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">Break Down Task</span>
                 </div>
                 <div className="flex gap-2">
                    <input
                      type="text"
                      value={subtaskTitle}
                      onChange={e => setSubtaskTitle(e.target.value)}
                      placeholder="e.g. Design landing page"
                      className="flex-1 px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                    />
                    <button 
                      onClick={() => runAI('subtasks')}
                      className="p-2 bg-primary text-primary-foreground rounded-xl hover:opacity-90 active:scale-95 transition-all"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                 </div>
               </div>
             </div>

             {/* Results Area */}
             <div className="pt-4 border-t border-border">
                {aiLoading && (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <div className="relative">
                      <div className="w-12 h-12 border-4 border-primary/10 border-t-primary rounded-full animate-spin" />
                      <Sparkles className="w-4 h-4 text-primary absolute inset-0 m-auto animate-pulse" />
                    </div>
                    <span className="text-sm font-medium text-muted-foreground">Synthesizing intelligence...</span>
                  </div>
                )}

                {aiError && (
                  <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-2xl animate-shake">
                    <p className="text-xs font-bold text-destructive flex items-center gap-2">
                      <X className="w-3 h-3" /> {aiError}
                    </p>
                  </div>
                )}

                {aiResult && !aiLoading && (
                  <div className="space-y-6 animate-slide-up">
                    {/* Render AI results based on type - reused same logic as before but with better styling */}
                    {aiResult.type === 'schedule' && (
                      <div className="space-y-4">
                        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                          <p className="text-sm leading-relaxed font-medium text-foreground">{aiResult.data.insight}</p>
                        </div>
                        <div className="space-y-2">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Suggested Timeline</p>
                          {aiResult.data.schedule?.map((item: any, i: number) => (
                            <div key={i} className="p-4 bg-muted/40 rounded-2xl border border-transparent hover:border-border transition-colors">
                              <span className="text-[10px] font-black text-primary uppercase">{item.time}</span>
                              <p className="text-sm font-bold text-foreground mt-1">{item.task}</p>
                              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.reason}</p>
                            </div>
                          ))}
                        </div>
                        {scheduleFeedback && (
                          <div className={`p-4 rounded-2xl border ${scheduleFeedback.scheduled > 0 ? 'bg-green-500/10 border-green-500/30 text-green-600' : 'bg-amber-500/10 border-amber-500/30 text-amber-600'}`}>
                            <p className="text-sm font-bold">
                              {scheduleFeedback.scheduled > 0 
                                ? `✓ Scheduled ${scheduleFeedback.scheduled} tasks successfully!` 
                                : '⚠ No matching tasks found'}
                            </p>
                            {scheduleFeedback.notFound.length > 0 && (
                              <p className="text-xs mt-1 opacity-80">
                                Not found: {scheduleFeedback.notFound.join(', ')}
                              </p>
                            )}
                          </div>
                        )}
                        <button
                          onClick={applyAiSchedule}
                          disabled={scheduleFeedback !== null && scheduleFeedback.scheduled > 0}
                          className="w-full py-3 bg-primary text-primary-foreground rounded-2xl font-bold text-sm shadow-lg shadow-primary/20 hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Zap className="w-4 h-4 fill-current" />
                          {scheduleFeedback?.scheduled && scheduleFeedback.scheduled > 0 ? 'Applied!' : 'Apply Smart Schedule'}
                        </button>
                      </div>
                    )}

                    {aiResult.type === 'plan' && (
                      <div className="space-y-4">
                        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                          <p className="text-sm font-bold text-foreground">{aiResult.data.greeting}</p>
                        </div>
                        {aiResult.data.priorityAlert && (
                          <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl shadow-inner">
                            <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Priority Alert</p>
                            <p className="text-sm font-medium text-foreground">{aiResult.data.priorityAlert}</p>
                          </div>
                        )}
                        <div className="space-y-3">
                          {aiResult.data.plan?.map((period: any, i: number) => (
                            <div key={i} className="p-4 bg-muted/30 rounded-2xl border border-border/50">
                              <p className="text-[10px] font-black text-primary uppercase">{period.period}</p>
                              <p className="text-sm font-bold text-foreground mt-1">{period.focus}</p>
                              {period.tasks?.length > 0 && (
                                <ul className="mt-3 space-y-2">
                                  {period.tasks.map((t: string, j: number) => (
                                    <li key={j} className="text-xs text-muted-foreground flex items-center gap-2">
                                      <div className="w-1 h-1 rounded-full bg-primary" /> {t}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {aiResult.type === 'analyze' && (
                      <div className="space-y-6">
                        <div className="flex items-center justify-between p-5 bg-primary rounded-2xl shadow-xl shadow-primary/20">
                          <span className="text-sm font-bold text-primary-foreground/80">Productivity Score</span>
                          <span className="text-3xl font-black text-primary-foreground">{aiResult.data.overallScore}%</span>
                        </div>
                        <div className="space-y-3">
                           <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Focus Strategy</p>
                           <p className="text-sm font-medium p-4 bg-muted/40 rounded-2xl border border-border">{aiResult.data.focusArea}</p>
                        </div>
                        <div className="space-y-3">
                           <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Core Insights</p>
                           {aiResult.data.insights?.map((ins: string, i: number) => (
                             <div key={i} className="flex gap-3 p-4 bg-muted/40 rounded-2xl border border-transparent hover:border-border transition-all">
                                <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                                <p className="text-sm text-foreground/80 leading-relaxed">{ins}</p>
                             </div>
                           ))}
                        </div>
                      </div>
                    )}

                    {aiResult.type === 'subtasks' && (
                      <div className="space-y-5">
                         <div className="grid grid-cols-2 gap-3">
                            <div className="p-4 bg-muted/30 rounded-2xl text-center border border-border">
                               <p className="text-2xl font-black text-primary">{aiResult.data.estimatedHours}h</p>
                               <p className="text-[10px] font-bold text-muted-foreground uppercase">Estimated Time</p>
                            </div>
                            <div className="p-4 bg-muted/30 rounded-2xl text-center border border-border">
                               <p className="text-2xl font-black text-foreground capitalize">{aiResult.data.difficulty}</p>
                               <p className="text-[10px] font-bold text-muted-foreground uppercase">Difficulty</p>
                            </div>
                         </div>
                         <div className="space-y-3">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Action Plan</p>
                            {aiResult.data.subtasks?.map((sub: string, i: number) => (
                              <div key={i} className="flex items-center gap-3 p-4 bg-card border border-border rounded-2xl hover:border-primary/20 transition-all shadow-sm group">
                                 <div className="w-5 h-5 rounded-lg border-2 border-border group-hover:border-primary/40 transition-colors flex-shrink-0" />
                                 <p className="text-sm font-medium text-foreground">{sub}</p>
                              </div>
                            ))}
                         </div>
                      </div>
                    )}
                  </div>
                )}

                {!aiLoading && !aiResult && !aiError && (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                    <div className="w-20 h-20 rounded-3xl bg-muted/50 flex items-center justify-center mb-6 animate-pulse">
                        <Sparkles className="w-10 h-10 text-muted-foreground/40" />
                    </div>
                    <p className="text-sm font-bold text-foreground mb-2">Ready to assist you</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Choose an intelligence feature above to optimize your workflow and maximize productivity.
                    </p>
                  </div>
                )}
             </div>
          </div>
        </div>
      )}

      {currentTask && (
        <TaskDetailModal task={currentTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
};

export default CalendarPage;