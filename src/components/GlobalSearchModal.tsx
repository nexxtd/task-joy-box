import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  CheckSquare,
  Compass,
  Flag,
  FolderKanban,
  LayoutTemplate,
  Loader2,
  Search,
  Settings,
  StickyNote,
  X,
} from 'lucide-react';
import { useBoardContext } from '@/context/BoardContext';
import { useNotesContext } from '@/context/NotesContext';
import { APP_PAGES } from '@/lib/appPages';
import { DEFAULT_GALLERY_TEMPLATES } from '../../shared/defaultTemplates';
import { fetchTemplates as fetchTaskTemplates, fetchPublicTemplates as fetchPublicTaskTemplates } from '@/services/taskTemplateService';
import { fetchNoteTemplates, fetchPublicNoteTemplates } from '@/services/noteTemplateService';
import { loadShortcuts } from '@/lib/shortcuts';

type SearchCategory = 'all' | 'tasks' | 'notes' | 'projects' | 'milestones' | 'templates' | 'pages';

interface GlobalSearchResult {
  id: string;
  category: Exclude<SearchCategory, 'all'>;
  title: string;
  subtitle: string;
  badge?: string;
  completed?: boolean;
  href: string;
  keywords: string;
}

const SETTINGS_QUICK_LINKS: Array<{ title: string; subtitle: string; href: string; keywords: string }> = [
  { title: 'Settings: Appearance', subtitle: 'Theme, accent colors, fonts & layout', href: '/settings?tab=appearance', keywords: 'theme dark light font language color' },
  { title: 'Settings: Notifications', subtitle: 'Overdue alerts, smart AI alerts & email prefs', href: '/settings?tab=notifications', keywords: 'alerts email bell overdue' },
  { title: 'Settings: Shortcuts', subtitle: 'Customize keyboard shortcuts & split-screen keys', href: '/settings?tab=shortcuts', keywords: 'keybind hotkey keyboard search split' },
  { title: 'Settings: Templates', subtitle: 'Browse default, community & my saved templates', href: '/settings?tab=templates', keywords: 'templates browse gallery sprint brief' },
  { title: 'Settings: Connected Accounts', subtitle: 'ClickUp, Trello, Google Calendar & file import', href: '/settings?tab=account', keywords: 'clickup trello oauth token import sync google' },
];

export const GlobalSearchModal: React.FC = () => {
  const navigate = useNavigate();
  const { board } = useBoardContext();
  const notesCtx = useNotesContext();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<SearchCategory>('all');
  const [activeIndex, setActiveIndex] = useState(0);

  const [projects, setProjects] = useState<Array<{ id: number; name: string; description?: string }>>([]);
  const [milestones, setMilestones] = useState<Array<{ id: number; projectId: number; projectName: string; name: string; date: string; description?: string; completed?: boolean }>>([]);
  const [remoteTemplates, setRemoteTemplates] = useState<Array<{ uid: string; kind: 'task' | 'note'; name: string; title: string; description: string; tags: string[] }>>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const searchShortcutLabel = useMemo(() => {
    try {
      const sc = loadShortcuts().find(s => s.action === 'global-search' && s.enabled !== false);
      return sc?.keys ? sc.keys.split('+').join(' + ') : 'Ctrl + K';
    } catch {
      return 'Ctrl + K';
    }
  }, [open]);

  const loadRemoteIndex = useCallback(async () => {
    setLoadingRemote(true);
    try {
      const [projRes, myTasks, myNotes, pubTasks, pubNotes] = await Promise.all([
        fetch('/api/projects', { credentials: 'include' }).then(r => (r.ok ? r.json() : { projects: [] })).catch(() => ({ projects: [] })),
        fetchTaskTemplates().catch(() => []),
        fetchNoteTemplates().catch(() => []),
        fetchPublicTaskTemplates().catch(() => []),
        fetchPublicNoteTemplates().catch(() => []),
      ]);

      const projList: Array<{ id: number; name: string; description?: string }> = Array.isArray(projRes?.projects) ? projRes.projects : [];
      setProjects(projList);

      const seen = new Set<string>();
      const collectedTemplates: Array<{ uid: string; kind: 'task' | 'note'; name: string; title: string; description: string; tags: string[] }> = [];
      const addT = (kind: 'task' | 'note', t: any) => {
        const key = `${kind}-${t.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        collectedTemplates.push({
          uid: key,
          kind,
          name: t.name || t.title || 'Template',
          title: t.title || '',
          description: t.description || t.content || '',
          tags: Array.isArray(t.templateTags) ? t.templateTags : [],
        });
      };
      myTasks.forEach(t => addT('task', t));
      pubTasks.forEach(t => addT('task', t));
      myNotes.forEach(t => addT('note', t));
      pubNotes.forEach(t => addT('note', t));
      setRemoteTemplates(collectedTemplates);

      // Fetch milestones across top active projects cleanly
      if (projList.length > 0) {
        const msBatches = await Promise.all(
          projList.slice(0, 12).map(p =>
            fetch(`/api/milestones/${p.id}`, { credentials: 'include' })
              .then(r => (r.ok ? r.json() : { milestones: [] }))
              .then(d =>
                (Array.isArray(d?.milestones) ? d.milestones : []).map((m: any) => ({
                  id: m.id,
                  projectId: p.id,
                  projectName: p.name,
                  name: m.name,
                  date: m.date || '',
                  description: m.description || '',
                  completed: Boolean(m.completed),
                })),
              )
              .catch(() => []),
          ),
        );
        setMilestones(msBatches.flat());
      } else {
        setMilestones([]);
      }
    } finally {
      setLoadingRemote(false);
    }
  }, []);

  useEffect(() => {
    const onOpenSearch = () => {
      setOpen(prev => !prev);
    };
    window.addEventListener('shortcut:global-search', onOpenSearch);
    return () => window.removeEventListener('shortcut:global-search', onOpenSearch);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCategory('all');
    setActiveIndex(0);
    void loadRemoteIndex();
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [open, loadRemoteIndex]);

  const allItems = useMemo<GlobalSearchResult[]>(() => {
    const results: GlobalSearchResult[] = [];
    const colTitleMap = new Map(board.columns.map(c => [c.id, c.title]));
    const noteColTitleMap = new Map(notesCtx.board.columns.map(c => [c.id, c.title]));

    board.tasks.forEach(task => {
      const colName = colTitleMap.get(task.columnId) || '';
      const assigneeNames = (task.assignedToUsers || []).map(a => a.name).join(', ');
      results.push({
        id: `task-${task.id}`,
        category: 'tasks',
        title: task.title || 'Untitled task',
        subtitle: [task.projectName, colName, task.dueDate ? `Due ${task.dueDate}` : '', assigneeNames]
          .filter(Boolean)
          .join(' · ') || 'Personal task',
        badge: task.priority && task.priority !== 'none' ? task.priority : undefined,
        completed: task.completed,
        href: `/tasks?open=${encodeURIComponent(task.id)}`,
        keywords: [task.title, task.description, task.projectName, colName, assigneeNames, ...(task.labels || []).map(l => l.name)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      });
    });

    notesCtx.board.tasks.forEach(note => {
      const colName = noteColTitleMap.get(note.columnId) || '';
      const assigneeNames = (note.assignedToUsers || []).map(a => a.name).join(', ');
      results.push({
        id: `note-${note.id}`,
        category: 'notes',
        title: note.title || 'Untitled note',
        subtitle: [note.projectName, colName, assigneeNames, note.description?.slice(0, 60)]
          .filter(Boolean)
          .join(' · ') || 'Personal note',
        completed: note.completed,
        href: `/notes?open=${encodeURIComponent(note.id)}`,
        keywords: [note.title, note.description, note.projectName, colName, assigneeNames, ...(note.labels || []).map(l => l.name)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase(),
      });
    });

    projects.forEach(p => {
      results.push({
        id: `project-${p.id}`,
        category: 'projects',
        title: p.name,
        subtitle: p.description?.trim() || 'Open project workspace',
        href: `/projects?project=${p.id}`,
        keywords: `${p.name} ${p.description || ''}`.toLowerCase(),
      });
    });

    milestones.forEach(m => {
      results.push({
        id: `milestone-${m.id}`,
        category: 'milestones',
        title: m.name,
        subtitle: `${m.projectName} · Target ${m.date}`,
        completed: m.completed,
        href: `/projects?project=${m.projectId}&tab=milestones`,
        keywords: `${m.name} ${m.description || ''} ${m.projectName} ${m.date} milestone`.toLowerCase(),
      });
    });

    DEFAULT_GALLERY_TEMPLATES.forEach(def => {
      results.push({
        id: `tmpl-def-${def.id}`,
        category: 'templates',
        title: def.name,
        subtitle: `Default ${def.kind} template · ${def.templateTags.join(', ')}`,
        badge: 'Default',
        href: `/settings?tab=templates&type=${def.kind}`,
        keywords: `${def.name} ${def.title} ${def.description} ${def.templateTags.join(' ')} template`.toLowerCase(),
      });
    });

    remoteTemplates.forEach(t => {
      results.push({
        id: `tmpl-${t.uid}`,
        category: 'templates',
        title: t.name,
        subtitle: `${t.kind === 'note' ? 'Note' : 'Task'} template`,
        href: `/settings?tab=templates&type=${t.kind}`,
        keywords: `${t.name} ${t.title} ${t.description} ${t.tags.join(' ')} template`.toLowerCase(),
      });
    });

    APP_PAGES.filter(p => p.path !== '/templates').forEach(p => {
      results.push({
        id: `page-${p.path}`,
        category: 'pages',
        title: p.label,
        subtitle: `Navigate to ${p.path}`,
        href: p.path,
        keywords: `${p.label} ${p.path} page`.toLowerCase(),
      });
    });

    SETTINGS_QUICK_LINKS.forEach(s => {
      results.push({
        id: `settings-${s.title}`,
        category: 'pages',
        title: s.title,
        subtitle: s.subtitle,
        href: s.href,
        keywords: `${s.title} ${s.subtitle} ${s.keywords}`.toLowerCase(),
      });
    });

    return results;
  }, [board.tasks, board.columns, notesCtx.board.tasks, notesCtx.board.columns, projects, milestones, remoteTemplates]);

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const byCat = category === 'all' ? allItems : allItems.filter(r => r.category === category);
    if (tokens.length === 0) {
      // Show helpful quick items when query is empty
      const tasksFirst = byCat.filter(i => i.category === 'tasks').slice(0, 4);
      const projectsFirst = byCat.filter(i => i.category === 'projects').slice(0, 3);
      const notesFirst = byCat.filter(i => i.category === 'notes').slice(0, 3);
      const pagesFirst = byCat.filter(i => i.category === 'pages').slice(0, 4);
      const combined = category === 'all' ? [...tasksFirst, ...projectsFirst, ...notesFirst, ...pagesFirst] : byCat.slice(0, 15);
      return combined;
    }

    return byCat
      .map(item => {
        const titleLow = item.title.toLowerCase();
        const allMatch = tokens.every(tok => item.keywords.includes(tok) || titleLow.includes(tok));
        if (!allMatch) return null;
        let score = 0;
        if (titleLow === tokens.join(' ')) score += 100;
        else if (titleLow.startsWith(tokens[0])) score += 50;
        else if (titleLow.includes(tokens.join(' '))) score += 25;
        if (!item.completed) score += 5;
        return { item, score };
      })
      .filter((x): x is { item: GlobalSearchResult; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 40)
      .map(x => x.item);
  }, [allItems, query, category]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, category]);

  const selectResult = (item: GlobalSearchResult) => {
    setOpen(false);
    navigate(item.href);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (filtered.length > 0 ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (filtered.length > 0 ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter' && filtered[activeIndex]) {
      e.preventDefault();
      selectResult(filtered[activeIndex]);
    }
  };

  if (!open) return null;

  const categoryIcon = (cat: GlobalSearchResult['category']) => {
    switch (cat) {
      case 'tasks':
        return <CheckSquare className="w-4 h-4 text-primary" />;
      case 'notes':
        return <StickyNote className="w-4 h-4 text-amber-500" />;
      case 'projects':
        return <FolderKanban className="w-4 h-4 text-indigo-500" />;
      case 'milestones':
        return <Flag className="w-4 h-4 text-emerald-500" />;
      case 'templates':
        return <LayoutTemplate className="w-4 h-4 text-purple-500" />;
      default:
        return <Compass className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global Search"
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div className="fixed inset-0 bg-background/75 backdrop-blur-sm animate-fade-in" />
      <div
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-2xl rounded-3xl border border-border bg-card shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[75vh]"
      >
        {/* Search Input Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border bg-card">
          <Search className="w-5 h-5 text-primary flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tasks, notes, projects, milestones, templates, pages…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {loadingRemote && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md border border-border bg-muted text-[10px] font-semibold text-muted-foreground">
            ESC
          </kbd>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close global search"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="px-4 py-2 border-b border-border/70 bg-muted/20 flex items-center gap-1.5 overflow-x-auto flex-shrink-0">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'tasks', label: 'Tasks' },
              { id: 'notes', label: 'Notes' },
              { id: 'projects', label: 'Projects' },
              { id: 'milestones', label: 'Milestones' },
              { id: 'templates', label: 'Templates' },
              { id: 'pages', label: 'Pages' },
            ] as const
          ).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setCategory(opt.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-all whitespace-nowrap ${
                category === opt.id
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filtered.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-2">
              <Search className="w-8 h-8 text-muted-foreground/50 mx-auto" />
              <p className="text-sm font-bold text-foreground">No matching results</p>
              <p className="text-xs text-muted-foreground">
                Try another keyword across tasks, notes, projects, milestones, or settings.
              </p>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const selected = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => selectResult(item)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left transition-all ${
                    selected
                      ? 'bg-primary/12 border border-primary/30 shadow-xs'
                      : 'border border-transparent hover:bg-muted/50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-xl bg-background border border-border/80 flex items-center justify-center flex-shrink-0">
                    {categoryIcon(item.category)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-bold truncate ${
                          item.completed ? 'line-through text-muted-foreground' : 'text-foreground'
                        }`}
                      >
                        {item.title}
                      </span>
                      {item.completed && <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />}
                      {item.badge && (
                        <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-muted/70 text-muted-foreground">
                      {item.category}
                    </span>
                    <ArrowRight
                      className={`w-3.5 h-3.5 transition-transform ${
                        selected ? 'text-primary translate-x-0.5' : 'text-muted-foreground/40'
                      }`}
                    />
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-4 py-2 border-t border-border bg-muted/30 flex items-center justify-between text-[11px] text-muted-foreground flex-shrink-0">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Open item</span>
            <span>Esc Close</span>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/settings?tab=shortcuts');
            }}
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
          >
            <Settings className="w-3 h-3" />
            Shortcut: {searchShortcutLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalSearchModal;
