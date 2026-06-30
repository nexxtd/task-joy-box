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
  Star,
  Tag,
  Trash2,
  X,
  Edit3,
  GripVertical,
  ChevronRight,
  Image,
  ChevronLeft,
  Paperclip,
} from 'lucide-react';
import { fetchNoteTemplates, createNoteTemplate, updateNoteTemplate, deleteNoteTemplate as deleteNoteTemplateApi } from '@/services/noteTemplateService';
import type { NoteTemplate } from '@/services/noteTemplateService';
import { createTag, deleteTag, fetchTags, type SharedTag } from '@/services/tagService';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';

type NoteTag = SharedTag;

interface NoteImage {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
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
  images?: NoteImage[];
}

interface Project {
  id: number;
  name: string;
  color: string;
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
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<number[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<number | null>(null);
  const [tagPopupNoteId, setTagPopupNoteId] = useState<number | null>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(randomFrom(TAG_COLORS));

  const [noteTemplates, setNoteTemplates] = useState<NoteTemplate[]>([]);
  const [tmplPopupOpen, setTmplPopupOpen] = useState(false);
  const [saveTmplOpen, setSaveTmplOpen] = useState(false);
  const [loadTmplOpen, setLoadTmplOpen] = useState(false);
  const [tmplName, setTmplName] = useState('');
  const [tmplError, setTmplError] = useState('');
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [editingNoteTemplateMeta, setEditingNoteTemplateMeta] = useState<{ id: number; name: string; template: NoteTemplate } | null>(null);
  const [noteTemplateEditOverrides, setNoteTemplateEditOverrides] = useState<Partial<Note> | null>(null);
  const [noteTemplateEditName, setNoteTemplateEditName] = useState('');

  const [projects, setProjects] = useState<Project[]>([]);

  const [editingTitleNoteId, setEditingTitleNoteId] = useState<number | null>(null);
  const [editingTitleText, setEditingTitleText] = useState('');
  const [editingContentNoteId, setEditingContentNoteId] = useState<number | null>(null);
  const [editingContentText, setEditingContentText] = useState('');
  const [pinFilter, setPinFilter] = useState<'all' | 'pinned' | 'unpinned'>('all');
  const [projectFilterId, setProjectFilterId] = useState<number | 'all'>('all');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [myNotesCollapsed, setMyNotesCollapsed] = useState(false);
  const [imagesCollapsed, setImagesCollapsed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [activityCollapsed, setActivityCollapsed] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<number[]>(() => {
    try { const v = localStorage.getItem('notes-collapsed-projects'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createContent, setCreateContent] = useState('');
  const [createColor, setCreateColor] = useState(randomFrom(NOTE_COLORS));
  const [createProjectId, setCreateProjectId] = useState<string>('');
  const [createColumnId, setCreateColumnId] = useState<string>('');
  const [boardColumns, setBoardColumns] = useState<{ id: string; title: string; order: number; projectId?: number | null }[]>([]);
  const [createSelectedTagIds, setCreateSelectedTagIds] = useState<number[]>([]);
  const [createTagPickerOpen, setCreateTagPickerOpen] = useState(false);

  const [orderedNoteIds, setOrderedNoteIds] = useState<number[]>(() => {
    try { const v = localStorage.getItem('notes-ordered-ids'); return v ? JSON.parse(v) : []; } catch { return []; }
  });
  const [pendingDragMove, setPendingDragMove] = useState<{ noteId: number; srcDroppableId: string; dstDroppableId: string; srcIndex: number; dstIndex: number; dstProject: number | 'my-notes' | null } | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const [expandedNoteIds, setExpandedNoteIds] = useState<number[]>([]);
  const [expandedContentMap, setExpandedContentMap] = useState<Record<number, string>>({});

  const [analysisPanelOpen, setAnalysisPanelOpen] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  useEffect(() => { localStorage.setItem('notes-ordered-ids', JSON.stringify(orderedNoteIds)); }, [orderedNoteIds]);
  useEffect(() => { localStorage.setItem('notes-collapsed-projects', JSON.stringify(collapsedProjects)); }, [collapsedProjects]);
  useEffect(() => { if (!pendingDragMove) setDontAsk(false); }, [pendingDragMove]);

  useEffect(() => {
    if (!showCreateModal) return;
    fetch('/api/boards/snapshot', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { if (data?.board?.columns) setBoardColumns(data.board.columns); })
      .catch(() => {});
  }, [showCreateModal]);

  const noteTemplateEditNote = useMemo((): Note | null => {
    if (!editingNoteTemplateMeta) return null;
    const tmpl = editingNoteTemplateMeta.template;
    const base: Note = {
      id: `template-edit-${tmpl.id}` as any,
      title: tmpl.title || '',
      content: tmpl.content || '',
      color: tmpl.color || NOTE_COLORS[0],
      pinned: false,
      projectId: tmpl.projectId ?? null,
      columnId: null,
      tags: tmpl.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return noteTemplateEditOverrides ? { ...base, ...noteTemplateEditOverrides } : base;
  }, [editingNoteTemplateMeta, noteTemplateEditOverrides]);

  const activeNote = useMemo(() => {
    if (noteTemplateEditNote) return noteTemplateEditNote;
    return notes.find(n => n.id === openNoteId) || null;
  }, [notes, openNoteId, noteTemplateEditNote]);
  const tagPopupNote = useMemo(() => notes.find(n => n.id === tagPopupNoteId) || null, [notes, tagPopupNoteId]);

  const loadSharedTags = async () => {
    try {
      const sharedTags = await fetchTags();
      setTags(sharedTags.sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      // Keep the existing tag list if the shared tag endpoint is unavailable.
    }
  };

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

  useEffect(() => { fetchNotes(); fetchProjects(); loadNoteTemplates(); loadSharedTags(); }, []);

  const loadNoteTemplates = async () => {
    try { setNoteTemplates(await fetchNoteTemplates()); } catch {}
  };

  useEffect(() => {
    if (!activeNote) return;
    setDraftTitle(activeNote.title);
    setDraftContent(activeNote.content);
    setDraftProjectId(activeNote.projectId ? String(activeNote.projectId) : '');

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
    setCreateColumnId('');
    setCreateSelectedTagIds([]);
    setShowCreateModal(true);
  };

  const handleCreateNote = async () => {
    try {
      setCreating(true);
      const res = await fetch('/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ title: createTitle, content: createContent, color: createColor, pinned: false, projectId: createProjectId || null, columnId: createColumnId || null }),
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

  const resetCreateNoteDraft = () => {
    setCreateTitle('');
    setCreateContent('');
    setCreateColor(randomFrom(NOTE_COLORS));
    setCreateProjectId('');
    setCreateColumnId('');
    setCreateSelectedTagIds([]);
    setCreateTagPickerOpen(false);
    setTemplateMenuOpen(false);
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

  const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const uploadImages = async (noteId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const newImages: NoteImage[] = [];
    for (const file of Array.from(files)) {
      const url = await fileToDataUrl(file);
      newImages.push({ id: crypto.randomUUID(), fileName: file.name, fileUrl: url, fileSize: file.size });
    }
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, images: [...(n.images || []), ...newImages] } : n));
    setUploading(false);
  };

  const deleteNoteImage = (noteId: number, imageId: string) => {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, images: (n.images || []).filter(img => img.id !== imageId) } : n));
  };

  const moveNoteImage = (noteId: number, imageId: string, direction: 'up' | 'down') => {
    setNotes(prev => prev.map(n => {
      if (n.id !== noteId) return n;
      const imgs = [...(n.images || [])];
      const idx = imgs.findIndex(img => img.id === imageId);
      if (idx === -1) return n;
      if (direction === 'up' && idx === 0) return n;
      if (direction === 'down' && idx === imgs.length - 1) return n;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      [imgs[idx], imgs[swapIdx]] = [imgs[swapIdx], imgs[idx]];
      return { ...n, images: imgs };
    }));
  };

  const toggleTagFilter = (tagId: number) =>
    setSelectedTagIds(prev => (prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]));

  const toggleTagOnNote = async (noteId: number | string, tagId: number) => {
    if (typeof noteId === 'string' && noteId.startsWith('template-edit-')) {
      const currentTags = activeNote?.tags || [];
      const hasTag = currentTags.some(t => t.id === tagId);
      const newTags = hasTag
        ? currentTags.filter(t => t.id !== tagId)
        : [...currentTags, tags.find(t => t.id === tagId)!];
      setNoteTemplateEditOverrides(prev => ({ ...prev, tags: newTags }));
      return;
    }
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
    if (editingNoteTemplateMeta) {
      setNoteTemplateEditOverrides(prev => ({
        ...prev,
        title: draftTitle.trim(),
        content: draftContent,
        projectId: draftProjectId ? Number(draftProjectId) : null,
      }));
      return;
    }
    const nextTitle = draftTitle.trim();
    const nextContent = draftContent;
    const nextProjectId = draftProjectId ? Number(draftProjectId) : null;
    if (nextTitle !== activeNote.title || nextContent !== activeNote.content || nextProjectId !== activeNote.projectId) {
      await applyNoteUpdate(activeNote.id, { title: nextTitle, content: nextContent, projectId: nextProjectId });
    }
  };


  const handleSaveNoteTemplate = useCallback(async () => {
    if (!normalize(tmplName)) return;
    const fromCreate = showCreateModal && createTitle.trim();
    const source = fromCreate
      ? { title: createTitle, content: createContent, color: createColor, projectId: createProjectId ? Number(createProjectId) : null, tags: [] as { id: number; name: string; color: string }[] }
      : activeNote
        ? { title: activeNote.title, content: activeNote.content, color: activeNote.color, projectId: activeNote.projectId ?? null, tags: activeNote.tags }
        : null;
    if (!source) return;
    try {
      const saved = await createNoteTemplate({
        name: normalize(tmplName),
        title: source.title,
        content: source.content,
        color: source.color,
        projectId: source.projectId,
        tags: source.tags,
      });
      setNoteTemplates(prev => [...prev, saved]);
      setSaveTmplOpen(false);
      setTmplName('');
    } catch { setTmplError('Failed to save template'); }
  }, [activeNote, tmplName, showCreateModal, createTitle, createContent, createColor, createProjectId]);

  const handleLoadNoteTemplate = (tmpl: NoteTemplate) => {
    setCreateTitle(tmpl.title);
    setCreateContent(tmpl.content);
    setCreateColor(tmpl.color);
    setCreateProjectId(tmpl.projectId ? String(tmpl.projectId) : '');
    setCreateSelectedTagIds(tmpl.tags.map(t => t.id));
    setShowCreateModal(true);
    setLoadTmplOpen(false);
  };

  const handleEditNoteTemplate = useCallback((tmpl: NoteTemplate) => {
    setNoteTemplateEditOverrides(null);
    setNoteTemplateEditName(tmpl.name);
    setEditingNoteTemplateMeta({ id: tmpl.id, name: tmpl.name, template: tmpl });
    setOpenNoteId(`template-edit-${tmpl.id}` as any);
  }, []);

  const handleSaveNoteTemplateEdit = useCallback(async () => {
    if (!editingNoteTemplateMeta) return;
    const edited = noteTemplateEditOverrides || {};
    try {
      const saved = await updateNoteTemplate(editingNoteTemplateMeta.id, {
        name: noteTemplateEditName || editingNoteTemplateMeta.name,
        title: (edited.title ?? editingNoteTemplateMeta.template.title) || '',
        content: (edited.content ?? editingNoteTemplateMeta.template.content) || '',
        color: (edited.color ?? editingNoteTemplateMeta.template.color) || NOTE_COLORS[0],
        projectId: (edited.projectId !== undefined ? edited.projectId : editingNoteTemplateMeta.template.projectId) ?? null,
        tags: (edited.tags ?? editingNoteTemplateMeta.template.tags) || [],
      });
      setNoteTemplates(prev => prev.map(t => t.id === saved.id ? saved : t));
      setNoteTemplateEditName('');
      setNoteTemplateEditOverrides(null);
      setEditingNoteTemplateMeta(null);
      setOpenNoteId(null);
    } catch { setTmplError('Failed to save template'); }
  }, [editingNoteTemplateMeta, noteTemplateEditOverrides, noteTemplateEditName]);

  const handleDeleteNoteTemplate = async (id: number) => {
    try { await deleteNoteTemplateApi(id); setNoteTemplates(prev => prev.filter(t => t.id !== id)); } catch {}
  };

  const handleSaveAsTemplate = () => {
    if (!activeNote) return;
    setTmplName(activeNote.title || 'Untitled note');
    setTmplError('');
    setEditingNoteTemplateMeta(null);
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
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sortMode === 'alphabetical') return a.title.localeCompare(b.title);
      const aVal = sortMode === 'created' ? a.createdAt : a.updatedAt;
      const bVal = sortMode === 'created' ? b.createdAt : b.updatedAt;
      return new Date(bVal).getTime() - new Date(aVal).getTime();
    };
    return [...filteredNotes].sort(compare);
  }, [filteredNotes, sortMode]);

  const myNotesGroup = useMemo(() => {
    const notes = filteredNotes.filter(n => !n.projectId);
    const sorter = (a: Note, b: Note) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sortMode === 'alphabetical') return a.title.localeCompare(b.title);
      const aVal = sortMode === 'created' ? a.createdAt : a.updatedAt;
      const bVal = sortMode === 'created' ? b.createdAt : b.updatedAt;
      return new Date(bVal).getTime() - new Date(aVal).getTime();
    };
    if (orderedNoteIds.length > 0) {
      const idSet = new Set(notes.map(n => n.id));
      const ordered = orderedNoteIds.filter(id => idSet.has(id));
      const unordered = notes.filter(n => !orderedNoteIds.includes(n.id));
      const orderedNotes = ordered.map(id => notes.find(n => n.id === id)!).filter(Boolean);
      const all = [...orderedNotes, ...unordered];
      const pinned = all.filter(n => n.pinned);
      const unpinned = all.filter(n => !n.pinned);
      return [...pinned.sort(sorter), ...unpinned.sort(sorter)];
    }
    return [...notes].sort(sorter);
  }, [filteredNotes, sortMode, orderedNoteIds]);

  const pinnedFromMyNotes = useMemo(() => myNotesGroup.filter(n => n.pinned), [myNotesGroup]);
  const unpinnedFromMyNotes = useMemo(() => myNotesGroup.filter(n => !n.pinned), [myNotesGroup]);

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

  const getNoteIdForDroppable = (id: string): number | 'my-notes' | null => {
    if (id === 'my-notes') return 'my-notes';
    if (id.startsWith('project-')) return Number(id.slice(8));
    return null;
  };

  const getNotesForDroppable = (id: string): Note[] | null => {
    if (id === 'my-notes') return myNotesGroup;
    if (id.startsWith('project-')) {
      const pg = projectNoteGroups.find(p => p.project.id === Number(id.slice(8)));
      return pg?.notes ?? null;
    }
    return null;
  };

  const applyDragMoveDirect = (srcDroppableId: string, dstDroppableId: string, srcIndex: number, dstIndex: number, dstProject: number | 'my-notes' | null) => {
    const srcNotes = getNotesForDroppable(srcDroppableId);
    const dstNotes = getNotesForDroppable(dstDroppableId);
    if (!srcNotes || !dstNotes) return;
    if (srcNotes.length <= srcIndex || dstNotes.length < dstIndex) return;

    const movingNoteId = srcNotes[srcIndex]?.id;
    if (!movingNoteId) return;

    if (dstProject === 'my-notes') {
      applyNoteUpdate(movingNoteId, { projectId: null });
    } else if (typeof dstProject === 'number') {
      applyNoteUpdate(movingNoteId, { projectId: dstProject });
    }

    const srcIds = srcNotes.map(n => n.id);
    const dstIds = dstNotes.map(n => n.id);
    const [removed] = srcIds.splice(srcIndex, 1);
    dstIds.splice(dstIndex, 0, removed);

    const base = orderedNoteIds.length > 0 ? [...orderedNoteIds] : filteredNotes.map(n => n.id);
    const srcSet = new Set(srcNotes.map(n => n.id));
    const dstSet = new Set(dstNotes.map(n => n.id));
    const resultIds: number[] = [];
    let srcInserted = false;
    let dstInserted = false;
    for (const id of base) {
      if (srcSet.has(id) && !srcInserted) { resultIds.push(...srcIds); srcInserted = true; }
      else if (dstSet.has(id) && !dstInserted) { resultIds.push(...dstIds); dstInserted = true; }
      else if (!srcSet.has(id) && !dstSet.has(id)) { resultIds.push(id); }
    }
    if (!srcInserted) resultIds.push(...srcIds);
    if (!dstInserted) resultIds.push(...dstIds);
    setOrderedNoteIds(resultIds);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const srcProject = getNoteIdForDroppable(result.source.droppableId);
    const dstProject = getNoteIdForDroppable(result.destination.droppableId);
    if (srcProject === null || dstProject === null) return;

    const srcId = result.source.droppableId;
    const dstId = result.destination.droppableId;
    const isCrossProject = srcProject !== dstProject;

    if (isCrossProject) {
      const srcNotes = getNotesForDroppable(srcId);
      if (!srcNotes) return;
      const movingNoteId = srcNotes[result.source.index]?.id;
      if (!movingNoteId) return;
      setPendingDragMove({ noteId: movingNoteId, srcDroppableId: srcId, dstDroppableId: dstId, srcIndex: result.source.index, dstIndex: result.destination.index, dstProject, });
      return;
    }

    const sectionNotes = getNotesForDroppable(srcId);
    if (!sectionNotes) return;

    const sectionNoteIds = sectionNotes.map(n => n.id);
    const ids = [...sectionNoteIds];
    const [removed] = ids.splice(result.source.index, 1);
    ids.splice(result.destination.index, 0, removed);

    const base = orderedNoteIds.length > 0 ? [...orderedNoteIds] : filteredNotes.map(n => n.id);
    const sectionIdSet = new Set(sectionNoteIds);
    const resultIds: number[] = [];
    let inserted = false;
    for (const id of base) {
      if (sectionIdSet.has(id)) {
        if (!inserted) { resultIds.push(...ids); inserted = true; }
      } else {
        resultIds.push(id);
      }
    }
    setOrderedNoteIds(resultIds);
  };

  const toggleExpand = (noteId: number) => {
    const note = notes.find(n => n.id === noteId);
    setExpandedNoteIds(prev =>
      prev.includes(noteId) ? prev.filter(id => id !== noteId) : [...prev, noteId]
    );
    if (note) {
      setEditingContentText(note.content || '');
      setExpandedContentMap(prev => ({ ...prev, [noteId]: note.content || '' }));
    }
  };

  const matchingCount = filteredNotes.length;

  const renderNoteRow = (note: Note, dragHandleProps?: any, isDragging?: boolean) => {
    const isExpanded = expandedNoteIds.includes(note.id);
    const preview = note.content.split('\n').slice(0, 2).join(' ').trim();

    return (
      <div
        key={note.id}
        onClick={() => {
          if (isDeleteMode) {
            setSelectedDeleteIds(prev =>
              prev.includes(note.id) ? prev.filter(id => id !== note.id) : [...prev, note.id]
            );
          } else {
            setOpenNoteId(note.id);
          }
        }}
        className={cn(
          'group border rounded-xl bg-card transition-all duration-200 cursor-pointer',
          isDeleteMode
            ? selectedDeleteIds.includes(note.id)
              ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
              : 'border-border hover:bg-muted/20'
            : isDragging
              ? 'border-primary/40 shadow-lg rotate-[2deg]'
              : 'border-border hover:border-border/80 hover:shadow-sm'
        )}
        style={!isDeleteMode ? { borderLeftColor: note.color === NOTE_COLORS[0] ? undefined : note.color, borderLeftWidth: note.color === NOTE_COLORS[0] ? undefined : '3px' } : undefined}
      >
        <div className="flex items-center gap-1 px-4 py-5 min-h-[88px]">
          {dragHandleProps && (
            <div {...dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground transition-colors flex-shrink-0">
              <GripVertical className="w-4 h-4" />
            </div>
          )}
          {!isDeleteMode && (
            <button
              onClick={e => { e.stopPropagation(); togglePin(note); }}
              className={`p-1.5 rounded-md flex-shrink-0 transition-all ${note.pinned ? 'text-primary' : 'text-muted-foreground/30 hover:text-muted-foreground'}`}
              title={note.pinned ? 'Unpin note' : 'Pin note'}
            >
              <Pin className={`w-3.5 h-3.5 ${note.pinned ? 'fill-current' : ''}`} />
            </button>
          )}
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
          ) : null}

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
                  className="text-xs text-muted-foreground mt-1.5 line-clamp-2 cursor-text hover:bg-muted/30 rounded px-1 -mx-1"
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
            <button
              onClick={e => { e.stopPropagation(); toggleExpand(note.id); }}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
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

        {isExpanded && !isDeleteMode && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 space-y-3 bg-muted/10 rounded-b-xl">
            <textarea
              value={expandedContentMap[note.id] ?? note.content ?? ''}
              onChange={e => setExpandedContentMap(prev => ({ ...prev, [note.id]: e.target.value }))}
              onBlur={async () => {
                const val = expandedContentMap[note.id] ?? note.content ?? '';
                if (val !== (note.content || '')) {
                  await applyNoteUpdate(note.id, { content: val });
                }
              }}
              rows={3}
              className="w-full bg-muted/20 border border-border rounded-xl p-3 text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex items-center gap-2 flex-wrap">
              {note.tags.slice(0, 5).map(tag => (
                <span key={tag.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium text-white" style={{ backgroundColor: tag.color }}>
                  {tag.name}
                </span>
              ))}
              {note.tags.length > 5 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  +{note.tags.length - 5}
                </span>
              )}
              <button onClick={e => { e.stopPropagation(); setTagPopupNoteId(tagPopupNoteId === note.id ? null : note.id); }} className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
                Edit tags
              </button>
            </div>
            <div className="flex justify-end pt-1">
              <button
                onClick={e => { e.stopPropagation(); setSingleDeleteId(note.id); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Note
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-card/30">
        <div>
          <h1 className="text-lg font-bold text-foreground">All Notes</h1>
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
              onClick={async () => {
                try {
                  setNoteTemplates(await fetchNoteTemplates());
                  setTmplPopupOpen(true);
                } catch {}
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border transition-all bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Star className="w-4 h-4" />
              Templates
            </button>
            {tmplPopupOpen && (
              <div className="absolute right-0 mt-1.5 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Templates</h3>
                  </div>
                  <button onClick={() => setTmplPopupOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                {noteTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center mb-2">
                      <Star className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-foreground">No templates yet</p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-border">
                    {noteTemplates.map(tmpl => (
                      <div key={tmpl.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-all group">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-lg bg-primary/5 flex items-center justify-center flex-shrink-0">
                            <Star className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium text-foreground block truncate">{tmpl.name}</span>
                            {tmpl.title && <span className="text-[11px] text-muted-foreground truncate block">{tmpl.title}</span>}
                          </div>
                        </div>
                        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all ml-2">
                          <button
                            onClick={() => {
                              setTmplPopupOpen(false);
                              handleEditNoteTemplate(tmpl);
                            }}
                            className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
                            title="Edit template"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Delete template "${tmpl.name}"?`)) return;
                              await handleDeleteNoteTemplate(tmpl.id);
                              setNoteTemplates(await fetchNoteTemplates());
                            }}
                            className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-all"
                            title="Delete template"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
            {selectedTagIds.length > 0 && (
              <button
                onClick={() => setSelectedTagIds([])}
                className="px-3 py-1.5 text-xs rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                Clear tags
              </button>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setTagPickerOpen(prev => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            >
              <Tag className="w-3.5 h-3.5" />
              Tags
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {tagPickerOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setTagPickerOpen(false)} />
                <div className="absolute left-0 mt-1.5 w-96 max-w-[95vw] bg-card border border-border rounded-2xl shadow-xl z-30 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Tag filter</p>
                      <p className="text-xs text-muted-foreground">Filter notes by tag.</p>
                    </div>
                    <button onClick={() => setTagPickerOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {tags.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">No tags yet.</p>
                    )}
                    {tags.map(tag => {
                      const isActive = selectedTagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          onClick={() => toggleTagFilter(tag.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left ${
                            isActive
                              ? 'border-primary/30 bg-primary/5 shadow-sm'
                              : 'border-border/60 hover:bg-muted/40'
                          }`}
                        >
                          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                          <span className="text-sm text-foreground flex-1">{tag.name}</span>
                          {isActive && <span className="text-[10px] text-primary font-bold">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            onClick={() => setPinFilter(prev => prev === 'all' ? 'pinned' : prev === 'pinned' ? 'unpinned' : 'all')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border transition-all ${
              pinFilter !== 'all'
                ? 'bg-primary/10 border-primary/20 text-primary font-bold shadow-sm'
                : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <Pin className={`w-3.5 h-3.5 ${pinFilter === 'pinned' ? 'fill-current' : ''}`} />
            <span>{pinFilter === 'all' ? 'Pinned' : pinFilter === 'pinned' ? 'Pinned' : 'Unpinned'}</span>
          </button>

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

          <div className="ml-auto flex items-center gap-2">
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

      <div className="flex-1 overflow-y-auto p-6 relative">
        <DragDropContext onDragEnd={handleDragEnd}>
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
                    <Droppable droppableId="my-notes">
                      {(dropProvided, snapshot) => (
                        <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="space-y-1.5">
                          {myNotesGroup.map((note, index) => (
                            <Draggable key={note.id} draggableId={String(note.id)} index={index}>
                              {(taskProvided, taskSnapshot) => (
                                <div ref={taskProvided.innerRef} {...taskProvided.draggableProps}>
                                  {renderNoteRow(note, taskProvided.dragHandleProps, taskSnapshot.isDragging)}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {dropProvided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  )}
                </div>
              )}

              {myNotesGroup.length > 0 && projectNoteGroups.length > 0 && <div className="w-full h-0.5 bg-border/40 my-4" />}

              {/* Project sections */}
              {projectNoteGroups.map(({ project, notes: projectNotes }, idx) => {
                const isCollapsed = collapsedProjects.includes(project.id);
                return (
                  <div key={project.id} className="mb-3">
                    {idx > 0 && <div className="w-full h-0.5 bg-border/40 my-4" />}
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
                      <Droppable droppableId={"project-" + project.id}>
                        {(dropProvided, snapshot) => (
                          <div ref={dropProvided.innerRef} {...dropProvided.droppableProps} className="pl-4 space-y-1.5">
                            {projectNotes.map((note, index) => (
                              <Draggable key={note.id} draggableId={"p-" + note.id} index={index}>
                                {(taskProvided, taskSnapshot) => (
                                  <div ref={taskProvided.innerRef} {...taskProvided.draggableProps}>
                                    {renderNoteRow(note, taskProvided.dragHandleProps, taskSnapshot.isDragging)}
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {dropProvided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
        </DragDropContext>
      </div>
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={() => { setShowCreateModal(false); resetCreateNoteDraft(); }}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-3xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">Create Note</h2>
              <button onClick={() => { setShowCreateModal(false); resetCreateNoteDraft(); }} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Note title</label>
                <input
                  autoFocus
                  value={createTitle}
                  onChange={e => setCreateTitle(e.target.value)}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Project</label>
                  <Select value={createProjectId || 'none'} onValueChange={v => { setCreateProjectId(v === 'none' ? '' : v); setCreateColumnId(''); }}>
                    <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                      <SelectValue placeholder="My Notes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">My Notes</SelectItem>
                      {projects.map(p => (<SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                {createProjectId !== '' && (
                  <div>
                    <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Column</label>
                    <Select value={createColumnId} onValueChange={v => setCreateColumnId(v)}>
                      <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent>
                        {boardColumns
                          .filter(col => col.projectId === Number(createProjectId))
                          .sort((a, b) => a.order - b.order)
                          .map(col => (
                            <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Tags</label>
                <div className="mt-1 relative">
                  {createSelectedTagIds.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {tags.filter(t => createSelectedTagIds.includes(t.id)).map(tag => (
                        <span key={tag.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: tag.color }}>
                          {tag.name}
                          <button onClick={() => setCreateSelectedTagIds(prev => prev.filter(id => id !== tag.id))} className="hover:opacity-70">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => setCreateTagPickerOpen(prev => !prev)}
                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs rounded-xl border bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    {createSelectedTagIds.length > 0 ? `${createSelectedTagIds.length} tag${createSelectedTagIds.length > 1 ? 's' : ''} selected` : 'Add tags'}
                  </button>
                  {createTagPickerOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setCreateTagPickerOpen(false)} />
                      <div className="absolute left-0 bottom-full mb-2 w-96 max-w-[95vw] bg-card border border-border rounded-2xl shadow-xl z-30 p-4 space-y-3">
                        <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                          {tags.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-3">No tags yet.</p>
                          )}
                          {tags.map(tag => {
                            const active = createSelectedTagIds.includes(tag.id);
                            return (
                              <button
                                key={tag.id}
                                onClick={() => setCreateSelectedTagIds(prev => active ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all text-left ${
                                  active
                                    ? 'border-primary/30 bg-primary/5 shadow-sm'
                                    : 'border-border/60 hover:bg-muted/40'
                                }`}
                              >
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
                <textarea
                  value={createContent}
                  onChange={e => setCreateContent(e.target.value)}
                  rows={4}
                  className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
                />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border flex justify-between items-center gap-2">
              <div className="relative">
                <button
                  onClick={() => setTemplateMenuOpen(!templateMenuOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
                >
                  <Star className="w-3.5 h-3.5" />
                  Templates
                </button>
                {templateMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-20" onClick={() => setTemplateMenuOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-48 bg-card border border-border rounded-xl shadow-xl z-30 p-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); setTemplateMenuOpen(false); setTmplName(''); setTmplError(''); setSaveTmplOpen(true); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted transition-all"
                      >
                        <div className="w-6 h-6 rounded-md bg-primary/5 flex items-center justify-center">
                          <Plus className="w-3.5 h-3.5 text-primary" />
                        </div>
                        Save as template
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setTemplateMenuOpen(false);
                          setTmplError('');
                          try {
                            const t = await fetchNoteTemplates();
                            setNoteTemplates(t);
                            setLoadTmplOpen(true);
                          } catch (err) {
                            setTmplError('Failed to load templates. Check your connection and try again.');
                            setTimeout(() => setTmplError(''), 4000);
                          }
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted transition-all"
                      >
                        <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center">
                          <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        Load template
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowCreateModal(false); resetCreateNoteDraft(); }} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                <button
                  onClick={handleCreateNote}
                  disabled={creating || !createTitle.trim()}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
                >
                  {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save
                </button>
              </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setOpenNoteId(null); }}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-y-auto p-5 space-y-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                {editingNoteTemplateMeta ? (
                  <div className="mb-2">
                    <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Template name</label>
                    <input
                      className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={noteTemplateEditName}
                      onChange={e => setNoteTemplateEditName(e.target.value)}
                      placeholder="Template name"
                    />
                  </div>
                ) : null}
                <input
                  className="w-full px-1 text-2xl font-semibold text-foreground bg-transparent border-none focus:outline-none focus:ring-0"
                  value={draftTitle}
                  onChange={e => { setDraftTitle(e.target.value); saveDrafts(); }}
                />
              </div>
              <div className="flex items-center gap-2">
                {editingNoteTemplateMeta ? (
                  <>
                    <button onClick={async () => { setNoteTemplateEditOverrides(null); setNoteTemplateEditName(''); setEditingNoteTemplateMeta(null); setOpenNoteId(null); }} className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all font-medium">
                      Cancel
                    </button>
                    <button onClick={handleSaveNoteTemplateEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-all">
                      <Save className="w-3.5 h-3.5" />
                      Save Template
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => togglePin(activeNote)} className={`rounded-lg p-2 transition-colors ${activeNote.pinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`} title={activeNote.pinned ? 'Unpin note' : 'Pin note'}>
                      <Pin className={`w-4 h-4 ${activeNote.pinned ? 'fill-current' : ''}`} />
                    </button>
                    <button onClick={() => setOpenNoteId(null)} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Project</label>
                <Select value={draftProjectId || 'none'} onValueChange={v => { setDraftProjectId(v === 'none' ? '' : v); saveDrafts(); }}>
                  <SelectTrigger className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm h-10">
                    <SelectValue placeholder="My Notes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">My Notes</SelectItem>
                    {projects.map(p => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground mb-1 block">Content</label>
              <textarea
                value={draftContent}
                onChange={e => { setDraftContent(e.target.value); saveDrafts(); }}
                rows={8}
                className="mt-1 w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm resize-none"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  Tags
                </h3>
                <button
                  onClick={() => setTagPopupNoteId(tagPopupNoteId === activeNote.id ? null : activeNote.id)}
                  className="text-xs text-primary hover:underline"
                >
                  {tagPopupNoteId === activeNote.id ? 'Close' : 'Edit'}
                </button>
              </div>

              {activeNote.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {activeNote.tags.map(tag => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white"
                      style={{ backgroundColor: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}

              {tagPopupNoteId === activeNote.id && (
                <div className="rounded-2xl border border-border bg-muted/20 p-3 space-y-3">
                  <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                    {tags.map(tag => {
                      const active = activeNote.tags.some(t => t.id === tag.id);
                      return (
                        <div key={tag.id} className="flex items-center gap-2 rounded-xl border border-border/60 px-3 py-2">
                          <button
                            onClick={() => toggleTagOnNote(activeNote.id, tag.id)}
                            className="flex flex-1 items-center gap-2 text-left"
                          >
                            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
                            <span className="text-sm text-foreground">{tag.name}</span>
                            {active && <span className="ml-auto text-[10px] text-primary font-semibold">Selected</span>}
                          </button>
                          <button
                            onClick={() => deleteTagEverywhere(tag.id)}
                            className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Delete tag everywhere"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newTagName}
                      onChange={e => setNewTagName(e.target.value)}
                      placeholder="Create tag"
                      className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <button
                      onClick={() => setNewTagColor(randomFrom(TAG_COLORS))}
                      className="w-11 rounded-xl border border-border"
                      style={{ backgroundColor: newTagColor }}
                      title="Random color"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={addTagToNote}
                      disabled={!normalize(newTagName)}
                      className="flex-1 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      Add tag
                    </button>
                    <button
                      onClick={() => setTagPopupNoteId(null)}
                      className="rounded-xl border border-border px-3 py-2 text-sm text-muted-foreground"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <button
                onClick={() => setImagesCollapsed(prev => !prev)}
                className="w-full flex items-center justify-between px-1 py-1.5 rounded-lg hover:bg-muted/30 transition-all"
              >
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Images</h3>
                  {activeNote.images && activeNote.images.length > 0 && (
                    <span className="text-xs text-muted-foreground">({activeNote.images.length})</span>
                  )}
                </div>
                {imagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
              </button>
              {!imagesCollapsed && (
                <div className="space-y-3">
                  <label className="flex flex-col items-center justify-center w-full min-h-[80px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                    <div className="flex flex-col items-center justify-center py-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mb-1.5">
                        <Paperclip className="w-4 h-4 text-primary" />
                      </div>
                      <p className="text-xs font-medium text-foreground">Click to upload images</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">PNG, JPG, GIF (max 10MB)</p>
                    </div>
                    <input type="file" multiple accept="image/*" onChange={e => { uploadImages(activeNote.id, e.target.files); e.target.value = ''; }} disabled={uploading} className="hidden" />
                  </label>
                  {uploading && (
                    <div className="flex items-center justify-center gap-2 py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Uploading...</span>
                    </div>
                  )}
                  {activeNote.images && activeNote.images.length > 0 && (
                    <div className="space-y-2">
                      {activeNote.images.map((img, idx) => (
                        <div key={img.id} className="relative group/img flex items-center gap-2 p-2 rounded-xl border border-border bg-muted/30">
                          <div className="flex flex-col gap-0.5 flex-shrink-0">
                            <button
                              onClick={() => moveNoteImage(activeNote.id, img.id, 'up')}
                              disabled={idx === 0}
                              className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => moveNoteImage(activeNote.id, img.id, 'down')}
                              disabled={idx === activeNote.images!.length - 1}
                              className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                          {img.fileUrl.match(/^data:image/) ? (
                            <img src={img.fileUrl} alt={img.fileName} className="w-12 h-12 rounded-lg object-cover border border-border flex-shrink-0" />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-background border border-border flex items-center justify-center flex-shrink-0">
                              <Paperclip className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{img.fileName}</p>
                            <p className="text-[10px] text-muted-foreground">{(img.fileSize / 1024).toFixed(1)} KB</p>
                          </div>
                          <button
                            onClick={() => deleteNoteImage(activeNote.id, img.id)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover/img:opacity-100 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Created: {new Date(activeNote.createdAt).toLocaleDateString()}</span>
                <div className="relative">
                  <button
                    onClick={async () => { try { const t = await fetchNoteTemplates(); setNoteTemplates(t); setTemplateMenuOpen(true); } catch {} }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-muted transition-all"
                  >
                    <Star className="w-3.5 h-3.5" />
                    Templates
                  </button>
                  {templateMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-20" onClick={() => setTemplateMenuOpen(false)} />
                      <div className="absolute bottom-full left-0 mb-2 w-48 bg-card border border-border rounded-xl shadow-xl z-30 p-1.5">
                        <button
                          onClick={() => { setTemplateMenuOpen(false); setTmplName(''); setTmplError(''); setSaveTmplOpen(true); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted transition-all"
                        >
                          <div className="w-6 h-6 rounded-md bg-primary/5 flex items-center justify-center">
                            <Plus className="w-3.5 h-3.5 text-primary" />
                          </div>
                          Save as template
                        </button>
                        <button
                          onClick={async () => {
                            setTemplateMenuOpen(false);
                            try {
                              const t = await fetchNoteTemplates();
                              setNoteTemplates(t);
                              setLoadTmplOpen(true);
                            } catch {}
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-foreground rounded-lg hover:bg-muted transition-all"
                        >
                          <div className="w-6 h-6 rounded-md bg-muted/50 flex items-center justify-center">
                            <FolderKanban className="w-3.5 h-3.5 text-muted-foreground" />
                          </div>
                          Load template
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSingleDeleteId(activeNote.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10 rounded-lg transition-all font-medium">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {analysisPanelOpen && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div className="absolute inset-0 bg-black/10 pointer-events-auto" onClick={() => setAnalysisPanelOpen(false)} />
          <aside className="absolute right-0 top-0 h-full w-full max-w-sm bg-card border-l border-border shadow-[-10px_0_30px_rgba(0,0,0,0.08)] pointer-events-auto flex flex-col">
            <header className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-primary" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">Note Analysis</h3>
              </div>
              <button onClick={() => setAnalysisPanelOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-4">
              {analysisLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  Analyzing notes...
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="text-base font-semibold text-foreground">Notes Overview</h4>
                  <p className="text-sm text-muted-foreground">{filteredNotes.length} notes in current view</p>
                  <div className="space-y-2">
                    {(() => {
                      const pinnedCount = filteredNotes.filter(n => n.pinned).length;
                      const withTags = filteredNotes.filter(n => n.tags.length > 0).length;
                      const withProjects = filteredNotes.filter(n => n.projectId).length;
                      return [
                        { text: `${pinnedCount} pinned` },
                        { text: `${filteredNotes.length - pinnedCount} unpinned` },
                        { text: `${withTags} with tags` },
                        { text: `${withProjects} with projects` },
                      ].map((line, idx) => (
                        <div key={idx} className="text-sm text-foreground bg-muted/30 rounded-lg px-3 py-2">{line.text}</div>
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}

      {saveTmplOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => { setSaveTmplOpen(false); setTmplName(''); setTmplError(''); setEditingNoteTemplateMeta(null); }}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Star className="w-4 h-4 text-primary" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">Save as template</h2>
              </div>
              <button onClick={() => { setSaveTmplOpen(false); setTmplName(''); setTmplError(''); setEditingNoteTemplateMeta(null); }} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              {tmplError && (
                <div className="flex items-center gap-2 px-3 py-2 text-xs text-destructive bg-destructive/10 rounded-lg">
                  <span>⚠</span>
                  <span>{tmplError}</span>
                </div>
              )}
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground mb-1.5 block">Template name</label>
                <input
                  autoFocus
                  placeholder="e.g. Meeting Notes Template"
                  value={tmplName}
                  onChange={e => setTmplName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && normalize(tmplName) && document.getElementById('save-note-template-btn')?.click()}
                  className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={() => { setSaveTmplOpen(false); setTmplName(''); setTmplError(''); setEditingNoteTemplateMeta(null); }} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Cancel</button>
              <button
                id="save-note-template-btn"
                onClick={handleSaveNoteTemplate}
                disabled={!normalize(tmplName)}
                className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {loadTmplOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setLoadTmplOpen(false)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FolderKanban className="w-4 h-4 text-primary" />
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
                    <FolderKanban className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No templates yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Save a note as a template first.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {noteTemplates.map(tmpl => (
                    <div key={tmpl.id} className="group flex items-center gap-2 px-3 py-2 hover:bg-muted/50 rounded-xl border border-transparent hover:border-border transition-all">
                      <button
                        onClick={() => handleLoadNoteTemplate(tmpl)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-primary/5 flex items-center justify-center flex-shrink-0">
                          <Star className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block truncate">{tmpl.name}</span>
                          {tmpl.title && <span className="text-xs text-muted-foreground truncate block">{tmpl.title}</span>}
                        </div>
                      </button>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                        <button
                          onClick={() => {
                            setLoadTmplOpen(false);
                            handleEditNoteTemplate(tmpl);
                          }}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
                          title="Edit template"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Delete template "${tmpl.name}"?`)) return;
                            await handleDeleteNoteTemplate(tmpl.id);
                            setNoteTemplates(await fetchNoteTemplates());
                          }}
                          className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg hover:bg-destructive/10 transition-all"
                          title="Delete template"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end px-5 py-4 border-t border-border">
              <button onClick={() => setLoadTmplOpen(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Close</button>
            </div>
          </div>
        </div>
      )}

      {pendingDragMove && (() => {
        const { srcDroppableId, dstDroppableId, srcIndex, dstIndex, dstProject } = pendingDragMove;

        const confirmMove = () => {
          if (dontAsk) {
            localStorage.setItem('notes-drag-confirm-project', 'true');
          }
          applyDragMoveDirect(srcDroppableId, dstDroppableId, srcIndex, dstIndex, dstProject);
          setPendingDragMove(null);
        };

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setPendingDragMove(null)}>
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
            <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-bold text-foreground">Move note?</h3>
              <p className="text-xs text-muted-foreground mt-2">
                Are you sure you want to move this note? It will change the note&apos;s project.
              </p>
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input type="checkbox" checked={dontAsk} onChange={e => setDontAsk(e.target.checked)} className="rounded border-border" />
                <span className="text-xs text-muted-foreground">Don&apos;t ask me again</span>
              </label>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setPendingDragMove(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                <button onClick={confirmMove} className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:opacity-90">Move</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default Notes;
