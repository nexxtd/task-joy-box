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
} from '@/types/board';
import { CircleToggle, SquareToggle } from '@/components/ToggleComponents';
import { useDeepFocus } from '@/hooks/useDeepFocus';
import { Plus, Sparkles, Star, Trash2, X, Tag, Image, Paperclip, GripVertical } from 'lucide-react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

// This component is extracted from the "Create Task" modal flow inside src/pages/Tasks.tsx.
// It intentionally focuses only on the create-task overlay (not the full Tasks page).

type NewTaskSubtaskDraft = {
  id: string;
  text: string;
  durationMinutes: number;
};

type NewChecklistDraftItem = string;

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
  const {
    board,
    addTask,
  } = useBoardContext();

  const { user } = useAuth();
  const { open: openDeepFocus } = useDeepFocus();

  const isPremium = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  const isPro = user?.subscriptionTier === 'pro';

  const [projects, setProjects] = useState<ProjectMeta[]>([]);

  // Draft state (taken from Tasks.tsx create modal)
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

  const [newChecklistItems, setNewChecklistItems] = useState<string[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');

  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [editingDraftSubtaskId, setEditingDraftSubtaskId] = useState<string | null>(null);
  const [editingDraftSubtaskText, setEditingDraftSubtaskText] = useState('');
  const [editingDraftSubtaskDuration, setEditingDraftSubtaskDuration] = useState<number>(0);

  const [editingDraftChecklistIndex, setEditingDraftChecklistIndex] = useState<number | null>(null);
  const [editingDraftChecklistText, setEditingDraftChecklistText] = useState('');

  const [addingTask, setAddingTask] = useState(false);

  const [aiBuilderOpen, setAiBuilderOpen] = useState(false);
  const [aiBuilderInput, setAiBuilderInput] = useState('');
  const [aiBuilderLoading, setAiBuilderLoading] = useState(false);
  const [aiBuilderError, setAiBuilderError] = useState('');

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<LabelColor>(randomTagColor());
  const [newTaskTags, setNewTaskTags] = useState<Label[]>([]);
  const [newTaskImages, setNewTaskImages] = useState<File[]>([]);
  const [createTagPickerOpen, setCreateTagPickerOpen] = useState(false);

  // Collapsible section states
  const [draftSubtasksCollapsed, setDraftSubtasksCollapsed] = useState(false);
  const [draftChecklistCollapsed, setDraftChecklistCollapsed] = useState(false);
  const [draftAttachmentsCollapsed, setDraftAttachmentsCollapsed] = useState(false);
  const [draftImagesCollapsed, setDraftImagesCollapsed] = useState(false);

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
    setNewFiles([]);
    setEditingDraftSubtaskId(null);
    setEditingDraftSubtaskText('');
    setEditingDraftSubtaskDuration(0);
    setEditingDraftChecklistIndex(null);
    setEditingDraftChecklistText('');
    setAiBuilderOpen(false);
    setAiBuilderInput('');
    setAiBuilderLoading(false);
    setAiBuilderError('');
    setNewTagName('');
    setNewTagColor(randomTagColor());
    setNewTaskTags([]);
    setNewTaskImages([]);
    setCreateTagPickerOpen(false);
  };

  // Keep draft column/project synced with defaults when opened
  useEffect(() => {
    if (!open) return;
    setAddingTask(true);
    resetTaskDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Load projects list (for the Project dropdown)
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
    setNewChecklistItems(prev => [...prev, newChecklistText.trim()]);
    setNewChecklistText('');
  };

  const newSubtaskTotal = newTaskSubtasks.reduce((s, st) => s + st.durationMinutes, 0);
  const newSubtaskRemaining = newTaskDuration - newSubtaskTotal;

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

    const attachmentUrls = newFiles.length > 0
      ? await Promise.all(newFiles.map(f => fileToDataUrl(f)))
      : [];
    const imageUrls = newTaskImages.length > 0
      ? await Promise.all(newTaskImages.map(f => fileToDataUrl(f)))
      : [];

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
      checklists:
        checklistItems.length
          ? [{ id: crypto.randomUUID(), title: 'Checklist', items: checklistItems }]
          : [],
      attachments: newFiles.map((file, i) => ({
        id: crypto.randomUUID(),
        taskId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        fileUrl: attachmentUrls[i],
        createdAt: new Date().toISOString(),
      })),
      labels: newTaskTags,
      images: newTaskImages.map((file, i) => ({
        id: crypto.randomUUID(),
        taskId,
        fileName: file.name,
        fileType: file.type || 'image/png',
        fileSize: file.size,
        fileUrl: imageUrls[i],
        createdAt: new Date().toISOString(),
      })),
      completed: false,
      completedAt: undefined,
    });

    setAddingTask(false);
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8"
      onClick={() => {
        onClose();
      }}
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Create Task</h2>
          <button
            onClick={() => onClose()}
            className="p-1.5 rounded-lg hover:bg-muted"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Task title</label>
            <input
              autoFocus
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Priority</label>
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
              <label className="text-xs font-semibold text-muted-foreground">Estimated duration (minutes)</label>
              <input
                type="number"
                min={0}
                value={newTaskDuration}
                onChange={e => setNewTaskDuration(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Project</label>
              <Select
                value={newTaskProjectId === '' ? 'my-tasks' : String(newTaskProjectId)}
                onValueChange={value => setNewTaskProjectId(value === 'my-tasks' ? '' : Number(value))}
                disabled={defaultProjectId !== undefined && defaultProjectId !== null}
              >
                <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="my-tasks">My Tasks</SelectItem>
                  {projects.map(project => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
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

          {/* Start Date and Time Section */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Start Date</label>
              <input
                type="date"
                value={newTaskStartDate}
                onChange={e => setNewTaskStartDate(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Start Time</label>
              <input
                type="time"
                value={newTaskStartTime}
                onChange={e => setNewTaskStartTime(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          {/* Due Date and Time Section */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Due Date</label>
              <input
                type="date"
                value={newTaskDueDate}
                onChange={e => setNewTaskDueDate(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Due Time</label>
              <input
                type="time"
                value={newTaskDueTime}
                onChange={e => setNewTaskDueTime(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Description</label>
            <textarea
              value={newTaskDescription}
              onChange={e => setNewTaskDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
            />
          </div>

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
                <DragDropContext onDragEnd={(result: DropResult) => {
                  if (!result.destination) return;
                  const items = Array.from(newTaskSubtasks);
                  const [removed] = items.splice(result.source.index, 1);
                  items.splice(result.destination.index, 0, removed);
                  setNewTaskSubtasks(items);
                }}>
                  <Droppable droppableId="draft-subtasks">
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                        {newTaskSubtasks.map((subtask, index) => (
                          <Draggable key={subtask.id} draggableId={subtask.id} index={index}>
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.draggableProps} className="grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center bg-muted/20 px-3 py-2 rounded-lg border border-border/50 group min-w-0">
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

          <div className="rounded-2xl border border-border bg-muted/20">
            <button
              onClick={() => setDraftChecklistCollapsed(prev => !prev)}
              className="w-full flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Checklist</h3>
                {newChecklistItems.length > 0 && (
                  <span className="text-xs text-muted-foreground">({newChecklistItems.length})</span>
                )}
              </div>
              {draftChecklistCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            {!draftChecklistCollapsed && (
              <div className="px-4 pb-3 space-y-3">
                <div className="space-y-1">
                  {newChecklistItems.map((item, index) => (
                    <div
                      key={`${item}-${index}`}
                      className="flex items-center gap-2.5 text-sm bg-muted/20 px-3 py-2 rounded-lg border border-border/50 group"
                    >
                      <SquareToggle completed={false} onClick={e => e.preventDefault()} size="md" />
                      {editingDraftChecklistIndex === index ? (
                        <input
                          autoFocus
                          className="flex-1 text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                          value={editingDraftChecklistText}
                          onChange={e => setEditingDraftChecklistText(e.target.value)}
                          onBlur={() => {
                            setNewChecklistItems(prev => prev.map((it, i) => (i === index ? editingDraftChecklistText : it)));
                            setEditingDraftChecklistIndex(null);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              setNewChecklistItems(prev => prev.map((it, i) => (i === index ? editingDraftChecklistText : it)));
                              setEditingDraftChecklistIndex(null);
                            }
                          }}
                        />
                      ) : (
                        <span
                          onClick={() => {
                            setEditingDraftChecklistIndex(index);
                            setEditingDraftChecklistText(item);
                          }}
                          className="flex-1 cursor-text truncate"
                        >
                          {item}
                        </span>
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
                  <button onClick={addChecklistDraft} className="px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90">
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>

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
              {draftAttachmentsCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            {!draftAttachmentsCollapsed && (
              <div className="px-4 pb-3 space-y-3">
              {!isPremium ? (
                <div className="border border-dashed border-border rounded-xl">
                  <PremiumGate
                    title="File Attachments"
                    description="Attach files, images, and documents directly to your tasks."
                    icon={<Sparkles className="w-6 h-6 text-primary" />}
                  />
                </div>
              ) : (
                <>
                  <div className="group relative mt-1">
                    <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                      <div className="flex flex-col items-center justify-center py-4">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                          <Sparkles className="w-5 h-5 text-primary" />
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
                              <Plus className="w-5 h-5 text-muted-foreground opacity-70" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                            </div>
                          </div>
                          <button
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              setNewFiles(prev => prev.filter((_, idx) => idx !== fileIdx));
                            }}
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

          <div className="relative">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-muted-foreground">Tags</label>
              <button
                onClick={() => setCreateTagPickerOpen(prev => !prev)}
                className="text-xs text-primary hover:underline"
              >
                {createTagPickerOpen ? 'Close' : 'Edit'}
              </button>
            </div>
            {newTaskTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {newTaskTags.map(label => (
                  <span key={label.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-primary-foreground" style={{ backgroundColor: label.color }}>
                    {label.name}
                    <button onClick={() => setNewTaskTags(prev => prev.filter(l => l.id !== label.id))} className="hover:opacity-70">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => setCreateTagPickerOpen(prev => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <Tag className="w-3.5 h-3.5" />
              {newTaskTags.length > 0 ? `${newTaskTags.length} tag${newTaskTags.length > 1 ? 's' : ''} selected` : 'Add tags'}
            </button>
            {createTagPickerOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setCreateTagPickerOpen(false)} />
                <div className="absolute left-0 mt-2 w-96 max-w-[95vw] bg-card border border-border rounded-2xl shadow-xl z-30 p-4 space-y-3">
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {(board.tasks.flatMap(t => t.labels).filter((l, i, a) => a.findIndex(x => x.id === l.id) === i) || []).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">No tags yet. Create one below.</p>
                    )}
                    {(board.tasks.flatMap(t => t.labels).filter((l, i, a) => a.findIndex(x => x.id === l.id) === i) || []).map(label => {
                      const active = newTaskTags.some(t => t.id === label.id);
                      return (
                        <button
                          key={label.id}
                          onClick={() => setNewTaskTags(prev => active ? prev.filter(t => t.id !== label.id) : [...prev, label])}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left ${active ? 'border-primary/30 bg-primary/5 shadow-sm' : 'border-border/60 hover:bg-muted/40'}`}
                        >
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                          <span className="text-sm text-foreground flex-1">{label.name}</span>
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
                      className="w-10 h-10 rounded-xl border-2 border-border/50 flex-shrink-0 transition-transform hover:scale-110"
                      style={{ backgroundColor: newTagColor }}
                      title="Randomize color"
                    />
                    <button
                      onClick={() => {
                        const name = normalizeTagName(newTagName);
                        if (!name) return;
                        const label: Label = { id: `local-${crypto.randomUUID()}`, name, color: newTagColor };
                        setNewTaskTags(prev => [...prev, label]);
                        setNewTagName('');
                        setNewTagColor(randomTagColor());
                      }}
                      disabled={!newTagName.trim()}
                      className="px-3 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

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
              {draftImagesCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
            {!draftImagesCollapsed && (
              <div className="px-4 pb-3 space-y-3">
                <label className="flex flex-col items-center justify-center w-full min-h-[80px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                  <div className="flex flex-col items-center justify-center py-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-1.5">
                      <Paperclip className="w-4 h-4 text-primary" />
                    </div>
                    <p className="text-xs font-medium text-foreground">Click to upload images</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG, GIF (max 10MB)</p>
                  </div>
                  <input type="file" multiple accept="image/*" onChange={e => {
                    if (!e.target.files) return;
                    setNewTaskImages(prev => [...prev, ...Array.from(e.target.files || [])]);
                    e.target.value = '';
                  }} className="hidden" />
                </label>
                {newTaskImages.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {newTaskImages.map((file, idx) => (
                      <div key={`${file.name}-${idx}`} className="relative group/img flex items-center gap-2 p-2 rounded-xl border border-border bg-muted/30">
                        <div className="w-10 h-10 rounded-lg bg-background border border-border flex items-center justify-center flex-shrink-0">
                          <Image className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{file.name}</p>
                          <p className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                        </div>
                        <button onClick={() => setNewTaskImages(prev => prev.filter((_, i) => i !== idx))} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive opacity-0 group-hover/img:opacity-100 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
            <button
              onClick={() => {
                onClose();
              }}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={createTask}
              disabled={!newTaskTitle.trim()}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
            >
              Save
            </button>
          </div>
        </div>

        {/* AI builder not included in extracted minimal modal to keep identical behavior would be huge.
            Board popup requirement is about creating new in column; AI is optional.
            If you must have AI builder inside this modal too, we can re-add it. */}
      </div>

      {aiBuilderOpen && (
        <div className="fixed inset-0 z-50" />
      )}
    </div>
  );
};

export default CreateTaskModal;

