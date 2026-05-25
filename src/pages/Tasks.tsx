import React, { useMemo, useState } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { Attachment, Priority, PRIORITY_CONFIG, Task, TaskStatus } from '@/types/board';
import {
  ArrowDownAz,
  BarChart3,
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
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useDeepFocus } from '@/hooks/useDeepFocus';

const PRIORITY_FILTERS: Array<'all' | 'urgent' | 'high' | 'medium' | 'low'> = ['all', 'urgent', 'high', 'medium', 'low'];
const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'completed', label: 'Completed' },
  { value: 'review', label: 'Review' },
  { value: 'to_do', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
];

type AnalysisType = 'overview' | 'duration' | 'deadlines' | 'focus';

interface AnalysisResult {
  title: string;
  summary: string;
  lines: string[];
}

const formatDate = (value?: string) => {
  if (!value) return 'No due date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const isTaskCompleted = (task: Task) => {
  return Boolean(task.completed || task.status === 'completed');
};

const getTaskStatus = (task: Task): TaskStatus => {
  if (task.status) return task.status;
  return task.completed ? 'completed' : 'to_do';
};

const getStatusLabel = (status: TaskStatus) => {
  return STATUS_OPTIONS.find(option => option.value === status)?.label || 'To Do';
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
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
  } = useBoardContext();
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
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('to_do');
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

  const [completedOpen, setCompletedOpen] = useState(true);
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

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

    const active = byGroup.filter(task => !isTaskCompleted(task));
    const completed = byGroup.filter(task => isTaskCompleted(task));

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
  }, [board.tasks, groupFilterId, priorityFilter, search, sortByDueDate]);

  const matchingCount = filtered.active.length + filtered.completed.length;

  const openTask = openTaskId ? board.tasks.find(task => task.id === openTaskId) ?? null : null;

  const runTaskAnalysis = (type: AnalysisType) => {
    setAnalysisLoading(true);
    setAnalysisPanelOpen(true);

    const scope = [...filtered.active, ...filtered.completed];
    const activeScope = scope.filter(task => !isTaskCompleted(task));
    const now = new Date();

    let result: AnalysisResult;

    if (type === 'overview') {
      const completedCount = scope.filter(task => isTaskCompleted(task)).length;
      const reviewCount = scope.filter(task => getTaskStatus(task) === 'review').length;
      const withSubtasks = scope.filter(task => (task.subtasks || []).length > 0).length;
      const withChecklist = scope.filter(task => task.checklists.some(cl => cl.items.length > 0)).length;

      result = {
        title: 'Task Overview',
        summary: `${scope.length} tasks in current view`,
        lines: [
          `${activeScope.length} active`,
          `${completedCount} completed`,
          `${reviewCount} in review`,
          `${withSubtasks} with sub-tasks`,
          `${withChecklist} with checklist items`,
        ],
      };
    } else if (type === 'duration') {
      const mismatches = activeScope
        .map(task => {
          const estimated = Math.max(0, Number(task.duration) || 0);
          const subtaskTotal = (task.subtasks || []).reduce((sum, st) => sum + Math.max(0, Number(st.durationMinutes) || 0), 0);
          return { task, estimated, subtaskTotal };
        })
        .filter(item => item.estimated !== item.subtaskTotal)
        .slice(0, 8);

      result = {
        title: 'Duration Check',
        summary: mismatches.length === 0 ? 'All visible tasks match estimated duration.' : `${mismatches.length} tasks need duration review`,
        lines: mismatches.length === 0
          ? ['No mismatches found.']
          : mismatches.map(item => `${item.task.title}: estimate ${item.estimated} min vs sub-tasks ${item.subtaskTotal} min`),
      };
    } else if (type === 'deadlines') {
      const urgentDeadlines = activeScope
        .filter(task => !!task.dueDate)
        .map(task => {
          const due = new Date(`${task.dueDate}T${task.dueTime || '23:59'}`);
          return { task, due };
        })
        .filter(item => !Number.isNaN(item.due.getTime()))
        .sort((a, b) => a.due.getTime() - b.due.getTime())
        .slice(0, 8);

      result = {
        title: 'Deadline Risk',
        summary: urgentDeadlines.length === 0 ? 'No due dates in current view.' : 'Closest deadlines first',
        lines: urgentDeadlines.length === 0
          ? ['Add due dates to get deadline analysis.']
          : urgentDeadlines.map(item => {
              const overdue = item.due.getTime() < now.getTime();
              return `${item.task.title}: ${overdue ? 'overdue' : formatDate(item.task.dueDate)} (${getStatusLabel(getTaskStatus(item.task))})`;
            }),
      };
    } else {
      const focusCandidates = activeScope
        .map(task => {
          const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 }[task.priority];
          const dueWeight = task.dueDate ? Math.max(0, 100000000000 - new Date(`${task.dueDate}T${task.dueTime || '23:59'}`).getTime()) : 0;
          const checklistTotal = task.checklists.reduce((sum, list) => sum + list.items.length, 0);
          const checklistDone = task.checklists.reduce((sum, list) => sum + list.items.filter(item => item.completed).length, 0);
          const completionPenalty = checklistTotal > 0 ? checklistDone / checklistTotal : 0;
          const score = priorityWeight * 100 + dueWeight / 1000000000 - completionPenalty * 10;
          return { task, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      result = {
        title: 'Focus Candidates',
        summary: focusCandidates.length === 0 ? 'No active tasks to analyze.' : 'Suggested tasks to tackle next',
        lines: focusCandidates.length === 0
          ? ['Create active tasks to generate suggestions.']
          : focusCandidates.map(item => `${item.task.title} (${getStatusLabel(getTaskStatus(item.task))}, ${item.task.priority})`),
      };
    }

    setAnalysisResult(result);
    setAnalysisLoading(false);
  };

  const toggleTaskCompletion = (task: Task) => {
    const currentlyCompleted = isTaskCompleted(task);
    if (currentlyCompleted) {
      updateTask(task.id, { completed: false, completedAt: undefined, status: 'to_do' });
      return;
    }
    updateTask(task.id, { completed: true, completedAt: new Date().toISOString(), status: 'completed' });
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
    setNewTaskStatus('to_do');
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
      status: newTaskStatus,
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
      attachments: newFiles.map(file => ({
        id: crypto.randomUUID(),
        taskId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        fileUrl: URL.createObjectURL(file),
        createdAt: new Date().toISOString(),
      })),
      completed: newTaskStatus === 'completed',
      completedAt: newTaskStatus === 'completed' ? new Date().toISOString() : undefined,
    });

    resetTaskDraft();
    setAddingTask(false);
  };

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
              onClick={() => setAnalysisPanelOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 transition-all"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Task Analysis
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
            const status = getTaskStatus(task);
            const subtaskCount = task.subtasks?.length || 0;
            const checklistCount = task.checklists.reduce((sum, list) => sum + list.items.length, 0);

            return (
              <div
                key={task.id}
                onClick={() => setOpenTaskId(task.id)}
                className="border border-border rounded-xl bg-card transition-all duration-300"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleTaskCompletion(task);
                    }}
                    className="text-muted-foreground hover:text-label-green transition-colors"
                    title="Mark complete"
                  >
                    <Circle className="w-5 h-5" />
                  </button>

                  <span className="text-sm font-medium text-left text-foreground hover:text-primary truncate">
                    {task.title}
                  </span>

                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {getStatusLabel(status)}
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
                    {subtaskCount > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {subtaskCount} sub-task{subtaskCount === 1 ? '' : 's'}
                      </span>
                    )}
                    {checklistCount > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {checklistCount} checklist
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
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(task.id);
                      }}
                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeepFocus(task);
                      }}
                      className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary"
                      title="Open Deep Focus"
                    >
                      <Brain className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="border-t border-border px-4 py-3 space-y-4 bg-muted/20"
                  >
                    <div>
                      <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Description</h4>
                      <p className="text-sm text-foreground whitespace-pre-wrap">{task.description || 'No description'}</p>
                    </div>

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
            <div className="mt-8 pt-6 border-t border-border/80">
              <div className="border border-label-green/25 rounded-xl bg-label-green/5">
              <button
                onClick={() => setCompletedOpen(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <span className="text-sm font-semibold text-label-green flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  Completed ({filtered.completed.length})
                </span>
                {completedOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>

              {completedOpen && (
                <div className="border-t border-border px-3 py-2 space-y-2">
                  {filtered.completed.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-3">No completed tasks</p>
                  )}
                  {filtered.completed.map(task => (
                    <div
                      key={task.id}
                      onClick={() => setOpenTaskId(task.id)}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg border border-label-green/15 bg-background/70 hover:bg-muted/40 cursor-pointer"
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTaskCompletion(task);
                        }}
                        className="text-label-green"
                        title="Mark active"
                      >
                        <CheckCircle2 className="w-5 h-5" />
                      </button>

                      <span className="text-sm text-left text-muted-foreground/90 line-through hover:text-primary">
                        {task.title}
                      </span>

                      <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-label-green/15 text-label-green font-medium">
                        Auto-delete in {daysUntilAutoDelete(task.completedAt)} day{daysUntilAutoDelete(task.completedAt) === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
                    value={newTaskStatus}
                    onChange={e => setNewTaskStatus(e.target.value as TaskStatus)}
                    className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                  >
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
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
                  {newTaskSubtasks.map((subtask) => (
                    <div key={subtask.id} className="grid grid-cols-[1fr_auto] gap-4 items-center bg-muted/20 px-3 py-2 rounded-lg border border-border/50">
                      <span className="text-sm text-foreground font-medium">{subtask.text}</span>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">{subtask.durationMinutes} min</span>
                    </div>
                  ))}
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
                    <div key={`${item}-${index}`} className="flex items-center gap-2 text-sm text-foreground bg-muted/20 px-3 py-2 rounded-lg border border-border/50">
                      <CheckSquare className="w-3.5 h-3.5 text-primary" />
                      <span>{item}</span>
                    </div>
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
                <div className="group relative mt-1">
                  <label className="flex flex-col items-center justify-center w-full min-h-[80px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                    <div className="flex flex-col items-center justify-center py-2">
                      <Paperclip className="w-5 h-5 text-primary mb-1" />
                      <p className="text-[10px] font-medium text-foreground">Click to add attachments</p>
                    </div>
                    <input
                      type="file"
                      multiple
                      onChange={e => {
                        if (!e.target.files) return;
                        setNewFiles(Array.from(e.target.files));
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
                {newFiles.length > 0 && (
                  <div className="grid grid-cols-1 gap-2 mt-3">
                    {newFiles.map(file => (
                      <div key={file.name} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/30">
                        <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[11px] font-medium text-foreground truncate">{file.name}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">{(file.size / 1024).toFixed(0)} KB</span>
                      </div>
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

      {analysisPanelOpen && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div className="absolute inset-0 bg-black/10 pointer-events-auto" onClick={() => setAnalysisPanelOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-sm bg-card border-l border-border shadow-[-10px_0_30px_rgba(0,0,0,0.08)] pointer-events-auto flex flex-col">
            <header className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Task Analysis</h3>
              </div>
              <button onClick={() => setAnalysisPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="p-4 space-y-2 border-b border-border">
              <button onClick={() => runTaskAnalysis('overview')} className="w-full text-left px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted text-sm">
                Overview
              </button>
              <button onClick={() => runTaskAnalysis('duration')} className="w-full text-left px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted text-sm">
                Duration Check
              </button>
              <button onClick={() => runTaskAnalysis('deadlines')} className="w-full text-left px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted text-sm">
                Deadline Risk
              </button>
              <button onClick={() => runTaskAnalysis('focus')} className="w-full text-left px-3 py-2 rounded-lg bg-muted/40 hover:bg-muted text-sm">
                Focus Suggestions
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {analysisLoading && (
                <p className="text-sm text-muted-foreground">Analyzing tasks...</p>
              )}
              {!analysisLoading && !analysisResult && (
                <p className="text-sm text-muted-foreground">Choose an analysis action.</p>
              )}
              {!analysisLoading && analysisResult && (
                <div className="space-y-3">
                  <h4 className="text-base font-semibold text-foreground">{analysisResult.title}</h4>
                  <p className="text-sm text-muted-foreground">{analysisResult.summary}</p>
                  <div className="space-y-2">
                    {analysisResult.lines.map((line, idx) => (
                      <div key={`${line}-${idx}`} className="text-sm text-foreground bg-muted/30 rounded-lg px-3 py-2">
                        {line}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {openTask && (
        <TaskFullView
          task={openTask}
          onClose={() => setOpenTaskId(null)}
          boardColumns={board.columns}
          onUpdateTask={updateTask}
          onToggleChecklistItem={toggleChecklistItem}
          onAddChecklistItem={addChecklistItem}
          onDeleteChecklistItem={deleteChecklistItem}
        />
      )}
    </div>
  );
};

interface TaskFullViewProps {
  task: Task;
  boardColumns: Array<{ id: string; title: string; color: string }>;
  onClose: () => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onToggleChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  onAddChecklistItem: (taskId: string, checklistId: string, text: string) => void;
  onDeleteChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
}

const TaskFullView: React.FC<TaskFullViewProps> = ({
  task,
  boardColumns,
  onClose,
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
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [editingChecklistText, setEditingChecklistText] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const [uploading, setUploading] = useState(false);
  const canUseServerAttachmentApi = /^\d+$/.test(String(task.id));

  const legacySubtasksChecklist = task.checklists.find(list => list.title.toLowerCase().trim() === 'subtasks');
  const checklistLists = task.checklists.filter(list => list.id !== legacySubtasksChecklist?.id);
  const effectiveSubtasks = (task.subtasks && task.subtasks.length > 0)
    ? task.subtasks
    : (legacySubtasksChecklist?.items || []).map(item => ({ ...item, durationMinutes: 0 }));
  const primaryChecklist = checklistLists[0];
  const taskDuration = Math.max(0, Number(task.duration) || 0);
  const getSubtaskDuration = (subtask: Task['subtasks'][number]) => Math.max(0, Number(subtask.durationMinutes) || 0);
  const getRemainingBefore = (index: number) => {
    const usedBefore = effectiveSubtasks
      .slice(0, index)
      .reduce((sum, item) => sum + getSubtaskDuration(item), 0);
    return Math.max(0, taskDuration - usedBefore);
  };
  const getRemainingAfter = (index: number) => {
    const remainingBefore = getRemainingBefore(index);
    const currentDuration = getSubtaskDuration(effectiveSubtasks[index]);
    return Math.max(0, remainingBefore - currentDuration);
  };

  const dueWarning = useMemo(() => {
    if (!task.dueDate || !task.dueTime) return null;
    const due = new Date(`${task.dueDate}T${task.dueTime}`);
    if (Number.isNaN(due.getTime())) return null;

    const diffMs = due.getTime() - Date.now();
    if (diffMs < 0) return 'Task due time has passed.';
    if (diffMs < 2 * 60 * 60 * 1000) return 'You are running out of time for this task.';
    return null;
  }, [task.dueDate, task.dueTime]);

  const subtaskTotal = effectiveSubtasks.reduce((sum, subtask) => sum + getSubtaskDuration(subtask), 0);
  const durationMismatch = taskDuration !== subtaskTotal;
  const allSubtasksDone = effectiveSubtasks.length > 0 && effectiveSubtasks.every(subtask => subtask.completed);

  const persistSubtasks = (nextSubtasks: Task['subtasks']) => {
    const nextChecklists = legacySubtasksChecklist
      ? task.checklists.filter(list => list.id !== legacySubtasksChecklist.id)
      : task.checklists;
    onUpdateTask(task.id, { subtasks: nextSubtasks, checklists: nextChecklists });
  };

  const updateSubtask = (subtaskId: string, updates: Partial<Task['subtasks'][number]>) => {
    const updated = effectiveSubtasks.map(subtask =>
      subtask.id === subtaskId ? { ...subtask, ...updates } : subtask
    );
    persistSubtasks(updated);
  };

  const addSubtask = () => {
    if (!newSubtaskText.trim()) return;
    const updated = [
      ...effectiveSubtasks,
      {
        id: crypto.randomUUID(),
        text: newSubtaskText.trim(),
        completed: false,
        durationMinutes: Math.max(0, Number(newSubtaskDuration) || 0),
      },
    ];
    persistSubtasks(updated);
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
  };

  const addChecklistItemToTask = () => {
    if (!newChecklistText.trim()) return;
    if (!primaryChecklist) {
      const newChecklist = {
        id: crypto.randomUUID(),
        title: 'Checklist',
        items: [
          { id: crypto.randomUUID(), text: newChecklistText.trim(), completed: false },
        ],
      };
      onUpdateTask(task.id, { checklists: [...checklistLists, newChecklist] });
      setNewChecklistText('');
      return;
    }

    onAddChecklistItem(task.id, primaryChecklist.id, newChecklistText.trim());
    setNewChecklistText('');
  };

  const saveChecklistItemEdit = (checklistId: string, itemId: string) => {
    const next = editingChecklistText.trim();
    if (!next) {
      setEditingChecklistItemId(null);
      setEditingChecklistText('');
      return;
    }
    const updatedChecklists = task.checklists.map(list => {
      if (list.id !== checklistId) return list;
      return {
        ...list,
        items: list.items.map(item => item.id === itemId ? { ...item, text: next } : item),
      };
    });
    onUpdateTask(task.id, { checklists: updatedChecklists });
    setEditingChecklistItemId(null);
    setEditingChecklistText('');
  };

  const removeSubtask = (subtaskId: string) => {
    const updated = effectiveSubtasks.filter(subtask => subtask.id !== subtaskId);
    persistSubtasks(updated);
  };

  const saveSubtaskEdit = (subtaskId: string) => {
    const next = editingSubtaskText.trim();
    if (!next) {
      setEditingSubtaskId(null);
      setEditingSubtaskText('');
      return;
    }
    updateSubtask(subtaskId, { text: next });
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;

    setUploading(true);
    const uploaded: Attachment[] = [];

    for (const file of files) {
      if (canUseServerAttachmentApi) {
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
            uploaded.push(attachment);
          } else {
            uploaded.push({
              id: crypto.randomUUID(),
              taskId: task.id,
              fileName: file.name,
              fileType: file.type || 'application/octet-stream',
              fileSize: file.size,
              fileUrl: URL.createObjectURL(file),
              createdAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          console.error('Error uploading file:', error);
          uploaded.push({
            id: crypto.randomUUID(),
            taskId: task.id,
            fileName: file.name,
            fileType: file.type || 'application/octet-stream',
            fileSize: file.size,
            fileUrl: URL.createObjectURL(file),
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        uploaded.push({
          id: crypto.randomUUID(),
          taskId: task.id,
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          fileUrl: URL.createObjectURL(file),
          createdAt: new Date().toISOString(),
        });
      }
    }

    if (uploaded.length > 0) {
      onUpdateTask(task.id, { attachments: [...(task.attachments || []), ...uploaded] });
    }

    setUploading(false);
    e.currentTarget.value = '';
  };

  const deleteAttachment = async (attachmentId: string) => {
    const isServerAttachment = canUseServerAttachmentApi && /^\d+$/.test(String(attachmentId));
    if (isServerAttachment) {
      try {
        const res = await fetch(`/api/attachments/${attachmentId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (res.ok) {
          onUpdateTask(task.id, {
            attachments: (task.attachments || []).filter(item => item.id !== attachmentId),
          });
          return;
        }
      } catch (error) {
        console.error('Error deleting attachment:', error);
      }
    }

    onUpdateTask(task.id, {
      attachments: (task.attachments || []).filter(item => item.id !== attachmentId),
    });
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto p-5 space-y-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="w-full px-1 text-2xl font-semibold text-foreground">
            {task.title}
          </h2>
          <button onClick={onClose} className="ml-3 p-2 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Status</label>
              <select
                value={getTaskStatus(task)}
                onChange={e => {
                  const nextStatus = e.target.value as TaskStatus;
                  onUpdateTask(task.id, {
                    status: nextStatus,
                    completed: nextStatus === 'completed',
                    completedAt: nextStatus === 'completed' ? new Date().toISOString() : undefined,
                  });
                }}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              >
                {STATUS_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
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
              {effectiveSubtasks.map((subtask, index) => {
                const remainingBefore = getRemainingBefore(index);
                const remainingAfter = getRemainingAfter(index);
                const isEditingSubtask = editingSubtaskId === subtask.id;

                return (
                  <div key={subtask.id} className="grid grid-cols-[auto_1fr_auto] gap-2 items-center rounded-lg border border-border px-3 py-2 relative">
                    <button onClick={() => updateSubtask(subtask.id, { completed: !subtask.completed })}>
                      {subtask.completed ? <CheckCircle2 className="w-4 h-4 text-label-green" /> : <Circle className="w-4 h-4 text-muted-foreground" />}
                    </button>
                    <span 
                      className={`flex-1 text-sm ${subtask.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                    >
                      {subtask.text}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">{getSubtaskDuration(subtask)} min</span>
                      <span className="text-xs text-muted-foreground">{remainingAfter} min left</span>
                    </div>
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
            {checklistLists.length === 0 && <p className="text-xs text-muted-foreground">No checklist yet. Add an item to create one.</p>}
            {checklistLists.length > 0 && (
              <div className="space-y-1.5">
                {checklistLists.map(list => (
                  <div key={list.id} className="space-y-1.5">
                    {checklistLists.length > 1 && (
                      <div className="text-[11px] uppercase text-muted-foreground font-semibold">{list.title}</div>
                    )}
                    {list.items.map(item => (
                      <div key={item.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => onToggleChecklistItem(task.id, list.id, item.id)}
                          className="w-4 h-4 rounded border-border accent-primary"
                        />
                        <span className={`flex-1 text-sm ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {item.text}
                        </span>

                      </div>
                    ))}
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
            <div className="group relative mt-1">
              <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                    <Paperclip className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-sm font-medium text-foreground">Click to upload or drag and drop</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, Images, Documents (max 10MB)</p>
                </div>
                <input type="file" multiple onChange={handleFileUpload} disabled={uploading} className="hidden" />
              </label>
              {uploading && (
                <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center rounded-xl">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-medium text-foreground">Uploading files...</span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {(task.attachments || []).map(attachment => {
                const isServerAttachment = /^\d+$/.test(String(attachment.id));
                const href = isServerAttachment ? `/api/attachments/file/${attachment.id}` : attachment.fileUrl;
                
                return (
                  <a
                    key={attachment.id}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40 hover:bg-muted transition-all group/item"
                  >
                    <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center group-hover/item:border-primary/30 group-hover/item:text-primary transition-colors">
                      <Paperclip className="w-5 h-5 text-muted-foreground group-hover/item:text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate group-hover/item:text-primary transition-colors">
                        {attachment.fileName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {attachment.fileSize ? `${(attachment.fileSize / 1024).toFixed(1)} KB` : 'Attached file'}
                      </p>
                    </div>
                  </a>
                );
              })}
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
  );
};

export default Tasks;
