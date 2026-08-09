import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useHabitsContext } from '@/context/HabitsContext';
import { useAuth } from '@/context/AuthContext';
import { Attachment, ChecklistItem, DEFAULT_LABELS, Label, LabelColor, Priority, PRIORITY_CONFIG, Subtask, Habit, TaskStatus, TaskTemplate, LABEL_COLORS } from '@/types/board';
import { fetchTemplates, createTemplate, updateTemplate, deleteTemplate as deleteTemplateApi } from '@/services/taskTemplateService';
import { createTag, deleteTag, fetchTags, type SharedTag } from '@/services/tagService';
import heic2any from 'heic2any';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Brain,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Clock3,
  Edit3,
  GripVertical,
  FolderKanban,
  Image,
  Paperclip,
  Plus,
  Save,
  Search,
  Tag,
  Sparkles,
  Star,
  Target,
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';

import { CircleToggle, SquareToggle } from '@/components/ToggleComponents';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

const isHabitCompleted = (habit: Habit) => Boolean(habit.completed || habit.status === 'completed');

const getTaskStatus = (habit: Habit): TaskStatus => {
  if (habit.status) return habit.status;
  return habit.completed ? 'completed' : 'to_do';
};

const getStatusLabel = (status: TaskStatus) =>
  STATUS_OPTIONS.find(o => o.value === status)?.label || 'To Do';

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const imageToDataUrl = async (file: File): Promise<string> => {
  const isHeic = /\.heic$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';
  if (isHeic) {
    try {
      const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.8 });
      const converted = Array.isArray(blob) ? blob[0] : blob;
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(converted);
      });
    } catch {
      return fileToDataUrl(file);
    }
  }
  return fileToDataUrl(file);
};

const daysUntilAutoDelete = (completedAt?: string) => {
  if (!completedAt) return 5;
  const started = new Date(completedAt);
  if (Number.isNaN(started.getTime())) return 5;
  const expires = new Date(started);
  expires.setDate(expires.getDate() + 5);
  return Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86400000));
};

type DueWarningLevel = null | 'soon' | 'imminent' | 'overdue';

const getDueTimeWarning = (habit: Habit): DueWarningLevel => {
  if (!habit.dueDate || isHabitCompleted(habit)) return null;
  const due = habit.dueTime
    ? new Date(`${habit.dueDate}T${habit.dueTime}`)
    : new Date(`${habit.dueDate}T23:59:59`);
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

const TAG_COLOR_OPTIONS: LabelColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];

const randomTagColor = (): LabelColor => TAG_COLOR_OPTIONS[Math.floor(Math.random() * TAG_COLOR_OPTIONS.length)] || 'blue';

const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ');

const SHARED_TAG_PREFIX = 'shared-tag-';
const SHARED_COLOR_MAP: Record<string, LabelColor> = {
  red: 'red',
  orange: 'orange',
  yellow: 'yellow',
  green: 'green',
  blue: 'blue',
  purple: 'purple',
  pink: 'pink',
};
const SHARED_COLOR_HEX_MAP: Array<{ hex: string; color: LabelColor }> = [
  { hex: '#ef4444', color: 'red' },
  { hex: '#f97316', color: 'orange' },
  { hex: '#eab308', color: 'yellow' },
  { hex: '#22c55e', color: 'green' },
  { hex: '#3b82f6', color: 'blue' },
  { hex: '#8b5cf6', color: 'purple' },
  { hex: '#ec4899', color: 'pink' },
];
const sharedTagLabelId = (id: number) => `${SHARED_TAG_PREFIX}${id}`;
const sharedTagToLabel = (tag: SharedTag): Label => ({
  id: sharedTagLabelId(tag.id),
  name: tag.name,
  color: SHARED_COLOR_MAP[tag.color.toLowerCase()]
    || SHARED_COLOR_HEX_MAP.find(item => item.hex.toLowerCase() === tag.color.toLowerCase())?.color
    || 'blue',
});

interface ProjectMeta {
  id: number;
  name: string;
  color: string;
  description: string;
}

interface NewHabitSubtaskDraft {
  id: string;
  text: string;
  durationMinutes: number;
}

interface AIGeneratedHabit {
  title: string;
  description: string;
  priority: Priority;
  startDate: string | null;
  startTime: string | null;
  dueDate: string | null;
  dueTime: string | null;
  duration: number | null;
  group: string | null;
  status: TaskStatus;
  subtasks: Array<{ text: string; durationMinutes: number }>;
  checklistItems: string[];
  tags: string[];
}

const PRIORITY_COLORS: Record<string, { bg: string; label: string }> = {
  urgent: { bg: '#dc2626', label: 'Urgent' },
  high: { bg: '#ea580c', label: 'High' },
  medium: { bg: '#ca8a04', label: 'Medium' },
  low: { bg: '#2563eb', label: 'Low' },
  none: { bg: '#9ca3af', label: 'None' },
};

const PriorityBadge: React.FC<{
  habit: Habit;
  onUpdate: (priority: Priority) => void;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ habit, onUpdate, isOpen, onToggle }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onToggle(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onToggle]);
  const pc = PRIORITY_COLORS[habit.priority];
  return (
    <div className="relative flex-shrink-0 flex items-center" ref={ref}>
      {habit.priority !== 'none' ? (
        <button
          onClick={e => { e.stopPropagation(); onToggle(); }}
          style={{ backgroundColor: pc?.bg }}
          className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-white inline-flex items-center"
        >
          {pc?.label}
        </button>
      ) : isOpen ? (
        <button
          onClick={e => { e.stopPropagation(); onToggle(); }}
          className="text-[10px] px-2 py-0.5 rounded-full font-semibold flex-shrink-0 border border-border text-muted-foreground"
        >
          Priority
        </button>
      ) : null}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 w-36 bg-card border border-border rounded-xl shadow-xl p-1.5 space-y-0.5">
          {(['urgent', 'high', 'medium', 'low', 'none'] as const).map(p => {
            const c = PRIORITY_COLORS[p];
            return (
              <button
                key={p}
                onClick={e => { e.stopPropagation(); onUpdate(p); }}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs rounded-lg transition-all ${habit.priority === p ? 'bg-primary/10 font-bold' : 'hover:bg-muted'}`}
              >
                <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: c.bg }} />
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

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
      onClick={() => window.location.href = '/pricing'}
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
          <h3 className="text-sm font-bold text-foreground">Delete {count} habit{count === 1 ? '' : 's'}?</h3>
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
          Delete {count} habit{count === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  </div>
);

const Habits: React.FC = () => {
  const {
    board,
    addTask,
    updateTask,
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
    deleteTask,
    updateColumn,
  } = useHabitsContext();
  const { user } = useAuth();


  const tier = user?.subscriptionTier || 'free';
  const isPremium = tier === 'premium' || tier === 'pro';
  const isPro = tier === 'pro';
  const mediaLimit = tier === 'free' ? 5 : tier === 'premium' ? 10 : 20;

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [sharedTags, setSharedTags] = useState<SharedTag[]>([]);
  const [projectFilterId, setProjectFilterId] = useState<number | 'all'>('all');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [tagFilterIds, setTagFilterIds] = useState<string[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<LabelColor>(randomTagColor());
  const [quickEditTaskId, setQuickEditTaskId] = useState<string | null>(null);
  const [quickEditField, setQuickEditField] = useState<'duration' | 'project' | null>(null);
  const [priorityEditTaskId, setPriorityEditTaskId] = useState<string | null>(null);
  const [quickEditDueDate, setQuickEditDueDate] = useState('');
  const [quickEditDueTime, setQuickEditDueTime] = useState('');
  const [quickEditDuration, setQuickEditDuration] = useState(0);
  const [quickEditStatus, setQuickEditStatus] = useState<TaskStatus>('to_do');
  const [quickEditProjectId, setQuickEditProjectId] = useState<number | ''>('');

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>(() => {
    try { const v = localStorage.getItem('habits-expanded-ids'); return v ? JSON.parse(v) : []; } catch { return []; }
  });

  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'high' | 'medium' | 'low'>('all');
  const [groupFilterId, setGroupFilterId] = useState<string | null>(null);
  const [sortByDueDate, setSortByDueDate] = useState(false);
  const [sortDueDateDesc, setSortDueDateDesc] = useState(false);

  const [addingHabit, setAddingHabit] = useState(false);
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [newHabitDescription, setNewHabitDescription] = useState('');
  const [newHabitPriority, setNewHabitPriority] = useState<Priority>('medium');
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('to_do');
  const [newHabitStartDate, setNewHabitStartDate] = useState('');
  const [newHabitStartTime, setNewHabitStartTime] = useState('');
  const [newHabitDueDate, setNewHabitDueDate] = useState('');
  const [newHabitDueTime, setNewHabitDueTime] = useState('');
  const [newHabitDuration, setNewHabitDuration] = useState<number>(60);
  const [newHabitColumnId, setNewHabitColumnId] = useState<string>('');
  const [newDailyTarget, setNewDailyTarget] = useState(1);
  const [newTargetPeriod, setNewTargetPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [newHabitProjectId, setNewHabitProjectId] = useState<number | ''>('');
  const [newHabitSubtasks, setNewHabitSubtasks] = useState<NewHabitSubtaskDraft[]>([]);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newSubtaskDuration, setNewSubtaskDuration] = useState<number>(10);
  const [newChecklistItems, setNewChecklistItems] = useState<{id: string; text: string}[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newChecklistLists, setNewChecklistLists] = useState<{id: string; title: string; items: {id: string; text: string; completed: boolean}[]}[]>([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [perChecklistInput, setPerChecklistInput] = useState<Record<string, string>>({});
  const [collapsedDraftChecklists, setCollapsedDraftChecklists] = useState<Set<string>>(new Set());
  const [editingDraftChecklistId, setEditingDraftChecklistId] = useState<string | null>(null);
  const [editingDraftChecklistTitle, setEditingDraftChecklistTitle] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newHabitImages, setNewHabitImages] = useState<Attachment[]>([]);
  const [newHabitLabels, setNewHabitLabels] = useState<Label[]>([]);
  const [newTagPickerOpen, setNewTagPickerOpen] = useState(false);
  const [pendingDragMove, setPendingDragMove] = useState<{ taskId: string; srcDroppableId: string; dstDroppableId: string; srcIndex: number; dstIndex: number; dstProject: number | 'my-habits' | null; moveType: 'column' | 'project' } | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const [editingDraftSubtaskId, setEditingDraftSubtaskId] = useState<string | null>(null);
  const [editingDraftSubtaskText, setEditingDraftSubtaskText] = useState('');
  const [editingDraftSubtaskDuration, setEditingDraftSubtaskDuration] = useState<number>(0);
  const [editingDraftChecklistIndex, setEditingDraftChecklistIndex] = useState<number | null>(null);
  const [editingDraftChecklistText, setEditingDraftChecklistText] = useState('');

  // Creation modal section collapse states
  const [draftSubtasksCollapsed, setDraftSubtasksCollapsed] = useState(false);
  const [draftChecklistCollapsed, setDraftChecklistCollapsed] = useState(false);
  const [draftAttachmentsCollapsed, setDraftAttachmentsCollapsed] = useState(false);
  const [draftImagesCollapsed, setDraftImagesCollapsed] = useState(false);

  const [myHabitsCollapsed, setMyHabitsCollapsed] = useState(false);
  const [columnEditId, setColumnEditId] = useState<string | null>(null);
  const [columnEditName, setColumnEditName] = useState('');
  const [columnEditColor, setColumnEditColor] = useState('');
  const [columnEditIcon, setColumnEditIcon] = useState('');
  const COLUMN_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f43f5e'];
  const [collapsedProjects, setCollapsedProjects] = useState<number[]>(() => {
    try { const v = localStorage.getItem('habits-collapsed-projects'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [collapsedColumns, setCollapsedColumns] = useState<string[]>(() => {
    try { const v = localStorage.getItem('habits-collapsed-columns'); return v ? JSON.parse(v) : []; } catch { return []; }
  });

  useEffect(() => { localStorage.setItem('habits-collapsed-projects', JSON.stringify(collapsedProjects)); }, [collapsedProjects]);
  useEffect(() => { localStorage.setItem('habits-collapsed-columns', JSON.stringify(collapsedColumns)); }, [collapsedColumns]);
  useEffect(() => { localStorage.setItem('habits-expanded-ids', JSON.stringify(expandedTaskIds)); }, [expandedTaskIds]);
  useEffect(() => { if (!pendingDragMove) setDontAsk(false); }, [pendingDragMove]);

  const [completedOpen, setCompletedOpen] = useState(true);
  const [groupDropdownOpen, setGroupDropdownOpen] = useState(false);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedDeleteTaskIds, setSelectedDeleteTaskIds] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleDeleteTaskId, setSingleDeleteTaskId] = useState<string | null>(null);
  const [dateEditTaskId, setDateEditTaskId] = useState<string | null>(null);
  const [dateEditField, setDateEditField] = useState<'start' | 'due' | null>(null);
  const [tagPopupTaskId, setTagPopupTaskId] = useState<string | null>(null);
  const [tagDeleteConfirm, setTagDeleteConfirm] = useState<string | null>(null);

  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<AnalysisTab>('overview');
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [mainTmplPopupOpen, setMainTmplPopupOpen] = useState(false);
  const [mainTemplates, setMainTemplates] = useState<TaskTemplate[]>([]);

  const [aiBuilderOpen, setAiBuilderOpen] = useState(false);
  const [aiBuilderInput, setAiBuilderInput] = useState('');
  const [aiBuilderLoading, setAiBuilderLoading] = useState(false);
  const [aiBuilderError, setAiBuilderError] = useState('');

  const [orderedActiveIds, setOrderedActiveIds] = useState<string[]>([]);

  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [loadTemplateOpen, setLoadTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateError, setTemplateError] = useState('');
  const [editingTemplateMeta, setEditingTemplateMeta] = useState<{ id: number; name: string; template: TaskTemplate } | null>(null);
  const [templateEditOverrides, setTemplateEditOverrides] = useState<Partial<Habit> | null>(null);
  const [templateEditName, setTemplateEditName] = useState('');

  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await fetch('/api/projects', { credentials: 'include' });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        setProjects(Array.isArray(data.projects) ? data.projects : []);
      } catch {
        setProjects([]);
      }
    };
    loadProjects();
  }, []);

  useEffect(() => {
    const loadSharedTags = async () => {
      try {
        setSharedTags(await fetchTags());
      } catch {
        setSharedTags([]);
      }
    };
    loadSharedTags();
  }, []);

  const allTags = useMemo<Label[]>(() => {
    const byName = new Map<string, Label>();
    DEFAULT_LABELS.forEach(label => byName.set(normalizeTagName(label.name).toLowerCase(), label));
    board.tasks.forEach(habit => habit.labels.forEach(label => {
      const key = normalizeTagName(label.name).toLowerCase();
      if (!byName.has(key)) byName.set(key, label);
    }));
    sharedTags.forEach(tag => {
      const label = sharedTagToLabel(tag);
      const key = normalizeTagName(label.name).toLowerCase();
      byName.set(key, label);
    });
    return Array.from(byName.values());
  }, [board.tasks, sharedTags]);

  const filteredHabitsByBase = useMemo(() => {
    return board.tasks.filter(habit => {
      const matchesSearch = habit.title.toLowerCase().includes(search.toLowerCase().trim());
      const matchesPriority = priorityFilter === 'all' ? true : habit.priority === priorityFilter;
      const matchesProject = projectFilterId === 'all' ? true : habit.projectId === projectFilterId;
      const matchesTags = tagFilterIds.length === 0
        ? true
        : tagFilterIds.every(tagId => habit.labels.some(label => label.id === tagId));
      return matchesSearch && matchesPriority && matchesProject && matchesTags;
    });
  }, [board.tasks, priorityFilter, projectFilterId, search, tagFilterIds]);

  const filtered = useMemo(() => {
    const byGroup = filteredHabitsByBase.filter(habit =>
      !groupFilterId ? true : habit.columnId === groupFilterId
    );

    const active = byGroup.filter(habit => !isHabitCompleted(habit));
    const completed = byGroup.filter(habit => isHabitCompleted(habit));

    const sortByDue = (a: Habit, b: Habit) => {
      const aDate = a.dueDate ? new Date(`${a.dueDate}T${a.dueTime || '23:59'}`) : null;
      const bDate = b.dueDate ? new Date(`${b.dueDate}T${b.dueTime || '23:59'}`) : null;
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      const diff = aDate.getTime() - bDate.getTime();
      return sortDueDateDesc ? -diff : diff;
    };

    const sortByPriorityOrder = (a: Habit, b: Habit) => {
      const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      const diff = (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
      if (diff !== 0) return diff;
      return (a.order || 0) - (b.order || 0);
    };

    let activeSorted: Habit[];
    if (sortByDueDate) {
      activeSorted = [...active].sort(sortByDue);
    } else if (orderedActiveIds.length > 0) {
      const idSet = new Set(active.map(t => t.id));
      const ordered = orderedActiveIds.filter(id => idSet.has(id));
      const unordered = active.filter(t => !orderedActiveIds.includes(t.id));
      const orderedHabits = ordered.map(id => active.find(t => t.id === id)!).filter(Boolean);
      activeSorted = [...orderedHabits, ...unordered];
    } else {
      activeSorted = [...active].sort(sortByPriorityOrder);
    }

    const completedSorted = [...completed].sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    });

    return { active: activeSorted, completed: completedSorted };
  }, [filteredHabitsByBase, groupFilterId, sortByDueDate, sortDueDateDesc, orderedActiveIds]);

  const myHabitsGroup = useMemo(() =>
    filtered.active.filter(t => !t.projectId),
    [filtered.active]
  );

  const projectHabitGroups = useMemo(() => {
    return projects.map(project => {
      const habits = filtered.active.filter(t => t.projectId === project.id);
      if (habits.length === 0) return null;
      const columns = board.columns
        .filter(col => (col as any).projectId === project.id)
        .sort((a, b) => a.order - b.order);
      const columnGroups = columns.map(col => ({
        column: col,
        habits: habits.filter(t => t.columnId === col.id).sort((a, b) => (a.order || 0) - (b.order || 0)),
      })).filter(cg => cg.habits.length > 0);
      const columnIds = new Set(columns.map(c => c.id));
      const uncategorized = habits.filter(t => !columnIds.has(t.columnId));
      return { project, habits, columnGroups, uncategorized };
    }).filter(Boolean) as Array<{ project: ProjectMeta; habits: Habit[]; columnGroups: Array<{ column: any; habits: Habit[] }>; uncategorized: Habit[] }>;
  }, [filtered.active, projects, board.columns]);

  const matchingCount = filtered.active.length + filtered.completed.length;
  const openHabit = openTaskId ? board.tasks.find(habit => habit.id === openTaskId) ?? null : null;

  const templateEditHabit = useMemo(() => {
    if (!editingTemplateMeta) return null;
    const tmpl = editingTemplateMeta.template;
    const base = {
      id: `template-edit-${tmpl.id}`,
      title: tmpl.title || '',
      description: tmpl.description || '',
      priority: tmpl.priority || ('medium' as Priority),
      duration: tmpl.duration || 0,
      startDate: tmpl.startDate || '',
      startTime: tmpl.startTime || '',
      dueDate: tmpl.dueDate || '',
      dueTime: tmpl.dueTime || '',
      projectId: tmpl.projectId ?? null,
      columnId: tmpl.columnId || '',
      labels: tmpl.labels || [],
      subtasks: tmpl.subtasks || [],
      checklists: tmpl.checklists || [],
      images: tmpl.images || [],
      attachments: tmpl.attachments || [],
      comments: [],
      columnName: '',
      projectName: '',
      createdAt: new Date().toISOString(),
    };
    return (templateEditOverrides ? { ...base, ...templateEditOverrides } : base) as unknown as Habit;
  }, [editingTemplateMeta, templateEditOverrides]);

  const handleEditTemplate = useCallback((template: TaskTemplate) => {
    setTemplateEditOverrides(null);
    setTemplateEditName(template.name);
    setEditingTemplateMeta({ id: template.id, name: template.name, template });
  }, []);

  const wrappedUpdateHabit = useCallback((taskId: string, updates: Partial<Habit>) => {
    if (taskId.startsWith('template-edit-')) {
      setTemplateEditOverrides(prev => ({ ...prev, ...updates } as Partial<Habit>));
    } else {
      updateTask(taskId, updates);
    }
  }, [updateTask]);

  const handleSaveTemplate = useCallback(async () => {
    if (!editingTemplateMeta) return;
    const edited = templateEditOverrides || {};
    try {
      const saved = await updateTemplate(editingTemplateMeta.id, {
        name: templateEditName || editingTemplateMeta.name,
        title: (edited.title ?? editingTemplateMeta.template.title) || '',
        description: (edited.description ?? editingTemplateMeta.template.description) || '',
        priority: (edited.priority ?? editingTemplateMeta.template.priority) || 'medium',
        duration: Number(edited.duration ?? editingTemplateMeta.template.duration) || 0,
        startDate: (edited.startDate ?? editingTemplateMeta.template.startDate) || undefined,
        startTime: (edited.startTime ?? editingTemplateMeta.template.startTime) || undefined,
        dueDate: (edited.dueDate ?? editingTemplateMeta.template.dueDate) || undefined,
        dueTime: (edited.dueTime ?? editingTemplateMeta.template.dueTime) || undefined,
        projectId: (edited.projectId !== undefined ? edited.projectId : editingTemplateMeta.template.projectId) ?? null,
        columnId: (edited.columnId ?? editingTemplateMeta.template.columnId) || undefined,
        labels: (edited.labels ?? editingTemplateMeta.template.labels) || [],
        subtasks: ((edited.subtasks ?? editingTemplateMeta.template.subtasks) || []).map((st: any) => ({ text: st.text, durationMinutes: st.durationMinutes || 0 })),
        checklists: (edited.checklists ?? editingTemplateMeta.template.checklists) || [],
        images: (edited.images ?? editingTemplateMeta.template.images) || [],
        attachments: (edited.attachments ?? editingTemplateMeta.template.attachments) || [],
      });
      setTemplates(prev => prev.map(t => t.id === saved.id ? saved : t));
      setMainTemplates(prev => prev.map(t => (t as any).id === saved.id ? saved : t));
      setTemplateEditName('');
      setTemplateEditOverrides(null);
      setEditingTemplateMeta(null);
      setOpenTaskId(null);
    } catch (err) {
      console.error('Failed to save template:', err);
    }
  }, [editingTemplateMeta, templateEditOverrides, templateEditName]);

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

  const getProjectIdForDroppable = (id: string): number | 'my-habits' | null => {
    if (id === 'my-habits') return 'my-habits';
    if (id.startsWith('col-')) {
      const col = board.columns.find(c => c.id === id.slice(4));
      return col?.projectId ?? null;
    }
    if (id.startsWith('uncat-')) return Number(id.slice(6));
    return null;
  };

  const getHabitsForDroppable = (id: string): Habit[] | null => {
    if (id === 'my-habits') return myHabitsGroup;
    if (id.startsWith('col-')) {
      const colGroup = projectHabitGroups.flatMap(pg => pg.columnGroups).find(cg => cg.column.id === id.slice(4));
      return colGroup?.habits ?? null;
    }
    if (id.startsWith('uncat-')) {
      const pg = projectHabitGroups.find(p => p.project.id === Number(id.slice(6)));
      return pg?.uncategorized ?? null;
    }
    return null;
  };

  const applyDragMoveDirect = (srcDroppableId: string, dstDroppableId: string, srcIndex: number, dstIndex: number, dstProject: number | 'my-habits' | null) => {
    const srcHabits = getHabitsForDroppable(srcDroppableId);
    const dstHabits = getHabitsForDroppable(dstDroppableId);
    if (!srcHabits || !dstHabits) return;
    if (srcHabits.length <= srcIndex || dstHabits.length < dstIndex) return;

    const movingTaskId = srcHabits[srcIndex]?.id;
    if (!movingTaskId) return;

    const newColumnId = dstDroppableId.startsWith('col-') ? dstDroppableId.slice(4) : undefined;
    const updateFields: Record<string, any> = {};
    if (newColumnId) updateFields.columnId = newColumnId;
    if (dstProject === 'my-habits') {
      updateFields.projectId = null;
    } else if (typeof dstProject === 'number') {
      updateFields.projectId = dstProject;
    }
    if (Object.keys(updateFields).length > 0) updateTask(movingTaskId, updateFields);

    const srcIds = srcHabits.map(t => t.id);
    const dstIds = dstHabits.map(t => t.id);
    const [removed] = srcIds.splice(srcIndex, 1);
    dstIds.splice(dstIndex, 0, removed);
    srcIds.forEach((id, idx) => updateTask(id, { order: idx }));
    dstIds.forEach((id, idx) => updateTask(id, { order: idx }));

    const base = orderedActiveIds.length > 0 ? [...orderedActiveIds] : filtered.active.map(t => t.id);
    const srcSet = new Set(srcHabits.map(t => t.id));
    const dstSet = new Set(dstHabits.map(t => t.id));
    const resultIds: string[] = [];
    let srcInserted = false;
    let dstInserted = false;
    for (const id of base) {
      if (srcSet.has(id) && !srcInserted) { resultIds.push(...srcIds); srcInserted = true; }
      else if (dstSet.has(id) && !dstInserted) { resultIds.push(...dstIds); dstInserted = true; }
      else if (!srcSet.has(id) && !dstSet.has(id)) { resultIds.push(id); }
    }
    if (!srcInserted) resultIds.push(...srcIds);
    if (!dstInserted) resultIds.push(...dstIds);
    setOrderedActiveIds(resultIds);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || sortByDueDate) return;

    const srcProject = getProjectIdForDroppable(result.source.droppableId);
    const dstProject = getProjectIdForDroppable(result.destination.droppableId);
    if (srcProject === null || dstProject === null) return;

    const srcId = result.source.droppableId;
    const dstId = result.destination.droppableId;
    const isCrossColumn = srcId !== dstId;
    const isCrossProject = srcProject !== dstProject;

    if (isCrossProject) {
      if (localStorage.getItem('habits-drag-confirm-project') === 'true') {
        applyDragMoveDirect(result.source.droppableId, result.destination.droppableId, result.source.index, result.destination.index, dstProject);
        return;
      }
      const srcHabits = getHabitsForDroppable(srcId);
      if (!srcHabits) return;
      const movingTaskId = srcHabits[result.source.index]?.id;
      if (!movingTaskId) return;
      setPendingDragMove({ taskId: movingTaskId, srcDroppableId: srcId, dstDroppableId: dstId, srcIndex: result.source.index, dstIndex: result.destination.index, dstProject, moveType: 'project' });
      return;
    }

    if (isCrossColumn) {
      if (localStorage.getItem('habits-drag-confirm-column') === 'true') {
        applyDragMoveDirect(result.source.droppableId, result.destination.droppableId, result.source.index, result.destination.index, dstProject);
        return;
      }
      const srcHabits = getHabitsForDroppable(srcId);
      const dstHabits = getHabitsForDroppable(dstId);
      if (!srcHabits || !dstHabits) return;

      const movingTaskId = srcHabits[result.source.index]?.id;
      if (!movingTaskId) return;
      setPendingDragMove({ taskId: movingTaskId, srcDroppableId: srcId, dstDroppableId: dstId, srcIndex: result.source.index, dstIndex: result.destination.index, dstProject, moveType: 'column' });
      return;

      const srcIds = srcHabits.map(t => t.id);
      const dstIds = dstHabits.map(t => t.id);
      const [removed] = srcIds.splice(result.source.index, 1);
      dstIds.splice(result.destination.index, 0, removed);

      srcIds.forEach((id, idx) => updateTask(id, { order: idx }));
      dstIds.forEach((id, idx) => updateTask(id, { order: idx }));

      const base = orderedActiveIds.length > 0 ? [...orderedActiveIds] : filtered.active.map(t => t.id);
      const srcSet = new Set(srcHabits.map(t => t.id));
      const dstSet = new Set(dstHabits.map(t => t.id));
      const resultIds: string[] = [];
      let srcInserted = false;
      let dstInserted = false;
      for (const id of base) {
        if (srcSet.has(id) && !srcInserted) {
          resultIds.push(...srcIds);
          srcInserted = true;
        } else if (dstSet.has(id) && !dstInserted) {
          resultIds.push(...dstIds);
          dstInserted = true;
        } else if (!srcSet.has(id) && !dstSet.has(id)) {
          resultIds.push(id);
        }
      }
      if (!srcInserted) resultIds.push(...srcIds);
      if (!dstInserted) resultIds.push(...dstIds);
      setOrderedActiveIds(resultIds);
    } else {
      const sectionHabits = getHabitsForDroppable(srcId);
      if (!sectionHabits) return;

      const sectionTaskIds = sectionHabits.map(t => t.id);
      const ids = [...sectionTaskIds];
      const [removed] = ids.splice(result.source.index, 1);
      ids.splice(result.destination.index, 0, removed);

      ids.forEach((id, idx) => updateTask(id, { order: idx }));

      const base = orderedActiveIds.length > 0 ? [...orderedActiveIds] : filtered.active.map(t => t.id);
      const sectionIdSet = new Set(sectionTaskIds);
      const resultIds: string[] = [];
      let inserted = false;
      for (const id of base) {
        if (sectionIdSet.has(id)) {
          if (!inserted) {
            resultIds.push(...ids);
            inserted = true;
          }
        } else {
          resultIds.push(id);
        }
      }
      setOrderedActiveIds(resultIds);
    }
  };

  const runHabitAnalysis = useCallback((type: AnalysisTab) => {
    setActiveAnalysisTab(type);
    setAnalysisLoading(true);
    const scope = [...filtered.active, ...filtered.completed];
    const activeScope = scope.filter(habit => !isHabitCompleted(habit));
    const now = new Date();
    let result: AnalysisResult;

    if (type === 'overview') {
      const completedCount = scope.filter(t => isHabitCompleted(t)).length;
      const reviewCount = scope.filter(t => getTaskStatus(t) === 'review').length;
      const withSubtasks = scope.filter(t => (t.subtasks || []).length > 0).length;
      const withChecklist = scope.filter(t => t.checklists.some(cl => cl.items.length > 0)).length;
      result = {
        title: 'Habit Overview',
        summary: `${scope.length} habits in current view`,
        lines: [
          { text: `${activeScope.length} active` },
          { text: `${completedCount} completed` },
          { text: `${reviewCount} in review` },
          { text: `${withSubtasks} with sub-habits` },
          { text: `${withChecklist} with checklist items` },
        ],
      };
    } else if (type === 'duration') {
      const mismatches = activeScope
        .map(habit => {
          const estimated = Math.max(0, Number(habit.duration) || 0);
          const subtaskTotal = (habit.subtasks || []).reduce((s, st) => s + Math.max(0, Number(st.durationMinutes) || 0), 0);
          return { habit, estimated, subtaskTotal };
        })
        .filter(item => item.estimated > 0 && item.estimated !== item.subtaskTotal)
        .slice(0, 8);
      result = {
        title: 'Duration Check',
        summary: mismatches.length === 0 ? 'All habits match estimated duration.' : `${mismatches.length} habits need review`,
        lines: mismatches.length === 0
          ? [{ text: 'No mismatches found.' }]
          : mismatches.map(item => ({
              text: `${item.habit.title}: ${item.estimated} min estimated vs ${item.subtaskTotal} min in sub-habits`,
              taskId: item.habit.id,
            })),
      };
    } else if (type === 'deadlines') {
      const deadlines = activeScope
        .filter(t => !!t.dueDate)
        .map(t => ({ habit: t, due: new Date(`${t.dueDate}T${t.dueTime || '23:59'}`) }))
        .filter(item => !Number.isNaN(item.due.getTime()))
        .sort((a, b) => a.due.getTime() - b.due.getTime())
        .slice(0, 8);
      result = {
        title: 'Deadline Risk',
        summary: deadlines.length === 0 ? 'No due dates in current view.' : 'Closest deadlines first',
        lines: deadlines.length === 0
          ? [{ text: 'Add due dates to get deadline analysis.' }]
          : deadlines.map(item => ({
              text: `${item.habit.title}: ${item.due.getTime() < now.getTime() ? 'Overdue' : formatDate(item.habit.dueDate)} (${getStatusLabel(getTaskStatus(item.habit))})`,
              taskId: item.habit.id,
            })),
      };
    } else {
      const candidates = activeScope
        .map(habit => {
          const pw = ({ urgent: 4, high: 3, medium: 2, low: 1, none: 0 } as Record<string, number>)[habit.priority] ?? 0;
          const dw = habit.dueDate ? Math.max(0, 100000000000 - new Date(`${habit.dueDate}T${habit.dueTime || '23:59'}`).getTime()) : 0;
          const ct = habit.checklists.reduce((s, l) => s + l.items.length, 0);
          const cd = habit.checklists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
          const penalty = ct > 0 ? cd / ct : 0;
          return { habit, score: pw * 100 + dw / 1e9 - penalty * 10 };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      result = {
        title: 'Focus Suggestions',
        summary: candidates.length === 0 ? 'No active habits to analyze.' : 'Suggested habits to tackle next',
        lines: candidates.length === 0
          ? [{ text: 'Create active habits to get suggestions.' }]
          : candidates.map(item => ({
              text: `${item.habit.title} — ${getStatusLabel(getTaskStatus(item.habit))}, ${item.habit.priority}`,
              taskId: item.habit.id,
            })),
      };
    }

    setTimeout(() => {
      setAnalysisResult(result);
      setAnalysisLoading(false);
    }, 200);
  }, [filtered]);

  const toggleHabitCompletion = (habit: Habit) => {
    if (isHabitCompleted(habit)) {
      updateTask(habit.id, { completed: false, completedAt: undefined, status: 'to_do' });
    } else {
      updateTask(habit.id, { completed: true, completedAt: new Date().toISOString(), status: 'completed' });
    }
  };

  const toggleExpand = (taskId: string) => {
    setExpandedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const addSubtaskDraft = () => {
    if (!newSubtaskText.trim()) return;
    setNewHabitSubtasks(prev => [
      ...prev,
      { id: crypto.randomUUID(), text: newSubtaskText.trim(), durationMinutes: Math.max(0, Number(newSubtaskDuration) || 0) },
    ]);
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
  };

  const addChecklistDraft = () => {
    if (!newChecklistText.trim()) return;
    setNewChecklistItems(prev => [...prev, { id: crypto.randomUUID(), text: newChecklistText.trim() }]);
    setNewChecklistText('');
  };

  const addDraftChecklist = () => {
    if (!newChecklistTitle.trim()) return;
    setNewChecklistLists(prev => [...prev, { id: crypto.randomUUID(), title: newChecklistTitle.trim(), items: [] }]);
    setNewChecklistTitle('');
  };

  const addDraftChecklistItem = (listId: string) => {
    const text = perChecklistInput[listId] ?? '';
    if (!text.trim()) return;
    setNewChecklistLists(prev => prev.map(l => l.id === listId ? { ...l, items: [...l.items, { id: crypto.randomUUID(), text: text.trim(), completed: false }] } : l));
    setPerChecklistInput(prev => ({ ...prev, [listId]: '' }));
  };

  const handleDraftReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    if (result.source.droppableId === 'draft-subtasks') {
      setNewHabitSubtasks(prev => {
        const items = Array.from(prev);
        const [removed] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, removed);
        return items;
      });
    } else if (result.source.droppableId === 'draft-checklist') {
      setNewChecklistItems(prev => {
        const items = Array.from(prev);
        const [removed] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, removed);
        return items;
      });
    } else if (result.source.droppableId === 'draft-checklist-lists') {
      setNewChecklistLists(prev => {
        const items = Array.from(prev);
        const [removed] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, removed);
        return items;
      });
    } else {
      const srcListId = result.source.droppableId.replace('draft-checklist-items-', '');
      const dstListId = result.destination.droppableId.replace('draft-checklist-items-', '');
      if (srcListId === dstListId) {
        setNewChecklistLists(prev => prev.map(l => {
          if (l.id !== srcListId) return l;
          const items = Array.from(l.items);
          const [removed] = items.splice(result.source.index, 1);
          items.splice(result.destination.index, 0, removed);
          return { ...l, items };
        }));
      } else {
        let movedItem: { id: string; text: string; completed: boolean } | null = null;
        setNewChecklistLists(prev => {
          const next = prev.map(l => {
            if (l.id === srcListId) {
              const items = Array.from(l.items);
              movedItem = items.splice(result.source.index, 1)[0];
              return { ...l, items };
            }
            return l;
          });
          if (!movedItem) return prev;
          return next.map(l => {
            if (l.id === dstListId) {
              const items = Array.from(l.items);
              items.splice(result.destination.index, 0, movedItem!);
              return { ...l, items };
            }
            return l;
          });
        });
      }
    }
  }, []);

  const resetHabitDraft = () => {
    setNewHabitTitle('');
    setNewHabitDescription('');
    setNewHabitPriority('medium');
    setNewTaskStatus('to_do');
    setNewHabitStartDate('');
    setNewHabitStartTime('');
    setNewHabitDueDate('');
    setNewHabitDueTime('');
    setNewHabitDuration(60);
    setNewHabitColumnId('');
    setNewHabitProjectId('');
    setNewHabitSubtasks([]);
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
    setNewDailyTarget(1);
    setNewTargetPeriod('daily');
    setNewChecklistItems([]);
    setNewChecklistText('');
    setNewChecklistLists([]);
    setNewChecklistTitle('');
    setPerChecklistInput({});
    setCollapsedDraftChecklists(new Set());
    setNewFiles([]);
    setNewHabitLabels([]);
    setNewHabitImages([]);
  };

  const createHabit = async () => {
    if (!newHabitTitle.trim()) return;
    const targetColumnId = newHabitColumnId || board.columns[0]?.id;
    if (!targetColumnId) return;

    const taskId = crypto.randomUUID();
    const checklistItems = newChecklistItems.map(item => ({
      id: crypto.randomUUID(),
      text: item.text,
      completed: false,
    }));

    const allChecklists = [
      ...(checklistItems.length ? [{ id: crypto.randomUUID(), title: 'Checklist', items: checklistItems }] : []),
      ...newChecklistLists.map(l => ({
        id: l.id,
        title: l.title,
        items: l.items.map(it => ({ id: it.id, text: it.text, completed: false })),
      })),
    ];

    const attachmentUrls = newFiles.length > 0
      ? await Promise.all(newFiles.map(f => fileToDataUrl(f)))
      : [];

    addTask(targetColumnId, newHabitTitle.trim(), {
      id: taskId,
      description: newHabitDescription,
      status: 'to_do',
      priority: newHabitPriority,
      duration: Math.max(0, Number(newHabitDuration) || 0),
      startDate: newHabitStartDate || undefined,
      startTime: newHabitStartTime || undefined,
      dueDate: newHabitDueDate || undefined,
      dueTime: newHabitDueTime || undefined,
      projectId: newHabitProjectId === '' ? null : Number(newHabitProjectId),
      projectName: newHabitProjectId === '' ? undefined : (projects.find(project => project.id === Number(newHabitProjectId))?.name || undefined),
      subtasks: newHabitSubtasks.map(st => ({
        id: st.id,
        text: st.text,
        completed: false,
        durationMinutes: st.durationMinutes,
      })),
      labels: newHabitLabels,
      dailyTarget: newDailyTarget,
      dailyLogs: '{}',
      targetPeriod: newTargetPeriod,
      checklists: allChecklists,
      attachments: newFiles.map((file, i) => ({
        id: crypto.randomUUID(),
        taskId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        fileUrl: attachmentUrls[i],
        createdAt: new Date().toISOString(),
      })),
      images: newHabitImages,
      completed: false,
      completedAt: undefined,
    });

    resetHabitDraft();
    setAddingHabit(false);
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

  const generateAIHabit = async () => {
    if (!aiBuilderInput.trim()) return;
    setAiBuilderLoading(true);
    setAiBuilderError('');
    try {
      const res = await fetch('/api/ai/habit-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          input: aiBuilderInput,
          columns: board.columns.map(c => ({ id: c.id, title: c.title })),
          tags: allTags.map(t => t.name),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate habit');
      }
      const data: AIGeneratedHabit = await res.json();

      setNewHabitTitle(data.title || '');
      setNewHabitDescription(data.description || '');
      setNewHabitPriority((data.priority as Priority) || 'medium');
      setNewTaskStatus((data.status as TaskStatus) || 'to_do');
      setNewHabitStartDate(data.startDate || '');
      setNewHabitStartTime(data.startTime || '');
      setNewHabitDueDate(data.dueDate || '');
      setNewHabitDueTime(data.dueTime || '');
      setNewHabitDuration(data.duration || 60);

      if (data.group) {
        const matchedCol = board.columns.find(c =>
          c.title.toLowerCase() === data.group!.toLowerCase()
        );
        if (matchedCol) setNewHabitColumnId(matchedCol.id);
      }

      setNewHabitSubtasks(
        (data.subtasks || []).map(st => ({
          id: crypto.randomUUID(),
          text: st.text,
          durationMinutes: st.durationMinutes || 0,
        }))
      );
      setNewChecklistItems((data.checklistItems || []).map(text => ({ id: crypto.randomUUID(), text })));

      if (data.tags && data.tags.length > 0) {
        const matched = data.tags.map(tagName =>
          allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase())
        ).filter(Boolean) as Label[];
        setNewHabitLabels(matched);
      }

      setAiBuilderOpen(false);
      setAiBuilderInput('');
      setAddingHabit(true);
    } catch (err: any) {
      setAiBuilderError(err.message || 'Something went wrong');
    } finally {
      setAiBuilderLoading(false);
    }
  };

  const newSubtaskTotal = newHabitSubtasks.reduce((s, st) => s + st.durationMinutes, 0);
  const newSubtaskRemaining = newHabitDuration - newSubtaskTotal;

  const openQuickEdit = (habit: Habit, field: 'duration' | 'project') => {
    setQuickEditTaskId(habit.id);
    setQuickEditField(field);
    setQuickEditStatus(getTaskStatus(habit));
    setQuickEditDuration(Math.max(0, Number(habit.duration) || 0));
    setQuickEditProjectId(habit.projectId || '');
  };

  const closeQuickEdit = () => {
    setQuickEditTaskId(null);
    setQuickEditField(null);
  };

  const applyQuickEdit = (habit: Habit) => {
    const updates: Partial<Habit> = {};
    if (quickEditField === 'duration') {
      updates.duration = Math.max(0, Number(quickEditDuration) || 0);
    }
    if (quickEditField === 'project') {
      updates.projectId = quickEditProjectId === '' ? null : Number(quickEditProjectId);
      updates.projectName = quickEditProjectId === ''
        ? undefined
        : (projects.find(project => project.id === Number(quickEditProjectId))?.name || undefined);
    }
    updateTask(habit.id, updates);
    closeQuickEdit();
  };

  const toggleHabitTag = (taskId: string, label: Label) => {
    const habit = board.tasks.find(item => item.id === taskId);
    if (!habit) return;
    
    const has = habit.labels.some(item => item.id === label.id);
    const nextLabels = has
      ? habit.labels.filter(item => item.id !== label.id)
      : [...habit.labels, label];
    updateTask(taskId, { labels: nextLabels });
  };

  const createSharedHabitLabel = async (name: string, color: LabelColor): Promise<Label> => {
    const tag = await createTag({ name, color });
    return sharedTagToLabel(tag);
  };

  const createHabitTag = async (taskId: string) => {
    const habit = board.tasks.find(item => item.id === taskId);
    if (!habit) return;

    const name = normalizeTagName(newTagName);
    if (!name) return;

    try {
      const newLabel = await createSharedHabitLabel(name, newTagColor);
      updateTask(taskId, { labels: [...habit.labels, newLabel] });
      setNewTagName('');
      setNewTagColor(randomTagColor());
      setTagPickerOpen(false);
    } catch (error) {
      console.error('Failed to create habit tag:', error);
    }
  };

  const deleteTagEverywhere = async (tagId: string) => {
    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          await deleteTag(sharedTagId);
        } catch (error) {
          console.error('Failed to delete shared tag:', error);
          return;
        }
      }
    }

    board.tasks.forEach(habit => {
      if (habit.labels.some(label => label.id === tagId)) {
        updateTask(habit.id, { labels: habit.labels.filter(label => label.id !== tagId) });
      }
    });
    setTagFilterIds(prev => prev.filter(id => id !== tagId));
  };


  const toggleTagFilter = (tagId: string) => {
    setTagFilterIds(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
  };

  const toggleDailyUnit = useCallback((habitId: string, action: 'add' | 'remove') => {
    const habit = board.tasks.find(t => t.id === habitId);
    if (!habit) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const logs = habit.dailyLogs ? JSON.parse(habit.dailyLogs) : {};
    const current = logs[todayStr] || 0;
    const newValue = action === 'add' ? current + 1 : Math.max(0, current - 1);
    logs[todayStr] = newValue;
    const completedDays = habit.completedDays ? [...habit.completedDays] : [];
    const completedSet = new Set(completedDays);
    const target = habit.dailyTarget || 1;
    if (newValue >= target) {
      completedSet.add(todayStr);
    } else {
      completedSet.delete(todayStr);
    }
    updateTask(habitId, {
      dailyLogs: JSON.stringify(logs),
      completedDays: Array.from(completedSet),
    });
  }, [board.tasks, updateTask]);

  const renderHabitRow = (habit: Habit, dragHandleProps?: any, isDragging?: boolean) => {
    const isExpanded = expandedTaskIds.includes(habit.id);
    const subtaskCount = habit.subtasks?.length || 0;
    const checklistTotal = habit.checklists.reduce((s, l) => s + l.items.length, 0);
    const checklistDone = habit.checklists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
    const habitDurFmt = formatDuration(habit.duration || 0);
    const habitTags = habit.labels.slice(0, 3);
    return (
      <div
        key={habit.id}
        onClick={() => {
          if (isDeleteMode) {
            setSelectedDeleteTaskIds(prev =>
              prev.includes(habit.id) ? prev.filter(id => id !== habit.id) : [...prev, habit.id]
            );
          } else {
            setOpenTaskId(habit.id);
          }
        }}
        className={`group border rounded-xl bg-card transition-all duration-200 cursor-pointer ${
          isDeleteMode
            ? selectedDeleteTaskIds.includes(habit.id)
              ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
              : 'border-border hover:bg-muted/20'
            : isDragging
              ? 'border-primary/40 shadow-lg rotate-[2deg]'
              : 'border-border hover:border-border/80 hover:shadow-sm'
        }`}
      >
        <div className="flex items-center gap-1 px-3 py-3">
          {dragHandleProps && (
            <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
              <GripVertical className="w-4 h-4" />
            </div>
          )}
          {isDeleteMode ? (
            <input
              type="checkbox"
              checked={selectedDeleteTaskIds.includes(habit.id)}
              onChange={() => {
                setSelectedDeleteTaskIds(prev =>
                  prev.includes(habit.id) ? prev.filter(id => id !== habit.id) : [...prev, habit.id]
                );
              }}
              onClick={e => e.stopPropagation()}
              className="w-4 h-4 rounded border-border accent-destructive flex-shrink-0 cursor-pointer"
            />
          ) : (
            <div onClick={e => { e.stopPropagation(); toggleHabitCompletion(habit); }}>
              <CircleToggle
                completed={isHabitCompleted(habit)}
                onClick={e => { e.stopPropagation(); toggleHabitCompletion(habit); }}
                size="md"
                title="Mark complete"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-left text-foreground truncate">{habit.title}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {(habit.priority !== 'none' || priorityEditTaskId === habit.id) && (
                <PriorityBadge
                  habit={habit}
                  onUpdate={(priority) => updateTask(habit.id, { priority })}
                  isOpen={priorityEditTaskId === habit.id}
                  onToggle={() => setPriorityEditTaskId(priorityEditTaskId === habit.id ? null : habit.id)}
                />
              )}
              {habitDurFmt && (
                <button
                  onClick={e => { e.stopPropagation(); openQuickEdit(habit, 'duration'); }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0"
                >
                  {habitDurFmt}
                </button>
              )}
              <button
                onClick={e => {
                  e.stopPropagation();
                  setDateEditTaskId(dateEditTaskId === habit.id && dateEditField === 'start' ? null : habit.id);
                  setDateEditField(prev => prev === 'start' ? null : 'start');
                }}
                className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 bg-muted text-muted-foreground"
              >
                <Calendar className="w-2.5 h-2.5" />
                {habit.startDate ? `${formatDate(habit.startDate)}${habit.startTime ? ` ${habit.startTime}` : ''}` : 'Add start date'}
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  setDateEditTaskId(dateEditTaskId === habit.id && dateEditField === 'due' ? null : habit.id);
                  setDateEditField(prev => prev === 'due' ? null : 'due');
                }}
                className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 ${
                  habit.dueDate
                    ? (() => {
                        const warning = getDueTimeWarning(habit);
                        return warning === 'overdue'
                          ? 'bg-destructive/10 text-destructive'
                          : warning === 'imminent' || warning === 'soon'
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-muted text-muted-foreground';
                      })()
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Calendar className="w-2.5 h-2.5" />
                {habit.dueDate ? `${formatDate(habit.dueDate)}${habit.dueTime ? ` ${habit.dueTime}` : ''}` : 'Add due date'}
              </button>
              {checklistTotal > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                  {checklistDone}/{checklistTotal} checklist
                </span>
              )}
              {(() => {
                const todayStr = new Date().toISOString().split('T')[0];
                const logs = habit.dailyLogs ? JSON.parse(habit.dailyLogs) : {};
                const todayDone = logs[todayStr] || 0;
                const target = habit.dailyTarget || 1;
                return (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                    {todayDone}/{target} today
                  </span>
                );
              })()}
              <button
                onClick={e => { e.stopPropagation(); setTagPopupTaskId(tagPopupTaskId === habit.id ? null : habit.id); }}
                className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 bg-muted text-muted-foreground flex items-center gap-1"
              >
                <Tag className="w-2.5 h-2.5" />
                Tags
              </button>
              {habitTags.map(label => (
                <button
                  key={label.id}
                  onClick={e => { e.stopPropagation(); setTagPopupTaskId(tagPopupTaskId === habit.id ? null : habit.id); }}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${LABEL_COLORS[label.color]} text-primary-foreground`}
                >
                  {label.name}
                </button>
              ))}
              {habit.labels.length > habitTags.length && (
                <button
                  onClick={e => { e.stopPropagation(); setTagPopupTaskId(tagPopupTaskId === habit.id ? null : habit.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0"
                >
                  +{habit.labels.length - habitTags.length}
                </button>
              )}
            </div>
          </div>
          {!isDeleteMode && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={e => { e.stopPropagation(); toggleExpand(habit.id); }}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

            </div>
          )}
        </div>
        {quickEditTaskId === habit.id && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 bg-muted/20 rounded-b-xl">
            <div className="flex flex-wrap items-center gap-2">
              {quickEditField === 'duration' && (
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={quickEditDuration} onChange={e => setQuickEditDuration(Math.max(0, Number(e.target.value) || 0))} onBlur={() => applyQuickEdit(habit)} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <span className="text-xs text-muted-foreground">minutes</span>
                </div>
              )}
              {quickEditField === 'project' && (
                <Select value={quickEditProjectId === '' ? 'my-habits' : String(quickEditProjectId)} onValueChange={val => setQuickEditProjectId(val === 'my-habits' ? '' : Number(val))}>
                  <SelectTrigger className="w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm h-9">
                    <SelectValue placeholder="My Habits" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="my-habits">My Habits</SelectItem>
                    {projects.map(project => (<SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              )}
              <button onClick={() => applyQuickEdit(habit)} className="ml-auto rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Save</button>
              <button onClick={closeQuickEdit} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">Cancel</button>
            </div>
          </div>
        )}
        {dateEditTaskId === habit.id && dateEditField && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 bg-muted/20 rounded-b-xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  value={dateEditField === 'start' ? (habit.startDate || '') : (habit.dueDate || '')}
                  onChange={e => {
                    const val = e.target.value || undefined;
                    updateTask(habit.id, dateEditField === 'start' ? { startDate: val } : { dueDate: val });
                  }}
                  className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-sm [color-scheme:var(--color-scheme)]"
                />
              </div>
              <div className="relative w-[140px]">
                <Clock3 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="time"
                  value={dateEditField === 'start' ? (habit.startTime || '') : (habit.dueTime || '')}
                  onChange={e => {
                    const val = e.target.value || undefined;
                    updateTask(habit.id, dateEditField === 'start' ? { startTime: val } : { dueTime: val });
                  }}
                  className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-sm [color-scheme:var(--color-scheme)]"
                />
              </div>
              {((dateEditField === 'start' && habit.startDate) || (dateEditField === 'due' && habit.dueDate)) && (
                <button
                  onClick={() => {
                    updateTask(habit.id, dateEditField === 'start' ? { startDate: undefined, startTime: undefined } : { dueDate: undefined, dueTime: undefined });
                    setDateEditTaskId(null);
                    setDateEditField(null);
                  }}
                  className="text-xs text-destructive hover:bg-destructive/10 px-3 py-2 rounded-lg"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
        {isExpanded && !isDeleteMode && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 space-y-4 bg-muted/10 rounded-b-xl">
            <HabitDropdownExpanded
              habit={habit}
              onUpdateHabit={updateTask}
              onToggleChecklistItem={toggleChecklistItem}
              onAddChecklistItem={addChecklistItem}
              onDeleteChecklistItem={deleteChecklistItem}
              isPremium={isPremium}
              isPro={isPro}
              onToggleDailyUnit={toggleDailyUnit}
            />
            <div className="flex justify-end pt-1">
              <button
                onClick={e => { e.stopPropagation(); setSingleDeleteTaskId(habit.id); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Habit
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-card/30">
        <div>
          <h1 className="text-lg font-bold text-foreground">All Habits</h1>
          <p className="text-xs text-muted-foreground">{matchingCount} habits matching filters</p>
        </div>
        <div className="flex items-center gap-2">

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

          <div className="relative">
            <button
              onClick={async () => {
                try {
                  const t = await fetchTemplates();
                  setMainTemplates(t);
                  setMainTmplPopupOpen(true);
                } catch (err) {
                  console.error('Failed to fetch templates:', err);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border transition-all bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Star className="w-4 h-4" />
              Templates
            </button>
            {mainTmplPopupOpen && (
              <div className="absolute right-0 mt-1.5 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Templates</h3>
                  </div>
                  <button onClick={() => setMainTmplPopupOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                {mainTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center mb-2">
                      <Star className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-foreground">No templates yet</p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-border">
                    {mainTemplates.map(tmpl => (
                      <div key={tmpl.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-all group">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-lg bg-primary/5 flex items-center justify-center flex-shrink-0">
                            <Star className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium text-foreground block truncate">{tmpl.name}</span>
                            {tmpl.title && <span className="text-[11px] text-muted-foreground truncate block">{tmpl.title}</span>}
                          </div>
                        </div>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all ml-2">
                          <button
                            onClick={() => {
                              setMainTmplPopupOpen(false);
                              handleEditTemplate(tmpl);
                            }}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
                            title="Edit template"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Delete template "${tmpl.name}"?`)) return;
                              try {
                                await deleteTemplateApi(tmpl.id);
                                setMainTemplates(await fetchTemplates());
                              } catch (err) {
                                console.error('Failed to delete template:', err);
                              }
                            }}
                            className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-all"
                            title="Delete template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setAddingHabit(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Habit
          </button>
        </div>
      </header>

      <div className="px-6 py-4 border-b border-border bg-card/10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search habits..."
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

          <div className="flex flex-wrap gap-2 min-w-0">
            {tagFilterIds.length > 0 && (
              <button
                onClick={() => setTagFilterIds([])}
                className="px-3 py-1.5 text-xs rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                Clear tags
              </button>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setTagPickerOpen(prev => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <Tag className="w-3.5 h-3.5" />
              Tags
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {tagPickerOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setTagPickerOpen(false)} />
                <div className="absolute left-0 mt-1.5 w-96 max-w-[95vw] bg-card border border-border rounded-2xl shadow-xl z-30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Tag filter</p>
                      <p className="text-xs text-muted-foreground">Filter habits by tag.</p>
                    </div>
                    <button onClick={() => setTagPickerOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {allTags.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">No tags yet.</p>
                    )}
                    {allTags.map(tag => {
                      const isActive = tagFilterIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          onClick={() => toggleTagFilter(tag.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left ${
                            isActive
                              ? 'border-primary/30 bg-primary/5 shadow-sm'
                              : 'border-border/60 hover:bg-muted/40'
                          }`}
                        >
                          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${LABEL_COLORS[tag.color]}`} />
                          <span className="text-sm text-foreground flex-1">{tag.name}</span>
                          {isActive && <span className="text-[10px] text-primary font-bold">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setProjectDropdownOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border transition-all ${
                projectFilterId !== 'all'
                  ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
                  : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>
                {projectFilterId === 'all'
                  ? 'Project Filter'
                  : `Project: ${projects.find(project => project.id === projectFilterId)?.name || 'Selected'}`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            </button>
            {projectDropdownOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setProjectDropdownOpen(false)} />
              <div className="absolute left-0 mt-1.5 w-64 bg-card border border-border rounded-xl shadow-lg z-30 p-2">
                <button
                  onClick={() => { setProjectFilterId('all'); setProjectDropdownOpen(false); }}
                  className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted"
                >
                  All projects
                </button>
                <div className="space-y-1 max-h-52 overflow-y-auto">
                  {projects.map(project => (
                    <button
                      key={project.id}
                      onClick={() => { setProjectFilterId(project.id); setProjectDropdownOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted flex items-center gap-2 ${
                        projectFilterId === project.id ? 'bg-primary/10 text-primary' : ''
                      }`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                      <span className="flex-1 truncate">{project.name}</span>
                    </button>
                  ))}
                </div>
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
              onClick={() => { setAnalysisPanelOpen(true); runHabitAnalysis(activeAnalysisTab); }}
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 transition-all"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Habit Analysis
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 relative">
        <DragDropContext onDragEnd={handleDragEnd}>
        <div className="max-w-5xl mx-auto space-y-2 pb-24">
          {myHabitsGroup.length === 0 && projectHabitGroups.length === 0 && filtered.completed.length === 0 && (
            <div className="text-center py-16">
              <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No habits found</p>
            </div>
          )}

          {/* MY HABITS section */}
          {myHabitsGroup.length > 0 && (
            <div className="mb-3">
              <button
                onClick={() => setMyHabitsCollapsed(prev => !prev)}
                className="flex items-center gap-2 w-full px-2 py-2 text-left hover:bg-muted/30 rounded-lg transition-all mb-1"
              >
                {myHabitsCollapsed
                  ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
                <span className="text-xs font-bold tracking-wider text-muted-foreground">My Habits</span>
                <span className="text-[10px] text-muted-foreground/50 ml-1">({myHabitsGroup.length})</span>
              </button>
              {!myHabitsCollapsed && (
                <Droppable droppableId="my-habits">
                  {(dropProvided, snapshot) => (
                    <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="space-y-1.5">
                      {myHabitsGroup.map((habit, index) => (
                        <Draggable key={habit.id} draggableId={habit.id} index={index}>
                          {(habitProvided, habitSnapshot) => (
                            <div ref={habitProvided.innerRef} {...habitProvided.draggableProps}>
                              {renderHabitRow(habit, habitProvided.dragHandleProps, habitSnapshot.isDragging)}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {dropProvided.placeholder}
                    </div>
                  )}
                </Droppable>
              )}
            </div>
          )}

          {myHabitsGroup.length > 0 && projectHabitGroups.length > 0 && <div className="w-full h-0.5 bg-border/40 my-4" />}

          {/* Project sections */}
          {projectHabitGroups.map(({ project, habits, columnGroups, uncategorized }, idx) => {
            const isProjectCollapsed = collapsedProjects.includes(project.id);
            return (
              <div key={project.id} className="mb-3">
                {idx > 0 && <div className="w-full h-0.5 bg-border/40 my-4" />}
                <button
                  onClick={() => setCollapsedProjects(prev =>
                    prev.includes(project.id) ? prev.filter(id => id !== project.id) : [...prev, project.id]
                  )}
                  className="flex items-center gap-2 w-full px-2 py-2 text-left hover:bg-muted/30 rounded-lg transition-all mb-1"
                >
                  {isProjectCollapsed
                    ? <ChevronDown className="w-3.5 h-3.5" style={{ color: project.color }} />
                    : <ChevronUp className="w-3.5 h-3.5" style={{ color: project.color }} />}
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                  <span className="text-xs font-bold tracking-wider text-foreground">{project.name}</span>
                  <span className="text-[10px] text-muted-foreground/50 ml-1">({habits.length})</span>
                </button>
                {!isProjectCollapsed && (
                  <div className="pl-4 space-y-2">
                    {columnGroups.map(({ column, habits: colHabits }, colIdx) => {
                      const isColumnCollapsed = collapsedColumns.includes(column.id);
                      return (
                        <div key={column.id}>
                          <div className="flex items-center gap-1 w-full px-1 py-1.5 mb-1 group">
                            <button
                              onClick={() => setCollapsedColumns(prev =>
                                prev.includes(column.id) ? prev.filter(id => id !== column.id) : [...prev, column.id]
                              )}
                              className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-muted/30 transition-all"
                            >
                              {isColumnCollapsed
                                ? <ChevronDown className="w-3 h-3 text-muted-foreground/60" />
                                : <ChevronUp className="w-3 h-3 text-muted-foreground/60" />}
                              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: column.color }} />
                              {column.icon && <span className="text-xs">{column.icon}</span>}
                            </button>
                            <button
                              onClick={() => { setColumnEditId(column.id); setColumnEditName(column.title); setColumnEditColor(column.color); setColumnEditIcon(column.icon || ''); }}
                              className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-muted/30 transition-all text-left"
                            >
                              <span className="text-[11px] font-semibold tracking-widest text-muted-foreground/80">{column.title}</span>
                              <span className="text-[10px] text-muted-foreground/40">({colHabits.length})</span>
                            </button>
                          </div>
                          {!isColumnCollapsed && (
                            <Droppable droppableId={"col-" + column.id}>
                              {(dropProvided, snapshot) => (
                                <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="pl-3 space-y-1.5">
                                  {colHabits.map((habit, index) => (
                                    <Draggable key={habit.id} draggableId={habit.id} index={index}>
                                      {(habitProvided, habitSnapshot) => (
                                        <div ref={habitProvided.innerRef} {...habitProvided.draggableProps}>
                                          {renderHabitRow(habit, habitProvided.dragHandleProps, habitSnapshot.isDragging)}
                                        </div>
                                      )}
                                    </Draggable>
                                  ))}
                                  {dropProvided.placeholder}
                                </div>
                              )}
                            </Droppable>
                          )}
                        </div>
                      );
                    })}
                    {uncategorized.length > 0 && (
                      <Droppable droppableId={"uncat-" + project.id}>
                        {(dropProvided, snapshot) => (
                          <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="pl-3 space-y-1.5">
                            {uncategorized.map((habit, index) => (
                              <Draggable key={habit.id} draggableId={habit.id} index={index}>
                                {(habitProvided, habitSnapshot) => (
                                  <div ref={habitProvided.innerRef} {...habitProvided.draggableProps}>
                                    {renderHabitRow(habit, habitProvided.dragHandleProps, habitSnapshot.isDragging)}
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {dropProvided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    )}
                  </div>
                )}
              </div>
            );
          })}


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
                    {filtered.completed.map(habit => (
                      <div
                        key={habit.id}
                        onClick={() => {
                          if (isDeleteMode) {
                            setSelectedDeleteTaskIds(prev =>
                              prev.includes(habit.id) ? prev.filter(id => id !== habit.id) : [...prev, habit.id]
                            );
                          } else {
                            setOpenTaskId(habit.id);
                          }
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all group ${
                          isDeleteMode
                            ? selectedDeleteTaskIds.includes(habit.id)
                              ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
                              : 'border-border bg-background/50 hover:bg-muted/20'
                            : 'border-label-green/15 bg-background/70 hover:bg-muted/40'
                        }`}
                      >
                        {isDeleteMode ? (
                          <input
                            type="checkbox"
                            checked={selectedDeleteTaskIds.includes(habit.id)}
                            onChange={() => {
                              setSelectedDeleteTaskIds(prev =>
                                prev.includes(habit.id) ? prev.filter(id => id !== habit.id) : [...prev, habit.id]
                              );
                            }}
                            onClick={e => e.stopPropagation()}
                            className="w-4 h-4 rounded border-border accent-destructive flex-shrink-0 cursor-pointer"
                          />
                        ) : (
                          <CircleToggle
                            completed
                            onClick={e => { e.stopPropagation(); toggleHabitCompletion(habit); }}
                            size="md"
                            title="Mark active"
                          />
                        )}
                        <span className={`text-sm text-left flex-1 ${isDeleteMode ? 'text-foreground font-medium' : 'text-muted-foreground/80 line-through'}`}>
                          {habit.title}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-label-green/15 text-label-green font-medium flex-shrink-0">
                          Auto-delete in {daysUntilAutoDelete(habit.completedAt)} day{daysUntilAutoDelete(habit.completedAt) === 1 ? '' : 's'}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); setSingleDeleteTaskId(habit.id); }}
                          className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                          title="Delete habit"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </DragDropContext>

        {/* Floating AI Habit button */}
        <button
          onClick={() => setAiBuilderOpen(true)}
          className="fixed bottom-8 right-8 z-40 w-14 h-14 rounded-full bg-foreground text-background shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200"
          title="AI Habit Builder"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      </div>

      {addingHabit && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={() => setAddingHabit(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Create Habit</h2>
              <button onClick={() => { setAddingHabit(false); resetHabitDraft(); }} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Habit title</label>
                <input
                  autoFocus
                  value={newHabitTitle}
                  onChange={e => setNewHabitTitle(e.target.value)}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Priority</label>
                  <Select value={newHabitPriority} onValueChange={v => setNewHabitPriority(v as Priority)}>
                    <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Estimated duration (minutes)</label>
                  <input
                    type="number"
                    min={0}
                    value={newHabitDuration}
                    onChange={e => setNewHabitDuration(Math.max(0, Number(e.target.value) || 0))}
                    className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Project</label>
                  <Select value={newHabitProjectId === '' ? 'my-habits' : String(newHabitProjectId)} onValueChange={v => { setNewHabitProjectId(v === 'my-habits' ? '' : Number(v)); setNewHabitColumnId(''); }}>
                    <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="my-habits">My Habits</SelectItem>
                      {projects.map(project => (
                        <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newHabitProjectId !== '' && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Column</label>
                    <Select value={newHabitColumnId} onValueChange={v => setNewHabitColumnId(v)}>
                      <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {board.columns
                          .filter(col => col.projectId === Number(newHabitProjectId))
                          .sort((a, b) => a.order - b.order)
                          .map(col => (
                            <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {newHabitColumnId === '' && (
                      <p className="text-[10px] text-destructive mt-1">Column is required when a project is selected</p>
                    )}
                  </div>
                )}
          </div>

          <div className="relative">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Tags</label>
            <div className="mt-1">
              {newHabitLabels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {newHabitLabels.map(label => (
                    <span key={label.id} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${LABEL_COLORS[label.color]} text-primary-foreground`}>
                      {label.name}
                      <button onClick={() => setNewHabitLabels(prev => prev.filter(l => l.id !== label.id))} className="hover:opacity-70">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={() => setNewTagPickerOpen(prev => !prev)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <Tag className="w-3.5 h-3.5" />
                {newHabitLabels.length > 0 ? `${newHabitLabels.length} tag${newHabitLabels.length > 1 ? 's' : ''} selected` : 'Add tags'}
              </button>
              {newTagPickerOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setNewTagPickerOpen(false)} />
                  <div className="absolute left-0 mt-2 w-96 max-w-[95vw] bg-card border border-border rounded-2xl shadow-xl z-30 p-4 space-y-3">
                    <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                      {allTags.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-3">No tags yet. Create one below.</p>
                      )}
                      {allTags.map(tag => {
                        const active = newHabitLabels.some(l => l.id === tag.id);
                        return (
                          <button
                            key={tag.id}
                            onClick={() => setNewHabitLabels(prev => active ? prev.filter(l => l.id !== tag.id) : [...prev, tag])}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left ${
                              active
                                ? 'border-primary/30 bg-primary/5 shadow-sm'
                                : 'border-border/60 hover:bg-muted/40'
                            }`}
                          >
                            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${LABEL_COLORS[tag.color]}`} />
                            <span className="text-sm text-foreground flex-1">{tag.name}</span>
                            {active && <span className="text-[10px] text-primary font-bold">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 border-t border-border pt-3">
                      <input
                        value={newTagName}
                        onChange={e => setNewTagName(e.target.value)}
                        placeholder="Create tag"
                        className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                      />
                      <button
                        onClick={() => setNewTagColor(randomTagColor())}
                        className={`w-10 h-10 rounded-xl border-2 border-border/50 flex-shrink-0 transition-transform hover:scale-110 ${LABEL_COLORS[newTagColor]}`}
                        title="Randomize color"
                      />
                      <button
                        onClick={async () => {
                          const name = normalizeTagName(newTagName);
                          if (!name) return;
                          try {
                            const newLabel = await createSharedHabitLabel(name, newTagColor);
                            setNewHabitLabels(prev => [...prev, newLabel]);
                            setNewTagName('');
                            setNewTagColor(randomTagColor());
                            setNewTagPickerOpen(false);
                          } catch (error) {
                            console.error('Failed to create habit tag:', error);
                          }
                        }}
                        disabled={!newTagName.trim()}
                        className="px-4 py-2 text-xs font-medium bg-foreground text-background rounded-xl disabled:opacity-40"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Start Date and Time Section */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Start Date</label>
              <input
                type="date"
                value={newHabitStartDate}
                onChange={e => setNewHabitStartDate(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Start Time</label>
              <input
                type="time"
                value={newHabitStartTime}
                onChange={e => setNewHabitStartTime(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          {/* Due Date and Time Section */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Due Date</label>
              <input
                type="date"
                value={newHabitDueDate}
                onChange={e => setNewHabitDueDate(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Due Time</label>
              <input
                type="time"
                value={newHabitDueTime}
                onChange={e => setNewHabitDueTime(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Description</label>
                <textarea
                  value={newHabitDescription}
                  onChange={e => setNewHabitDescription(e.target.value)}
                  rows={3}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
                />
              </div>

              {/* Target */}
              <div className="rounded-2xl border border-border bg-muted/20">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Target</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      value={newDailyTarget}
                      onChange={e => setNewDailyTarget(Math.max(1, Number(e.target.value) || 1))}
                      className="w-24 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                      placeholder="5"
                    />
                    <span className="text-xs text-muted-foreground">units</span>
                    <select
                      value={newTargetPeriod}
                      onChange={e => setNewTargetPeriod(e.target.value as any)}
                      className="bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="daily">per day</option>
                      <option value="weekly">per week</option>
                      <option value="monthly">per month</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Attachments Card */}
              <div className="rounded-2xl border border-border bg-muted/20">
                <button
                  onClick={() => setDraftAttachmentsCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
                    {newFiles.length > 0 && (
                      <span className="text-xs text-muted-foreground">({newFiles.length})</span>
                    )}
                  </div>
                  {draftAttachmentsCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                {!draftAttachmentsCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-3">
                    {!isPremium ? (
                      <div className="border border-dashed border-border rounded-xl">
                        <PremiumGate
                          title="File Attachments"
                          description="Attach files, images, and documents directly to your habits."
                          icon={<Paperclip className="w-6 h-6 text-primary" />}
                        />
                      </div>
                    ) : (
                      <>
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
                        {newFiles.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                )}
              </div>

              {/* Images Card */}
              <div className="rounded-2xl border border-border bg-muted/20">
                <button
                  onClick={() => setDraftImagesCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <Image className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Images</h3>
                    {newHabitImages.length > 0 && (
                      <span className="text-xs text-muted-foreground">({newHabitImages.length})</span>
                    )}
                  </div>
                  {draftImagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                {!draftImagesCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-3">
                    {!isPremium ? (
                      <div className="border border-dashed border-border rounded-xl">
                        <PremiumGate
                          title="Image Attachments"
                          description="Upload images directly to your habits."
                          icon={<Image className="w-6 h-6 text-primary" />}
                        />
                      </div>
                    ) : (
                      <>
                        <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                          <div className="flex flex-col items-center justify-center py-4">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                              <Image className="w-5 h-5 text-primary" />
                            </div>
                            <p className="text-sm font-medium text-foreground">Click to upload</p>
                            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF (max 10MB)</p>
                          </div>
                          <input type="file" multiple accept="image/*,.heic,.heif" onChange={async e => {
                            if (!e.target.files) return;
                            const files = Array.from(e.target.files);
                            const newImgs: Attachment[] = [];
                            for (const file of files) {
                              const fileUrl = await imageToDataUrl(file);
                              const fileType = /\.heic$/i.test(file.name) ? 'image/jpeg' : (file.type || 'image/*');
                              newImgs.push({ id: crypto.randomUUID(), taskId: 'new', fileName: file.name, fileType, fileSize: file.size, fileUrl, createdAt: new Date().toISOString() });
                            }
                            setNewHabitImages(prev => [...prev, ...newImgs]);
                            e.target.value = '';
                          }} className="hidden" />
                        </label>
                        {newHabitImages.length > 0 && (
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {newHabitImages.map(img => (
                              <div key={img.id} className="relative group/img aspect-square rounded-xl border border-border bg-muted/40 overflow-hidden">
                                {img.fileUrl.match(/^data:image/) ? (
                                  <img src={img.fileUrl} alt={img.fileName} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center"><Image className="w-8 h-8 text-muted-foreground" /></div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
                                  <p className="text-xs font-medium text-white truncate">{img.fileName}</p>
                                  {img.fileSize != null && <p className="text-[10px] text-white/70">{(img.fileSize / 1024).toFixed(1)} KB</p>}
                                </div>
                                <button
                                  onClick={() => setNewHabitImages(prev => prev.filter(x => x.id !== img.id))}
                                  className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/img:opacity-100 transition-all shadow-sm z-10"
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
                )}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border flex justify-between items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => setTemplateMenuOpen(!templateMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
                >
                  <Star className="w-3.5 h-3.5" />
                  Templates
                </button>
                {templateMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setTemplateMenuOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-48 bg-card border border-border rounded-xl shadow-xl z-30 p-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setTemplateMenuOpen(false); setSaveTemplateOpen(true); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted transition-all"
                      >
                        <div className="w-6 h-6 rounded-md bg-primary/5 flex items-center justify-center">
                          <Plus className="w-3.5 h-3.5 text-primary" />
                        </div>
                        Save as template
                      </button>
                      <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        setTemplateMenuOpen(false);
                        setTemplateError('');
                        try {
                          const t = await fetchTemplates();
                          setTemplates(t);
                          setLoadTemplateOpen(true);
                        } catch (err) {
                          setTemplateError('Failed to load templates. Check your connection and try again.');
                          setTimeout(() => setTemplateError(''), 4000);
                        }
                      }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted transition-all"
                      >
                        <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center">
                          <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        Load template
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setAddingHabit(false); resetHabitDraft(); }} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                <button
                  onClick={createHabit}
                  disabled={!newHabitTitle.trim() || (newHabitProjectId !== '' && newHabitColumnId === '')}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {saveTemplateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSaveTemplateOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Star className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Save as template</h2>
              </div>
              <button onClick={() => { setSaveTemplateOpen(false); setTemplateName(''); }} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              {templateError && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-destructive bg-destructive/10 rounded-lg">
                  <span>⚠</span>
                  <span>{templateError}</span>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Template name</label>
                <input
                  autoFocus
                  placeholder="e.g. Daily Standup Habit"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && templateName.trim() && document.getElementById('save-template-btn')?.click()}
                  className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={() => { setSaveTemplateOpen(false); setTemplateName(''); }} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Cancel</button>
              <button
                id="save-template-btn"
                onClick={async () => {
                  if (!templateName.trim()) return;
                  setTemplateError('');
                  try {
                    await createTemplate({
                      name: templateName.trim(),
                      title: newHabitTitle || '',
                      description: newHabitDescription || '',
                      priority: newHabitPriority || 'medium',
                      duration: newHabitDuration || 0,
                      startDate: newHabitStartDate || undefined,
                      startTime: newHabitStartTime || undefined,
                      dueDate: newHabitDueDate || undefined,
                      dueTime: newHabitDueTime || undefined,
                      projectId: newHabitProjectId ? Number(newHabitProjectId) : null,
                      columnId: newHabitColumnId || undefined,
                      labels: newHabitLabels || [],
                      subtasks: (newHabitSubtasks || []).map(st => ({ text: st.text, durationMinutes: st.durationMinutes })),
                      checklists: newChecklistItems.map(item => ({ id: crypto.randomUUID(), title: 'Checklist', items: [{ id: crypto.randomUUID(), text: item.text, checked: false }] })),
                    });
                    setSaveTemplateOpen(false);
                    setTemplateName('');
                  } catch (err) {
                    setTemplateError('Failed to save template. Check your connection and try again.');
                    setTimeout(() => setTemplateError(''), 4000);
                  }
                }}
                disabled={!templateName.trim()}
                className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {loadTemplateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setLoadTemplateOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FolderKanban className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Load template</h2>
              </div>
              <button onClick={() => setLoadTemplateOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            {templateError && (
              <div className="flex items-center gap-2 px-5 py-2 text-xs text-destructive bg-destructive/10">
                <span>⚠</span>
                <span>{templateError}</span>
              </div>
            )}
            <div className="max-h-80 overflow-y-auto p-2">
              {templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                    <FolderKanban className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No templates yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Save a habit as a template first.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {templates.map(tmpl => (
                    <div key={tmpl.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-muted/50 rounded-xl border border-transparent hover:border-border transition-all">
                      <button
                        onClick={() => {
                          setNewHabitTitle(tmpl.title || '');
                          setNewHabitDescription(tmpl.description || '');
                          setNewHabitPriority(tmpl.priority || 'medium');
                          setNewHabitDuration(tmpl.duration || 0);
                          setNewHabitStartDate(tmpl.startDate || '');
                          setNewHabitStartTime(tmpl.startTime || '');
                          setNewHabitDueDate(tmpl.dueDate || '');
                          setNewHabitDueTime(tmpl.dueTime || '');
                          setNewHabitProjectId(tmpl.projectId ? Number(tmpl.projectId) : '');
                          setNewHabitColumnId(tmpl.columnId || '');
                          setNewHabitLabels(tmpl.labels || []);
                          setNewHabitSubtasks((tmpl.subtasks || []).map(st => ({ id: crypto.randomUUID(), ...st })));
                          setNewChecklistItems((tmpl.checklists || []).flatMap(cl => (cl.items || []).map(item => ({ id: crypto.randomUUID(), text: item.text }))));
                          setLoadTemplateOpen(false);
                        }}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center flex-shrink-0">
                          <Star className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block truncate">{tmpl.name}</span>
                          {tmpl.title && <span className="text-xs text-muted-foreground truncate block">{tmpl.title}</span>}
                        </div>
                      </button>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                        <button
                          onClick={() => {
                            setLoadTemplateOpen(false);
                            handleEditTemplate(tmpl);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
                          title="Edit template"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Delete template "${tmpl.name}"?`)) return;
                            try {
                              await deleteTemplateApi(tmpl.id);
                              setTemplates(await fetchTemplates());
                            } catch (err) {
                              console.error('Failed to delete template:', err);
                            }
                          }}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-all"
                          title="Delete template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end px-5 py-4 border-t border-border">
              <button onClick={() => setLoadTemplateOpen(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Close</button>
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
                <h3 className="text-sm font-semibold text-foreground">Habit Analysis</h3>
              </div>
              <button onClick={() => setAnalysisPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </header>

            {!isPremium ? (
              <div className="flex-1 flex items-center">
                <PremiumGate
                  title="Habit Analysis"
                  description="Get AI-powered insights into your habits with overview, duration check, deadline risk, and focus suggestions."
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
                      onClick={() => runHabitAnalysis(tab.key)}
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
                      Analyzing habits...
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

      {(openHabit || templateEditHabit) && (
        <HabitFullView
          habit={templateEditHabit || openHabit!}
          onClose={() => { setOpenTaskId(null); setEditingTemplateMeta(null); setTemplateEditName(''); }}
          boardColumns={board.columns}
          projects={projects}
          allTags={allTags}
          onUpdateHabit={wrappedUpdateHabit}
          onToggleChecklistItem={(taskId, checklistId, itemId) => {
            if (taskId.startsWith('template-edit-')) {
              const overrides = templateEditOverrides || {};
              const checklists = overrides.checklists || editingTemplateMeta?.template.checklists || [];
              const next = checklists.map((list: any) =>
                list.id === checklistId
                  ? { ...list, items: (list.items || []).map((item: any) => item.id === itemId ? { ...item, done: !item.done } : item) }
                  : list
              );
              wrappedUpdateHabit(taskId, { checklists: next } as any);
            } else {
              toggleChecklistItem(taskId, checklistId, itemId);
            }
          }}
          onAddChecklistItem={(taskId, checklistId, text) => {
            if (taskId.startsWith('template-edit-')) {
              const overrides = templateEditOverrides || {};
              const checklists = overrides.checklists || editingTemplateMeta?.template.checklists || [];
              const item = { id: `item-${crypto.randomUUID()}`, text, done: false };
              const next = checklists.map((list: any) =>
                list.id === checklistId ? { ...list, items: [...(list.items || []), item] } : list
              );
              wrappedUpdateHabit(taskId, { checklists: next } as any);
            } else {
              addChecklistItem(taskId, checklistId, text);
            }
          }}
          onDeleteChecklistItem={(taskId, checklistId, itemId) => {
            if (taskId.startsWith('template-edit-')) {
              const overrides = templateEditOverrides || {};
              const checklists = overrides.checklists || editingTemplateMeta?.template.checklists || [];
              const next = checklists.map((list: any) =>
                list.id === checklistId ? { ...list, items: (list.items || []).filter((item: any) => item.id !== itemId) } : list
              );
              wrappedUpdateHabit(taskId, { checklists: next } as any);
            } else {
              deleteChecklistItem(taskId, checklistId, itemId);
            }
          }}
          onDeleteHabit={taskId => { setSingleDeleteTaskId(taskId); setOpenTaskId(null); }}
          onToggleTag={(taskId, label) => {
            if (taskId.startsWith('template-edit-')) {
              wrappedUpdateHabit(taskId, { labels: [...((templateEditHabit?.labels || []) as Label[]), label] });
            } else {
              toggleHabitTag(taskId, label);
            }
          }}
          onCreateTag={async (taskId, name, color) => {
            try {
              const label = await createSharedHabitLabel(name, color);
              if (taskId.startsWith('template-edit-')) {
                wrappedUpdateHabit(taskId, { labels: [...((templateEditHabit?.labels || []) as Label[]), label] });
              } else {
                const habit = board.tasks.find(item => item.id === taskId);
                if (!habit) return;
                updateTask(taskId, { labels: [...habit.labels, label] });
              }
            } catch (error) {
              console.error('Failed to create habit tag:', error);
            }
          }}
          onDeleteTagEverywhere={deleteTagEverywhere}
          isPremium={isPremium}
          isPro={isPro}
          onJumpToHabit={id => { setOpenTaskId(null); setTimeout(() => setOpenTaskId(id), 50); }}
          onToggleDailyUnit={toggleDailyUnit}
          onEditTemplate={handleEditTemplate}
          onSaveTemplate={handleSaveTemplate}
          editingTemplateMeta={editingTemplateMeta}
          templateEditName={templateEditName}
          onTemplateEditNameChange={setTemplateEditName}
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
                  ? 'Select habits to delete'
                  : `${selectedDeleteTaskIds.length} habit${selectedDeleteTaskIds.length === 1 ? '' : 's'} selected`}
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
                Delete selected — {selectedDeleteTaskIds.length} habit{selectedDeleteTaskIds.length === 1 ? '' : 's'}
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

      {columnEditId && (() => {
        const col = board.columns.find(c => c.id === columnEditId);
        if (!col) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setColumnEditId(null)}>
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Edit Column</h3>
                <button onClick={() => setColumnEditId(null)} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Name</label>
                <input value={columnEditName} onChange={e => setColumnEditName(e.target.value)} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLUMN_COLORS.map(c => (
                    <button key={c} onClick={() => setColumnEditColor(c)} className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${columnEditColor === c ? 'border-foreground ring-2 ring-primary/30' : 'border-transparent'}`} style={{ backgroundColor: c }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Icon</label>
                <div className="flex gap-2">
                  <input value={columnEditIcon} onChange={e => setColumnEditIcon(e.target.value)} placeholder="e.g. 📋 or 🚀" className="flex-1 bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm" />
                  <button onClick={() => { updateColumn(columnEditId, { title: columnEditName, color: columnEditColor, icon: columnEditIcon || undefined }); setColumnEditId(null); }} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold">Save</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
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
                  <h2 className="text-base font-semibold text-foreground">AI Habit Builder</h2>
                  <p className="text-xs text-muted-foreground">Describe your habit and AI will structure it for you</p>
                </div>
              </div>
              <button onClick={() => setAiBuilderOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {!isPro ? (
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Pro Feature</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">AI Habit Builder is available exclusively for Pro users. Upgrade to unlock AI-powered habit creation.</p>
                <button
                  onClick={() => window.location.href = '/pricing'}
                  className="px-6 py-2.5 text-sm font-bold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-all"
                >
                  Upgrade to Pro
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <textarea
                  autoFocus
                  value={aiBuilderInput}
                  onChange={e => setAiBuilderInput(e.target.value)}
                  placeholder="Describe your habit, project, or goal in detail...&#10;&#10;e.g. 'I need to launch a new website by next Friday. It requires designing 3 pages, writing copy, setting up hosting, and testing on mobile.'"
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
                    onClick={generateAIHabit}
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

      {pendingDragMove && (() => {
        const { srcDroppableId, dstDroppableId, srcIndex, dstIndex, dstProject, moveType } = pendingDragMove;

        const confirmMove = () => {
          if (dontAsk) {
            localStorage.setItem(`habits-drag-confirm-${moveType}`, 'true');
          }
          applyDragMoveDirect(srcDroppableId, dstDroppableId, srcIndex, dstIndex, dstProject);
          setPendingDragMove(null);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPendingDragMove(null)}>
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-foreground">Move habit?</h3>
              <p className="text-xs text-muted-foreground mt-2">
                {moveType === 'project'
                  ? 'Are you sure you want to move this habit? It will change the habit\'s project.'
                  : 'Are you sure you want to move this habit? It will change the habit\'s column.'}
              </p>
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input type="checkbox" checked={dontAsk} onChange={e => setDontAsk(e.target.checked)} className="rounded border-border" />
                <span className="text-xs text-muted-foreground">Don't ask me again</span>
              </label>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setPendingDragMove(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                <button onClick={confirmMove} className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:opacity-90">Move</button>
              </div>
            </div>
          </div>
        );
      })()}

      {tagDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setTagDeleteConfirm(null)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-foreground">Delete tag everywhere?</h3>
            <p className="text-xs text-muted-foreground mt-2">This will remove this tag from the whole app. This action cannot be undone.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setTagDeleteConfirm(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={() => { deleteTagEverywhere(tagDeleteConfirm); setTagDeleteConfirm(null); setTagPopupTaskId(null); }} className="px-4 py-2 text-sm font-semibold bg-destructive text-destructive-foreground rounded-xl hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}

      {tagPopupTaskId && (() => {
        const popupHabit = board.tasks.find(t => t.id === tagPopupTaskId);
        if (!popupHabit) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setTagPopupTaskId(null)}>
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
            <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-foreground">Tags</h3>
                <button onClick={() => setTagPopupTaskId(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
              </div>
              <div className="max-h-60 space-y-2 overflow-y-auto mb-4">
                {allTags.map(label => {
                  const active = popupHabit.labels.some(item => item.id === label.id);
                  return (
                    <div key={label.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                      <button onClick={() => toggleHabitTag(popupHabit.id, label)} className="flex flex-1 items-center gap-2 text-left">
                        <span className={`w-3 h-3 rounded-full ${LABEL_COLORS[label.color]}`} />
                        <span className="text-sm text-foreground">{label.name}</span>
                        {active && <span className="ml-auto text-[10px] text-primary font-semibold">Selected</span>}
                      </button>
                      <button onClick={() => setTagDeleteConfirm(label.id)} className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-border pt-4">
                <div className="flex gap-2 mb-2">
                  <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Create tag"
                    className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                  <button onClick={() => setNewTagColor(randomTagColor())} className={`w-11 rounded-xl border border-border ${LABEL_COLORS[newTagColor]}`} title="Random color" />
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    const name = normalizeTagName(newTagName);
                    if (!name) return;
                    try {
                      const label = await createSharedHabitLabel(name, newTagColor);
                      updateTask(popupHabit.id, { labels: [...popupHabit.labels, label] });
                      setNewTagName('');
                      setNewTagColor(randomTagColor());
                    } catch (error) {
                      console.error('Failed to create habit tag:', error);
                    }
                  }} disabled={!newTagName.trim()} className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:bg-primary disabled:text-primary-foreground disabled:opacity-100 disabled:cursor-not-allowed">Add tag</button>
                  <button onClick={() => setTagPopupTaskId(null)} className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground">Done</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

interface HabitFullViewProps {
  habit: Habit;
  boardColumns: Array<{ id: string; title: string; color: string; order: number; projectId?: number | null }>;
  projects: ProjectMeta[];
  allTags: Label[];
  onClose: () => void;
  onUpdateHabit: (taskId: string, updates: Partial<Habit>) => void;
  onToggleChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  onAddChecklistItem: (taskId: string, checklistId: string, text: string) => void;
  onDeleteChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  onDeleteHabit: (taskId: string) => void;
  onToggleTag: (taskId: string, tag: Label) => void;
  onCreateTag: (taskId: string, name: string, color: LabelColor) => void;
  onDeleteTagEverywhere: (tagId: string) => void;
  isPremium: boolean;
  isPro: boolean;
  onJumpToHabit?: (taskId: string) => void;
  onEditTemplate?: (template: TaskTemplate) => void;
  onSaveTemplate?: () => Promise<void>;
  editingTemplateMeta?: { id: number; name: string; template: TaskTemplate } | null;
  templateEditName?: string;
  onTemplateEditNameChange?: (name: string) => void;
  onToggleDailyUnit?: (habitId: string, action: 'add' | 'remove') => void;
}

const HabitDropdownExpanded: React.FC<{
  habit: Habit;
  onUpdateHabit: (taskId: string, updates: Partial<Habit>) => void;
  onToggleChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  onAddChecklistItem: (taskId: string, checklistId: string, text: string) => void;
  onDeleteChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  isPremium: boolean;
  isPro: boolean;
  onToggleDailyUnit: (habitId: string, action: 'add' | 'remove') => void;
}> = ({ habit, onUpdateHabit, onToggleChecklistItem, onAddChecklistItem, onDeleteChecklistItem, isPremium, isPro, onToggleDailyUnit }) => {
  const [dailyProgressCollapsed, setDailyProgressCollapsed] = useState(false);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newSubtaskDuration, setNewSubtaskDuration] = useState(10);
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const [newChecklistText, setNewChecklistText] = useState('');
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [editingChecklistText, setEditingChecklistText] = useState('');
  const [subtasksCollapsed, setSubtasksCollapsed] = useState(false);

  // Added checklist states
  const [checklistsSectionCollapsed, setChecklistsSectionCollapsed] = useState(false);
  const [collapsedChecklists, setCollapsedChecklists] = useState<Set<string>>(new Set());
  const [perChecklistInput, setPerChecklistInput] = useState<Record<string, string>>({});
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('');

  // Added attachments/images states
  const [imagesCollapsed, setImagesCollapsed] = useState(false);
  const [attachmentsCollapsed, setAttachmentsCollapsed] = useState(false);
  const [uploading, setUploading] = useState(false);

  const mediaLimit = isPro ? 20 : isPremium ? 10 : 5;
  const canUseServerAttachmentApi = /^\d+$/.test(String(habit.id));

  const legacySubtasksChecklist = habit.checklists.find(list => list.title.toLowerCase().trim() === 'subtasks');
  const checklistLists = habit.checklists.filter(list => list.id !== legacySubtasksChecklist?.id);
  const effectiveSubtasks = (habit.subtasks && habit.subtasks.length > 0)
    ? habit.subtasks
    : (legacySubtasksChecklist?.items || []).map(item => ({ ...item, durationMinutes: 0 }));
  const primaryChecklist = checklistLists[0];
  const habitDuration = Math.max(0, Number(habit.duration) || 0);
  const subtaskTotal = effectiveSubtasks.reduce((s, st) => s + Math.max(0, Number(st.durationMinutes) || 0), 0);
  const subtaskTimeRemaining = habitDuration - subtaskTotal;
  const allSubtasksDone = effectiveSubtasks.length > 0 && effectiveSubtasks.every(st => st.completed);

  const persistSubtasks = (nextSubtasks: Habit['subtasks']) => {
    const nextChecklists = legacySubtasksChecklist
      ? habit.checklists.filter(list => list.id !== legacySubtasksChecklist.id)
      : habit.checklists;
    onUpdateHabit(habit.id, { subtasks: nextSubtasks as any, checklists: nextChecklists });
  };

  const updateSubtask = (subtaskId: string, updates: Partial<Subtask>) => {
    const updateRecursive = (list: Subtask[]): Subtask[] =>
      list.map(st => st.id === subtaskId ? { ...st, ...updates } : { ...st, children: st.children ? updateRecursive(st.children) : undefined });
    persistSubtasks(updateRecursive(effectiveSubtasks as any) as any);
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
    const removeRecursive = (list: Subtask[]): Subtask[] =>
      list.filter(st => st.id !== subtaskId).map(st => st.children ? { ...st, children: removeRecursive(st.children) } : st);
    persistSubtasks(removeRecursive(effectiveSubtasks as any) as any);
  };

  const saveSubtaskEdit = (subtaskId: string) => {
    const next = editingSubtaskText.trim();
    if (next) updateSubtask(subtaskId, { text: next });
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
  };

  const saveChecklistItemEdit = (checklistId: string, itemId: string) => {
    const next = editingChecklistText.trim();
    if (next) {
      onUpdateHabit(habit.id, {
        checklists: habit.checklists.map(list =>
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

  const handleDropdownReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    if (result.source.droppableId === `dropdown-subtasks-${habit.id}`) {
      const items = Array.from(effectiveSubtasks);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      persistSubtasks(items);
    } else if (result.source.droppableId === `dropdown-checklist-lists-${habit.id}`) {
      const items = Array.from(habit.checklists);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      onUpdateHabit(habit.id, { checklists: items });
    } else if (result.source.droppableId.startsWith(`dropdown-checklist-${habit.id}-`)) {
      const srcChecklistId = result.source.droppableId.replace(`dropdown-checklist-${habit.id}-`, '');
      const dstChecklistId = result.destination.droppableId.replace(`dropdown-checklist-${habit.id}-`, '');

      if (srcChecklistId === dstChecklistId) {
        onUpdateHabit(habit.id, {
          checklists: habit.checklists.map(cl =>
            cl.id === srcChecklistId
              ? { ...cl, items: (() => {
                  const items = Array.from(cl.items);
                  const [removed] = items.splice(result.source.index, 1);
                  items.splice(result.destination.index, 0, removed);
                  return items;
                })() }
              : cl
          ),
        });
      } else {
        let movedItem: ChecklistItem | null = null;
        const without = habit.checklists.map(cl =>
          cl.id === srcChecklistId
            ? (() => { const items = Array.from(cl.items); [movedItem] = items.splice(result.source.index, 1); return { ...cl, items }; })()
            : cl
        );
        if (!movedItem) return;
        onUpdateHabit(habit.id, {
          checklists: without.map(cl =>
            cl.id === dstChecklistId
              ? { ...cl, items: [...cl.items.slice(0, result.destination!.index), movedItem!, ...cl.items.slice(result.destination!.index)] }
              : cl
          ),
        });
      }
    }
  }, [effectiveSubtasks, persistSubtasks, habit.checklists, onUpdateHabit]);

  const handleImageReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(habit.images || []);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    onUpdateHabit(habit.id, { images: items });
  }, [habit.images, onUpdateHabit]);

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
          const res = await fetch(`/api/attachments/${habit.id}`, { method: 'POST', credentials: 'include', body: formData });
          if (res.ok) {
            uploaded.push(await res.json());
          } else {
            uploaded.push({ id: crypto.randomUUID(), taskId: habit.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
          }
        } catch {
          uploaded.push({ id: crypto.randomUUID(), taskId: habit.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
        }
      } else {
        uploaded.push({ id: crypto.randomUUID(), taskId: habit.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
      }
    }
    if (uploaded.length > 0) onUpdateHabit(habit.id, { attachments: [...(habit.attachments || []), ...uploaded] });
    setUploading(false);
    e.currentTarget.value = '';
  };

  const deleteAttachment = async (attachmentId: string) => {
    onUpdateHabit(habit.id, { attachments: (habit.attachments || []).filter(item => item.id !== attachmentId) });
    if (canUseServerAttachmentApi && /^\d+$/.test(String(attachmentId))) {
      try { await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE', credentials: 'include' }); } catch {}
    }
  };

  const renderSubtaskItem = (subtask: Subtask, index: number): React.ReactNode => {
    return (
      <Draggable key={subtask.id} draggableId={subtask.id} index={index}>
        {(provided) => (
          <div ref={provided.innerRef} {...provided.draggableProps} className="min-w-0">
            <div className="grid grid-cols-[auto_auto_1fr_auto] gap-2 items-center rounded-lg border border-border px-3 py-2 group">
              <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                <GripVertical className="w-4 h-4" />
              </div>
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
                  className={`text-sm cursor-text truncate ${subtask.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
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
          </div>
        )}
      </Draggable>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Description</h4>
        <textarea
          value={habit.description}
          onChange={e => onUpdateHabit(habit.id, { description: e.target.value })}
          rows={3}
          className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
        />
      </div>

      {/* Daily Progress */}
      <div className="rounded-2xl border border-border bg-muted/20">
        {(() => {
          const todayStr = new Date().toISOString().split('T')[0];
          const logs = habit.dailyLogs ? JSON.parse(habit.dailyLogs) : {};
          const todayDone = logs[todayStr] || 0;
          const target = habit.dailyTarget || 1;
          const period = habit.targetPeriod || 'daily';
          const periodLabel = period === 'weekly' ? "This Week's Progress" : period === 'monthly' ? "This Month's Progress" : "Today's Progress";
          const goalLabel = period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly';
          return (
            <>
              <button
                onClick={() => setDailyProgressCollapsed(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">{periodLabel}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{todayDone}/{target}</span>
                  {dailyProgressCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>
              {!dailyProgressCollapsed && (
                <div className="border-t border-border/60 px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: target }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => onToggleDailyUnit(habit.id, i < todayDone ? 'remove' : 'add')}
                        className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-all ${
                          i < todayDone
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-border bg-muted/40 hover:border-muted-foreground/30'
                        }`}
                      >
                        {i < todayDone ? <Check className="w-5 h-5" /> : <span className="text-sm text-muted-foreground">{i + 1}</span>}
                      </button>
                    ))}
                  </div>
                  {target > 0 && todayDone >= target && (
                    <div className="mt-3 text-xs text-label-green bg-label-green/10 px-2.5 py-1 rounded-md inline-block">
                      ✓ {goalLabel} goal completed!
                    </div>
                  )}
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Attachments Section */}
      <div className="rounded-2xl border border-border bg-muted/20">
        <button
          onClick={() => setAttachmentsCollapsed(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
            {(habit.attachments ?? []).length > 0 && (
              <span className="text-xs text-muted-foreground">({(habit.attachments ?? []).length})</span>
            )}
          </div>
          {attachmentsCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>
        {!attachmentsCollapsed && (
          <div className="border-t border-border/60 px-4 py-3 space-y-3">
            {!isPremium ? (
              <div className="border border-dashed border-border rounded-xl">
                <PremiumGate
                  title="File Attachments"
                  description="Attach files, images, and documents directly to your habits."
                  icon={<Paperclip className="w-6 h-6 text-primary" />}
                />
              </div>
            ) : (
              <>
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
                  <div className="bg-background/60 backdrop-blur-[1px] flex items-center justify-center rounded-xl py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm font-medium">Uploading...</span>
                    </div>
                  </div>
                )}
                {(habit.attachments || []).length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(habit.attachments || []).map(attachment => {
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
        )}
      </div>

      {/* Images Section */}
      <div className="rounded-2xl border border-border bg-muted/20">
        <button
          onClick={() => setImagesCollapsed(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Image className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Images</h3>
            {habit.images && habit.images.length > 0 && (
              <span className="text-xs text-muted-foreground">({habit.images.length})</span>
            )}
          </div>
          {imagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>
        {!imagesCollapsed && (
          <div className="border-t border-border/60 px-4 py-3 space-y-3">
            {!isPremium ? (
              <div className="border border-dashed border-border rounded-xl">
                <PremiumGate
                  title="Image Attachments"
                  description="Upload images directly to your habits."
                  icon={<Image className="w-6 h-6 text-primary" />}
                />
              </div>
            ) : (
              <>
                {(habit.images?.length || 0) + (habit.attachments?.length || 0) >= mediaLimit ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Limit reached — upgrade for more</p>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                    <div className="flex flex-col items-center justify-center py-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <Image className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-foreground">Click to upload</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF (max 10MB)</p>
                    </div>
                    <input type="file" multiple accept="image/*,.heic,.heif" onChange={async e => {
                      if (!e.target.files) return;
                      const files = Array.from(e.target.files);
                      const newImages: Attachment[] = [];
                      for (const file of files) {
                        const fileUrl = await imageToDataUrl(file);
                        const fileType = /\.heic$/i.test(file.name) ? 'image/jpeg' : (file.type || 'image/*');
                        newImages.push({ id: crypto.randomUUID(), taskId: String(habit.id), fileName: file.name, fileType, fileSize: file.size, fileUrl, createdAt: new Date().toISOString() });
                      }
                      onUpdateHabit(habit.id, { images: [...(habit.images || []), ...newImages] });
                      e.target.value = '';
                    }} className="hidden" />
                  </label>
                )}
                {habit.images && habit.images.length > 0 && (
                  <DragDropContext onDragEnd={handleImageReorder}>
                    <Droppable droppableId={`dropdown-images-${habit.id}`} direction="horizontal">
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {habit.images.map((img, idx) => (
                            <Draggable key={img.id} draggableId={img.id} index={idx}>
                              {(provided) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} className="relative group/img aspect-square rounded-xl border border-border bg-muted/40 overflow-hidden">
                                  {img.fileUrl.match(/^data:image/) ? (
                                    <img src={img.fileUrl} alt={img.fileName} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center"><Image className="w-8 h-8 text-muted-foreground" /></div>
                                  )}
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
                                    <p className="text-xs font-medium text-white truncate">{img.fileName}</p>
                                    {img.fileSize != null && <p className="text-[10px] text-white/70">{(img.fileSize / 1024).toFixed(1)} KB</p>}
                                  </div>
                                  <div {...provided.dragHandleProps} className="absolute top-1.5 left-1.5 p-1 rounded-md bg-background/80 border border-border text-muted-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover/img:opacity-100 transition-all shadow-sm z-10">
                                    <GripVertical className="w-3.5 h-3.5" />
                                  </div>
                                  <button
                                    onClick={() => onUpdateHabit(habit.id, { images: (habit.images || []).filter(x => x.id !== img.id) })}
                                    className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/img:opacity-100 transition-all shadow-sm z-10"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const HabitFullView: React.FC<HabitFullViewProps> = ({
  habit,
  boardColumns,
  projects,
  allTags,
  onClose,
  onUpdateHabit,
  onToggleChecklistItem,
  onAddChecklistItem,
  onDeleteChecklistItem,
  onDeleteHabit,
  onToggleTag,
  onCreateTag,
  onDeleteTagEverywhere,
  isPremium,
  isPro,
  onJumpToHabit,
  onEditTemplate,
  onSaveTemplate,
  editingTemplateMeta,
  templateEditName,
  onTemplateEditNameChange,
  onToggleDailyUnit,
}) => {
  const [dailyProgressCollapsed, setDailyProgressCollapsed] = useState(false);
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
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<LabelColor>(randomTagColor());

  const [templatePopupOpen, setTemplatePopupOpen] = useState(false);
  const [fullViewTemplates, setFullViewTemplates] = useState<TaskTemplate[]>([]);
  const [editingTmpl, setEditingTmpl] = useState<TaskTemplate | null>(null);
  const [editingTmplName, setEditingTmplName] = useState('');
  const [editingTmplTitle, setEditingTmplTitle] = useState('');
  const [editingTmplDesc, setEditingTmplDesc] = useState('');
  const [editingTmplPriority, setEditingTmplPriority] = useState<string>('medium');
  const [editingTmplDuration, setEditingTmplDuration] = useState(0);
  const [editingTmplStartDate, setEditingTmplStartDate] = useState('');
  const [editingTmplStartTime, setEditingTmplStartTime] = useState('');
  const [editingTmplDueDate, setEditingTmplDueDate] = useState('');
  const [editingTmplDueTime, setEditingTmplDueTime] = useState('');
  const [fullViewSaveTmplOpen, setFullViewSaveTmplOpen] = useState(false);
  const [fullViewTmplName, setFullViewTmplName] = useState('');
  const [fullViewLoadTmplOpen, setFullViewLoadTmplOpen] = useState(false);
  const [fullViewLoadTemplates, setFullViewLoadTemplates] = useState<TaskTemplate[]>([]);
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [imagesCollapsed, setImagesCollapsed] = useState(false);
  const [subtasksCollapsed, setSubtasksCollapsed] = useState(false);
  const [attachmentsCollapsed, setAttachmentsCollapsed] = useState(false);
  const [checklistsSectionCollapsed, setChecklistsSectionCollapsed] = useState(false);
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('');
  const [tagDeleteConfirm, setTagDeleteConfirm] = useState<string | null>(null);
  const [projectChangeConfirm, setProjectChangeConfirm] = useState<{ v: string; oldProjectId: number | null | undefined } | null>(null);
  const [collapsedChecklists, setCollapsedChecklists] = useState<Set<string>>(new Set());
  const [perChecklistInput, setPerChecklistInput] = useState<Record<string, string>>({});
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const mediaLimit = isPro ? 20 : isPremium ? 10 : 5;
  const canUseServerAttachmentApi = /^\d+$/.test(String(habit.id));

  const legacySubtasksChecklist = habit.checklists.find(list => list.title.toLowerCase().trim() === 'subtasks');
  const checklistLists = habit.checklists.filter(list => list.id !== legacySubtasksChecklist?.id);
  const effectiveSubtasks = (habit.subtasks && habit.subtasks.length > 0)
    ? habit.subtasks
    : (legacySubtasksChecklist?.items || []).map(item => ({ ...item, durationMinutes: 0 }));
  const primaryChecklist = checklistLists[0];
  const habitDuration = Math.max(0, Number(habit.duration) || 0);
  const subtaskTotal = effectiveSubtasks.reduce((s, st) => s + Math.max(0, Number(st.durationMinutes) || 0), 0);
  const subtaskTimeRemaining = habitDuration - subtaskTotal;
  const allSubtasksDone = effectiveSubtasks.length > 0 && effectiveSubtasks.every(st => st.completed);

  const habitProject = habit.projectId ? projects.find(project => project.id === habit.projectId) || null : null;

  const activityEntries = useMemo(() => {
    const entries = [
      ...(habit.activityLog || []).map(entry => ({ id: entry.id, text: entry.text, createdAt: entry.createdAt })),
      { id: 'created', text: `Created ${new Date(habit.createdAt).toLocaleDateString()}`, createdAt: habit.createdAt },
      ...(habit.updatedAt ? [{ id: 'updated', text: `Updated ${new Date(habit.updatedAt).toLocaleDateString()}`, createdAt: habit.updatedAt }] : []),
      ...(habit.projectId ? [{ id: 'project', text: `Assigned to ${habitProject?.name || 'project'}`, createdAt: habit.updatedAt || habit.createdAt }] : []),
      ...(habit.comments || []).map(comment => ({
        id: comment.id,
        text: `Commented: ${comment.text.slice(0, 80)}${comment.text.length > 80 ? '...' : ''}`,
        createdAt: comment.createdAt,
      })),
    ];
    return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [habit.activityLog, habit.createdAt, habit.projectId, habit.updatedAt, habitProject?.name, habit.comments]);

  const persistSubtasks = (nextSubtasks: Habit['subtasks']) => {
    const nextChecklists = legacySubtasksChecklist
      ? habit.checklists.filter(list => list.id !== legacySubtasksChecklist.id)
      : habit.checklists;
    onUpdateHabit(habit.id, { subtasks: nextSubtasks, checklists: nextChecklists });
  };

  const updateSubtask = (subtaskId: string, updates: Partial<Subtask>) => {
    const updateRecursive = (list: Subtask[]): Subtask[] =>
      list.map(st => st.id === subtaskId ? { ...st, ...updates } : { ...st, children: st.children ? updateRecursive(st.children) : undefined });
    persistSubtasks(updateRecursive(effectiveSubtasks));
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
    const removeRecursive = (list: Subtask[]): Subtask[] =>
      list.filter(st => st.id !== subtaskId).map(st => st.children ? { ...st, children: removeRecursive(st.children) } : st);
    persistSubtasks(removeRecursive(effectiveSubtasks));
  };

  const insertSubtask = (beforeId: string | null) => {
    const newSub: Subtask = { id: crypto.randomUUID(), text: 'title', completed: false, durationMinutes: 0 };
    if (beforeId) {
      const idx = effectiveSubtasks.findIndex(st => st.id === beforeId);
      if (idx >= 0) {
        const next = [...effectiveSubtasks];
        next.splice(idx, 0, newSub);
        persistSubtasks(next);
        return;
      }
    }
    persistSubtasks([...effectiveSubtasks, newSub]);
  };

  const renderSubtaskItem = (subtask: Subtask, index: number): React.ReactNode => {
    return (
      <Draggable key={subtask.id} draggableId={subtask.id} index={index}>
        {(provided) => (
          <div ref={provided.innerRef} {...provided.draggableProps} className="min-w-0">
            <div className="grid grid-cols-[auto_auto_1fr_auto] gap-2 items-center rounded-lg border border-border px-3 py-2 group">
              <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                <GripVertical className="w-4 h-4" />
              </div>
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
                  className={`text-sm cursor-text truncate ${subtask.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
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
          </div>
        )}
      </Draggable>
    );
  };

  const saveSubtaskEdit = (subtaskId: string) => {
    const next = editingSubtaskText.trim();
    if (next) updateSubtask(subtaskId, { text: next });
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
  };

  const addChecklistItemToHabit = () => {
    if (!newChecklistText.trim()) return;
    if (!primaryChecklist) {
      onUpdateHabit(habit.id, {
        checklists: [...checklistLists, {
          id: crypto.randomUUID(),
          title: 'Checklist',
          items: [{ id: crypto.randomUUID(), text: newChecklistText.trim(), completed: false }],
        }],
      });
      setNewChecklistText('');
      return;
    }
    onAddChecklistItem(habit.id, primaryChecklist.id, newChecklistText.trim());
    setNewChecklistText('');
  };

  const addChecklistItemToList = (checklistId: string) => {
    if (!newChecklistText.trim()) return;
    onAddChecklistItem(habit.id, checklistId, newChecklistText.trim());
    setNewChecklistText('');
  };

  const saveChecklistItemEdit = (checklistId: string, itemId: string) => {
    const next = editingChecklistText.trim();
    if (next) {
      onUpdateHabit(habit.id, {
        checklists: habit.checklists.map(list =>
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

  const handleChecklistListReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(habit.checklists);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    onUpdateHabit(habit.id, { checklists: items });
  }, [habit.checklists, onUpdateHabit]);

  const handleFullViewReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    if (result.source.droppableId === 'fullview-subtasks') {
      const items = Array.from(effectiveSubtasks);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      persistSubtasks(items);
    } else if (result.source.droppableId === 'fullview-checklist-lists') {
      const items = Array.from(habit.checklists);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      onUpdateHabit(habit.id, { checklists: items });
    } else if (result.source.droppableId.startsWith('fullview-checklist-')) {
      const srcChecklistId = result.source.droppableId.replace('fullview-checklist-', '');
      const dstChecklistId = result.destination.droppableId.replace('fullview-checklist-', '');

      if (srcChecklistId === dstChecklistId) {
        onUpdateHabit(habit.id, {
          checklists: habit.checklists.map(cl =>
            cl.id === srcChecklistId
              ? { ...cl, items: (() => {
                  const items = Array.from(cl.items);
                  const [removed] = items.splice(result.source.index, 1);
                  items.splice(result.destination.index, 0, removed);
                  return items;
                })() }
              : cl
          ),
        });
      } else {
        let movedItem: ChecklistItem | null = null;
        const without = habit.checklists.map(cl =>
          cl.id === srcChecklistId
            ? (() => { const items = Array.from(cl.items); [movedItem] = items.splice(result.source.index, 1); return { ...cl, items }; })()
            : cl
        );
        if (!movedItem) return;
        onUpdateHabit(habit.id, {
          checklists: without.map(cl =>
            cl.id === dstChecklistId
              ? { ...cl, items: [...cl.items.slice(0, result.destination!.index), movedItem!, ...cl.items.slice(result.destination!.index)] }
              : cl
          ),
        });
      }
    }
  }, [effectiveSubtasks, persistSubtasks, habit.checklists, onUpdateHabit]);

  const handleImageReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(habit.images || []);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    onUpdateHabit(habit.id, { images: items });
  }, [habit.images, onUpdateHabit]);

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
          const res = await fetch(`/api/attachments/${habit.id}`, { method: 'POST', credentials: 'include', body: formData });
          if (res.ok) {
            uploaded.push(await res.json());
          } else {
            uploaded.push({ id: crypto.randomUUID(), taskId: habit.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
          }
        } catch {
          uploaded.push({ id: crypto.randomUUID(), taskId: habit.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
        }
      } else {
        uploaded.push({ id: crypto.randomUUID(), taskId: habit.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
      }
    }
    if (uploaded.length > 0) onUpdateHabit(habit.id, { attachments: [...(habit.attachments || []), ...uploaded] });
    setUploading(false);
    e.currentTarget.value = '';
  };

  const deleteAttachment = async (attachmentId: string) => {
    onUpdateHabit(habit.id, { attachments: (habit.attachments || []).filter(item => item.id !== attachmentId) });
    if (canUseServerAttachmentApi && /^\d+$/.test(String(attachmentId))) {
      try { await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE', credentials: 'include' }); } catch {}
    }
  };

  const createTagForHabit = () => {
    const name = normalizeTagName(newTagName);
    if (!name) return;
    onCreateTag(habit.id, name, newTagColor);
    setNewTagName('');
    setNewTagColor(randomTagColor());
    setTagPickerOpen(false);
  };

  const addComment = () => {
    if (!newCommentText.trim()) return;
    onUpdateHabit(habit.id, {
      comments: [...(habit.comments || []), { id: crypto.randomUUID(), text: newCommentText.trim(), createdAt: new Date().toISOString() }],
    });
    setNewCommentText('');
  };

  const deleteComment = (commentId: string) => {
    onUpdateHabit(habit.id, { comments: (habit.comments || []).filter(c => c.id !== commentId) });
  };

  const updateComment = (commentId: string, text: string) => {
    onUpdateHabit(habit.id, { comments: (habit.comments || []).map(c => c.id === commentId ? { ...c, text } : c) });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto p-5 space-y-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            {editingTemplateMeta && (
              <div className="mb-2">
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Template name</label>
                <input
                  className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={templateEditName || ''}
                  onChange={e => onTemplateEditNameChange?.(e.target.value)}
                  placeholder="Template name"
                />
              </div>
            )}
            <input
              className="w-full px-1 text-2xl font-semibold text-foreground bg-transparent border-none focus:outline-none focus:ring-0"
              value={habit.title}
              onChange={e => onUpdateHabit(habit.id, { title: e.target.value })}
            />
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Priority</label>
            <Select value={habit.priority} onValueChange={v => onUpdateHabit(habit.id, { priority: v as Priority })}>
              <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Estimated duration (minutes)</label>
            <input
              type="number"
              min={0}
              value={habit.duration || 0}
              onChange={e => onUpdateHabit(habit.id, { duration: Math.max(0, Number(e.target.value) || 0) })}
              className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Project</label>
              <Select value={habit.projectId ? String(habit.projectId) : 'my-habits'} onValueChange={v => {
                const newId = v === 'my-habits' ? null : Number(v);
                if (newId !== habit.projectId) {
                  setProjectChangeConfirm({ v, oldProjectId: habit.projectId });
                }
              }}>
                <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="my-habits">My Habits</SelectItem>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {habit.projectId && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Column</label>
                <Select value={habit.columnId} onValueChange={v => onUpdateHabit(habit.id, { columnId: v })}>
                  <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                    <SelectValue placeholder="Column" />
                  </SelectTrigger>
                  <SelectContent>
                    {boardColumns
                      .filter(col => col.projectId === habit.projectId)
                      .sort((a, b) => a.order - b.order)
                      .map(col => (
                        <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> Start
            </label>
            <div className="flex items-center gap-2 mt-1">
              <div className="relative flex-1">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  value={habit.startDate || ''}
                  onChange={e => onUpdateHabit(habit.id, { startDate: e.target.value || undefined })}
                  className="w-full bg-muted/40 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all [color-scheme:var(--color-scheme)]"
                />
              </div>
              <div className="relative w-[130px]">
                <Clock3 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="time"
                  value={habit.startTime || ''}
                  onChange={e => onUpdateHabit(habit.id, { startTime: e.target.value || undefined })}
                  className="w-full bg-muted/40 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all [color-scheme:var(--color-scheme)]"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3 h-3" /> End
            </label>
            <div className="flex items-center gap-2 mt-1">
              <div className="relative flex-1">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  value={habit.dueDate || ''}
                  onChange={e => onUpdateHabit(habit.id, { dueDate: e.target.value || undefined })}
                  className="w-full bg-muted/40 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all [color-scheme:var(--color-scheme)]"
                />
              </div>
              <div className="relative w-[130px]">
                <Clock3 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="time"
                  value={habit.dueTime || ''}
                  onChange={e => onUpdateHabit(habit.id, { dueTime: e.target.value || undefined })}
                  className="w-full bg-muted/40 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all [color-scheme:var(--color-scheme)]"
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Description</label>
          <textarea
            value={habit.description}
            onChange={e => onUpdateHabit(habit.id, { description: e.target.value })}
            rows={4}
            className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              Tags
            </h3>
            <button
              onClick={() => setTagPickerOpen(prev => !prev)}
              className="text-xs text-primary hover:underline"
            >
              {tagPickerOpen ? 'Close' : 'Edit'}
            </button>
          </div>

          {habit.labels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {habit.labels.map(label => (
                <button
                  key={label.id}
                  onClick={() => onToggleTag(habit.id, label)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${LABEL_COLORS[label.color]} text-primary-foreground`}
                >
                  {label.name}
                  <X className="w-3 h-3 opacity-80" />
                </button>
              ))}
            </div>
          )}

          {tagPickerOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setTagPickerOpen(false)}>
              <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
              <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-foreground">Tags</h3>
                  <button onClick={() => setTagPickerOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
                </div>
                <div className="max-h-60 space-y-2 overflow-y-auto mb-4">
                  {allTags.map(label => {
                    const active = habit.labels.some(item => item.id === label.id);
                    return (
                      <div key={label.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                        <button onClick={() => onToggleTag(habit.id, label)} className="flex flex-1 items-center gap-2 text-left">
                          <span className={`w-3 h-3 rounded-full ${LABEL_COLORS[label.color]}`} />
                          <span className="text-sm text-foreground">{label.name}</span>
                          {active && <span className="ml-auto text-[10px] text-primary font-semibold">Selected</span>}
                        </button>
                        <button onClick={() => setTagDeleteConfirm(label.id)} className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-border pt-4">
                  <div className="flex gap-2 mb-2">
                    <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Create tag"
                      className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20" />
                    <button onClick={() => setNewTagColor(randomTagColor())} className={`w-11 rounded-xl border border-border ${LABEL_COLORS[newTagColor]}`} title="Random color" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={createTagForHabit} disabled={!newTagName.trim()} className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:bg-primary disabled:text-primary-foreground disabled:opacity-100 disabled:cursor-not-allowed">Add tag</button>
                    <button onClick={() => setTagPickerOpen(false)} className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground">Done</button>
                  </div>
                </div>
              </div>
            </div>
          )}
          {tagDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setTagDeleteConfirm(null)}>
              <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
              <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                <h3 className="text-sm font-bold text-foreground">Delete tag everywhere?</h3>
                <p className="text-xs text-muted-foreground mt-2">This will remove this tag from the whole app. This action cannot be undone.</p>
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setTagDeleteConfirm(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                  <button onClick={() => { onDeleteTagEverywhere(tagDeleteConfirm); setTagDeleteConfirm(null); }} className="px-4 py-2 text-sm font-semibold bg-destructive text-destructive-foreground rounded-xl hover:opacity-90">Delete</button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          {(() => {
            const todayStr = new Date().toISOString().split('T')[0];
            const logs = habit.dailyLogs ? JSON.parse(habit.dailyLogs) : {};
            const todayDone = logs[todayStr] || 0;
            const target = habit.dailyTarget || 1;
            const period = habit.targetPeriod || 'daily';
            const periodLabel = period === 'weekly' ? "This Week's Progress" : period === 'monthly' ? "This Month's Progress" : "Today's Progress";
            const goalLabel = period === 'daily' ? 'Daily' : period === 'weekly' ? 'Weekly' : 'Monthly';
            return (
              <>
                <button
                  onClick={() => setDailyProgressCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">{periodLabel}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{todayDone}/{target}</span>
                    {dailyProgressCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>
                {!dailyProgressCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {Array.from({ length: target }, (_, i) => (
                        <button
                          key={i}
                          onClick={() => onToggleDailyUnit?.(habit.id, i < todayDone ? 'remove' : 'add')}
                          className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-all ${
                            i < todayDone
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'border-border bg-muted/40 hover:border-muted-foreground/30'
                          }`}
                        >
                          {i < todayDone ? <Check className="w-5 h-5" /> : <span className="text-sm text-muted-foreground">{i + 1}</span>}
                        </button>
                      ))}
                    </div>
                    {target > 0 && todayDone >= target && (
                      <div className="mt-3 text-xs text-label-green bg-label-green/10 px-2.5 py-1 rounded-md inline-block">
                        ✓ {goalLabel} goal completed!
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          <button
            onClick={() => setAttachmentsCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
              {(habit.attachments ?? []).length > 0 && (
                <span className="text-xs text-muted-foreground">({(habit.attachments ?? []).length})</span>
              )}
            </div>
            {attachmentsCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </button>
          {!attachmentsCollapsed && (
            <div className="border-t border-border/60 px-4 py-3 space-y-3">
              {!isPremium ? (
                <div className="border border-dashed border-border rounded-xl">
                  <PremiumGate
                    title="File Attachments"
                    description="Attach files, images, and documents directly to your habits."
                    icon={<Paperclip className="w-6 h-6 text-primary" />}
                  />
                </div>
              ) : (
                <>
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
                    <div className="bg-background/60 backdrop-blur-[1px] flex items-center justify-center rounded-xl py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm font-medium">Uploading...</span>
                      </div>
                    </div>
                  )}
                  {(habit.attachments || []).length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(habit.attachments || []).map(attachment => {
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
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          <button
            onClick={() => setImagesCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Image className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Images</h3>
              {habit.images && habit.images.length > 0 && (
                <span className="text-xs text-muted-foreground">({habit.images.length})</span>
              )}
            </div>
            {imagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </button>
          {!imagesCollapsed && (
            <div className="border-t border-border/60 px-4 py-3 space-y-3">
              {!isPremium ? (
                <div className="border border-dashed border-border rounded-xl">
                  <PremiumGate
                    title="Image Attachments"
                    description="Upload images directly to your habits."
                    icon={<Image className="w-6 h-6 text-primary" />}
                  />
                </div>
              ) : (
                <>
              {(habit.images?.length || 0) + (habit.attachments?.length || 0) >= mediaLimit ? (
                <p className="text-xs text-muted-foreground text-center py-2">Limit reached — upgrade for more</p>
              ) : (
                <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                  <div className="flex flex-col items-center justify-center py-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                      <Image className="w-5 h-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Click to upload</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF (max 10MB)</p>
                  </div>
                   <input type="file" multiple accept="image/*,.heic,.heif" onChange={async e => {
                    if (!e.target.files) return;
                    const files = Array.from(e.target.files);
                    const newImages: Attachment[] = [];
                    for (const file of files) {
                      const fileUrl = await imageToDataUrl(file);
                      const fileType = /\.heic$/i.test(file.name) ? 'image/jpeg' : (file.type || 'image/*');
                      newImages.push({ id: crypto.randomUUID(), taskId: String(habit.id), fileName: file.name, fileType, fileSize: file.size, fileUrl, createdAt: new Date().toISOString() });
                    }
                    onUpdateHabit(habit.id, { images: [...(habit.images || []), ...newImages] });
                    e.target.value = '';
                  }} className="hidden" />
                </label>
              )}
              {habit.images && habit.images.length > 0 && (
                <DragDropContext onDragEnd={handleImageReorder}>
                  <Droppable droppableId="fullview-images" direction="horizontal">
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {habit.images.map((img, idx) => (
                          <Draggable key={img.id} draggableId={img.id} index={idx}>
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.draggableProps} className="relative group/img aspect-square rounded-xl border border-border bg-muted/40 overflow-hidden">
                                {img.fileUrl.match(/^data:image/) ? (
                                  <img src={img.fileUrl} alt={img.fileName} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center"><Image className="w-8 h-8 text-muted-foreground" /></div>
                                )}
                                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 pt-6">
                                  <p className="text-xs font-medium text-white truncate">{img.fileName}</p>
                                  {img.fileSize != null && <p className="text-[10px] text-white/70">{(img.fileSize / 1024).toFixed(1)} KB</p>}
                                </div>
                                <div {...provided.dragHandleProps} className="absolute top-1.5 left-1.5 p-1 rounded-md bg-background/80 border border-border text-muted-foreground cursor-grab active:cursor-grabbing opacity-0 group-hover/img:opacity-100 transition-all shadow-sm z-10">
                                  <GripVertical className="w-3.5 h-3.5" />
                                </div>
                                <button
                                  onClick={() => onUpdateHabit(habit.id, { images: (habit.images || []).filter(x => x.id !== img.id) })}
                                  className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/img:opacity-100 transition-all shadow-sm z-10"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-muted/20">
          <button
            onClick={() => setActivityCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Activity</h3>
            </div>
            {activityCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
          </button>
          {!activityCollapsed && (
            <div className="border-t border-border/60 px-4 py-3 space-y-2 max-h-56 overflow-y-auto">
              {activityEntries.map(entry => (
                <div key={entry.id} className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                  <p className="text-sm text-foreground">{entry.text}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{new Date(entry.createdAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Comments</h3>
          <div className="space-y-2">
            {(habit.comments || []).map(comment => (
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

          {/* Removed status + due from comments header area */}

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
            {habit.priority !== 'none' && (
              <span className={`${PRIORITY_CONFIG[habit.priority as Exclude<typeof habit.priority, 'none'>]?.className} text-[10px] font-medium px-2 py-0.5 rounded-full text-primary-foreground`}>
                {PRIORITY_CONFIG[habit.priority as Exclude<typeof habit.priority, 'none'>]?.label}
              </span>
            )}
            <span className="text-xs text-muted-foreground">Created: {new Date(habit.createdAt).toLocaleDateString()}</span>
            <div className="relative">
              <button
                onClick={async () => {
                  try {
                    const t = await fetchTemplates();
                    setFullViewTemplates(t);
                    setTemplatePopupOpen(true);
                  } catch (err) {
                    console.error('Failed to fetch templates:', err);
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
              >
                <Star className="w-3.5 h-3.5" />
                Templates
              </button>
              {templatePopupOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setTemplatePopupOpen(false)} />
                  <div className="absolute bottom-full left-0 mb-2 w-48 bg-card border border-border rounded-xl shadow-xl z-30 p-1.5">
                    <button
                      onClick={() => { setTemplatePopupOpen(false); setFullViewSaveTmplOpen(true); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted transition-all"
                    >
                      <div className="w-6 h-6 rounded-md bg-primary/5 flex items-center justify-center">
                        <Plus className="w-3.5 h-3.5 text-primary" />
                      </div>
                      Save as template
                    </button>
                    <button
                      onClick={async () => {
                        setTemplatePopupOpen(false);
                        try {
                          const t = await fetchTemplates();
                          setFullViewLoadTemplates(t);
                          setFullViewLoadTmplOpen(true);
                        } catch (err) {
                          console.error('Failed to load templates:', err);
                        }
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted transition-all"
                    >
                      <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center">
                        <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      Load template
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {editingTemplateMeta ? (
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all font-medium">
                Cancel
              </button>
              <button onClick={() => onSaveTemplate?.()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all">
                <Save className="w-3.5 h-3.5" />
                Save Template
              </button>
            </div>
          ) : (
            <button
              onClick={() => onDeleteHabit(habit.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Habit
            </button>
          )}
        </div>
      </div>

      {fullViewSaveTmplOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setFullViewSaveTmplOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Star className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Save as template</h2>
              </div>
              <button onClick={() => { setFullViewSaveTmplOpen(false); setFullViewTmplName(''); }} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Template name</label>
                <input
                  autoFocus
                  placeholder="e.g. Daily Standup Habit"
                  value={fullViewTmplName}
                  onChange={e => setFullViewTmplName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fullViewTmplName.trim() && (async () => {
                    try {
                      await createTemplate({
                        name: fullViewTmplName.trim(),
                        title: habit.title || '',
                        description: habit.description || '',
                        priority: habit.priority || 'medium',
                        duration: Number(habit.duration) || 0,
                        startDate: habit.startDate || undefined,
                        startTime: habit.startTime || undefined,
                        dueDate: habit.dueDate || undefined,
                        dueTime: habit.dueTime || undefined,
                        projectId: habit.projectId ?? null,
                        columnId: habit.columnId || undefined,
                        labels: habit.labels || [],
                        subtasks: (habit.subtasks || []).map(st => ({ text: st.text, durationMinutes: st.durationMinutes || 0 })),
                        checklists: habit.checklists || [],
                      });
                      setFullViewSaveTmplOpen(false);
                      setFullViewTmplName('');
                    } catch (err) {
                      console.error('Failed to save template:', err);
                    }
                  })()}
                  className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={() => { setFullViewSaveTmplOpen(false); setFullViewTmplName(''); }} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Cancel</button>
              <button
                onClick={async () => {
                  if (!fullViewTmplName.trim()) return;
                  try {
                    await createTemplate({
                      name: fullViewTmplName.trim(),
                      title: habit.title || '',
                      description: habit.description || '',
                      priority: habit.priority || 'medium',
                      duration: Number(habit.duration) || 0,
                      startDate: habit.startDate || undefined,
                      startTime: habit.startTime || undefined,
                      dueDate: habit.dueDate || undefined,
                      dueTime: habit.dueTime || undefined,
                      projectId: habit.projectId ?? null,
                      columnId: habit.columnId || undefined,
                      labels: habit.labels || [],
                      subtasks: (habit.subtasks || []).map(st => ({ text: st.text, durationMinutes: st.durationMinutes || 0 })),
                      checklists: habit.checklists || [],
                    });
                    setFullViewSaveTmplOpen(false);
                    setFullViewTmplName('');
                  } catch (err) {
                    console.error('Failed to save template:', err);
                  }
                }}
                disabled={!fullViewTmplName.trim()}
                className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {fullViewLoadTmplOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setFullViewLoadTmplOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FolderKanban className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Load template</h2>
              </div>
              <button onClick={() => setFullViewLoadTmplOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {fullViewLoadTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                    <FolderKanban className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No templates yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Save a habit as a template first.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {fullViewLoadTemplates.map(tmpl => (
                    <div key={tmpl.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-muted/50 rounded-xl border border-transparent hover:border-border transition-all">
                      <button
                        onClick={() => {
                          setFullViewLoadTmplOpen(false);
                          onEditTemplate?.(tmpl);
                        }}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center flex-shrink-0">
                          <Star className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block truncate">{tmpl.name}</span>
                          {tmpl.title && <span className="text-xs text-muted-foreground truncate block">{tmpl.title}</span>}
                        </div>
                      </button>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                        <button
                          onClick={() => {
                            setFullViewLoadTmplOpen(false);
                            onEditTemplate?.(tmpl);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
                          title="Edit template"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Delete template "${tmpl.name}"?`)) return;
                            try {
                              await deleteTemplateApi(tmpl.id);
                              setFullViewLoadTemplates(await fetchTemplates());
                            } catch (err) {
                              console.error('Failed to delete template:', err);
                            }
                          }}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-all"
                          title="Delete template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end px-5 py-4 border-t border-border">
              <button onClick={() => setFullViewLoadTmplOpen(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Close</button>
            </div>
          </div>
        </div>
      )}

      {projectChangeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setProjectChangeConfirm(null)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-foreground">Move habit?</h3>
            <p className="text-xs text-muted-foreground mt-2">Changing the project will move this habit. Do you want to continue?</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setProjectChangeConfirm(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={() => {
                const { v } = projectChangeConfirm;
                const newProjectId = v === 'my-habits' ? null : Number(v);
                onUpdateHabit(habit.id, {
                  projectId: newProjectId,
                  projectName: v === 'my-habits' ? undefined : (projects.find(p => p.id === Number(v))?.name || undefined),
                });
                if (v === 'my-habits') {
                  onUpdateHabit(habit.id, { columnId: boardColumns[0]?.id || habit.columnId });
                } else if (newProjectId && (!habit.projectId || habit.projectId !== newProjectId)) {
                  const firstCol = boardColumns.filter(c => c.projectId === newProjectId).sort((a, b) => a.order - b.order)[0];
                  if (firstCol) onUpdateHabit(habit.id, { columnId: firstCol.id });
                }
                setProjectChangeConfirm(null);
              }} className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:opacity-90">Move</button>
            </div>
          </div>
        </div>
      )}

      {editingTmpl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setEditingTmpl(null)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Edit3 className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Edit template</h2>
              </div>
              <button onClick={() => setEditingTmpl(null)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Template name</label>
                <input value={editingTmplName} onChange={e => setEditingTmplName(e.target.value)} placeholder="Template name" className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Title</label>
                <input value={editingTmplTitle} onChange={e => setEditingTmplTitle(e.target.value)} placeholder="Habit title" className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Description</label>
                <textarea value={editingTmplDesc} onChange={e => setEditingTmplDesc(e.target.value)} placeholder="Habit description" rows={3} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Priority</label>
                  <select value={editingTmplPriority} onChange={e => setEditingTmplPriority(e.target.value)} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Duration (min)</label>
                  <input type="number" min={0} value={editingTmplDuration} onChange={e => setEditingTmplDuration(Math.max(0, Number(e.target.value) || 0))} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Start date</label>
                  <input type="date" value={editingTmplStartDate} onChange={e => setEditingTmplStartDate(e.target.value)} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all [color-scheme:var(--color-scheme)]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Start time</label>
                  <input type="time" value={editingTmplStartTime} onChange={e => setEditingTmplStartTime(e.target.value)} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Due date</label>
                  <input type="date" value={editingTmplDueDate} onChange={e => setEditingTmplDueDate(e.target.value)} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all [color-scheme:var(--color-scheme)]" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Due time</label>
                  <input type="time" value={editingTmplDueTime} onChange={e => setEditingTmplDueTime(e.target.value)} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={() => setEditingTmpl(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Cancel</button>
              <button
                onClick={async () => {
                  if (!editingTmpl || !editingTmplName.trim()) return;
                  try {
                    await updateTemplate(editingTmpl.id, {
                      name: editingTmplName,
                      title: editingTmplTitle,
                      description: editingTmplDesc,
                      priority: editingTmplPriority,
                      duration: editingTmplDuration,
                      startDate: editingTmplStartDate || undefined,
                      startTime: editingTmplStartTime || undefined,
                      dueDate: editingTmplDueDate || undefined,
                      dueTime: editingTmplDueTime || undefined,
                      labels: editingTmpl.labels,
                      subtasks: editingTmpl.subtasks,
                      checklists: editingTmpl.checklists,
                    });
                    const t = await fetchTemplates();
                    setFullViewTemplates(t);
                    setEditingTmpl(null);
                  } catch (err) {
                    console.error('Failed to update template:', err);
                  }
                }}
                disabled={!editingTmplName.trim()}
                className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
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

export default Habits;

