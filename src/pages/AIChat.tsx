import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import {
  Wand2, Send, Loader2, Plus, Trash2, ArrowRightLeft, Search,
  Copy, CheckCircle2, XCircle, AlertTriangle, ChevronRight,
  Calendar, Flag, Layers, Sparkles, ListChecks, X
} from 'lucide-react';
import { Task } from '@/types/board';
import { useAuth } from '@/context/AuthContext';

type EntryType = 'user' | 'result-success' | 'result-error' | 'result-info' | 'result-warning' | 'confirm' | 'ai-response';

interface FeedEntry {
  id: string;
  type: EntryType;
  title: string;
  body?: string;
  tasks?: Task[];
  timestamp: Date;
  confirmAction?: () => void;
  confirmLabel?: string;
}

const AIChat: React.FC = () => {
  const { user } = useAuth();
  const isPaid = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';

  const {
    board, addTask, updateTask, deleteTask, moveTask,
    findTasksByTitle, findDuplicates, getColumnByName, bulkDeleteTasks
  } = useBoardContext();

  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isPaid) { setIsLoadingHistory(false); return; }
    const load = async () => {
      try {
        const res = await fetch('/api/ai/chat-history', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const entries: FeedEntry[] = [];
          data.history.forEach((item: any) => {
            entries.push({ id: `user-${item.id}`, type: 'user', title: item.prompt, timestamp: new Date(item.createdAt) });
            entries.push({ id: `ai-${item.id}`, type: 'ai-response', title: 'Planora', body: item.response, timestamp: new Date(item.createdAt) });
          });
          setFeed(entries);
        }
      } catch {
        try {
          const saved = localStorage.getItem('ta_ai_feed');
          if (saved) setFeed(JSON.parse(saved).map((e: any) => ({ ...e, timestamp: new Date(e.timestamp) })));
        } catch { /* ignore */ }
      } finally { setIsLoadingHistory(false); }
    };
    load();
  }, [isPaid]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { feedEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [feed]);

  const pushEntry = useCallback((entry: Omit<FeedEntry, 'id' | 'timestamp'>) => {
    setFeed(prev => [...prev, { ...entry, id: Date.now().toString() + Math.random().toString(36).slice(2), timestamp: new Date() }]);
  }, []);

  const clearHistory = async () => {
    try {
      await fetch('/api/ai/chat-history', { method: 'DELETE', credentials: 'include' });
      setFeed([]);
      localStorage.removeItem('ta_ai_feed');
    } catch { /* ignore */ }
  };

  const toggleExpand = (id: string) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const processCommand = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: text,
          extractActions: true,
          context: {
            tasks: board.tasks.map(t => ({ id: t.id, title: t.title, priority: t.priority, dueDate: t.dueDate, columnId: t.columnId })),
            columns: board.columns.map(c => ({ id: c.id, title: c.title })),
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errBody = data.details || data.error || 'Failed to get AI response.';
        const errHint = data.hint ? `\n\nTip: ${data.hint}` : '';
        pushEntry({ type: 'result-error', title: 'AI service error', body: errBody + errHint });
        return;
      }

      let actionData: any;
      try {
        let clean = data.response.trim();
        if (clean.startsWith('```json')) clean = clean.replace(/^```json\n?/, '').replace(/```$/, '');
        else if (clean.startsWith('```')) clean = clean.replace(/^```[a-z]*\n?/, '').replace(/```$/, '');
        actionData = JSON.parse(clean);
      } catch {
        let cleanText = data.response.replace(/\{[^}]*\}/g, '').replace(/\n\s*\n/g, '\n')
          .replace(/"action":\s*"[^"]*",?/g, '').replace(/"message":\s*/g, '').replace(/"/g, '').trim();
        pushEntry({ type: 'ai-response', title: 'Planora', body: cleanText || data.response });
        return;
      }

      if (actionData && typeof actionData === 'object' && actionData.action) {
        switch (actionData.action) {
          case 'create': {
            let columnId = board.columns[0]?.id;
            if (actionData.columnName) { const col = getColumnByName(actionData.columnName); if (col) columnId = col.id; }
            if (!columnId) { pushEntry({ type: 'result-error', title: 'No columns available', body: 'Create a column first.' }); return; }
            addTask(columnId, actionData.title, { description: actionData.description || '', priority: actionData.priority || 'none', dueDate: actionData.dueDate });
            const colName = board.columns.find(c => c.id === columnId)?.title || 'first column';
            pushEntry({ type: 'ai-response', title: 'Planora', body: `Task created: "${actionData.title}" → ${colName}${actionData.priority && actionData.priority !== 'none' ? ` · ${actionData.priority} priority` : ''}${actionData.dueDate ? ` · due ${actionData.dueDate}` : ''}` });
            break;
          }
          case 'delete': {
            const matches = findTasksByTitle(actionData.taskTitle);
            if (matches.length === 0) { pushEntry({ type: 'ai-response', title: 'Planora', body: `No task matching "${actionData.taskTitle}" was found.` }); }
            else if (matches.length === 1) {
              const task = matches[0];
              pushEntry({ type: 'confirm', title: `Delete "${task.title}"?`, body: 'This will permanently remove this task from your board.', tasks: [task], confirmLabel: 'Delete', confirmAction: () => { deleteTask(task.id); pushEntry({ type: 'ai-response', title: 'Planora', body: `"${task.title}" has been removed.` }); } });
            } else {
              pushEntry({ type: 'result-info', title: `Found ${matches.length} matching tasks`, body: `Multiple tasks match "${actionData.taskTitle}". Be more specific.`, tasks: matches });
            }
            break;
          }
          case 'move': {
            const matches = findTasksByTitle(actionData.taskTitle);
            const targetCol = getColumnByName(actionData.targetColumnName);
            if (matches.length === 0) { pushEntry({ type: 'ai-response', title: 'Planora', body: `No task matching "${actionData.taskTitle}" found.` }); }
            else if (!targetCol) { pushEntry({ type: 'ai-response', title: 'Planora', body: `No column named "${actionData.targetColumnName}".` }); }
            else { const task = matches[0]; moveTask(task.id, targetCol.id, 0); pushEntry({ type: 'ai-response', title: 'Planora', body: `"${task.title}" moved to ${targetCol.title}.` }); }
            break;
          }
          case 'update': {
            const matches = findTasksByTitle(actionData.taskTitle);
            if (matches.length === 0) { pushEntry({ type: 'ai-response', title: 'Planora', body: `No task matching "${actionData.taskTitle}" found.` }); }
            else { const task = matches[0]; updateTask(task.id, { priority: actionData.priority }); pushEntry({ type: 'ai-response', title: 'Planora', body: `"${task.title}" priority set to ${actionData.priority}.` }); }
            break;
          }
          case 'show_overdue': {
            const today = new Date().toISOString().split('T')[0];
            const overdue = board.tasks.filter(t => t.dueDate && t.dueDate < today);
            if (overdue.length === 0) { pushEntry({ type: 'ai-response', title: 'Planora', body: 'All your tasks are on track — no overdue items!' }); }
            else { pushEntry({ type: 'result-warning', title: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`, body: 'These tasks are past their due date:', tasks: overdue }); }
            break;
          }
          case 'clear_completed': {
            const doneCols = board.columns.filter(c => /done|completed|finish/i.test(c.title));
            const doneTasks = board.tasks.filter(t => doneCols.some(c => c.id === t.columnId));
            if (doneTasks.length === 0) { pushEntry({ type: 'ai-response', title: 'Planora', body: 'No completed tasks found in Done/Completed columns.' }); }
            else { pushEntry({ type: 'confirm', title: `Delete ${doneTasks.length} completed task${doneTasks.length > 1 ? 's' : ''}?`, body: 'This will permanently remove all tasks from Done/Completed columns.', tasks: doneTasks, confirmLabel: `Delete ${doneTasks.length} task${doneTasks.length > 1 ? 's' : ''}`, confirmAction: () => { bulkDeleteTasks(doneTasks.map(t => t.id)); pushEntry({ type: 'ai-response', title: 'Planora', body: `Removed ${doneTasks.length} completed task${doneTasks.length > 1 ? 's' : ''}.` }); } }); }
            break;
          }
          case 'find_duplicates': {
            const dupes = findDuplicates();
            if (dupes.size === 0) { pushEntry({ type: 'ai-response', title: 'Planora', body: 'All your tasks have unique titles — no duplicates found.' }); }
            else {
              const allDupeTasks: Task[] = [];
              const lines: string[] = [];
              dupes.forEach((tasks, key) => { lines.push(`"${tasks[0].title}" appears ${tasks.length} times`); tasks.slice(1).forEach(t => allDupeTasks.push(t)); });
              pushEntry({ type: 'confirm', title: `Found ${dupes.size} duplicate group${dupes.size > 1 ? 's' : ''}`, body: lines.join('\n') + `\n\nKeep the oldest copy and remove ${allDupeTasks.length} duplicate${allDupeTasks.length > 1 ? 's' : ''}?`, tasks: allDupeTasks, confirmLabel: `Remove ${allDupeTasks.length} duplicate${allDupeTasks.length > 1 ? 's' : ''}`, confirmAction: () => { bulkDeleteTasks(allDupeTasks.map(t => t.id)); pushEntry({ type: 'ai-response', title: 'Planora', body: `Removed ${allDupeTasks.length} duplicate task${allDupeTasks.length > 1 ? 's' : ''}.` }); } });
            }
            break;
          }
          case 'summarize': {
            const summary = board.columns.map(col => { const colTasks = board.tasks.filter(t => t.columnId === col.id); return `${col.title}: ${colTasks.length} task${colTasks.length !== 1 ? 's' : ''}`; }).join('\n');
            pushEntry({ type: 'result-info', title: `Board summary — ${board.tasks.length} total tasks`, body: summary || 'No columns yet.', tasks: board.tasks.slice(0, 10) });
            break;
          }
          case 'chat':
          default:
            pushEntry({ type: 'ai-response', title: 'Planora', body: actionData.message || 'I couldn\'t process that.' });
            break;
        }
      }
    } catch {
      pushEntry({ type: 'result-error', title: 'Connection failed', body: 'Could not reach the AI service. Make sure the server is running.' });
    } finally {
      setLoading(false);
    }
  }, [board, addTask, updateTask, deleteTask, moveTask, findTasksByTitle, findDuplicates, getColumnByName, bulkDeleteTasks, pushEntry]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    pushEntry({ type: 'user', title: input.trim() });
    processCommand(input.trim());
    setInput('');
  };

  const handleQuickAction = (prompt: string) => {
    pushEntry({ type: 'user', title: prompt });
    processCommand(prompt);
    inputRef.current?.focus();
  };

  const quickActions = [
    { icon: Copy, label: 'Find duplicates', prompt: 'Find and remove duplicate tasks', color: 'text-label-orange' },
    { icon: Search, label: 'Overdue tasks', prompt: 'Show overdue tasks', color: 'text-destructive' },
    { icon: ListChecks, label: 'Task summary', prompt: 'Show my tasks summary', color: 'text-label-blue' },
    { icon: Plus, label: 'Create task', prompt: 'I want to create a new task. Ask me for the details.', color: 'text-label-green' },
  ];

  const stripMarkdown = (text: string = '') =>
    text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/__ /g, '').replace(/_/g, '');

  const renderTaskCard = (task: Task) => {
    const col = board.columns.find(c => c.id === task.columnId);
    const priorityColors: Record<string, string> = {
      urgent: 'bg-priority-urgent/15 text-priority-urgent border-priority-urgent/20',
      high: 'bg-priority-high/15 text-priority-high border-priority-high/20',
      medium: 'bg-priority-medium/15 text-priority-medium border-priority-medium/20',
      low: 'bg-priority-low/15 text-priority-low border-priority-low/20',
    };
    return (
      <div key={task.id} className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg text-xs">
        <span className="font-medium text-foreground truncate flex-1">{task.title}</span>
        {task.priority !== 'none' && (
          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase ${priorityColors[task.priority] || 'bg-muted text-muted-foreground border-border'}`}>
            {task.priority}
          </span>
        )}
        {task.dueDate && (
          <span className="flex items-center gap-1 text-muted-foreground shrink-0">
            <Calendar className="w-3 h-3" />{task.dueDate}
          </span>
        )}
        {col && <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground shrink-0">{col.title}</span>}
      </div>
    );
  };

  if (!isPaid) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fade-in bg-background/50">
        <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-8 border border-primary/10 shadow-xl">
          <Wand2 className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-3xl font-black text-foreground mb-4">Meet Planora</h2>
        <p className="text-muted-foreground max-w-md mb-10 text-lg leading-relaxed">
          Unlock the power of natural language. Manage tasks, analyze productivity, and organize your life with your intelligent AI productivity partner.
        </p>
        <div className="flex flex-col gap-4 w-full max-w-sm">
          <button onClick={() => window.location.href = '/pricing'} className="flex items-center justify-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-black text-base hover:bg-primary/90 transition-all duration-300 hover:scale-[1.02] shadow-2xl shadow-primary/20">
            <Sparkles className="w-5 h-5 fill-current" />Upgrade to Pro
          </button>
          <button onClick={() => window.location.href = '/pricing'} className="px-8 py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">
            Learn more about AI features
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <header className="px-6 py-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Logo + Name + Tagline */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10 shrink-0">
              <Wand2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground leading-tight">Planora</h1>
              <p className="text-[11px] text-muted-foreground leading-tight">Your AI productivity partner</p>
            </div>
          </div>

          {/* Right: Stats + Clear + Ready */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-lg text-xs text-muted-foreground">
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="font-semibold text-foreground">{board.tasks.length}</span>
              <span>tasks</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-lg text-xs text-muted-foreground">
              <Flag className="w-3.5 h-3.5 shrink-0" />
              <span className="font-semibold text-foreground">{board.columns.length}</span>
              <span>columns</span>
            </div>
            <button
              onClick={clearHistory}
              disabled={feed.length === 0}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </button>
            <div className="flex items-center gap-1.5 pl-1">
              <div className="w-2 h-2 rounded-full bg-label-green animate-pulse-soft shrink-0" />
              <span className="text-xs text-muted-foreground">Ready</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Conversation Area ── */}
      <div className="flex-1 overflow-y-auto">
        {isLoadingHistory ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Loader2 className="w-7 h-7 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Loading conversation history...</p>
          </div>
        ) : feed.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12 animate-fade-in">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center border border-primary/10 mb-4">
              <Wand2 className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-base font-semibold text-foreground mb-1">Planora</h2>
            <p className="text-sm text-muted-foreground max-w-sm mb-2 leading-relaxed">
              Create, delete, move, and manage tasks using natural language. Try a quick action or type your own command.
            </p>
          </div>
        ) : (
          /* Message list */
          <div className="divide-y divide-border/50">
            {feed.map((entry) => {
              const timeStr = entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              const isExpanded = expandedMessages.has(entry.id);
              const isLong = entry.title.length > 80;

              if (entry.type === 'user') {
                return (
                  <div key={entry.id} className="px-6 py-3 flex items-start gap-2 hover:bg-muted/20 transition-colors group">
                    <button
                      onClick={() => isLong && toggleExpand(entry.id)}
                      className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center shrink-0 transition-all ${isLong ? 'hover:bg-primary/10 cursor-pointer' : 'cursor-default opacity-50'}`}
                    >
                      <ChevronRight className={`w-3.5 h-3.5 text-primary transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>
                    <p className={`flex-1 text-sm text-foreground leading-relaxed ${!isExpanded && isLong ? 'line-clamp-1' : ''}`}>
                      {entry.title}
                    </p>
                    <span className="text-[11px] text-muted-foreground shrink-0 mt-0.5">{timeStr}</span>
                  </div>
                );
              }

              /* Planora / result / confirm entries */
              const isWarning = entry.type === 'result-warning';
              const isError = entry.type === 'result-error';
              const isConfirm = entry.type === 'confirm';
              const isInfo = entry.type === 'result-info';

              return (
                <div key={entry.id} className={`px-6 py-4 animate-slide-up ${isError ? 'bg-destructive/3' : isWarning || isConfirm ? 'bg-label-orange/3' : ''}`}>
                  {/* Planora label row */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10 shrink-0">
                        {isError ? <XCircle className="w-3 h-3 text-destructive" /> :
                         isWarning || isConfirm ? <AlertTriangle className="w-3 h-3 text-label-orange" /> :
                         isInfo ? <Layers className="w-3 h-3 text-label-blue" /> :
                         <Wand2 className="w-3 h-3 text-primary" />}
                      </div>
                      <span className="text-xs font-semibold text-foreground">
                        {isError ? 'Error' : isConfirm ? 'Confirmation needed' : isWarning ? 'Warning' : isInfo ? entry.title : 'Planora'}
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{timeStr}</span>
                  </div>

                  {/* Content */}
                  {(entry.body || (isInfo && entry.title)) && (
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap ml-7 mb-2">
                      {stripMarkdown(entry.body || (isInfo ? '' : entry.title))}
                    </p>
                  )}

                  {/* Task cards */}
                  {entry.tasks && entry.tasks.length > 0 && (
                    <div className="ml-7 mt-2 space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {entry.tasks.slice(0, 8).map(renderTaskCard)}
                      {entry.tasks.length > 8 && (
                        <p className="text-xs text-muted-foreground px-1">+{entry.tasks.length - 8} more</p>
                      )}
                    </div>
                  )}

                  {/* Confirm buttons */}
                  {entry.type === 'confirm' && entry.confirmAction && (
                    <div className="ml-7 flex items-center gap-2 mt-3 pt-3 border-t border-border/60">
                      <button
                        onClick={() => { entry.confirmAction!(); setFeed(prev => prev.filter(e => e.id !== entry.id)); }}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {entry.confirmLabel || 'Confirm'}
                      </button>
                      <button
                        onClick={() => { setFeed(prev => prev.filter(e => e.id !== entry.id)); pushEntry({ type: 'ai-response', title: 'Planora', body: 'Action cancelled.' }); }}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-muted-foreground bg-muted hover:bg-muted/80 rounded-lg transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Loading indicator */}
            {loading && (
              <div className="px-6 py-4">
                <div className="flex items-center gap-2 ml-7">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-muted-foreground">Planora is thinking...</span>
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={feedEndRef} />
      </div>

      {/* ── Bottom Bar ── */}
      <div className="shrink-0 border-t border-border bg-card">
        {/* Quick action row */}
        <div className="px-6 pt-3 pb-2 flex items-center gap-2 overflow-x-auto scrollbar-none">
          {quickActions.map((action, i) => (
            <button
              key={i}
              onClick={() => handleQuickAction(action.prompt)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted hover:bg-muted/70 rounded-lg transition-colors whitespace-nowrap disabled:opacity-40 shrink-0"
            >
              <action.icon className={`w-3.5 h-3.5 ${action.color} shrink-0`} />
              <span className="text-foreground/80 font-medium">{action.label}</span>
            </button>
          ))}
        </div>

        {/* Input row */}
        <div className="px-6 pb-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Try: Create a task called... or Find duplicates'
              disabled={loading}
              className="flex-1 bg-muted border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 disabled:opacity-50 transition-all"
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </form>
        </div>

        {/* Capability dots */}
        <div className="px-6 pb-3 flex items-center gap-4">
          {[
            { label: 'Create', color: 'bg-label-green' },
            { label: 'Delete', color: 'bg-destructive' },
            { label: 'Move', color: 'bg-label-blue' },
            { label: 'Update', color: 'bg-label-orange' },
            { label: 'Analyse', color: 'bg-label-purple' },
          ].map(({ label, color }) => (
            <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={`w-1.5 h-1.5 rounded-full ${color} shrink-0`} />{label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AIChat;
