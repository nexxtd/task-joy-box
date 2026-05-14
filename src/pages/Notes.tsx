import React, { useState, useEffect } from 'react';
import { Plus, StickyNote, Trash2, Search, Loader2 } from 'lucide-react';

interface Note {
  id: number;
  title: string;
  content: string;
  color: string;
  createdAt: string;
}

const NOTE_COLORS = [
  'hsl(var(--card))',
  'hsl(45 93% 55% / 0.1)',
  'hsl(142 70% 45% / 0.1)',
  'hsl(217 91% 60% / 0.1)',
  'hsl(252 85% 65% / 0.1)',
  'hsl(330 80% 60% / 0.1)',
];

const Notes: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch notes on mount
  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/notes', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch notes');
      const data = await res.json();
      setNotes(data.map((n: any) => ({
        id: n.id,
        title: n.title || '',
        content: n.content || '',
        color: n.color || NOTE_COLORS[0],
        createdAt: n.createdAt || new Date().toISOString(),
      })));
    } catch (err) {
      setError('Failed to load notes');
      console.error('Error fetching notes:', err);
    } finally {
      setLoading(false);
    }
  };

  const addNote = async () => {
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: '',
          content: '',
          color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
        }),
      });

      if (!res.ok) throw new Error('Failed to create note');

      const created = await res.json();
      const note: Note = {
        id: created.id,
        title: created.title || '',
        content: created.content || '',
        color: created.color || NOTE_COLORS[0],
        createdAt: created.createdAt || new Date().toISOString(),
      };

      setNotes(prev => [note, ...prev]);
      setEditingId(note.id);
    } catch (err) {
      console.error('Error creating note:', err);
      alert('Failed to save note. Please try again.');
    }
  };

  const updateNote = async (id: number, updates: Partial<Note>) => {
    // Optimistic update
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));

    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update note');
    } catch (err) {
      console.error('Error updating note:', err);
      // Revert on error by refetching
      fetchNotes();
    }
  };

  const deleteNote = async (id: number) => {
    try {
      const res = await fetch(`/api/notes/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete note');
      setNotes(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error('Error deleting note:', err);
      alert('Failed to delete note. Please try again.');
    }
  };

  const filtered = notes.filter(n =>
    n.title.toLowerCase().includes(search.toLowerCase()) ||
    n.content.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="px-6 py-3 border-b border-border flex items-center justify-between">
        <h1 className="text-base font-bold text-foreground">Notes</h1>
        <button
          onClick={addNote}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all duration-200 hover:scale-105"
        >
          <Plus className="w-4 h-4" />
          New Note
        </button>
      </header>

      <div className="px-6 py-3 border-b border-border">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search notes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="text-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading notes...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={fetchNotes}
              className="mt-2 text-sm text-primary hover:underline"
            >
              Try again
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 animate-fade-in">
            <StickyNote className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No notes yet. Create one to get started!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((note, i) => (
              <div
                key={note.id}
                className="border border-border rounded-xl p-4 hover:border-primary/30 hover:shadow-lg transition-all duration-200 cursor-pointer group animate-fade-in"
                style={{ backgroundColor: note.color, animationDelay: `${i * 60}ms` }}
                onClick={() => setEditingId(note.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <input
                    value={note.title}
                    onChange={e => updateNote(note.id, { title: e.target.value })}
                    onBlur={() => setEditingId(null)}
                    placeholder="Note title..."
                    className="text-sm font-semibold text-foreground bg-transparent border-none outline-none flex-1 placeholder:text-muted-foreground"
                    onClick={e => e.stopPropagation()}
                  />
                  <button
                    onClick={e => { e.stopPropagation(); deleteNote(note.id); }}
                    className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all duration-200"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <textarea
                  value={note.content}
                  onChange={e => updateNote(note.id, { content: e.target.value })}
                  placeholder="Write something..."
                  className="w-full text-xs text-muted-foreground bg-transparent border-none outline-none resize-none min-h-[80px] placeholder:text-muted-foreground/50"
                  onClick={e => e.stopPropagation()}
                />
                <p className="text-[9px] text-muted-foreground mt-2">
                  {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Notes;
