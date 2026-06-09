import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Pin,
  Plus,
  Search,
  StickyNote,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
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
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
];

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');

const randomFrom = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)] || items[0];

const DeleteConfirmDialog: React.FC<{
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ onConfirm, onCancel }) => (
  <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onCancel} />
    <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
          <Trash2 className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">Delete this note?</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">This action cannot be undone.</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="rounded-lg bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground transition-all hover:bg-destructive/90"
        >
          Delete
        </button>
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
  const [deleteNoteId, setDeleteNoteId] = useState<number | null>(null);
  const [tagPopupNoteId, setTagPopupNoteId] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(randomFrom(TAG_COLORS));

  const activeNote = useMemo(
    () => notes.find(note => note.id === openNoteId) || null,
    [notes, openNoteId],
  );

  const tagPopupNote = useMemo(
    () => notes.find(note => note.id === tagPopupNoteId) || null,
    [notes, tagPopupNoteId],
  );

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/notes', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch notes');
      const data = await res.json();
      const loadedNotes: Note[] = (data.notes || []).map((note: any) => ({
        id: note.id,
        title: note.title || '',
        content: note.content || '',
        color: note.color || NOTE_COLORS[0],
        pinned: Boolean(note.pinned),
        createdAt: note.createdAt || new Date().toISOString(),
        updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
        tags: Array.isArray(note.tags) ? note.tags : [],
      }));
      const loadedTags: NoteTag[] = (data.tags || []).map((tag: any) => ({
        id: tag.id,
        name: tag.name,
        color: tag.color,
      }));
      setNotes(loadedNotes);
      setTags(loadedTags);
      setError(null);
    } catch (err) {
      setError('Failed to load notes');
      console.error('Error fetching notes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  useEffect(() => {
    if (!activeNote) return;
    setDraftTitle(activeNote.title);
    setDraftContent(activeNote.content);
  }, [activeNote?.id]);

  const applyNoteUpdate = async (id: number, updates: Partial<Note>) => {
    setNotes(prev => prev.map(note => (note.id === id ? { ...note, ...updates } : note)));
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update note');
      const data = await res.json();
      if (data?.id) {
        setNotes(prev => prev.map(note => (note.id === data.id ? { ...note, ...data } : note)));
      }
    } catch (err) {
      console.error('Error updating note:', err);
      fetchNotes();
    }
  };

  const createNote = async () => {
    try {
      setCreating(true);
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: '',
          content: '',
          color: randomFrom(NOTE_COLORS),
          pinned: false,
        }),
      });
      if (!res.ok) throw new Error('Failed to create note');
      const created = await res.json();
      const next: Note = {
        id: created.id,
        title: created.title || '',
        content: created.content || '',
        color: created.color || NOTE_COLORS[0],
        pinned: Boolean(created.pinned),
        createdAt: created.createdAt || new Date().toISOString(),
        updatedAt: created.updatedAt || created.createdAt || new Date().toISOString(),
        tags: Array.isArray(created.tags) ? created.tags : [],
      };
      setNotes(prev => [next, ...prev]);
      setOpenNoteId(next.id);
    } catch (err) {
      console.error('Error creating note:', err);
      alert('Failed to save note. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const deleteNote = async (id: number) => {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete note');
      setNotes(prev => prev.filter(note => note.id !== id));
      if (openNoteId === id) setOpenNoteId(null);
      if (tagPopupNoteId === id) setTagPopupNoteId(null);
    } catch (err) {
      console.error('Error deleting note:', err);
      alert('Failed to delete note. Please try again.');
    }
  };

  const togglePin = (note: Note) => {
    applyNoteUpdate(note.id, { pinned: !note.pinned });
  };

  const toggleTagFilter = (tagId: number) => {
    setSelectedTagIds(prev => (prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]));
  };

  const toggleTagOnNote = async (noteId: number, tagId: number) => {
    try {
      const res = await fetch(`/api/notes/${noteId}/tags/${tagId}/toggle`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to toggle tag');
      const data = await res.json();
      if (data?.note?.id) {
        const nextNote = data.note as Note;
        setNotes(prev => prev.map(note => (note.id === nextNote.id ? { ...note, ...nextNote } : note)));
      }
    } catch (err) {
      console.error('Error toggling note tag:', err);
    }
  };

  const addTagToNote = async () => {
    if (!tagPopupNote || !normalize(newTagName)) return;
    try {
      const res = await fetch(`/api/notes/${tagPopupNote.id}/tags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: normalize(newTagName),
          color: newTagColor,
        }),
      });
      if (!res.ok) throw new Error('Failed to create tag');
      const data = await res.json();
      if (data?.note?.id) {
        const nextNote = data.note as Note;
        setNotes(prev => prev.map(note => (note.id === nextNote.id ? { ...note, ...nextNote } : note)));
      }
      if (data?.tag) {
        const nextTag = data.tag as NoteTag;
        setTags(prev => {
          if (prev.some(tag => tag.id === nextTag.id)) return prev;
          return [...prev, nextTag].sort((a, b) => a.name.localeCompare(b.name));
        });
      }
      setNewTagName('');
      setNewTagColor(randomFrom(TAG_COLORS));
    } catch (err) {
      console.error('Error creating tag:', err);
    }
  };

  const deleteTagEverywhere = async (tagId: number) => {
    try {
      const res = await fetch(`/api/notes/tags/${tagId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete tag');
      setTags(prev => prev.filter(tag => tag.id !== tagId));
      setNotes(prev => prev.map(note => ({
        ...note,
        tags: note.tags.filter(tag => tag.id !== tagId),
      })));
      setSelectedTagIds(prev => prev.filter(id => id !== tagId));
    } catch (err) {
      console.error('Error deleting note tag:', err);
    }
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
    return notes.filter(note => {
      const matchesSearch = term.length === 0
        ? true
        : note.title.toLowerCase().includes(term) || note.content.toLowerCase().includes(term);
      const matchesTags = selectedTagIds.length === 0
        ? true
        : selectedTagIds.every(tagId => note.tags.some(tag => tag.id === tagId));
      return matchesSearch && matchesTags;
    });
  }, [notes, search, selectedTagIds]);

  const sortedNotes = useMemo(() => {
    const compare = (a: Note, b: Note) => {
      if (sortMode === 'alphabetical') return a.title.localeCompare(b.title);
      const aValue = sortMode === 'created' ? a.createdAt : a.updatedAt;
      const bValue = sortMode === 'created' ? b.createdAt : b.updatedAt;
      return new Date(bValue).getTime() - new Date(aValue).getTime();
    };

    const pinned = filteredNotes.filter(note => note.pinned).sort(compare);
    const unpinned = filteredNotes.filter(note => !note.pinned).sort(compare);
    return { pinned, unpinned };
  }, [filteredNotes, sortMode]);

  const renderNoteCard = (note: Note) => {
    const preview = note.content
      .split('\n')
      .slice(0, 3)
      .join('\n')
      .trim();

    return (
      <div
        key={note.id}
        onClick={() => setOpenNoteId(note.id)}
        className="group flex min-h-[220px] cursor-pointer flex-col rounded-2xl border border-border/70 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg"
        style={{ backgroundColor: note.color }}
      >
        <div className="flex items-start justify-between gap-2">
          <button
            onClick={e => {
              e.stopPropagation();
              togglePin(note);
            }}
            className={`rounded-lg p-1 transition-all ${note.pinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
            title={note.pinned ? 'Unpin note' : 'Pin note'}
          >
            <Pin className={`h-4 w-4 ${note.pinned ? 'fill-current' : ''}`} />
          </button>
          <button
            onClick={e => {
              e.stopPropagation();
              setDeleteNoteId(note.id);
            }}
            className="rounded-lg p-1 text-muted-foreground opacity-0 transition-all hover:text-destructive group-hover:opacity-100"
            title="Delete note"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 flex-1">
          <h2 className="text-base font-bold text-foreground">{note.title || 'Untitled note'}</h2>
          <p
            className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground"
            style={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 5,
              overflow: 'hidden',
            }}
          >
            {preview || 'Start writing your note...'}
          </p>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5">
              {note.tags.map(tag => (
                <span
                  key={tag.id}
                  className="rounded-full px-2 py-1 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Edited {new Date(note.updatedAt || note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </p>
          </div>
          <button
            onClick={e => {
              e.stopPropagation();
              setTagPopupNoteId(note.id);
            }}
            className="rounded-lg border border-border/70 bg-background/60 p-2 text-muted-foreground transition-all hover:text-foreground"
            title="Edit tags"
          >
            <Tag className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <h1 className="text-xl font-bold text-foreground">Notes</h1>
        <button
          onClick={createNote}
          disabled={creating}
          className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-60"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New Note
        </button>
      </header>

      <div className="border-b border-border px-6 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search notes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted/50 py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex flex-wrap gap-2">
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
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </button>
              );
            })}
            {selectedTagIds.length > 0 && (
              <button
                onClick={() => setSelectedTagIds([])}
                className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground"
              >
                Clear tags
              </button>
            )}
          </div>

          <div className="relative">
            <Select value={sortMode} onValueChange={(value) => setSortMode(value as typeof sortMode)}>
              <SelectTrigger className="rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 h-9">
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

      <div className="px-6 py-6">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading notes...</p>
          </div>
        ) : error ? (
          <div className="py-16 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button onClick={fetchNotes} className="mt-2 text-sm text-primary hover:underline">
              Try again
            </button>
          </div>
        ) : sortedNotes.pinned.length === 0 && sortedNotes.unpinned.length === 0 ? (
          <div className="py-16 text-center">
            <StickyNote className="mx-auto mb-3 h-12 w-12 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">No notes yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedNotes.pinned.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Pin className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pinned</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sortedNotes.pinned.map(renderNoteCard)}
                </div>
              </section>
            )}

            {sortedNotes.unpinned.length > 0 && (
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">Notes</h2>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {sortedNotes.unpinned.map(renderNoteCard)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {deleteNoteId && (
        <DeleteConfirmDialog
          onConfirm={() => {
            const noteId = deleteNoteId;
            setDeleteNoteId(null);
            deleteNote(noteId);
          }}
          onCancel={() => setDeleteNoteId(null)}
        />
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
                const active = tagPopupNote.tags.some(item => item.id === tag.id);
                return (
                  <div key={tag.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                    <button
                      onClick={() => toggleTagOnNote(tagPopupNote.id, tag.id)}
                      className="flex flex-1 items-center gap-2 text-left"
                    >
                      <span className={`h-3 w-3 rounded-full ${active ? 'ring-2 ring-offset-2 ring-offset-background' : ''}`} style={{ backgroundColor: tag.color }} />
                      <span className="text-sm text-foreground">{tag.name}</span>
                      {active && <span className="ml-auto text-[10px] font-semibold text-primary">Selected</span>}
                    </button>
                    <button
                      onClick={() => deleteTagEverywhere(tag.id)}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Delete tag everywhere"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <div className="flex gap-2">
                <input
                  value={newTagName}
                  onChange={e => setNewTagName(e.target.value)}
                  placeholder="Create tag"
                  className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={() => setNewTagColor(randomFrom(TAG_COLORS))}
                  className="w-12 rounded-xl border border-border"
                  style={{ backgroundColor: newTagColor }}
                  title="Random color"
                />
                <button
                  onClick={addTagToNote}
                  disabled={!normalize(newTagName)}
                  className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeNote && (
        <div className="fixed inset-0 z-[50] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={async () => {
              await saveDrafts();
              setOpenNoteId(null);
            }}
          />
          <div className="relative flex w-full max-w-3xl flex-col rounded-2xl border border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="flex-1">
                <input
                  value={draftTitle}
                  onChange={e => setDraftTitle(e.target.value)}
                  onBlur={saveDrafts}
                  placeholder="Untitled note"
                  className="w-full bg-transparent text-2xl font-semibold text-foreground outline-none"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Last edited {new Date(activeNote.updatedAt || activeNote.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => togglePin(activeNote)}
                  className={`rounded-lg p-2 transition-all ${activeNote.pinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  title={activeNote.pinned ? 'Unpin note' : 'Pin note'}
                >
                  <Pin className={`h-4 w-4 ${activeNote.pinned ? 'fill-current' : ''}`} />
                </button>
                <button
                  onClick={() => setDeleteNoteId(activeNote.id)}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                  title="Delete note"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                <button
                  onClick={async () => {
                    await saveDrafts();
                    setOpenNoteId(null);
                  }}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid gap-4 p-5">
              <textarea
                value={draftContent}
                onChange={e => setDraftContent(e.target.value)}
                onBlur={saveDrafts}
                placeholder="Write your note..."
                rows={10}
                className="min-h-[280px] w-full resize-y rounded-2xl border border-border bg-muted/20 p-4 text-sm leading-6 text-foreground outline-none focus:ring-2 focus:ring-primary/20"
              />

              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {activeNote.tags.map(tag => (
                    <span
                      key={tag.id}
                      className="rounded-full px-2 py-1 text-[10px] font-semibold text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => setTagPopupNoteId(activeNote.id)}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground transition-all hover:text-foreground"
                >
                  <Tag className="h-4 w-4" />
                  Tags
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
