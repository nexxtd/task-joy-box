import React, { useCallback, useState } from 'react';
import { GripVertical, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { CircleToggle, SquareToggle } from '@/components/ToggleComponents';
import type { Checklist, ChecklistItem, Subtask, TaskStatus } from '@/types/board';

export const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string; className: string }> = [
  { value: 'to_do', label: 'To Do', className: 'bg-muted text-muted-foreground' },
  { value: 'in_progress', label: 'In Progress', className: 'bg-label-blue/15 text-label-blue' },
  { value: 'review', label: 'Review', className: 'bg-label-orange/15 text-label-orange' },
  { value: 'completed', label: 'Completed', className: 'bg-label-green/15 text-label-green' },
];

export const StatusSelector: React.FC<{
  status: TaskStatus;
  onChange: (status: TaskStatus) => void;
}> = ({ status, onChange }) => (
  <div className="flex flex-wrap gap-1.5">
    {STATUS_OPTIONS.map(opt => (
      <button
        key={opt.value}
        onClick={() => onChange(opt.value)}
        className={`text-xs font-medium px-2.5 py-1 rounded-full transition-all ${
          status === opt.value ? opt.className + ' ring-1 ring-inset ring-current' : 'bg-muted/40 text-muted-foreground hover:bg-muted'
        }`}
      >
        {opt.label}
      </button>
    ))}
  </div>
);

interface ChecklistSubtaskEditorProps {
  /** Unique id of the parent entity (goal/habit/note id), used to namespace drag-drop droppable ids. */
  entityId: string;
  checklists: Checklist[];
  subtasks: Subtask[];
  onChecklistsChange: (checklists: Checklist[]) => void;
  onSubtasksChange: (subtasks: Subtask[]) => void;
}

/**
 * Reusable checklist + sub-task editor with working rename and drag-to-reorder,
 * generalized from the Task page's editor so it can be reused on Goals, Habits, and Notes.
 */
const ChecklistSubtaskEditor: React.FC<ChecklistSubtaskEditorProps> = ({
  entityId,
  checklists,
  subtasks,
  onChecklistsChange,
  onSubtasksChange,
}) => {
  const [subtasksCollapsed, setSubtasksCollapsed] = useState(false);
  const [checklistsCollapsed, setChecklistsCollapsed] = useState(false);
  const [collapsedChecklists, setCollapsedChecklists] = useState<Set<string>>(new Set());

  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');

  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('');
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [editingChecklistText, setEditingChecklistText] = useState('');
  const [perChecklistInput, setPerChecklistInput] = useState<Record<string, string>>({});

  const subtaskTotal = subtasks.length;
  const subtaskDone = subtasks.filter(s => s.completed).length;
  const subtaskPct = subtaskTotal > 0 ? Math.round((subtaskDone / subtaskTotal) * 100) : 0;
  const allSubtasksDone = subtaskTotal > 0 && subtaskDone === subtaskTotal;
  const checklistTotal = checklists.reduce((s, l) => s + l.items.length, 0);
  const checklistDone = checklists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
  const checklistPct = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;
  const allChecklistsDone = checklistTotal > 0 && checklistDone === checklistTotal;

  const updateSubtask = (subtaskId: string, updates: Partial<Subtask>) => {
    onSubtasksChange(subtasks.map(st => (st.id === subtaskId ? { ...st, ...updates } : st)));
  };

  const addSubtask = () => {
    if (!newSubtaskText.trim()) return;
    onSubtasksChange([...subtasks, { id: crypto.randomUUID(), text: newSubtaskText.trim(), completed: false }]);
    setNewSubtaskText('');
  };

  const removeSubtask = (subtaskId: string) => {
    onSubtasksChange(subtasks.filter(st => st.id !== subtaskId));
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
      onChecklistsChange(
        checklists.map(list =>
          list.id !== checklistId
            ? list
            : { ...list, items: list.items.map(item => (item.id === itemId ? { ...item, text: next } : item)) }
        )
      );
    }
    setEditingChecklistItemId(null);
    setEditingChecklistText('');
  };

  const toggleChecklistItem = (checklistId: string, itemId: string) => {
    onChecklistsChange(
      checklists.map(list =>
        list.id !== checklistId
          ? list
          : { ...list, items: list.items.map(item => (item.id === itemId ? { ...item, completed: !item.completed } : item)) }
      )
    );
  };

  const addChecklistItem = (checklistId: string, text: string) => {
    if (!text.trim()) return;
    onChecklistsChange(
      checklists.map(list =>
        list.id !== checklistId
          ? list
          : { ...list, items: [...list.items, { id: crypto.randomUUID(), text: text.trim(), completed: false }] }
      )
    );
  };

  const deleteChecklistItem = (checklistId: string, itemId: string) => {
    onChecklistsChange(
      checklists.map(list => (list.id !== checklistId ? list : { ...list, items: list.items.filter(item => item.id !== itemId) }))
    );
  };

  const handleReorder = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      if (result.source.droppableId === `subtasks-${entityId}`) {
        const items = Array.from(subtasks);
        const [removed] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, removed);
        onSubtasksChange(items);
      } else if (result.source.droppableId === `checklist-lists-${entityId}`) {
        const items = Array.from(checklists);
        const [removed] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, removed);
        onChecklistsChange(items);
      } else if (result.source.droppableId.startsWith(`checklist-${entityId}-`)) {
        const srcChecklistId = result.source.droppableId.replace(`checklist-${entityId}-`, '');
        const dstChecklistId = result.destination.droppableId.replace(`checklist-${entityId}-`, '');

        if (srcChecklistId === dstChecklistId) {
          onChecklistsChange(
            checklists.map(cl =>
              cl.id === srcChecklistId
                ? {
                    ...cl,
                    items: (() => {
                      const items = Array.from(cl.items);
                      const [removed] = items.splice(result.source.index, 1);
                      items.splice(result.destination!.index, 0, removed);
                      return items;
                    })(),
                  }
                : cl
            )
          );
        } else {
          let movedItem: ChecklistItem | null = null;
          const without = checklists.map(cl =>
            cl.id === srcChecklistId
              ? (() => {
                  const items = Array.from(cl.items);
                  [movedItem] = items.splice(result.source.index, 1);
                  return { ...cl, items };
                })()
              : cl
          );
          if (!movedItem) return;
          onChecklistsChange(
            without.map(cl =>
              cl.id === dstChecklistId
                ? { ...cl, items: [...cl.items.slice(0, result.destination!.index), movedItem!, ...cl.items.slice(result.destination!.index)] }
                : cl
            )
          );
        }
      }
    },
    [entityId, subtasks, checklists, onSubtasksChange, onChecklistsChange]
  );

  return (
    <div className="space-y-4">
      {/* Sub-tasks Section */}
      <div className="rounded-2xl border border-border bg-muted/20">
        <button onClick={() => setSubtasksCollapsed(prev => !prev)} className="w-full flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Sub-tasks</h3>
            {subtasks.length > 0 && <span className="text-xs text-muted-foreground">({subtasks.length})</span>}
          </div>
          {subtasksCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>
        {!subtasksCollapsed && (
          <div className="border-t border-border/60 px-4 py-3 space-y-3">
            <div className="h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={subtaskPct} aria-valuemin={0} aria-valuemax={100} aria-label="Sub-tasks progress" data-testid="subtasks-progress">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${subtaskPct}%` }} data-testid="subtasks-progress-bar" />
            </div>
            {allSubtasksDone && (
              <div className="text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-md inline-block">
                All sub-tasks are done ✓
              </div>
            )}
            <DragDropContext onDragEnd={handleReorder}>
              <Droppable droppableId={`subtasks-${entityId}`} type="subtask">
                {provided => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
                    {subtasks.map((subtask, index) => (
                      <Draggable key={subtask.id} draggableId={subtask.id} index={index}>
                        {provided => (
                          <div ref={provided.innerRef} {...provided.draggableProps} className="min-w-0">
                            <div className="grid grid-cols-[auto_auto_1fr_auto] gap-2 items-center rounded-lg border border-border px-3 py-2 group/subtask">
                              <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                <GripVertical className="w-4 h-4" />
                              </div>
                              <CircleToggle completed={subtask.completed} onClick={() => updateSubtask(subtask.id, { completed: !subtask.completed })} size="sm" />
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
                              <button onClick={() => removeSubtask(subtask.id)} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/subtask:opacity-100 transition-all">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
            <div className="flex gap-2">
              <input
                value={newSubtaskText}
                onChange={e => setNewSubtaskText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addSubtask()}
                placeholder="Add sub-task"
                className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
              />
              <button onClick={addSubtask} className="px-3 py-2 text-xs bg-foreground text-background rounded-lg">Add</button>
            </div>
          </div>
        )}
      </div>

      {/* Checklist Section */}
      <div className="rounded-2xl border border-border bg-muted/20">
        <button onClick={() => setChecklistsCollapsed(prev => !prev)} className="w-full flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Checklist</h3>
            {checklists.length > 0 && <span className="text-xs text-muted-foreground">({checklists.length})</span>}
          </div>
          {checklistsCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>
        {!checklistsCollapsed && (
          <div className="border-t border-border/60 px-4 py-3 space-y-3">
            <div className="h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={checklistPct} aria-valuemin={0} aria-valuemax={100} aria-label="Checklist progress" data-testid="checklist-progress">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${checklistPct}%` }} data-testid="checklist-progress-bar" />
            </div>
            {allChecklistsDone && (
              <div className="text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-md inline-block">
                All checklists are done ✓
              </div>
            )}
            {checklists.length === 0 && <p className="text-xs text-muted-foreground">No checklist yet. Add one below.</p>}
            <DragDropContext onDragEnd={handleReorder}>
              <Droppable droppableId={`checklist-lists-${entityId}`} type="checklistList">
                {provided => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {checklists.map((list, listIndex) => {
                      const isCollapsed = collapsedChecklists.has(list.id);
                      return (
                        <Draggable key={list.id} draggableId={`checklist-list-${list.id}`} index={listIndex}>
                          {provided => (
                            <div ref={provided.innerRef} {...provided.draggableProps} className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden group/list">
                              <div className="flex items-center px-3 py-2 hover:bg-muted/30 transition-all">
                                <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                <button
                                  onClick={() => {
                                    const next = new Set(collapsedChecklists);
                                    if (isCollapsed) next.delete(list.id); else next.add(list.id);
                                    setCollapsedChecklists(next);
                                  }}
                                  className="flex-1 flex items-center gap-2 text-left"
                                >
                                  {editingChecklistId === list.id ? (
                                    <input
                                      autoFocus
                                      className="text-xs font-semibold text-foreground bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5"
                                      value={editingChecklistTitle}
                                      onChange={e => setEditingChecklistTitle(e.target.value)}
                                      onBlur={() => {
                                        if (editingChecklistTitle.trim()) {
                                          onChecklistsChange(checklists.map(cl => (cl.id === list.id ? { ...cl, title: editingChecklistTitle.trim() } : cl)));
                                        }
                                        setEditingChecklistId(null);
                                        setEditingChecklistTitle('');
                                      }}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          if (editingChecklistTitle.trim()) {
                                            onChecklistsChange(checklists.map(cl => (cl.id === list.id ? { ...cl, title: editingChecklistTitle.trim() } : cl)));
                                          }
                                          setEditingChecklistId(null);
                                          setEditingChecklistTitle('');
                                        }
                                      }}
                                    />
                                  ) : (
                                    <span onClick={() => { setEditingChecklistId(list.id); setEditingChecklistTitle(list.title); }} className="text-xs font-semibold text-foreground cursor-text">
                                      {list.title}
                                    </span>
                                  )}
                                </button>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => onChecklistsChange(checklists.filter(cl => cl.id !== list.id))}
                                    className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/list:opacity-100 transition-all"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      const next = new Set(collapsedChecklists);
                                      if (isCollapsed) next.delete(list.id); else next.add(list.id);
                                      setCollapsedChecklists(next);
                                    }}
                                    className="p-1 text-muted-foreground hover:text-foreground"
                                  >
                                    {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                              {!isCollapsed && (
                                <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                                  <Droppable droppableId={`checklist-${entityId}-${list.id}`} type="checklistItem">
                                    {provided => (
                                      <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                                        {list.items.map((item, index) => (
                                          <Draggable key={item.id} draggableId={item.id} index={index}>
                                            {provided => (
                                              <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2.5 text-sm group/item">
                                                <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                                  <GripVertical className="w-4 h-4" />
                                                </div>
                                                <SquareToggle completed={item.completed} onClick={() => toggleChecklistItem(list.id, item.id)} size="md" />
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
                                                <button onClick={() => deleteChecklistItem(list.id, item.id)} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/item:opacity-100 transition-all">
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
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          const text = perChecklistInput[list.id] ?? '';
                                          if (text.trim()) { addChecklistItem(list.id, text); setPerChecklistInput(prev => ({ ...prev, [list.id]: '' })); }
                                        }
                                      }}
                                      placeholder="Add checklist item"
                                      className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs"
                                    />
                                    <button
                                      onClick={() => {
                                        const text = perChecklistInput[list.id] ?? '';
                                        if (text.trim()) { addChecklistItem(list.id, text); setPerChecklistInput(prev => ({ ...prev, [list.id]: '' })); }
                                      }}
                                      className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg"
                                    >
                                      Add
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
            <div className="flex gap-2">
              <input
                value={newChecklistTitle}
                onChange={e => setNewChecklistTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newChecklistTitle.trim()) {
                    onChecklistsChange([...checklists, { id: crypto.randomUUID(), title: newChecklistTitle.trim(), items: [] }]);
                    setNewChecklistTitle('');
                  }
                }}
                placeholder="New checklist name"
                className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={() => {
                  if (newChecklistTitle.trim()) {
                    onChecklistsChange([...checklists, { id: crypto.randomUUID(), title: newChecklistTitle.trim(), items: [] }]);
                    setNewChecklistTitle('');
                  }
                }}
                disabled={!newChecklistTitle.trim()}
                className="px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg disabled:opacity-40"
              >
                Add checklist
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChecklistSubtaskEditor;
