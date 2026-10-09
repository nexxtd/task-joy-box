import React, { useCallback, useEffect, useState } from 'react';
import { Tag, ChevronDown, ChevronUp, GripVertical, Trash2, Flag } from 'lucide-react';
import { Task, Label, LabelColor, LABEL_COLORS, ChecklistItem, Priority, PRIORITY_CONFIG } from '@/types/board';
import TagsModal from '@/components/shared/TagsModal';
import TaskMediaSections from '@/components/shared/TaskMediaSections';
import { SquareToggle } from '@/components/ToggleComponents';
import { useAuth } from '@/context/AuthContext';
import { readTaskSections, writeTaskSections } from '@/lib/taskSectionState';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';

export interface NoteDropdownExpandedProps {
  note: Task;
  onUpdateNote: (noteId: string, updates: Partial<Task>) => void;
  onToggleChecklistItem: (noteId: string, checklistId: string, itemId: string) => void;
  onAddChecklistItem: (noteId: string, checklistId: string, text: string) => void;
  onDeleteChecklistItem: (noteId: string, checklistId: string, itemId: string) => void;
  onAddChecklist: (noteId: string, title: string) => void;
  allTags: Label[];
  onToggleTag: (tagId: string) => void;
  onCreateTag?: (name: string, color: LabelColor) => void | Promise<void>;
  onDeleteTag?: (tagId: string) => void;
  onRenameTag?: (tagId: string, newName: string) => void;
  onColorChangeTag?: (tagId: string, color: LabelColor) => void;
}

/**
 * The NOTE version of the expanded row panel: content, tags,
 * checklists (same logic as tasks: edit / delete / hide / move
 * for lists, and edit / move / delete for items), plus images
 * and file attachments (notes share the Task model).
 * Notes intentionally have NO subtasks section.
 */
export const NoteDropdownExpanded: React.FC<NoteDropdownExpandedProps> = ({
  note,
  onUpdateNote,
  onToggleChecklistItem,
  onAddChecklistItem,
  onDeleteChecklistItem,
  onAddChecklist,
  allTags,
  onToggleTag,
  onCreateTag,
  onDeleteTag,
  onRenameTag,
  onColorChangeTag,
}) => {
  const [description, setDescription] = useState(note.description || '');
  const [showTags, setShowTags] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [editingChecklistText, setEditingChecklistText] = useState('');
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState('');
  const [perChecklistInput, setPerChecklistInput] = useState<Record<string, string>>({});
  const [checklistsSectionCollapsed, setChecklistsSectionCollapsed] = useState(
    () => readTaskSections(note.id).checklists ?? false,
  );
  const [collapsedChecklists, setCollapsedChecklists] = useState<Set<string>>(
    () => new Set(readTaskSections(note.id).collapsedLists ?? []),
  );
  const { user } = useAuth();
  const isPremium = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';

  React.useEffect(() => { setDescription(note.description || ''); }, [note.id]);

  useEffect(() => {
    const prev = readTaskSections(note.id);
    writeTaskSections(note.id, {
      ...prev,
      checklists: checklistsSectionCollapsed,
      collapsedLists: [...collapsedChecklists],
    });
  }, [note.id, checklistsSectionCollapsed, collapsedChecklists]);

  const saveDescription = () => {
    if (description !== (note.description || '')) onUpdateNote(note.id, { description });
  };

  // Hide the legacy "subtasks" checklist the same way the task dropdown and
  // the note full view do — notes have no subtasks UI at all.
  const legacySubtasksChecklist = (note.checklists || []).find(
    list => list.title.toLowerCase().trim() === 'subtasks',
  );
  const checklistLists = (note.checklists || []).filter(
    list => list.id !== legacySubtasksChecklist?.id,
  );
  const checklistTotal = checklistLists.reduce((s, l) => s + l.items.length, 0);
  const checklistDone = checklistLists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
  const checklistPct = checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;
  const allChecklistsDone = checklistTotal > 0 && checklistDone === checklistTotal;

  const handleAddChecklist = () => {
    const title = newChecklistTitle.trim();
    if (!title) return;
    if (onAddChecklist) {
      onAddChecklist(note.id, title);
    } else {
      onUpdateNote(note.id, {
        checklists: [...(note.checklists || []), { id: crypto.randomUUID(), title, items: [] }],
      });
    }
    setNewChecklistTitle('');
  };

  const saveChecklistItemEdit = (checklistId: string, itemId: string) => {
    const next = editingChecklistText.trim();
    if (next) {
      onUpdateNote(note.id, {
        checklists: (note.checklists || []).map(list =>
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

  const saveChecklistTitleEdit = (listId: string) => {
    const next = editingChecklistTitle.trim();
    if (next) {
      onUpdateNote(note.id, {
        checklists: (note.checklists || []).map(cl =>
          cl.id === listId ? { ...cl, title: next } : cl,
        ),
      });
    }
    setEditingChecklistId(null);
    setEditingChecklistTitle('');
  };

  const deleteChecklist = (listId: string) => {
    onUpdateNote(note.id, {
      checklists: (note.checklists || []).filter(cl => cl.id !== listId),
    });
  };

  const toggleListCollapsed = (listId: string) => {
    setCollapsedChecklists(prev => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      return next;
    });
  };

  const handleDropdownReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    if (result.source.droppableId === `dropdown-checklist-lists-${note.id}`) {
      const items = Array.from(note.checklists || []);
      const [removed] = items.splice(result.source.index, 1);
      if (!removed) return;
      items.splice(result.destination.index, 0, removed);
      onUpdateNote(note.id, { checklists: items });
    } else if (result.source.droppableId.startsWith(`dropdown-checklist-${note.id}-`)) {
      const srcChecklistId = result.source.droppableId.replace(`dropdown-checklist-${note.id}-`, '');
      const dstChecklistId = result.destination.droppableId.replace(`dropdown-checklist-${note.id}-`, '');

      if (srcChecklistId === dstChecklistId) {
        onUpdateNote(note.id, {
          checklists: (note.checklists || []).map(cl =>
            cl.id === srcChecklistId
              ? { ...cl, items: (() => {
                  const items = Array.from(cl.items);
                  const [removed] = items.splice(result.source.index, 1);
                  if (!removed) return items;
                  items.splice(result.destination!.index, 0, removed);
                  return items;
                })() }
              : cl
          ),
        });
      } else {
        let movedItem: ChecklistItem | null = null;
        const without = (note.checklists || []).map(cl =>
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
  }, [note.id, note.checklists, onUpdateNote]);

  const addItemToList = (checklistId: string) => {
    const text = (perChecklistInput[checklistId] ?? '').trim();
    if (!text) return;
    onAddChecklistItem(note.id, checklistId, text);
    setPerChecklistInput(prev => ({ ...prev, [checklistId]: '' }));
  };

  const PRIORITY_OPTIONS: Array<{ value: Priority; label: string }> = [
    { value: 'urgent', label: 'Urgent' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
    { value: 'none', label: 'None' },
  ];

  return (
    <div className="space-y-4">
      {/* Description */}
      <div>
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Content</h4>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          onBlur={saveDescription}
          placeholder="Write your note..."
          rows={3}
          className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[72px]"
        />
      </div>

      {/* Urgency (Priority) — same as tasks, no dates */}
      <div>
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
          <Flag className="w-3.5 h-3.5" /> Urgency
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {PRIORITY_OPTIONS.map(opt => {
            const isActive = (note.priority || 'none') === opt.value;
            const cfg = opt.value !== 'none' ? PRIORITY_CONFIG[opt.value as Exclude<Priority, 'none'>] : null;
            return (
              <button
                key={opt.value}
                onClick={() => onUpdateNote(note.id, { priority: opt.value })}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all flex-shrink-0 ${
                  isActive
                    ? cfg
                      ? `${cfg.className} text-primary-foreground`
                      : 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tags */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" /> Tags
          </h4>
          <button
            onClick={() => setShowTags(v => !v)}
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            {showTags ? 'Close' : 'Edit tags'}
          </button>
        </div>
        {note.labels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {note.labels.map(l => (
              <span key={l.id} className={`${LABEL_COLORS[l.color]} text-[11px] font-medium px-2.5 py-1 rounded-full text-primary-foreground`}>
                {l.name}
              </span>
            ))}
          </div>
        )}
        {showTags && (
          <TagsModal
            open={showTags}
            onClose={() => setShowTags(false)}
            title="Tags"
            tags={allTags}
            selectedIds={note.labels.map(l => l.id)}
            onToggle={onToggleTag}
            onCreate={onCreateTag}
            onDelete={onDeleteTag}
            onRename={onRenameTag}
            onColorChange={onColorChangeTag}
            emptyText="No tags yet. Create one below."
          />
        )}
      </div>

      {/* Checklists — same logic as the task dropdown: edit / delete / hide / move lists, edit / move / delete items */}
      <div className="rounded-2xl border border-border bg-muted/20">
        <button
          onClick={() => setChecklistsSectionCollapsed(prev => !prev)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Checklists</h3>
            {checklistLists.length > 0 && (
              <span className="text-xs text-muted-foreground">({checklistLists.length})</span>
            )}
          </div>
          {checklistsSectionCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>
        {!checklistsSectionCollapsed && (
          <div className="border-t border-border/60 px-4 py-3 space-y-3">
            <div className="h-2 bg-muted rounded-full overflow-hidden" role="progressbar" aria-valuenow={checklistPct} aria-valuemin={0} aria-valuemax={100} aria-label="Checklist progress">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${checklistPct}%` }} />
            </div>
            {allChecklistsDone && (
              <div className="text-xs text-primary bg-primary/10 px-2.5 py-1 rounded-md inline-block">
                All checklists are done ✓
              </div>
            )}
            {checklistLists.length === 0 && <p className="text-xs text-muted-foreground">No checklist yet. Add one below.</p>}
            <DragDropContext onDragEnd={handleDropdownReorder}>
              <Droppable droppableId={`dropdown-checklist-lists-${note.id}`} type="checklistList">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {checklistLists.map((list, listIndex) => {
                      const isCollapsed = collapsedChecklists.has(list.id);
                      return (
                        <Draggable key={list.id} draggableId={`checklist-list-${list.id}`} index={listIndex}>
                          {(provided) => (
                            <div ref={provided.innerRef} {...provided.draggableProps} className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden checklist-card">
                              <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 transition-all min-w-0 group/header">
                                <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0" title="Move checklist">
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                <button
                                  onClick={() => toggleListCollapsed(list.id)}
                                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                                >
                                  <span className="text-xs text-muted-foreground shrink-0">({list.items.length})</span>
                                  {editingChecklistId === list.id ? (
                                    <input
                                      autoFocus
                                      className="text-xs font-semibold text-foreground bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5 min-w-0 flex-1"
                                      value={editingChecklistTitle}
                                      onChange={e => setEditingChecklistTitle(e.target.value)}
                                      onClick={e => e.stopPropagation()}
                                      onBlur={() => saveChecklistTitleEdit(list.id)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') saveChecklistTitleEdit(list.id);
                                        if (e.key === 'Escape') { setEditingChecklistId(null); setEditingChecklistTitle(''); }
                                      }}
                                    />
                                  ) : (
                                    <span
                                      onClick={(e) => { e.stopPropagation(); setEditingChecklistId(list.id); setEditingChecklistTitle(list.title); }}
                                      className="text-sm font-semibold text-foreground cursor-text truncate"
                                      title="Click to edit"
                                    >
                                      {list.title}
                                    </span>
                                  )}
                                </button>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <button
                                    onClick={() => deleteChecklist(list.id)}
                                    title="Delete checklist"
                                    className="p-1 text-muted-foreground hover:text-destructive opacity-100 md:opacity-0 md:group-hover/header:opacity-100 checklist-header-delete transition-opacity duration-200"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => toggleListCollapsed(list.id)}
                                    title={isCollapsed ? 'Show items' : 'Hide items'}
                                    className="p-1 text-muted-foreground hover:text-foreground"
                                  >
                                    {isCollapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>
                              {!isCollapsed && (
                                <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                                  <Droppable droppableId={`dropdown-checklist-${note.id}-${list.id}`} type="checklistItem">
                                    {(provided) => (
                                      <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1.5">
                                        {list.items.map((item, index) => (
                                          <Draggable key={item.id} draggableId={item.id} index={index}>
                                            {(provided) => (
                                              <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2.5 text-sm group/item checklist-item">
                                                <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0" title="Move item">
                                                  <GripVertical className="w-4 h-4" />
                                                </div>
                                                <SquareToggle
                                                  completed={item.completed}
                                                  onClick={() => onToggleChecklistItem(note.id, list.id, item.id)}
                                                  size="md"
                                                />
                                                {editingChecklistItemId === item.id ? (
                                                  <input
                                                    autoFocus
                                                    className="flex-1 min-w-0 text-sm bg-muted/40 border border-primary/30 rounded px-2 py-0.5"
                                                    value={editingChecklistText}
                                                    onChange={e => setEditingChecklistText(e.target.value)}
                                                    onBlur={() => saveChecklistItemEdit(list.id, item.id)}
                                                    onKeyDown={e => {
                                                      if (e.key === 'Enter') saveChecklistItemEdit(list.id, item.id);
                                                      if (e.key === 'Escape') { setEditingChecklistItemId(null); setEditingChecklistText(''); }
                                                    }}
                                                  />
                                                ) : (
                                                  <span
                                                    onClick={(e) => { e.stopPropagation(); setEditingChecklistItemId(item.id); setEditingChecklistText(item.text); }}
                                                    className={`flex-1 min-w-0 cursor-text truncate ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                                                    title="Click to edit"
                                                  >
                                                    {item.text}
                                                  </span>
                                                )}
                                                <button
                                                  onClick={() => onDeleteChecklistItem(note.id, list.id, item.id)}
                                                  title="Delete item"
                                                  className="p-1 text-muted-foreground hover:text-destructive opacity-100 md:opacity-0 md:group-hover/item:opacity-100 transition-opacity duration-200 flex-shrink-0"
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
                                  <div className="flex gap-2 pt-1">
                                    <input
                                      value={perChecklistInput[list.id] ?? ''}
                                      onChange={e => setPerChecklistInput(prev => ({ ...prev, [list.id]: e.target.value }))}
                                      onKeyDown={e => { if (e.key === 'Enter') addItemToList(list.id); }}
                                      placeholder="Add item..."
                                      className="flex-1 min-w-0 bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs"
                                    />
                                    <button onClick={() => addItemToList(list.id)} className="px-3 py-2 text-xs bg-primary text-primary-foreground rounded-lg flex-shrink-0">Add</button>
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
                onKeyDown={e => { if (e.key === 'Enter') handleAddChecklist(); }}
                placeholder="New checklist name"
                className="flex-1 min-w-0 bg-muted/40 border border-border rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={handleAddChecklist}
                disabled={!newChecklistTitle.trim()}
                className="px-4 py-2 text-xs font-semibold bg-primary text-primary-foreground rounded-lg disabled:opacity-40 flex-shrink-0"
              >
                Add checklist
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Images & Files */}
      <TaskMediaSections task={note} onUpdateTask={onUpdateNote} tier={user?.subscriptionTier} isPremium={isPremium} />
    </div>
  );
};

export default NoteDropdownExpanded;
