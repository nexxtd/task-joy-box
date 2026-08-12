import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Task, DEFAULT_LABELS, Label, LABEL_COLORS, PRIORITY_CONFIG, Priority, LabelColor } from '@/types/board';
import { useBoardContext } from '@/context/BoardContext';
import { X, Calendar, Clock3, Tag, CheckSquare, Plus, Trash2, Flag, AlignLeft, Repeat, FileUp, File, Trash, Sparkles, Eye, GripVertical } from 'lucide-react';
import { SquareToggle } from '@/components/ToggleComponents';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useAuth } from '@/context/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createTag, deleteTag, fetchTags, updateTag, type SharedTag } from '@/services/tagService';
import TagsModal from '@/components/shared/TagsModal';

const SHARED_TAG_PREFIX = 'shared-tag-';

const normalizeTagName = (value: string) => value.trim().replace(/\s+/g, ' ');

const sharedTagToLabel = (tag: SharedTag): Label => ({
  id: `${SHARED_TAG_PREFIX}${tag.id}`,
  name: tag.name,
  color: tag.color as LabelColor,
});

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
  canEdit?: boolean;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose, canEdit = true }) => {
  const { updateTask, deleteTask, addChecklist, toggleChecklistItem, addChecklistItem, deleteChecklistItem, board } = useBoardContext();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [editingChecklistItemId, setEditingChecklistItemId] = useState<string | null>(null);
  const [editingChecklistItemText, setEditingChecklistItemText] = useState('');
  const { user } = useAuth();
  const isPremium = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  const isPro = user?.subscriptionTier === 'pro';
  const [uploading, setUploading] = useState(false);
  const [sharedTags, setSharedTags] = useState<SharedTag[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tags = await fetchTags();
        if (!cancelled) setSharedTags(tags);
      } catch (error) {
        console.error('Failed to load shared tags:', error);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allTags = useMemo<Label[]>(() => {
    const byName = new Map<string, Label>();
    DEFAULT_LABELS.forEach(label => byName.set(normalizeTagName(label.name).toLowerCase(), label));
    sharedTags.forEach(tag => byName.set(normalizeTagName(tag.name).toLowerCase(), sharedTagToLabel(tag)));
    return Array.from(byName.values());
  }, [sharedTags]);

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

    board.tasks.forEach(t => {
      if (t.labels.some(label => label.id === tagId)) {
        updateTask(t.id, { labels: t.labels.filter(label => label.id !== tagId) });
      }
    });
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

    board.tasks.forEach(t => {
      if (t.labels.some(label => label.id === tagId)) {
        updateTask(t.id, { labels: t.labels.map(label => label.id === tagId ? { ...label, name } : label) });
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

    board.tasks.forEach(t => {
      if (t.labels.some(label => label.id === tagId)) {
        updateTask(t.id, { labels: t.labels.map(label => label.id === tagId ? { ...label, color } : label) });
      }
    });
  };

  const currentColumn = board.columns.find(c => c.id === task.columnId);

  const saveTitle = () => {
    if (title.trim() && title !== task.title) updateTask(task.id, { title: title.trim() });
  };

  const saveDescription = () => {
    if (description !== task.description) updateTask(task.id, { description });
  };

  const toggleLabel = (label: Label) => {
    const has = task.labels.find(l => l.id === label.id);
    const newLabels = has ? task.labels.filter(l => l.id !== label.id) : [...task.labels, label];
    updateTask(task.id, { labels: newLabels });
  };

  const setPriority = (p: Priority) => {
    updateTask(task.id, { priority: p });
  };

  const handleAddChecklist = () => {
    if (newChecklistTitle.trim()) {
      addChecklist(task.id, newChecklistTitle.trim());
      setNewChecklistTitle('');
      setAddingChecklist(false);
    }
  };

  const handleAddItem = (checklistId: string) => {
    const text = newItemTexts[checklistId];
    if (text?.trim()) {
      addChecklistItem(task.id, checklistId, text.trim());
      setNewItemTexts(p => ({ ...p, [checklistId]: '' }));
    }
  };

  const saveChecklistItemEdit = (checklistId: string, itemId: string) => {
    const next = editingChecklistItemText.trim();
    if (next) {
      const updatedChecklists = task.checklists.map(cl => {
        if (cl.id === checklistId) {
          return {
            ...cl,
            items: cl.items.map(item => 
              item.id === itemId ? { ...item, text: next } : item
            )
          };
        }
        return cl;
      });
      updateTask(task.id, { checklists: updatedChecklists });
    }
    setEditingChecklistItemId(null);
    setEditingChecklistItemText('');
  };

  const handleDeleteChecklist = (checklistId: string) => {
    if (window.confirm('Are you sure you want to delete this checklist?')) {
      const updatedChecklists = task.checklists.filter(cl => cl.id !== checklistId);
      updateTask(task.id, { checklists: updatedChecklists });
    }
  };

  const handleChecklistReorder = useCallback((result: DropResult) => {
    if (!result.destination) return;
    const { source, destination } = result;

    if (source.droppableId === 'checklists') {
      const items = Array.from(task.checklists);
      const [removed] = items.splice(source.index, 1);
      items.splice(destination.index, 0, removed);
      updateTask(task.id, { checklists: items });
    } else if (source.droppableId.startsWith('checklist-')) {
      const listId = source.droppableId.replace('checklist-', '');
      const checklist = task.checklists.find(cl => cl.id === listId);
      if (!checklist) return;
      const items = Array.from(checklist.items);
      const [removed] = items.splice(source.index, 1);
      items.splice(destination.index, 0, removed);
      updateTask(task.id, {
        checklists: task.checklists.map(cl =>
          cl.id === listId ? { ...cl, items } : cl
        ),
      });
    }
  }, [task, updateTask]);

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
      deleteTask(task.id);
      onClose();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !isPremium) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`/api/attachments/${task.id}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (res.ok) {
        const newAttachment = await res.json();
        updateTask(task.id, {
          attachments: [...(task.attachments || []), newAttachment]
        });
      }
    } catch (error) {
      console.error('Error uploading file:', error);
    } finally {
      setUploading(false);
    }
  };

  const deleteAttachment = async (id: string) => {
    // Optimistically update
    updateTask(task.id, {
      attachments: (task.attachments || []).filter(a => a.id !== id)
    });

    const isServerAttachment = /^\d+$/.test(id);
    if (isServerAttachment) {
      try {
        await fetch(`/api/attachments/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      } catch (error) {
        console.error('Error deleting attachment:', error);
      }
    }
  };

  
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-start justify-between z-10">
          <div className="flex-1">
            {canEdit ? (
              <input
                className="w-full text-lg font-semibold text-foreground bg-transparent border-none focus:outline-none focus:ring-0"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
              />
            ) : (
              <h2 className="text-lg font-semibold text-foreground truncate">{task.title}</h2>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              in column: <span className="text-foreground font-medium truncate">{currentColumn?.title}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Labels */}
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Tags
              </h4>
              {canEdit && (
                <button
                  onClick={() => setShowLabelPicker(!showLabelPicker)}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-3.5 py-2 text-xs text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                >
                  <Tag className="w-3.5 h-3.5" />
                  {showLabelPicker ? 'Close' : 'Tags'}
                </button>
              )}
            </div>
            {task.labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {task.labels.map(l => (
                  <span key={l.id} className={`${LABEL_COLORS[l.color]} text-xs font-medium px-2.5 py-1 rounded-full text-primary-foreground`}>
                    {l.name}
                  </span>
                ))}
              </div>
            )}
            {showLabelPicker && canEdit && (
              <TagsModal
                open={showLabelPicker}
                onClose={() => setShowLabelPicker(false)}
                title="Tags"
                tags={allTags}
                selectedIds={task.labels.map(l => l.id)}
                onToggle={labelId => {
                  const label = allTags.find(t => t.id === labelId);
                  if (label) toggleLabel(label);
                }}
                onCreate={async (name, color) => {
                  const tag = await createTag({ name, color });
                  const label = sharedTagToLabel(tag);
                  updateTask(task.id, { labels: [...task.labels, label] });
                }}
                onDelete={deleteTagEverywhere}
                onRename={renameTagEverywhere}
                onColorChange={changeTagColorEverywhere}
                emptyText="No tags yet. Create one below."
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-6">
            {/* Priority */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Flag className="w-3.5 h-3.5" /> Priority
              </h4>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setPriority('none')}
                    className={`text-xs px-3 py-1.5 rounded-md border transition-all ${task.priority === 'none' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'}`}
                  >
                    None
                  </button>
                  {(Object.entries(PRIORITY_CONFIG) as [Exclude<Priority, 'none'>, typeof PRIORITY_CONFIG[keyof typeof PRIORITY_CONFIG]][]).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => setPriority(key)}
                      className={`text-xs px-3 py-1.5 rounded-md border transition-all ${task.priority === key ? `${cfg.className} text-primary-foreground border-transparent` : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'}`}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              ) : (
                <span className={`text-xs px-3 py-1.5 rounded-md ${task.priority !== 'none' ? PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG]?.className + ' text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                  {task.priority !== 'none' ? PRIORITY_CONFIG[task.priority as keyof typeof PRIORITY_CONFIG]?.label : 'None'}
                </span>
              )}
            </div>

            {/* Start */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Calendar className="w-3.5 h-3.5" /> Start
              </h4>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="date"
                    value={task.startDate || ''}
                    onChange={e => canEdit && updateTask(task.id, { startDate: e.target.value || undefined })}
                    disabled={!canEdit}
                    className="w-full bg-muted/40 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed [color-scheme:var(--color-scheme)]"
                  />
                </div>
                <div className="relative w-[130px]">
                  <Clock3 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="time"
                    value={task.startTime || ''}
                    onChange={e => canEdit && updateTask(task.id, { startTime: e.target.value || undefined })}
                    disabled={!canEdit}
                    className="w-full bg-muted/40 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed [color-scheme:var(--color-scheme)]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* End - moved to own row */}
          <div className="grid grid-cols-2 gap-6">
            <div />
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Calendar className="w-3.5 h-3.5" /> End
              </h4>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="date"
                    value={task.dueDate || ''}
                    onChange={e => canEdit && updateTask(task.id, { dueDate: e.target.value || undefined })}
                    disabled={!canEdit}
                    className="w-full bg-muted/40 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed [color-scheme:var(--color-scheme)]"
                  />
                </div>
                <div className="relative w-[130px]">
                  <Clock3 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input
                    type="time"
                    value={task.dueTime || ''}
                    onChange={e => canEdit && updateTask(task.id, { dueTime: e.target.value || undefined })}
                    disabled={!canEdit}
                    className="w-full bg-muted/40 border border-border rounded-lg pl-8 pr-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed [color-scheme:var(--color-scheme)]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-border/50">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                Subject / Category
              </h4>
              <input
                type="text"
                value={task.subject || ''}
                onChange={e => updateTask(task.id, { subject: e.target.value || undefined })}
                placeholder="e.g. Maths"
                className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Color & Icon */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                Color & Icon
              </h4>
              <div className="flex gap-2">
                <input
                  type="color"
                  value={task.color || '#000000'}
                  onChange={e => updateTask(task.id, { color: e.target.value })}
                  className="w-10 h-10 rounded-md bg-muted border border-border p-1 cursor-pointer"
                />
                <input
                  type="text"
                  value={task.icon || ''}
                  onChange={e => updateTask(task.id, { icon: e.target.value || undefined })}
                  placeholder="Icon (e.g. 📚)"
                  className="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>
          </div>

          {/* Description */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <AlignLeft className="w-3.5 h-3.5" /> Description
            </h4>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              onBlur={saveDescription}
              placeholder="Add a description..."
              className="w-full bg-muted border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring min-h-[80px] disabled:opacity-60 disabled:cursor-not-allowed"
              rows={3}
              disabled={!canEdit}
            />
          </div>

          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-border/50">
            {/* Recurrence */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Repeat className="w-3.5 h-3.5" /> Recurrence {!isPro && <Sparkles className="w-2.5 h-2.5 text-primary" />}
              </h4>
              <Select
                disabled={!isPro}
                value={task.recurrencePattern || 'none'}
                onValueChange={value => updateTask(task.id, { recurrencePattern: (value === 'none' ? null : value) as any })}
              >
                <SelectTrigger className={`w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring ${!isPro && 'opacity-50 cursor-not-allowed'}`}>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Attachments */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <FileUp className="w-3.5 h-3.5" /> Attachments {!isPremium && <Sparkles className="w-2.5 h-2.5 text-primary" />}
              </h4>
              <div className="group relative mt-1">
                <label className={`flex flex-col items-center justify-center w-full min-h-[80px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer ${(!isPremium || uploading) && 'opacity-50 cursor-not-allowed pointer-events-none'}`}>
                  <div className="flex flex-col items-center justify-center py-2">
                    <FileUp className="w-5 h-5 text-primary mb-1" />
                    <p className="text-[10px] font-medium text-foreground">{uploading ? 'Uploading...' : 'Click to upload'}</p>
                  </div>
                  <input type="file" className="hidden" onChange={handleFileUpload} disabled={!isPremium || uploading} />
                </label>
              </div>

              <div className="space-y-1.5 mt-3">
                {(task.attachments || []).map(a => (
                  <div key={a.id} className="relative group/att">
                    <a
                      href={`/api/attachments/file/${a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/30 hover:bg-muted transition-all group/item"
                    >
                      <File className="w-3.5 h-3.5 text-muted-foreground group-hover/item:text-primary" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-foreground truncate group-hover/item:text-primary transition-colors">
                          {a.fileName}
                        </p>
                      </div>
                    </a>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteAttachment(a.id);
                      }}
                      className="absolute top-1 right-1 p-1 rounded bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/att:opacity-100 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Checklists */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5" /> Checklists
              </h4>
              <button onClick={() => setAddingChecklist(true)} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Checklist
              </button>
            </div>

            {addingChecklist && (
              <div className="flex gap-2 mb-3 animate-fade-in">
                <input
                  autoFocus
                  value={newChecklistTitle}
                  onChange={e => setNewChecklistTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddChecklist()}
                  placeholder="Checklist name..."
                  className="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button onClick={handleAddChecklist} className="bg-primary text-primary-foreground text-xs font-medium px-3 py-2 rounded-md">Add</button>
                <button onClick={() => setAddingChecklist(false)} className="text-xs text-muted-foreground px-2">Cancel</button>
              </div>
            )}

            {task.checklists.length > 0 && (
              <DragDropContext onDragEnd={handleChecklistReorder}>
                <Droppable droppableId="checklists">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-3">
                      {task.checklists.map((cl, index) => {
                        const done = cl.items.filter(i => i.completed).length;
                        const total = cl.items.length;
                        const pct = total > 0 ? (done / total) * 100 : 0;
                        return (
                          <Draggable key={cl.id} draggableId={cl.id} index={index}>
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.draggableProps} className="rounded-xl border border-border bg-muted/20 overflow-hidden group/list">
                                <div className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/30 transition-all min-w-0">
                                  <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                    <GripVertical className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 flex items-center gap-2 min-w-0">
                                    <span className="flex-1 text-sm font-semibold text-foreground truncate">{cl.title}</span>
                                    {total > 0 && <span className="text-xs text-muted-foreground shrink-0">({total})</span>}
                                  </div>
                                  <button
                                    onClick={() => handleDeleteChecklist(cl.id)}
                                    className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/list:opacity-100 transition-all shrink-0"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                {total > 0 && (
                                  <div className="px-3 pb-1">
                                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div className="h-full bg-label-green rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                                    </div>
                                  </div>
                                )}
                                <Droppable droppableId={`checklist-${cl.id}`}>
                                  {(provided) => (
                                    <div ref={provided.innerRef} {...provided.droppableProps} className="px-3 pb-2 space-y-1">
                                      {cl.items.length === 0 && <p className="text-xs text-muted-foreground py-1">No items yet</p>}
                                      {cl.items.map((item, idx) => (
                                        <Draggable key={item.id} draggableId={item.id} index={idx}>
                                          {(provided) => (
                                            <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-2 group min-w-0">
                                              <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
                                                <GripVertical className="w-3.5 h-3.5" />
                                              </div>
                                              <SquareToggle
                                                completed={item.completed}
                                                onClick={() => toggleChecklistItem(task.id, cl.id, item.id)}
                                                size="sm"
                                              />
                                              {editingChecklistItemId === item.id ? (
                                                <input
                                                  autoFocus
                                                  className="flex-1 text-sm bg-muted/40 border border-primary/30 rounded px-1.5 py-0.5 min-w-0"
                                                  value={editingChecklistItemText}
                                                  onChange={e => setEditingChecklistItemText(e.target.value)}
                                                  onBlur={() => saveChecklistItemEdit(cl.id, item.id)}
                                                  onKeyDown={e => e.key === 'Enter' && saveChecklistItemEdit(cl.id, item.id)}
                                                />
                                              ) : (
                                                <span
                                                  onClick={(e) => { e.stopPropagation(); setEditingChecklistItemId(item.id); setEditingChecklistItemText(item.text); }}
                                                  className={`text-sm flex-1 cursor-text truncate ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                                                >
                                                  {item.text}
                                                </span>
                                              )}
                                              <button
                                                onClick={() => deleteChecklistItem(task.id, cl.id, item.id)}
                                                className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                              >
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            </div>
                                          )}
                                        </Draggable>
                                      ))}
                                      {provided.placeholder}
                                    </div>
                                  )}
                                </Droppable>
                                <div className="flex gap-2 px-3 pb-2">
                                  <input
                                    value={newItemTexts[cl.id] || ''}
                                    onChange={e => setNewItemTexts(p => ({ ...p, [cl.id]: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && handleAddItem(cl.id)}
                                    placeholder="Add item..."
                                    className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-xs"
                                  />
                                  <button onClick={() => handleAddItem(cl.id)} className="px-3 py-1.5 text-xs bg-foreground text-background rounded-lg shrink-0">Add</button>
                                </div>
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
            )}
          </div>

          {/* Delete */}
          {canEdit && (
            <div className="pt-4 border-t border-border flex justify-end">
              <button
                onClick={handleDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Task
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskDetailModal;




