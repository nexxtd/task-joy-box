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
    if (!raw) { cache = {}; return cache; }
    const parsed = JSON.parse(raw);
    cache = parsed && typeof parsed === 'object' ? parsed : {};
    return cache;
  } catch {
    cache = {};
    return cache;
  }
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
