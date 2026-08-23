import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNotesContext } from '@/context/NotesContext';
import { useAuth } from '@/context/AuthContext';
import { Attachment, ChecklistItem, DEFAULT_LABELS, Label, LabelColor, Priority, PRIORITY_CONFIG, Subtask, Note, TaskStatus, TaskTemplate, LABEL_COLORS } from '@/types/board';
import { fetchTemplates, createTemplate, updateTemplate, deleteTemplate as deleteTemplateApi } from '@/services/taskTemplateService';
import { createTag, deleteTag, fetchTags, updateTag, type SharedTag } from '@/services/tagService';
import TagsModal from '@/components/shared/TagsModal';
import { fileToDataUrl as fileToDataUrlShared } from '@/lib/fileDataUrl';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Brain,
  Calendar,
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
  Trash2,
  Users,
  X,
  Zap,
} from 'lucide-react';

import { CircleToggle, SquareToggle } from '@/components/ToggleComponents';
import { useAnchoredPopup } from '@/hooks/useAnchoredPopup';
import { CompletedTaskRow } from '@/components/shared/CompletedTasks';
import { ArchivedRow } from '@/components/shared/ArchivedRow';
import { RichTextEditor } from '@/components/shared/RichTextEditor';
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

const isNoteCompleted = (note: Note) => Boolean(note.completed || note.status === 'completed');

const getTaskStatus = (note: Note): TaskStatus => {
  if (note.status) return note.status;
  return note.completed ? 'completed' : 'to_do';
};

const getStatusLabel = (status: TaskStatus) =>
  STATUS_OPTIONS.find(o => o.value === status)?.label || 'To Do';

const fileToDataUrl = (file: File): Promise<string> => fileToDataUrlShared(file);

const imageToDataUrl = (file: File): Promise<string> => fileToDataUrlShared(file);

type DueWarningLevel = null | 'soon' | 'imminent' | 'overdue';

const getDueTimeWarning = (note: Note): DueWarningLevel => {
  if (!note.dueDate || isNoteCompleted(note)) return null;
  const due = note.dueTime
    ? new Date(`${note.dueDate}T${note.dueTime}`)
    : new Date(`${note.dueDate}T23:59:59`);
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

interface AIGeneratedNote {
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
  note: Note;
  onUpdate: (priority: Priority) => void;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ note, onUpdate, isOpen, onToggle }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onToggle(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onToggle]);
  const pc = PRIORITY_COLORS[note.priority];
  return (
    <div className="relative flex-shrink-0 flex items-center" ref={ref}>
      {note.priority !== 'none' ? (
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
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs rounded-lg transition-all ${note.priority === p ? 'bg-primary/10 font-bold' : 'hover:bg-muted'}`}
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
          <h3 className="text-sm font-bold text-foreground">Delete {count} note{count === 1 ? '' : 's'}?</h3>
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
          Delete {count} note{count === 1 ? '' : 's'}
        </button>
      </div>
    </div>
  </div>
);

const Notes: React.FC = () => {
  const {
    board,
    addTask,
    updateTask,
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
    deleteTask,
    updateColumn,
  } = useNotesContext();
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
    try { const v = localStorage.getItem('notes-expanded-ids'); return v ? JSON.parse(v) : []; } catch { return []; }
  });

  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'high' | 'medium' | 'low'>('all');
  const [groupFilterId, setGroupFilterId] = useState<string | null>(null);
  const [sortByDueDate, setSortByDueDate] = useState(false);
  const [sortDueDateDesc, setSortDueDateDesc] = useState(false);

  const [addingNote, setAddingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteDescription, setNewNoteDescription] = useState('');
  const [newNotePriority, setNewNotePriority] = useState<Priority>('medium');
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('to_do');
  const [newNoteStartDate, setNewNoteStartDate] = useState('');
  const [newNoteStartTime, setNewNoteStartTime] = useState('');
  const [newNoteDueDate, setNewNoteDueDate] = useState('');
  const [newNoteDueTime, setNewNoteDueTime] = useState('');
  const [newNoteDuration, setNewNoteDuration] = useState<number>(60);
  const [newNoteColumnId, setNewNoteColumnId] = useState<string>('');
  const [newNoteProjectId, setNewNoteProjectId] = useState<number | ''>('');

  // "Add New" from the Projects page: ?new=1&project=<id> opens the create modal
  // with the project pre-selected so the new note is assigned to it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('new') === '1') {
      const pid = params.get('project');
      setNewNoteProjectId(pid ? Number(pid) : '');
      setAddingNote(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [newChecklistItems, setNewChecklistItems] = useState<{id: string; text: string}[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newChecklistLists, setNewChecklistLists] = useState<{id: string; title: string; items: {id: string; text: string; completed: boolean}[]}[]>([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [perChecklistInput, setPerChecklistInput] = useState<Record<string, string>>({});
  const [collapsedDraftChecklists, setCollapsedDraftChecklists] = useState<Set<string>>(new Set());
  const [editingDraftChecklistId, setEditingDraftChecklistId] = useState<string | null>(null);
  const [editingDraftChecklistTitle, setEditingDraftChecklistTitle] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newNoteImages, setNewNoteImages] = useState<Attachment[]>([]);
  const [newNoteLabels, setNewNoteLabels] = useState<Label[]>([]);
  const [newTagPickerOpen, setNewTagPickerOpen] = useState(false);
  const [pendingDragMove, setPendingDragMove] = useState<{ taskId: string; srcDroppableId: string; dstDroppableId: string; srcIndex: number; dstIndex: number; dstProject: number | 'my-notes' | null; moveType: 'column' | 'project' } | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const [editingDraftChecklistIndex, setEditingDraftChecklistIndex] = useState<number | null>(null);
  const [editingDraftChecklistText, setEditingDraftChecklistText] = useState('');

  // Creation modal section collapse states
  const [draftChecklistCollapsed, setDraftChecklistCollapsed] = useState(false);
  const [draftAttachmentsCollapsed, setDraftAttachmentsCollapsed] = useState(false);
  const [draftImagesCollapsed, setDraftImagesCollapsed] = useState(false);

  const [myNotesCollapsed, setMyNotesCollapsed] = useState(false);
  const [columnEditId, setColumnEditId] = useState<string | null>(null);
  const { open: openColumnEdit, close: closeColumnEdit, pos: columnEditPos } = useAnchoredPopup();
  const [columnEditName, setColumnEditName] = useState('');
  const [columnEditColor, setColumnEditColor] = useState('');
  const [columnEditIcon, setColumnEditIcon] = useState('');
  const COLUMN_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f43f5e'];
  const [collapsedProjects, setCollapsedProjects] = useState<number[]>(() => {
    try { const v = localStorage.getItem('notes-collapsed-projects'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [collapsedColumns, setCollapsedColumns] = useState<string[]>(() => {
    try { const v = localStorage.getItem('notes-collapsed-columns'); return v ? JSON.parse(v) : []; } catch { return []; }
  });

  useEffect(() => { localStorage.setItem('notes-collapsed-projects', JSON.stringify(collapsedProjects)); }, [collapsedProjects]);
  useEffect(() => { localStorage.setItem('notes-collapsed-columns', JSON.stringify(collapsedColumns)); }, [collapsedColumns]);
  useEffect(() => { localStorage.setItem('notes-expanded-ids', JSON.stringify(expandedTaskIds)); }, [expandedTaskIds]);
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
  const [templateEditOverrides, setTemplateEditOverrides] = useState<Partial<Note> | null>(null);
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
    board.tasks.forEach(note => note.labels.forEach(label => {
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

  const filteredNotesByBase = useMemo(() => {
    return board.tasks.filter(note => {
      const matchesSearch = note.title.toLowerCase().includes(search.toLowerCase().trim());
      const matchesPriority = priorityFilter === 'all' ? true : note.priority === priorityFilter;
      const matchesProject = projectFilterId === 'all' ? true : note.projectId === projectFilterId;
      const matchesTags = tagFilterIds.length === 0
        ? true
        : tagFilterIds.every(tagId => note.labels.some(label => label.id === tagId));
      return matchesSearch && matchesPriority && matchesProject && matchesTags;
    });
  }, [board.tasks, priorityFilter, projectFilterId, search, tagFilterIds]);

  const filtered = useMemo(() => {
    const byGroup = filteredNotesByBase.filter(note =>
      !groupFilterId ? true : note.columnId === groupFilterId
    );

    const active = byGroup.filter(note => !isNoteCompleted(note) && !note.archived);
    const completed = byGroup.filter(note => isNoteCompleted(note) && !note.archived);
    const archived = byGroup.filter(note => note.archived);

    const sortByDue = (a: Note, b: Note) => {
      const aDate = a.dueDate ? new Date(`${a.dueDate}T${a.dueTime || '23:59'}`) : null;
      const bDate = b.dueDate ? new Date(`${b.dueDate}T${b.dueTime || '23:59'}`) : null;
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      const diff = aDate.getTime() - bDate.getTime();
      return sortDueDateDesc ? -diff : diff;
    };

    const sortByPriorityOrder = (a: Note, b: Note) => {
      const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      const diff = (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
      if (diff !== 0) return diff;
      return (a.order || 0) - (b.order || 0);
    };

    let activeSorted: Note[];
    if (sortByDueDate) {
      activeSorted = [...active].sort(sortByDue);
    } else if (orderedActiveIds.length > 0) {
      const idSet = new Set(active.map(t => t.id));
      const ordered = orderedActiveIds.filter(id => idSet.has(id));
      const unordered = active.filter(t => !orderedActiveIds.includes(t.id));
      const orderedNotes = ordered.map(id => active.find(t => t.id === id)!).filter(Boolean);
      activeSorted = [...orderedNotes, ...unordered];
    } else {
      activeSorted = [...active].sort(sortByPriorityOrder);
    }

    const completedSorted = [...completed].sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
      return bTime - aTime;
    });

    const archivedSorted = [...archived].sort((a, b) => (a.order || 0) - (b.order || 0));

    return { active: activeSorted, completed: completedSorted, archived: archivedSorted };
  }, [filteredNotesByBase, groupFilterId, sortByDueDate, sortDueDateDesc, orderedActiveIds]);

  const myNotesGroup = useMemo(() =>
    filtered.active.filter(t => !t.projectId),
    [filtered.active]
  );

  const projectNoteGroups = useMemo(() => {
    return projects.map(project => {
      const notes = filtered.active.filter(t => t.projectId === project.id);
      if (notes.length === 0) return null;
      const columns = board.columns
        .filter(col => (col as any).projectId === project.id)
        .sort((a, b) => a.order - b.order);
      const columnGroups = columns.map(col => ({
        column: col,
        notes: notes.filter(t => t.columnId === col.id).sort((a, b) => (a.order || 0) - (b.order || 0)),
      })).filter(cg => cg.notes.length > 0);
      const columnIds = new Set(columns.map(c => c.id));
      const uncategorized = notes.filter(t => !columnIds.has(t.columnId));
      return { project, notes, columnGroups, uncategorized };
    }).filter(Boolean) as Array<{ project: ProjectMeta; notes: Note[]; columnGroups: Array<{ column: any; notes: Note[] }>; uncategorized: Note[] }>;
  }, [filtered.active, projects, board.columns]);

  const matchingCount = filtered.active.length + filtered.completed.length + filtered.archived.length;
  const openNote = openTaskId ? board.tasks.find(note => note.id === openTaskId) ?? null : null;

  const templateEditNote = useMemo(() => {
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
    return (templateEditOverrides ? { ...base, ...templateEditOverrides } : base) as unknown as Note;
  }, [editingTemplateMeta, templateEditOverrides]);

  const handleEditTemplate = useCallback((template: TaskTemplate) => {
    setTemplateEditOverrides(null);
    setTemplateEditName(template.name);
    setEditingTemplateMeta({ id: template.id, name: template.name, template });
  }, []);

  const wrappedUpdateNote = useCallback((taskId: string, updates: Partial<Note>) => {
    if (taskId.startsWith('template-edit-')) {
      setTemplateEditOverrides(prev => ({ ...prev, ...updates } as Partial<Note>));
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
        checklists: (edited.checklists ?? editingTemplateMeta.template.checklists) || [],
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

  const getProjectIdForDroppable = (id: string): number | 'my-notes' | null => {
    if (id === 'my-notes') return 'my-notes';
    if (id.startsWith('col-')) {
      const col = board.columns.find(c => c.id === id.slice(4));
      return col?.projectId ?? null;
    }
    if (id.startsWith('uncat-')) return Number(id.slice(6));
    return null;
  };

  const getNotesForDroppable = (id: string): Note[] | null => {
    if (id === 'my-notes') return myNotesGroup;
    if (id.startsWith('col-')) {
      const colGroup = projectNoteGroups.flatMap(pg => pg.columnGroups).find(cg => cg.column.id === id.slice(4));
      return colGroup?.notes ?? null;
    }
    if (id.startsWith('uncat-')) {
      const pg = projectNoteGroups.find(p => p.project.id === Number(id.slice(6)));
      return pg?.uncategorized ?? null;
    }
    return null;
  };

  const applyDragMoveDirect = (srcDroppableId: string, dstDroppableId: string, srcIndex: number, dstIndex: number, dstProject: number | 'my-notes' | null) => {
    const srcNotes = getNotesForDroppable(srcDroppableId);
    const dstNotes = getNotesForDroppable(dstDroppableId);
    if (!srcNotes || !dstNotes) return;
    if (srcNotes.length <= srcIndex || dstNotes.length < dstIndex) return;

    const movingTaskId = srcNotes[srcIndex]?.id;
    if (!movingTaskId) return;

    const newColumnId = dstDroppableId.startsWith('col-') ? dstDroppableId.slice(4) : undefined;
    const updateFields: Record<string, any> = {};
    if (newColumnId) updateFields.columnId = newColumnId;
    if (dstProject === 'my-notes') {
      updateFields.projectId = null;
    } else if (typeof dstProject === 'number') {
      updateFields.projectId = dstProject;
    }
    if (Object.keys(updateFields).length > 0) updateTask(movingTaskId, updateFields);

    const srcIds = srcNotes.map(t => t.id);
    const dstIds = dstNotes.map(t => t.id);
    const [removed] = srcIds.splice(srcIndex, 1);
    dstIds.splice(dstIndex, 0, removed);
    srcIds.forEach((id, idx) => updateTask(id, { order: idx }));
    dstIds.forEach((id, idx) => updateTask(id, { order: idx }));

    const base = orderedActiveIds.length > 0 ? [...orderedActiveIds] : filtered.active.map(t => t.id);
    const srcSet = new Set(srcNotes.map(t => t.id));
    const dstSet = new Set(dstNotes.map(t => t.id));
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
      if (localStorage.getItem('notes-drag-confirm-project') === 'true') {
        applyDragMoveDirect(result.source.droppableId, result.destination.droppableId, result.source.index, result.destination.index, dstProject);
        return;
      }
      const srcNotes = getNotesForDroppable(srcId);
      if (!srcNotes) return;
      const movingTaskId = srcNotes[result.source.index]?.id;
      if (!movingTaskId) return;
      setPendingDragMove({ taskId: movingTaskId, srcDroppableId: srcId, dstDroppableId: dstId, srcIndex: result.source.index, dstIndex: result.destination.index, dstProject, moveType: 'project' });
      return;
    }

    if (isCrossColumn) {
      if (localStorage.getItem('notes-drag-confirm-column') === 'true') {
        applyDragMoveDirect(result.source.droppableId, result.destination.droppableId, result.source.index, result.destination.index, dstProject);
        return;
      }
      const srcNotes = getNotesForDroppable(srcId);
      const dstNotes = getNotesForDroppable(dstId);
      if (!srcNotes || !dstNotes) return;

      const movingTaskId = srcNotes[result.source.index]?.id;
      if (!movingTaskId) return;
      setPendingDragMove({ taskId: movingTaskId, srcDroppableId: srcId, dstDroppableId: dstId, srcIndex: result.source.index, dstIndex: result.destination.index, dstProject, moveType: 'column' });
      return;

      const srcIds = srcNotes.map(t => t.id);
      const dstIds = dstNotes.map(t => t.id);
      const [removed] = srcIds.splice(result.source.index, 1);
      dstIds.splice(result.destination.index, 0, removed);

      srcIds.forEach((id, idx) => updateTask(id, { order: idx }));
      dstIds.forEach((id, idx) => updateTask(id, { order: idx }));

      const base = orderedActiveIds.length > 0 ? [...orderedActiveIds] : filtered.active.map(t => t.id);
      const srcSet = new Set(srcNotes.map(t => t.id));
      const dstSet = new Set(dstNotes.map(t => t.id));
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
      const sectionNotes = getNotesForDroppable(srcId);
      if (!sectionNotes) return;

      const sectionTaskIds = sectionNotes.map(t => t.id);
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

  const runNoteAnalysis = useCallback((type: AnalysisTab) => {
    setActiveAnalysisTab(type);
    setAnalysisLoading(true);
    const scope = [...filtered.active, ...filtered.completed];
    const activeScope = scope.filter(note => !isNoteCompleted(note));
    const now = new Date();
    let result: AnalysisResult;

    if (type === 'overview') {
      const completedCount = scope.filter(t => isNoteCompleted(t)).length;
      const reviewCount = scope.filter(t => getTaskStatus(t) === 'review').length;
      const withSubtasks = scope.filter(t => (t.subtasks || []).length > 0).length;
      const withChecklist = scope.filter(t => t.checklists.some(cl => cl.items.length > 0)).length;
      result = {
        title: 'Note Overview',
        summary: `${scope.length} notes in current view`,
        lines: [
          { text: `${activeScope.length} active` },
          { text: `${completedCount} completed` },
          { text: `${reviewCount} in review` },
          { text: `${withSubtasks} with sub-notes` },
          { text: `${withChecklist} with checklist items` },
        ],
      };
    } else if (type === 'duration') {
      const mismatches = activeScope
        .map(note => {
          const estimated = Math.max(0, Number(note.duration) || 0);
          const subtaskTotal = (note.subtasks || []).reduce((s, st) => s + Math.max(0, Number(st.durationMinutes) || 0), 0);
          return { note, estimated, subtaskTotal };
        })
        .filter(item => item.estimated > 0 && item.estimated !== item.subtaskTotal)
        .slice(0, 8);
      result = {
        title: 'Duration Check',
        summary: mismatches.length === 0 ? 'All notes match estimated duration.' : `${mismatches.length} notes need review`,
        lines: mismatches.length === 0
          ? [{ text: 'No mismatches found.' }]
          : mismatches.map(item => ({
              text: `${item.note.title}: ${item.estimated} min estimated vs ${item.subtaskTotal} min in sub-notes`,
              taskId: item.note.id,
            })),
      };
    } else if (type === 'deadlines') {
      const deadlines = activeScope
        .filter(t => !!t.dueDate)
        .map(t => ({ note: t, due: new Date(`${t.dueDate}T${t.dueTime || '23:59'}`) }))
        .filter(item => !Number.isNaN(item.due.getTime()))
        .sort((a, b) => a.due.getTime() - b.due.getTime())
        .slice(0, 8);
      result = {
        title: 'Deadline Risk',
        summary: deadlines.length === 0 ? 'No due dates in current view.' : 'Closest deadlines first',
        lines: deadlines.length === 0
          ? [{ text: 'Add due dates to get deadline analysis.' }]
          : deadlines.map(item => ({
              text: `${item.note.title}: ${item.due.getTime() < now.getTime() ? 'Overdue' : formatDate(item.note.dueDate)} (${getStatusLabel(getTaskStatus(item.note))})`,
              taskId: item.note.id,
            })),
      };
    } else {
      const candidates = activeScope
        .map(note => {
          const pw = ({ urgent: 4, high: 3, medium: 2, low: 1, none: 0 } as Record<string, number>)[note.priority] ?? 0;
          const dw = note.dueDate ? Math.max(0, 100000000000 - new Date(`${note.dueDate}T${note.dueTime || '23:59'}`).getTime()) : 0;
          const ct = note.checklists.reduce((s, l) => s + l.items.length, 0);
          const cd = note.checklists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
          const penalty = ct > 0 ? cd / ct : 0;
          return { note, score: pw * 100 + dw / 1e9 - penalty * 10 };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      result = {
        title: 'Focus Suggestions',
        summary: candidates.length === 0 ? 'No active notes to analyze.' : 'Suggested notes to tackle next',
        lines: candidates.length === 0
          ? [{ text: 'Create active notes to get suggestions.' }]
          : candidates.map(item => ({
              text: `${item.note.title} — ${getStatusLabel(getTaskStatus(item.note))}, ${item.note.priority}`,
              taskId: item.note.id,
            })),
      };
    }

    setTimeout(() => {
      setAnalysisResult(result);
      setAnalysisLoading(false);
    }, 200);
  }, [filtered]);

  const toggleNoteCompletion = (note: Note) => {
    if (isNoteCompleted(note)) {
      updateTask(note.id, { completed: false, completedAt: undefined, status: 'to_do' });
    } else {
      updateTask(note.id, { completed: true, completedAt: new Date().toISOString(), status: 'completed' });
    }
  };

  const toggleExpand = (taskId: string) => {
    setExpandedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
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
    if (result.source.droppableId === 'draft-checklist') {
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

  const resetNoteDraft = () => {
    setNewNoteTitle('');
    setNewNoteDescription('');
    setNewNotePriority('medium');
    setNewTaskStatus('to_do');
    setNewNoteStartDate('');
    setNewNoteStartTime('');
    setNewNoteDueDate('');
    setNewNoteDueTime('');
    setNewNoteDuration(60);
    setNewNoteColumnId('');
    setNewNoteProjectId('');
    setNewChecklistItems([]);
    setNewChecklistText('');
    setNewChecklistLists([]);
    setNewChecklistTitle('');
    setPerChecklistInput({});
    setCollapsedDraftChecklists(new Set());
    setNewFiles([]);
    setNewNoteLabels([]);
    setNewNoteImages([]);
  };

  const createNote = async () => {
    if (!newNoteTitle.trim()) return;
    const targetColumnId = newNoteColumnId || board.columns[0]?.id;
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

    addTask(targetColumnId, newNoteTitle.trim(), {
      id: taskId,
      description: newNoteDescription,
      status: 'to_do',
      priority: newNotePriority,
      duration: Math.max(0, Number(newNoteDuration) || 0),
      startDate: newNoteStartDate || undefined,
      startTime: newNoteStartTime || undefined,
      dueDate: newNoteDueDate || undefined,
      dueTime: newNoteDueTime || undefined,
      projectId: newNoteProjectId === '' ? null : Number(newNoteProjectId),
      projectName: newNoteProjectId === '' ? undefined : (projects.find(project => project.id === Number(newNoteProjectId))?.name || undefined),
      labels: newNoteLabels,
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
      images: newNoteImages,
      completed: false,
      completedAt: undefined,
    });

    resetNoteDraft();
    setAddingNote(false);
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

  const generateAINote = async () => {
    if (!aiBuilderInput.trim()) return;
    setAiBuilderLoading(true);
    setAiBuilderError('');
    try {
      const res = await fetch('/api/ai/note-builder', {
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
        throw new Error(err.error || 'Failed to generate note');
      }
      const data: AIGeneratedNote = await res.json();

      setNewNoteTitle(data.title || '');
      setNewNoteDescription(data.description || '');
      setNewNotePriority((data.priority as Priority) || 'medium');
      setNewTaskStatus((data.status as TaskStatus) || 'to_do');
      setNewNoteStartDate(data.startDate || '');
      setNewNoteStartTime(data.startTime || '');
      setNewNoteDueDate(data.dueDate || '');
      setNewNoteDueTime(data.dueTime || '');
      setNewNoteDuration(data.duration || 60);

      if (data.group) {
        const matchedCol = board.columns.find(c =>
          c.title.toLowerCase() === data.group!.toLowerCase()
        );
        if (matchedCol) setNewNoteColumnId(matchedCol.id);
      }

      setNewChecklistItems((data.checklistItems || []).map(text => ({ id: crypto.randomUUID(), text })));

      if (data.tags && data.tags.length > 0) {
        const matched = data.tags.map(tagName =>
          allTags.find(t => t.name.toLowerCase() === tagName.toLowerCase())
        ).filter(Boolean) as Label[];
        setNewNoteLabels(matched);
      }

      setAiBuilderOpen(false);
      setAiBuilderInput('');
      setAddingNote(true);
    } catch (err: any) {
      setAiBuilderError(err.message || 'Something went wrong');
    } finally {
      setAiBuilderLoading(false);
    }
  };

  const openQuickEdit = (note: Note, field: 'duration' | 'project') => {
    setQuickEditTaskId(note.id);
    setQuickEditField(field);
    setQuickEditStatus(getTaskStatus(note));
    setQuickEditDuration(Math.max(0, Number(note.duration) || 0));
    setQuickEditProjectId(note.projectId || '');
  };

  const closeQuickEdit = () => {
    setQuickEditTaskId(null);
    setQuickEditField(null);
  };

  const applyQuickEdit = (note: Note) => {
    const updates: Partial<Note> = {};
    if (quickEditField === 'duration') {
      updates.duration = Math.max(0, Number(quickEditDuration) || 0);
    }
    if (quickEditField === 'project') {
      updates.projectId = quickEditProjectId === '' ? null : Number(quickEditProjectId);
      updates.projectName = quickEditProjectId === ''
        ? undefined
        : (projects.find(project => project.id === Number(quickEditProjectId))?.name || undefined);
    }
    updateTask(note.id, updates);
    closeQuickEdit();
  };

  const toggleNoteTag = (taskId: string, label: Label) => {
    const note = board.tasks.find(item => item.id === taskId);
    if (!note) return;
    
    const has = note.labels.some(item => item.id === label.id);
    const nextLabels = has
      ? note.labels.filter(item => item.id !== label.id)
      : [...note.labels, label];
    updateTask(taskId, { labels: nextLabels });
  };

  const createSharedNoteLabel = async (name: string, color: LabelColor): Promise<Label> => {
    const tag = await createTag({ name, color });
    return sharedTagToLabel(tag);
  };

  const createNoteTag = async (taskId: string) => {
    const note = board.tasks.find(item => item.id === taskId);
    if (!note) return;

    const name = normalizeTagName(newTagName);
    if (!name) return;

    try {
      const newLabel = await createSharedNoteLabel(name, newTagColor);
      updateTask(taskId, { labels: [...note.labels, newLabel] });
      setNewTagName('');
      setNewTagColor(randomTagColor());
      setTagPickerOpen(false);
    } catch (error) {
      console.error('Failed to create note tag:', error);
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

    board.tasks.forEach(note => {
      if (note.labels.some(label => label.id === tagId)) {
        updateTask(note.id, { labels: note.labels.filter(label => label.id !== tagId) });
      }
    });
    setTagFilterIds(prev => prev.filter(id => id !== tagId));
  };

  const renameTagEverywhere = async (tagId: string, newName: string) => {
    const name = normalizeTagName(newName);
    if (!name) return;

    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          const updated = await updateTag(sharedTagId, { name });
          setSharedTags(prev => prev.map(tag => tag.id === sharedTagId ? { ...tag, name: updated.name } : tag));
        } catch (error) {
          console.error('Failed to rename shared tag:', error);
          return;
        }
      }
    }

    board.tasks.forEach(note => {
      if (note.labels.some(label => label.id === tagId)) {
        updateTask(note.id, { labels: note.labels.map(label => label.id === tagId ? { ...label, name } : label) });
      }
    });
  };

  const changeTagColorEverywhere = async (tagId: string, color: LabelColor) => {
    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          const updated = await updateTag(sharedTagId, { color });
          setSharedTags(prev => prev.map(tag => tag.id === sharedTagId ? { ...tag, color: updated.color } : tag));
        } catch (error) {
          console.error('Failed to update tag color:', error);
          return;
        }
      }
    }

    board.tasks.forEach(note => {
      if (note.labels.some(label => label.id === tagId)) {
        updateTask(note.id, { labels: note.labels.map(label => label.id === tagId ? { ...label, color } : label) });
      }
    });
  };

  const toggleTagFilter = (tagId: string) => {
    setTagFilterIds(prev => prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]);
  };

  const renderNoteRow = (note: Note, dragHandleProps?: any, isDragging?: boolean) => {
    const isExpanded = expandedTaskIds.includes(note.id);
    const checklistTotal = note.checklists.reduce((s, l) => s + l.items.length, 0);
    const checklistDone = note.checklists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
    const noteDurFmt = formatDuration(note.duration || 0);
    const noteTags = note.labels.slice(0, 3);
    const noteSnippet = (note.description || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90);
    return (
      <div
        key={note.id}
        onClick={() => {
          if (isDeleteMode) {
            setSelectedDeleteTaskIds(prev =>
              prev.includes(note.id) ? prev.filter(id => id !== note.id) : [...prev, note.id]
            );
          } else {
            setOpenTaskId(note.id);
          }
        }}
        className={`group border rounded-xl bg-card transition-all duration-200 cursor-pointer ${
          isDeleteMode
            ? selectedDeleteTaskIds.includes(note.id)
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
              checked={selectedDeleteTaskIds.includes(note.id)}
              onChange={() => {
                setSelectedDeleteTaskIds(prev =>
                  prev.includes(note.id) ? prev.filter(id => id !== note.id) : [...prev, note.id]
                );
              }}
              onClick={e => e.stopPropagation()}
              className="w-4 h-4 rounded border-border accent-destructive flex-shrink-0 cursor-pointer"
            />
          ) : null}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={e => { if (!isDeleteMode) { e.stopPropagation(); setOpenTaskId(note.id); } }}>
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Note</span>
            <span className="text-sm font-medium text-foreground truncate block">{note.title}</span>

            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {(note.priority !== 'none' || priorityEditTaskId === note.id) && (
                <PriorityBadge
                  note={note}
                  onUpdate={(priority) => updateTask(note.id, { priority })}
                  isOpen={priorityEditTaskId === note.id}
                  onToggle={() => setPriorityEditTaskId(priorityEditTaskId === note.id ? null : note.id)}
                />
              )}
              {noteDurFmt && (
                <button
                  onClick={e => { e.stopPropagation(); openQuickEdit(note, 'duration'); }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0"
                >
                  {noteDurFmt}
                </button>
              )}
              <button
                onClick={e => {
                  e.stopPropagation();
                  setDateEditTaskId(dateEditTaskId === note.id && dateEditField === 'start' ? null : note.id);
                  setDateEditField(prev => prev === 'start' ? null : 'start');
                }}
                className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 bg-muted text-muted-foreground"
              >
                <Calendar className="w-2.5 h-2.5" />
                {note.startDate ? `${formatDate(note.startDate)}${note.startTime ? ` ${note.startTime}` : ''}` : 'Add start date'}
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  setDateEditTaskId(dateEditTaskId === note.id && dateEditField === 'due' ? null : note.id);
                  setDateEditField(prev => prev === 'due' ? null : 'due');
                }}
                className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 ${
                  note.dueDate
                    ? (() => {
                        const warning = getDueTimeWarning(note);
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
                {note.dueDate ? `${formatDate(note.dueDate)}${note.dueTime ? ` ${note.dueTime}` : ''}` : 'Add due date'}
              </button>
              {checklistTotal > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                  {checklistDone}/{checklistTotal} checklist
                </span>
              )}
              <button
                onClick={e => { e.stopPropagation(); setTagPopupTaskId(tagPopupTaskId === note.id ? null : note.id); }}
                className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 bg-muted text-muted-foreground flex items-center gap-1"
              >
                <Tag className="w-2.5 h-2.5" />
                Tags
              </button>
              {noteTags.map(label => (
                <button
                  key={label.id}
                  onClick={e => { e.stopPropagation(); setTagPopupTaskId(tagPopupTaskId === note.id ? null : note.id); }}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${LABEL_COLORS[label.color]} text-primary-foreground`}
                >
                  {label.name}
                </button>
              ))}
              {note.labels.length > noteTags.length && (
                <button
                  onClick={e => { e.stopPropagation(); setTagPopupTaskId(tagPopupTaskId === note.id ? null : note.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0"
                >
                  +{note.labels.length - noteTags.length}
                </button>
              )}
            </div>
          </div>
          {!isDeleteMode && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={e => { e.stopPropagation(); toggleExpand(note.id); }}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

            </div>
          )}
        </div>
        {quickEditTaskId === note.id && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 bg-muted/20 rounded-b-xl">
            <div className="flex flex-wrap items-center gap-2">
              {quickEditField === 'duration' && (
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={quickEditDuration} onChange={e => setQuickEditDuration(Math.max(0, Number(e.target.value) || 0))} onBlur={() => applyQuickEdit(note)} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <span className="text-xs text-muted-foreground">minutes</span>
                </div>
              )}
              {quickEditField === 'project' && (
                <Select value={quickEditProjectId === '' ? 'my-notes' : String(quickEditProjectId)} onValueChange={val => setQuickEditProjectId(val === 'my-notes' ? '' : Number(val))}>
                  <SelectTrigger className="w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm h-9">
                    <SelectValue placeholder="My Notes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="my-notes">My Notes</SelectItem>
                    {projects.map(project => (<SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              )}
              <button onClick={() => applyQuickEdit(note)} className="ml-auto rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Save</button>
              <button onClick={closeQuickEdit} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">Cancel</button>
            </div>
          </div>
        )}
        {dateEditTaskId === note.id && dateEditField && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 bg-muted/20 rounded-b-xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  value={dateEditField === 'start' ? (note.startDate || '') : (note.dueDate || '')}
                  onChange={e => {
                    const val = e.target.value || undefined;
                    updateTask(note.id, dateEditField === 'start' ? { startDate: val } : { dueDate: val });
                  }}
                  className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-sm [color-scheme:var(--color-scheme)]"
                />
              </div>
              <div className="relative w-[140px]">
                <Clock3 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="time"
                  value={dateEditField === 'start' ? (note.startTime || '') : (note.dueTime || '')}
                  onChange={e => {
                    const val = e.target.value || undefined;
                    updateTask(note.id, dateEditField === 'start' ? { startTime: val } : { dueTime: val });
                  }}
                  className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-sm [color-scheme:var(--color-scheme)]"
                />
              </div>
              {((dateEditField === 'start' && note.startDate) || (dateEditField === 'due' && note.dueDate)) && (
                <button
                  onClick={() => {
                    updateTask(note.id, dateEditField === 'start' ? { startDate: undefined, startTime: undefined } : { dueDate: undefined, dueTime: undefined });
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
            <NoteDropdownExpanded
              note={note}
              onUpdateNote={updateTask}
              onToggleChecklistItem={toggleChecklistItem}
              onAddChecklistItem={addChecklistItem}
              onDeleteChecklistItem={deleteChecklistItem}
              isPremium={isPremium}
              isPro={isPro}
            />
            <div className="flex justify-end gap-1.5 pt-1">
              <button
                onClick={e => { e.stopPropagation(); updateTask(note.id, { archived: true }); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded-lg transition-all"
                title="Archive this note"
              >
                <Archive className="w-3.5 h-3.5" />
                Archive
              </button>
              <button
                onClick={e => { e.stopPropagation(); setSingleDeleteTaskId(note.id); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Note
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 h-16 border-b border-border flex items-center justify-between bg-card/30">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="text-base font-bold text-foreground whitespace-nowrap">All Notes</h1>
          <p className="text-xs text-muted-foreground truncate">{matchingCount} notes matching filters</p>
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
            onClick={() => setAddingNote(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Note
          </button>
        </div>
      </header>

      <div className="px-6 py-4 border-b border-border bg-card/10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search notes..."
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
              <TagsModal
                open={tagPickerOpen}
                onClose={() => setTagPickerOpen(false)}
                title="Filter by tags"
                tags={allTags}
                selectedIds={tagFilterIds}
                onToggle={toggleTagFilter}
                onCreate={async (name, color) => { await createSharedNoteLabel(name, color); }}
                onDelete={deleteTagEverywhere}
                onRename={renameTagEverywhere}
                onColorChange={changeTagColorEverywhere}
                emptyText="No tags yet. Create one below."
              />
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
              onClick={() => { setAnalysisPanelOpen(true); runNoteAnalysis(activeAnalysisTab); }}
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 transition-all"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Note Analysis
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 relative">
        <DragDropContext onDragEnd={handleDragEnd}>
        <div className="max-w-5xl mx-auto space-y-2 pb-24">
          {myNotesGroup.length === 0 && projectNoteGroups.length === 0 && filtered.completed.length === 0 && filtered.archived.length === 0 && (
            <div className="text-center py-16">
              <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No notes found</p>
            </div>
          )}

          {/* MY NOTES section */}
          {myNotesGroup.length > 0 && (
            <div className="mb-3">
              <button
                onClick={() => setMyNotesCollapsed(prev => !prev)}
                className="flex items-center gap-2 w-full px-2 py-2 text-left hover:bg-muted/30 rounded-lg transition-all mb-1"
              >
                {myNotesCollapsed
                  ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
                <span className="text-xs font-bold tracking-wider text-muted-foreground">My Notes</span>
                <span className="text-[10px] text-muted-foreground/50 ml-1">({myNotesGroup.length})</span>
              </button>
              {!myNotesCollapsed && (
                <Droppable droppableId="my-notes">
                  {(dropProvided, snapshot) => (
                    <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="space-y-1.5">
                      {myNotesGroup.map((note, index) => (
                        <Draggable key={note.id} draggableId={note.id} index={index}>
                          {(noteProvided, noteSnapshot) => (
                            <div ref={noteProvided.innerRef} {...noteProvided.draggableProps}>
                              {renderNoteRow(note, noteProvided.dragHandleProps, noteSnapshot.isDragging)}
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

          {myNotesGroup.length > 0 && projectNoteGroups.length > 0 && <div className="w-full h-0.5 bg-border/40 my-4" />}

          {/* Project sections */}
          {projectNoteGroups.map(({ project, notes, columnGroups, uncategorized }, idx) => {
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
                  <span className="text-[10px] text-muted-foreground/50 ml-1">({notes.length})</span>
                </button>
                {!isProjectCollapsed && (
                  <div className="pl-4 space-y-2">
                    {columnGroups.map(({ column, notes: colNotes }, colIdx) => {
                      const isColumnCollapsed = collapsedColumns.includes(column.id);
                      return (
                        <div key={column.id}>
                          <div className="column-header-row flex items-center gap-1 w-full px-1 py-1.5 mb-1 group">
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
                              onClick={(e) => { openColumnEdit(e.currentTarget.closest('.column-header-row') as HTMLElement); setColumnEditId(column.id); setColumnEditName(column.title); setColumnEditColor(column.color); setColumnEditIcon(column.icon || ''); }}
                              className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-muted/30 transition-all text-left"
                            >
                              <span className="text-[11px] font-semibold tracking-widest text-muted-foreground/80">{column.title}</span>
                              <span className="text-[10px] text-muted-foreground/40">({colNotes.length})</span>
                            </button>
                          </div>
                          {!isColumnCollapsed && (
                            <Droppable droppableId={"col-" + column.id}>
                              {(dropProvided, snapshot) => (
                                <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="pl-3 space-y-1.5">
                                  {colNotes.map((note, index) => (
                                    <Draggable key={note.id} draggableId={note.id} index={index}>
                                      {(noteProvided, noteSnapshot) => (
                                        <div ref={noteProvided.innerRef} {...noteProvided.draggableProps}>
                                          {renderNoteRow(note, noteProvided.dragHandleProps, noteSnapshot.isDragging)}
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
                            {uncategorized.map((note, index) => (
                              <Draggable key={note.id} draggableId={note.id} index={index}>
                                {(noteProvided, noteSnapshot) => (
                                  <div ref={noteProvided.innerRef} {...noteProvided.draggableProps}>
                                    {renderNoteRow(note, noteProvided.dragHandleProps, noteSnapshot.isDragging)}
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


          {filtered.archived.length > 0 && (
            <div className="mt-6 pt-4 border-t border-border/80">
              <div className="border border-border rounded-xl bg-muted/20">
                <button
                  onClick={() => setCompletedOpen(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <span className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <Archive className="w-4 h-4" />
                    Archived ({filtered.archived.length})
                  </span>
                  {completedOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {completedOpen && (
                  <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                    {filtered.archived.map(note => (
                      <ArchivedRow
                        key={note.id}
                        task={note}
                        onRestore={(t) => updateTask(t.id, { archived: false })}
                        onOpenTask={(t) => setOpenTaskId(t.id)}
                        onDeleteTask={(t) => setSingleDeleteTaskId(t.id)}
                        isDeleteMode={isDeleteMode}
                        isSelected={selectedDeleteTaskIds.includes(note.id)}
                        onToggleSelect={(t) =>
                          setSelectedDeleteTaskIds(prev =>
                            prev.includes(t.id) ? prev.filter(id => id !== t.id) : [...prev, t.id]
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        </DragDropContext>

        {/* Floating AI Note button */}
        <button
          onClick={() => setAiBuilderOpen(true)}
          className="fixed bottom-8 right-8 z-40 w-14 h-14 rounded-full bg-foreground text-background shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200"
          title="AI Note Builder"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      </div>

      {addingNote && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={() => setAddingNote(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Create Note</h2>
              <button onClick={() => { setAddingNote(false); resetNoteDraft(); }} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Note title</label>
                <input
                  autoFocus
                  value={newNoteTitle}
                  onChange={e => setNewNoteTitle(e.target.value)}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
  

                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Project</label>
                  <Select value={newNoteProjectId === '' ? 'my-notes' : String(newNoteProjectId)} onValueChange={v => { setNewNoteProjectId(v === 'my-notes' ? '' : Number(v)); setNewNoteColumnId(''); }}>
                    <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="my-notes">My Notes</SelectItem>
                      {projects.map(project => (
                        <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {newNoteProjectId !== '' && (
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground mb-1 block">Column</label>
                    <Select value={newNoteColumnId} onValueChange={v => setNewNoteColumnId(v)}>
                      <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {board.columns
                          .filter(col => col.projectId === Number(newNoteProjectId))
                          .sort((a, b) => a.order - b.order)
                          .map(col => (
                            <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {newNoteColumnId === '' && (
                      <p className="text-[10px] text-destructive mt-1">Column is required when a project is selected</p>
                    )}
                  </div>
                )}
          </div>

          <div className="relative">
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Tags</label>
            <div className="mt-1">
              {newNoteLabels.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {newNoteLabels.map(label => (
                    <span key={label.id} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${LABEL_COLORS[label.color]} text-primary-foreground`}>
                      {label.name}
                      <button onClick={() => setNewNoteLabels(prev => prev.filter(l => l.id !== label.id))} className="hover:opacity-70">
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
                {newNoteLabels.length > 0 ? `${newNoteLabels.length} tag${newNoteLabels.length > 1 ? 's' : ''} selected` : 'Add tags'}
              </button>
              {newTagPickerOpen && (
                <TagsModal
                  open={newTagPickerOpen}
                  onClose={() => setNewTagPickerOpen(false)}
                  title="Tags"
                  tags={allTags}
                  selectedIds={newNoteLabels.map(label => label.id)}
                  onToggle={labelId => setNewNoteLabels(prev =>
                    prev.some(l => l.id === labelId) ? prev.filter(l => l.id !== labelId) : [...prev, ...allTags.filter(t => t.id === labelId)]
                  )}
                  onCreate={async (name, color) => {
                    const newLabel = await createSharedNoteLabel(name, color);
                    setNewNoteLabels(prev => [...prev, newLabel]);
                  }}
                  onDelete={deleteTagEverywhere}
                  onRename={renameTagEverywhere}
                  onColorChange={changeTagColorEverywhere}
                  emptyText="No tags yet. Create one below."
                />
              )}
            </div>
          </div>



          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Body</label>
            <RichTextEditor
              value={newNoteDescription}
              onChange={(html) => setNewNoteDescription(html)}
              placeholder="Write your note..."
              minHeight={220}
            />
          </div>

              {/* Checklist Card */}
              

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
                          description="Attach files, images, and documents directly to your notes."
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
                <button onClick={() => { setAddingNote(false); resetNoteDraft(); }} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                <button
                  onClick={createNote}
                  disabled={!newNoteTitle.trim() || (newNoteProjectId !== '' && newNoteColumnId === '')}
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
                  placeholder="e.g. Daily Standup Note"
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
                      title: newNoteTitle || '',
                      description: newNoteDescription || '',
                      priority: newNotePriority || 'medium',
                      duration: newNoteDuration || 0,
                      startDate: newNoteStartDate || undefined,
                      startTime: newNoteStartTime || undefined,
                      dueDate: newNoteDueDate || undefined,
                      dueTime: newNoteDueTime || undefined,
                      projectId: newNoteProjectId ? Number(newNoteProjectId) : null,
                      columnId: newNoteColumnId || undefined,
                      labels: newNoteLabels || [],
                      checklists: newChecklistItems.map(item => ({ id: crypto.randomUUID(), title: 'Checklist', items: [{ id: crypto.randomUUID(), text: item.text, checked: false }] })),
                      subtasks: [],
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
                  <p className="text-xs text-muted-foreground mt-1">Save a note as a template first.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {templates.map(tmpl => (
                    <div key={tmpl.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-muted/50 rounded-xl border border-transparent hover:border-border transition-all">
                      <button
                        onClick={() => {
                          setNewNoteTitle(tmpl.title || '');
                          setNewNoteDescription(tmpl.description || '');
                          setNewNotePriority(tmpl.priority || 'medium');
                          setNewNoteDuration(tmpl.duration || 0);
                          setNewNoteStartDate(tmpl.startDate || '');
                          setNewNoteStartTime(tmpl.startTime || '');
                          setNewNoteDueDate(tmpl.dueDate || '');
                          setNewNoteDueTime(tmpl.dueTime || '');
                          setNewNoteProjectId(tmpl.projectId ? Number(tmpl.projectId) : '');
                          setNewNoteColumnId(tmpl.columnId || '');
                          setNewNoteLabels(tmpl.labels || []);
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
                <h3 className="text-sm font-semibold text-foreground">Note Analysis</h3>
              </div>
              <button onClick={() => setAnalysisPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </header>

            {!isPremium ? (
              <div className="flex-1 flex items-center">
                <PremiumGate
                  title="Note Analysis"
                  description="Get AI-powered insights into your notes with overview, duration check, deadline risk, and focus suggestions."
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
                      onClick={() => runNoteAnalysis(tab.key)}
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
                      Analyzing notes...
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

      {(openNote || templateEditNote) && (
        <NoteFullView
          note={templateEditNote || openNote!}
          onClose={() => { setOpenTaskId(null); setEditingTemplateMeta(null); setTemplateEditName(''); }}
          boardColumns={board.columns}
          projects={projects}
          allTags={allTags}
          onUpdateNote={wrappedUpdateNote}
          onToggleChecklistItem={(taskId, checklistId, itemId) => {
            if (taskId.startsWith('template-edit-')) {
              const overrides = templateEditOverrides || {};
              const checklists = overrides.checklists || editingTemplateMeta?.template.checklists || [];
              const next = checklists.map((list: any) =>
                list.id === checklistId
                  ? { ...list, items: (list.items || []).map((item: any) => item.id === itemId ? { ...item, done: !item.done } : item) }
                  : list
              );
              wrappedUpdateNote(taskId, { checklists: next } as any);
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
              wrappedUpdateNote(taskId, { checklists: next } as any);
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
              wrappedUpdateNote(taskId, { checklists: next } as any);
            } else {
              deleteChecklistItem(taskId, checklistId, itemId);
            }
          }}
          onDeleteNote={taskId => { setSingleDeleteTaskId(taskId); setOpenTaskId(null); }}
          onToggleTag={(taskId, label) => {
            if (taskId.startsWith('template-edit-')) {
              wrappedUpdateNote(taskId, { labels: [...((templateEditNote?.labels || []) as Label[]), label] });
            } else {
              toggleNoteTag(taskId, label);
            }
          }}
          onCreateTag={async (taskId, name, color) => {
            try {
              const label = await createSharedNoteLabel(name, color);
              if (taskId.startsWith('template-edit-')) {
                wrappedUpdateNote(taskId, { labels: [...((templateEditNote?.labels || []) as Label[]), label] });
              } else {
                const note = board.tasks.find(item => item.id === taskId);
                if (!note) return;
                updateTask(taskId, { labels: [...note.labels, label] });
              }
            } catch (error) {
              console.error('Failed to create note tag:', error);
            }
          }}
          onDeleteTagEverywhere={deleteTagEverywhere}
          onRenameTagEverywhere={renameTagEverywhere}
          onColorChangeTagEverywhere={changeTagColorEverywhere}
          isPremium={isPremium}
          isPro={isPro}
          onJumpToNote={id => { setOpenTaskId(null); setTimeout(() => setOpenTaskId(id), 50); }}
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
                  ? 'Select notes to delete'
                  : `${selectedDeleteTaskIds.length} note${selectedDeleteTaskIds.length === 1 ? '' : 's'} selected`}
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
                Delete selected — {selectedDeleteTaskIds.length} note{selectedDeleteTaskIds.length === 1 ? '' : 's'}
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

      {columnEditId && columnEditPos && (() => {
        const col = board.columns.find(c => c.id === columnEditId);
        if (!col) return null;
        return createPortal(
          <div className="fixed inset-0 z-50" onClick={() => { setColumnEditId(null); closeColumnEdit(); }}>
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full space-y-4" style={{ position: 'fixed', top: columnEditPos.top, left: columnEditPos.left }} onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-foreground">Edit Column</h3>
                <button onClick={() => { setColumnEditId(null); closeColumnEdit(); }} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
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
                  <button onClick={() => { updateColumn(columnEditId, { title: columnEditName, color: columnEditColor, icon: columnEditIcon || undefined }); setColumnEditId(null); closeColumnEdit(); }} className="px-4 py-2 bg-primary text-primary-foreground rounded-xl text-sm font-semibold">Save</button>
                </div>
              </div>
            </div>
          </div>,
          document.body
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
                  <h2 className="text-base font-semibold text-foreground">AI Note Builder</h2>
                  <p className="text-xs text-muted-foreground">Describe your note and AI will structure it for you</p>
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
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">AI Note Builder is available exclusively for Pro users. Upgrade to unlock AI-powered note creation.</p>
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
                  placeholder="Describe your note, project, or goal in detail...&#10;&#10;e.g. 'I need to launch a new website by next Friday. It requires designing 3 pages, writing copy, setting up hosting, and testing on mobile.'"
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
                    onClick={generateAINote}
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
            localStorage.setItem(`notes-drag-confirm-${moveType}`, 'true');
          }
          applyDragMoveDirect(srcDroppableId, dstDroppableId, srcIndex, dstIndex, dstProject);
          setPendingDragMove(null);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPendingDragMove(null)}>
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-foreground">Move note?</h3>
              <p className="text-xs text-muted-foreground mt-2">
                {moveType === 'project'
                  ? 'Are you sure you want to move this note? It will change the note\'s project.'
                  : 'Are you sure you want to move this note? It will change the note\'s column.'}
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
        const popupNote = board.tasks.find(t => t.id === tagPopupTaskId);
        if (!popupNote) return null;
        return (
          <TagsModal
            open
            title="Tags"
            onClose={() => setTagPopupTaskId(null)}
            tags={allTags}
            selectedIds={popupNote.labels.map(label => label.id)}
            onToggle={labelId => { const label = allTags.find(t => t.id === labelId); if (label) toggleNoteTag(popupNote.id, label); }}
            onCreate={async (name, color) => {
              const label = await createSharedNoteLabel(name, color);
              updateTask(popupNote.id, { labels: [...popupNote.labels, label] });
            }}
            onDelete={deleteTagEverywhere}
            onRename={renameTagEverywhere}
            onColorChange={changeTagColorEverywhere}
            emptyText="No tags yet. Create one below."
          />
        );
      })()}

    </div>
  );
};

interface NoteFullViewProps {
  note: Note;
  boardColumns: Array<{ id: string; title: string; color: string; order: number; projectId?: number | null }>;
  projects: ProjectMeta[];
  allTags: Label[];
  onClose: () => void;
  onUpdateNote: (taskId: string, updates: Partial<Note>) => void;
  onToggleChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  onAddChecklistItem: (taskId: string, checklistId: string, text: string) => void;
  onDeleteChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  onDeleteNote: (taskId: string) => void;
  onToggleTag: (taskId: string, tag: Label) => void;
  onCreateTag: (taskId: string, name: string, color: LabelColor) => void;
  onDeleteTagEverywhere: (tagId: string) => void;
  onRenameTagEverywhere: (tagId: string, newName: string) => void;
  onColorChangeTagEverywhere: (tagId: string, color: LabelColor) => void;
  isPremium: boolean;
  isPro: boolean;
  onJumpToNote?: (taskId: string) => void;
  onEditTemplate?: (template: TaskTemplate) => void;
  onSaveTemplate?: () => Promise<void>;
  editingTemplateMeta?: { id: number; name: string; template: TaskTemplate } | null;
  templateEditName?: string;
  onTemplateEditNameChange?: (name: string) => void;
}

const NoteDropdownExpanded: React.FC<{
  note: Note;
  onUpdateNote: (taskId: string, updates: Partial<Note>) => void;
  onToggleChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  onAddChecklistItem: (taskId: string, checklistId: string, text: string) => void;
  onDeleteChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  isPremium: boolean;
  isPro: boolean;
}> = ({ note, onUpdateNote, onToggleChecklistItem, onAddChecklistItem, onDeleteChecklistItem, isPremium, isPro }) => {
  const [newChecklistText, setNewChecklistText] = useState('');
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [editingChecklistText, setEditingChecklistText] = useState('');

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
  const canUseServerAttachmentApi = /^\d+$/.test(String(note.id));

  const checklistLists = note.checklists;
  const noteDuration = Math.max(0, Number(note.duration) || 0);

  const saveChecklistItemEdit = (checklistId: string, itemId: string) => {
    const next = editingChecklistText.trim();
    if (next) {
      onUpdateNote(note.id, {
        checklists: note.checklists.map(list =>
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
    if (result.source.droppableId === `dropdown-checklist-lists-${note.id}`) {
      const items = Array.from(note.checklists);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      onUpdateNote(note.id, { checklists: items });
    } else if (result.source.droppableId.startsWith(`dropdown-checklist-${note.id}-`)) {
      const srcChecklistId = result.source.droppableId.replace(`dropdown-checklist-${note.id}-`, '');
      const dstChecklistId = result.destination.droppableId.replace(`dropdown-checklist-${note.id}-`, '');

      if (srcChecklistId === dstChecklistId) {
        onUpdateNote(note.id, {
          checklists: note.checklists.map(cl =>
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
        const without = note.checklists.map(cl =>
          cl.id === srcChecklistId
            ? (() => { const items = Array.from(cl.items); [movedItem] = items.splice(result.source.index, 1); return { ...cl, items }; })()
            : cl
        );
        if (!movedItem) return;
        onUpdateNote(note.id, {
          checklists: without.map(cl =>
            cl.id === dstChecklistId
              ? { ...cl, items: [...cl.items.slice(0, result.destination!.index), movedItem!, ...cl.items.slice(result.destination!.index)] }
              : cl
          ),
        });
      }
    }
  }, [note.checklists, onUpdateNote]);

  const handleImageReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(note.images || []);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    onUpdateNote(note.id, { images: items });
  }, [note.images, onUpdateNote]);

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
          const res = await fetch(`/api/attachments/${note.id}`, { method: 'POST', credentials: 'include', body: formData });
          if (res.ok) {
            uploaded.push(await res.json());
          } else {
            uploaded.push({ id: crypto.randomUUID(), taskId: note.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
          }
        } catch {
          uploaded.push({ id: crypto.randomUUID(), taskId: note.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
        }
      } else {
        uploaded.push({ id: crypto.randomUUID(), taskId: note.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
      }
    }
    if (uploaded.length > 0) onUpdateNote(note.id, { attachments: [...(note.attachments || []), ...uploaded] });
    setUploading(false);
    e.currentTarget.value = '';
  };

  const deleteAttachment = async (attachmentId: string) => {
    onUpdateNote(note.id, { attachments: (note.attachments || []).filter(item => item.id !== attachmentId) });
    if (canUseServerAttachmentApi && /^\d+$/.test(String(attachmentId))) {
      try { await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE', credentials: 'include' }); } catch {}
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-muted-foreground mb-1.5">Title</label>
        <input
          value={note.title}
          onChange={e => onUpdateNote(note.id, { title: e.target.value })}
          className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
        />
      </div>

      <div>
        <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">Body</h4>
        <RichTextEditor
          value={note.description}
          onChange={(html) => onUpdateNote(note.id, { description: html })}
          placeholder="Write your note..."
          minHeight={140}
        />
      </div>

      <div className="space-y-2">
        {note.labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {note.labels.map(label => (
              <span key={label.id} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${LABEL_COLORS[label.color]} text-primary-foreground`}>{label.name}</span>
            ))}
          </div>
        )}
        <button
          onClick={() => setTagPickerOpen && setTagPickerOpen(true)}
          className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex items-center gap-1"
        >
          <Tag className="w-2.5 h-2.5" />Tags
        </button>
      </div>

      {/* Checklist Section */}
      

      {/* Attachments Section */}
      <div className="rounded-2xl border border-border bg-muted/20">
        <button
          onClick={() => setAttachmentsCollapsed(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
            {(note.attachments ?? []).length > 0 && (
              <span className="text-xs text-muted-foreground">({(note.attachments ?? []).length})</span>
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
                  description="Attach files, images, and documents directly to your notes."
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
                {(note.attachments || []).length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(note.attachments || []).map(attachment => {
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
      
    </div>
  );
};

const NoteFullView: React.FC<NoteFullViewProps> = ({
  note,
  boardColumns,
  projects,
  allTags,
  onClose,
  onUpdateNote,
  onToggleChecklistItem,
  onAddChecklistItem,
  onDeleteChecklistItem,
  onDeleteNote,
  onToggleTag,
  onCreateTag,
  onDeleteTagEverywhere,
  onRenameTagEverywhere,
  onColorChangeTagEverywhere,
  isPremium,
  isPro,
  onJumpToNote,
  onEditTemplate,
  onSaveTemplate,
  editingTemplateMeta,
  templateEditName,
  onTemplateEditNameChange,
}) => {
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newCommentText, setNewCommentText] = useState('');
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [editingChecklistText, setEditingChecklistText] = useState('');
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
  const canUseServerAttachmentApi = /^\d+$/.test(String(note.id));

  const checklistLists = note.checklists;
  const noteProject = note.projectId ? projects.find(project => project.id === note.projectId) || null : null;

  const activityEntries = useMemo(() => {
    const entries: Array<{ id: string; text: string; createdAt: string; actor?: string }> = [
      ...(note.activityLog || []).map(entry => ({ id: entry.id, text: entry.text, createdAt: entry.createdAt, actor: entry.actor })),
      { id: 'created', text: `Created ${new Date(note.createdAt).toLocaleDateString()}`, createdAt: note.createdAt },
      ...(note.updatedAt ? [{ id: 'updated', text: `Updated ${new Date(note.updatedAt).toLocaleDateString()}`, createdAt: note.updatedAt }] : []),
      ...(note.projectId ? [{ id: 'project', text: `Assigned to ${noteProject?.name || 'project'}`, createdAt: note.updatedAt || note.createdAt }] : []),
      ...(note.comments || []).map(comment => ({
        id: comment.id,
        text: `Commented: ${comment.text.slice(0, 80)}${comment.text.length > 80 ? '...' : ''}`,
        createdAt: comment.createdAt,
      })),
    ];
    return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [note.activityLog, note.createdAt, note.projectId, note.updatedAt, noteProject?.name, note.comments]);

  const addChecklistItemToNote = () => {
    if (!newChecklistText.trim()) return;
    const firstChecklist = note.checklists[0];
    if (!firstChecklist) {
      onUpdateNote(note.id, {
        checklists: [...note.checklists, {
          id: crypto.randomUUID(),
          title: 'Checklist',
          items: [{ id: crypto.randomUUID(), text: newChecklistText.trim(), completed: false }],
        }],
      });
      setNewChecklistText('');
      return;
    }
    onAddChecklistItem(note.id, firstChecklist.id, newChecklistText.trim());
    setNewChecklistText('');
  };

  const addChecklistItemToList = (checklistId: string) => {
    if (!newChecklistText.trim()) return;
    onAddChecklistItem(note.id, checklistId, newChecklistText.trim());
    setNewChecklistText('');
  };

  const saveChecklistItemEdit = (checklistId: string, itemId: string) => {
    const next = editingChecklistText.trim();
    if (next) {
      onUpdateNote(note.id, {
        checklists: note.checklists.map(list =>
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
    const items = Array.from(note.checklists);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    onUpdateNote(note.id, { checklists: items });
  }, [note.checklists, onUpdateNote]);

  const handleFullViewReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    if (result.source.droppableId === 'fullview-checklist-lists') {
      const items = Array.from(note.checklists);
      const [removed] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, removed);
      onUpdateNote(note.id, { checklists: items });
    } else if (result.source.droppableId.startsWith('fullview-checklist-')) {
      const srcChecklistId = result.source.droppableId.replace('fullview-checklist-', '');
      const dstChecklistId = result.destination.droppableId.replace('fullview-checklist-', '');

      if (srcChecklistId === dstChecklistId) {
        onUpdateNote(note.id, {
          checklists: note.checklists.map(cl =>
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
        const without = note.checklists.map(cl =>
          cl.id === srcChecklistId
            ? (() => { const items = Array.from(cl.items); [movedItem] = items.splice(result.source.index, 1); return { ...cl, items }; })()
            : cl
        );
        if (!movedItem) return;
        onUpdateNote(note.id, {
          checklists: without.map(cl =>
            cl.id === dstChecklistId
              ? { ...cl, items: [...cl.items.slice(0, result.destination!.index), movedItem!, ...cl.items.slice(result.destination!.index)] }
              : cl
          ),
        });
      }
    }
  }, [note.checklists, onUpdateNote]);

  const handleImageReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(note.images || []);
    const [removed] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, removed);
    onUpdateNote(note.id, { images: items });
  }, [note.images, onUpdateNote]);

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
          const res = await fetch(`/api/attachments/${note.id}`, { method: 'POST', credentials: 'include', body: formData });
          if (res.ok) {
            uploaded.push(await res.json());
          } else {
            uploaded.push({ id: crypto.randomUUID(), taskId: note.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
          }
        } catch {
          uploaded.push({ id: crypto.randomUUID(), taskId: note.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
        }
      } else {
        uploaded.push({ id: crypto.randomUUID(), taskId: note.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
      }
    }
    if (uploaded.length > 0) onUpdateNote(note.id, { attachments: [...(note.attachments || []), ...uploaded] });
    setUploading(false);
    e.currentTarget.value = '';
  };

  const deleteAttachment = async (attachmentId: string) => {
    onUpdateNote(note.id, { attachments: (note.attachments || []).filter(item => item.id !== attachmentId) });
    if (canUseServerAttachmentApi && /^\d+$/.test(String(attachmentId))) {
      try { await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE', credentials: 'include' }); } catch {}
    }
  };

  const createTagForNote = () => {
    const name = normalizeTagName(newTagName);
    if (!name) return;
    onCreateTag(note.id, name, newTagColor);
    setNewTagName('');
    setNewTagColor(randomTagColor());
    setTagPickerOpen(false);
  };

  const addComment = () => {
    if (!newCommentText.trim()) return;
    onUpdateNote(note.id, {
      comments: [...(note.comments || []), { id: crypto.randomUUID(), text: newCommentText.trim(), createdAt: new Date().toISOString() }],
    });
    setNewCommentText('');
  };

  const deleteComment = (commentId: string) => {
    onUpdateNote(note.id, { comments: (note.comments || []).filter(c => c.id !== commentId) });
  };

  const updateComment = (commentId: string, text: string) => {
    onUpdateNote(note.id, { comments: (note.comments || []).map(c => c.id === commentId ? { ...c, text } : c) });
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
              value={note.title}
              onChange={e => onUpdateNote(note.id, { title: e.target.value })}
            />
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted text-muted-foreground flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>


          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Project</label>
              <Select value={note.projectId ? String(note.projectId) : 'my-notes'} onValueChange={v => {
                const newId = v === 'my-notes' ? null : Number(v);
                if (newId !== note.projectId) {
                  setProjectChangeConfirm({ v, oldProjectId: note.projectId });
                }
              }}>
                <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="my-notes">My Notes</SelectItem>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {note.projectId && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Column</label>
                <Select value={note.columnId} onValueChange={v => onUpdateNote(note.id, { columnId: v })}>
                  <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                    <SelectValue placeholder="Column" />
                  </SelectTrigger>
                  <SelectContent>
                    {boardColumns
                      .filter(col => col.projectId === note.projectId)
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



        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1 block">Body</label>
          <RichTextEditor
            value={note.description}
            onChange={(html) => onUpdateNote(note.id, { description: html })}
            placeholder="Write your note..."
            minHeight={220}
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

          {note.labels.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {note.labels.map(label => (
                <button
                  key={label.id}
                  onClick={() => setTagPickerOpen(true)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${LABEL_COLORS[label.color]} text-primary-foreground`}
                >
                  {label.name}
                  <X className="w-3 h-3 opacity-80" />
                </button>
              ))}
            </div>
          )}

          {tagPickerOpen && (
            <TagsModal
              open={tagPickerOpen}
              onClose={() => setTagPickerOpen(false)}
              title="Tags"
              tags={allTags}
              selectedIds={note.labels.map(label => label.id)}
              onToggle={labelId => { const label = allTags.find(t => t.id === labelId); if (label) onToggleTag(note.id, label); }}
              onCreate={(name, color) => { onCreateTag(note.id, name, color); }}
              onDelete={onDeleteTagEverywhere}
              onRename={onRenameTagEverywhere}
              onColorChange={onColorChangeTagEverywhere}
              emptyText="No tags yet. Create one below."
            />
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
          <button
            onClick={() => setAttachmentsCollapsed(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Paperclip className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Attachments</h3>
              {(note.attachments ?? []).length > 0 && (
                <span className="text-xs text-muted-foreground">({(note.attachments ?? []).length})</span>
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
                    description="Attach files, images, and documents directly to your notes."
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
                  {(note.attachments || []).length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(note.attachments || []).map(attachment => {
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
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {entry.actor && <><span className="font-semibold">{entry.actor}</span> · </>}
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Comments</h3>
          <div className="space-y-2">
            {(note.comments || []).map(comment => (
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
            {note.priority !== 'none' && (
              <span className={`${PRIORITY_CONFIG[note.priority as Exclude<typeof note.priority, 'none'>]?.className} text-[10px] font-medium px-2 py-0.5 rounded-full text-primary-foreground`}>
                {PRIORITY_CONFIG[note.priority as Exclude<typeof note.priority, 'none'>]?.label}
              </span>
            )}
            <span className="text-xs text-muted-foreground">Created: {new Date(note.createdAt).toLocaleDateString()}</span>
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
            <div className="flex items-center gap-1.5">
            <button
              onClick={() => onUpdateNote(note.id, { archived: true })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all font-medium"
            >
              <Archive className="w-3.5 h-3.5" />
              Archive
            </button>
            <button
              onClick={() => onDeleteNote(note.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete Note
            </button>
            </div>
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
                  placeholder="e.g. Daily Standup Note"
                  value={fullViewTmplName}
                  onChange={e => setFullViewTmplName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && fullViewTmplName.trim() && (async () => {
                    try {
                      await createTemplate({
                        name: fullViewTmplName.trim(),
                        title: note.title || '',
                        description: note.description || '',
                        priority: note.priority || 'medium',
                        duration: Number(note.duration) || 0,
                        startDate: note.startDate || undefined,
                        startTime: note.startTime || undefined,
                        dueDate: note.dueDate || undefined,
                        dueTime: note.dueTime || undefined,
                        projectId: note.projectId ?? null,
                        columnId: note.columnId || undefined,
                        labels: note.labels || [],
                        checklists: note.checklists || [],
                        subtasks: note.subtasks || [],
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
                      title: note.title || '',
                      description: note.description || '',
                      priority: note.priority || 'medium',
                      duration: Number(note.duration) || 0,
                      startDate: note.startDate || undefined,
                      startTime: note.startTime || undefined,
                      dueDate: note.dueDate || undefined,
                      dueTime: note.dueTime || undefined,
                      projectId: note.projectId ?? null,
                      columnId: note.columnId || undefined,
                      labels: note.labels || [],
                      checklists: note.checklists || [],
                      subtasks: note.subtasks || [],
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
                  <p className="text-xs text-muted-foreground mt-1">Save a note as a template first.</p>
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
            <h3 className="text-sm font-bold text-foreground">Move note?</h3>
            <p className="text-xs text-muted-foreground mt-2">Changing the project will move this note. Do you want to continue?</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setProjectChangeConfirm(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={() => {
                const { v } = projectChangeConfirm;
                const newProjectId = v === 'my-notes' ? null : Number(v);
                onUpdateNote(note.id, {
                  projectId: newProjectId,
                  projectName: v === 'my-notes' ? undefined : (projects.find(p => p.id === Number(v))?.name || undefined),
                });
                if (v === 'my-notes') {
                  onUpdateNote(note.id, { columnId: boardColumns[0]?.id || note.columnId });
                } else if (newProjectId && (!note.projectId || note.projectId !== newProjectId)) {
                  const firstCol = boardColumns.filter(c => c.projectId === newProjectId).sort((a, b) => a.order - b.order)[0];
                  if (firstCol) onUpdateNote(note.id, { columnId: firstCol.id });
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
                <input value={editingTmplTitle} onChange={e => setEditingTmplTitle(e.target.value)} placeholder="Note title" className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Description</label>
                <textarea value={editingTmplDesc} onChange={e => setEditingTmplDesc(e.target.value)} placeholder="Note description" rows={3} className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Priority</label>
                  <Select value={editingTmplPriority} onValueChange={setEditingTmplPriority}>
                    <SelectTrigger className="w-full bg-muted/40 border-border rounded-xl px-3 py-2.5 text-sm h-auto">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
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

export default Notes;

