import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderKanban,
  Loader2,
  Pin,
  Plus,
  Save,
  Search,
  StickyNote,
  Tag,
  Trash2,
  X,
  ChevronRight,
  Edit3,
} from 'lucide-react';
import { fetchNoteTemplates, createNoteTemplate, updateNoteTemplate, deleteNoteTemplate as deleteNoteTemplateApi } from '@/services/noteTemplateService';
import type { NoteTemplate } from '@/services/noteTemplateService';
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
  projectId?: number | null;
  columnId?: number | null;
  createdAt: string;
  updatedAt: string;
  tags: NoteTag[];
}

interface Project {
  id: number;
  name: string;
  color: string;
}

interface ActivityLog {
  id: number;
  action: string;
  details?: string;
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

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
];

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
const randomFrom = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)] || items[0];
const PIN_FILTERS = ['all', 'pinned', 'unpinned'] as const;

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
  const [draftProjectId, setDraftProjectId] = useState<string>('');
  const [draftColumnId, setDraftColumnId] = useState<string>('');
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<number[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<number | null>(null);
  const [tagPopupNoteId, setTagPopupNoteId] = useState<number | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(randomFrom(TAG_COLORS));

  const [noteTemplates, setNoteTemplates] = useState<NoteTemplate[]>([]);
  const [tmplPopupOpen, setTmplPopupOpen] = useState(false);
  const [saveTmplOpen, setSaveTmplOpen] = useState(false);
  const [loadTmplOpen, setLoadTmplOpen] = useState(false);
  const [tmplName, setTmplName] = useState('');
  const [tmplError, setTmplError] = useState('');

  const [projects, setProjects] = useState<Project[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [editingTitleNoteId, setEditingTitleNoteId] = useState<number | null>(null);
  const [editingTitleText, setEditingTitleText] = useState('');
  const [editingContentNoteId, setEditingContentNoteId] = useState<number | null>(null);
  const [editingContentText, setEditingContentText] = useState('');
  const [pinFilter, setPinFilter] = useState<'all' | 'pinned' | 'unpinned'>('all');
  const [projectFilterId, setProjectFilterId] = useState<number | 'all'>('all');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [myNotesCollapsed, setMyNotesCollapsed] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<number[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createContent, setCreateContent] = useState('');
  const [createColor, setCreateColor] = useState(randomFrom(NOTE_COLORS));
  const [createProjectId, setCreateProjectId] = useState<string>('');
  const [createSelectedTagIds, setCreateSelectedTagIds] = useState<number[]>([]);
  const [createNewTagName, setCreateNewTagName] = useState('');
  const [createNewTagColor, setCreateNewTagColor] = useState(randomFrom(TAG_COLORS));

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
        projectId: note.projectId,
        columnId: note.columnId,
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

  useEffect(() => { fetchNotes(); fetchProjects(); loadNoteTemplates(); }, []);

  const loadNoteTemplates = async () => {
    try { setNoteTemplates(await fetchNoteTemplates()); } catch {}
  };
  useEffect(() => {
    if (!activeNote) return;
    setDraftTitle(activeNote.title);
    setDraftContent(activeNote.content);
    setDraftProjectId(activeNote.projectId ? String(activeNote.projectId) : '');
    setDraftColumnId(activeNote.columnId ? String(activeNote.columnId) : '');
    fetchNoteActivity(activeNote.id);
  }, [activeNote?.id]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects', { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setProjects(data.projects || data); }
    } catch {}
  };

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

  const openCreateModal = () => {
    setCreateTitle('');
    setCreateContent('');
    setCreateColor(randomFrom(NOTE_COLORS));
    setCreateProjectId('');
    setCreateSelectedTagIds([]);
    setCreateNewTagName('');
    setCreateNewTagColor(randomFrom(TAG_COLORS));
    setShowCreateModal(true);
  };

  const handleCreateNote = async () => {
    try {
      setCreating(true);
      const res = await fetch('/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ title: createTitle, content: createContent, color: createColor, pinned: false, projectId: createProjectId || null }),
      });
      if (!res.ok) throw new Error('Failed to create note');
      const created = await res.json();
      const next: Note = {
        id: created.id, title: created.title || '', content: created.content || '',
        color: created.color || NOTE_COLORS[0], pinned: Boolean(created.pinned),
        projectId: created.projectId,
        createdAt: created.createdAt || new Date().toISOString(),
        updatedAt: created.updatedAt || created.createdAt || new Date().toISOString(),
        tags: Array.isArray(created.tags) ? created.tags : [],
      };
      setNotes(prev => [next, ...prev]);
      setShowCreateModal(false);
      for (const tagId of createSelectedTagIds) {
        try { await fetch(`/api/notes/${next.id}/tags/${tagId}/toggle`, { method: 'POST', credentials: 'include' }); } catch {}
      }
      const tagRes = await fetch('/api/notes', { credentials: 'include' });
      if (tagRes.ok) {
        const data = await tagRes.json();
        setNotes((data.notes || []).map((note: any) => ({
          id: note.id, title: note.title || '', content: note.content || '',
          color: note.color || NOTE_COLORS[0], pinned: Boolean(note.pinned),
          projectId: note.projectId, columnId: note.columnId,
          createdAt: note.createdAt || new Date().toISOString(),
          updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(),
          tags: Array.isArray(note.tags) ? note.tags : [],
        })));
      }
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
    const nextProjectId = draftProjectId ? Number(draftProjectId) : null;
    const nextColumnId = draftColumnId ? Number(draftColumnId) : null;
    if (nextTitle !== activeNote.title || nextContent !== activeNote.content || nextProjectId !== activeNote.projectId || nextColumnId !== activeNote.columnId) {
      await applyNoteUpdate(activeNote.id, { title: nextTitle, content: nextContent, projectId: nextProjectId, columnId: nextColumnId });
    }
  };

  const fetchNoteActivity = async (noteId: number) => {
    try {
      const res = await fetch(`/api/notes/${noteId}/activity`, { credentials: 'include' });
      if (res.ok) { const data = await res.json(); setActivityLogs(data); }
    } catch {}
  };

  const handleSaveNoteTemplate = useCallback(async () => {
    if (!activeNote || !normalize(tmplName)) return;
    try {
      const saved = await createNoteTemplate({
        name: normalize(tmplName),
        title: activeNote.title,
        content: activeNote.content,
        color: activeNote.color,
        projectId: activeNote.projectId || null,
        tags: activeNote.tags,
      });
      setNoteTemplates(prev => [...prev, saved]);
      setSaveTmplOpen(false);
      setTmplName('');
    } catch { setTmplError('Failed to save template'); }
  }, [activeNote, tmplName]);

  const handleLoadNoteTemplate = (tmpl: NoteTemplate) => {
    setCreateTitle(tmpl.title);
    setCreateContent(tmpl.content);
    setCreateColor(tmpl.color);
    setCreateProjectId(tmpl.projectId ? String(tmpl.projectId) : '');
    setCreateSelectedTagIds(tmpl.tags.map(t => t.id));
    setLoadTmplOpen(false);
    setShowCreateModal(true);
  };

  const [editingNoteTemplate, setEditingNoteTemplate] = useState<NoteTemplate | null>(null);

  const handleEditNoteTemplate = (tmpl: NoteTemplate) => {
    setEditingNoteTemplate(tmpl);
    setTmplName(tmpl.name);
    setSaveTmplOpen(true);
  };

  const handleUpdateNoteTemplate = async () => {
    if (!editingNoteTemplate || !normalize(tmplName)) return;
    try {
      const saved = await updateNoteTemplate(editingNoteTemplate.id, {
        name: normalize(tmplName),
        title: editingNoteTemplate.title,
        content: editingNoteTemplate.content,
        color: editingNoteTemplate.color,
        projectId: editingNoteTemplate.projectId ?? null,
        tags: editingNoteTemplate.tags,
      });
      setNoteTemplates(prev => prev.map(t => t.id === saved.id ? saved : t));
      setSaveTmplOpen(false);
      setTmplName('');
      setEditingNoteTemplate(null);
    } catch { setTmplError('Failed to update template'); }
  };

  const handleDeleteNoteTemplate = async (id: number) => {
    try { await deleteNoteTemplateApi(id); setNoteTemplates(prev => prev.filter(t => t.id !== id)); } catch {}
  };

  const handleSaveAsTemplate = () => {
    if (!activeNote) return;
    setTmplName(activeNote.title || 'Untitled note');
    setTmplError('');
    setEditingNoteTemplate(null);
    setSaveTmplOpen(true);
  };

  const filteredNotes = useMemo(() => {
    const term = search.toLowerCase().trim();
    return notes.filter(n => {
      const matchesSearch = !term || n.title.toLowerCase().includes(term) || n.content.toLowerCase().includes(term);
      const matchesTags = selectedTagIds.length === 0 || selectedTagIds.every(id => n.tags.some(t => t.id === id));
      const matchesPin = pinFilter === 'all' || (pinFilter === 'pinned' ? n.pinned : !n.pinned);
      const matchesProject = projectFilterId === 'all' || n.projectId === projectFilterId;
      return matchesSearch && matchesTags && matchesPin && matchesProject;
    });
  }, [notes, search, selectedTagIds, pinFilter, projectFilterId]);

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

  const myNotesGroup = useMemo(() => {
    return filteredNotes.filter(n => !n.projectId).sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sortMode === 'alphabetical') return a.title.localeCompare(b.title);
      const aVal = sortMode === 'created' ? a.createdAt : a.updatedAt;
      const bVal = sortMode === 'created' ? b.createdAt : b.updatedAt;
      return new Date(bVal).getTime() - new Date(aVal).getTime();
    });
  }, [filteredNotes, sortMode]);

  const projectNoteGroups = useMemo(() => {
    return projects.map(project => {
      const noteItems = filteredNotes.filter(n => n.projectId === project.id).sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (sortMode === 'alphabetical') return a.title.localeCompare(b.title);
        const aVal = sortMode === 'created' ? a.createdAt : a.updatedAt;
        const bVal = sortMode === 'created' ? b.createdAt : b.updatedAt;
        return new Date(bVal).getTime() - new Date(aVal).getTime();
      });
      if (noteItems.length === 0) return null;
      return { project, notes: noteItems };
    }).filter(Boolean) as Array<{ project: Project; notes: Note[] }>;
  }, [filteredNotes, projects, sortMode]);

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
              onChange={() => {
                setSelectedDeleteIds(prev =>
                  prev.includes(note.id) ? prev.filter(id => id !== note.id) : [...prev, note.id]
                );
              }}
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
              {editingTitleNoteId === note.id ? (
                <input
                  autoFocus
                  value={editingTitleText}
                  onChange={e => setEditingTitleText(e.target.value)}
                  onBlur={async () => {
                    if (editingTitleText !== (note.title || '')) {
                      await applyNoteUpdate(note.id, { title: editingTitleText });
                    }
                    setEditingTitleNoteId(null);
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  onClick={e => e.stopPropagation()}
                  className="text-sm font-medium text-foreground bg-muted/40 border border-border rounded px-2 py-0.5 w-full"
                />
              ) : (
                <span
                  onClick={e => { e.stopPropagation(); setEditingTitleNoteId(note.id); setEditingTitleText(note.title || ''); }}
                  className="text-sm font-medium text-left text-foreground truncate cursor-text hover:bg-muted/30 rounded px-1 -mx-1"
                >
                  {note.title || 'Untitled note'}
                </span>
              )}
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
              {note.projectId && (() => {
                const p = projects.find(pr => pr.id === note.projectId);
                if (!p) return null;
                return (
                  <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-border/60 text-muted-foreground flex-shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    {p.name}
                  </span>
                );
              })()}
            </div>
            {editingContentNoteId === note.id ? (
              <input
                autoFocus
                value={editingContentText}
                onChange={e => setEditingContentText(e.target.value)}
                onBlur={async () => {
                  if (editingContentText !== (note.content || '')) {
                    await applyNoteUpdate(note.id, { content: editingContentText });
                  }
                  setEditingContentNoteId(null);
                }}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                onClick={e => e.stopPropagation()}
                className="text-xs text-muted-foreground bg-muted/40 border border-border rounded px-2 py-0.5 w-full mt-0.5"
              />
            ) : (
              preview ? (
                <p
                  onClick={e => { e.stopPropagation(); setEditingContentNoteId(note.id); setEditingContentText(note.content || ''); }}
                  className="text-xs text-muted-foreground mt-0.5 truncate cursor-text hover:bg-muted/30 rounded px-1 -mx-1"
                >
                  {preview}
                </p>
              ) : null
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
          <div className="relative">
            <button
              onClick={() => setTmplPopupOpen(prev => !prev)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-muted/50 border border-border rounded-xl font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <Save className="w-4 h-4" />
              Templates
            </button>
            {tmplPopupOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-card border border-border rounded-xl shadow-2xl z-40 overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Note Templates</p>
                </div>
                <div className="max-h-72 overflow-y-auto p-2 space-y-1">
                  {noteTemplates.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No templates yet</p>
                  ) : (
                    noteTemplates.map(tmpl => (
                      <div key={tmpl.id} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted group">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{tmpl.name}</p>
                          {tmpl.title && <p className="text-[11px] text-muted-foreground truncate">{tmpl.title}</p>}
                        </div>
                        <button
                          onClick={() => { setTmplPopupOpen(false); handleEditNoteTemplate(tmpl); }}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all opacity-0 group-hover:opacity-100"
                          title="Edit template"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteNoteTemplate(tmpl.id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
                          title="Delete template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="border-t border-border p-3 flex flex-col gap-2">
                  <button
                    onClick={() => { setTmplPopupOpen(false); setTmplName(''); setTmplError(''); setEditingNoteTemplate(null); setLoadTmplOpen(true); }}
                    className="w-full text-center px-3 py-2 text-sm font-semibold rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all"
                  >
                    Load template
                  </button>
                </div>
              </div>
            )}
            {tmplPopupOpen && <div className="fixed inset-0 z-30" onClick={() => setTmplPopupOpen(false)} />}
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all"
          >
            <Plus className="w-4 h-4" />
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

          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border">
            {PIN_FILTERS.map(filter => (
              <button
                key={filter}
                onClick={() => setPinFilter(filter)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                  pinFilter === filter
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>

          <div className="relative">
            <button
              onClick={() => setProjectDropdownOpen(prev => !prev)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border transition-all ${
                projectFilterId !== 'all'
                  ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
                  : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <FolderKanban className="w-3.5 h-3.5" />
              <span>
                {projectFilterId === 'all'
                  ? 'Project Filter'
                  : `Project: ${projects.find(p => p.id === projectFilterId)?.name || 'Selected'}`}
              </span>
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            </button>
            {projectDropdownOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setProjectDropdownOpen(false)} />
                <div className="absolute left-0 mt-1.5 w-64 bg-card border border-border rounded-xl shadow-lg z-30 p-2">
                  <button
                    onClick={() => { setProjectFilterId('all'); setProjectDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted"
                  >
                    All projects
                  </button>
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {projects.map(project => (
                      <button
                        key={project.id}
                        onClick={() => { setProjectFilterId(project.id); setProjectDropdownOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-xs rounded-lg hover:bg-muted flex items-center gap-2 ${
                          projectFilterId === project.id ? 'bg-primary/10 text-primary' : ''
                        }`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: project.color }} />
                        <span className="flex-1 truncate">{project.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
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
          ) : myNotesGroup.length === 0 && projectNoteGroups.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No notes found</p>
            </div>
          ) : (
            <>
              {/* My Notes section */}
              {myNotesGroup.length > 0 && (
                <div className="mb-3">
                  <button
                    onClick={() => setMyNotesCollapsed(prev => !prev)}
                    className="flex items-center gap-2 w-full px-2 py-2 text-left hover:bg-muted/30 rounded-lg transition-all mb-1"
                  >
                    {myNotesCollapsed
                      ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">My Notes</span>
                    <span className="text-[10px] text-muted-foreground/50 ml-1">({myNotesGroup.length})</span>
                  </button>
                  {!myNotesCollapsed && (
                    <div className="space-y-1.5">
                      {myNotesGroup.map(renderNoteRow)}
                    </div>
                  )}
                </div>
              )}

              {/* Project sections */}
              {projectNoteGroups.map(({ project, notes: projectNotes }) => {
                const isCollapsed = collapsedProjects.includes(project.id);
                return (
                  <div key={project.id} className="mb-3">
                    <button
                      onClick={() => setCollapsedProjects(prev =>
                        prev.includes(project.id) ? prev.filter(id => id !== project.id) : [...prev, project.id]
                      )}
                      className="flex items-center gap-2 w-full px-2 py-2 text-left hover:bg-muted/30 rounded-lg transition-all mb-1"
                    >
                      {isCollapsed
                        ? <ChevronDown className="w-3.5 h-3.5" style={{ color: project.color }} />
                        : <ChevronUp className="w-3.5 h-3.5" style={{ color: project.color }} />}
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">{project.name}</span>
                      <span className="text-[10px] text-muted-foreground/50 ml-1">({projectNotes.length})</span>
                    </button>
                    {!isCollapsed && (
                      <div className="pl-4 space-y-1.5">
                        {projectNotes.map(renderNoteRow)}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={() => setShowCreateModal(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Create Note</h2>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-5">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Title</label>
                <input autoFocus value={createTitle} onChange={e => setCreateTitle(e.target.value)} placeholder="Note title"
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">Content</label>
                <textarea value={createContent} onChange={e => setCreateContent(e.target.value)} placeholder="Write your note..." rows={6}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none" />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">Color</label>
                <div className="flex gap-2">
                  {NOTE_COLORS.map(color => (
                    <button key={color} onClick={() => setCreateColor(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${createColor === color ? 'border-foreground scale-110' : 'border-border'}`}
                      style={{ backgroundColor: color }} />
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">Project</label>
                <Select value={createProjectId || 'none'} onValueChange={v => setCreateProjectId(v === 'none' ? '' : v)}>
                  <SelectTrigger className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                    <SelectValue placeholder="My Tasks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">My Tasks</SelectItem>
                    {projects.map(p => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground mb-2 block">Tags</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {tags.map(tag => {
                    const active = createSelectedTagIds.includes(tag.id);
                    return (
                      <button key={tag.id} onClick={() => setCreateSelectedTagIds(prev => prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all ${active ? 'border-foreground/20 text-foreground shadow-sm' : 'border-border text-muted-foreground hover:bg-muted/50'}`}>
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <input value={createNewTagName} onChange={e => setCreateNewTagName(e.target.value)} placeholder="New tag name"
                    className="flex-1 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm" />
                  <button onClick={() => setCreateNewTagColor(randomFrom(TAG_COLORS))} className="w-10 rounded-xl border border-border" style={{ backgroundColor: createNewTagColor }} title="Random color" />
                </div>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-border flex justify-end gap-2">
              <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={handleCreateNote} disabled={creating || !createTitle.trim()}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}

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
                <button onClick={handleSaveAsTemplate} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Save as template">
                  <Save className="h-4 w-4" />
                </button>
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

              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-2 block">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {tags.map(tag => {
                    const active = activeNote.tags.some(t => t.id === tag.id);
                    return (
                      <button key={tag.id} onClick={() => toggleTagOnNote(activeNote.id, tag.id)}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all ${active ? 'border-foreground/20 text-foreground shadow-sm' : 'border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground'}`}>
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Project Selector */}
              <div className="rounded-2xl border border-border bg-muted/20 px-4 py-3">
                <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1.5 block">Project</label>
                <Select value={draftProjectId || 'none'} onValueChange={v => { setDraftProjectId(v === 'none' ? '' : v); saveDrafts(); }}>
                  <SelectTrigger className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm h-9">
                    <SelectValue placeholder="My Tasks" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">My Tasks</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Activity Section */}
              <div className="rounded-2xl border border-border bg-muted/20">
                <button
                  onClick={() => setActivityCollapsed(prev => !prev)}
                  className="w-full flex items-center justify-between px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold text-foreground">Activity</h3>
                  </div>
                  {activityCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>
                {!activityCollapsed && (
                  <div className="border-t border-border/60 px-4 py-3 space-y-2 max-h-56 overflow-y-auto">
                    {activityLogs.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No activity yet</p>
                    ) : activityLogs.map(log => (
                      <div key={log.id} className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
                        <p className="text-sm text-foreground capitalize">{log.action}{log.details ? ` — ${log.details}` : ''}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">{new Date(log.createdAt).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Save Template Modal */}
      {saveTmplOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => { setSaveTmplOpen(false); setTmplName(''); setTmplError(''); setEditingNoteTemplate(null); }}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Save className="w-4 h-4 text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">{editingNoteTemplate ? 'Edit template' : 'Save as template'}</h2>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Template name</label>
                <input
                  autoFocus
                  value={tmplName}
                  onChange={e => setTmplName(e.target.value)}
                  placeholder="Template name"
                  className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              {tmplError && <p className="text-xs text-destructive">{tmplError}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setSaveTmplOpen(false); setTmplName(''); setTmplError(''); setEditingNoteTemplate(null); }}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
              >
                Cancel
              </button>
              <button
                onClick={editingNoteTemplate ? handleUpdateNoteTemplate : handleSaveNoteTemplate}
                disabled={!normalize(tmplName)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {editingNoteTemplate ? 'Save changes' : 'Save template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Load Template Modal */}
      {loadTmplOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setLoadTmplOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Save className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Load template</h2>
              </div>
              <button onClick={() => setLoadTmplOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {noteTemplates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                  <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
                    <Save className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No templates yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Save a note as a template first.</p>
                </div>
              ) : (
                noteTemplates.map(tmpl => (
                  <div key={tmpl.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-muted transition-all">
                    <button
                      onClick={() => handleLoadNoteTemplate(tmpl)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center flex-shrink-0">
                        <StickyNote className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{tmpl.name}</p>
                        {tmpl.title && <p className="text-[11px] text-muted-foreground truncate">{tmpl.title}</p>}
                      </div>
                    </button>
                    <button
                      onClick={() => { setLoadTmplOpen(false); handleEditNoteTemplate(tmpl); }}
                      className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
                      title="Edit template"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteNoteTemplate(tmpl.id)}
                      className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-all"
                      title="Delete template"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notes;
