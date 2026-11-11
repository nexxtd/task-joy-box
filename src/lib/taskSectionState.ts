export interface TaskSectionState {
  subtasks?: boolean;
  checklists?: boolean;
  attachments?: boolean;
  images?: boolean;
  activity?: boolean;
  /** Legacy: ids of collapsed lists. Kept only so old storage can be migrated. */
  collapsedLists?: string[];
  /** Ids of checklist lists the user expanded. Absent ids default to collapsed. */
  expandedLists?: string[];
}

const KEY = 'task-section-state-v1';
const MAX_ENTRIES = 500;
// One-time migration: a recent change defaulted Files/Images to collapsed and
// persisted that on mount. Re-open those two sections once so existing users
// see the upload controls again; their later toggles still persist normally.
const MEDIA_OPEN_MIGRATION_KEY = 'task-section-media-open-v1';

// The section map is read on every expanded row (several times per row, in
// useState initialisers AND effects). Parsing it each time meant 5 full
// JSON.parse calls per expanded note. Cache the parsed map in memory and
// invalidate it on write.
let cache: Record<string, TaskSectionState> | null = null;

// Another tab writing the map must not leave us reading a stale copy.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === KEY) cache = null; });
}

function readAll(): Record<string, TaskSectionState> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      cache = {};
      try { localStorage.setItem(MEDIA_OPEN_MIGRATION_KEY, '1'); } catch {}
      return cache;
    }
    const parsed = JSON.parse(raw);
    cache = parsed && typeof parsed === 'object' ? parsed : {};
    return migrateMediaSectionsOpen(cache);
  } catch {
    cache = {};
    return cache;
  }
}

function migrateMediaSectionsOpen(all: Record<string, TaskSectionState>) {
  try {
    if (localStorage.getItem(MEDIA_OPEN_MIGRATION_KEY)) return all;
    let changed = false;
    Object.values(all).forEach(state => {
      if (!state || typeof state !== 'object') return;
      if (state.attachments !== false) { state.attachments = false; changed = true; }
      if (state.images !== false) { state.images = false; changed = true; }
    });
    if (changed) localStorage.setItem(KEY, JSON.stringify(all));
    localStorage.setItem(MEDIA_OPEN_MIGRATION_KEY, '1');
  } catch {}
  return all;
}

export function readTaskSections(taskId: string): TaskSectionState {
  try {
    return readAll()[String(taskId)] || {};
  } catch {
    return {};
  }
}

/**
 * Checklist lists default to collapsed. We persist the ids the user has
 * EXPANDED; a list absent from the set stays closed until the user opens it.
 * Old `collapsedLists` storage is migrated once: lists not in it are treated
 * as expanded for backwards compatibility.
 */
export function readExpandedLists(taskId: string, currentListIds: string[]): Set<string> {
  try {
    const s = readTaskSections(taskId);
    if (Array.isArray(s.expandedLists)) return new Set(s.expandedLists);
    if (Array.isArray(s.collapsedLists)) {
      const collapsed = new Set(s.collapsedLists);
      return new Set(currentListIds.filter(id => !collapsed.has(id)));
    }
    return new Set();
  } catch {
    return new Set();
  }
}

export function writeTaskSections(taskId: string, state: TaskSectionState) {
  try {
    const all = readAll();
    all[String(taskId)] = state;
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      keys.slice(0, keys.length - MAX_ENTRIES).forEach(k => { delete all[k]; });
    }
    localStorage.setItem(KEY, JSON.stringify(all));
    cache = all;
  } catch {}
}

/**
 * Section open/closed state for surfaces that have no saved entity to key off
 * yet: the create/edit modals (new task, new note, template editor) and
 * per-task overlays like Deep Focus. Every surface reads and writes its own
 * scope, so collapsing Sub-tasks (or Checklist/Attachments/Images) survives
 * closing the modal and reopening the page.
 */
export interface DraftSectionState {
  subtasks?: boolean;
  checklists?: boolean;
  attachments?: boolean;
  images?: boolean;
  progress?: boolean;
}

const DRAFT_KEY = 'draft-section-state-v1';

let draftCache: Record<string, DraftSectionState> | null = null;

// Another tab writing the map must not leave us reading a stale copy.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => { if (e.key === DRAFT_KEY) draftCache = null; });
}

function readAllDraft(): Record<string, DraftSectionState> {
  if (draftCache) return draftCache;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    draftCache = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    draftCache = {};
  }
  return draftCache;
}

export function readDraftSections(scope = 'draft'): DraftSectionState {
  try {
    const state = readAllDraft()[scope];
    return state && typeof state === 'object' ? state : {};
  } catch {
    return {};
  }
}

/** Merge a patch into one scope so writers of other sections are left alone. */
export function writeDraftSections(patch: Partial<DraftSectionState>, scope = 'draft') {
  try {
    const all = readAllDraft();
    all[scope] = { ...all[scope], ...patch };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(all));
    draftCache = all;
  } catch {}
}
