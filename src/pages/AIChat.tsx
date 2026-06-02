import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import {
  Wand2, Send, Loader2, Plus, Trash2, ArrowRightLeft, Search,
  Copy, CheckCircle2, XCircle, AlertTriangle, ArrowUpDown,
  ChevronRight, X, Calendar, Flag, Layers, Sparkles, ListChecks
} from 'lucide-react';
import { Task } from '@/types/board';
import { useAuth } from '@/context/AuthContext';

// ─── Types ───────────────────────────────────────────────────────────
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

// ─── Component ───────────────────────────────────────────────────────
const AIChat: React.FC = () => {
  const { user } = useAuth();
  const isPaid = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  
  const {
    board, addTask, updateTask, deleteTask, moveTask,
    findTasksByTitle, findDuplicates, getColumnByName, bulkDeleteTasks
  } = useBoardContext();

  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Load conversation history from database
  useEffect(() => {
    if (!isPaid) {
      setIsLoadingHistory(false);
      return;
    }

    const loadHistory = async () => {
      try {
        const response = await fetch('/api/ai/chat-history', {
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          const historyEntries: FeedEntry[] = [];
          
          data.history.forEach((item: any) => {
            // Add user message
            historyEntries.push({
              id: `user-${item.id}`,
              type: 'user',
              title: item.prompt,
              timestamp: new Date(item.createdAt),
            });
            
            // Add AI response
            historyEntries.push({
              id: `ai-${item.id}`,
              type: 'ai-response',
              title: 'Planora',
              body: item.response,
              timestamp: new Date(item.createdAt),
            });
          });
          
          setFeed(historyEntries);
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
        // Fallback to localStorage if database fails
        try {
          const saved = localStorage.getItem('ta_ai_feed');
          if (saved) {
            const parsed = JSON.parse(saved);
            setFeed(parsed.map((entry: any) => ({
              ...entry,
              timestamp: new Date(entry.timestamp)
            })));
          }
        } catch (e) {
          console.error("Failed to parse localStorage feed", e);
        }
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [isPaid]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [feed]);

  const pushEntry = useCallback((entry: Omit<FeedEntry, 'id' | 'timestamp'>) => {
    setFeed(prev => [...prev, {
      ...entry,
      id: Date.now().toString() + Math.random().toString(36).slice(2),
      timestamp: new Date(),
    }]);
  }, []);

  const clearHistory = async () => {
    try {
      await fetch('/api/ai/chat-history', {
        method: 'DELETE',
        credentials: 'include',
      });
      setFeed([]);
      localStorage.removeItem('ta_ai_feed');
    } catch (error) {
      console.error('Failed to clear chat history:', error);
    }
  };

  // ─── Command Processing Engine ─────────────────────────────────────
  const processCommand = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: text,
          extractActions: true,
          context: {
            tasks: board.tasks.map(t => ({
              id: t.id,
              title: t.title,
              priority: t.priority,
              dueDate: t.dueDate,
              columnId: t.columnId,
            })),
            columns: board.columns.map(c => ({ id: c.id, title: c.title })),
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        pushEntry({
          type: 'result-error',
          title: 'AI service error',
          body: data.error || 'Failed to get AI response. Check your API key configuration.',
        });
        return;
      }

      // Try to parse the AI response as a JSON action
      let actionData;
      try {
        let cleanResponse = data.response.trim();
        // Sometimes the AI wraps JSON in code blocks despite rules
        if (cleanResponse.startsWith('```json')) {
          cleanResponse = cleanResponse.replace(/^```json\n?/, '').replace(/```$/, '');
        } else if (cleanResponse.startsWith('```')) {
          cleanResponse = cleanResponse.replace(/^```[a-z]*\n?/, '').replace(/```$/, '');
        }
        actionData = JSON.parse(cleanResponse);
      } catch (e) {
        // Not valid JSON - clean up any JSON-like artifacts and show as chat response
        let cleanText = data.response
          .replace(/\{[^}]*\}/g, '') // Remove JSON objects
          .replace(/\n\s*\n/g, '\n') // Remove empty lines
          .replace(/"action":\s*"[^"]*",?/g, '')
          .replace(/"message":\s*/g, '')
          .replace(/"/g, '')
          .trim();
        pushEntry({ type: 'ai-response', title: 'Response', body: cleanText || data.response });
        return;
      }

      if (actionData && typeof actionData === 'object' && actionData.action) {
        switch(actionData.action) {
          case 'create': {
            let columnId = board.columns[0]?.id;
            if (actionData.columnName) {
              const col = getColumnByName(actionData.columnName);
              if (col) columnId = col.id;
            }
            if (!columnId) {
              pushEntry({ type: 'result-error', title: 'No columns available', body: 'Create a column first before adding tasks.' });
              return;
            }
            addTask(columnId, actionData.title, {
              description: actionData.description || '',
              priority: actionData.priority || 'none',
              dueDate: actionData.dueDate
            });
            const colName = board.columns.find(c => c.id === columnId)?.title || 'first column';
            pushEntry({
              type: 'result-success',
              title: 'Task created',
              body: `"${actionData.title}" added to ${colName}${actionData.priority && actionData.priority !== 'none' ? ` • ${actionData.priority} priority` : ''}${actionData.dueDate ? ` • due ${actionData.dueDate}` : ''}`,
            });
            break;
          }
          case 'delete': {
            const matches = findTasksByTitle(actionData.taskTitle);
            if (matches.length === 0) {
              pushEntry({ type: 'result-error', title: 'Task not found', body: `No task matching "${actionData.taskTitle}" was found.` });
            } else if (matches.length === 1) {
              const task = matches[0];
              pushEntry({
                type: 'confirm',
                title: `Delete "${task.title}"?`,
                body: `This will permanently remove this task from your board.`,
                tasks: [task],
                confirmLabel: 'Delete',
                confirmAction: () => {
                  deleteTask(task.id);
                  pushEntry({ type: 'result-success', title: 'Task deleted', body: `"${task.title}" has been removed.` });
                },
              });
            } else {
              pushEntry({
                type: 'result-info',
                title: `Found ${matches.length} matching tasks`,
                body: `Multiple tasks match "${actionData.taskTitle}". Be more specific.`,
                tasks: matches,
              });
            }
            break;
          }
          case 'move': {
            const matches = findTasksByTitle(actionData.taskTitle);
            const targetCol = getColumnByName(actionData.targetColumnName);
            if (matches.length === 0) {
              pushEntry({ type: 'result-error', title: 'Task not found', body: `No task matching "${actionData.taskTitle}" found.` });
            } else if (!targetCol) {
              pushEntry({ type: 'result-error', title: 'Column not found', body: `No column named "${actionData.targetColumnName}".` });
            } else {
              const task = matches[0];
              moveTask(task.id, targetCol.id, 0);
              pushEntry({ type: 'result-success', title: 'Task moved', body: `"${task.title}" moved to ${targetCol.title}.` });
            }
            break;
          }
          case 'update': {
            const matches = findTasksByTitle(actionData.taskTitle);
            if (matches.length === 0) {
              pushEntry({ type: 'result-error', title: 'Task not found', body: `No task matching "${actionData.taskTitle}" found.` });
            } else {
              const task = matches[0];
              updateTask(task.id, { priority: actionData.priority });
              pushEntry({ type: 'result-success', title: 'Priority updated', body: `"${task.title}" priority set to ${actionData.priority}.` });
            }
            break;
          }
          case 'show_overdue': {
            const today = new Date().toISOString().split('T')[0];
            const overdue = board.tasks.filter(t => t.dueDate && t.dueDate < today);
            if (overdue.length === 0) {
              pushEntry({ type: 'result-success', title: 'No overdue tasks', body: 'All your tasks are on track!' });
            } else {
              pushEntry({ type: 'result-warning', title: `${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}`, tasks: overdue });
            }
            break;
          }
          case 'clear_completed': {
            const doneCols = board.columns.filter(c => /done|completed|finish/i.test(c.title));
            const doneTasks = board.tasks.filter(t => doneCols.some(c => c.id === t.columnId));
            if (doneTasks.length === 0) {
              pushEntry({ type: 'result-info', title: 'No completed tasks', body: 'No tasks found in Done/Completed columns.' });
            } else {
              pushEntry({
                type: 'confirm',
                title: `Delete ${doneTasks.length} completed task${doneTasks.length > 1 ? 's' : ''}?`,
                body: 'This will permanently remove all tasks from Done/Completed columns.',
                tasks: doneTasks,
                confirmLabel: `Delete ${doneTasks.length} task${doneTasks.length > 1 ? 's' : ''}`,
                confirmAction: () => {
                  bulkDeleteTasks(doneTasks.map(t => t.id));
                  pushEntry({ type: 'result-success', title: 'Completed tasks cleared', body: `Removed ${doneTasks.length} completed task${doneTasks.length > 1 ? 's' : ''}.` });
                },
              });
            }
            break;
          }
          case 'find_duplicates': {
            const dupes = findDuplicates();
            if (dupes.size === 0) {
              pushEntry({ type: 'result-success', title: 'No duplicates found', body: 'All your tasks have unique titles.' });
            } else {
              const allDupeTasks: Task[] = [];
              const lines: string[] = [];
              dupes.forEach((tasks, key) => {
                lines.push(`• "${tasks[0].title}" appears ${tasks.length} times`);
                tasks.slice(1).forEach(t => allDupeTasks.push(t));
              });
              pushEntry({
                type: 'confirm',
                title: `Found ${dupes.size} duplicate group${dupes.size > 1 ? 's' : ''}`,
                body: `${lines.join('\n')}\n\nKeep the oldest copy and remove ${allDupeTasks.length} duplicate${allDupeTasks.length > 1 ? 's' : ''}?`,
                tasks: allDupeTasks,
                confirmLabel: `Remove ${allDupeTasks.length} duplicate${allDupeTasks.length > 1 ? 's' : ''}`,
                confirmAction: () => {
                  bulkDeleteTasks(allDupeTasks.map(t => t.id));
                  pushEntry({ type: 'result-success', title: 'Duplicates removed', body: `Removed ${allDupeTasks.length} duplicate task${allDupeTasks.length > 1 ? 's' : ''}.` });
                },
              });
            }
            break;
          }
          case 'summarize': {
            const columnSummary = board.columns.map(col => {
              const colTasks = board.tasks.filter(t => t.columnId === col.id);
              return `${col.title}: ${colTasks.length} task${colTasks.length !== 1 ? 's' : ''}`;
            }).join('\n');
            pushEntry({
              type: 'result-info',
              title: `Board: ${board.tasks.length} total tasks`,
              body: columnSummary || 'No columns yet.',
              tasks: board.tasks.slice(0, 10),
            });
            break;
          }
          case 'chat':
          default:
            pushEntry({ type: 'ai-response', title: 'Response', body: actionData.message || 'I couldn\'t process that action.' });
            break;
        }
      }
    } catch (error: any) {
      pushEntry({
        type: 'result-error',
        title: 'Connection failed',
        body: 'Could not reach the AI service. Make sure the server is running.',
      });
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
  };

  // ─── Quick Actions ─────────────────────────────────────────────────
  const quickActions = [
    { icon: Copy, label: 'Find duplicates', prompt: 'Find and remove duplicate tasks', color: 'text-label-orange' },
    { icon: Search, label: 'Overdue tasks', prompt: 'Show overdue tasks', color: 'text-destructive' },
    { icon: ListChecks, label: 'Task summary', prompt: 'Show my tasks summary', color: 'text-label-blue' },
    { icon: Plus, label: 'Create task', prompt: 'Create a task called "New Task" with medium priority', color: 'text-label-green' },
    { icon: Trash2, label: 'Clear completed', prompt: 'Delete all completed tasks', color: 'text-muted-foreground' },
    { icon: Sparkles, label: 'Analyze tasks', prompt: 'Analyze my tasks and give me productivity insights', color: 'text-label-purple' },
  ];

  // Strip markdown formatting (especially **) from AI text
  const stripMarkdown = (text: string = ''): string => {
    return text.replace(/\*\*/g, '').replace(/\*/g, '').replace(/__ /g, '').replace(/_/g, '');
  };

  // ─── Render Helpers ────────────────────────────────────────────────
  const getEntryIcon = (type: EntryType) => {
    switch (type) {
      case 'result-success': return <CheckCircle2 className="w-4 h-4 text-label-green" />;
      case 'result-error': return <XCircle className="w-4 h-4 text-destructive" />;
      case 'result-warning': return <AlertTriangle className="w-4 h-4 text-label-orange" />;
      case 'result-info': return <Layers className="w-4 h-4 text-label-blue" />;
      case 'confirm': return <AlertTriangle className="w-4 h-4 text-label-orange" />;
      case 'ai-response': return <Sparkles className="w-4 h-4 text-label-purple" />;
      default: return <ChevronRight className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getEntryCardClass = (type: EntryType) => {
    switch (type) {
      case 'result-success': return 'ta-action-card ta-result-success';
      case 'result-error': return 'ta-action-card ta-result-error';
      case 'result-warning': return 'ta-action-card ta-result-warning';
      case 'result-info': return 'ta-action-card ta-result-info';
      case 'confirm': return 'ta-action-card ta-result-warning';
      case 'ai-response': return 'ta-action-card ta-result-info';
      default: return '';
    }
  };

  const renderTaskMini = (task: Task) => {
    const col = board.columns.find(c => c.id === task.columnId);
    return (
      <div key={task.id} className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg text-xs">
        <span className="font-medium text-foreground truncate flex-1">{task.title}</span>
        {task.priority !== 'none' && (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
            task.priority === 'urgent' ? 'bg-priority-urgent/20 text-priority-urgent' :
            task.priority === 'high' ? 'bg-priority-high/20 text-priority-high' :
            task.priority === 'medium' ? 'bg-priority-medium/20 text-priority-medium' :
            'bg-priority-low/20 text-priority-low'
          }`}>{task.priority}</span>
        )}
        {task.dueDate && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="w-3 h-3" />
            {task.dueDate}
          </span>
        )}
        {col && (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">{col.title}</span>
        )}
      </div>
    );
  };

  // ─── Render ────────────────────────────────────────────────────────
  if (!isPaid) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-fade-in bg-background/50">
        <div className="w-24 h-24 rounded-[2rem] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-8 border border-primary/10 shadow-xl">
          <Wand2 className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-3xl font-black text-foreground mb-4">Meet Planora</h2>
        <p className="text-muted-foreground max-w-md mb-10 text-lg leading-relaxed">
          Unlock the power of natural language. Manage tasks, analyze productivity, and organize your life with our intelligent AI co-pilot.
        </p>
        <div className="flex flex-col gap-4 w-full max-w-sm">
          <button
            onClick={() => window.location.href = '/pricing'}
            className="flex items-center justify-center gap-3 px-8 py-4 bg-primary text-primary-foreground rounded-2xl font-black text-base hover:bg-primary/90 transition-all duration-300 hover:scale-[1.02] shadow-2xl shadow-primary/20"
          >
            <Sparkles className="w-5 h-5 fill-current" />
            Upgrade to Pro
          </button>
          <button
            onClick={() => window.location.href = '/pricing'}
            className="px-8 py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            Learn more about AI features
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* ── Header ── */}
      <header className="px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/10">
              <Wand2 className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground tracking-tight">Planora</h1>
              <p className="text-xs text-muted-foreground">Your AI productivity partner</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg text-xs text-muted-foreground">
              <Layers className="w-3.5 h-3.5" />
              <span className="font-medium">{board.tasks.length}</span>
              <span>tasks</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted rounded-lg text-xs text-muted-foreground">
              <Flag className="w-3.5 h-3.5" />
              <span className="font-medium">{board.columns.length}</span>
              <span>columns</span>
            </div>
            {feed.length > 0 && (
              <button
                onClick={clearHistory}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 text-destructive rounded-lg text-xs hover:bg-destructive/20 transition-colors"
                title="Clear chat history"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-label-green animate-pulse-soft" />
              <span className="text-xs text-muted-foreground">Ready</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Feed ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-3">
        {isLoadingHistory ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Loading conversation history...</p>
          </div>
        ) : feed.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center border border-primary/10 mb-4">
              <Wand2 className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Planora</h2>
            <p className="text-sm text-muted-foreground max-w-md mb-6">
              Create, delete, move, and manage tasks using natural language. Try a quick action below or type your own command.
            </p>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 w-full max-w-lg">
              {quickActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => handleQuickAction(action.prompt)}
                  disabled={loading}
                  className="flex items-center gap-2.5 px-4 py-3 text-sm bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 transition-all duration-200 text-left disabled:opacity-50 group"
                >
                  <action.icon className={`w-4 h-4 ${action.color} transition-transform duration-200 group-hover:scale-110`} />
                  <span className="text-foreground font-medium">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {feed.map((entry, idx) => (
          <div
            key={entry.id}
            className="animate-slide-up"
            style={{ animationDelay: `${Math.min(idx * 30, 150)}ms` }}
          >
            {/* User command */}
            {entry.type === 'user' && (
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center">
                  <ChevronRight className="w-3 h-3 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">{entry.title}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}

            {/* Result cards */}
            {entry.type !== 'user' && (
              <div className={`${getEntryCardClass(entry.type)} animate-scale-in`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">{getEntryIcon(entry.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-foreground">{entry.title}</h3>
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {entry.body && (
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap leading-relaxed">{stripMarkdown(entry.body)}</p>
                    )}
                    {entry.tasks && entry.tasks.length > 0 && (
                      <div className="mt-3 space-y-1.5 max-h-40 overflow-y-auto">
                        {entry.tasks.slice(0, 8).map(renderTaskMini)}
                        {entry.tasks.length > 8 && (
                          <p className="text-xs text-muted-foreground px-3">+{entry.tasks.length - 8} more...</p>
                        )}
                      </div>
                    )}
                    {/* Confirmation buttons */}
                    {entry.type === 'confirm' && entry.confirmAction && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                        <button
                          onClick={() => {
                            entry.confirmAction!();
                            // Remove confirm entry and replace with result
                            setFeed(prev => prev.filter(e => e.id !== entry.id));
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {entry.confirmLabel || 'Confirm'}
                        </button>
                        <button
                          onClick={() => {
                            setFeed(prev => prev.filter(e => e.id !== entry.id));
                            pushEntry({ type: 'result-info', title: 'Action cancelled' });
                          }}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground bg-muted rounded-lg hover:bg-muted/80 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="ta-action-card ta-result-info animate-scale-in">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-label-blue" />
              <span className="text-sm text-muted-foreground">Processing...</span>
            </div>
          </div>
        )}

        <div ref={feedEndRef} />
      </div>

      {/* ── Quick Actions Bar (shown when there's content) ── */}
      {feed.length > 0 && (
        <div className="px-6 pb-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {quickActions.slice(0, 4).map((action, i) => (
              <button
                key={i}
                onClick={() => handleQuickAction(action.prompt)}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
              >
                <action.icon className={`w-3 h-3 ${action.color}`} />
                <span className="text-muted-foreground">{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Input ── */}
      <div className="px-6 py-4 border-t border-border bg-card">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Try: "Create a task called..." or "Find duplicates"'
              disabled={loading}
              className="w-full bg-muted border border-border rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 disabled:opacity-50 transition-all duration-200"
            />
          </div>
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="px-4 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 hover:shadow-lg hover:shadow-primary/10"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-label-green" /> Create
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-destructive" /> Delete
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-label-blue" /> Move
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-label-orange" /> Update
          </span>
          <span className="flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-label-purple" /> Analyze
          </span>
        </div>
      </div>
    </div>
  );
};

export default AIChat;