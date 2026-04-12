import React, { useState } from 'react';
import { Task, DEFAULT_LABELS, Label, LABEL_COLORS, PRIORITY_CONFIG, Priority } from '@/types/board';
import { useBoardContext } from '@/context/BoardContext';
import {
  X, Calendar, Tag, CheckSquare, Plus, Trash2, Flag,
  AlignLeft, MoreHorizontal
} from 'lucide-react';

interface TaskDetailModalProps {
  task: Task;
  onClose: () => void;
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({ task, onClose }) => {
  const { updateTask, deleteTask, addChecklist, toggleChecklistItem, addChecklistItem, deleteChecklistItem, board } = useBoardContext();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});

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
    setShowPriorityPicker(false);
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

  const handleDelete = () => {
    deleteTask(task.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-start justify-between z-10">
          <div className="flex-1 ml-4">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              onBlur={saveTitle}
              className="w-full bg-transparent text-lg font-semibold text-foreground focus:outline-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              בעמודה: <span className="text-foreground font-medium">{currentColumn?.title}</span>
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
                <Tag className="w-3.5 h-3.5" /> תוויות
              </h4>
              <button onClick={() => setShowLabelPicker(!showLabelPicker)} className="text-xs text-primary hover:underline">
                {showLabelPicker ? 'סגור' : 'ערוך'}
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

          {/* Priority */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <Flag className="w-3.5 h-3.5" /> עדיפות
            </h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setPriority('none')}
                className={`text-xs px-3 py-1.5 rounded-md border transition-all ${task.priority === 'none' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'}`}
              >
                ללא
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
              <Calendar className="w-3.5 h-3.5" /> תאריך יעד
            </h4>
            <input
              type="date"
              value={task.dueDate || ''}
              onChange={e => updateTask(task.id, { dueDate: e.target.value || undefined })}
              className="bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Description */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-2">
              <AlignLeft className="w-3.5 h-3.5" /> תיאור
            </h4>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              onBlur={saveDescription}
              placeholder="הוסף תיאור למשימה..."
              className="w-full bg-muted border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring min-h-[80px]"
              rows={3}
            />
          </div>

          {/* Checklists */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5" /> צ׳קליסטים
              </h4>
              <button
                onClick={() => setAddingChecklist(true)}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> הוסף צ׳קליסט
              </button>
            </div>

            {addingChecklist && (
              <div className="flex gap-2 mb-3 animate-fade-in">
                <input
                  autoFocus
                  value={newChecklistTitle}
                  onChange={e => setNewChecklistTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddChecklist()}
                  placeholder="שם הצ׳קליסט..."
                  className="flex-1 bg-muted border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button onClick={handleAddChecklist} className="bg-primary text-primary-foreground text-xs font-medium px-3 py-2 rounded-md">הוסף</button>
                <button onClick={() => setAddingChecklist(false)} className="text-xs text-muted-foreground px-2">ביטול</button>
              </div>
            )}

            {task.checklists.map(cl => {
              const done = cl.items.filter(i => i.completed).length;
              const total = cl.items.length;
              const pct = total > 0 ? (done / total) * 100 : 0;
              return (
                <div key={cl.id} className="mb-4 last:mb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-foreground">{cl.title}</span>
                    {total > 0 && (
                      <span className="text-[11px] text-muted-foreground">{done}/{total}</span>
                    )}
                  </div>
                  {total > 0 && (
                    <div className="w-full h-1.5 bg-muted rounded-full mb-2 overflow-hidden">
                      <div
                        className="h-full bg-label-green rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    {cl.items.map(item => (
                      <div key={item.id} className="flex items-center gap-2 group">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          onChange={() => toggleChecklistItem(task.id, cl.id, item.id)}
                          className="w-4 h-4 rounded border-border accent-primary"
                        />
                        <span className={`text-sm flex-1 ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {item.text}
                        </span>
                        <button
                          onClick={() => deleteChecklistItem(task.id, cl.id, item.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {/* Add item */}
                  <div className="flex gap-2 mt-2">
                    <input
                      value={newItemTexts[cl.id] || ''}
                      onChange={e => setNewItemTexts(p => ({ ...p, [cl.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleAddItem(cl.id)}
                      placeholder="הוסף פריט..."
                      className="flex-1 bg-transparent border-b border-border text-sm text-foreground placeholder:text-muted-foreground py-1 focus:outline-none focus:border-primary transition-colors"
                    />
                    <button
                      onClick={() => handleAddItem(cl.id)}
                      className="text-xs text-primary hover:underline"
                    >
                      הוסף
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Delete */}
          <div className="pt-4 border-t border-border">
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 text-sm text-destructive hover:bg-destructive/10 px-3 py-2 rounded-md transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              מחק משימה
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailModal;
