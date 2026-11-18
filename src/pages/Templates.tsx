import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  LayoutTemplate,
  CheckSquare,
  StickyNote,
  Sparkles,
  Globe,
  User as UserIcon,
  Clock,
  Flag,
  ListChecks,
  CheckCircle2,
  Plus,
  Copy,
  SlidersHorizontal,
  ArrowRight,
  X,
  Tag as TagIcon,
  BookmarkPlus,
  Loader2,
  KeyRound,
  Lock,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useBoardContext } from '@/context/BoardContext';
import { useNotesContext } from '@/context/NotesContext';
import { PRIORITY_CONFIG, Task, TaskTemplate } from '@/types/board';
import {
  createTemplate,
  fetchPublicTemplates,
  fetchTemplateByCode,
  fetchTemplates,
} from '@/services/taskTemplateService';
import {
  createNoteTemplate,
  fetchNoteTemplateByCode,
  fetchNoteTemplates,
  fetchPublicNoteTemplates,
} from '@/services/noteTemplateService';
import {
  DEFAULT_GALLERY_TEMPLATES,
  DEFAULT_TEMPLATE_TAGS,
} from '../../shared/defaultTemplates';
import CopyShareCode from '@/components/CopyShareCode';
import { toast } from '@/hooks/use-toast';

type GalleryKind = 'task' | 'note';
type GallerySource = 'default' | 'community' | 'mine';

interface GalleryTemplateItem {
  uid: string;
  kind: GalleryKind;
  source: GallerySource;
  authorName: string;
  name: string;
  title: string;
  description: string;
  priority: TaskTemplate['priority'];
  duration: number;
  templateTags: string[];
  subtasks: Array<{ text: string; durationMinutes?: number }>;
  checklists: Array<{ id?: string; title?: string; items?: Array<{ id?: string; text: string }> }>;
  labels: any[];
  images?: any[];
  isPublic?: boolean;
  shareCode?: string | null;
  raw: TaskTemplate | null;
}

export const TemplatesBrowser: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const boardCtx = useBoardContext();
  const notesCtx = useNotesContext();

  const initialTypeParam = searchParams.get('type');
  const initialApplyToId = searchParams.get('applyTo') || '';
  const initialTagParam = searchParams.get('tag') || '';

  const [loading, setLoading] = useState(true);
  const [myTaskTemplates, setMyTaskTemplates] = useState<TaskTemplate[]>([]);
  const [myNoteTemplates, setMyNoteTemplates] = useState<TaskTemplate[]>([]);
  const [publicTaskTemplates, setPublicTaskTemplates] = useState<TaskTemplate[]>([]);
  const [publicNoteTemplates, setPublicNoteTemplates] = useState<TaskTemplate[]>([]);

  // Filters on left rail
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | GalleryKind>(
    initialTypeParam === 'task' || initialTypeParam === 'note' ? initialTypeParam : 'all',
  );
  const [sourceFilter, setSourceFilter] = useState<'all' | GallerySource>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'urgent' | 'high' | 'medium' | 'low'>('all');
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialTagParam && DEFAULT_TEMPLATE_TAGS.includes(initialTagParam as any) ? [initialTagParam] : [],
  );

  // Selected template preview
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  // Share code quick import
  const [redeemCode, setRedeemCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  // Apply to existing task/note picker state
  const [existingPickerOpen, setExistingPickerOpen] = useState(false);
  const [existingTargetId, setExistingTargetId] = useState(initialApplyToId);
  const [existingSearch, setExistingSearch] = useState('');
  const [savingCopy, setSavingCopy] = useState(false);

  const loadAllTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const [myTasks, myNotes, pubTasks, pubNotes] = await Promise.all([
        fetchTemplates().catch(() => [] as TaskTemplate[]),
        fetchNoteTemplates().catch(() => [] as TaskTemplate[]),
        fetchPublicTemplates().catch(() => [] as TaskTemplate[]),
        fetchPublicNoteTemplates().catch(() => [] as TaskTemplate[]),
      ]);
      setMyTaskTemplates(myTasks);
      setMyNoteTemplates(myNotes);
      setPublicTaskTemplates(pubTasks);
      setPublicNoteTemplates(pubNotes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllTemplates();
  }, [loadAllTemplates]);

  useEffect(() => {
    if (initialTypeParam === 'task' || initialTypeParam === 'note') {
      setTypeFilter(initialTypeParam);
    }
    if (initialApplyToId) {
      setExistingTargetId(initialApplyToId);
    }
  }, [initialTypeParam, initialApplyToId]);

  // Build unified deduplicated gallery catalog
  const allTemplates = useMemo<GalleryTemplateItem[]>(() => {
    const items: GalleryTemplateItem[] = [];
    const seenTaskIds = new Set<number>();
    const seenNoteIds = new Set<number>();

    // 1. Built-in defaults
    DEFAULT_GALLERY_TEMPLATES.forEach(def => {
      items.push({
        uid: def.id,
        kind: def.kind,
        source: 'default',
        authorName: def.authorName,
        name: def.name,
        title: def.title,
        description: def.description,
        priority: def.priority,
        duration: def.duration,
        templateTags: [...def.templateTags],
        subtasks: def.subtasks,
        checklists: def.checklists,
        labels: def.labels || [],
        images: [],
        isPublic: true,
        shareCode: null,
        raw: null,
      });
    });

    // 2. Public community templates (strictly exclude private templates; user's own public show as mine)
    publicTaskTemplates.forEach(t => {
      if (t.isPublic === false) return;
      seenTaskIds.add(t.id);
      const isMine = t.userId === user?.id;
      items.push({
        uid: `pub-task-${t.id}`,
        kind: 'task',
        source: isMine ? 'mine' : 'community',
        authorName: isMine ? `${user?.name || 'You'} (Public)` : t.authorName || 'Community User',
        name: t.name,
        title: t.title || t.name,
        description: t.description || '',
        priority: t.priority || 'medium',
        duration: Number(t.duration) || 0,
        templateTags: t.templateTags || [],
        subtasks: t.subtasks || [],
        checklists: t.checklists || [],
        labels: t.labels || [],
        images: t.images || [],
        isPublic: true,
        shareCode: t.shareCode,
        raw: t,
      });
    });

    publicNoteTemplates.forEach(t => {
      if (t.isPublic === false) return;
      seenNoteIds.add(t.id);
      const isMine = t.userId === user?.id;
      items.push({
        uid: `pub-note-${t.id}`,
        kind: 'note',
        source: isMine ? 'mine' : 'community',
        authorName: isMine ? `${user?.name || 'You'} (Public)` : t.authorName || 'Community User',
        name: t.name,
        title: t.title || t.name,
        description: (t as any).description || (t as any).content || '',
        priority: t.priority || 'medium',
        duration: Number(t.duration) || 0,
        templateTags: t.templateTags || [],
        subtasks: t.subtasks || [],
        checklists: t.checklists || [],
        labels: t.labels || [],
        images: t.images || [],
        isPublic: true,
        shareCode: t.shareCode,
        raw: t,
      });
    });

    // 3. Remaining private user templates
    myTaskTemplates.forEach(t => {
      if (seenTaskIds.has(t.id)) return;
      items.push({
        uid: `my-task-${t.id}`,
        kind: 'task',
        source: 'mine',
        authorName: user?.name || 'You',
        name: t.name,
        title: t.title || t.name,
        description: t.description || '',
        priority: t.priority || 'medium',
        duration: Number(t.duration) || 0,
        templateTags: t.templateTags || [],
        subtasks: t.subtasks || [],
        checklists: t.checklists || [],
        labels: t.labels || [],
        images: t.images || [],
        isPublic: Boolean(t.isPublic),
        shareCode: t.shareCode,
        raw: t,
      });
    });

    myNoteTemplates.forEach(t => {
      if (seenNoteIds.has(t.id)) return;
      items.push({
        uid: `my-note-${t.id}`,
        kind: 'note',
        source: 'mine',
        authorName: user?.name || 'You',
        name: t.name,
        title: t.title || t.name,
        description: (t as any).description || (t as any).content || '',
        priority: t.priority || 'medium',
        duration: Number(t.duration) || 0,
        templateTags: t.templateTags || [],
        subtasks: t.subtasks || [],
        checklists: t.checklists || [],
        labels: t.labels || [],
        images: t.images || [],
        isPublic: Boolean(t.isPublic),
        shareCode: t.shareCode,
        raw: t,
      });
    });

    return items;
  }, [myTaskTemplates, myNoteTemplates, publicTaskTemplates, publicNoteTemplates, user?.id, user?.name]);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allTemplates.filter(item => {
      if (item.source !== 'mine' && item.isPublic === false) return false;
      // Private templates only belong in "My Templates" — keep them hidden from general browse tabs
      if (sourceFilter !== 'mine' && item.isPublic === false) return false;
      if (typeFilter !== 'all' && item.kind !== typeFilter) return false;
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false;
      if (selectedTags.length > 0) {
        const hasAll = selectedTags.every(tag => item.templateTags.includes(tag));
        if (!hasAll) return false;
      }
      if (q) {
        const hay = [
          item.name,
          item.title,
          item.description,
          item.authorName,
          item.shareCode || '',
          ...item.templateTags,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allTemplates, typeFilter, sourceFilter, priorityFilter, selectedTags, searchQuery]);

  // Keep a valid selected template for the live Preview pane
  useEffect(() => {
    if (filteredTemplates.length === 0) {
      setSelectedUid(null);
      return;
    }
    if (!selectedUid || !filteredTemplates.some(t => t.uid === selectedUid)) {
      setSelectedUid(filteredTemplates[0].uid);
    }
  }, [filteredTemplates, selectedUid]);

  const selectedTemplate = useMemo(
    () => filteredTemplates.find(t => t.uid === selectedUid) || null,
    [filteredTemplates, selectedUid],
  );

  // Build fresh subtasks & checklists when applying a template
  const buildClonedSubtasks = (item: GalleryTemplateItem) =>
    (item.subtasks || []).map(st => ({
      id: crypto.randomUUID(),
      text: st.text,
      completed: false,
      durationMinutes: st.durationMinutes || 0,
    }));

  const buildClonedChecklists = (item: GalleryTemplateItem) =>
    (item.checklists || []).map((cl, idx) => ({
      id: crypto.randomUUID(),
      title: cl.title || `Checklist ${idx + 1}`,
      items: (cl.items || []).map(it => ({
        id: crypto.randomUUID(),
        text: typeof it === 'string' ? it : it.text,
        completed: false,
      })),
    }));

  // Apply Button 1: Create brand new Task or Note from template
  const handleApplyAsNew = (item: GalleryTemplateItem) => {
    const newId = crypto.randomUUID();
    const isNote = item.kind === 'note';
    const ctx = isNote ? notesCtx : boardCtx;
    const defaultCol =
      ctx.board.columns.find(c => !c.projectId)?.id || ctx.board.columns[0]?.id || 'todo';

    ctx.addTask(defaultCol, item.title || item.name, {
      id: newId,
      description: item.description || '',
      priority: item.priority || 'medium',
      duration: item.duration || 0,
      subtasks: buildClonedSubtasks(item),
      checklists: buildClonedChecklists(item),
      images: item.images || [],
    });

    toast({
      title: isNote ? 'Note created from template' : 'Task created from template',
      description: `"${item.title || item.name}" added to your ${isNote ? 'Notes' : 'Tasks'} board.`,
    });
    navigate(isNote ? `/notes?open=${newId}` : `/tasks?open=${newId}`);
  };

  // Existing items matching selected template's type (Task or Note)
  const candidateExistingItems = useMemo<Task[]>(() => {
    if (!selectedTemplate) return [];
    const list =
      selectedTemplate.kind === 'note' ? notesCtx.board.tasks : boardCtx.board.tasks;
    const q = existingSearch.trim().toLowerCase();
    return list
      .filter(t => !t.archived)
      .filter(t => !q || t.title.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
  }, [selectedTemplate, boardCtx.board.tasks, notesCtx.board.tasks, existingSearch]);

  // Apply Button 2: Apply template fields onto an existing Task or Note
  const handleApplyToExisting = (item: GalleryTemplateItem, targetId: string) => {
    const isNote = item.kind === 'note';
    const ctx = isNote ? notesCtx : boardCtx;
    const existing = ctx.board.tasks.find(t => t.id === targetId);
    if (!existing) {
      toast({
        title: 'Item not found',
        description: `Select an existing ${isNote ? 'note' : 'task'} to apply this template to.`,
        variant: 'destructive',
      });
      return;
    }

    const existingLabels = existing.labels || [];
    const incomingLabels = Array.isArray(item.labels) ? item.labels : [];
    const mergedLabels = [...existingLabels];
    incomingLabels.forEach((lbl: any) => {
      if (lbl?.name && !mergedLabels.some(l => l.name.toLowerCase() === String(lbl.name).toLowerCase())) {
        mergedLabels.push({ ...lbl, id: lbl.id || `lbl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
      }
    });

    ctx.updateTask(targetId, {
      description: item.description
        ? existing.description
          ? `${existing.description}\n\n${item.description}`
          : item.description
        : existing.description,
      priority: existing.priority === 'none' ? item.priority : existing.priority,
      duration: existing.duration || item.duration || 0,
      labels: mergedLabels,
      subtasks: [...(existing.subtasks || []), ...buildClonedSubtasks(item)],
      checklists: [...(existing.checklists || []), ...buildClonedChecklists(item)],
    });

    setExistingPickerOpen(false);
    toast({
      title: `Applied to "${existing.title}"`,
      description: `Added template content and lists to your ${isNote ? 'note' : 'task'}.`,
    });
    navigate(isNote ? `/notes?open=${targetId}` : `/tasks?open=${targetId}`);
  };

  const handleSaveCopyToMine = async (item: GalleryTemplateItem) => {
    setSavingCopy(true);
    try {
      const payload = {
        name: `${item.name} (Copy)`,
        title: item.title || item.name,
        description: item.description || '',
        priority: item.priority || 'medium',
        duration: item.duration || 0,
        labels: [],
        subtasks: (item.subtasks || []).map(st => ({
          text: st.text,
          durationMinutes: st.durationMinutes || 0,
        })),
        checklists: buildClonedChecklists(item),
        templateTags: item.templateTags,
        isPublic: false,
      };
      if (item.kind === 'note') {
        await createNoteTemplate(payload);
      } else {
        await createTemplate(payload);
      }
      await loadAllTemplates();
      toast({
        title: 'Saved to My Templates',
        description: `"${item.name}" is now in your personal templates.`,
      });
    } catch (err: any) {
      toast({
        title: 'Could not save template copy',
        description: err?.message || 'Please check your template limit or try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingCopy(false);
    }
  };

  const handleRedeemShareCode = async () => {
    const code = redeemCode.trim().toUpperCase();
    if (!code || redeeming) return;
    setRedeeming(true);
    try {
      let fetched: TaskTemplate | null = null;
      let kind: GalleryKind = 'task';
      if (code.startsWith('NOTE-')) {
        kind = 'note';
        fetched = await fetchNoteTemplateByCode(code);
      } else {
        try {
          fetched = await fetchTemplateByCode(code);
          kind = 'task';
        } catch {
          fetched = await fetchNoteTemplateByCode(code);
          kind = 'note';
        }
      }
      if (fetched) {
        const uid = `pub-${kind}-${fetched.id}`;
        await loadAllTemplates();
        setTypeFilter('all');
        setSourceFilter('all');
        setSelectedTags([]);
        setPriorityFilter('all');
        setSearchQuery('');
        setSelectedUid(uid);
        setRedeemCode('');
        toast({ title: 'Template found!', description: `Loaded preview for "${fetched.name}".` });
      }
    } catch (err: any) {
      toast({
        title: 'Invalid code',
        description: err?.message || 'No public template matches that share code.',
        variant: 'destructive',
      });
    } finally {
      setRedeeming(false);
    }
  };

  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag],
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setSourceFilter('all');
    setPriorityFilter('all');
    setSelectedTags([]);
    if (searchParams.has('type') || searchParams.has('tag')) {
      setSearchParams({}, { replace: true });
    }
  };

  return (
    <div className={`flex-1 flex flex-col min-h-0 overflow-hidden bg-background ${embedded ? 'rounded-2xl border border-border shadow-sm min-h-[680px]' : ''}`}>
      {/* Header */}
      <header className="px-4 sm:px-6 py-3.5 border-b border-border bg-card flex flex-wrap items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
            <LayoutTemplate className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-foreground">Templates Library</h1>
            <p className="text-xs text-muted-foreground">
              Browse built-in default templates, public community templates, and your own saved templates.
            </p>
          </div>
        </div>

        {/* Share code quick lookup */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <KeyRound className="w-3.5 h-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={redeemCode}
              onChange={e => setRedeemCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void handleRedeemShareCode()}
              placeholder="Share code (TASK-... / NOTE-...)"
              className="pl-8 pr-3 py-2 rounded-xl border border-border bg-muted/40 text-xs font-mono uppercase placeholder:normal-case placeholder:font-sans text-foreground outline-none focus:border-primary w-52 sm:w-60"
            />
          </div>
          <button
            type="button"
            disabled={!redeemCode.trim() || redeeming}
            onClick={() => void handleRedeemShareCode()}
            className="px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 disabled:opacity-50"
          >
            {redeeming ? 'Finding…' : 'Load Code'}
          </button>
        </div>
      </header>

      {/* Main 3-Pane Body: Left Filters + Search | Center Template Cards | Right Preview */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* LEFT RAIL: Search bar + Filters */}
        <aside className="w-full lg:w-72 flex-shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-card/40 overflow-y-auto p-4 space-y-5">
          {/* Search Bar */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Search Templates
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search title, tag, author…"
                className="w-full pl-9 pr-8 py-2 rounded-xl border border-border bg-background text-xs text-foreground outline-none focus:border-primary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Type Filter */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5" /> Type
            </p>
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'task', label: 'Tasks' },
                  { id: 'note', label: 'Notes' },
                ] as const
              ).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTypeFilter(opt.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    typeFilter === opt.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Collection / Source Filter */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Source
            </p>
            <div className="space-y-1">
              {(
                [
                  { id: 'all', label: 'All Templates', icon: LayoutTemplate },
                  { id: 'default', label: 'Default Templates', icon: Sparkles },
                  { id: 'community', label: 'Other Users (Public)', icon: Globe },
                  { id: 'mine', label: 'My Templates', icon: UserIcon },
                ] as const
              ).map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSourceFilter(opt.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                    sourceFilter === opt.id
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-transparent hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <opt.icon className="w-3.5 h-3.5" />
                    {opt.label}
                  </span>
                  <span className="text-[10px] font-bold opacity-75">
                    {opt.id === 'all'
                      ? allTemplates.length
                      : allTemplates.filter(t => t.source === opt.id).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Default Category Tags Filter */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TagIcon className="w-3.5 h-3.5" /> Tags
              </p>
              {selectedTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTags([])}
                  className="text-[10px] font-semibold text-primary hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_TEMPLATE_TAGS.map(tag => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTagFilter(tag)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority Filter */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Priority
            </p>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-border bg-card text-xs font-semibold text-foreground outline-none cursor-pointer"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          {(searchQuery || typeFilter !== 'all' || sourceFilter !== 'all' || priorityFilter !== 'all' || selectedTags.length > 0) && (
            <button
              type="button"
              onClick={clearFilters}
              className="w-full py-2 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              Reset all filters
            </button>
          )}
        </aside>

        {/* CENTER: Templates Grid */}
        <main className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-muted-foreground">
              Showing <strong className="text-foreground">{filteredTemplates.length}</strong>{' '}
              template{filteredTemplates.length === 1 ? '' : 's'}
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              Loading templates…
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="p-10 text-center rounded-2xl border border-dashed border-border bg-card/50 space-y-2">
              <LayoutTemplate className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-bold text-foreground">No templates match these filters</p>
              <p className="text-xs text-muted-foreground">
                Try clearing a tag or switching source filters.
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-2 px-4 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold"
              >
                Show all templates
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {filteredTemplates.map(item => {
                const isSelected = selectedTemplate?.uid === item.uid;
                const priorityMeta =
                  item.priority && item.priority !== 'none'
                    ? PRIORITY_CONFIG[item.priority as Exclude<typeof item.priority, 'none'>]
                    : null;
                return (
                  <button
                    key={item.uid}
                    type="button"
                    onClick={() => {
                      setSelectedUid(item.uid);
                      setExistingPickerOpen(false);
                    }}
                    className={`text-left p-4 rounded-2xl border transition-all flex flex-col gap-2.5 ${
                      isSelected
                        ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                        : 'border-border bg-card hover:border-primary/40 hover:shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            item.kind === 'note'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          }`}
                        >
                          {item.kind === 'note' ? (
                            <StickyNote className="w-3 h-3" />
                          ) : (
                            <CheckSquare className="w-3 h-3" />
                          )}
                          {item.kind}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                            item.source === 'default'
                              ? 'border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400'
                              : item.source === 'community'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'border-border bg-muted text-muted-foreground'
                          }`}
                        >
                          {item.source === 'default' ? 'Default' : item.authorName}
                        </span>
                        {item.source === 'mine' && (
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                            item.isPublic
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}>
                            {item.isPublic ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                            {item.isPublic ? 'Public' : 'Private'}
                          </span>
                        )}
                      </div>
                      {priorityMeta && (
                        <span
                          className={`${priorityMeta.className} text-[10px] font-bold px-2 py-0.5 rounded-full text-primary-foreground flex-shrink-0`}
                        >
                          {priorityMeta.label}
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-foreground line-clamp-1">{item.name}</h3>
                      {item.title && item.title !== item.name && (
                        <p className="text-xs font-medium text-muted-foreground line-clamp-1 mt-0.5">
                          {item.title}
                        </p>
                      )}
                      {item.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {item.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 mt-auto">
                      <div className="flex flex-wrap gap-1">
                        {item.templateTags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded-md bg-muted text-[10px] font-semibold text-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                        {item.templateTags.length > 3 && (
                          <span className="text-[10px] text-muted-foreground">
                            +{item.templateTags.length - 3}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground flex items-center gap-2">
                        {item.subtasks.length > 0 && <span>{item.subtasks.length} sub</span>}
                        {item.checklists.length > 0 && <span>{item.checklists.length} list</span>}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </main>

        {/* RIGHT PREVIEW PANE */}
        <aside className="w-full lg:w-[430px] xl:w-[460px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-border bg-card overflow-y-auto p-5">
          {!selectedTemplate ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-16 space-y-2">
              <LayoutTemplate className="w-10 h-10 text-muted-foreground/60" />
              <p className="text-sm font-bold text-foreground">Select a template to preview</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Click any template from the list to preview its structure, checklists, subtasks, and apply options.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Preview Top Badges & Save Copy */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        selectedTemplate.kind === 'note'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {selectedTemplate.kind === 'note' ? 'Note Template' : 'Task Template'}
                    </span>
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      by {selectedTemplate.authorName}
                    </span>
                    {selectedTemplate.source === 'mine' && selectedTemplate.isPublic === false && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <Lock className="w-2.5 h-2.5" /> Private (only in My Templates)
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-black text-foreground">{selectedTemplate.name}</h2>
                </div>

                {selectedTemplate.source !== 'mine' && (
                  <button
                    type="button"
                    disabled={savingCopy}
                    onClick={() => void handleSaveCopyToMine(selectedTemplate)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-border text-xs font-semibold hover:bg-muted flex-shrink-0 disabled:opacity-50"
                    title="Save a personal copy you can edit"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5 text-primary" />
                    Save Copy
                  </button>
                )}
              </div>

              {/* Share code if public */}
              {selectedTemplate.shareCode && (
                <div className="p-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">Share code</span>
                  <CopyShareCode code={selectedTemplate.shareCode} size="sm" />
                </div>
              )}

              {/* TWO PRIMARY APPLY BUTTONS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3.5 rounded-2xl border border-primary/25 bg-primary/5">
                <button
                  type="button"
                  onClick={() => handleApplyAsNew(selectedTemplate)}
                  className="py-2.5 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-all flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  Create New {selectedTemplate.kind === 'note' ? 'Note' : 'Task'}
                </button>
                <button
                  type="button"
                  onClick={() => setExistingPickerOpen(prev => !prev)}
                  className="py-2.5 px-3 rounded-xl border border-border bg-card text-foreground text-xs font-bold hover:bg-muted transition-all flex items-center justify-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Apply to Existing {selectedTemplate.kind === 'note' ? 'Note' : 'Task'}
                </button>
              </div>

              {/* Inline picker when Apply to Existing clicked */}
              {existingPickerOpen && (
                <div className="p-3.5 rounded-2xl border border-border bg-muted/30 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-foreground">
                      Choose existing {selectedTemplate.kind}
                    </p>
                    <button
                      type="button"
                      onClick={() => setExistingPickerOpen(false)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    value={existingSearch}
                    onChange={e => setExistingSearch(e.target.value)}
                    placeholder={`Filter your ${selectedTemplate.kind}s…`}
                    className="w-full px-3 py-1.5 rounded-xl border border-border bg-background text-xs outline-none"
                  />
                  {existingTargetId &&
                    candidateExistingItems.some(t => t.id === existingTargetId) && (
                      <button
                        type="button"
                        onClick={() => handleApplyToExisting(selectedTemplate, existingTargetId)}
                        className="w-full py-2 px-3 rounded-xl bg-primary/15 border border-primary/30 text-primary text-xs font-bold flex items-center justify-between"
                      >
                        <span>
                          Apply to opened:{' '}
                          {candidateExistingItems.find(t => t.id === existingTargetId)?.title}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {candidateExistingItems.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic py-3 text-center">
                        No existing {selectedTemplate.kind}s found yet. Use “Create New” above!
                      </p>
                    ) : (
                      candidateExistingItems.map(target => (
                        <button
                          key={target.id}
                          type="button"
                          onClick={() => handleApplyToExisting(selectedTemplate, target.id)}
                          className="w-full text-left px-3 py-2 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="font-semibold text-foreground truncate">
                            {target.title}
                          </span>
                          <span className="text-[10px] font-bold text-primary flex-shrink-0">
                            Apply
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* LIVE CARD PREVIEW */}
              <div className="rounded-2xl border border-border bg-muted/20 p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Template Preview
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedTemplate.duration > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                        <Clock className="w-3 h-3" /> {selectedTemplate.duration}m
                      </span>
                    )}
                    {selectedTemplate.priority && selectedTemplate.priority !== 'none' && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-primary-foreground ${
                          PRIORITY_CONFIG[
                            selectedTemplate.priority as Exclude<typeof selectedTemplate.priority, 'none'>
                          ]?.className || 'bg-primary'
                        }`}
                      >
                        <Flag className="w-2.5 h-2.5" />
                        {PRIORITY_CONFIG[
                          selectedTemplate.priority as Exclude<typeof selectedTemplate.priority, 'none'>
                        ]?.label}
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-bold uppercase text-muted-foreground">
                    {selectedTemplate.kind === 'note' ? 'Note Title' : 'Task Title'}
                  </p>
                  <p className="text-base font-bold text-foreground mt-0.5">
                    {selectedTemplate.title || selectedTemplate.name}
                  </p>
                </div>

                {selectedTemplate.templateTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTemplate.templateTags.map(tag => (
                      <span
                        key={tag}
                        className="px-2.5 py-0.5 rounded-full bg-card border border-border text-[11px] font-semibold text-foreground"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div>
                  <p className="text-[11px] font-bold uppercase text-muted-foreground mb-1">
                    {selectedTemplate.kind === 'note' ? 'Content' : 'Description'}
                  </p>
                  <div className="p-3 rounded-xl border border-border bg-card text-xs text-foreground whitespace-pre-wrap leading-relaxed min-h-[70px]">
                    {selectedTemplate.description || (
                      <span className="italic text-muted-foreground">No description provided.</span>
                    )}
                  </div>
                </div>

                {selectedTemplate.subtasks.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                      <ListChecks className="w-3.5 h-3.5" /> Subtasks ({selectedTemplate.subtasks.length})
                    </p>
                    <div className="space-y-1">
                      {selectedTemplate.subtasks.map((st, idx) => (
                        <div
                          key={idx}
                          className="px-3 py-2 rounded-xl border border-border bg-card flex items-center justify-between gap-2 text-xs"
                        >
                          <span className="flex items-center gap-2 text-foreground">
                            <span className="w-3.5 h-3.5 rounded border border-muted-foreground/50 flex-shrink-0" />
                            {st.text}
                          </span>
                          {(st.durationMinutes || 0) > 0 && (
                            <span className="text-[10px] font-semibold text-muted-foreground">
                              {st.durationMinutes}m
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTemplate.checklists.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Checklists
                    </p>
                    {selectedTemplate.checklists.map((cl, ci) => (
                      <div key={ci} className="p-3 rounded-xl border border-border bg-card space-y-1.5">
                        <p className="text-xs font-bold text-foreground">{cl.title || 'Checklist'}</p>
                        <div className="space-y-1">
                          {(cl.items || []).map((it, ii) => (
                            <div key={ii} className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="w-3.5 h-3.5 rounded border border-border flex-shrink-0" />
                              <span>{typeof it === 'string' ? it : it.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

const TemplatesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const nextParams = new URLSearchParams(searchParams);
  nextParams.set('tab', 'templates');
  return <Navigate to={`/settings?${nextParams.toString()}`} replace />;
};

export default TemplatesPage;

