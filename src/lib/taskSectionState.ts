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

function readAll(): Record<string, TaskSectionState> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
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
  } catch {}
}
