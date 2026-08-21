import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import { useAnchoredPopup } from '@/hooks/useAnchoredPopup';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CenteredDragClone from '@/components/CenteredDragClone';
import TagsModal from '@/components/shared/TagsModal';
import { Progress } from '@/components/ui/progress';
import { fileToDataUrl as fileToDataUrlShared } from '@/lib/fileDataUrl';
import { createTag, updateTag, deleteTag, fetchTags } from '@/services/tagService';

/**
 * Shared page template that provides common drag-and-drop, inline editing,
 * tags modal, and progress bar functionality for Tasks, Habits, Goals, and Notes.
 * 
 * Each page provides:
 * - contextHook: the React hook providing board/add/update/etc functions
 * - itemType: 'task' | 'habit' | 'goal' | 'note' (for proper type handling)
 * - getItems: function to filter/get the current page's items
 * - getGroupedItems: function to group items by column/project
 * - renderItemRow: function to render a single item row (type-specific)
 * - renderCreationModal: function to render the creation modal (type-specific)
 * - getDueWarning: function to compute due warning level (type-specific)
 * - onToggleComplete: function to handle task completion toggle (type-specific)
 * - onAddClick: function for "Add new" button (type-specific)
 * - getOrderedIds: function to get ordered item IDs (type-specific)
 * - extraState: any extra state needed by the specific page
 * - onStateChange: callback for when shared state changes (type-specific)
 */

interface SharedPageTemplateProps {
  /** React hook providing board context (addTask, updateTask, etc.) */
  contextHook: any;
  /** Type identifier: 'task', 'habit', 'goal', 'note' */
  itemType: 'task' | 'habit' | 'goal' | 'note';
  /** Function to get filtered items for the current page */
  getItems: (board: any, filters: any) => any[];
  /** Function to get grouped items by column/project */
  getGroupedItems: (board: any, items: any[]) => any[];
  /** Function to render a single item row - receives task/habit/goal/note and taskProvided/taskSnapshot */
  renderItemRow: (
    item: any,
    taskProvided: any,
    taskSnapshot: any,
    extra: any
  ) => React.ReactNode;
  /** Function to render the creation modal - type-specific */
  renderCreationModal: (open: boolean, onClose: () => void, extras: any) => React.ReactNode;
  /** Function to compute due warning level */
  getDueWarning: (item: any) => 'soon' | 'imminent' | 'overdue' | 'normal' | null;
  /** Function to handle completion toggle */
  onToggleComplete: (item: any) => void;
  /** Function for "Add new" button action */
  onAddClick: () => void;
  /** Function to get ordered active IDs */
  getOrderedIds: () => string[];
  /** Extra state object passed through to child components */
  extraState: any;
  /** Callback for when shared state changes */
  onStateChange: (state: any) => void;
  /** Optional: whether inline editing is enabled */
  inlineEditEnabled?: boolean;
}

/**
 * SharedPageTemplate - provides common drag-and-drop, inline editing,
 * tags modal, and progress bar functionality across all item types.
 */
const SharedPageTemplate: React.FC<SharedPageTemplateProps> = ({
  contextHook,
  itemType,
  getItems,
  getGroupedItems,
  renderItemRow,
  renderCreationModal,
  getDueWarning,
  onToggleComplete,
  onAddClick,
  getOrderedIds,
  extraState,
  onStateChange,
  inlineEditEnabled = true,
}) => {
  const {
    board,
    addTask,
    updateTask,
    toggleChecklistItem,
    addChecklistItem,
    deleteChecklistItem,
    deleteTask,
    updateColumn,
    reorderTasksInSection,
  } = contextHook;
  const { user } = contextHook.useAuth ? contextHook.useAuth() : { user: { subscriptionTier: 'free' } };

  const tier = user?.subscriptionTier || 'free';
  const isPremium = tier === 'premium' || tier === 'pro';
  const isPro = tier === 'pro';

  // State shared across the page
  const [projects, setProjects] = useState<any[]>([]);
  const [sharedTags, setSharedTags] = useState<any[]>([]);
  const [projectFilterId, setProjectFilterId] = useState<number | 'all'>('all');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [tagFilterIds, setTagFilterIds] = useState<string[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState<string>('blue');
  const [quickEditTaskId, setQuickEditTaskId] = useState<string | null>(null);
  const [quickEditField, setQuickEditField] = useState<'duration' | 'project' | 'startDate' | 'dueDate' | 'tags' | null>(null);
  const [quickEditDuration, setQuickEditDuration] = useState(0);
  const [quickEditProjectId, setQuickEditProjectId] = useState<number | ''>('');
  const [quickEditStartDate, setQuickEditStartDate] = useState('');
  const [quickEditStartTime, setQuickEditStartTime] = useState('');
  const [quickEditDueDate, setQuickEditDueDate] = useState('');
  const [quickEditDueTime, setQuickEditDueTime] = useState('');
  const [quickEditTags, setQuickEditTags] = useState<string[]>([]);
  const [pendingDragMove, setPendingDragMove] = useState<any>(null);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>(() => {
    try { const v = localStorage.getItem(`-${itemType}-expanded-ids`); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'high' | 'medium' | 'low'>('all');
  const [groupFilterId, setGroupFilterId] = useState<string | null>(null);
  const [sortByDueDate, setSortByDueDate] = useState(false);
  const [sortDueDateDesc, setSortDueDateDesc] = useState(false);
  const [addingTask, setAddingTask] = useState(false);
  const [columnEditId, setColumnEditId] = useState<string | null>(null);
  const { open: openColumnEdit, close: closeColumnEdit, pos: columnEditPos } = useAnchoredPopup();
  const [collapsedProjects, setCollapsedProjects] = useState<number[]>([]);
  const [collapsedColumns, setCollapsedColumns] = useState<string[]>([]);
  const [completedOpen, setCompletedOpen] = useState(true);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedDeleteTaskIds, setSelectedDeleteTaskIds] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleDeleteTaskId, setSingleDeleteTaskId] = useState<string | null>(null);
  const [dateEditTaskId, setDateEditTaskId] = useState<string | null>(null);
  const [dateEditField, setDateEditField] = useState<'start' | 'due' | null>(null);
  const [tagPopupTaskId, setTagPopupTaskId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [tagDeleteConfirm, setTagDeleteConfirm] = useState<string | null>(null);
  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<'overview' | 'deadlines' | 'progress' | 'priority'>('overview');
  const [analysisResult, setAnalysisResult] = useState<any | null>(null);
  const [mainTmplPopupOpen, setMainTmplPopupOpen] = useState(false);
  const [mainTemplates, setMainTemplates] = useState<any[]>([]);
  const [aiBuilderOpen, setAiBuilderOpen] = useState(false);
  const [aiBuilderInput, setAiBuilderInput] = useState('');
  const [aiBuilderLoading, setAiBuilderLoading] = useState(false);
  const [aiBuilderError, setAiBuilderError] = useState('');
  const [aiBuilderFiles, setAiBuilderFiles] = useState<any[]>([]);
  const [aiBuilderImages, setAiBuilderImages] = useState<any[]>([]);
  const [aiTaskDraft, setAiTaskDraft] = useState<any | null>(null);
  const [orderedActiveIds, setOrderedActiveIds] = useState<string[]>([]);

  // Load projects
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

  // Load shared tags
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

  // All tags memo
  const allTags = useMemo<any>(() => {
    // DEFAULT_LABELS would be imported per-type, but we provide a base set
    return [];
  }, [board.tasks]);

  // Filtered items
  const filtered = useMemo(() => {
    const byGroup = getGroupedItems(board, getItems(board, {
      search, priorityFilter, projectFilterId, tagFilterIds,
    }));

    const active = byGroup.filter(item => !isTaskCompleted(item));
    const completed = byGroup.filter(item => isTaskCompleted(item));

    // Sort
    const sortByDue = (a: any, b: any) => {
      const aDate = a.dueDate ? new Date(`${a.dueDate}T${a.dueTime || '23:59'}`) : null;
      const bDate = b.dueDate ? new Date(`${b.dueDate}T${b.dueTime || '23:59'}`) : null;
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1;
      if (!bDate) return -1;
      const diff = aDate.getTime() - bDate.getTime();
      return sortDueDateDesc ? -diff : diff;
    };

    const sortByPriorityOrder = (a: any, b: any) => {
      const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      const diff = (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
      if (diff !== 0) return diff;
      return (a.order || 0) - (b.order || 0);
    };

    let activeSorted: any[];
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
  }, [board, getItems, getGroupedItems, search, priorityFilter, projectFilterId, tagFilterIds, sortByDueDate, sortDueDateDesc, orderedActiveIds]);

  const myGroup = useMemo(() =>
    filtered.active.filter(t => !t.projectId),
    [filtered.active]
  );

  const projectGroups = useMemo(() => {
    return projects.map(project => {
      const tasks = filtered.active.filter(t => t.projectId === project.id);
      const columns = board.columns
        .filter(col => (col as any).projectId === project.id)
        .sort((a, b) => a.order - b.order);
      const columnGroups = columns.map(col => ({
        column: col,
        tasks: tasks.filter(t => t.columnId === col.id).sort((a, b) => (a.order || 0) - (b.order || 0)),
        completed: filtered.completed.filter(t => t.projectId === project.id && t.columnId === col.id),
      })).filter(cg => cg.tasks.length > 0 || cg.completed.length > 0);
      const columnIds = new Set(columns.map(c => c.id));
      const uncategorized = tasks.filter(t => !columnIds.has(t.columnId));
      const uncategorizedCompleted = filtered.completed.filter(t => t.projectId === project.id && !columnIds.has(t.columnId));
      if (tasks.length === 0 && columnGroups.length === 0 && uncategorizedCompleted.length === 0) return null;
      return { project, tasks, columnGroups, uncategorized, uncategorizedCompleted };
    }).filter(Boolean) as any[];
  }, [filtered.active, filtered.completed, projects, board.columns]);

  // ============ INLINE EDITORS ============

  const openQuickEdit = (item: any, field: 'duration' | 'project' | 'startDate' | 'dueDate' | 'tags') => {
    setQuickEditTaskId(item.id);
    setQuickEditField(field);
    if (field === 'duration') {
      setQuickEditDuration(Math.max(0, Number(item.duration) || 0));
    }
    if (field === 'project') {
      setQuickEditProjectId(item.projectId || '');
    }
  };

  const openQuickEditDuration = (item: any) => {
    setQuickEditTaskId(item.id);
    setQuickEditField('duration');
    setQuickEditDuration(Math.max(0, Number(item.duration) || 0));
  };

  const openQuickEditProject = (item: any) => {
    setQuickEditTaskId(item.id);
    setQuickEditField('project');
    setQuickEditProjectId(item.projectId || '');
  };

  const openQuickEditStartDate = (item: any) => {
    setQuickEditTaskId(item.id);
    setQuickEditField('startDate');
    setQuickEditStartDate(item.startDate || '');
    setQuickEditStartTime(item.startTime || '');
  };

  const openQuickEditDueDate = (item: any) => {
    setQuickEditTaskId(item.id);
    setQuickEditField('dueDate');
    setQuickEditDueDate(item.dueDate || '');
    setQuickEditDueTime(item.dueTime || '');
  };

  const openQuickEditTags = (item: any) => {
    setQuickEditTaskId(item.id);
    setQuickEditField('tags');
    setQuickEditTags(item.labels.map((l: any) => l.id) || []);
  };

  const closeQuickEdit = () => {
    setQuickEditTaskId(null);
    setQuickEditField(null);
  };

  const applyQuickEdit = (item: any) => {
    const updates: any = {};
    if (quickEditField === 'duration') {
      updates.duration = Math.max(0, Number(quickEditDuration) || 0);
    }
    if (quickEditField === 'project') {
      updates.projectId = quickEditProjectId === '' ? null : Number(quickEditProjectId);
      updates.projectName = quickEditProjectId === ''
        ? undefined
        : (projects.find((p: any) => p.id === Number(quickEditProjectId))?.name || undefined);
    }
    if (quickEditField === 'startDate') {
      updates.startDate = quickEditStartDate || undefined;
      updates.startTime = quickEditStartTime || undefined;
    }
    if (quickEditField === 'dueDate') {
      updates.dueDate = quickEditDueDate || undefined;
      updates.dueTime = quickEditDueTime || undefined;
    }
    if (quickEditField === 'tags') {
      // Tags handling - will be done via the Tags modal
    }
    updateTask(item.id, updates);
    closeQuickEdit();
  };

  // ============ TAG HANDLING ============

  const toggleTaskTag = (item: any, label: any) => {
    const task = board.tasks.find((t: any) => t.id === item.id);
    if (!task) return;
    const has = task.labels.some((l: any) => l.id === label.id);
    updateTask(item.id, { labels: has ? task.labels.filter((l: any) => l.id !== label.id) : [...task.labels, label] });
  };

  const createSharedTag = async (name: string, color: string) => {
    const tag = await createTag({ name, color });
    return { id: `shared-tag-${tag.id}`, name: tag.name, color: tag.color };
  };

  const renameTagEverywhere = async (tagId: string, newName: string) => {
    const name = newName.trim();
    if (!name) return;
    if (tagId.startsWith('shared-tag-')) {
      const sharedTagId = Number(tagId.slice('shared-tag-'.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          const updated = await updateTag(sharedTagId, { name });
          setSharedTags(prev => prev.map(tag => tag.id === sharedTagId ? { ...tag, name: updated.name } : tag));
        } catch (error) {
          console.error('Failed to rename shared tag:', error);
        }
      }
    }
    board.tasks.forEach((task: any) => {
      if (task.labels.some((label: any) => label.id === tagId)) {
        updateTask(task.id, { labels: task.labels.map((label: any) => label.id === tagId ? { ...label, name } : label) });
      }
    });
  };

  const changeTagColorEverywhere = async (tagId: string, color: string) => {
    if (tagId.startsWith('shared-tag-')) {
      const sharedTagId = Number(tagId.slice('shared-tag-'.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          const updated = await updateTag(sharedTagId, { color });
          setSharedTags(prev => prev.map(tag => tag.id === sharedTagId ? { ...tag, color: updated.color } : tag));
        } catch (error) {
          console.error('Failed to update tag color:', error);
        }
      }
    }
    board.tasks.forEach((task: any) => {
      if (task.labels.some((label: any) => label.id === tagId)) {
        updateTask(task.id, { labels: task.labels.map((label: any) => label.id === tagId ? { ...label, color } : label) });
      }
    });
  };

  const deleteTagEverywhere = async (tagId: string) => {
    if (tagId.startsWith('shared-tag-')) {
      const sharedTagId = Number(tagId.slice('shared-tag-'.length));
      if (!Number.isNaN(sharedTagId)) {
        try {
          await deleteTag(sharedTagId);
        } catch (error) {
          console.error('Failed to delete shared tag:', error);
        }
      }
    }
    board.tasks.forEach((task: any) => {
      if (task.labels.some((label: any) => label.id === tagId)) {
        updateTask(task.id, { labels: task.labels.filter((label: any) => label.id !== tagId) });
      }
    });
    setTagFilterIds(prev => prev.filter(id => id !== tagId));
  };

  // ============ DRAG-AND-DROP ============

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || sortByDueDate) return;

    const srcId = result.source.droppableId;
    const dstId = result.destination.droppableId;
    const isCrossColumn = srcId !== dstId;
    const isCrossProject = /* determine based on itemType */ false;

    // Cross-project drag confirmation (simplified)
    if (isCrossProject) {
      const confirmKey = `-${itemType}-drag-confirm-project`;
      if (localStorage.getItem(confirmKey) === 'true') {
        // Apply the drag move directly
        const srcItems = /* get source items */ [];
        const dstItems = /* get destination items */ [];
        if (!srcItems || !dstItems) return;
        const movingItemId = srcItems[result.source.index]?.id;
        if (!movingItemId) return;

        // Update order in destination
        const newColumnId = dstId.startsWith('col-') ? dstId.slice(4) : undefined;
        const updateFields: any = {};
        if (newColumnId) updateFields.columnId = newColumnId;

        updateTask(movingItemId, updateFields);

        // Reorder IDs
        const srcIds = srcItems.map(t => t.id);
        const dstIds = dstItems.map(t => t.id);
        const [removed] = srcIds.splice(result.source.index, 1);
        dstIds.splice(result.destination.index, 0, removed);
        srcIds.forEach((id: string, idx: number) => updateTask(id, { order: idx }));
        dstIds.forEach((id: string, idx: number) => updateTask(id, { order: idx }));

        // Update ordered active IDs
        const base = orderedActiveIds.length > 0 ? [...orderedActiveIds] : filtered.active.map(t => t.id);
        const srcSet = new Set(srcItems.map(t => t.id));
        const dstSet = new Set(dstItems.map(t => t.id));
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
        return;
      }
      // Set pending drag move for confirmation
      setPendingDragMove({ /* ... */ });
      return;
    }

    if (isCrossColumn) {
      // Similar column drag handling
      const confirmKey = `-${itemType}-drag-confirm-column`;
      if (localStorage.getItem(confirmKey) === 'true') {
        // Apply direct move
        return;
      }
      setPendingDragMove({ /* ... */ });
      return;
    }

    // Same section reorder
    const sectionItems = /* get section items */ [];
    if (!sectionItems) return;

    const sectionTaskIds = sectionItems.map(t => t.id);
    const ids = [...sectionTaskIds];
    const [removed] = ids.splice(result.source.index, 1);
    ids.splice(result.destination.index, 0, removed);

    ids.forEach((id: string, idx: number) => updateTask(id, { order: idx }));

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
  };

  // ============ PROGRESS BARS ============

  // Progress bar for sub-tasks/checklist - computed per item
  const getProgressInfo = (item: any) => {
    // Calculate subtask and checklist progress
    const subtaskTotal = item.subtasks?.length || 0;
    const subtaskDone = item.subtasks?.filter((s: any) => s.completed).length || 0;
    const checklistTotal = item.checklists?.reduce((s: any, l: any) => s + l.items.length, 0) || 0;
    const checklistDone = item.checklists?.reduce((s: any, l: any) => s + l.items.filter((i: any) => i.completed).length, 0) || 0;
    const totalItems = subtaskTotal + checklistTotal;
    const doneItems = subtaskDone + checklistDone;
    const pct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : null;

    return { subtaskTotal, subtaskDone, checklistTotal, checklistDone, totalItems, doneItems, pct };
  };

  // ============ OVERDUE WARNING ============

  const dueWarning = useMemo(() => 
    getDueWarning(filtered.active[0] || {}), 
    [filtered.active, getDueWarning]
  );

  // ============ RENDER ============

  const renderClone = (taskProvided: any, taskSnapshot: any, rubric: any) => {
    const draggedTask =
      rubric?.source?.index != null ? filtered.active[rubric.source.index] ?? filtered.completed[rubric.source.index - filtered.active.length] : null;
    if (!draggedTask) return null;
    return (
      <CenteredDragClone
        draggableProps={taskProvided.draggableProps}
        dragHandleProps={taskProvided.dragHandleProps}
        innerRef={taskProvided.innerRef}
        style={taskProvided.draggableProps.style as any}
        zoom={1}
      >
        {renderItemRow(draggedTask, taskProvided, taskSnapshot, extraState)}
      </CenteredDragClone>
    );
  };

  return (
    <div>
      {/* Creation modal */}
      {renderCreationModal(addingTask, () => setAddingTask(false), {
        projects, setProjects,
        tier, isPremium, isPro,
        onAddClick,
      })}

      {/* Quick inline editors */}
      {quickEditTaskId && quickEditField && (
        <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 bg-muted/20 rounded-b-xl">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              {quickEditField === 'duration' && (
                <div>
                  <input
                    type="number"
                    min={0}
                    value={quickEditDuration}
                    onChange={e => setQuickEditDuration(Math.max(0, Number(e.target.value) || 0))}
                    onBlur={() => applyQuickEdit(filtered.active.find(t => t.id === quickEditTaskId)!)}
                    className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  <span className="text-xs text-muted-foreground">minutes</span>
                </div>
              )}
              {quickEditField === 'project' && (
                <Select value={quickEditProjectId === '' ? 'my-tasks' : String(quickEditProjectId)} onValueChange={val => setQuickEditProjectId(val === 'my-tasks' ? '' : Number(val))}>
                  <SelectTrigger className="w-40 rounded-lg border border-background bg-background px-3 py-2 text-sm h-9">
                    <SelectValue placeholder="My Tasks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="my-tasks">My Tasks</SelectItem>
                    {projects.map(project => (<SelectItem key={project.id} value={String(project.id)}>{project.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              )}
              {quickEditField === 'startDate' && (
                <div className="flex flex-col gap-1">
                  <input
                    type="date"
                    value={quickEditStartDate}
                    onChange={e => setQuickEditStartDate(e.target.value || '')}
                    className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" />
                  <input
                    type="time"
                    value={quickEditStartTime}
                    onChange={e => setQuickEditStartTime(e.target.value || '')}
                    className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" />
                </div>
              )}
              {quickEditField === 'dueDate' && (
                <div className="flex flex-col gap-1">
                  <input
                    type="date"
                    value={quickEditDueDate}
                    onChange={e => setQuickEditDueDate(e.target.value || '')}
                    className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" />
                  <input
                    type="time"
                    value={quickEditDueTime}
                    onChange={e => setQuickEditDueTime(e.target.value || '')}
                    className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" />
                </div>
              )}
              {quickEditField === 'tags' && (
                <div className="flex flex-col gap-1">
                  <TagsModal
                    open={!!quickEditTaskId}
                    onClose={() => setQuickEditTaskId(null)}
                    tags={allTags}
                    selectedIds={quickEditTags}
                    onToggle={tagId => {
                      const label = allTags.find((t: any) => t.id === tagId);
                      if (label) {
                        const tags = quickEditTags.includes(tagId) 
                          ? quickEditTags.filter(id => id !== tagId) 
                          : [...quickEditTags, tagId];
                        setQuickEditTags(tags);
                      }
                    }}
                    onCreate={async (name, color) => {
                      // Tag creation handled separately
                    }}
                    onDelete={tagId => {}}
                    onRename={(tagId, newName) => {}}
                    onColorChange={(tagId, color) => {}}
                  />
                  <div className="text-[10px] text-muted-foreground">
                    {quickEditTags.length > 0 ? quickEditTags.length + ' tag(s) selected' : 'No tags selected'}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => applyQuickEdit(filtered.active.find(t => t.id === quickEditTaskId)!)} className="ml-auto rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Save</button>
            <button onClick={closeQuickEdit} className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}

      {/* Tags popup for item */}
      {tagPopupTaskId && (() => {
        const popupItem = board.tasks.find((t: any) => t.id === tagPopupTaskId);
        if (!popupItem) return null;
        return (
          <TagsModal
            open={!!tagPopupTaskId}
            onClose={() => setTagPopupTaskId(null)}
            tags={allTags}
            selectedIds={popupItem.labels.map((l: any) => l.id)}
            onToggle={tagId => {
              const label = allTags.find((t: any) => t.id === tagId);
              if (label) toggleTaskTag(filtered.active.find((t: any) => t.id === tagPopupTaskId)!, label);
            }}
            onCreate={async (name, color) => {
              try {
                const newTag = await createSharedTag(name, color);
                updateTask(popupItem.id, { labels: [...popupItem.labels, newTag] });
              } catch (error) {
                console.error('Failed to create tag:', error);
              }
            }}
            onDelete={tagId => deleteTagEverywhere(tagId)}
            onRename={(tagId, newName) => renameTagEverywhere(tagId, newName)}
            onColorChange={(tagId, color) => changeTagColorEverywhere(tagId, color)}
          />
        );
      })()}

      {/* Main content area with drag-and-drop */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="my-${itemType}" type="item" renderClone={renderClone}>
          {(dropProvided, snapshot) => (
            <div
              ref={dropProvided.innerRef}
              {...dropProvided.droppableProps}
              className={`space-y-3 rounded-xl transition-all duration-300 ${snapshot.isDraggingOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset' : ''}`}
            >
              {/* Uncompleted items */}
              {filtered.active.map((item, itemIndex) => (
                <Draggable
                  key={item.id}
                  draggableId={item.id}
                  index={itemIndex}
                >
                  {(taskProvided, taskSnapshot) => renderItemRow(
                    item,
                    taskProvided,
                    taskSnapshot,
                    extraState
                  )}
                </Draggable>
              ))}

              {/* Placeholder for drag preview */}
              {dropProvided.placeholder}

              {/* Completed items section */}
              {filtered.completed.length > 0 && (
                <div className="pt-2" data-no-pan="true">
                  <div className="border border-label-green/20 rounded-xl bg-label-green/5 overflow-hidden">
                    <button
                      onClick={() => setCompletedOpen(prev => !prev)}
                      className="w-full flex items-center justify-between px-4 py-3"
                    >
                      <span className="text-sm font-semibold text-label-green flex items-center gap-2">
                        {/* icon based on itemType */}Completed ({filtered.completed.length})
                      </span>
                      {/* toggle icon */}
                    </button>
                    <div className="border-t border-border/60 px-2 py-2 space-y-1.5">
                      {filtered.completed.map((item: any) => (
                        <div className="p-2 rounded-md bg-card hover:bg-muted/10 transition-colors">
                          {/* Render completed item row - simplified */}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
};

export default SharedPageTemplate;

/**
 * Helper: checks if an item is completed
 */
const isTaskCompleted = (item: any) =>
  Boolean(item.completed || item.status === 'completed');