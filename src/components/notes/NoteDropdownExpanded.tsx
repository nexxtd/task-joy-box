import React, { useState } from 'react';
import { Calendar, Clock3, Tag, CheckSquare, Plus, Trash2 } from 'lucide-react';
import { Task, Label, LabelColor, LABEL_COLORS } from '@/types/board';
import TagsModal from '@/components/shared/TagsModal';
import TaskMediaSections from '@/components/shared/TaskMediaSections';
import { useAuth } from '@/context/AuthContext';

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
 * start/due dates, plain checklists / subtasks, plus images
 * and file attachments (notes share the Task model). No
 * duration editor.
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
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [newItemTexts, setNewItemTexts] = useState<Record<string, string>>({});
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const { user } = useAuth();
  const isPremium = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';

  React.useEffect(() => { setDescription(note.description || ''); }, [note.id]);

  const saveDescription = () => {
    if (description !== (note.description || '')) onUpdateNote(note.id, { description });
  };

  const handleAddChecklist = () => {
    if (newChecklistTitle.trim()) {
      onAddChecklist(note.id, newChecklistTitle.trim());
      setNewChecklistTitle('');
      setAddingChecklist(false);
    }
  };

  const handleAddItem = (checklistId: string) => {
    const text = newItemTexts[checklistId];
    if (text?.trim()) {
      onAddChecklistItem(note.id, checklistId, text.trim());
      setNewItemTexts(p => ({ ...p, [checklistId]: '' }));
    }
  };

  const handleAddSubtask = () => {
    if (!newSubtaskText.trim()) return;
    onUpdateNote(note.id, {
      subtasks: [...(note.subtasks || []), { id: crypto.randomUUID(), text: newSubtaskText.trim(), completed: false }],
    });
    setNewSubtaskText('');
  };

  const toggleSubtask = (subtaskId: string) => {
    onUpdateNote(note.id, {
      subtasks: (note.subtasks || []).map(st => st.id === subtaskId ? { ...st, completed: !st.completed } : st),
    });
  };

  const removeSubtask = (subtaskId: string) => {
    onUpdateNote(note.id, { subtasks: (note.subtasks || []).filter(st => st.id !== subtaskId) });
  };

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

      {/* Subtasks (plain — no durations on notes) */}
      <div>
        <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Subtasks</h4>
        {(note.subtasks || []).length > 0 && (
          <div className="space-y-1 mb-2">
            {(note.subtasks || []).map(st => (
              <div key={st.id} className="flex items-center gap-2 group">
                <button
                  onClick={() => toggleSubtask(st.id)}
                  aria-label={st.completed ? 'Mark subtask incomplete' : 'Mark subtask complete'}
                  className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                    st.completed ? 'bg-primary border-primary text-primary-foreground' : 'border-border hover:border-primary'
                  }`}
                >
                  {st.completed && (
                    <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
                      <path d="M2 6.5 4.5 9 10 3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <span className={`flex-1 min-w-0 truncate text-sm ${st.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {st.text}
                </span>
                <button
                  onClick={() => removeSubtask(st.id)}
                  aria-label="Delete subtask"
                  className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-muted-foreground hover:text-destructive opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-all flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={newSubtaskText}
            onChange={e => setNewSubtaskText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddSubtask(); }}
            placeholder="Add subtask..."
            className="flex-1 min-w-0 bg-muted/40 border border-border rounded-lg px-3 py-2 min-h-[44px] text-sm"
          />
          <button onClick={handleAddSubtask} aria-label="Add subtask" className="px-4 min-h-[44px] text-sm font-semibold bg-foreground text-background rounded-lg flex-shrink-0">
            Add
          </button>
        </div>
      </div>

      {/* Checklists (plain items) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <CheckSquare className="w-3.5 h-3.5" /> Checklists
          </h4>
          <button onClick={() => setAddingChecklist(v => !v)} className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1">
            <Plus className="w-3 h-3" /> Add Checklist
          </button>
        </div>
        {addingChecklist && (
          <div className="flex gap-2 mb-3">
            <input
              autoFocus
              value={newChecklistTitle}
              onChange={e => setNewChecklistTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddChecklist()}
              placeholder="Checklist name..."
              className="flex-1 min-w-0 bg-muted/40 border border-border rounded-lg px-3 py-2 min-h-[44px] text-sm"
            />
            <button onClick={handleAddChecklist} className="px-3 min-h-[44px] bg-primary text-primary-foreground text-xs font-semibold rounded-lg flex-shrink-0">Add</button>
          </div>
        )}
        {(note.checklists || []).map(cl => (
          <div key={cl.id} className="rounded-xl border border-border bg-muted/20 px-3 py-2 mb-2">
            <p className="text-sm font-semibold text-foreground mb-1.5">{cl.title}</p>
            <div className="space-y-1">
              {cl.items.map(item => (
                <div key={item.id} className="flex items-center gap-2 group/item">
                  <button
                    onClick={() => onToggleChecklistItem(note.id, cl.id, item.id)}
                    aria-label={item.completed ? 'Mark item incomplete' : 'Mark item complete'}
                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                      item.completed ? 'bg-primary border-primary text-primary-foreground' : 'border-border hover:border-primary'
                    }`}
                  >
                    {item.completed && (
                      <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path d="M2 6.5 4.5 9 10 3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  <span className={`flex-1 min-w-0 truncate text-sm ${item.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {item.text}
                  </span>
                  <button
                    onClick={() => onDeleteChecklistItem(note.id, cl.id, item.id)}
                    aria-label="Delete checklist item"
                    className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-muted-foreground hover:text-destructive opacity-100 md:opacity-0 md:group-hover/item:opacity-100 transition-all flex-shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                value={newItemTexts[cl.id] || ''}
                onChange={e => setNewItemTexts(p => ({ ...p, [cl.id]: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAddItem(cl.id)}
                placeholder="Add item..."
                className="flex-1 min-w-0 bg-muted/40 border border-border rounded-lg px-3 py-2 min-h-[44px] text-xs"
              />
              <button onClick={() => handleAddItem(cl.id)} className="px-3 min-h-[44px] text-xs font-semibold bg-foreground text-background rounded-lg flex-shrink-0">Add</button>
            </div>
          </div>
        ))}
      </div>

      {/* Images & Files */}
      <TaskMediaSections task={note} onUpdateTask={onUpdateNote} tier={user?.subscriptionTier} isPremium={isPremium} />
    </div>
  );
};

export default NoteDropdownExpanded;
