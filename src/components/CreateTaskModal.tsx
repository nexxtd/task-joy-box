import React, { useEffect, useMemo, useState } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import {
  Attachment,
  Label,
  LabelColor,
  Priority,
  PRIORITY_CONFIG,
  Task,
  TaskStatus,
} from '@/types/board';
import { CircleToggle, SquareToggle } from '@/components/ToggleComponents';
import { useDeepFocus } from '@/hooks/useDeepFocus';
import { Plus, Sparkles, Star, Trash2, X } from 'lucide-react';
import { ChevronDown, ChevronUp } from 'lucide-react';

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
      onClick={() => (window.location.hash = '#settings')}
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

  const resetTaskDraft = () => {
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskPriority('medium');
    setNewTaskStatus('to_do');
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

    addTask(targetColumnId, newTaskTitle.trim(), {
      id: taskId,
      description: newTaskDescription,
      status: 'to_do',
      priority: newTaskPriority,
      duration: Math.max(0, Number(newTaskDuration) || 0),
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
      attachments: newFiles.map(file => ({
        id: crypto.randomUUID(),
        taskId,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
        fileUrl: URL.createObjectURL(file),
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
              <label className="text-xs font-semibold uppercase text-muted-foreground">Project</label>
              <select
                value={newTaskProjectId}
                onChange={e => setNewTaskProjectId(e.target.value ? Number(e.target.value) : '')}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                disabled={defaultProjectId !== undefined && defaultProjectId !== null}
              >
                <option value="">My Tasks</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div />
          </div>

          {/* Due Date and Time Section */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Due Date</label>
              <input
                type="date"
                value={newTaskDueDate}
                onChange={e => setNewTaskDueDate(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">Due Time</label>
              <input
                type="time"
                value={newTaskDueTime}
                onChange={e => setNewTaskDueTime(e.target.value)}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
              />
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
                <span
                  className={`text-[11px] font-medium ${
                    newSubtaskRemaining > 0
                      ? 'text-muted-foreground'
                      : newSubtaskRemaining < 0
                        ? 'text-orange-500'
                        : 'text-label-green'
                  }`}
                >
                  {newSubtaskRemaining > 0
                    ? `${newSubtaskRemaining} mins left`
                    : newSubtaskRemaining < 0
                      ? `Over by ${Math.abs(newSubtaskRemaining)} mins`
                      : '0 mins left ✓'}
                </span>
              )}
            </div>

            <div className="space-y-2">
              {newTaskSubtasks.map(subtask => (
                <div
                  key={subtask.id}
                  className="grid grid-cols-[1fr_auto_auto] gap-2 items-center bg-muted/20 px-3 py-2 rounded-lg border border-border/50 group"
                >
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
                          setNewTaskSubtasks(prev =>
                            prev.map(st =>
                              st.id === subtask.id
                                ? { ...st, text: editingDraftSubtaskText, durationMinutes: editingDraftSubtaskDuration }
                                : st
                            )
                          );
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
                        onClick={() => {
                          setEditingDraftSubtaskId(subtask.id);
                          setEditingDraftSubtaskText(subtask.text);
                          setEditingDraftSubtaskDuration(subtask.durationMinutes);
                        }}
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
              <button onClick={addSubtaskDraft} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">
                Add
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Checklist</label>
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
                      className="flex-1 cursor-text"
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
              <button onClick={addChecklistDraft} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg">
                Add
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase text-muted-foreground">Attachments</label>
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

