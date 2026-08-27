import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBoardContext } from '@/context/BoardContext';
import { DEFAULT_LABELS, Label, LabelColor, Priority, Task, LABEL_COLORS } from '@/types/board';
import { Brain, Calendar, ChevronDown, ChevronUp, Clock3, GripVertical, Plus, Tag, Trash2, X, CheckCircle2 } from 'lucide-react';
import { CircleToggle } from '@/components/ToggleComponents';
import { useDeepFocus } from '@/hooks/useDeepFocus';
import { useAnchoredPopup } from '@/hooks/useAnchoredPopup';
import { useAuth } from '@/context/AuthContext';
import { TaskDropdownExpanded } from '@/pages/Tasks';
import { createTag, deleteTag, fetchTags, updateTag, type SharedTag } from '@/services/tagService';
import TagsModal from '@/components/shared/TagsModal';
import { CompletedTaskRow } from '@/components/shared/CompletedTasks';
import CenteredDragClone from '@/components/CenteredDragClone';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface ListViewProps {
  onTaskClick: (task: Task) => void;
  projectId?: number | null;
  onAddTask?: () => void;
}

const PRIORITY_COLORS: Record<string, { bg: string; label: string }> = {
  urgent: { bg: '#dc2626', label: 'Urgent' },
  high: { bg: '#ea580c', label: 'High' },
  medium: { bg: '#ca8a04', label: 'Medium' },
  low: { bg: '#2563eb', label: 'Low' },
  none: { bg: '#9ca3af', label: 'None' },
};

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

const isTaskCompleted = (task: Task) => Boolean(task.completed || task.status === 'completed');

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

const PriorityBadge: React.FC<{
  task: Task;
  onUpdate: (priority: Priority) => void;
  isOpen: boolean;
  onToggle: () => void;
}> = ({ task, onUpdate, isOpen, onToggle }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onToggle(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onToggle]);
  const pc = PRIORITY_COLORS[task.priority];
  return (
    <div className="relative flex-shrink-0 flex items-center" ref={ref}>
      {task.priority !== 'none' ? (
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
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs rounded-lg transition-all ${task.priority === p ? 'bg-primary/10 font-bold' : 'hover:bg-muted'}`}
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

const ListView: React.FC<ListViewProps> = ({ onTaskClick, projectId, onAddTask }) => {
  const { board, updateTask, moveTask, updateColumn, deleteTask, toggleChecklistItem, addChecklistItem, deleteChecklistItem } = useBoardContext();
  const { user } = useAuth();
  const { open: openDeepFocus } = useDeepFocus();
  const isPremium = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  const isPro = user?.subscriptionTier === 'pro';

  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>(() => {
    try { const v = localStorage.getItem('tasks-expanded-ids'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [collapsedColumns, setCollapsedColumns] = useState<string[]>(() => {
    try { const v = localStorage.getItem('tasks-collapsed-columns'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [collapsedCompletedCols, setCollapsedCompletedCols] = useState<string[]>([]);
  const [editingColumn, setEditingColumn] = useState<{ id: string; name: string; color: string; icon: string } | null>(null);
  const { open: openColumnEdit, close: closeColumnEdit, pos: columnEditPos } = useAnchoredPopup();
  const [quickEditTaskId, setQuickEditTaskId] = useState<string | null>(null);
  const [quickEditField, setQuickEditField] = useState<'duration' | null>(null);
  const [quickEditDuration, setQuickEditDuration] = useState(0);
  const [priorityEditTaskId, setPriorityEditTaskId] = useState<string | null>(null);
  const [dateEditTaskId, setDateEditTaskId] = useState<string | null>(null);
  const [dateEditField, setDateEditField] = useState<'start' | 'due' | null>(null);
  const [tagPopupTaskId, setTagPopupTaskId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [singleDeleteTaskId, setSingleDeleteTaskId] = useState<string | null>(null);
  const [sharedTags, setSharedTags] = useState<SharedTag[]>([]);

  const COLUMN_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6',
    '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f43f5e'
  ];

  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => { localStorage.setItem('tasks-expanded-ids', JSON.stringify(expandedTaskIds)); }, [expandedTaskIds]);
  useEffect(() => { localStorage.setItem('tasks-collapsed-columns', JSON.stringify(collapsedColumns)); }, [collapsedColumns]);

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

  const toggleExpand = (taskId: string) => {
    setExpandedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const toggleColumnCollapse = (columnId: string) => {
    setCollapsedColumns(prev =>
      prev.includes(columnId) ? prev.filter(id => id !== columnId) : [...prev, columnId]
    );
  };

  const toggleTaskCompletion = (task: Task) => {
    if (isTaskCompleted(task)) {
      updateTask(task.id, { completed: false, completedAt: undefined, status: 'to_do' });
    } else {
      updateTask(task.id, { completed: true, completedAt: new Date().toISOString(), status: 'completed' });
    }
  };

  const openQuickEdit = (task: Task, field: 'duration') => {
    setQuickEditTaskId(task.id);
    setQuickEditField(field);
    setQuickEditDuration(Math.max(0, Number(task.duration) || 0));
  };

  const closeQuickEdit = () => {
    setQuickEditTaskId(null);
    setQuickEditField(null);
  };

  const applyQuickEdit = (task: Task) => {
    const updates: Partial<Task> = {};
    if (quickEditField === 'duration') {
      updates.duration = Math.max(0, Number(quickEditDuration) || 0);
    }
    updateTask(task.id, updates);
    closeQuickEdit();
  };

  const toggleTaskTag = (taskId: string, label: Label) => {
    const task = board.tasks.find(item => item.id === taskId);
    if (!task) return;
    const has = task.labels.some(item => item.id === label.id);
    const nextLabels = has
      ? task.labels.filter(item => item.id !== label.id)
      : [...task.labels, label];
    updateTask(taskId, { labels: nextLabels });
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
          return;
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
        } catch (error) {
          console.error('Failed to delete shared tag:', error);
          return;
        }
      }
    }

    board.tasks.forEach(task => {
      if (task.labels.some(label => label.id === tagId)) {
        updateTask(task.id, { labels: task.labels.filter(label => label.id !== tagId) });
      }
    });
  };

  const sortedColumns = [...board.columns]
    .filter(c => projectId === undefined ? true : c.projectId === projectId)
    .sort((a, b) => a.order - b.order);

  const handleDragEnd = (result: DropResult) => {
    setIsDragging(false);
    if (!result.destination) return;
    moveTask(result.draggableId, result.destination.droppableId, result.destination.index);
  };

  const renderTaskRow = (task: Task, dragHandleProps?: any, isDragging?: boolean) => {
    const isExpanded = expandedTaskIds.includes(task.id);
    const subtaskCount = task.subtasks?.length || 0;
    const subtaskDone = (task.subtasks || []).filter(s => s.completed).length;
    const checklistTotal = task.checklists.reduce((s, l) => s + l.items.length, 0);
    const checklistDone = task.checklists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
    const taskDurFmt = formatDuration(task.duration || 0);
    const taskTags = task.labels.slice(0, 3);
    return (
      <div
        key={task.id}
        onClick={() => onTaskClick(task)}
        className={`group border rounded-xl bg-card transition-[opacity,box-shadow,border-color] duration-200 cursor-pointer ${
          isDragging
            ? 'border-primary/40 shadow-lg rotate-[2deg]'
            : task.completed
              ? 'border-label-green/30 bg-label-green/5 hover:border-label-green/40'
              : 'border-border hover:border-border/80 hover:shadow-sm'
        } ${task.completed ? 'opacity-60' : ''}`}
      >
        <div className="flex items-center gap-1 px-3 py-3">
          {dragHandleProps && (
            <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
              <GripVertical className="w-4 h-4" />
            </div>
          )}
          <div onClick={e => { e.stopPropagation(); toggleTaskCompletion(task); }}>
            <CircleToggle
              completed={isTaskCompleted(task)}
              onClick={e => { e.stopPropagation(); toggleTaskCompletion(task); }}
              size="md"
              title="Mark complete"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className={`text-sm font-medium text-left text-foreground truncate ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                {task.title}
              </span>
            </div>
              <div className="flex items-center gap-1.5 flex-nowrap mt-0.5 overflow-x-auto">
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
                  setDateEditTaskId(dateEditTaskId === task.id && dateEditField === 'start' ? null : task.id);
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
                  setDateEditTaskId(dateEditTaskId === task.id && dateEditField === 'due' ? null : task.id);
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
              {subtaskCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                  {subtaskDone}/{subtaskCount} sub task
                </span>
              )}
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
                  onClick={e => { e.stopPropagation(); setTagPopupTaskId(tagPopupTaskId === task.id ? null : task.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0"
                >
                  +{task.labels.length - taskTags.length}
                </button>
              )}
              <button
                onClick={e => { e.stopPropagation(); setTagPopupTaskId(tagPopupTaskId === task.id ? null : task.id); }}
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
        {quickEditTaskId === task.id && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 bg-muted/20 rounded-b-xl">
            <div className="flex flex-wrap items-center gap-2">
              {quickEditField === 'duration' && (
                <div className="flex items-center gap-2">
                  <input type="number" min={0} value={quickEditDuration} onChange={e => setQuickEditDuration(Math.max(0, Number(e.target.value) || 0))} onBlur={() => applyQuickEdit(task)} className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <span className="text-xs text-muted-foreground">minutes</span>
                </div>
              )}
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
            </div>
          </div>
        )}
        {isExpanded && !isDragging && (
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
            <div className="flex justify-end pt-1">
              <button
                onClick={e => { e.stopPropagation(); setSingleDeleteTaskId(task.id); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Task
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
    <div className="flex-1 overflow-y-auto p-6 relative">
      <div className="max-w-4xl mx-auto space-y-2 pb-24">
        <DragDropContext onDragStart={() => setIsDragging(true)} onDragEnd={handleDragEnd}>
          {sortedColumns.map(column => {
            const isColumnCollapsed = collapsedColumns.includes(column.id);
            const tasks = board.tasks
              .filter(t => t.columnId === column.id && (projectId === undefined ? true : t.projectId === projectId))
              .sort((a, b) => a.order - b.order);
            const columnActive = tasks.filter(t => !t.completed);
            const columnCompleted = tasks.filter(t => t.completed);
            const isCompletedCollapsed = collapsedCompletedCols.includes(column.id);

            return (
              <div key={column.id} className="mb-3 pl-4">
                <div className="column-header-row flex items-center gap-1 w-full px-1 py-1.5 mb-1 group">
                  <button
                    onClick={() => toggleColumnCollapse(column.id)}
                    className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-muted/30 transition-all"
                  >
                    {isColumnCollapsed
                      ? <ChevronDown className="w-3 h-3 text-muted-foreground/60" />
                      : <ChevronUp className="w-3 h-3 text-muted-foreground/60" />}
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: column.color }} />
                    {column.icon && <span className="text-xs">{column.icon}</span>}
                  </button>
                  <button
                    onClick={(e) => { openColumnEdit(e.currentTarget.closest('.column-header-row') as HTMLElement); setEditingColumn({ id: column.id, name: column.title, color: column.color || '', icon: column.icon || '' }); }}
                    className="flex items-center gap-1.5 px-1.5 py-1 rounded-lg hover:bg-muted/30 transition-all text-left"
                  >
                    <span className="text-[11px] font-semibold tracking-widest text-muted-foreground/80">{column.title}</span>
                    <span className="text-[10px] text-muted-foreground/40">({columnActive.length})</span>
                  </button>
                </div>
                {!isColumnCollapsed && (
                  <Droppable
                    droppableId={column.id}
                    renderClone={(cloneProvided, cloneSnapshot, rubric) => {
                      const task = board.tasks.find(t => t.id === rubric.draggableId);
                      if (!task) return null;
                      return (
                        <CenteredDragClone
                          draggableProps={cloneProvided.draggableProps}
                          dragHandleProps={cloneProvided.dragHandleProps}
                          innerRef={cloneProvided.innerRef}
                          style={cloneProvided.draggableProps.style as any}
                        >
                          {renderTaskRow(task, cloneProvided.dragHandleProps, cloneSnapshot.isDragging)}
                        </CenteredDragClone>
                      );
                    }}
                  >
                    {(dropProvided) => (
                      <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="pl-3 space-y-1.5">
                        {columnActive.map((task, taskIndex) => (
                          <Draggable key={task.id} draggableId={task.id} index={taskIndex}>
                            {(taskProvided, taskSnapshot) => (
                              <div ref={taskProvided.innerRef} {...taskProvided.draggableProps}>
                                {renderTaskRow(task, taskProvided.dragHandleProps, taskSnapshot.isDragging)}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {dropProvided.placeholder}
                        {columnCompleted.length > 0 && (
                          <div className="border border-label-green/20 rounded-xl bg-label-green/5 overflow-hidden">
                            <button
                              onClick={() => setCollapsedCompletedCols(prev => prev.includes(column.id) ? prev.filter(id => id !== column.id) : [...prev, column.id])}
                              className="w-full flex items-center justify-between px-4 py-3"
                            >
                              <span className="text-sm font-semibold text-label-green flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" />
                                Completed ({columnCompleted.length})
                              </span>
                              {isCompletedCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                            </button>
                            {!isCompletedCollapsed && (
                              <div className="border-t border-border/60 px-2 py-2 space-y-1.5">
                                {columnCompleted.map(task => (
                                  <CompletedTaskRow
                                    key={task.id}
                                    task={task}
                                    onToggleComplete={toggleTaskCompletion}
                                    onOpenTask={onTaskClick}
                                    onDeleteTask={(t) => deleteTask(t.id)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>
                )}
              </div>
            );
          })}
          </DragDropContext>

          {onAddTask && (
            <button
              onClick={onAddTask}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-muted-foreground hover:text-primary hover:bg-primary/5 border-2 border-dashed border-border hover:border-primary/20 rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
          )}
        </div>
    </div>

      {editingColumn && columnEditPos && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setEditingColumn(null); closeColumnEdit(); }}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-2xl animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <span className="text-base font-bold text-foreground">Edit Column</span>
              <button onClick={() => { setEditingColumn(null); closeColumnEdit(); }} className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Name</label>
                <input
                  autoFocus
                  value={editingColumn.name}
                  onChange={e => setEditingColumn(prev => prev ? { ...prev, name: e.target.value } : null)}
                  className="w-full bg-muted/30 border border-border rounded-xl p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLUMN_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setEditingColumn(prev => prev ? { ...prev, color: c } : null)}
                      className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${editingColumn.color === c ? 'border-foreground ring-2 ring-primary/30' : 'border-transparent'}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">Icon</label>
                <div className="flex gap-2">
                  <input
                    value={editingColumn.icon}
                    onChange={e => setEditingColumn(prev => prev ? { ...prev, icon: e.target.value } : null)}
                    placeholder="e.g. 📁 or 🚀"
                    className="flex-1 bg-muted/30 border border-border rounded-xl p-2.5 text-sm text-foreground focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                  <button
                    onClick={() => {
                      if (editingColumn.name.trim()) {
                        updateColumn(editingColumn.id, { title: editingColumn.name.trim(), color: editingColumn.color, icon: editingColumn.icon || undefined });
                      }
                      setEditingColumn(null);
                      closeColumnEdit();
                    }}
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

      {tagPopupTaskId && (() => {
        const popupTask = board.tasks.find(t => t.id === tagPopupTaskId);
        if (!popupTask) return null;
        return (
          <TagsModal
            open
            title="Tags"
            onClose={() => setTagPopupTaskId(null)}
            tags={allTags}
            selectedIds={popupTask.labels.map(label => label.id)}
            onToggle={labelId => { const label = allTags.find(t => t.id === labelId); if (label) toggleTaskTag(popupTask.id, label); }}
            onCreate={async (name, color) => {
              const tag = await createTag({ name, color });
              const label = sharedTagToLabel(tag);
              updateTask(popupTask.id, { labels: [...popupTask.labels, label] });
            }}
            onDelete={deleteTagEverywhere}
            onRename={renameTagEverywhere}
            onColorChange={changeTagColorEverywhere}
            emptyText="No tags yet. Create one below."
          />
        );
      })()}

      {singleDeleteTaskId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setSingleDeleteTaskId(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Delete task?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setSingleDeleteTaskId(null)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  deleteTask(singleDeleteTaskId);
                  setSingleDeleteTaskId(null);
                }}
                className="px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-all"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ListView;