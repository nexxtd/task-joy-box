import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Pin,
  Plus,
  Search,
  StickyNote,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface NoteTag {
  id: number;
  name: string;
  color: string;
}

interface Note {
  id: number;
  title: string;
  content: string;
  color: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  tags: NoteTag[];
}

const NOTE_COLORS = [
  'hsl(var(--card))',
  'hsl(45 93% 55% / 0.1)',
  'hsl(142 70% 45% / 0.1)',
  'hsl(217 91% 60% / 0.1)',
  'hsl(252 85% 65% / 0.1)',
  'hsl(330 80% 60% / 0.1)',
];

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
];

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
const randomFrom = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)] || items[0];

const DeleteConfirmDialog: React.FC<{
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ count, onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onCancel} />
    <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
          <Trash2 className="w-5 h-5 text-destructive" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Delete {count} note{count === 1 ? '' : 's'}?</h3>
          <p className="text-xs text-muted-foreground mt-0.5">This action cannot be undone.</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all">Cancel</button>
        <button onClick={onConfirm} className="px-4 py-2 text-sm font-bold bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-all">Delete {count} note{count === 1 ? '' : 's'}</button>
      </div>
    </div>
  </div>
);

const Notes: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<NoteTag[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [sortMode, setSortMode] = useState<'created' | 'modified' | 'alphabetical'>('modified');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [openNoteId, setOpenNoteId] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<number[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<number | null>(null);
  const [tagPopupNoteId, setTagPopupNoteId] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(randomFrom(TAG_COLORS));

  const activeNote = useMemo(() => notes.find(n => n.id === openNoteId) || null, [notes, openNoteId]);
  const tagPopupNote = useMemo(() => notes.find(n => n.id === tagPopupNoteId) || null, [notes, tagPopupNoteId]);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/notes', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch notes');
      const data = await res.json();
      setNotes((data.notes || []).map((note: any) => ({
        id: note.id,
        title: note.title || '',
        content: note.content || '',
        color: note.color || NOTE_COLORS[0],
        pinned: Boolean(note.pinned),
        createdAt: note.createdAt || new Date().toISOString(),
        updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
        tags: Array.isArray(note.tags) ? note.tags : [],
      })));
      setTags((data.tags || []).map((tag: any) => ({ id: tag.id, name: tag.name, color: tag.color })));
      setError(null);
    } catch {
      setError('Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNotes(); }, []);
  useEffect(() => {
    if (!activeNote) return;
    setDraftTitle(activeNote.title);
    setDraftContent(activeNote.content);
  }, [activeNote?.id]);

  const applyNoteUpdate = async (id: number, updates: Partial<Note>) => {
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, ...updates } : n)));
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update note');
      const data = await res.json();
      if (data?.id) setNotes(prev => prev.map(n => (n.id === data.id ? { ...n, ...data } : n)));
    } catch { fetchNotes(); }
  };

  const createNote = async () => {
    try {
      setCreating(true);
      const res = await fetch('/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ title: '', content: '', color: randomFrom(NOTE_COLORS), pinned: false }),
      });
      if (!res.ok) throw new Error('Failed to create note');
      const created = await res.json();
      const next: Note = {
        id: created.id, title: created.title || '', content: created.content || '',
        color: created.color || NOTE_COLORS[0], pinned: Boolean(created.pinned),
        createdAt: created.createdAt || new Date().toISOString(),
        updatedAt: created.updatedAt || created.createdAt || new Date().toISOString(),
        tags: Array.isArray(created.tags) ? created.tags : [],
      };
      setNotes(prev => [next, ...prev]);
      setOpenNoteId(next.id);
    } catch { alert('Failed to save note. Please try again.'); }
    finally { setCreating(false); }
  };

  const deleteNote = async (id: number) => {
    try {
      const res = await fetch(`/api/notes/${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to delete note');
      setNotes(prev => prev.filter(n => n.id !== id));
      if (openNoteId === id) setOpenNoteId(null);
      if (tagPopupNoteId === id) setTagPopupNoteId(null);
    } catch { alert('Failed to delete note. Please try again.'); }
  };

  const togglePin = (note: Note) => applyNoteUpdate(note.id, { pinned: !note.pinned });

  const toggleTagFilter = (tagId: number) =>
    setSelectedTagIds(prev => (prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]));

  const toggleTagOnNote = async (noteId: number, tagId: number) => {
    try {
      const res = await fetch(`/api/notes/${noteId}/tags/${tagId}/toggle`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to toggle tag');
      const data = await res.json();
      if (data?.note?.id) {
        const next = data.note as Note;
        setNotes(prev => prev.map(n => (n.id === next.id ? { ...n, ...next } : n)));
      }
    } catch {}
  };

  const addTagToNote = async () => {
    if (!tagPopupNote || !normalize(newTagName)) return;
    try {
      const res = await fetch(`/api/notes/${tagPopupNote.id}/tags`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ name: normalize(newTagName), color: newTagColor }),
      });
      if (!res.ok) throw new Error('Failed to create tag');
      const data = await res.json();
      if (data?.note?.id) {
        const next = data.note as Note;
        setNotes(prev => prev.map(n => (n.id === next.id ? { ...n, ...next } : n)));
      }
      if (data?.tag) {
        const nextTag = data.tag as NoteTag;
        setTags(prev => prev.some(t => t.id === nextTag.id) ? prev : [...prev, nextTag].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setNewTagName('');
      setNewTagColor(randomFrom(TAG_COLORS));
    } catch {}
  };

  const deleteTagEverywhere = async (tagId: number) => {
    try {
      await fetch(`/api/notes/tags/${tagId}`, { method: 'DELETE', credentials: 'include' });
      setTags(prev => prev.filter(t => t.id !== tagId));
      setNotes(prev => prev.map(n => ({ ...n, tags: n.tags.filter(t => t.id !== tagId) })));
      setSelectedTagIds(prev => prev.filter(id => id !== tagId));
    } catch {}
  };

  const saveDrafts = async () => {
    if (!activeNote) return;
    const nextTitle = draftTitle.trim();
    const nextContent = draftContent;
    if (nextTitle !== activeNote.title || nextContent !== activeNote.content) {
      await applyNoteUpdate(activeNote.id, { title: nextTitle, content: nextContent });
    }
  };

  const filteredNotes = useMemo(() => {
    const term = search.toLowerCase().trim();
    return notes.filter(n => {
      const matchesSearch = !term || n.title.toLowerCase().includes(term) || n.content.toLowerCase().includes(term);
      const matchesTags = selectedTagIds.length === 0 || selectedTagIds.every(id => n.tags.some(t => t.id === id));
      return matchesSearch && matchesTags;
    });
  }, [notes, search, selectedTagIds]);

  const sortedNotes = useMemo(() => {
    const compare = (a: Note, b: Note) => {
      if (sortMode === 'alphabetical') return a.title.localeCompare(b.title);
      const aVal = sortMode === 'created' ? a.createdAt : a.updatedAt;
      const bVal = sortMode === 'created' ? b.createdAt : b.updatedAt;
      return new Date(bVal).getTime() - new Date(aVal).getTime();
    };
    const pinned = filteredNotes.filter(n => n.pinned).sort(compare);
    const unpinned = filteredNotes.filter(n => !n.pinned).sort(compare);
    return { pinned, unpinned };
  }, [filteredNotes, sortMode]);

  const matchingCount = filteredNotes.length;

  const handleBulkDelete = () => {
    if (selectedDeleteIds.length === 0) return;
    setDeleteConfirmOpen(true);
  };

  const confirmBulkDelete = async () => {
    for (const id of selectedDeleteIds) await deleteNote(id);
    setSelectedDeleteIds([]);
    setIsDeleteMode(false);
    setDeleteConfirmOpen(false);
  };

  const confirmSingleDelete = async () => {
    if (singleDeleteId !== null) await deleteNote(singleDeleteId);
    setSingleDeleteId(null);
  };

  const renderNoteRow = (note: Note) => {
    const preview = note.content.split('\n').slice(0, 2).join(' ').trim();
    return (
      <div
        key={note.id}
        className={cn(
          'group border rounded-xl bg-card transition-all duration-200 cursor-pointer',
          isDeleteMode
            ? selectedDeleteIds.includes(note.id)
              ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
              : 'border-border hover:bg-muted/20'
            : 'border-border hover:border-border/80 hover:shadow-sm'
        )}
        onClick={() => {
          if (isDeleteMode) {
            setSelectedDeleteIds(prev => prev.includes(note.id) ? prev.filter(id => id !== note.id) : [...prev, note.id]);
          } else {
            setOpenNoteId(note.id);
          }
        }}
      >
        <div className="flex items-center gap-1 px-3 py-3">
          {isDeleteMode ? (
            <input
              type="checkbox"
              checked={selectedDeleteIds.includes(note.id)}
              onChange={() => {}}
              onClick={e => e.stopPropagation()}
              className="w-4 h-4 rounded border-border accent-destructive flex-shrink-0 cursor-pointer"
            />
          ) : (
            <button
              onClick={e => { e.stopPropagation(); togglePin(note); }}
              className={`p-1.5 rounded-md flex-shrink-0 transition-all ${note.pinned ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
              title={note.pinned ? 'Unpin note' : 'Pin note'}
            >
              <Pin className={`w-3.5 h-3.5 ${note.pinned ? 'fill-current' : ''}`} />
            </button>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium text-left text-foreground truncate">
                {note.title || 'Untitled note'}
              </span>
              {note.tags.slice(0, 3).map(tag => (
                <span
                  key={tag.id}
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
              {note.tags.length > 3 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                  +{note.tags.length - 3}
                </span>
              )}
            </div>
            {preview && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{preview}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="text-[10px] text-muted-foreground">
              {new Date(note.updatedAt || note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            {!isDeleteMode && (
              <>
                <button
                  onClick={e => { e.stopPropagation(); setTagPopupNoteId(note.id); }}
                  className="p-1.5 rounded-md text-muted-foreground/30 hover:text-muted-foreground hover:bg-muted transition-all"
                  title="Edit tags"
                >
                  <Tag className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setSingleDeleteId(note.id); }}
                  className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                  title="Delete note"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-card/30">
        <div>
          <h1 className="text-lg font-bold text-foreground">Notes</h1>
          <p className="text-xs text-muted-foreground">{matchingCount} notes matching filters</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (isDeleteMode) { setIsDeleteMode(false); setSelectedDeleteIds([]); }
              else { setIsDeleteMode(true); setSelectedDeleteIds([]); }
            }}
            className={`flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border transition-all ${
              isDeleteMode
                ? 'bg-destructive/15 border-destructive/30 text-destructive'
                : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {isDeleteMode ? 'Exit Delete' : 'Delete'}
          </button>
          <button
            onClick={createNote}
            disabled={creating}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all disabled:opacity-60"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            New Note
          </button>
        </div>
      </header>

      <div className="px-6 py-4 border-b border-border bg-card/10">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-muted/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex flex-wrap gap-2 min-w-0">
            {tags.map(tag => {
              const active = selectedTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => toggleTagFilter(tag.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all ${
                    active
                      ? 'border-foreground/20 text-foreground shadow-sm'
                      : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </button>
              );
            })}
            {selectedTagIds.length > 0 && (
              <button
                onClick={() => setSelectedTagIds([])}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                Clear tags
              </button>
            )}
          </div>

          <div className="ml-auto">
            <Select value={sortMode} onValueChange={v => setSortMode(v as typeof sortMode)}>
              <SelectTrigger className="rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground h-9">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created">Date created</SelectItem>
                <SelectItem value="modified">Date modified</SelectItem>
                <SelectItem value="alphabetical">Alphabetical</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-2 pb-24">
          {loading ? (
            <div className="text-center py-16">
              <Loader2 className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground mt-3">Loading notes...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-sm text-destructive">{error}</p>
              <button onClick={fetchNotes} className="mt-2 text-sm text-primary hover:underline">Try again</button>
            </div>
          ) : sortedNotes.pinned.length === 0 && sortedNotes.unpinned.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No notes found</p>
            </div>
          ) : (
            <>
              {sortedNotes.pinned.length > 0 && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 px-2 py-2 mb-1">
                    <Pin className="w-3.5 h-3.5 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Pinned</span>
                    <span className="text-[10px] text-muted-foreground/50">({sortedNotes.pinned.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {sortedNotes.pinned.map(renderNoteRow)}
                  </div>
                </div>
              )}

              {sortedNotes.unpinned.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center gap-2 px-2 py-2 mb-1">
                    <StickyNote className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">All Notes</span>
                    <span className="text-[10px] text-muted-foreground/50">({sortedNotes.unpinned.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {sortedNotes.unpinned.map(renderNoteRow)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {isDeleteMode && (
        <div className="sticky bottom-0 left-0 right-0 z-30 p-4 bg-background/80 backdrop-blur-md border-t border-border flex justify-center animate-fade-in">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl px-5 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center text-destructive flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-foreground">
                {selectedDeleteIds.length === 0
                  ? 'Select notes to delete'
                  : `${selectedDeleteIds.length} note${selectedDeleteIds.length === 1 ? '' : 's'} selected`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setSelectedDeleteIds([]); setIsDeleteMode(false); }}
                className="px-4 py-2 text-xs font-semibold rounded-lg hover:bg-muted text-muted-foreground transition-all"
              >
                Cancel
              </button>
              <button
                disabled={selectedDeleteIds.length === 0}
                onClick={handleBulkDelete}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-destructive text-destructive-foreground rounded-lg disabled:opacity-40 hover:bg-destructive/95 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete selected — {selectedDeleteIds.length} note{selectedDeleteIds.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <DeleteConfirmDialog count={selectedDeleteIds.length} onConfirm={confirmBulkDelete} onCancel={() => setDeleteConfirmOpen(false)} />
      )}

      {singleDeleteId !== null && (
        <DeleteConfirmDialog count={1} onConfirm={confirmSingleDelete} onCancel={() => setSingleDeleteId(null)} />
      )}

      {tagPopupNote && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setTagPopupNoteId(null)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-foreground">Tags</h3>
                <p className="text-xs text-muted-foreground">Assign tags to this note.</p>
              </div>
              <button onClick={() => setTagPopupNoteId(null)} className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {tags.map(tag => {
                const active = tagPopupNote.tags.some(t => t.id === tag.id);
                return (
                  <div key={tag.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                    <button onClick={() => toggleTagOnNote(tagPopupNote.id, tag.id)} className="flex flex-1 items-center gap-2 text-left">
                      <span className={`h-3 w-3 rounded-full ${active ? 'ring-2 ring-offset-2 ring-offset-background' : ''}`} style={{ backgroundColor: tag.color }} />
                      <span className="text-sm text-foreground">{tag.name}</span>
                      {active && <span className="ml-auto text-[10px] font-semibold text-primary">Selected</span>}
                    </button>
                    <button onClick={() => deleteTagEverywhere(tag.id)} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive" title="Delete tag everywhere">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <div className="flex gap-2">
                <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="Create tag"
                  className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20" />
                <button onClick={() => setNewTagColor(randomFrom(TAG_COLORS))} className="w-12 rounded-xl border border-border" style={{ backgroundColor: newTagColor }} title="Random color" />
                <button onClick={addTagToNote} disabled={!normalize(newTagName)} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">Add</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeNote && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={async () => { await saveDrafts(); setOpenNoteId(null); }} />
          <div className="relative flex w-full max-w-3xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex-1">
                <input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} onBlur={saveDrafts} placeholder="Untitled note"
                  className="w-full bg-transparent text-2xl font-semibold text-foreground outline-none" />
                <p className="mt-1 text-xs text-muted-foreground">
                  Last edited {new Date(activeNote.updatedAt || activeNote.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => togglePin(activeNote)} className={`rounded-lg p-2 transition-all ${activeNote.pinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`} title={activeNote.pinned ? 'Unpin note' : 'Pin note'}>
                  <Pin className={`h-4 w-4 ${activeNote.pinned ? 'fill-current' : ''}`} />
                </button>
                <button onClick={() => setSingleDeleteId(activeNote.id)} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive" title="Delete note">
                  <Trash2 className="h-4 w-4" />
                </button>
                <button onClick={async () => { await saveDrafts(); setOpenNoteId(null); }} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-4 p-5">
              <textarea value={draftContent} onChange={e => setDraftContent(e.target.value)} onBlur={saveDrafts} placeholder="Write your note..." rows={10}
                className="min-h-[280px] w-full resize-y rounded-2xl border border-border bg-muted/20 p-4 text-sm leading-6 text-foreground outline-none focus:ring-2 focus:ring-primary/20" />

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {activeNote.tags.map(tag => (
                    <span key={tag.id} className="rounded-full px-2 py-1 text-[10px] font-semibold text-white" style={{ backgroundColor: tag.color }}>{tag.name}</span>
                  ))}
                </div>
                <button onClick={() => setTagPopupNoteId(activeNote.id)} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-all hover:text-foreground">
                  <Tag className="h-4 w-4" /> Tags
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notes;
