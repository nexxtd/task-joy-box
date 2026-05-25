import React, { useMemo, useState } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { Attachment, Priority, PRIORITY_CONFIG, Task } from '@/types/board';
import {
  ArrowDownAz,
  Brain,
  CalendarClock,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Circle,
  MoreHorizontal,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useDeepFocus } from '@/hooks/useDeepFocus';

const PRIORITY_FILTERS: Array<'all' | 'urgent' | 'high' | 'medium' | 'low'> = ['all', 'urgent', 'high', 'medium', 'low'];

const formatDate = (value?: string) => {
  if (!value) return 'No due date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const isTaskCompleted = (task: Task, completedColumnIds: Set<string>) => {
  return Boolean(task.completed || completedColumnIds.has(task.columnId));
};

const daysUntilAutoDelete = (completedAt?: string) => {
  if (!completedAt) return 5;
  const started = new Date(completedAt);
  if (Number.isNaN(started.getTime())) return 5;
  const expires = new Date(started);
  expires.setDate(expires.getDate() + 5);
  const diff = expires.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
};

interface NewTaskSubtaskDraft {
  id: string;
  text: string;
  durationMinutes: number;
}

const Tasks: React.FC = () => {
  const {
    board,
    addTask,
    updateTask,
    reorderTasks,
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
  } = useBoardContext();
  const { user } = useAuth();
  const { open: openDeepFocus } = useDeepFocus();

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);

  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'high' | 'medium' | 'low'>('all');
  const [groupFilterId, setGroupFilterId] = useState<string | null>(null);
  const [sortByDueDate, setSortByDueDate] = useState(false);

  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskDueTime, setNewTaskDueTime] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState<number>(60);
  const [newTaskColumnId, setNewTaskColumnId] = useState<string>('');
  const [newTaskSubtasks, setNewTaskSubtasks] = useState<NewTaskSubtaskDraft[]>([]);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newSubtaskDuration, setNewSubtaskDuration] = useState<number>(10);
  const [newChecklistItems, setNewChecklistItems] = useState<string[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [prioritizing, setPrioritizing] = useState(false);
  const [completedOpen, setCompletedOpen] = useState(true);

  const completedColumnIds = useMemo(() => {
    return new Set(
      board.columns
        .filter(c => c.title.toLowerCase().trim() === 'completed')
        .map(c => c.id)
    );
  }, [board.columns]);

  const isPremium = user?.subscriptionTier === 'premium';

  const filtered = useMemo(() => {
    const bySearch = board.tasks.filter(task =>
      task.title.toLowerCase().includes(search.toLowerCase().trim())
    );

    const byPriority = bySearch.filter(task => {
      if (priorityFilter === 'all') return true;
      return task.priority === priorityFilter;
    });

    const byGroup = byPriority.filter(task => {
      if (!groupFilterId) return true;
      return task.columnId === groupFilterId;
    });

    const active = byGroup.filter(task => !isTaskCompleted(task, completedColumnIds));
    const completed = byGroup.filter(task => isTaskCompleted(task, completedColumnIds));

    const sortByDue = (a: Task, b: Task) => {
      const aDate = a.dueDate ? new Date(`${a.dueDate}T${a.dueTime || '23:59'}`) : null;
      const bDate = b.dueDate ? new Date(`${b.dueDate}T${b.dueTime || '23:59'}`) : null;
      if (!aDate) return 1;
      if (!bDate) return -1;
      return aDate.getTime() - bDate.getTime();
    };

    const sortByPriorityOrder = (a: Task, b: Task) => {
      const order = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      const diff = order[a.priority] - order[b.priority];
      if (diff !== 0) return diff;
      return (a.order || 0) - (b.order || 0);
    };

    const activeSorted = [...active].sort(sortByDueDate ? sortByDue : sortByPriorityOrder);
    const completedSorted = [...completed].sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    });

    return { active: activeSorted, completed: completedSorted };
  }, [board.tasks, completedColumnIds, groupFilterId, priorityFilter, search, sortByDueDate]);

  const matchingCount = filtered.active.length + filtered.completed.length;

  const openTask = openTaskId ? board.tasks.find(task => task.id === openTaskId) ?? null : null;

  const handleAiPrioritize = async () => {
    if (!isPremium || prioritizing) return;
    setPrioritizing(true);
    try {
      const res = await fetch('/api/ai/premium/ai-prioritize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tasks: board.tasks }),
      });
      if (res.ok) {
        const orderedIds = await res.json();
        reorderTasks(orderedIds);
      }
    } catch (err) {
      console.error('AI Prioritize error:', err);
    } finally {
      setPrioritizing(false);
    }
  };

  const toggleTaskCompletion = (task: Task) => {
    const currentlyCompleted = isTaskCompleted(task, completedColumnIds);
    if (currentlyCompleted) {
      updateTask(task.id, { completed: false, completedAt: undefined });
      return;
    }
    updateTask(task.id, { completed: true, completedAt: new Date().toISOString() });
  };

  const toggleExpand = (taskId: string) => {
    setExpandedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const addSubtaskDraft = () => {
    if (!newSubtaskText.trim()) return;
    setNewTaskSubtasks(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        text: newSubtaskText.trim(),
        durationMinutes: Math.max(0, Number(newSubtaskDuration) || 0),
      },
    ]);
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
  };

  const addChecklistDraft = () => {
    if (!newChecklistText.trim()) return;
    setNewChecklistItems(prev => [...prev, newChecklistText.trim()]);
    setNewChecklistText('');
  };

  const resetTaskDraft = () => {
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskPriority('medium');
    setNewTaskDueDate('');
    setNewTaskDueTime('');
    setNewTaskDuration(60);
    setNewTaskColumnId('');
    setNewTaskSubtasks([]);
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
    setNewChecklistItems([]);
    setNewChecklistText('');
    setNewFiles([]);
  };

  const createTask = async () => {
    if (!newTaskTitle.trim()) return;
    const targetColumnId = newTaskColumnId || board.columns[0]?.id;
    if (!targetColumnId) return;

    const taskId = crypto.randomUUID();
    const checklistItems = newChecklistItems.map(text => ({
      id: crypto.randomUUID(),
      text,
      completed: false,
    }));

    addTask(targetColumnId, newTaskTitle.trim(), {
      id: taskId,
      description: newTaskDescription,
      priority: newTaskPriority,
      dueDate: newTaskDueDate || undefined,
      dueTime: newTaskDueTime || undefined,
      duration: Math.max(0, Number(newTaskDuration) || 0),
      subtasks: newTaskSubtasks.map(st => ({
        id: st.id,
        text: st.text,
        completed: false,
        durationMinutes: st.durationMinutes,
      })),
      checklists: checklistItems.length
        ? [{ id: crypto.randomUUID(), title: 'Checklist', items: checklistItems }]
        : [],
      completed: false,
    });

    if (newFiles.length > 0) {
      for (const file of newFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('taskId', taskId);
        try {
          await fetch('/api/attachments/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });
        } catch (err) {
          console.error('Failed to upload file:', file.name, err);
        }
      }
    }

    resetTaskDraft();
    setAddingTask(false);
  };

  if (openTask) {
    return (
      <TaskFullView
        task={openTask}
        onBack={() => setOpenTaskId(null)}
        boardColumns={board.columns}
        onUpdateTask={updateTask}
        onToggleChecklistItem={toggleChecklistItem}
        onAddChecklistItem={addChecklistItem}
        onDeleteChecklistItem={deleteChecklistItem}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-card/30">
        <div>
          <h1 className="text-lg font-bold text-foreground">All Tasks</h1>
          <p className="text-xs text-muted-foreground">{matchingCount} tasks matching filters</p>
        </div>
        <button
          onClick={() => setAddingTask(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all"
        >
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </header>

      <div className="px-6 py-4 border-b border-border bg-card/10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tasks by title..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-muted/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border">
            {PRIORITY_FILTERS.map(priority => (
              <button
                key={priority}
                onClick={() => setPriorityFilter(priority)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                  priorityFilter === priority
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {priority === 'all' ? 'All' : priority.charAt(0).toUpperCase() + priority.slice(1)}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border">
            {board.columns.map(column => (
              <button
                key={column.id}
                onClick={() => setGroupFilterId(prev => (prev === column.id ? null : column.id))}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                  groupFilterId === column.id
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {column.title}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setSortByDueDate(prev => !prev)}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border transition-all ${
                sortByDueDate
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <ArrowDownAz className="w-3.5 h-3.5" />
              Sort by Due Date
            </button>
            <button
              onClick={handleAiPrioritize}
              disabled={prioritizing || !isPremium}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 transition-all ${
                (!isPremium || prioritizing) && 'opacity-50 cursor-not-allowed'
              }`}
              title={!isPremium ? 'Premium feature: AI Prioritization' : ''}
            >
              {prioritizing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {prioritizing ? 'Prioritizing...' : 'AI Prioritise'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {filtered.active.length === 0 && filtered.completed.length === 0 && (
            <div className="text-center py-16">
              <CheckSquare className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No tasks found</p>
            </div>
          )}

          {filtered.active.map(task => {
            const column = board.columns.find(c => c.id === task.columnId);
            const isOverdue = Boolean(task.dueDate && new Date(task.dueDate) < new Date());
            const isExpanded = expandedTaskIds.includes(task.id);
            const subtasksDone = (task.subtasks || []).length > 0 && task.subtasks.every(st => st.completed);

            return (
              <div
                key={task.id}
                className="border border-border rounded-xl bg-card transition-all duration-300"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggleTaskCompletion(task)}
                    className="text-muted-foreground hover:text-label-green transition-colors"
                    title="Mark complete"
                  >
                    <Circle className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => setOpenTaskId(task.id)}
                    className="text-sm font-medium text-left text-foreground hover:text-primary truncate"
                  >
                    {task.title}
                  </button>

                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      In Progress
                    </span>
                    {task.dueDate && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${isOverdue ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>
                        {formatDate(task.dueDate)}
                      </span>
                    )}
                    {subtasksDone && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        All sub-tasks done
                      </span>
                    )}
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    {column && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: column.color, color: 'hsl(var(--primary-foreground))' }}
                      >
                        {column.title}
                      </span>
                    )}
                    <button
                      onClick={() => toggleExpand(task.id)}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => openDeepFocus(task)}
                      className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary"
                      title="Open Deep Focus"
                    >
                      <Brain className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border px-4 py-3 space-y-4 bg-muted/20">
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Sub-tasks</h4>
                      {task.subtasks.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No sub-tasks</p>
                      ) : (
                        <div className="space-y-2">
                          {task.subtasks.map(subtask => (
                            <div key={subtask.id} className="flex items-center gap-3 text-sm">
                              <button
                                onClick={() => {
                                  const updated = task.subtasks.map(st =>
                                    st.id === subtask.id ? { ...st, completed: !st.completed } : st
                                  );
                                  updateTask(task.id, { subtasks: updated });
                                }}
                                className="text-muted-foreground hover:text-label-green"
                              >
                                {subtask.completed ? <CheckCircle2 className="w-4 h-4 text-label-green" /> : <Circle className="w-4 h-4" />}
                              </button>
                              <span className={subtask.completed ? 'line-through text-muted-foreground' : 'text-foreground'}>{subtask.text}</span>
                              <span className="text-xs text-muted-foreground ml-auto">{subtask.durationMinutes || 0} min</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Checklist</h4>
                      {task.checklists.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No checklist items</p>
                      ) : (
                        <div className="space-y-1.5">
                          {task.checklists.map(checklist =>
                            checklist.items.map(item => (
                              <label key={item.id} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={item.completed}
                                  onChange={() => toggleChecklistItem(task.id, checklist.id, item.id)}
                                  className="w-4 h-4 rounded border-border accent-primary"
                                />
                                <span className={item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}>{item.text}</span>
                              </label>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Description</h4>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{task.description || 'No description'}</p>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Attachments</h4>
                      {(!task.attachments || task.attachments.length === 0) ? (
                        <p className="text-xs text-muted-foreground">No attachments</p>
                      ) : (
                        <div className="space-y-1.5">
                          {task.attachments.map(attachment => (
                            <button
                              key={attachment.id}
                              onClick={() => window.open(`/api/attachments/file/${attachment.id}`, '_blank')}
                              className="flex items-center gap-2 text-xs text-primary hover:underline"
                            >
                              <Paperclip className="w-3 h-3" />
                              {attachment.fileName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {(filtered.completed.length > 0 || completedOpen) && (
            <div className="border border-border rounded-xl bg-card">
              <button
                onClick={() => setCompletedOpen(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm font-semibold text-foreground">Completed ({filtered.completed.length})</span>
                {completedOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>

              {completedOpen && (
                <div className="border-t border-border px-3 py-2 space-y-2">
                  {filtered.completed.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-3">No completed tasks</p>
                  )}
                  {filtered.completed.map(task => (
                    <div key={task.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/40">
                      <button
                        onClick={() => toggleTaskCompletion(task)}
                        className="text-label-green"
                        title="Mark active"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>

                      <button
                        onClick={() => setOpenTaskId(task.id)}
                        className="text-sm text-left text-muted-foreground line-through hover:text-primary"
                      >
                        {task.title}
                      </button>

                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {daysUntilAutoDelete(task.completedAt)} day{daysUntilAutoDelete(task.completedAt) === 1 ? '' : 's'} left
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {addingTask && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={() => setAddingTask(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Create Task</h2>
              <button onClick={() => setAddingTask(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Task title</label>
                <input
                  autoFocus
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Status</label>
                  <select
                    value={newTaskColumnId || board.columns[0]?.id || ''}
                    onChange={e => setNewTaskColumnId(e.target.value)}
                    className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                  >
                    {board.columns.map(column => (
                      <option key={column.id} value={column.id}>{column.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={e => setNewTaskPriority(e.target.value as Priority)}
                    className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Due date</label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={e => setNewTaskDueDate(e.target.value)}
                    className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Due time</label>
                  <input
                    type="time"
                    value={newTaskDueTime}
                    onChange={e => setNewTaskDueTime(e.target.value)}
                    className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Estimated duration (minutes)</label>
                  <input
                    type="number"
                    min={0}
                    value={newTaskDuration}
                    onChange={e => setNewTaskDuration(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Group</label>
                  <select
                    value={newTaskColumnId || board.columns[0]?.id || ''}
                    onChange={e => setNewTaskColumnId(e.target.value)}
                    className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                  >
                    {board.columns.map(column => (
                      <option key={column.id} value={column.id}>{column.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Description</label>
                <textarea
                  value={newTaskDescription}
                  onChange={e => setNewTaskDescription(e.target.value)}
                  rows={4}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Sub-tasks</label>
                  {newTaskSubtasks.reduce((sum, st) => sum + st.durationMinutes, 0) !== newTaskDuration && (
                    <span className="text-[11px] text-amber-600">Sub-task time does not match task duration.</span>
                  )}
                </div>
                <div className="space-y-2">
                  {newTaskSubtasks.map((subtask, index) => {
                    const previousDuration = newTaskSubtasks
                      .slice(0, index)
                      .reduce((sum, st) => sum + st.durationMinutes, 0);
                    const remaining = Math.max(0, newTaskDuration - previousDuration);

                    return (
                      <div key={subtask.id} className="grid grid-cols-[1fr_120px_120px] gap-2 items-center">
                        <span className="text-sm text-foreground">{subtask.text}</span>
                        <input
                          type="number"
                          min={0}
                          value={subtask.durationMinutes}
                          onChange={e => {
                            const value = Math.max(0, Number(e.target.value) || 0);
                            setNewTaskSubtasks(prev => prev.map(item => item.id === subtask.id ? { ...item, durationMinutes: value } : item));
                          }}
                          className="bg-muted/40 border border-border rounded-lg px-2 py-1.5 text-sm"
                        />
                        <span className="text-xs text-muted-foreground">{remaining} min left</span>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-[1fr_120px_auto] gap-2">
                  <input
                    value={newSubtaskText}
                    onChange={e => setNewSubtaskText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSubtaskDraft()}
                    placeholder="New sub-task"
                    className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min={0}
                    value={newSubtaskDuration}
                    onChange={e => setNewSubtaskDuration(Math.max(0, Number(e.target.value) || 0))}
                    className="bg-muted/40 border border-border rounded-lg px-2 py-2 text-sm"
                  />
                  <button
                    onClick={addSubtaskDraft}
                    className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Checklist</label>
                <div className="space-y-1">
                  {newChecklistItems.map((item, index) => (
                    <div key={`${item}-${index}`} className="text-sm text-foreground">- {item}</div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newChecklistText}
                    onChange={e => setNewChecklistText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addChecklistDraft()}
                    className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                    placeholder="Checklist item"
                  />
                  <button onClick={addChecklistDraft} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">Add</button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Attachments</label>
                <input
                  type="file"
                  multiple
                  onChange={e => {
                    if (!e.target.files) return;
                    setNewFiles(Array.from(e.target.files));
                  }}
                  className="text-sm"
                />
                {newFiles.length > 0 && (
                  <div className="space-y-1">
                    {newFiles.map(file => (
                      <div key={file.name} className="text-xs text-muted-foreground">{file.name}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setAddingTask(false)} className="px-4 py-2 text-sm text-muted-foreground">Cancel</button>
              <button
                onClick={createTask}
                disabled={!newTaskTitle.trim()}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface TaskFullViewProps {
  task: Task;
  boardColumns: Array<{ id: string; title: string; color: string }>;
  onBack: () => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onToggleChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  onAddChecklistItem: (taskId: string, checklistId: string, text: string) => void;
  onDeleteChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
}

const TaskFullView: React.FC<TaskFullViewProps> = ({
  task,
  boardColumns,
  onBack,
  onUpdateTask,
  onToggleChecklistItem,
  onAddChecklistItem,
  onDeleteChecklistItem,
}) => {
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newSubtaskDuration, setNewSubtaskDuration] = useState(10);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [subtaskMenuOpenId, setSubtaskMenuOpenId] = useState<string | null>(null);
  const [subtaskMenuValue, setSubtaskMenuValue] = useState<number>(0);
  const [uploading, setUploading] = useState(false);

  const checklist = task.checklists[0];

  const dueWarning = useMemo(() => {
    if (!task.dueDate || !task.dueTime) return null;
    const due = new Date(`${task.dueDate}T${task.dueTime}`);
    if (Number.isNaN(due.getTime())) return null;

    const diffMs = due.getTime() - Date.now();
    if (diffMs < 0) return 'Task due time has passed.';
    if (diffMs < 2 * 60 * 60 * 1000) return 'You are running out of time for this task.';
    return null;
  }, [task.dueDate, task.dueTime]);

  const subtaskTotal = (task.subtasks || []).reduce((sum, subtask) => sum + (subtask.durationMinutes || 0), 0);
  const durationMismatch = (task.duration || 0) !== subtaskTotal;
  const allSubtasksDone = (task.subtasks || []).length > 0 && task.subtasks.every(subtask => subtask.completed);

  const updateSubtask = (subtaskId: string, updates: Partial<Task['subtasks'][number]>) => {
    const updated = task.subtasks.map(subtask =>
      subtask.id === subtaskId ? { ...subtask, ...updates } : subtask
    );
    onUpdateTask(task.id, { subtasks: updated });
  };

  const addSubtask = () => {
    if (!newSubtaskText.trim()) return;
    const updated = [
      ...(task.subtasks || []),
      {
        id: crypto.randomUUID(),
        text: newSubtaskText.trim(),
        completed: false,
        durationMinutes: Math.max(0, Number(newSubtaskDuration) || 0),
      },
    ];
    onUpdateTask(task.id, { subtasks: updated });
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
  };

  const addChecklistItemToTask = () => {
    if (!newChecklistText.trim()) return;
    if (!checklist) {
      const newChecklist = {
        id: crypto.randomUUID(),
        title: 'Checklist',
        items: [
          { id: crypto.randomUUID(), text: newChecklistText.trim(), completed: false },
        ],
      };
      onUpdateTask(task.id, { checklists: [newChecklist] });
      setNewChecklistText('');
      return;
    }

    onAddChecklistItem(task.id, checklist.id, newChecklistText.trim());
    setNewChecklistText('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/attachments/${task.id}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (res.ok) {
        const attachment: Attachment = await res.json();
        onUpdateTask(task.id, { attachments: [...(task.attachments || []), attachment] });
      }
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setUploading(false);
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    try {
      const res = await fetch(`/api/attachments/${attachmentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        onUpdateTask(task.id, {
          attachments: (task.attachments || []).filter(item => item.id !== attachmentId),
        });
      }
    } catch (error) {
      console.error('Error deleting attachment:', error);
    }
  };

  const addComment = () => {
    if (!newCommentText.trim()) return;
    const comments = [
      ...(task.comments || []),
      {
        id: crypto.randomUUID(),
        text: newCommentText.trim(),
        createdAt: new Date().toISOString(),
      },
    ];
    onUpdateTask(task.id, { comments });
    setNewCommentText('');
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <button onClick={onBack} className="text-sm text-primary hover:underline">Back to task list</button>

        <div className="bg-card border border-border rounded-2xl p-5 space-y-6">
          <input
            value={task.title}
            onChange={e => onUpdateTask(task.id, { title: e.target.value })}
            className="w-full bg-transparent text-2xl font-semibold text-foreground focus:outline-none"
          />

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Status</label>
              <select
                value={task.columnId}
                onChange={e => onUpdateTask(task.id, { columnId: e.target.value })}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              >
                {boardColumns.map(column => (
                  <option key={column.id} value={column.id}>{column.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Priority</label>
              <select
                value={task.priority}
                onChange={e => onUpdateTask(task.id, { priority: e.target.value as Priority })}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              >
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="none">None</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Due date</label>
              <input
                type="date"
                value={task.dueDate || ''}
                onChange={e => onUpdateTask(task.id, { dueDate: e.target.value || undefined })}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Due time</label>
              <input
                type="time"
                value={task.dueTime || ''}
                onChange={e => onUpdateTask(task.id, { dueTime: e.target.value || undefined })}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Estimated duration (minutes)</label>
              <input
                type="number"
                min={0}
                value={task.duration || 0}
                onChange={e => onUpdateTask(task.id, { duration: Math.max(0, Number(e.target.value) || 0) })}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Group</label>
              <select
                value={task.columnId}
                onChange={e => onUpdateTask(task.id, { columnId: e.target.value })}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              >
                {boardColumns.map(column => (
                  <option key={column.id} value={column.id}>{column.title}</option>
                ))}
              </select>
            </div>
          </div>

          {dueWarning && (
            <div className="text-sm px-3 py-2 rounded-lg bg-amber-100 text-amber-700 border border-amber-200 flex items-center gap-2">
              <CalendarClock className="w-4 h-4" />
              {dueWarning}
            </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Description</label>
            <textarea
              value={task.description}
              onChange={e => onUpdateTask(task.id, { description: e.target.value })}
              rows={5}
              className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Sub-tasks</h3>
              {durationMismatch && (
                <span className="text-xs text-amber-600">Sub-task time does not match task duration.</span>
              )}
            </div>

            {allSubtasksDone && (
              <div className="text-xs text-primary bg-primary/10 px-2 py-1 rounded-md inline-block">All sub-tasks are done</div>
            )}

            <div className="space-y-2">
              {(task.subtasks || []).map((subtask, index) => {
                const previousDuration = task.subtasks
                  .slice(0, index)
                  .reduce((sum, item) => sum + (item.durationMinutes || 0), 0);
                const remaining = Math.max(0, (task.duration || 0) - previousDuration);

                return (
                  <div key={subtask.id} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center rounded-lg border border-border px-3 py-2 relative">
                    <button onClick={() => updateSubtask(subtask.id, { completed: !subtask.completed })}>
                      {subtask.completed ? <CheckCircle2 className="w-4 h-4 text-label-green" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                    </button>
                    <input
                      value={subtask.text}
                      onChange={e => updateSubtask(subtask.id, { text: e.target.value })}
                      className={`bg-transparent text-sm focus:outline-none ${subtask.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                    />
                    <span className="text-xs text-muted-foreground">{subtask.durationMinutes || 0} min</span>
                    <span className="text-xs text-muted-foreground">{remaining} min left</span>
                    <button
                      onClick={() => {
                        setSubtaskMenuOpenId(prev => prev === subtask.id ? null : subtask.id);
                        setSubtaskMenuValue(subtask.durationMinutes || 0);
                      }}
                      className="p-1 rounded hover:bg-muted"
                    >
                      <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                    </button>

                    {subtaskMenuOpenId === subtask.id && (
                      <div className="absolute right-2 top-9 z-10 w-64 bg-popover border border-border rounded-xl shadow-xl p-3 space-y-2">
                        <div className="text-xs text-muted-foreground">Current: {subtask.durationMinutes || 0} min</div>
                        <div className="text-xs text-muted-foreground">Task total: {task.duration || 0} min</div>
                        <div className="text-xs text-muted-foreground">Remaining: {remaining} min</div>
                        <input
                          type="number"
                          min={0}
                          value={subtaskMenuValue}
                          onChange={e => setSubtaskMenuValue(Math.max(0, Number(e.target.value) || 0))}
                          className="w-full bg-muted/40 border border-border rounded-lg px-2 py-1.5 text-sm"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setSubtaskMenuOpenId(null)}
                            className="text-xs text-muted-foreground"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              updateSubtask(subtask.id, { durationMinutes: subtaskMenuValue });
                              setSubtaskMenuOpenId(null);
                            }}
                            className="text-xs text-primary"
                          >
                            Update
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-[1fr_120px_auto] gap-2">
              <input
                value={newSubtaskText}
                onChange={e => setNewSubtaskText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSubtask()}
                placeholder="Add sub-task"
                className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
              />
              <input
                type="number"
                min={0}
                value={newSubtaskDuration}
                onChange={e => setNewSubtaskDuration(Math.max(0, Number(e.target.value) || 0))}
                className="bg-muted/40 border border-border rounded-lg px-2 py-2 text-sm"
              />
              <button onClick={addSubtask} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">Add</button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Checklist</h3>
            {!checklist && <p className="text-xs text-muted-foreground">No checklist yet. Add an item to create one.</p>}
            {checklist && (
              <div className="space-y-1.5">
                {checklist.items.map(item => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => onToggleChecklistItem(task.id, checklist.id, item.id)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                    <span className={item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}>{item.text}</span>
                    <button
                      onClick={() => onDeleteChecklistItem(task.id, checklist.id, item.id)}
                      className="ml-auto text-muted-foreground hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={newChecklistText}
                onChange={e => setNewChecklistText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addChecklistItemToTask()}
                placeholder="Checklist item"
                className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
              />
              <button onClick={addChecklistItemToTask} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">Add</button>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
            <input type="file" onChange={handleFileUpload} disabled={uploading} className="text-sm" />
            {uploading && <p className="text-xs text-muted-foreground">Uploading...</p>}
            <div className="space-y-1">
              {(task.attachments || []).map(attachment => (
                <div key={attachment.id} className="flex items-center gap-2 text-sm">
                  <button
                    onClick={() => window.open(`/api/attachments/file/${attachment.id}`, '_blank')}
                    className="text-primary hover:underline"
                  >
                    {attachment.fileName}
                  </button>
                  <button
                    onClick={() => deleteAttachment(attachment.id)}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Comments</h3>
            <div className="space-y-2">
              {(task.comments || []).map(comment => (
                <div key={comment.id} className="border border-border rounded-lg px-3 py-2">
                  <p className="text-sm text-foreground whitespace-pre-wrap">{comment.text}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{new Date(comment.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newCommentText}
                onChange={e => setNewCommentText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addComment()}
                placeholder="Leave a comment"
                className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
              />
              <button onClick={addComment} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">Post</button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {task.priority !== 'none' && (
              <span className={`${PRIORITY_CONFIG[task.priority].className} text-[10px] font-bold px-2 py-0.5 rounded text-primary-foreground`}>
                {PRIORITY_CONFIG[task.priority].label}
              </span>
            )}
            <span className="text-xs text-muted-foreground">Due: {formatDate(task.dueDate)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Tasks;
