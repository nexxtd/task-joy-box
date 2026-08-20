import React from 'react';
import { X, Trash2 } from 'lucide-react';

interface Tag { id: number; name: string; color: string; }

interface NoteTagPopupProps {
  open: boolean;
  noteTags: Tag[];
  allTags: Tag[];
  newTagName: string;
  newTagColor: string;
  tagColors: string[];
  onClose: () => void;
  onToggleTag: (tagId: number) => void;
  onAddTag: () => void;
  onDeleteTag: (tagId: number) => void;
  onNewTagNameChange: (name: string) => void;
  onNewTagColorChange: (color: string) => void;
}

const NoteTagPopup: React.FC<NoteTagPopupProps> = ({
  open, noteTags, allTags, newTagName, newTagColor, tagColors,
  onClose, onToggleTag, onAddTag, onDeleteTag, onNewTagNameChange, onNewTagColorChange
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">Tags</h3>
            <p className="text-xs text-muted-foreground">Assign tags to this note.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {allTags.map(tag => {
            const active = noteTags.some(t => t.id === tag.id);
            return (
              <div key={tag.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                <button onClick={() => onToggleTag(tag.id)} className="flex flex-1 items-center gap-2 text-left">
                  <span className={`h-3 w-3 rounded-full ${active ? 'ring-2 ring-offset-2 ring-offset-background' : ''}`} style={{ backgroundColor: tag.color }} />
                  <span className="text-sm text-foreground">{tag.name}</span>
                  {active && <span className="ml-auto text-[10px] font-semibold text-primary">Selected</span>}
                </button>
                <button onClick={() => onDeleteTag(tag.id)} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Delete tag everywhere">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <div className="flex gap-2">
            <input value={newTagName} onChange={e => onNewTagNameChange(e.target.value)} placeholder="Create tag"
              className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <button onClick={() => onNewTagColorChange(tagColors[(tagColors.indexOf(newTagColor) + 1) % tagColors.length])} className="w-12 rounded-xl border border-border" style={{ backgroundColor: newTagColor }} title="Random color" />
            <button onClick={onAddTag} disabled={!newTagName.trim()} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Add</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoteTagPopup;
