import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Column as ColumnType, Task, LABEL_COLORS, Label, LabelColor } from '@/types/board';
import { useBoardContext } from '@/context/BoardContext';
import { Plus, Trash2, Sparkles, Lock, X, ChevronDown, ChevronUp, Calendar, Brain, Clock3, GripVertical, Tag, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CircleToggle } from '@/components/ToggleComponents';

import { useDeepFocus } from '@/hooks/useDeepFocus';
import { useAnchoredPopup } from '@/hooks/useAnchoredPopup';
import { TaskDropdownExpanded, PriorityBadge } from '@/pages/Tasks';
import { createTag, deleteTag, updateTag, fetchTags, type SharedTag } from '@/services/tagService';
import TagsModal from '@/components/shared/TagsModal';
import { CompletedTaskRow } from '@/components/shared/CompletedTasks';
import CenteredDragClone from '@/components/CenteredDragClone';

const formatDuration = (minutes: number) => {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const formatDate = (value?: string) => {
  if (!value) return 'No due date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

const getDueTimeWarning = (t: Task): 'overdue' | 'imminent' | 'soon' | 'normal' => {
  if (!t.dueDate) return 'normal';
  const now = new Date();
  const dueDate = new Date(t.dueDate);
  if (t.completed) return 'normal';
  const diffMs = dueDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffMs < 0) return 'overdue';
  if (diffDays <= 0.5) return 'imminent';
  if (diffDays <= 2) return 'soon';
  return 'normal';
};

interface BoardColumnProps {
  column: ColumnType;
  tasks: Task[];
  index: number;
  onTaskClick: (task: Task) => void;
  canCreateTasks?: boolean;
  onAddClick?: () => void;
  canEdit?: boolean;
  boardZoom?: number;
}

const BoardColumn: React.FC<BoardColumnProps> = ({ column, tasks, index, onTaskClick, canCreateTasks = true, onAddClick, canEdit = true, boardZoom = 1 }) => {
  const { board, addTask, updateColumn, updateTask, moveTask, deleteTask, toggleChecklistItem, addChecklistItem, deleteChecklistItem } = useBoardContext();
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'urgent' | 'high' | 'medium' | 'low' | 'none'>('none');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [subject, setSubject] = useState('');
  const [color, setColor] = useState('');
  const [icon, setIcon] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [duration, setDuration] = useState<number>(60);
  const [showRowUpgradePrompt, setShowRowUpgradePrompt] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const isPremium = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  const isPro = user?.subscriptionTier === 'pro';
  const isFree = !user?.subscriptionTier || user.subscriptionTier === 'free';
  const [columnEditOpen, setColumnEditOpen] = useState(false);
  const [columnEditName, setColumnEditName] = useState(column.title);
  const [columnEditColor, setColumnEditColor] = useState(column.color);
  const [columnEditIcon, setColumnEditIcon] = useState(column.icon || '');
  const [columnIcon, setColumnIcon] = useState(column.icon || '');

  const { open: openColumnEdit, close: closeColumnEdit, pos: columnEditPos } = useAnchoredPopup();

  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const [priorityEditTaskId, setPriorityEditTaskId] = useState<string | null>(null);
  const [quickEditTaskId, setQuickEditTaskId] = useState<string | null>(null);
  const [quickEditField, setQuickEditField] = useState<'duration' | null>(null);
  const [quickEditDuration, setQuickEditDuration] = useState(0);
  const [dateEditTaskId, setDateEditTaskId] = useState<string | null>(null);
  const [dateEditField, setDateEditField] = useState<'start' | 'due' | null>(null);
  const [tagPopupTaskId, setTagPopupTaskId] = useState<string | null>(null);
  const [sharedTags, setSharedTags] = useState<SharedTag[]>([]);
  const { open: openDeepFocus } = useDeepFocus();

  React.useEffect(() => {
    fetchTags().then(setSharedTags).catch(() => setSharedTags([]));
  }, []);

  const allTags = useMemo<Label[]>(() => {
    const map = new Map<string, Label>();
    const add = (label: Label) => {
      const key = label.name.trim().toLowerCase();
      if (!map.has(key)) map.set(key, label);
    };
    board.tasks.forEach(task => task.labels.forEach(add));
    sharedTags.forEach(tag => add(sharedTagToLabel(tag)));
    return Array.from(map.values());
  }, [board.tasks, sharedTags]);

  const openQuickEdit = (task: Task, field: 'duration') => {
    setQuickEditTaskId(task.id); setDateEditTaskId(null); setDateEditField(null); setTagPopupTaskId(null);
    setQuickEditField(field);
    setQuickEditDuration(Math.max(0, Number(task.duration) || 0));
  };

  const closeQuickEdit = () => {
    setQuickEditTaskId(null);
    setQuickEditField(null);
  };

  const applyQuickEdit = (task: Task) => {
    if (quickEditField === 'duration') {
      updateTask(task.id, { duration: Math.max(0, Number(quickEditDuration) || 0) });
    }
    closeQuickEdit();
  };

  const toggleTaskTag = (taskId: string, label: Label) => {
    const task = board.tasks.find(item => item.id === taskId);
    if (!task) return;
    const has = task.labels.some(item => item.id === label.id);
    updateTask(taskId, { labels: has ? task.labels.filter(item => item.id !== label.id) : [...task.labels, label] });
  };

  const createSharedTaskLabel = async (name: string, color: LabelColor): Promise<Label> => {
    const tag = await createTag({ name, color });
    return sharedTagToLabel(tag);
  };

  const renameTagEverywhere = async (tagId: string, newName: string) => {
    const name = newName.trim();
    if (!name) return;
    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          const updated = await updateTag(sharedTagId, { name });
          setSharedTags(prev => prev.map(tag => tag.id === sharedTagId ? { ...tag, name: updated.name } : tag));
        } catch (error) {
          console.error('Failed to rename shared tag:', error);
        }
      }
    }
    board.tasks.forEach(task => {
      if (task.labels.some(label => label.id === tagId)) {
        updateTask(task.id, { labels: task.labels.map(label => label.id === tagId ? { ...label, name } : label) });
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
        }
      }
    }
    board.tasks.forEach(task => {
      if (task.labels.some(label => label.id === tagId)) {
        updateTask(task.id, { labels: task.labels.map(label => label.id === tagId ? { ...label, color } : label) });
      }
    });
  };

  const deleteTagEverywhere = async (tagId: string) => {
    if (tagId.startsWith(SHARED_TAG_PREFIX)) {
      const sharedTagId = Number(tagId.slice(SHARED_TAG_PREFIX.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          await deleteTag(sharedTagId);
          setSharedTags(prev => prev.filter(tag => tag.id !== sharedTagId));
        } catch (error) {
          console.error('Failed to delete shared tag:', error);
        }
      }
    }
    board.tasks.forEach(task => {
      if (task.labels.some(label => label.id === tagId)) {
        updateTask(task.id, { labels: task.labels.filter(label => label.id !== tagId) });
      }
    });
  };

  const renderTaskRow = (task: Task, taskProvided: any, taskSnapshot: any) => {
    const isExpanded = expandedTaskIds.includes(task.id);
    const subtaskCount = task.subtasks?.length || 0;
    const checklistTotal = task.checklists.reduce((s, l) => s + l.items.length, 0);
    const checklistDone = task.checklists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
    const taskDurFmt = formatDuration(task.duration || 0);
    const taskTags = task.labels.slice(0, 3);
    return (
      <div
        ref={taskProvided.innerRef}
        {...taskProvided.draggableProps}
        data-no-pan="true"
        onClick={() => onTaskClick(task)}
        className={`group border rounded-xl bg-card transition-[opacity,box-shadow,border-color] duration-200 cursor-pointer select-text ${
          taskSnapshot.isDragging
            ? 'border-primary/40 shadow-lg rotate-[2deg]'
            : 'border-border hover:border-border/80 hover:shadow-sm'
        }`}
      >
        <div className="flex items-center gap-1 px-3 py-3">
          <div {...taskProvided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
            <GripVertical className="w-4 h-4" />
          </div>
          <div onClick={e => { e.stopPropagation(); handleToggleComplete(e, task); }}>
            <CircleToggle
              completed={task.completed || false}
              onClick={e => { e.stopPropagation(); handleToggleComplete(e, task); }}
              size="md"
              title="Mark complete"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-left text-foreground truncate">{task.title}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-nowrap mt-0.5">
              {(task.priority !== 'none' || priorityEditTaskId === task.id) && (
                <PriorityBadge
                  task={task}
                  onUpdate={(priority) => updateTask(task.id, { priority })}
                  isOpen={priorityEditTaskId === task.id}
                  onToggle={() => setPriorityEditTaskId(priorityEditTaskId === task.id ? null : task.id)}
                />
              )}
              {taskDurFmt && (
                <button
                  onClick={e => { e.stopPropagation(); openQuickEdit(task, 'duration'); }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0"
                >
                  {taskDurFmt}
                </button>
              )}
              <button
                onClick={e => {
                  e.stopPropagation();
                  setQuickEditTaskId(null); setQuickEditField(null); setTagPopupTaskId(null); setDateEditTaskId(dateEditTaskId === task.id && dateEditField === 'start' ? null : task.id);
                  setDateEditField(prev => prev === 'start' ? null : 'start');
                }}
                className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 bg-muted text-muted-foreground"
              >
                <Calendar className="w-2.5 h-2.5" />
                {task.startDate ? `${formatDate(task.startDate)}${task.startTime ? ` ${task.startTime}` : ''}` : 'Add start date'}
              </button>
              <button
                onClick={e => {
                  e.stopPropagation();
                  setQuickEditTaskId(null); setQuickEditField(null); setTagPopupTaskId(null); setDateEditTaskId(dateEditTaskId === task.id && dateEditField === 'due' ? null : task.id);
                  setDateEditField(prev => prev === 'due' ? null : 'due');
                }}
                className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 ${
                  task.dueDate
                    ? (() => {
                        const warning = getDueTimeWarning(task);
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
                {task.dueDate ? `${formatDate(task.dueDate)}${task.dueTime ? ` ${task.dueTime}` : ''}` : 'Add due date'}
              </button>
              {checklistTotal > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                  {checklistDone}/{checklistTotal} checklist
                </span>
              )}
              {subtaskCount > 0 && (() => {
                const subtaskDone = (task.subtasks || []).filter(s => s.completed).length;
                return (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                    {subtaskDone}/{subtaskCount} sub task
                  </span>
                );
              })()}
              {taskTags.map(label => (
                <span
                  key={label.id}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${LABEL_COLORS[label.color]} text-primary-foreground`}
                >
                  {label.name}
                </span>
              ))}
              {task.labels.length > taskTags.length && (
                <button
                  onClick={e => { e.stopPropagation(); setQuickEditTaskId(null); setQuickEditField(null); setDateEditTaskId(null); setDateEditField(null); setTagPopupTaskId(tagPopupTaskId === task.id ? null : task.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0"
                >
                  +{task.labels.length - taskTags.length}
                </button>
              )}
              <button
                onClick={e => { e.stopPropagation(); setQuickEditTaskId(null); setQuickEditField(null); setDateEditTaskId(null); setDateEditField(null); setTagPopupTaskId(tagPopupTaskId === task.id ? null : task.id); }}
                className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 ${
                  tagPopupTaskId === task.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}
              >
                <Tag className="w-2.5 h-2.5" />
                {tagPopupTaskId === task.id ? 'Close' : 'Tags'}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
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
          </div>
        </div>
        {quickEditTaskId === task.id && quickEditField === 'duration' && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 bg-muted/20 rounded-b-xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2">
                <input type="number" min={0} value={quickEditDuration} onChange={e => setQuickEditDuration(Math.max(0, Number(e.target.value) || 0))} onBlur={() => applyQuickEdit(task)} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <span className="text-xs text-muted-foreground">minutes</span>
              </div>
              <button onClick={() => applyQuickEdit(task)} className="ml-auto rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Save</button>
              <button onClick={closeQuickEdit} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">Cancel</button>
            </div>
          </div>
        )}
        {dateEditTaskId === task.id && dateEditField && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 bg-muted/20 rounded-b-xl">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  value={dateEditField === 'start' ? (task.startDate || '') : (task.dueDate || '')}
                  onChange={e => {
                    const val = e.target.value || undefined;
                    updateTask(task.id, dateEditField === 'start' ? { startDate: val } : { dueDate: val });
                  }}
                  className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-sm [color-scheme:var(--color-scheme)]"
                />
              </div>
              <div className="relative w-[140px]">
                <Clock3 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="time"
                  value={dateEditField === 'start' ? (task.startTime || '') : (task.dueTime || '')}
                  onChange={e => {
                    const val = e.target.value || undefined;
                    updateTask(task.id, dateEditField === 'start' ? { startTime: val } : { dueTime: val });
                  }}
                  className="w-full bg-background border border-border rounded-lg pl-8 pr-3 py-2 text-sm [color-scheme:var(--color-scheme)]"
                />
              </div>
              {((dateEditField === 'start' && task.startDate) || (dateEditField === 'due' && task.dueDate)) && (
                <button
                  onClick={() => {
                    updateTask(task.id, dateEditField === 'start' ? { startDate: undefined, startTime: undefined } : { dueDate: undefined, dueTime: undefined });
                    setDateEditTaskId(null);
                    setDateEditField(null);
                  }}
                  className="text-xs text-destructive hover:bg-destructive/10 px-3 py-2 rounded-lg"
                >
                  Clear
                </button>
              )}
              <button onClick={() => { setDateEditTaskId(null); setDateEditField(null); }} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Save</button>
              <button onClick={() => { setDateEditTaskId(null); setDateEditField(null); }} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">Cancel</button>
            </div>
          </div>
        )}
        {isExpanded && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 space-y-4 bg-muted/10 rounded-b-xl">
            <TaskDropdownExpanded
              task={task}
              onUpdateTask={updateTask}
              onToggleChecklistItem={toggleChecklistItem}
              onAddChecklistItem={addChecklistItem}
              onDeleteChecklistItem={deleteChecklistItem}
              isPremium={isPremium}
              isPro={isPro}
            />
          </div>
        )}
      </div>
    );
  };

  const renderTaskClone = (taskProvided: any, taskSnapshot: any, rubric: any) => {
    const draggedTask = uncompletedTasks[rubric.source.index];
    if (!draggedTask) return null;
    const style = taskProvided.draggableProps.style as any;
    const zoom = boardZoom || 1;
    return (
      <CenteredDragClone
        draggableProps={taskProvided.draggableProps}
        dragHandleProps={taskProvided.dragHandleProps}
        innerRef={taskProvided.innerRef}
        style={style}
        zoom={zoom}
      >
        {renderTaskRow(draggedTask, taskProvided, taskSnapshot)}
      </CenteredDragClone>
    );
  };

  const toggleExpand = (taskId: string) => {
    setExpandedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const COLUMN_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', 
    '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f43f5e'
  ];

  // Separate completed and uncompleted tasks
  const uncompletedTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  const handleAddSubtask = () => {
    if (newSubtask.trim()) {
      setSubtasks([...subtasks, newSubtask.trim()]);
      setNewSubtask('');
    }
  };

  const removeSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  const handleAdd = async () => {
    if (newTitle.trim()) {
      const taskId = crypto.randomUUID();
      addTask(column.id, newTitle.trim(), {
        id: taskId,
        description: description.trim(),
        priority,
        dueDate: dueDate || undefined,
        subject: subject.trim() || undefined,
        color: color || undefined,
        icon: icon || undefined,
        duration: duration || undefined,
        subtasks: subtasks.length > 0 ? subtasks.map(s => ({ id: crypto.randomUUID(), text: s, completed: false })) : [],
        dueTime: dueTime || undefined,
      });

      // Handle file uploads
      if (newFiles.length > 0) {
        for (const file of newFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('taskId', taskId);
          try {
            await fetch('/api/attachments/upload', {
              method: 'POST',
              body: formData,
              credentials: 'include'
            });
          } catch (err) {
            console.error('Failed to upload file:', file.name, err);
          }
        }
      }
      
      setNewTitle('');
      setDescription('');
      setPriority('none');
      setDueDate('');
      setDueTime('');
      setSubject('');
      setColor('');
      setIcon('');
      setDuration(60);
      setSubtasks([]);
      setNewFiles([]);
      setIsAdding(false);
    }
  };

  const handleToggleComplete = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    if (!canEdit) return;
    
    const completedCol = column.title.toLowerCase().includes('completed');
    updateTask(task.id, { 
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : undefined
    });
  };

  return (
    <>
    <Draggable draggableId={column.id} index={index} isDragDisabled={!canEdit}>
      {(provided) => (
        <div ref={provided.innerRef} {...provided.draggableProps} className="flex-shrink-0 w-[80rem] select-none">
          <div {...provided.dragHandleProps} data-no-pan="true" className="column-header-row flex items-center gap-1.5 px-2 py-1.5 mb-1.5 group">
            <button
              onClick={() => setTasksCollapsed(!tasksCollapsed)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-all"
              title={tasksCollapsed ? 'Show tasks' : 'Hide tasks'}
            >
              {tasksCollapsed
                ? <ChevronDown className="w-4 h-4 text-muted-foreground/70" />
                : <ChevronUp className="w-4 h-4 text-muted-foreground/70" />}
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: column.color }} />
              {column.icon && <span className="text-base leading-none">{column.icon}</span>}
            </button>
            <button
              onClick={(e) => { openColumnEdit(e.currentTarget.closest('.column-header-row') as HTMLElement); setColumnEditOpen(true); setColumnEditName(column.title); setColumnEditColor(column.color); setColumnEditIcon(column.icon || ''); }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-muted/30 transition-all text-left min-w-0"
            >
              <span className="text-sm font-semibold tracking-wide text-muted-foreground/80 truncate">{column.title}</span>
              <span className="text-xs text-muted-foreground/50 flex-shrink-0">({uncompletedTasks.length})</span>
            </button>
          </div>

          <Droppable droppableId={column.id} type="task" renderClone={renderTaskClone}>
            {(dropProvided, snapshot) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className={`${tasksCollapsed ? 'min-h-0 p-0' : 'min-h-[100px] p-2'} space-y-3 rounded-xl transition-all duration-300 ${snapshot.isDraggingOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset' : ''}`}
              >
                {/* Uncompleted tasks */}
                {!tasksCollapsed && uncompletedTasks.map((task, taskIndex) => (
                  <Draggable key={task.id} draggableId={task.id} index={taskIndex} isDragDisabled={!canEdit}>
                    {(taskProvided, taskSnapshot) => renderTaskRow(task, taskProvided, taskSnapshot)}
                  </Draggable>
                ))}

                {!tasksCollapsed && dropProvided.placeholder}
                
                {/* Completed tasks section */}
                {!tasksCollapsed && completedTasks.length > 0 && (
                  <div className="pt-2" data-no-pan="true">
                    <div className="border border-label-green/20 rounded-xl bg-label-green/5 overflow-hidden">
                      <button
                        onClick={() => setCompletedCollapsed(prev => !prev)}
                        className="w-full flex items-center justify-between px-4 py-3"
                      >
                        <span className="text-sm font-semibold text-label-green flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4" />
                          Completed ({completedTasks.length})
                        </span>
                        {completedCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                      </button>
                      {!completedCollapsed && (
                        <div className="border-t border-border/60 px-2 py-2 space-y-1.5">
                          {completedTasks.map(task => (
                            <CompletedTaskRow
                              key={task.id}
                              task={task}
                              onToggleComplete={canEdit ? (t) => updateTask(t.id, { completed: false, completedAt: undefined }) : undefined}
                              onOpenTask={onTaskClick}
                              onDeleteTask={canEdit ? (t) => deleteTask(t.id) : undefined}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Droppable>

          {isAdding ? (
            <div data-no-pan="true" className={`${tasksCollapsed ? 'mt-0' : 'mt-3'} p-4 bg-card border-2 border-primary/20 rounded-2xl shadow-xl animate-in slide-in-from-top-2 duration-300 overflow-hidden`}>

              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-primary" />
                </div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">New Task</h4>
              </div>

              <textarea
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); }
                  if (e.key === 'Escape') setIsAdding(false);
                }}
                placeholder="What needs to be done?"
                className="w-full bg-muted/30 border border-border rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all mb-3 font-medium"
                rows={2}
              />
              
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Priority</label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                    <SelectTrigger className="w-full bg-muted/30 border border-border text-xs">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Due Time</label>
                  <input
                    type="time"
                    value={dueTime}
                    onChange={e => setDueTime(e.target.value)}
                    className="w-full bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="e.g. Maths"
                    className="w-full bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Duration (min)</label>
                  <input
                    type="number"
                    min={5}
                    max={480}
                    step={5}
                    value={duration}
                    onChange={e => setDuration(Number(e.target.value))}
                    className="w-full bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Color & Icon</label>
                  <div className="flex gap-1">
                    <input
                      type="color"
                      value={color}
                      onChange={e => setColor(e.target.value)}
                      className="w-8 h-8 rounded bg-muted/30 border border-border p-0.5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={icon}
                      onChange={e => setIcon(e.target.value)}
                      placeholder="Icon name"
                      className="flex-1 bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Subtasks Section */}
              <div className="mb-4 space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Subtasks</label>
                <div className="space-y-1 mb-2">
                  {subtasks.map((st, i) => (
                    <div key={i} className="flex items-center gap-2 bg-muted/20 px-2 py-1 rounded-lg border border-border/50 group">
                      <span className="flex-1 text-[11px] text-foreground/80">{st}</span>
                      <button onClick={() => removeSubtask(i)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    value={newSubtask}
                    onChange={e => setNewSubtask(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
                    placeholder="Add subtask..."
                    className="flex-1 bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                  <button 
                    onClick={handleAddSubtask}
                    className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Add more details..."
                className="w-full bg-muted/30 border border-border rounded-xl p-3 text-xs text-foreground placeholder:text-muted-foreground resize-none mb-4 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                rows={2}
              />

              {/* Attachments Section */}
              <div className="mb-4 space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Attachments</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {newFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-primary/5 px-2 py-1 rounded-lg border border-primary/20 text-[9px] font-medium text-primary uppercase group">
                      {f.name}
                      <button onClick={() => setNewFiles(newFiles.filter((_, idx) => idx !== i))} className="hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <label 
                  className={`flex items-center gap-2 w-max px-3 py-1.5 border rounded-lg text-[10px] font-bold transition-all ${
                    isPremium 
                      ? 'bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer'
                      : 'bg-primary/5 border-primary/20 text-primary opacity-80 cursor-pointer'
                  }`}
                  onClick={() => !isPremium && (window.location.href = '/pricing')}
                >
                  {isPremium ? <Plus className="w-3 h-3" /> : <Sparkles className="w-3 h-3 fill-current" />}
                  {isPremium ? 'Add File' : 'Post Files (Premium)'}
                  {isPremium && (
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={e => {
                        if (e.target.files) {
                          setNewFiles([...newFiles, ...Array.from(e.target.files)]);
                        }
                      }}
                    />
                  )}
                </label>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={handleAdd} 
                  className="flex-1 bg-primary text-primary-foreground text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-md shadow-primary/20"
                  disabled={!newTitle.trim()}
                >
                  Create Task
                </button>
                <button 
                  onClick={() => setIsAdding(false)} 
                  className="px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          {canEdit && (
            <button
              data-no-pan="true"
              onClick={() => {
                if (onAddClick) { onAddClick(); return; }
                if (!canCreateTasks) return;
                setIsAdding(true);
              }}
              disabled={!onAddClick && !canCreateTasks}
              className={`${tasksCollapsed ? 'mt-0' : 'mt-3'} w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-muted-foreground hover:text-primary hover:bg-primary/5 border-2 border-dashed border-border hover:border-primary/20 rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
          )}
        </div>
      )}
    </Draggable>

    {tagPopupTaskId && (() => {
      const popupTask = board.tasks.find(t => t.id === tagPopupTaskId);
      if (!popupTask) return null;
      return (
        <TagsModal
          open={!!tagPopupTaskId}
          onClose={() => setTagPopupTaskId(null)}
          tags={allTags}
          selectedIds={popupTask.labels.map(label => label.id)}
          onToggle={tagId => { const label = allTags.find(t => t.id === tagId); if (label) toggleTaskTag(popupTask.id, label); }}
          onCreate={async (name, color) => {
            try {
              const newLabel = await createSharedTaskLabel(name, color);
              updateTask(popupTask.id, { labels: [...popupTask.labels, newLabel] });
            } catch (error) {
              console.error('Failed to create task tag:', error);
            }
          }}
          onDelete={tagId => deleteTagEverywhere(tagId)}
          onRename={(tagId, newName) => renameTagEverywhere(tagId, newName)}
          onColorChange={(tagId, color) => changeTagColorEverywhere(tagId, color)}
        />
      );
    })()}

    {showRowUpgradePrompt && (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowRowUpgradePrompt(false)}>
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
        <div
          className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-8 animate-fade-in text-center"
          onClick={e => e.stopPropagation()}
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Premium Feature</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Adding tasks (rows) to your board is a <strong>Pro feature</strong>. Upgrade to unlock unlimited tasks across all your projects.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { setShowRowUpgradePrompt(false); navigate('/pricing'); }}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              View Plans
            </button>
            <button
              onClick={() => setShowRowUpgradePrompt(false)}
              className="w-full py-2.5 text-muted-foreground text-sm hover:text-foreground transition-colors"
            >
              Stay on Free
            </button>
          </div>
        </div>
      </div>
    )}
    {columnEditOpen && columnEditPos && createPortal(
      <div className="fixed inset-0 z-50" onClick={() => { setColumnEditOpen(false); closeColumnEdit(); }}>
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
        <div className="relative w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl animate-fade-in" style={{ position: 'fixed', top: columnEditPos.top, left: columnEditPos.left }} onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-5">
            <span className="text-base font-bold text-foreground">Edit Column</span>
            <button onClick={() => { setColumnEditOpen(false); closeColumnEdit(); }} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Name</label>
              <input
                autoFocus
                value={columnEditName}
                onChange={e => setColumnEditName(e.target.value)}
                className="w-full bg-muted/30 border border-border rounded-xl p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Color</label>
              <div className="flex flex-wrap gap-2">
                {COLUMN_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColumnEditColor(c)}
                    className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${columnEditColor === c ? 'border-foreground ring-2 ring-primary/30' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Icon</label>
              <div className="flex gap-2">
                <input
                  value={columnEditIcon}
                  onChange={e => setColumnEditIcon(e.target.value)}
                  placeholder="e.g. 📁 or 🚀"
                  className="flex-1 bg-muted/30 border border-border rounded-xl p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                />
                <button
                  onClick={() => { updateColumn(column.id, { title: columnEditName.trim() || column.title, color: columnEditColor, icon: columnEditIcon || undefined }); setColumnEditOpen(false); closeColumnEdit(); }}
                  className="px-5 py-2.5 bg-foreground text-background text-sm font-bold rounded-xl hover:opacity-90 transition-opacity"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
};

export default BoardColumn;