import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  GripVertical,
  FolderKanban,
  Plus,
  Save,
  Search,
  Sparkles,
  Star,
  Tag,
  Trash2,
  X,
  Pin,
} from 'lucide-react';
import { fetchNoteTemplates, createNoteTemplate, updateNoteTemplate, deleteNoteTemplate as deleteNoteTemplateApi } from '@/services/noteTemplateService';
import type { NoteTemplate } from '@/services/noteTemplateService';
import { createTag, deleteTag, fetchTags, type SharedTag } from '@/services/tagService';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import NoteRow from '@/components/notes/NoteRow';
import NoteCreateModal from '@/components/notes/NoteCreateModal';
import NoteDetailModal from '@/components/notes/NoteDetailModal';
import NoteAnalysisPanel from '@/components/notes/NoteAnalysisPanel';
import NoteTagPopup from '@/components/notes/NoteTagPopup';
import DeleteConfirmDialog from '@/components/shared/DeleteConfirmDialog';
import type { Checklist, Subtask, TaskStatus } from '@/types/board';

type NoteTag = SharedTag;

interface NoteImage {
  id: string; fileName: string; fileUrl: string; fileSize: number;
}

interface Note {
  id: number;
  title: string; content: string; color: string; pinned: boolean;
  projectId?: number | null; columnId?: number | null;
  createdAt: string; updatedAt: string;
  tags: NoteTag[]; images?: NoteImage[];
  checklists: Checklist[]; subtasks: Subtask[]; status: TaskStatus;
}

interface Project { id: number; name: string; color: string; }

const NOTE_COLORS = [
  'hsl(var(--card))', 'hsl(45 93% 55% / 0.1)', 'hsl(142 70% 45% / 0.1)',
  'hsl(217 91% 60% / 0.1)', 'hsl(252 85% 65% / 0.1)', 'hsl(330 80% 60% / 0.1)',
];

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'to_do', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'completed', label: 'Completed' },
];

const TAG_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
const normalize = (value: string) => value.trim().replace(/\s+/g, ' ');
const randomFrom = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)] || items[0];
const PIN_FILTERS = ['all', 'pinned', 'unpinned'] as const;

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as string); reader.onerror = reject; reader.readAsDataURL(file); });

const isNoteCompleted = (note: Note) => note.status === 'completed';

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
  const [draftChecklists, setDraftChecklists] = useState<Checklist[]>([]);
  const [draftSubtasks, setDraftSubtasks] = useState<Subtask[]>([]);
  const [draftStatus, setDraftStatus] = useState<TaskStatus>('to_do');
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
  const [tagsCollapsed, setTagsCollapsed] = useState(false);
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

  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');

  const [isSortByDate, setIsSortByDate] = useState(false);
  const [sortDateDesc, setSortDateDesc] = useState(false);

  const [completedOpen, setCompletedOpen] = useState(true);
  const [dontAskDrag, setDontAskDrag] = useState(false);

  const [aiBuilderOpen, setAiBuilderOpen] = useState(false);
  const [aiBuilderInput, setAiBuilderInput] = useState('');
  const [aiBuilderLoading, setAiBuilderLoading] = useState(false);
  const [aiBuilderError, setAiBuilderError] = useState('');

  const [tagDeleteConfirm, setTagDeleteConfirm] = useState<number | null>(null);

  const [mainTemplates, setMainTemplates] = useState<NoteTemplate[]>([]);
  const [mainTmplPopupOpen, setMainTmplPopupOpen] = useState(false);

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
    return {
      id: `template-edit-${tmpl.id}` as any,
      title: tmpl.title || '', content: tmpl.content || '',
      color: tmpl.color || NOTE_COLORS[0], pinned: false,
      projectId: tmpl.projectId ?? null, columnId: null,
      tags: tmpl.tags || [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      checklists: [], subtasks: [], status: 'to_do',
    };
  }, [editingNoteTemplateMeta, noteTemplateEditOverrides]);

  const activeNote = useMemo(() => {
    if (noteTemplateEditNote) return noteTemplateEditNote;
    return notes.find(n => n.id === openNoteId) || null;
  }, [notes, openNoteId, noteTemplateEditNote]);
  const tagPopupNote = useMemo(() => notes.find(n => n.id === tagPopupNoteId) || null, [notes, tagPopupNoteId]);

  const loadSharedTags = async () => {
    try { const sharedTags = await fetchTags(); setTags(sharedTags.sort((a, b) => a.name.localeCompare(b.name))); } catch {}
  };

  const fetchNotes = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/notes', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch notes');
      const data = await res.json();
      setNotes((data.notes || []).map((note: any) => {
        let checklists: Checklist[] = []; let subtasks: Subtask[] = []; let status: TaskStatus = 'to_do';
        try { checklists = Array.isArray(note.checklists) ? note.checklists : JSON.parse(note.checklists || '[]'); } catch { checklists = []; }
        try { subtasks = Array.isArray(note.subtasks) ? note.subtasks : JSON.parse(note.subtasks || '[]'); } catch { subtasks = []; }
        try { status = (note.status as TaskStatus) || 'to_do'; } catch { status = 'to_do'; }
        return { id: note.id, title: note.title || '', content: note.content || '', color: note.color || NOTE_COLORS[0], pinned: Boolean(note.pinned), projectId: note.projectId, columnId: note.columnId, createdAt: note.createdAt || new Date().toISOString(), updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(), tags: Array.isArray(note.tags) ? note.tags : [], checklists, subtasks, status };
      }));
      setTags((data.tags || []).map((tag: any) => ({ id: tag.id, name: tag.name, color: tag.color })));
      setError(null);
    } catch { setError('Failed to load notes'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchNotes(); fetchProjects(); loadNoteTemplates(); loadSharedTags(); }, []);

  const loadNoteTemplates = async () => { try { setNoteTemplates(await fetchNoteTemplates()); } catch {} };

  useEffect(() => {
    if (!activeNote) return;
    setDraftTitle(activeNote.title);
    setDraftContent(activeNote.content);
    setDraftProjectId(activeNote.projectId ? String(activeNote.projectId) : '');
    setDraftChecklists(activeNote.checklists ?? []);
    setDraftSubtasks(activeNote.subtasks ?? []);
    setDraftStatus(activeNote.status ?? 'to_do');
  }, [activeNote?.id]);

  const fetchProjects = async () => {
    try { const res = await fetch('/api/projects', { credentials: 'include' }); if (res.ok) { const data = await res.json(); setProjects(data.projects || data); } } catch {}
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
      if (data?.id) {
        let checklists: Checklist[] = []; let subtasks: Subtask[] = [];
        try { checklists = Array.isArray(data.checklists) ? data.checklists : JSON.parse(data.checklists || '[]'); } catch { checklists = []; }
        try { subtasks = Array.isArray(data.subtasks) ? data.subtasks : JSON.parse(data.subtasks || '[]'); } catch { subtasks = []; }
        const status: TaskStatus = (data.status as TaskStatus) || 'to_do';
        setNotes(prev => prev.map(n => (n.id === data.id ? { ...n, ...data, checklists, subtasks, status } : n)));
      }
    } catch { fetchNotes(); }
  };

  const openCreateModal = () => {
    setCreateTitle(''); setCreateContent(''); setCreateColor(randomFrom(NOTE_COLORS));
    setCreateProjectId(''); setCreateColumnId(''); setCreateSelectedTagIds([]); setShowCreateModal(true);
  };

  const handleCreateNote = async (data: { title: string; content: string; color: string; projectId: string; columnId: string; selectedTagIds: number[] }) => {
    try {
      setCreating(true);
      const res = await fetch('/api/notes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ title: data.title, content: data.content, color: data.color, pinned: false, projectId: data.projectId || null, columnId: data.columnId || null }),
      });
      if (!res.ok) throw new Error('Failed to create note');
      const created = await res.json();
      const next: Note = {
        id: created.id, title: created.title || '', content: created.content || '',
        color: created.color || NOTE_COLORS[0], pinned: Boolean(created.pinned),
        projectId: created.projectId, createdAt: created.createdAt || new Date().toISOString(),
        updatedAt: created.updatedAt || created.createdAt || new Date().toISOString(),
        tags: Array.isArray(created.tags) ? created.tags : [], checklists: [], subtasks: [], status: 'to_do',
      };
      setNotes(prev => [next, ...prev]);
      setShowCreateModal(false);
      for (const tagId of data.selectedTagIds) {
        try { await fetch(`/api/notes/${next.id}/tags/${tagId}/toggle`, { method: 'POST', credentials: 'include' }); } catch {}
      }
      const tagRes = await fetch('/api/notes', { credentials: 'include' });
      if (tagRes.ok) {
        const tagData = await tagRes.json();
        setNotes((tagData.notes || []).map((note: any) => {
          let checklists: Checklist[] = []; let subtasks: Subtask[] = []; let status: TaskStatus = 'to_do';
          try { checklists = Array.isArray(note.checklists) ? note.checklists : JSON.parse(note.checklists || '[]'); } catch { checklists = []; }
          try { subtasks = Array.isArray(note.subtasks) ? note.subtasks : JSON.parse(note.subtasks || '[]'); } catch { subtasks = []; }
          try { status = (note.status as TaskStatus) || 'to_do'; } catch { status = 'to_do'; }
          return { id: note.id, title: note.title || '', content: note.content || '', color: note.color || NOTE_COLORS[0], pinned: Boolean(note.pinned), projectId: note.projectId, columnId: note.columnId, createdAt: note.createdAt || new Date().toISOString(), updatedAt: note.updatedAt || note.createdAt || new Date().toISOString(), tags: Array.isArray(note.tags) ? note.tags : [], checklists, subtasks, status };
        }));
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

  const toggleTagFilter = (tagId: number) =>
    setSelectedTagIds(prev => (prev.includes(tagId) ? prev.filter(id => id !== tagId) : [...prev, tagId]));

  const toggleTagOnNote = async (noteId: number | string, tagId: number) => {
    if (typeof noteId === 'string' && noteId.startsWith('template-edit-')) {
      const currentTags = activeNote?.tags || [];
      const hasTag = currentTags.some(t => t.id === tagId);
      setNoteTemplateEditOverrides(prev => ({
        ...prev, tags: hasTag ? currentTags.filter(t => t.id !== tagId) : [...currentTags, tags.find(t => t.id === tagId)!]
      }));
      return;
    }
    try {
      const res = await fetch(`/api/notes/${noteId}/tags/${tagId}/toggle`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error('Failed to toggle tag');
      const data = await res.json();
      if (data?.note?.id) setNotes(prev => prev.map(n => (n.id === data.note.id ? { ...n, ...data.note } : n)));
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
      if (data?.note?.id) setNotes(prev => prev.map(n => (n.id === data.note.id ? { ...n, ...data.note } : n)));
      if (data?.tag) setTags(prev => prev.some(t => t.id === data.tag.id) ? prev : [...prev, data.tag].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTagName(''); setNewTagColor(randomFrom(TAG_COLORS));
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
      setNoteTemplateEditOverrides(prev => ({ ...prev, title: draftTitle.trim(), content: draftContent, projectId: draftProjectId ? Number(draftProjectId) : null }));
      return;
    }
    const nextTitle = draftTitle.trim(); const nextContent = draftContent; const nextProjectId = draftProjectId ? Number(draftProjectId) : null;
    if (nextTitle !== activeNote.title || nextContent !== activeNote.content || nextProjectId !== activeNote.projectId) {
      await applyNoteUpdate(activeNote.id, { title: nextTitle, content: nextContent, projectId: nextProjectId });
    }
  };

  const handleSaveNoteTemplate = useCallback(async () => {
    if (!normalize(tmplName)) return;
    const source = showCreateModal && createTitle.trim()
      ? { title: createTitle, content: createContent, color: createColor, projectId: createProjectId ? Number(createProjectId) : null, tags: [] as { id: number; name: string; color: string }[] }
      : activeNote ? { title: activeNote.title, content: activeNote.content, color: activeNote.color, projectId: activeNote.projectId ?? null, tags: activeNote.tags } : null;
    if (!source) return;
    try {
      const saved = await createNoteTemplate({ name: normalize(tmplName), title: source.title, content: source.content, color: source.color, projectId: source.projectId, tags: source.tags });
      setNoteTemplates(prev => [...prev, saved]); setSaveTmplOpen(false); setTmplName('');
    } catch { setTmplError('Failed to save template'); }
  }, [activeNote, tmplName, showCreateModal, createTitle, createContent, createColor, createProjectId]);

  const handleLoadNoteTemplate = (tmpl: NoteTemplate) => {
    setCreateTitle(tmpl.title); setCreateContent(tmpl.content); setCreateColor(tmpl.color);
    setCreateProjectId(tmpl.projectId ? String(tmpl.projectId) : ''); setCreateSelectedTagIds(tmpl.tags.map(t => t.id));
    setShowCreateModal(true); setLoadTmplOpen(false);
  };

  const handleEditNoteTemplate = useCallback((tmpl: NoteTemplate) => {
    setNoteTemplateEditOverrides(null); setNoteTemplateEditName(tmpl.name);
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
      setNoteTemplateEditName(''); setNoteTemplateEditOverrides(null); setEditingNoteTemplateMeta(null); setOpenNoteId(null);
    } catch { setTmplError('Failed to save template'); }
  }, [editingNoteTemplateMeta, noteTemplateEditOverrides, noteTemplateEditName]);

  const handleDeleteNoteTemplate = async (id: number) => {
    try { await deleteNoteTemplateApi(id); setNoteTemplates(prev => prev.filter(t => t.id !== id)); } catch {}
  };

  const filteredNotes = useMemo(() => {
    const term = search.toLowerCase().trim();
    return notes.filter(n => {
      const matchesSearch = !term || n.title.toLowerCase().includes(term) || n.content.toLowerCase().includes(term);
      const matchesTags = selectedTagIds.length === 0 || selectedTagIds.every(id => n.tags.some(t => t.id === id));
      const matchesPin = pinFilter === 'all' || (pinFilter === 'pinned' ? n.pinned : !n.pinned);
      const matchesProject = projectFilterId === 'all' || n.projectId === projectFilterId;
      const matchesStatus = statusFilter === 'all' || n.status === statusFilter;
      return matchesSearch && matchesTags && matchesPin && matchesProject && matchesStatus;
    });
  }, [notes, search, selectedTagIds, pinFilter, projectFilterId, statusFilter]);

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

  const filteredByStatus = useMemo(() => {
    const active = filteredNotes.filter(n => !isNoteCompleted(n));
    const completed = filteredNotes.filter(n => isNoteCompleted(n));
    const sorter = (a: Note, b: Note) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sortMode === 'alphabetical') return a.title.localeCompare(b.title);
      const aVal = sortMode === 'created' ? a.createdAt : a.updatedAt;
      const bVal = sortMode === 'created' ? b.createdAt : b.updatedAt;
      return new Date(bVal).getTime() - new Date(aVal).getTime();
    };
    return { active: [...active].sort(sorter), completed: [...completed].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()) };
  }, [filteredNotes, sortMode]);

  const myNotesGroup = useMemo(() => {
    const notesList = filteredNotes.filter(n => !n.projectId && !isNoteCompleted(n));
    const sorter = (a: Note, b: Note) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sortMode === 'alphabetical') return a.title.localeCompare(b.title);
      const aVal = sortMode === 'created' ? a.createdAt : a.updatedAt;
      const bVal = sortMode === 'created' ? b.createdAt : b.updatedAt;
      return new Date(bVal).getTime() - new Date(aVal).getTime();
    };
    if (orderedNoteIds.length > 0) {
      const idSet = new Set(notesList.map(n => n.id));
      const ordered = orderedNoteIds.filter(id => idSet.has(id));
      const unordered = notesList.filter(n => !orderedNoteIds.includes(n.id));
      const orderedNotes = ordered.map(id => notesList.find(n => n.id === id)!).filter(Boolean);
      const all = [...orderedNotes, ...unordered];
      const pinned = all.filter(n => n.pinned);
      const unpinned = all.filter(n => !n.pinned);
      return [...pinned.sort(sorter), ...unpinned.sort(sorter)];
    }
    return [...notesList].sort(sorter);
  }, [filteredNotes, sortMode, orderedNoteIds]);

  const projectNoteGroups = useMemo(() => {
    return projects.map(project => {
      const noteItems = filteredNotes.filter(n => n.projectId === project.id && !isNoteCompleted(n)).sort((a, b) => {
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

  const handleBulkDelete = () => { if (selectedDeleteIds.length === 0) return; setDeleteConfirmOpen(true); };

  const confirmBulkDelete = async () => {
    for (const id of selectedDeleteIds) await deleteNote(id);
    setSelectedDeleteIds([]); setIsDeleteMode(false); setDeleteConfirmOpen(false);
  };

  const confirmSingleDelete = async () => {
    if (singleDeleteId !== null) await deleteNote(singleDeleteId); setSingleDeleteId(null);
  };

  const getNoteIdForDroppable = (id: string): number | 'my-notes' | null => {
    if (id === 'my-notes') return 'my-notes';
    if (id.startsWith('project-')) return Number(id.slice(8));
    return null;
  };

  const getNotesForDroppable = (id: string): Note[] | null => {
    if (id === 'my-notes') return myNotesGroup;
    if (id.startsWith('project-')) { const pg = projectNoteGroups.find(p => p.project.id === Number(id.slice(8))); return pg?.notes ?? null; }
    return null;
  };

  const applyDragMoveDirect = (srcDroppableId: string, dstDroppableId: string, srcIndex: number, dstIndex: number, dstProject: number | 'my-notes' | null) => {
    const srcNotes = getNotesForDroppable(srcDroppableId);
    const dstNotes = getNotesForDroppable(dstDroppableId);
    if (!srcNotes || !dstNotes) return;
    if (srcNotes.length <= srcIndex || dstNotes.length < dstIndex) return;
    const movingNoteId = srcNotes[srcIndex]?.id;
    if (!movingNoteId) return;
    if (dstProject === 'my-notes') { applyNoteUpdate(movingNoteId, { projectId: null }); }
    else if (typeof dstProject === 'number') { applyNoteUpdate(movingNoteId, { projectId: dstProject }); }
    const srcIds = srcNotes.map(n => n.id);
    const dstIds = dstNotes.map(n => n.id);
    const [removed] = srcIds.splice(srcIndex, 1);
    dstIds.splice(dstIndex, 0, removed);
    const base = orderedNoteIds.length > 0 ? [...orderedNoteIds] : filteredNotes.map(n => n.id);
    const srcSet = new Set(srcNotes.map(n => n.id));
    const dstSet = new Set(dstNotes.map(n => n.id));
    const resultIds: number[] = []; let srcInserted = false; let dstInserted = false;
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
    const srcId = result.source.droppableId; const dstId = result.destination.droppableId;
    const isCrossProject = srcProject !== dstProject;
    if (isCrossProject) {
      const srcNotes = getNotesForDroppable(srcId);
      if (!srcNotes) return;
      const movingNoteId = srcNotes[result.source.index]?.id;
      if (!movingNoteId) return;
      setPendingDragMove({ noteId: movingNoteId, srcDroppableId: srcId, dstDroppableId: dstId, srcIndex: result.source.index, dstIndex: result.destination.index, dstProject });
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
    const resultIds: number[] = []; let inserted = false;
    for (const id of base) {
      if (sectionIdSet.has(id)) {
        if (!inserted) { resultIds.push(...ids); inserted = true; }
      } else { resultIds.push(id); }
    }
    setOrderedNoteIds(resultIds);
  };

  const toggleExpand = (noteId: number) => {
    const note = notes.find(n => n.id === noteId);
    setExpandedNoteIds(prev => prev.includes(noteId) ? prev.filter(id => id !== noteId) : [...prev, noteId]);
    if (note) { setEditingContentText(note.content || ''); setExpandedContentMap(prev => ({ ...prev, [noteId]: note.content || '' })); }
  };

  const toggleSortByDate = () => {
    if (!isSortByDate) {
      setIsSortByDate(true);
      setSortDateDesc(false);
    } else if (!sortDateDesc) {
      setSortDateDesc(true);
    } else {
      setIsSortByDate(false);
      setSortDateDesc(false);
    }
  };

  const generateAINote = async () => {
    if (!aiBuilderInput.trim()) return;
    setAiBuilderLoading(true);
    setAiBuilderError('');
    try {
      const res = await fetch('/api/ai/note-builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          input: aiBuilderInput,
          tags: tags.map(t => t.name),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to generate note');
      }
      const data = await res.json();
      setCreateTitle(data.title || '');
      setCreateContent(data.content || '');
      setCreateColor(randomFrom(NOTE_COLORS));
      if (data.tags && data.tags.length > 0) {
        const matched = data.tags.map((tagName: string) =>
          tags.find(t => t.name.toLowerCase() === tagName.toLowerCase())
        ).filter(Boolean) as NoteTag[];
        setCreateSelectedTagIds(matched.map(t => t.id));
      }
      setAiBuilderOpen(false);
      setAiBuilderInput('');
      setShowCreateModal(true);
    } catch (err: any) {
      setAiBuilderError(err.message || 'Something went wrong');
    } finally {
      setAiBuilderLoading(false);
    }
  };

  const renderNoteRow = (note: Note, dragHandleProps?: any, isDragging?: boolean) => {
    const isExpanded = expandedNoteIds.includes(note.id);
    const noteTags = note.tags.slice(0, 3);
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
        className={`group border rounded-xl bg-card transition-all duration-200 cursor-pointer ${
          isDeleteMode
            ? selectedDeleteIds.includes(note.id)
              ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
              : 'border-border hover:bg-muted/20'
            : isDragging
              ? 'border-primary/40 shadow-lg rotate-[2deg]'
              : 'border-border hover:border-border/80 hover:shadow-sm'
        }`}
        style={!isDeleteMode ? { borderLeftColor: note.color, borderLeftWidth: '3px' } : undefined}
      >
        <div className="flex items-center gap-1 px-3 py-3">
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
              <span className="text-sm font-medium text-left text-foreground truncate">{note.title || 'Untitled note'}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
              {note.content && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0 max-w-[200px] truncate">
                  {note.content.split('\n')[0].trim()}
                </span>
              )}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                {new Date(note.updatedAt || note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              {noteTags.map(tag => (
                <button
                  key={tag.id}
                  onClick={e => { e.stopPropagation(); setTagPopupNoteId(tagPopupNoteId === note.id ? null : note.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0 text-white"
                  style={{ backgroundColor: tag.color }}
                >
                  {tag.name}
                </button>
              ))}
              {note.tags.length > noteTags.length && (
                <button
                  onClick={e => { e.stopPropagation(); setTagPopupNoteId(tagPopupNoteId === note.id ? null : note.id); }}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0"
                >
                  +{note.tags.length - noteTags.length}
                </button>
              )}
              <button
                onClick={e => { e.stopPropagation(); setTagPopupNoteId(tagPopupNoteId === note.id ? null : note.id); }}
                className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 bg-muted text-muted-foreground flex items-center gap-1"
              >
                <Tag className="w-2.5 h-2.5" />
                Tags
              </button>
            </div>
          </div>
          {!isDeleteMode && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={e => { e.stopPropagation(); toggleExpand(note.id); }}
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          )}
        </div>
        {isExpanded && !isDeleteMode && (
          <div onClick={e => e.stopPropagation()} className="border-t border-border px-4 py-3 space-y-4 bg-muted/10 rounded-b-xl">
            <textarea
              value={expandedContentMap[note.id] ?? note.content ?? ''}
              onChange={e => setExpandedContentMap(prev => ({ ...prev, [note.id]: e.target.value }))}
              onBlur={() => { if (expandedContentMap[note.id] !== undefined && expandedContentMap[note.id] !== note.content) { applyNoteUpdate(note.id, { content: expandedContentMap[note.id] }); } }}
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
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">+{note.tags.length - 5}</span>
              )}
              <button onClick={e => { e.stopPropagation(); setTagPopupNoteId(note.id); }} className="text-[10px] px-2 py-0.5 rounded-full border border-dashed border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
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

  const matchingCount = filteredNotes.length;

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
              if (isDeleteMode) {
                setIsDeleteMode(false);
                setSelectedDeleteIds([]);
              } else {
                setIsDeleteMode(true);
                setSelectedDeleteIds([]);
              }
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
                  const t = await fetchNoteTemplates();
                  setMainTemplates(t);
                  setMainTmplPopupOpen(true);
                } catch {}
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-xl font-bold border transition-all bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Star className="w-4 h-4" />
              Templates
            </button>
            {mainTmplPopupOpen && (
              <div className="absolute right-0 mt-1.5 w-80 bg-card border border-border rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Templates</h3>
                  </div>
                  <button onClick={() => setMainTmplPopupOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                    <X className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
                {mainTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center mb-2">
                      <Star className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-foreground">No templates yet</p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-border">
                    {mainTemplates.map(tmpl => (
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
                              setMainTmplPopupOpen(false);
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
                              try {
                                await deleteNoteTemplateApi(tmpl.id);
                                setMainTemplates(await fetchNoteTemplates());
                              } catch {}
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

          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-xl border border-border">
            {(['all' as const, ...STATUS_OPTIONS.map(o => o.value)]).map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
                  statusFilter === status
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {status === 'all' ? 'All' : STATUS_OPTIONS.find(o => o.value === status)?.label || status}
              </button>
            ))}
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
            <button
              onClick={() => { setAnalysisPanelOpen(true); }}
              className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 transition-all"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Note Analysis
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 relative">
        <DragDropContext onDragEnd={handleDragEnd}>
        <div className="max-w-5xl mx-auto space-y-2 pb-24">
          {loading ? (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-muted-foreground mt-3">Loading notes...</p>
            </div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-sm text-destructive">{error}</p>
              <button onClick={fetchNotes} className="mt-2 text-sm text-primary hover:underline">Try again</button>
            </div>
          ) : myNotesGroup.length === 0 && projectNoteGroups.length === 0 && filteredByStatus.completed.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle2 className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No notes found</p>
            </div>
          ) : (
            <>
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

              {projectNoteGroups.map(({ project, notes: projectNotes }, idx) => {
                const isProjectCollapsed = collapsedProjects.includes(project.id);
                return (
                  <div key={project.id} className="mb-3">
                    {idx > 0 && <div className="w-full h-0.5 bg-border/40 my-4" />}
                    <button
                      onClick={() => setCollapsedProjects(prev =>
                        prev.includes(project.id) ? prev.filter(id => id !== project.id) : [...prev, project.id]
                      )}
                      className="flex items-center gap-2 w-full px-2 py-2 text-left hover:bg-muted/30 rounded-lg transition-all mb-1"
                    >
                      {isProjectCollapsed
                        ? <ChevronDown className="w-3.5 h-3.5" style={{ color: project.color }} />
                        : <ChevronUp className="w-3.5 h-3.5" style={{ color: project.color }} />}
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
                      <span className="text-xs font-bold uppercase tracking-wider text-foreground">{project.name}</span>
                      <span className="text-[10px] text-muted-foreground/50 ml-1">({projectNotes.length})</span>
                    </button>
                    {!isProjectCollapsed && (
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

              {filteredByStatus.completed.length > 0 && (
                <div className="mt-6 pt-4 border-t border-border/80">
                  <div className="border border-label-green/20 rounded-xl bg-label-green/5">
                    <button
                      onClick={() => setCompletedOpen(prev => !prev)}
                      className="w-full flex items-center justify-between px-4 py-3"
                    >
                      <span className="text-sm font-semibold text-label-green flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Completed ({filteredByStatus.completed.length})
                      </span>
                      {completedOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </button>
                    {completedOpen && (
                      <div className="border-t border-border/60 px-3 py-2 space-y-1.5">
                        {filteredByStatus.completed.map(note => (
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
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all group ${
                              isDeleteMode
                                ? selectedDeleteIds.includes(note.id)
                                  ? 'border-destructive bg-destructive/5 hover:bg-destructive/10'
                                  : 'border-border bg-background/50 hover:bg-muted/20'
                                : 'border-label-green/15 bg-background/70 hover:bg-muted/40'
                            }`}
                          >
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
                              <CheckCircle2 className="w-4 h-4 text-label-green flex-shrink-0" />
                            )}
                            <span className={`text-sm text-left flex-1 ${isDeleteMode ? 'text-foreground font-medium' : 'text-muted-foreground/80 line-through'}`}>
                              {note.title || 'Untitled note'}
                            </span>
                            <button
                              onClick={e => { e.stopPropagation(); setSingleDeleteId(note.id); }}
                              className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                              title="Delete note"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        </DragDropContext>

        <button
          onClick={() => setAiBuilderOpen(true)}
          className="fixed bottom-8 right-8 z-40 w-14 h-14 rounded-full bg-foreground text-background shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200"
          title="AI Note Builder"
        >
          <Sparkles className="w-5 h-5" />
        </button>
      </div>

      <NoteCreateModal
        open={showCreateModal}
        onClose={() => { setShowCreateModal(false); }}
        onSave={handleCreateNote}
        projects={projects}
        boardColumns={boardColumns}
        tags={tags}
        noteColors={NOTE_COLORS}
        saving={creating}
      />

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
        <DeleteConfirmDialog count={selectedDeleteIds.length} itemName="note" onConfirm={confirmBulkDelete} onCancel={() => setDeleteConfirmOpen(false)} />
      )}
      {singleDeleteId !== null && (
        <DeleteConfirmDialog count={1} itemName="note" onConfirm={confirmSingleDelete} onCancel={() => setSingleDeleteId(null)} />
      )}

      <NoteTagPopup
        open={tagPopupNote !== null}
        noteTags={tagPopupNote?.tags || []}
        allTags={tags}
        newTagName={newTagName}
        newTagColor={newTagColor}
        tagColors={TAG_COLORS}
        onClose={() => setTagPopupNoteId(null)}
        onToggleTag={(tagId) => { if (tagPopupNote) toggleTagOnNote(tagPopupNote.id, tagId); }}
        onAddTag={addTagToNote}
        onDeleteTag={(tagId) => setTagDeleteConfirm(tagId)}
        onNewTagNameChange={setNewTagName}
        onNewTagColorChange={setNewTagColor}
      />

      <NoteDetailModal
        note={activeNote}
        projects={projects}
        tags={tags}
        isTemplateEdit={!!editingNoteTemplateMeta}
        templateEditName={noteTemplateEditName}
        onTemplateEditNameChange={setNoteTemplateEditName}
        onTitleChange={setDraftTitle}
        onContentChange={setDraftContent}
        onProjectChange={(v) => { setDraftProjectId(v === 'none' ? '' : v); saveDrafts(); }}
        onStatusChange={(status) => { setDraftStatus(status); if (activeNote && !editingNoteTemplateMeta) applyNoteUpdate(activeNote.id, { status }); }}
        onChecklistsChange={(checklists) => { setDraftChecklists(checklists); if (activeNote && !editingNoteTemplateMeta) applyNoteUpdate(activeNote.id, { checklists: JSON.stringify(checklists) as any }); }}
        onSubtasksChange={(subtasks) => { setDraftSubtasks(subtasks); if (activeNote && !editingNoteTemplateMeta) applyNoteUpdate(activeNote.id, { subtasks: JSON.stringify(subtasks) as any }); }}
        onPinToggle={() => { if (activeNote) togglePin(activeNote); }}
        onClose={() => { setOpenNoteId(null); setEditingNoteTemplateMeta(null); }}
        onTagPopup={() => { if (activeNote) setTagPopupNoteId(activeNote.id); }}
        onDelete={() => { if (activeNote) setSingleDeleteId(activeNote.id); }}
        onImageUpload={(files) => { if (activeNote && typeof activeNote.id === 'number') uploadImages(activeNote.id, files); }}
        onImageDelete={(imageId) => { if (activeNote && typeof activeNote.id === 'number') deleteNoteImage(activeNote.id, imageId); }}
        onSaveTemplate={handleSaveNoteTemplateEdit}
        onCancelTemplateEdit={() => { setNoteTemplateEditOverrides(null); setNoteTemplateEditName(''); setEditingNoteTemplateMeta(null); setOpenNoteId(null); }}
      />

      <NoteAnalysisPanel
        open={analysisPanelOpen}
        onClose={() => setAnalysisPanelOpen(false)}
        notes={filteredNotes}
        loading={analysisLoading}
      />

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
                  className="w-full bg-muted/40 border border-border rounded-xl px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-border">
              <button onClick={() => { setSaveTmplOpen(false); setTmplName(''); setTmplError(''); setEditingNoteTemplateMeta(null); }} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-all">Cancel</button>
              <button onClick={handleSaveNoteTemplate} disabled={!normalize(tmplName)} className="px-4 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all">Save</button>
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
            {tmplError && (
              <div className="flex items-center gap-2 px-5 py-2 text-xs text-destructive bg-destructive/10">
                <span>⚠</span>
                <span>{tmplError}</span>
              </div>
            )}
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
                          onClick={() => { setLoadTmplOpen(false); handleEditNoteTemplate(tmpl); }}
                          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-all"
                          title="Edit template"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Delete template "${tmpl.name}"?`)) return;
                            try {
                              await deleteNoteTemplateApi(tmpl.id);
                              setNoteTemplates(await fetchNoteTemplates());
                            } catch {}
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

      {aiBuilderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setAiBuilderOpen(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">AI Note Builder</h2>
                  <p className="text-xs text-muted-foreground">Describe your note and AI will structure it for you</p>
                </div>
              </div>
              <button onClick={() => setAiBuilderOpen(false)} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <textarea
                autoFocus
                value={aiBuilderInput}
                onChange={e => setAiBuilderInput(e.target.value)}
                placeholder="Describe your note, idea, or thought in detail...&#10;&#10;e.g. 'I need to write a meeting notes template that covers agenda items, action items, and follow-up tasks for our weekly standup.'"
                rows={7}
                className="w-full bg-muted/40 border border-border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {aiBuilderError && (
                <p className="text-xs text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{aiBuilderError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setAiBuilderOpen(false)}
                  className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={generateAINote}
                  disabled={!aiBuilderInput.trim() || aiBuilderLoading}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-bold bg-primary text-primary-foreground rounded-lg disabled:opacity-50 hover:bg-primary/90 transition-all"
                >
                  {aiBuilderLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate
                    </>
                  )}
                </button>
              </div>
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
                Are you sure you want to move this note? It will change the note's project.
              </p>
              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input type="checkbox" checked={dontAsk} onChange={e => setDontAsk(e.target.checked)} className="rounded border-border" />
                <span className="text-xs text-muted-foreground">Don't ask me again</span>
              </label>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setPendingDragMove(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
                <button onClick={confirmMove} className="px-4 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-xl hover:opacity-90">Move</button>
              </div>
            </div>
          </div>
        );
      })()}

      {tagDeleteConfirm !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setTagDeleteConfirm(null)}>
          <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-foreground">Delete tag everywhere?</h3>
            <p className="text-xs text-muted-foreground mt-2">This will remove this tag from the whole app. This action cannot be undone.</p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setTagDeleteConfirm(null)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancel</button>
              <button onClick={() => { deleteTagEverywhere(tagDeleteConfirm); setTagDeleteConfirm(null); setTagPopupNoteId(null); }} className="px-4 py-2 text-sm font-semibold bg-destructive text-destructive-foreground rounded-xl hover:opacity-90">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Notes;
