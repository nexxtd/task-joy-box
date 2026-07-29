import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import {
  Attachment,
  Label,
  LabelColor,
  LABEL_COLORS,
  Priority,
  PRIORITY_CONFIG,
  Task,
  TaskStatus,
  TaskTemplate,
  ChecklistItem,
} from '@/types/board';
import { CircleToggle, SquareToggle } from '@/components/ToggleComponents';
import { useDeepFocus } from '@/hooks/useDeepFocus';
import { Plus, Sparkles, Star, Trash2, X, Tag, Image, Paperclip, GripVertical, ChevronDown, ChevronUp, Save, FolderKanban, Brain } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { createTag, deleteTag, fetchTags, type SharedTag } from '@/services/tagService';
import { fetchTemplates, createTemplate, updateTemplate, deleteTemplate as deleteTemplateApi } from '@/services/taskTemplateService';
import heic2any from 'heic2any';

type NewTaskSubtaskDraft = {
  id: string;
  text: string;
  durationMinutes: number;
};

export type CreateTaskModalProps = {
  open: boolean;
  onClose: () => void;
  defaultColumnId?: string;
  defaultProjectId?: number | null;
};

type ProjectMeta = {
  id: number;
  name: string;
  color: string;
  description: string;
};

type AIGeneratedTask = {
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
};

const TAG_COLOR_OPTIONS: LabelColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
const randomTagColor = (): LabelColor =>
  TAG_COLOR_OPTIONS[Math.floor(Math.random() * TAG_COLOR_OPTIONS.length)] || 'blue';

const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ');

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

const SHARED_TAG_PREFIX = 'shared-tag-';
const SHARED_COLOR_MAP: Record<string, LabelColor> = {
  red: 'red', orange: 'orange', yellow: 'yellow', green: 'green', blue: 'blue', purple: 'purple', pink: 'pink',
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

const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  open,
  onClose,
  defaultColumnId,
  defaultProjectId,
}) => {
  const { board, addTask } = useBoardContext();
  const { user } = useAuth();
  const { open: openDeepFocus } = useDeepFocus();

  const isPremium = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  const isPro = user?.subscriptionTier === 'pro';

  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [sharedTags, setSharedTags] = useState<SharedTag[]>([]);

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('medium');
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('to_do');
  const [newTaskStartDate, setNewTaskStartDate] = useState('');
  const [newTaskStartTime, setNewTaskStartTime] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskDueTime, setNewTaskDueTime] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState<number>(60);
  const [newTaskColumnId, setNewTaskColumnId] = useState<string>('');
  const [newTaskProjectId, setNewTaskProjectId] = useState<number | ''>('');

  const [newTaskSubtasks, setNewTaskSubtasks] = useState<NewTaskSubtaskDraft[]>([]);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newSubtaskDuration, setNewSubtaskDuration] = useState<number>(10);
  const [editingDraftSubtaskId, setEditingDraftSubtaskId] = useState<string | null>(null);
  const [editingDraftSubtaskText, setEditingDraftSubtaskText] = useState('');
  const [editingDraftSubtaskDuration, setEditingDraftSubtaskDuration] = useState<number>(0);

  const [newChecklistItems, setNewChecklistItems] = useState<{id: string; text: string}[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newChecklistLists, setNewChecklistLists] = useState<{id: string; title: string; items: {id: string; text: string; completed: boolean}[]}[]>([]);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [perChecklistInput, setPerChecklistInput] = useState<Record<string, string>>({});
  const [collapsedDraftChecklists, setCollapsedDraftChecklists] = useState<Set<string>>(new Set());
  const [editingDraftChecklistId, setEditingDraftChecklistId] = useState<string | null>(null);
  const [editingDraftChecklistTitle, setEditingDraftChecklistTitle] = useState('');
  const [editingDraftChecklistIndex, setEditingDraftChecklistIndex] = useState<number | null>(null);
  const [editingDraftChecklistText, setEditingDraftChecklistText] = useState('');
  const [editingDraftChecklistItemKey, setEditingDraftChecklistItemKey] = useState<{listId: string; itemId: string} | null>(null);

  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newTaskImages, setNewTaskImages] = useState<Attachment[]>([]);
  const [newTaskLabels, setNewTaskLabels] = useState<Label[]>([]);
  const [newTagPickerOpen, setNewTagPickerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<LabelColor>(randomTagColor());

  const [draftSubtasksCollapsed, setDraftSubtasksCollapsed] = useState(false);
  const [draftChecklistCollapsed, setDraftChecklistCollapsed] = useState(false);
  const [draftAttachmentsCollapsed, setDraftAttachmentsCollapsed] = useState(false);
  const [draftImagesCollapsed, setDraftImagesCollapsed] = useState(false);

  const [aiBuilderOpen, setAiBuilderOpen] = useState(false);
  const [aiBuilderInput, setAiBuilderInput] = useState('');
  const [aiBuilderLoading, setAiBuilderLoading] = useState(false);
  const [aiBuilderError, setAiBuilderError] = useState('');

  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [loadTemplateOpen, setLoadTemplateOpen] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [templateError, setTemplateError] = useState('');

  const allTags = useMemo<Label[]>(() => {
    const byName = new Map<string, Label>();
    board.tasks.forEach(task => task.labels.forEach(label => {
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

  const newSubtaskTotal = newTaskSubtasks.reduce((s, st) => s + st.durationMinutes, 0);
  const newSubtaskRemaining = newTaskDuration - newSubtaskTotal;

  useEffect(() => {
    if (!open) return;
    setNewTaskColumnId(defaultColumnId || '');
    setNewTaskProjectId(defaultProjectId === undefined ? '' : defaultProjectId ?? '');
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
    const loadSharedTags = async () => {
      try {
        setSharedTags(await fetchTags());
      } catch {
        setSharedTags([]);
      }
    };
    loadProjects();
    loadSharedTags();
  }, [open, defaultColumnId, defaultProjectId]);

  const resetTaskDraft = () => {
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskPriority('medium');
    setNewTaskStatus('to_do');
    setNewTaskStartDate('');
    setNewTaskStartTime('');
    setNewTaskDueDate('');
    setNewTaskDueTime('');
    setNewTaskDuration(60);
    setNewTaskColumnId(defaultColumnId || '');
    setNewTaskProjectId(defaultProjectId === undefined ? '' : defaultProjectId ?? '');
    setNewTaskSubtasks([]);
    setNewSubtaskText('');
    setNewSubtaskDuration(10);
    setNewChecklistItems([]);
    setNewChecklistText('');
    setNewChecklistLists([]);
    setNewChecklistTitle('');
    setPerChecklistInput({});
    setCollapsedDraftChecklists(new Set());
    setEditingDraftChecklistId(null);
    setEditingDraftChecklistTitle('');
    setEditingDraftChecklistIndex(null);
    setEditingDraftChecklistText('');
    setNewFiles([]);
    setNewTaskImages([]);
    setNewTaskLabels([]);
    setNewTagPickerOpen(false);
    setEditingDraftSubtaskId(null);
    setEditingDraftSubtaskText('');
    setEditingDraftSubtaskDuration(0);
    setAiBuilderOpen(false);
    setAiBuilderInput('');
    setAiBuilderLoading(false);
    setAiBuilderError('');
    setTemplateMenuOpen(false);
    setSaveTemplateOpen(false);
    setLoadTemplateOpen(false);
    setTemplateName('');
    setTemplateError('');
  };

  useEffect(() => {
    if (!open) return;
    resetTaskDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      setNewTaskSubtasks(prev => {
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

  const createSharedTaskLabel = async (name: string, color: LabelColor): Promise<Label> => {
    const tag = await createTag({ name, color });
    return sharedTagToLabel(tag);
  };

  const createTask = async () => {
    if (!newTaskTitle.trim()) return;
    const targetColumnId = newTaskColumnId || board.columns[0]?.id;
    if (!targetColumnId) return;

    const taskId = crypto.randomUUID();

    const attachmentUrls = newFiles.length > 0
      ? await Promise.all(newFiles.map(f => fileToDataUrl(f)))
      : [];

    const existingImageIds = newTaskImages.filter(img => !img.fileUrl.startsWith('data:image')).map(img => img.id);
    const newImageFiles = newTaskImages.filter(img => img.fileUrl.startsWith('data:image'));

    addTask(targetColumnId, newTaskTitle.trim(), {
      id: taskId,
      description: newTaskDescription,
      status: 'to_do',
      priority: newTaskPriority,
      duration: Math.max(0, Number(newTaskDuration) || 0),
      startDate: newTaskStartDate || undefined,
      startTime: newTaskStartTime || undefined,
      dueDate: newTaskDueDate || undefined,
      dueTime: newTaskDueTime || undefined,
      projectId: newTaskProjectId === '' ? null : Number(newTaskProjectId),
      projectName:
        newTaskProjectId === ''
          ? undefined
          : projects.find(project => project.id === Number(newTaskProjectId))?.name || undefined,
      subtasks: newTaskSubtasks.map(st => ({
        id: st.id,
        text: st.text,
        completed: false,
        durationMinutes: st.durationMinutes,
      })),
      checklists: [
        ...(newChecklistItems.length
          ? [{ id: crypto.randomUUID(), title: 'Checklist', items: newChecklistItems.map(it => ({ id: it.id, text: it.text, completed: false })) }]
          : []),
        ...newChecklistLists.map(l => ({
          id: l.id,
          title: l.title,
          items: l.items.map(it => ({ id: it.id, text: it.text, completed: it.completed })),
        })),
      ],
      attachments: newFiles.map((file, i) => ({
        id: crypto.randomUUID(),
        taskId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        fileUrl: attachmentUrls[i],
        createdAt: new Date().toISOString(),
      })),
      labels: newTaskLabels,
      images: newTaskImages.map(img => ({
        id: img.id,
        taskId,
        fileName: img.fileName,
        fileType: img.fileType || 'image/png',
        fileSize: img.fileSize,
        fileUrl: img.fileUrl,
        createdAt: img.createdAt || new Date().toISOString(),
      })),
      completed: false,
      completedAt: undefined,
    });

    onClose();
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
      setNewTaskStartDate(data.startDate || '');
      setNewTaskStartTime(data.startTime || '');
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
      setNewChecklistItems((data.checklistItems || []).map(text => ({ id: crypto.randomUUID(), text })));

      setAiBuilderOpen(false);
      setAiBuilderInput('');
    } catch (err: any) {
      setAiBuilderError(err.message || 'Something went wrong');
    } finally {
      setAiBuilderLoading(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={() => onClose()}>
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
        <div
          className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Create Task</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAiBuilderOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
                title="AI Task Builder"
              >
                <Sparkles className="w-3.5 h-3.5" />
                AI Builder
              </button>
              <button onClick={() => onClose()} className="p-1.5 rounded-lg hover:bg-muted" aria-label="Close">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>

          <div className="p-5 space-y-5">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Task title</label>
              <input
                autoFocus
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Priority</label>
                <Select value={newTaskPriority} onValueChange={value => setNewTaskPriority(value as Priority)}>
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
                  value={newTaskDuration}
                  onChange={e => setNewTaskDuration(Math.max(0, Number(e.target.value) || 0))}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Project</label>
                <Select value={newTaskProjectId === '' ? 'my-tasks' : String(newTaskProjectId)} onValueChange={v => { setNewTaskProjectId(v === 'my-tasks' ? '' : Number(v)); setNewTaskColumnId(''); }}>
                  <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="my-tasks">My Tasks</SelectItem>
                    {projects.map(project => (
                      <SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {newTaskProjectId !== '' && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Column</label>
                  <Select value={newTaskColumnId} onValueChange={v => setNewTaskColumnId(v)}>
                    <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent>
                      {board.columns
                        .filter(col => col.projectId === Number(newTaskProjectId))
                        .sort((a, b) => a.order - b.order)
                        .map(col => (
                          <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {newTaskColumnId === '' && (
                    <p className="text-[10px] text-destructive mt-1">Column is required when a project is selected</p>
                  )}
                </div>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Start Date</label>
                <input
                  type="date"
                  value={newTaskStartDate}
                  onChange={e => setNewTaskStartDate(e.target.value)}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Start Time</label>
                <input
                  type="time"
                  value={newTaskStartTime}
                  onChange={e => setNewTaskStartTime(e.target.value)}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Due Date</label>
                <input
                  type="date"
                  value={newTaskDueDate}
                  onChange={e => setNewTaskDueDate(e.target.value)}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Due Time</label>
                <input
                  type="time"
                  value={newTaskDueTime}
                  onChange={e => setNewTaskDueTime(e.target.value)}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Description</label>
              <textarea
                value={newTaskDescription}
                onChange={e => setNewTaskDescription(e.target.value)}
                rows={3}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
              />
            </div>

            {/* Tags */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Tags</label>
                <button
                  onClick={() => setNewTagPickerOpen(true)}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-3.5 py-2 text-xs text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                >
                  <Tag className="w-3.5 h-3.5" />
                  {newTaskLabels.length > 0 ? `${newTaskLabels.length} tag${newTaskLabels.length > 1 ? 's' : ''} selected` : 'Add tags'}
                </button>
              </div>
              {newTaskLabels.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {newTaskLabels.map(label => (
                    <span key={label.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${LABEL_COLORS[label.color]} text-primary-foreground flex-shrink-0`}>
                      {label.name}
                      <button onClick={() => setNewTaskLabels(prev => prev.filter(l => l.id !== label.id))} className="hover:opacity-70">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
      {newTagPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setNewTagPickerOpen(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">Tags</h3>
              <button onClick={() => setNewTagPickerOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="max-h-60 space-y-2 overflow-y-auto mb-4">
              {allTags.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">No tags yet. Create one below.</p>
              )}
              {allTags.map(label => {
                const active = newTaskLabels.some(item => item.id === label.id);
                return (
                  <div key={label.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                    <button
                      onClick={() => setNewTaskLabels(prev => active ? prev.filter(l => l.id !== label.id) : [...prev, label])}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      <span className={`w-3 h-3 rounded-full ${LABEL_COLORS[label.color]}`} />
                      <span className="text-sm text-foreground">{label.name}</span>
                      {active && <span className="ml-auto text-[10px] text-primary font-semibold">Selected</span>}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border pt-4">
              <div className="flex gap-2 mb-2">
                <input
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  placeholder="Create tag"
                  className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={() => setNewTagColor(randomTagColor())}
                  className={`w-11 rounded-xl border border-border ${LABEL_COLORS[newTagColor]}`}
                  title="Random color"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    const name = normalizeTagName(newTagName);
                    if (!name) return;
                    try {
                      const newLabel = await createSharedTaskLabel(name, newTagColor);
                      setNewTaskLabels(prev => [...prev, newLabel]);
                      setNewTagName('');
                      setNewTagColor(randomTagColor());
                    } catch (error) {
                      console.error('Failed to create task tag:', error);
                    }
                  }}
                  disabled={!newTagName.trim()}
                  className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Add tag
                </button>
                <button
                  onClick={() => setNewTagPickerOpen(false)}
                  className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

            {/* Sub-tasks */}
            <div className="rounded-2xl border border-border bg-muted/20">
              <button
                onClick={() => setDraftSubtasksCollapsed(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Sub-tasks</h3>
                  {newTaskSubtasks.length > 0 && (
                    <span className="text-xs text-muted-foreground">({newTaskSubtasks.length})</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {newTaskDuration > 0 && (
                    <span className={`text-xs font-medium ${
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
                  {draftSubtasksCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>
              {!draftSubtasksCollapsed && (
                <div className="border-t border-border/60 px-4 py-3 space-y-3">
                  <DragDropContext onDragEnd={handleDraftReorder}>
                    <Droppable droppableId="draft-subtasks">
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                          {newTaskSubtasks.map((subtask, index) => (
                            <Draggable key={subtask.id} draggableId={subtask.id} index={index}>
                              {(provided) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center rounded-lg border border-border px-3 py-2 group">
                                  <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                    <GripVertical className="w-4 h-4" />
                                  </div>
                                  {editingDraftSubtaskId === subtask.id ? (
                                    <>
                                      <input
                                        autoFocus
                                        className="text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                                        value={editingDraftSubtaskText}
                                        onChange={e => setEditingDraftSubtaskText(e.target.value)}
                                        onBlur={() => { setNewTaskSubtasks(prev => prev.map(st => st.id === subtask.id ? { ...st, text: editingDraftSubtaskText, durationMinutes: editingDraftSubtaskDuration } : st)); setEditingDraftSubtaskId(null); }}
                                        onKeyDown={e => { if (e.key === 'Enter') { setNewTaskSubtasks(prev => prev.map(st => st.id === subtask.id ? { ...st, text: editingDraftSubtaskText, durationMinutes: editingDraftSubtaskDuration } : st)); setEditingDraftSubtaskId(null); } }}
                                      />
                                      <input
                                        type="number"
                                        className="w-20 text-xs bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                                        value={editingDraftSubtaskDuration}
                                        onChange={e => setEditingDraftSubtaskDuration(Math.max(0, Number(e.target.value) || 0))}
                                      />
                                    </>
                                  ) : (
                                    <>
                                      <span
                                        onClick={() => { setEditingDraftSubtaskId(subtask.id); setEditingDraftSubtaskText(subtask.text); setEditingDraftSubtaskDuration(subtask.durationMinutes); }}
                                        className="text-sm text-foreground font-medium cursor-text truncate"
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
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
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
                    <button onClick={addSubtaskDraft} className="px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 shrink-0">
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Checklist */}
            <div className="rounded-2xl border border-border bg-muted/20">
              <button
                onClick={() => setDraftChecklistCollapsed(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Checklist</h3>
                  {newChecklistLists.length > 0 && (
                    <span className="text-xs text-muted-foreground">({newChecklistLists.length})</span>
                  )}
                </div>
                {draftChecklistCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
              </button>
              {!draftChecklistCollapsed && (
                <div className="border-t border-border/60 px-4 py-3 space-y-3">
                  {newChecklistItems.length === 0 && newChecklistLists.length === 0 && <p className="text-xs text-muted-foreground">No checklist yet. Add a checklist to get started.</p>}
                  <DragDropContext onDragEnd={handleDraftReorder}>
                    {newChecklistItems.length > 0 && (
                      <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
                        <div className="flex items-center px-3 py-2">
                          <span className="text-xs font-semibold text-foreground">Checklist</span>
                        </div>
                        <div className="px-3 pb-2 space-y-1.5">
                          <Droppable droppableId="draft-checklist">
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                                {newChecklistItems.map((item, index) => (
                                  <Draggable key={item.id} draggableId={item.id} index={index}>
                                    {(provided) => (
                                      <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2.5 text-sm group">
                                        <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                          <GripVertical className="w-4 h-4" />
                                        </div>
                                        {editingDraftChecklistIndex === index ? (
                                          <input
                                            autoFocus
                                            className="flex-1 text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                                            value={editingDraftChecklistText}
                                            onChange={e => setEditingDraftChecklistText(e.target.value)}
                                            onBlur={() => {
                                              if (editingDraftChecklistText.trim()) {
                                                setNewChecklistItems(prev => prev.map((it, i) => i === index ? { ...it, text: editingDraftChecklistText.trim() } : it));
                                              }
                                              setEditingDraftChecklistIndex(null);
                                            }}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') {
                                                if (editingDraftChecklistText.trim()) {
                                                  setNewChecklistItems(prev => prev.map((it, i) => i === index ? { ...it, text: editingDraftChecklistText.trim() } : it));
                                                }
                                                setEditingDraftChecklistIndex(null);
                                              }
                                            }}
                                          />
                                        ) : (
                                          <span
                                            onClick={() => { setEditingDraftChecklistIndex(index); setEditingDraftChecklistText(item.text); }}
                                            className="flex-1 cursor-text"
                                          >
                                            {item.text}
                                          </span>
                                        )}
                                        <button onClick={() => setNewChecklistItems(prev => prev.filter(it => it.id !== item.id))} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
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
                          <div className="flex gap-2 pt-1">
                            <input
                              value={newChecklistText}
                              onChange={e => setNewChecklistText(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && addChecklistDraft()}
                              placeholder="Add checklist item"
                              className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs"
                            />
                            <button onClick={addChecklistDraft} className="px-3 py-2 text-xs !bg-[#000] !text-white rounded-lg">Add</button>
                          </div>
                        </div>
                      </div>
                    )}
                    <Droppable droppableId="draft-checklist-lists" type="checklistList">
                      {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                          {newChecklistLists.map((list, listIndex) => {
                            const isCollapsed = collapsedDraftChecklists.has(list.id);
                            return (
                              <Draggable key={list.id} draggableId={list.id} index={listIndex}>
                                {(provided) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden group/list">
                                    <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 transition-all">
                                      <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                        <GripVertical className="w-4 h-4" />
                                      </div>
                                      <button
                                        onClick={() => setCollapsedDraftChecklists(prev => { const next = new Set(prev); isCollapsed ? next.delete(list.id) : next.add(list.id); return next; })}
                                        className="flex-1 flex items-center gap-2 text-left"
                                      >
                                        {editingDraftChecklistId === list.id ? (
                                          <input
                                            autoFocus
                                            className="text-xs font-semibold text-foreground bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5"
                                            value={editingDraftChecklistTitle}
                                            onChange={e => setEditingDraftChecklistTitle(e.target.value)}
                                            onBlur={() => {
                                              if (editingDraftChecklistTitle.trim()) {
                                                setNewChecklistLists(prev => prev.map(l => l.id === list.id ? { ...l, title: editingDraftChecklistTitle.trim() } : l));
                                              }
                                              setEditingDraftChecklistId(null);
                                            }}
                                            onKeyDown={e => {
                                              if (e.key === 'Enter') {
                                                if (editingDraftChecklistTitle.trim()) {
                                                  setNewChecklistLists(prev => prev.map(l => l.id === list.id ? { ...l, title: editingDraftChecklistTitle.trim() } : l));
                                                }
                                                setEditingDraftChecklistId(null);
                                              }
                                            }}
                                          />
                                        ) : (
                                          <span onClick={() => { setEditingDraftChecklistId(list.id); setEditingDraftChecklistTitle(list.title); }} className="text-sm font-semibold text-foreground cursor-text truncate">
                                            {list.title}
                                          </span>
                                        )}
                                      </button>
                                      <div className="flex items-center gap-1">
                                        <button onClick={() => setNewChecklistLists(prev => prev.filter(l => l.id !== list.id))} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/list:opacity-100 transition-all">
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => setCollapsedDraftChecklists(prev => { const next = new Set(prev); isCollapsed ? next.delete(list.id) : next.add(list.id); return next; })} className="p-1 text-muted-foreground hover:text-foreground">
                                          {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                                        </button>
                                      </div>
                                    </div>
                                    {!isCollapsed && (
                                      <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                                        <Droppable droppableId={`draft-checklist-items-${list.id}`} type="checklistItem">
                                          {(provided) => (
                                            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                                              {list.items.map((item, itemIndex) => (
                                                <Draggable key={item.id} draggableId={item.id} index={itemIndex}>
                                                  {(provided) => (
                                                    <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2.5 text-sm group">
                                                      <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                                        <GripVertical className="w-4 h-4" />
                                                      </div>
                                                      {editingDraftChecklistItemKey?.listId === list.id && editingDraftChecklistItemKey?.itemId === item.id ? (
                                                        <input
                                                          autoFocus
                                                          className="flex-1 text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                                                          value={editingDraftChecklistText}
                                                          onChange={e => setEditingDraftChecklistText(e.target.value)}
                                                          onBlur={() => {
                                                            if (editingDraftChecklistText.trim()) {
                                                              setNewChecklistLists(prev => prev.map(l => l.id === list.id ? { ...l, items: l.items.map(it => it.id === item.id ? { ...it, text: editingDraftChecklistText.trim() } : it) } : l));
                                                            }
                                                            setEditingDraftChecklistItemKey(null);
                                                          }}
                                                          onKeyDown={e => {
                                                            if (e.key === 'Enter') {
                                                              if (editingDraftChecklistText.trim()) {
                                                                setNewChecklistLists(prev => prev.map(l => l.id === list.id ? { ...l, items: l.items.map(it => it.id === item.id ? { ...it, text: editingDraftChecklistText.trim() } : it) } : l));
                                                              }
                                                              setEditingDraftChecklistItemKey(null);
                                                            }
                                                          }}
                                                        />
                                                      ) : (
                                                        <span
                                                          onClick={() => { setEditingDraftChecklistItemKey({ listId: list.id, itemId: item.id }); setEditingDraftChecklistText(item.text); }}
                                                          className="flex-1 cursor-text text-foreground"
                                                        >
                                                          {item.text}
                                                        </span>
                                                      )}
                                                      <button onClick={() => setNewChecklistLists(prev => prev.map(l => l.id === list.id ? { ...l, items: l.items.filter(it => it.id !== item.id) } : l))} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
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
                                        <div className="flex gap-2 pt-1">
                                          <input
                                            value={perChecklistInput[list.id] ?? ''}
                                            onChange={e => setPerChecklistInput(prev => ({ ...prev, [list.id]: e.target.value }))}
                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDraftChecklistItem(list.id); } }}
                                            placeholder="Add checklist item"
                                            className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs"
                                          />
                                          <button onClick={() => addDraftChecklistItem(list.id)} className="px-3 py-2 text-xs !bg-[#000] !text-white rounded-lg">Add</button>
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
                  <div className="flex gap-2">
                    <input
                      value={newChecklistTitle}
                      onChange={e => setNewChecklistTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newChecklistTitle.trim()) { addDraftChecklist(); } }}
                      placeholder="New checklist name"
                      className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
                    />
                    <button onClick={addDraftChecklist} disabled={!newChecklistTitle.trim()} className="px-4 py-2 text-xs font-semibold !bg-[#000] !text-white rounded-lg">Add checklist</button>
                  </div>
                </div>
              )}
            </div>

            {/* Attachments */}
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
                        description="Attach files, images, and documents directly to your tasks."
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

            {/* Images */}
            <div className="rounded-2xl border border-border bg-muted/20">
              <button
                onClick={() => setDraftImagesCollapsed(prev => !prev)}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Images</h3>
                  {newTaskImages.length > 0 && (
                    <span className="text-xs text-muted-foreground">({newTaskImages.length})</span>
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
                        description="Upload images directly to your tasks."
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
                          setNewTaskImages(prev => [...prev, ...newImgs]);
                          e.target.value = '';
                        }} className="hidden" />
                      </label>
                      {newTaskImages.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {newTaskImages.map(img => (
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
                                onClick={() => setNewTaskImages(prev => prev.filter(x => x.id !== img.id))}
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
              <button onClick={() => { resetTaskDraft(); onClose(); }} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button
                onClick={createTask}
                disabled={!newTaskTitle.trim() || (newTaskProjectId !== '' && newTaskColumnId === '')}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </div>

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
                  placeholder="e.g. Daily Standup Task"
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
                      title: newTaskTitle || '',
                      description: newTaskDescription || '',
                      priority: newTaskPriority || 'medium',
                      duration: newTaskDuration || 0,
                      startDate: newTaskStartDate || undefined,
                      startTime: newTaskStartTime || undefined,
                      dueDate: newTaskDueDate || undefined,
                      dueTime: newTaskDueTime || undefined,
                      projectId: newTaskProjectId ? Number(newTaskProjectId) : null,
                      columnId: newTaskColumnId || undefined,
                      labels: newTaskLabels || [],
                      subtasks: (newTaskSubtasks || []).map(st => ({ text: st.text, durationMinutes: st.durationMinutes })),
                      checklists: [
                        ...newChecklistItems.map(item => ({ id: crypto.randomUUID(), title: 'Checklist', items: [{ id: crypto.randomUUID(), text: item.text, checked: false }] })),
                        ...newChecklistLists.map(l => ({ id: l.id, title: l.title, items: l.items.map(it => ({ id: crypto.randomUUID(), text: it.text, checked: false })) })),
                      ],
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
                  <p className="text-xs text-muted-foreground mt-1">Save a task as a template first.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {templates.map(tmpl => (
                    <div key={tmpl.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-muted/50 rounded-xl border border-transparent hover:border-border transition-all">
                      <button
                        onClick={() => {
                          setNewTaskTitle(tmpl.title || '');
                          setNewTaskDescription(tmpl.description || '');
                          setNewTaskPriority(tmpl.priority || 'medium');
                          setNewTaskDuration(tmpl.duration || 0);
                          setNewTaskStartDate(tmpl.startDate || '');
                          setNewTaskStartTime(tmpl.startTime || '');
                          setNewTaskDueDate(tmpl.dueDate || '');
                          setNewTaskDueTime(tmpl.dueTime || '');
                          if (tmpl.projectId) {
                            setNewTaskProjectId(tmpl.projectId);
                            setNewTaskColumnId(tmpl.columnId || '');
                          }
                          if (tmpl.labels) setNewTaskLabels(tmpl.labels);
                          if (tmpl.subtasks) setNewTaskSubtasks(tmpl.subtasks.map(st => ({ id: crypto.randomUUID(), text: st.text, durationMinutes: (st as any).durationMinutes || 0 })));
                          setLoadTemplateOpen(false);
                        }}
                        className="flex-1 flex items-center gap-3 text-left"
                      >
                        <div className="w-2 h-2 rounded-full bg-primary/50 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{tmpl.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{tmpl.title || 'No title'}</p>
                        </div>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
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
              <div className="p-6 text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Pro Feature</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">AI Task Builder is available exclusively for Pro users. Upgrade to unlock AI-powered task creation.</p>
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
                  placeholder={"Describe your task, project, or goal in detail...\n\ne.g. 'I need to launch a new website by next Friday. It requires designing 3 pages, writing copy, setting up hosting, and testing on mobile.'"}
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
    </>
  );
};

export default CreateTaskModal;




