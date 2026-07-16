import React, { useState } from 'react';
import { X, Tag, Star, Plus, FolderKanban } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Project { id: number; name: string; color: string; }
interface Tag { id: number; name: string; color: string; }
interface BoardColumn { id: string; title: string; order: number; projectId?: number | null; }

interface NoteCreateModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string; content: string; color: string;
    projectId: string; columnId: string; selectedTagIds: number[];
  }) => Promise<void>;
  projects: Project[];
  boardColumns: BoardColumn[];
  tags: Tag[];
  noteColors: string[];
  saving?: boolean;
}

const NoteCreateModal: React.FC<NoteCreateModalProps> = ({
  open, onClose, onSave, projects, boardColumns, tags, noteColors, saving
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState(noteColors[0]);
  const [projectId, setProjectId] = useState('');
  const [columnId, setColumnId] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  if (!open) return null;

  const resetState = () => {
    setTitle(''); setContent(''); setColor(noteColors[0]);
    setProjectId(''); setColumnId(''); setSelectedTagIds([]);
    setTagPickerOpen(false);
  };

  const handleSave = async () => {
    await onSave({ title, content, color, projectId, columnId, selectedTagIds });
    resetState();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={onClose}>
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Create Note</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Note title</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm" />
          </div>

          <div className="flex gap-2">
            {noteColors.map(c => (
              <button key={c} onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Project</label>
              <Select value={projectId || 'none'} onValueChange={v => { setProjectId(v === 'none' ? '' : v); setColumnId(''); }}>
                <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                  <SelectValue placeholder="My Notes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">My Notes</SelectItem>
                  {projects.map(p => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Tags</label>
            <div className="mt-1 relative">
              {selectedTagIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tags.filter(t => selectedTagIds.includes(t.id)).map(tag => (
                    <span key={tag.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: tag.color }}>
                      {tag.name}
                      <button onClick={() => setSelectedTagIds(prev => prev.filter(id => id !== tag.id))} className="hover:opacity-70"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <button onClick={() => setTagPickerOpen(!tagPickerOpen)}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
                <Tag className="w-3.5 h-3.5" />
                {selectedTagIds.length > 0 ? `${selectedTagIds.length} tag${selectedTagIds.length > 1 ? 's' : ''} selected` : 'Add tags'}
              </button>
              {tagPickerOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setTagPickerOpen(false)} />
                  <div className="absolute left-0 bottom-full mb-2 w-96 max-w-[95vw] bg-card border border-border rounded-2xl shadow-xl z-30 p-4 space-y-3">
                    <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                      {tags.map(tag => {
                        const active = selectedTagIds.includes(tag.id);
                        return (
                          <button key={tag.id} onClick={() => setSelectedTagIds(prev => active ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left ${active ? 'border-primary/30 bg-primary/5 shadow-sm' : 'border-border/60 hover:bg-muted/40'}`}>
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                            <span className="text-sm text-foreground flex-1">{tag.name}</span>
                            {active && <span className="text-[10px] text-primary font-bold">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Content</label>
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={4}
              className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end items-center gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all">
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default NoteCreateModal;
