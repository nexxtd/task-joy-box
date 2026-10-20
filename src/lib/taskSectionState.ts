export interface TaskSectionState {
  subtasks?: boolean;
  checklists?: boolean;
  attachments?: boolean;
  images?: boolean;
  activity?: boolean;
  collapsedLists?: string[];
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
