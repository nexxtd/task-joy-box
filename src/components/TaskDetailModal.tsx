import React, { useState } from 'react';
import { Task, DEFAULT_LABELS, Label, LABEL_COLORS, PRIORITY_CONFIG, Priority } from '@/types/board';
import { useBoardContext } from '@/context/BoardContext';
import { X, Calendar, Tag, CheckSquare, Plus, Trash2, Flag, AlignLeft, Repeat, FileUp, File, Trash, Sparkles, Eye } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose }) => {
  const { updateTask, deleteTask, addChecklist, toggleChecklistItem, addChecklistItem, deleteChecklistItem, board } = useBoardContext();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [editingItem, setEditingItem] = useState<{ checklistId: string; itemId: string; text: string } | null>(null);
  const { user } = useAuth();
  const isPremium = user?.subscriptionTier === 'premium';
  const isPro = user?.subscriptionTier === 'pro' || isPremium;
  const [uploading, setUploading] = useState(false);

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

  const handleEditItem = (checklistId: string, itemId: string, newText: string) => {
    if (newText.trim()) {
      const updatedChecklists = task.checklists.map(cl => {
        if (cl.id === checklistId) {
          return {
            ...cl,
            items: cl.items.map(item => 
              item.id === itemId ? { ...item, text: newText.trim() } : item
            )
          };
        }
        return cl;
      });
      updateTask(task.id, { checklists: updatedChecklists });
      setEditingItem(null);
    }
  };

  const handleDeleteChecklist = (checklistId: string) => {
    if (window.confirm('Are you sure you want to delete this checklist?')) {
      const updatedChecklists = task.checklists.filter(cl => cl.id !== checklistId);
      updateTask(task.id, { checklists: updatedChecklists });
    }
  };

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
    try {
      const res = await fetch(`/api/attachments/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (res.ok) {
        updateTask(task.id, {
          attachments: (task.attachments || []).filter(a => a.id !== id)
        });
      }
    } catch (error) {
      console.error('Error deleting attachment:', error);
    }
  };

  
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-start justify-between z-10">
          <div className="flex-1">
            <h2 className="w-full text-lg font-semibold text-foreground">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              in column: <span className="text-foreground font-medium">{currentColumn?.title}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Labels */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" /> Labels
              </h4>
              <button onClick={() => setShowLabelPicker(!showLabelPicker)} className="text-xs text-primary hover:underline">
                {showLabelPicker ? 'Close' : 'Edit'}
              </button>
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
            {showLabelPicker && (
              <div className="grid grid-cols-2 gap-1.5 p-3 bg-muted/50 rounded-lg animate-fade-in">
                {DEFAULT_LABELS.map(label => {
                  const active = task.labels.find(l => l.id === label.id);
                  return (
                    <button
                      key={label.id}
                      onClick={() => toggleLabel(label)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all ${active ? 'ring-2 ring-primary bg-muted' : 'hover:bg-muted'}`}
                    >
                      <div className={`w-3 h-3 rounded-full ${LABEL_COLORS[label.color]}`} />
                      <span className="text-foreground">{label.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Priority */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Flag className="w-3.5 h-3.5" /> Priority
              </h4>
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
            </div>

            {/* Due date */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Calendar className="w-3.5 h-3.5" /> Due Date
              </h4>
              <input
                type="date"
                value={task.dueDate || ''}
                onChange={e => updateTask(task.id, { dueDate: e.target.value || undefined })}
                className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-border/50">
            {/* Subject */}
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
              className="w-full bg-muted border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring min-h-[80px]"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-6 pt-4 border-t border-border/50">
            {/* Recurrence */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Repeat className="w-3.5 h-3.5" /> Recurrence {!isPro && <Sparkles className="w-2.5 h-2.5 text-primary" />}
              </h4>
              <select
                disabled={!isPro}
                value={task.recurrencePattern || ''}
                onChange={e => updateTask(task.id, { recurrencePattern: (e.target.value as any) || null })}
                className={`w-full bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring ${!isPro && 'opacity-50 cursor-not-allowed'}`}
              >
                <option value="">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
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
                  <a
                    key={a.id}
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

            {task.checklists.map(cl => {
              const done = cl.items.filter(i => i.completed).length;
              const total = cl.items.length;
              const pct = total > 0 ? (done / total) * 100 : 0;
              return (
                <div key={cl.id} className="mb-4 last:mb-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{cl.title}</span>
                      {total > 0 && <span className="text-[11px] text-muted-foreground">{done}/{total}</span>}
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="w-full h-1.5 bg-muted rounded-full mb-2 overflow-hidden">
                      <div className="h-full bg-label-green rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <div className="space-y-1">
                    {cl.items.map(item => {
                      const isEditing = editingItem?.checklistId === cl.id && editingItem?.itemId === item.id;
                      return (
                        <div key={item.id} className="flex items-center gap-2 group">
                          <input type="checkbox" checked={item.completed} onChange={() => toggleChecklistItem(task.id, cl.id, item.id)} className="w-4 h-4 rounded border-border accent-primary" />
                          <span 
                            className={`text-sm flex-1 ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}
                          >
                            {item.text}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <input
                      value={newItemTexts[cl.id] || ''}
                      onChange={e => setNewItemTexts(p => ({ ...p, [cl.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleAddItem(cl.id)}
                      placeholder="Add item..."
                      className="flex-1 bg-transparent border-b border-border text-sm text-foreground placeholder:text-muted-foreground py-1 focus:outline-none focus:border-primary transition-colors"
                    />
                    <button onClick={() => handleAddItem(cl.id)} className="text-xs text-primary hover:underline">Add</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Delete */}
<div className="pt-4 border-t border-border" />
        </div>
      </div>
    </div>
  );
};

export default TaskDetailModal;
