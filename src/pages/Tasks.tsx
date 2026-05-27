import React, { useMemo, useState, useCallback } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import { Attachment, Priority, PRIORITY_CONFIG, Task, TaskStatus } from '@/types/board';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Brain,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  GripVertical,
  MoreHorizontal,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useDeepFocus } from '@/hooks/useDeepFocus';
import { CircleToggle, SquareToggle } from '@/components/ToggleComponents';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';

const PRIORITY_FILTERS: Array<'all' | 'urgent' | 'high' | 'medium' | 'low'> = ['all', 'urgent', 'high', 'medium', 'low'];
const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'to_do', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'completed', label: 'Completed' },
];

type AnalysisTab = 'overview' | 'duration' | 'deadlines' | 'focus';

interface AnalysisResult {
  title: string;
  summary: string;
  lines: Array<{ text: string; taskId?: string }>;
}

const STATUS_CONFIG: Record<TaskStatus, { label: string; className: string }> = {
  to_do: { label: 'To Do', className: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  review: { label: 'Review', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  completed: { label: 'Completed', className: 'bg-label-green/15 text-label-green' },
};

const formatDate = (value?: string) => {
  if (!value) return 'No due date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDuration = (minutes: number) => {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const isTaskCompleted = (task: Task) => Boolean(task.completed || task.status === 'completed');

const getTaskStatus = (task: Task): TaskStatus => {
  if (task.status) return task.status;
  return task.completed ? 'completed' : 'to_do';
};

const getStatusLabel = (status: TaskStatus) =>
  STATUS_OPTIONS.find(o => o.value === status)?.label || 'To Do';

const daysUntilAutoDelete = (completedAt?: string) => {
  if (!completedAt) return 5;
  const started = new Date(completedAt);
  if (Number.isNaN(started.getTime())) return 5;
  const expires = new Date(started);
  expires.setDate(expires.getDate() + 5);
  return Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86400000));
};

type DueWarningLevel = null | 'soon' | 'imminent' | 'overdue';

const getDueTimeWarning = (task: Task): DueWarningLevel => {
  if (!task.dueDate || isTaskCompleted(task)) return null;
  const due = task.dueTime
    ? new Date(`${task.dueDate}T${task.dueTime}`)
    : new Date(`${task.dueDate}T23:59:59`);
  if (Number.isNaN(due.getTime())) return null;
  const diffMs = due.getTime() - Date.now();
  if (diffMs < 0) return 'overdue';
  if (diffMs < 30 * 60 * 1000) return 'imminent';
  if (diffMs < 2 * 60 * 60 * 1000) return 'soon';
  return null;
};

const dueBadgeClass = (warning: DueWarningLevel, base: boolean) => {
  if (base) {
    if (warning === 'overdue' || warning === 'imminent') return 'bg-destructive/15 text-destructive';
    if (warning === 'soon') return 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
  }
  return 'bg-muted text-muted-foreground';
};

interface NewTaskSubtaskDraft {
  id: string;
  text: string;
  durationMinutes: number;
}

interface AIGeneratedTask {
  title: string;
  description: string;
  priority: Priority;
  dueDate: string | null;
  dueTime: string | null;
  duration: number | null;
  group: string | null;
  status: TaskStatus;
  subtasks: Array<{ text: string; durationMinutes: number }>;
  checklistItems: string[];
}

const PremiumGate: React.FC<{
  title: string;
  description: string;
  icon?: React.ReactNode;
}> = ({ title, description, icon }) => (
  <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
      {icon || <Star className="w-6 h-6 text-primary" />}
    </div>
    <h4 className="text-sm font-semibold text-foreground mb-1">{title}</h4>
    <p className="text-xs text-muted-foreground mb-4 max-w-xs">{description}</p>
    <button
      onClick={() => window.location.hash = '#settings'}
      className="px-4 py-2 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all"
    >
      Subscribe to Unlock
    </button>
  </div>
);

interface DeleteConfirmDialogProps {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({ count, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onCancel} />
    <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
          <Trash2 className="w-5 h-5 text-destructive" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Delete {count} task{count === 1 ? '' : 's'}?</h3>
          <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-all"
        >
          Delete {count} task{count === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  </div>
);

const Tasks: React.FC = () => {
  const {
    board,
    addTask,
    updateTask,
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
    deleteTask,
  } = useBoardContext();
  const { user } = useAuth();
  const { open: openDeepFocus } = useDeepFocus();

  const isPremium = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  const isPro = user?.subscriptionTier === 'pro';

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);

  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'high' | 'medium' | 'low'>('all');
  const [groupFilterId, setGroupFilterId] = useState<string | null>(null);
  const [sortByDueDate, setSortByDueDate] = useState(false);
  const [sortDueDateDesc, setSortDueDateDesc] = useState(false);

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
  const [editingDraftSubtaskId, setEditingDraftSubtaskId] = useState<string | null>(null);
  const [editingDraftSubtaskText, setEditingDraftSubtaskText] = useState('');
  const [editingDraftSubtaskDuration, setEditingDraftSubtaskDuration] = useState<number>(0);
  const [editingDraftChecklistIndex, setEditingDraftChecklistIndex] = useState<number | null>(null);
  const [editingDraftChecklistText, setEditingDraftChecklistText] = useState('');

  const [completedOpen, setCompletedOpen] = useState(true);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedDeleteTaskIds, setSelectedDeleteTaskIds] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleDeleteTaskId, setSingleDeleteTaskId] = useState<string | null>(null);

  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<AnalysisTab>('overview');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const [aiBuilderOpen, setAiBuilderOpen] = useState(false);
  const [aiBuilderInput, setAiBuilderInput] = useState('');
  const [aiBuilderLoading, setAiBuilderLoading] = useState(false);
  const [aiBuilderError, setAiBuilderError] = useState('');

  const [orderedActiveIds, setOrderedActiveIds] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const bySearch = board.tasks.filter(task =>
      task.title.toLowerCase().includes(search.toLowerCase().trim())
    );
    const byPriority = bySearch.filter(task =>
      priorityFilter === 'all' ? true : task.priority === priorityFilter
    );
    const byGroup = byPriority.filter(task =>
      !groupFilterId ? true : task.columnId === groupFilterId
    );

    const active = byGroup.filter(task => !isTaskCompleted(task));
    const completed = byGroup.filter(task => isTaskCompleted(task));

    const sortByDue = (a: Task, b: Task) => {
      const aDate = a.dueDate ? new Date(`${a.dueDate}T${a.dueTime || '23:59'}`) : null;
      const bDate = b.dueDate ? new Date(`${b.dueDate}T${b.dueTime || '23:59'}`) : null;
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      const diff = aDate.getTime() - bDate.getTime();
      return sortDueDateDesc ? -diff : diff;
    };

    const sortByPriorityOrder = (a: Task, b: Task) => {
      const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      const diff = (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
      if (diff !== 0) return diff;
      return (a.order || 0) - (b.order || 0);
    };

    let activeSorted: Task[];
    if (sortByDueDate) {
      activeSorted = [...active].sort(sortByDue);
    } else if (orderedActiveIds.length > 0) {
      const idSet = new Set(active.map(t => t.id));
      const ordered = orderedActiveIds.filter(id => idSet.has(id));
      const unordered = active.filter(t => !orderedActiveIds.includes(t.id));
      const orderedTasks = ordered.map(id => active.find(t => t.id === id)!).filter(Boolean);
      activeSorted = [...orderedTasks, ...unordered];
    } else {
      activeSorted = [...active].sort(sortByPriorityOrder);
    }

    const completedSorted = [...completed].sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    });

    return { active: activeSorted, completed: completedSorted };
  }, [board.tasks, groupFilterId, priorityFilter, search, sortByDueDate, sortDueDateDesc, orderedActiveIds]);

  const matchingCount = filtered.active.length + filtered.completed.length;
  const openTask = openTaskId ? board.tasks.find(task => task.id === openTaskId) ?? null : null;

  const toggleSortByDueDate = () => {
    if (!sortByDueDate) {
      setSortByDueDate(true);
      setSortDueDateDesc(false);
    } else if (!sortDueDateDesc) {
      setSortDueDateDesc(true);
    } else {
      setSortByDueDate(false);
      setSortDueDateDesc(false);
    }
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || sortByDueDate) return;
    const items = [...filtered.active];
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    setOrderedActiveIds(items.map(t => t.id));
    items.forEach((task, idx) => updateTask(task.id, { order: idx }));
  };

  const runTaskAnalysis = useCallback((type: AnalysisTab) => {
    setActiveAnalysisTab(type);
    setAnalysisLoading(true);
    const scope = [...filtered.active, ...filtered.completed];
    const activeScope = scope.filter(task => !isTaskCompleted(task));
    const now = new Date();
    let result: AnalysisResult;

    if (type === 'overview') {
      const completedCount = scope.filter(t => isTaskCompleted(t)).length;
      const reviewCount = scope.filter(t => getTaskStatus(t) === 'review').length;
      const withSubtasks = scope.filter(t => (t.subtasks || []).length > 0).length;
      const withChecklist = scope.filter(t => t.checklists.some(cl => cl.items.length > 0)).length;
      result = {
        title: 'Task Overview',
        summary: `${scope.length} tasks in current view`,
        lines: [
          { text: `${activeScope.length} active` },
          { text: `${completedCount} completed` },
          { text: `${reviewCount} in review` },
          { text: `${withSubtasks} with sub-tasks` },
          { text: `${withChecklist} with checklist items` },
        ],
      };
    } else if (type === 'duration') {
      const mismatches = activeScope
        .map(task => {
          const estimated = Math.max(0, Number(task.duration) || 0);
          const subtaskTotal = (task.subtasks || []).reduce((s, st) => s + Math.max(0, Number(st.durationMinutes) || 0), 0);
          return { task, estimated, subtaskTotal };
        })
        .filter(item => item.estimated > 0 && item.estimated !== item.subtaskTotal)
        .slice(0, 8);
      result = {
        title: 'Duration Check',
        summary: mismatches.length === 0 ? 'All tasks match estimated duration.' : `${mismatches.length} tasks need review`,
        lines: mismatches.length === 0
          ? [{ text: 'No mismatches found.' }]
          : mismatches.map(item => ({
              text: `${item.task.title}: ${item.estimated} min estimated vs ${item.subtaskTotal} min in sub-tasks`,
              taskId: item.task.id,
            })),
      };
    } else if (type === 'deadlines') {
      const deadlines = activeScope
        .filter(t => !!t.dueDate)
        .map(t => ({ task: t, due: new Date(`${t.dueDate}T${t.dueTime || '23:59'}`) }))
        .filter(item => !Number.isNaN(item.due.getTime()))
        .sort((a, b) => a.due.getTime() - b.due.getTime())
        .slice(0, 8);
      result = {
        title: 'Deadline Risk',
        summary: deadlines.length === 0 ? 'No due dates in current view.' : 'Closest deadlines first',
        lines: deadlines.length === 0
          ? [{ text: 'Add due dates to get deadline analysis.' }]
          : deadlines.map(item => ({
              text: `${item.task.title}: ${item.due.getTime() < now.getTime() ? 'Overdue' : formatDate(item.task.dueDate)} (${getStatusLabel(getTaskStatus(item.task))})`,
              taskId: item.task.id,
            })),
      };
    } else {
      const candidates = activeScope
        .map(task => {
          const pw = ({ urgent: 4, high: 3, medium: 2, low: 1, none: 0 } as Record<string, number>)[task.priority] ?? 0;
          const dw = task.dueDate ? Math.max(0, 100000000000 - new Date(`${task.dueDate}T${task.dueTime || '23:59'}`).getTime()) : 0;
          const ct = task.checklists.reduce((s, l) => s + l.items.length, 0);
          const cd = task.checklists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
          const penalty = ct > 0 ? cd / ct : 0;
          return { task, score: pw * 100 + dw / 1e9 - penalty * 10 };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      result = {
        title: 'Focus Suggestions',
        summary: candidates.length === 0 ? 'No active tasks to analyze.' : 'Suggested tasks to tackle next',
        lines: candidates.length === 0
          ? [{ text: 'Create active tasks to get suggestions.' }]
          : candidates.map(item => ({
              text: `${item.task.title} — ${getStatusLabel(getTaskStatus(item.task))}, ${item.task.priority}`,
              taskId: item.task.id,
            })),
      };
    }

    setTimeout(() => {
      setAnalysisResult(result);
      setAnalysisLoading(false);
    }, 200);
  }, [filtered]);

  const toggleTaskCompletion = (task: Task) => {
    if (isTaskCompleted(task)) {
      updateTask(task.id, { completed: false, completedAt: undefined, status: 'to_do' });
    } else {
      updateTask(task.id, { completed: true, completedAt: new Date().toISOString(), status: 'completed' });
    }
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
      { id: crypto.randomUUID(), text: newSubtaskText.trim(), durationMinutes: Math.max(0, Number(newSubtaskDuration) || 0) },
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

  const handleBulkDelete = () => {
    if (selectedDeleteTaskIds.length === 0) return;
    setDeleteConfirmOpen(true);
  };

  const confirmBulkDelete = () => {
    selectedDeleteTaskIds.forEach(id => deleteTask(id));
    setSelectedDeleteTaskIds([]);
    setIsDeleteMode(false);
    setDeleteConfirmOpen(false);
  };

  const confirmSingleDelete = () => {
    if (singleDeleteTaskId) deleteTask(singleDeleteTaskId);
    setSingleDeleteTaskId(null);
  };

  const generateAITask = async () => {
    if (!aiBuilderInput.trim()) return;
    setAiBuilderLoading(true);
    setAiBuilderError('');
    try {
      const res = await fetch('/api/ai/task-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          input: aiBuilderInput,
          columns: board.columns.map(c => ({ id: c.id, title: c.title })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate task');
      }
      const data: AIGeneratedTask = await res.json();

      setNewTaskTitle(data.title || '');
      setNewTaskDescription(data.description || '');
      setNewTaskPriority((data.priority as Priority) || 'medium');
      setNewTaskStatus((data.status as TaskStatus) || 'to_do');
      setNewTaskDueDate(data.dueDate || '');
      setNewTaskDueTime(data.dueTime || '');
      setNewTaskDuration(data.duration || 60);

      if (data.group) {
        const matchedCol = board.columns.find(c =>
          c.title.toLowerCase() === data.group!.toLowerCase()
        );
        if (matchedCol) setNewTaskColumnId(matchedCol.id);
      }

      setNewTaskSubtasks(
        (data.subtasks || []).map(st => ({
          id: crypto.randomUUID(),
          text: st.text,
          durationMinutes: st.durationMinutes || 0,
        }))
      );
      setNewChecklistItems(data.checklistItems || []);

      setAiBuilderOpen(false);
      setAiBuilderInput('');
      setAddingTask(true);
    } catch (err: any) {
      setAiBuilderError(err.message || 'Something went wrong');
    } finally {
      setAiBuilderLoading(false);
    }
  };

  const newSubtaskTotal = newTaskSubtasks.reduce((s, st) => s + st.durationMinutes, 0);
  const newSubtaskRemaining = newTaskDuration - newSubtaskTotal;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-card/30">
        <div>
          <h1 className="text-lg font-bold text-foreground">All Tasks</h1>
          <p className="text-xs text-muted-foreground">{matchingCount} tasks matching filters</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAiBuilderOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border bg-primary/10 border-primary/20 text-primary hover:bg-primary/15 transition-all"
          >
            <Sparkles className="w-4 h-4" />
            AI Task
          </button>

          <button
            onClick={() => {
              if (isDeleteMode) {
                setIsDeleteMode(false);
                setSelectedDeleteTaskIds([]);
              } else {
                setIsDeleteMode(true);
                setSelectedDeleteTaskIds([]);
              }
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border transition-all ${
              isDeleteMode
                ? 'bg-destructive/15 border-destructive/30 text-destructive'
                : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {isDeleteMode ? 'Exit Delete' : 'Delete'}
          </button>

          <button
            onClick={() => setAddingTask(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </header>

      <div className="px-6 py-4 border-b border-border bg-card/10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search tasks..."
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

          <div className="relative">
            <button
              onClick={() => setGroupDropdownOpen(!groupDropdownOpen)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border transition-all ${
                groupFilterId
                  ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
                  : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>
                {groupFilterId
                  ? `Group: ${board.columns.find(c => c.id === groupFilterId)?.title || ''}`
                  : 'Group Filter'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            </button>

            {groupDropdownOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setGroupDropdownOpen(false)} />
                <div className="absolute left-0 mt-1.5 w-52 bg-card border border-border rounded-xl shadow-lg z-30 py-1 animate-fade-in">
                  <button
                    onClick={() => { setGroupFilterId(null); setGroupDropdownOpen(false); }}
                    className={`w-full text-left px-3.5 py-2 text-xs hover:bg-muted transition-colors flex items-center justify-between ${!groupFilterId ? 'text-primary font-semibold' : 'text-foreground'}`}
                  >
                    All Groups
                    {!groupFilterId && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  </button>
                  <div className="h-px bg-border my-1" />
                  {board.columns.map(column => (
                    <button
                      key={column.id}
                      onClick={() => { setGroupFilterId(column.id); setGroupDropdownOpen(false); }}
                      className={`w-full text-left px-3.5 py-2 text-xs hover:bg-muted transition-colors flex items-center gap-2 ${groupFilterId === column.id ? 'text-primary font-semibold' : 'text-foreground'}`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: column.color }} />
                      <span className="flex-1">{column.title}</span>
                      {groupFilterId === column.id && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={toggleSortByDueDate}
              className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border transition-all ${
                sortByDueDate
                  ? 'bg-primary/10 border-primary/30 text-primary font-semibold'
                  : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
              }`}
              title={sortByDueDate ? (sortDueDateDesc ? 'Latest first — click to disable' : 'Soonest first — click for latest first') : 'Sort by due date'}
            >
              {sortByDueDate && sortDueDateDesc ? (
                <ArrowDown className="w-3.5 h-3.5" />
              ) : sortByDueDate ? (
                <ArrowUp className="w-3.5 h-3.5" />
              ) : (
                <ArrowUp className="w-3.5 h-3.5 opacity-40" />
              )}
              Sort by Due Date
            </button>
            <button
              onClick={() => { setAnalysisPanelOpen(true); runTaskAnalysis(activeAnalysisTab); }}
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
              <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No tasks found</p>
            </div>
          )}

          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="active-tasks">
              {(provided) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="space-y-2"
                >
                  {filtered.active.map((task, index) => {
                    const column = board.columns.find(c => c.id === task.columnId);
                    const isExpanded = expandedTaskIds.includes(task.id);
                    const subtaskCount = task.subtasks?.length || 0;
                    const checklistTotal = task.checklists.reduce((s, l) => s + l.items.length, 0);
                    const checklistDone = task.checklists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
                    const status = getTaskStatus(task);
                    const statusCfg = STATUS_CONFIG[status];
                    const dueWarning = getDueTimeWarning(task);
                    const taskDurFmt = formatDuration(task.duration || 0);

                    return (
                      <Draggable
                        key={task.id}
                        draggableId={task.id}
                        index={index}
                        isDragDisabled={sortByDueDate || isDeleteMode}
                      >
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            onClick={() => {
                              if (isDeleteMode) {
                                setSelectedDeleteTaskIds(prev =>
                                  prev.includes(task.id)
                                    ? prev.filter(id => id !== task.id)
                                    : [...prev, task.id]
                                );
                              } else {
                                setOpenTaskId(task.id);
                              }
                            }}
                            className={`group border rounded-xl bg-card transition-all duration-200 cursor-pointer ${
                              dragSnapshot.isDragging
                                ? 'shadow-xl border-primary/30 bg-card/95'
                                : isDeleteMode
                                ? selectedDeleteTaskIds.includes(task.id)
                                  ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
                                  : 'border-border hover:bg-muted/20'
                                : 'border-border hover:border-border/80 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-center gap-2 px-3 py-3">
                              {isDeleteMode ? (
                                <input
                                  type="checkbox"
                                  checked={selectedDeleteTaskIds.includes(task.id)}
                                  onChange={() => {}}
                                  onClick={e => e.stopPropagation()}
                                  className="w-4 h-4 rounded border-border accent-destructive flex-shrink-0 cursor-pointer"
                                />
                              ) : (
                                <>
                                  <div
                                    {...dragProvided.dragHandleProps}
                                    className={`flex-shrink-0 transition-opacity ${sortByDueDate ? 'opacity-0 pointer-events-none w-0 overflow-hidden' : 'opacity-0 group-hover:opacity-100 hover:opacity-100'}`}
                                    title={sortByDueDate ? 'Disable sort to reorder manually' : 'Drag to reorder'}
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <GripVertical className="w-4 h-4 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing" />
                                  </div>
                                  <div
                                    onClick={e => {
                                      e.stopPropagation();
                                      toggleTaskCompletion(task);
                                    }}
                                  >
                                    <CircleToggle
                                      completed={isTaskCompleted(task)}
                                      onClick={e => { e.stopPropagation(); toggleTaskCompletion(task); }}
                                      size="md"
                                      title="Mark complete"
                                    />
                                  </div>
                                </>
                              )}

                              <span className="text-sm font-medium text-left text-foreground truncate flex-1 min-w-0">
                                {task.title}
                              </span>

                              <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusCfg.className}`}>
                                  {statusCfg.label}
                                </span>

                                {task.dueDate && (
                                  <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${dueBadgeClass(dueWarning, true)}`}>
                                    {(dueWarning === 'soon' || dueWarning === 'imminent' || dueWarning === 'overdue') && (
                                      <Clock className="w-2.5 h-2.5 flex-shrink-0" />
                                    )}
                                    {dueWarning === 'overdue' ? 'Overdue' : formatDate(task.dueDate)}
                                  </span>
                                )}

                                {taskDurFmt && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    {taskDurFmt}
                                  </span>
                                )}

                                {checklistTotal > 0 && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    {checklistDone}/{checklistTotal} items
                                  </span>
                                )}

                                {subtaskCount > 0 && (
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                    {subtaskCount} sub-task{subtaskCount === 1 ? '' : 's'}
                                  </span>
                                )}

                                {column && (
                                  <span
                                    className="text-[10px] px-2 py-0.5 rounded-full font-medium text-white"
                                    style={{ backgroundColor: column.color }}
                                  >
                                    {column.title}
                                  </span>
                                )}

                                {!isDeleteMode && (
                                  <>
                                    <button
                                      onClick={e => { e.stopPropagation(); toggleExpand(task.id); }}
                                      className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                                      title={isExpanded ? 'Collapse' : 'Expand'}
                                    >
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                      onClick={e => { e.stopPropagation(); openDeepFocus(task); }}
                                      className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary"
                                      title="Open Deep Focus"
                                    >
                                      <Brain className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            {isExpanded && !isDeleteMode && (
                              <div
                                onClick={e => e.stopPropagation()}
                                className="border-t border-border px-4 py-3 space-y-4 bg-muted/10 rounded-b-xl"
                              >
                                <div>
                                  <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">Description</h4>
                                  <p className="text-sm text-foreground whitespace-pre-wrap">{task.description || 'No description'}</p>
                                </div>

                                {task.subtasks.length > 0 && (
                                  <div>
                                    <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Sub-tasks</h4>
                                    <div className="space-y-1.5">
                                      {task.subtasks.map(subtask => (
                                        <div key={subtask.id} className="flex items-center gap-2.5 text-sm">
                                          <CircleToggle
                                            completed={subtask.completed}
                                            onClick={e => {
                                              e.stopPropagation();
                                              updateTask(task.id, {
                                                subtasks: task.subtasks.map(st =>
                                                  st.id === subtask.id ? { ...st, completed: !st.completed } : st
                                                ),
                                              });
                                            }}
                                            size="sm"
                                          />
                                          <span className={subtask.completed ? 'line-through text-muted-foreground' : 'text-foreground flex-1'}>{subtask.text}</span>
                                          {subtask.durationMinutes > 0 && (
                                            <span className="text-xs text-muted-foreground ml-auto">{subtask.durationMinutes} min</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {task.checklists.length > 0 && (
                                  <div>
                                    <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Checklist</h4>
                                    <div className="space-y-1.5">
                                      {task.checklists.map(checklist =>
                                        checklist.items.map(item => (
                                          <div key={item.id} className="flex items-center gap-2.5 text-sm">
                                            <SquareToggle
                                              completed={item.completed}
                                              onClick={e => {
                                                e.stopPropagation();
                                                toggleChecklistItem(task.id, checklist.id, item.id);
                                              }}
                                              size="md"
                                            />
                                            <span className={item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}>{item.text}</span>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                )}

                                <div className="flex justify-end pt-1">
                                  <button
                                    onClick={e => {
                                      e.stopPropagation();
                                      setSingleDeleteTaskId(task.id);
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete Task
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {filtered.completed.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border/80">
              <div className="border border-label-green/20 rounded-xl bg-label-green/5">
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
                  <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                    {filtered.completed.map(task => (
                      <div
                        key={task.id}
                        onClick={() => {
                          if (isDeleteMode) {
                            setSelectedDeleteTaskIds(prev =>
                              prev.includes(task.id)
                                ? prev.filter(id => id !== task.id)
                                : [...prev, task.id]
                            );
                          } else {
                            setOpenTaskId(task.id);
                          }
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                          isDeleteMode
                            ? selectedDeleteTaskIds.includes(task.id)
                              ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
                              : 'border-border bg-background/50 hover:bg-muted/20'
                            : 'border-label-green/15 bg-background/70 hover:bg-muted/40'
                        }`}
                      >
                        {isDeleteMode ? (
                          <input
                            type="checkbox"
                            checked={selectedDeleteTaskIds.includes(task.id)}
                            onChange={() => {}}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 rounded border-border accent-destructive flex-shrink-0 cursor-pointer"
                          />
                        ) : (
                          <CircleToggle
                            completed
                            onClick={e => { e.stopPropagation(); toggleTaskCompletion(task); }}
                            size="md"
                            title="Mark active"
                          />
                        )}

                        <span className={`text-sm text-left flex-1 ${isDeleteMode ? 'text-foreground font-medium' : 'text-muted-foreground/80 line-through'}`}>
                          {task.title}
                        </span>

                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-label-green/15 text-label-green font-medium flex-shrink-0">
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
              <button onClick={() => { setAddingTask(false); resetTaskDraft(); }} className="p-1.5 rounded-lg hover:bg-muted">
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
                  rows={3}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">Sub-tasks</label>
                  {newTaskDuration > 0 && (
                    <span className={`text-[11px] font-medium ${
                      newSubtaskRemaining > 0 ? 'text-muted-foreground' :
                      newSubtaskRemaining < 0 ? 'text-orange-500' : 'text-label-green'
                    }`}>
                      {newSubtaskRemaining > 0
                        ? `${newSubtaskRemaining} mins left`
                        : newSubtaskRemaining < 0
                        ? `Over by ${Math.abs(newSubtaskRemaining)} mins`
                        : '0 mins left ✓'}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {newTaskSubtasks.map((subtask) => (
                    <div key={subtask.id} className="grid grid-cols-[1fr_auto_auto] gap-2 items-center bg-muted/20 px-3 py-2 rounded-lg border border-border/50 group">
                      {editingDraftSubtaskId === subtask.id ? (
                        <>
                          <input
                            autoFocus
                            className="text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                            value={editingDraftSubtaskText}
                            onChange={e => setEditingDraftSubtaskText(e.target.value)}
                          />
                          <input
                            type="number"
                            className="w-20 text-xs bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                            value={editingDraftSubtaskDuration}
                            onChange={e => setEditingDraftSubtaskDuration(Math.max(0, Number(e.target.value) || 0))}
                          />
                          <button
                            onClick={() => {
                              setNewTaskSubtasks(prev => prev.map(st => st.id === subtask.id ? { ...st, text: editingDraftSubtaskText, durationMinutes: editingDraftSubtaskDuration } : st));
                              setEditingDraftSubtaskId(null);
                            }}
                            className="text-xs text-primary font-bold"
                          >
                            Save
                          </button>
                        </>
                      ) : (
                        <>
                          <span
                            onClick={() => { setEditingDraftSubtaskId(subtask.id); setEditingDraftSubtaskText(subtask.text); setEditingDraftSubtaskDuration(subtask.durationMinutes); }}
                            className="text-sm text-foreground font-medium cursor-text"
                          >
                            {subtask.text}
                          </span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              className="w-16 text-xs bg-muted/40 border border-border rounded px-1.5 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                              value={subtask.durationMinutes || 0}
                              onChange={e => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                setNewTaskSubtasks(prev => prev.map(st => st.id === subtask.id ? { ...st, durationMinutes: val } : st));
                              }}
                            />
                            <span className="text-[10px] text-muted-foreground">min</span>
                            <button
                              onClick={() => setNewTaskSubtasks(prev => prev.filter(st => st.id !== subtask.id))}
                              className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
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
                    placeholder="min"
                    className="bg-muted/40 border border-border rounded-lg px-2 py-2 text-sm"
                  />
                  <button onClick={addSubtaskDraft} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">Add</button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase text-muted-foreground">Checklist</label>
                <div className="space-y-1">
                  {newChecklistItems.map((item, index) => (
                    <div key={`${item}-${index}`} className="flex items-center gap-2.5 text-sm bg-muted/20 px-3 py-2 rounded-lg border border-border/50 group">
                      <SquareToggle completed={false} onClick={e => e.preventDefault()} size="md" />
                      {editingDraftChecklistIndex === index ? (
                        <input
                          autoFocus
                          className="flex-1 text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                          value={editingDraftChecklistText}
                          onChange={e => setEditingDraftChecklistText(e.target.value)}
                          onBlur={() => { setNewChecklistItems(prev => prev.map((it, i) => i === index ? editingDraftChecklistText : it)); setEditingDraftChecklistIndex(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') { setNewChecklistItems(prev => prev.map((it, i) => i === index ? editingDraftChecklistText : it)); setEditingDraftChecklistIndex(null); } }}
                        />
                      ) : (
                        <span onClick={() => { setEditingDraftChecklistIndex(index); setEditingDraftChecklistText(item); }} className="flex-1 cursor-text">{item}</span>
                      )}
                      <button
                        onClick={() => setNewChecklistItems(prev => prev.filter((_, i) => i !== index))}
                        className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
                <label className="text-xs font-semibold uppercase text-muted-foreground">Attachments</label>
                {!isPremium ? (
                  <div className="border border-dashed border-border rounded-xl">
                    <PremiumGate
                      title="File Attachments"
                      description="Attach files, images, and documents directly to your tasks."
                      icon={<Paperclip className="w-6 h-6 text-primary" />}
                    />
                  </div>
                ) : (
                  <>
                    <div className="group relative mt-1">
                      <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                        <div className="flex flex-col items-center justify-center py-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                            <Paperclip className="w-5 h-5 text-primary" />
                          </div>
                          <p className="text-sm font-medium text-foreground">Click to upload or drag and drop</p>
                          <p className="text-xs text-muted-foreground mt-1">PDF, Images, Documents (max 10MB)</p>
                        </div>
                        <input
                          type="file"
                          multiple
                          onChange={e => {
                            if (!e.target.files) return;
                            setNewFiles(prev => [...prev, ...Array.from(e.target.files || [])]);
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                    {newFiles.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                        {newFiles.map((file, fileIdx) => (
                          <div key={`${file.name}-${fileIdx}`} className="relative group/att">
                            <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40">
                              <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center">
                                <Paperclip className="w-5 h-5 text-muted-foreground" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                              </div>
                            </div>
                            <button
                              onClick={e => { e.preventDefault(); e.stopPropagation(); setNewFiles(prev => prev.filter((_, idx) => idx !== fileIdx)); }}
                              className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/att:opacity-100 transition-all shadow-sm"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => { setAddingTask(false); resetTaskDraft(); }} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button
                onClick={createTask}
                disabled={!newTaskTitle.trim()}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
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
                  <BarChart3 className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Task Analysis</h3>
              </div>
              <button onClick={() => setAnalysisPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </header>

            {!isPremium ? (
              <div className="flex-1 flex items-center">
                <PremiumGate
                  title="Task Analysis"
                  description="Get AI-powered insights into your tasks with overview, duration check, deadline risk, and focus suggestions."
                  icon={<BarChart3 className="w-6 h-6 text-primary" />}
                />
              </div>
            ) : (
              <>
                <div className="flex border-b border-border">
                  {(
                    [
                      { key: 'overview', label: 'Overview' },
                      { key: 'duration', label: 'Duration' },
                      { key: 'deadlines', label: 'Deadlines' },
                      { key: 'focus', label: 'Focus' },
                    ] as Array<{ key: AnalysisTab; label: string }>
                  ).map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => runTaskAnalysis(tab.key)}
                      className={`flex-1 px-2 py-3 text-xs font-semibold transition-all border-b-2 ${
                        activeAnalysisTab === tab.key
                          ? 'text-primary border-primary'
                          : 'text-muted-foreground border-transparent hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {analysisLoading && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      Analyzing tasks...
                    </div>
                  )}
                  {!analysisLoading && !analysisResult && (
                    <p className="text-sm text-muted-foreground">Select a tab to run analysis.</p>
                  )}
                  {!analysisLoading && analysisResult && (
                    <div className="space-y-3">
                      <h4 className="text-base font-semibold text-foreground">{analysisResult.title}</h4>
                      <p className="text-sm text-muted-foreground">{analysisResult.summary}</p>
                      <div className="space-y-2">
                        {analysisResult.lines.map((line, idx) => (
                          <div
                            key={idx}
                            className={`text-sm text-foreground bg-muted/30 rounded-lg px-3 py-2 ${line.taskId ? 'cursor-pointer hover:bg-muted/60 transition-colors' : ''}`}
                            onClick={() => {
                              if (line.taskId) {
                                setAnalysisPanelOpen(false);
                                setOpenTaskId(line.taskId);
                              }
                            }}
                          >
                            {line.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
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
          onDeleteTask={taskId => { setSingleDeleteTaskId(taskId); setOpenTaskId(null); }}
          isPremium={isPremium}
          isPro={isPro}
          onJumpToTask={id => { setOpenTaskId(null); setTimeout(() => setOpenTaskId(id), 50); }}
        />
      )}

      {isDeleteMode && (
        <div className="sticky bottom-0 left-0 right-0 z-30 p-4 bg-background/80 backdrop-blur-md border-t border-border flex justify-center animate-fade-in">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center text-destructive flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-foreground">
                {selectedDeleteTaskIds.length === 0
                  ? 'Select tasks to delete'
                  : `${selectedDeleteTaskIds.length} task${selectedDeleteTaskIds.length === 1 ? '' : 's'} selected`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSelectedDeleteTaskIds([]); setIsDeleteMode(false); }}
                className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-muted text-muted-foreground transition-all"
              >
                Cancel
              </button>
              <button
                disabled={selectedDeleteTaskIds.length === 0}
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-destructive text-destructive-foreground rounded-lg disabled:opacity-40 hover:bg-destructive/95 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete selected — {selectedDeleteTaskIds.length} task{selectedDeleteTaskIds.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <DeleteConfirmDialog
          count={selectedDeleteTaskIds.length}
          onConfirm={confirmBulkDelete}
          onCancel={() => setDeleteConfirmOpen(false)}
        />
      )}

      {singleDeleteTaskId && (
        <DeleteConfirmDialog
          count={1}
          onConfirm={confirmSingleDelete}
          onCancel={() => setSingleDeleteTaskId(null)}
        />
      )}

      {aiBuilderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setAiBuilderOpen(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">AI Task Builder</h2>
                  <p className="text-xs text-muted-foreground">Describe your task and AI will structure it for you</p>
                </div>
              </div>
              <button onClick={() => setAiBuilderOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {!isPro ? (
              <div className="p-6">
                <PremiumGate
                  title="AI Task Builder"
                  description="Describe any task or project in plain text and AI will build a fully structured task for you automatically."
                  icon={<Zap className="w-6 h-6 text-primary" />}
                />
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <textarea
                  autoFocus
                  value={aiBuilderInput}
                  onChange={e => setAiBuilderInput(e.target.value)}
                  placeholder="Describe your task, project, or goal in detail...&#10;&#10;e.g. 'I need to launch a new website by next Friday. It requires designing 3 pages, writing copy, setting up hosting, and testing on mobile.'"
                  rows={7}
                  className="w-full bg-muted/40 border border-border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                {aiBuilderError && (
                  <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{aiBuilderError}</p>
                )}
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setAiBuilderOpen(false)}
                    className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={generateAITask}
                    disabled={!aiBuilderInput.trim() || aiBuilderLoading}
                    className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
                  >
                    {aiBuilderLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
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
  onDeleteTask: (taskId: string) => void;
  isPremium: boolean;
  isPro: boolean;
  onJumpToTask?: (taskId: string) => void;
}

const TaskFullView: React.FC<TaskFullViewProps> = ({
  task,
  boardColumns,
  onClose,
  onUpdateTask,
  onToggleChecklistItem,
  onAddChecklistItem,
  onDeleteChecklistItem,
  onDeleteTask,
  isPremium,
}) => {
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newSubtaskDuration, setNewSubtaskDuration] = useState(10);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [editingChecklistText, setEditingChecklistText] = useState('');
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [uploading, setUploading] = useState(false);
  const canUseServerAttachmentApi = /^\d+$/.test(String(task.id));

  const legacySubtasksChecklist = task.checklists.find(list => list.title.toLowerCase().trim() === 'subtasks');
  const checklistLists = task.checklists.filter(list => list.id !== legacySubtasksChecklist?.id);
  const effectiveSubtasks = (task.subtasks && task.subtasks.length > 0)
    ? task.subtasks
    : (legacySubtasksChecklist?.items || []).map(item => ({ ...item, durationMinutes: 0 }));
  const primaryChecklist = checklistLists[0];
  const taskDuration = Math.max(0, Number(task.duration) || 0);
  const subtaskTotal = effectiveSubtasks.reduce((s, st) => s + Math.max(0, Number(st.durationMinutes) || 0), 0);
  const subtaskTimeRemaining = taskDuration - subtaskTotal;
  const allSubtasksDone = effectiveSubtasks.length > 0 && effectiveSubtasks.every(st => st.completed);

  const currentStatus = getTaskStatus(task);
  const statusCfg = STATUS_CONFIG[currentStatus];

  const dueWarning = useMemo<DueWarningLevel>(() => getDueTimeWarning(task), [task.dueDate, task.dueTime, task.completed, task.status]);

  const persistSubtasks = (nextSubtasks: Task['subtasks']) => {
    const nextChecklists = legacySubtasksChecklist
      ? task.checklists.filter(list => list.id !== legacySubtasksChecklist.id)
      : task.checklists;
    onUpdateTask(task.id, { subtasks: nextSubtasks, checklists: nextChecklists });
  };

  const updateSubtask = (subtaskId: string, updates: Partial<Task['subtasks'][number]>) => {
    persistSubtasks(effectiveSubtasks.map(st => st.id === subtaskId ? { ...st, ...updates } : st));
  };

  const addSubtask = () => {
    if (!newSubtaskText.trim()) return;
    persistSubtasks([
      ...effectiveSubtasks,
      { id: crypto.randomUUID(), text: newSubtaskText.trim(), completed: false, durationMinutes: Math.max(0, Number(newSubtaskDuration) || 0) },
    ]);
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
  };

  const removeSubtask = (subtaskId: string) => {
    persistSubtasks(effectiveSubtasks.filter(st => st.id !== subtaskId));
  };

  const saveSubtaskEdit = (subtaskId: string) => {
    const next = editingSubtaskText.trim();
    if (next) updateSubtask(subtaskId, { text: next });
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
  };

  const addChecklistItemToTask = () => {
    if (!newChecklistText.trim()) return;
    if (!primaryChecklist) {
      onUpdateTask(task.id, {
        checklists: [...checklistLists, {
          id: crypto.randomUUID(),
          title: 'Checklist',
          items: [{ id: crypto.randomUUID(), text: newChecklistText.trim(), completed: false }],
        }],
      });
      setNewChecklistText('');
      return;
    }
    onAddChecklistItem(task.id, primaryChecklist.id, newChecklistText.trim());
    setNewChecklistText('');
  };

  const saveChecklistItemEdit = (checklistId: string, itemId: string) => {
    const next = editingChecklistText.trim();
    if (next) {
      onUpdateTask(task.id, {
        checklists: task.checklists.map(list =>
          list.id !== checklistId ? list : {
            ...list,
            items: list.items.map(item => item.id === itemId ? { ...item, text: next } : item),
          }
        ),
      });
    }
    setEditingChecklistItemId(null);
    setEditingChecklistText('');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    setUploading(true);
    const uploaded: Attachment[] = [];
    for (const file of files) {
      if (canUseServerAttachmentApi) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch(`/api/attachments/${task.id}`, { method: 'POST', credentials: 'include', body: formData });
          if (res.ok) {
            uploaded.push(await res.json());
          } else {
            uploaded.push({ id: crypto.randomUUID(), taskId: task.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: URL.createObjectURL(file), createdAt: new Date().toISOString() });
          }
        } catch {
          uploaded.push({ id: crypto.randomUUID(), taskId: task.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: URL.createObjectURL(file), createdAt: new Date().toISOString() });
        }
      } else {
        uploaded.push({ id: crypto.randomUUID(), taskId: task.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: URL.createObjectURL(file), createdAt: new Date().toISOString() });
      }
    }
    if (uploaded.length > 0) onUpdateTask(task.id, { attachments: [...(task.attachments || []), ...uploaded] });
    setUploading(false);
    e.currentTarget.value = '';
  };

  const deleteAttachment = async (attachmentId: string) => {
    onUpdateTask(task.id, { attachments: (task.attachments || []).filter(item => item.id !== attachmentId) });
    if (canUseServerAttachmentApi && /^\d+$/.test(String(attachmentId))) {
      try { await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE', credentials: 'include' }); } catch {}
    }
  };

  const addComment = () => {
    if (!newCommentText.trim()) return;
    onUpdateTask(task.id, {
      comments: [...(task.comments || []), { id: crypto.randomUUID(), text: newCommentText.trim(), createdAt: new Date().toISOString() }],
    });
    setNewCommentText('');
  };

  const deleteComment = (commentId: string) => {
    onUpdateTask(task.id, { comments: (task.comments || []).filter(c => c.id !== commentId) });
  };

  const updateComment = (commentId: string, text: string) => {
    onUpdateTask(task.id, { comments: (task.comments || []).map(c => c.id === commentId ? { ...c, text } : c) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto p-5 space-y-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <input
            className="flex-1 px-1 text-2xl font-semibold text-foreground bg-transparent border-none focus:outline-none focus:ring-0"
            value={task.title}
            onChange={e => onUpdateTask(task.id, { title: e.target.value })}
          />
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground">Status</label>
            <select
              value={currentStatus}
              onChange={e => {
                const s = e.target.value as TaskStatus;
                onUpdateTask(task.id, { status: s, completed: s === 'completed', completedAt: s === 'completed' ? new Date().toISOString() : undefined });
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
          <div className={`text-sm px-3 py-2 rounded-lg flex items-center gap-2 ${
            dueWarning === 'overdue' || dueWarning === 'imminent'
              ? 'bg-destructive/10 text-destructive border border-destructive/20'
              : 'bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800/30'
          }`}>
            <Clock className="w-4 h-4 flex-shrink-0" />
            {dueWarning === 'overdue'
              ? 'This task is overdue.'
              : dueWarning === 'imminent'
              ? 'Due in less than 30 minutes!'
              : 'Due in less than 2 hours — running out of time.'}
          </div>
        )}

        <div>
          <label className="text-xs font-semibold uppercase text-muted-foreground">Description</label>
          <textarea
            value={task.description}
            onChange={e => onUpdateTask(task.id, { description: e.target.value })}
            rows={4}
            className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Sub-tasks</h3>
            {taskDuration > 0 && (
              <span className={`text-xs font-medium ${
                subtaskTimeRemaining > 0 ? 'text-muted-foreground' :
                subtaskTimeRemaining < 0 ? 'text-orange-500' : 'text-label-green'
              }`}>
                {subtaskTimeRemaining > 0
                  ? `${subtaskTimeRemaining} mins left`
                  : subtaskTimeRemaining < 0
                  ? `Over by ${Math.abs(subtaskTimeRemaining)} mins`
                  : '0 mins left ✓'}
              </span>
            )}
          </div>

          {allSubtasksDone && (
            <div className="text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-md inline-block">
              All sub-tasks are done ✓
            </div>
          )}

          <div className="space-y-2">
            {effectiveSubtasks.map(subtask => (
              <div key={subtask.id} className="grid grid-cols-[auto_1fr_auto] gap-2 items-center rounded-lg border border-border px-3 py-2 group">
                <CircleToggle
                  completed={subtask.completed}
                  onClick={() => updateSubtask(subtask.id, { completed: !subtask.completed })}
                  size="sm"
                />
                {editingSubtaskId === subtask.id ? (
                  <input
                    autoFocus
                    className="text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                    value={editingSubtaskText}
                    onChange={e => setEditingSubtaskText(e.target.value)}
                    onBlur={() => saveSubtaskEdit(subtask.id)}
                    onKeyDown={e => e.key === 'Enter' && saveSubtaskEdit(subtask.id)}
                  />
                ) : (
                  <span
                    onClick={() => { setEditingSubtaskId(subtask.id); setEditingSubtaskText(subtask.text); }}
                    className={`text-sm cursor-text ${subtask.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                  >
                    {subtask.text}
                  </span>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    className="w-16 text-xs bg-muted/40 border border-border rounded px-1.5 py-0.5 text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                    value={subtask.durationMinutes || 0}
                    onChange={e => updateSubtask(subtask.id, { durationMinutes: Math.max(0, Number(e.target.value) || 0) })}
                  />
                  <span className="text-[10px] text-muted-foreground">min</span>
                  <button
                    onClick={() => removeSubtask(subtask.id)}
                    className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
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
              placeholder="min"
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
                    <div key={item.id} className="flex items-center gap-2.5 text-sm group">
                      <SquareToggle
                        completed={item.completed}
                        onClick={() => onToggleChecklistItem(task.id, list.id, item.id)}
                        size="md"
                      />
                      {editingChecklistItemId === item.id ? (
                        <input
                          autoFocus
                          className="flex-1 text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                          value={editingChecklistText}
                          onChange={e => setEditingChecklistText(e.target.value)}
                          onBlur={() => saveChecklistItemEdit(list.id, item.id)}
                          onKeyDown={e => e.key === 'Enter' && saveChecklistItemEdit(list.id, item.id)}
                        />
                      ) : (
                        <span
                          onClick={() => { setEditingChecklistItemId(item.id); setEditingChecklistText(item.text); }}
                          className={`flex-1 cursor-text ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                        >
                          {item.text}
                        </span>
                      )}
                      <button
                        onClick={() => onDeleteChecklistItem(task.id, list.id, item.id)}
                        className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
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
          {!isPremium ? (
            <div className="border border-dashed border-border rounded-xl">
              <PremiumGate
                title="File Attachments"
                description="Attach files, images, and documents directly to your tasks."
                icon={<Paperclip className="w-6 h-6 text-primary" />}
              />
            </div>
          ) : (
            <>
              <div className="relative mt-1">
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
                      <span className="text-sm font-medium">Uploading...</span>
                    </div>
                  </div>
                )}
              </div>
              {(task.attachments || []).length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                  {(task.attachments || []).map(attachment => {
                    const isServerAtt = /^\d+$/.test(String(attachment.id));
                    const href = isServerAtt ? `/api/attachments/file/${attachment.id}` : attachment.fileUrl;
                    return (
                      <div key={attachment.id} className="relative group/att">
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/40 hover:bg-muted transition-all"
                        >
                          <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center">
                            <Paperclip className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{attachment.fileName}</p>
                            <p className="text-xs text-muted-foreground">{attachment.fileSize ? `${(attachment.fileSize / 1024).toFixed(1)} KB` : 'Attached file'}</p>
                          </div>
                        </a>
                        <button
                          onClick={e => { e.preventDefault(); e.stopPropagation(); deleteAttachment(attachment.id); }}
                          className="absolute top-2 right-2 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/att:opacity-100 transition-all shadow-sm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Comments</h3>
          <div className="space-y-2">
            {(task.comments || []).map(comment => (
              <div key={comment.id} className="border border-border rounded-lg px-3 py-2 group">
                <div className="flex items-start justify-between gap-2">
                  {editingCommentId === comment.id ? (
                    <textarea
                      autoFocus
                      className="flex-1 bg-muted/40 border border-primary/30 rounded px-2 py-1 text-sm resize-none"
                      value={editingCommentText}
                      onChange={e => setEditingCommentText(e.target.value)}
                      onBlur={() => { updateComment(comment.id, editingCommentText); setEditingCommentId(null); }}
                    />
                  ) : (
                    <p
                      onClick={() => { setEditingCommentId(comment.id); setEditingCommentText(comment.text); }}
                      className="text-sm text-foreground whitespace-pre-wrap flex-1 cursor-text"
                    >
                      {comment.text}
                    </p>
                  )}
                  <button
                    onClick={() => deleteComment(comment.id)}
                    className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{new Date(comment.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mb-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${statusCfg.className}`}>
              {statusCfg.label}
            </span>
            {task.dueDate && (
              <span className={`text-xs flex items-center gap-1 ${
                dueWarning === 'overdue' || dueWarning === 'imminent' ? 'text-destructive' :
                dueWarning === 'soon' ? 'text-orange-500' : 'text-muted-foreground'
              }`}>
                {dueWarning && <Clock className="w-3 h-3" />}
                Due: {formatDate(task.dueDate)}
                {task.dueTime && ` at ${task.dueTime}`}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <input
              value={newCommentText}
              onChange={e => setNewCommentText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addComment()}
              placeholder="Add a comment..."
              className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={addComment}
              className="px-4 py-2 text-xs bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all font-medium"
            >
              Send
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            {task.priority !== 'none' && (
              <span className={`${PRIORITY_CONFIG[task.priority as Exclude<typeof task.priority, 'none'>]?.className} text-[10px] font-bold px-2 py-0.5 rounded text-primary-foreground`}>
                {PRIORITY_CONFIG[task.priority as Exclude<typeof task.priority, 'none'>]?.label}
              </span>
            )}
            <span className="text-xs text-muted-foreground">Created: {new Date(task.createdAt).toLocaleDateString()}</span>
          </div>
          <button
            onClick={() => onDeleteTask(task.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete Task
          </button>
        </div>
      </div>
    </div>
  );
};

export default Tasks;
