/**
 * Keyboard shortcuts system.
 * - Pre-loaded defaults to every page + Create Task / Create Note.
 * - Persisted in localStorage `shortcuts_v1`.
 * - Each shortcut can be rebound by capturing a new key combo.
 *
 * Supports both shapes:
 * - New UI (Settings > Shortcuts): ShortcutDef { id, title, keys, action }
 * - Legacy: Shortcut { id, title, combo, actionId }
 */

export interface ShortcutAction {
  id: string;
  label: string;
  kind: 'navigate' | 'command';
  path?: string;
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  { id: 'go-dashboard', label: 'Go to Dashboard', kind: 'navigate', path: '/' },
  { id: 'go-projects', label: 'Go to Projects', kind: 'navigate', path: '/projects' },
  { id: 'go-tasks', label: 'Go to Tasks', kind: 'navigate', path: '/tasks' },
  { id: 'go-insights', label: 'Go to Insights', kind: 'navigate', path: '/insights' },
  { id: 'go-notes', label: 'Go to Notes', kind: 'navigate', path: '/notes' },
  { id: 'go-calendar', label: 'Go to Calendar', kind: 'navigate', path: '/calendar' },
  { id: 'go-ai', label: 'Go to AI Assistant', kind: 'navigate', path: '/ai-chat' },
  { id: 'go-support', label: 'Go to Support', kind: 'navigate', path: '/support' },
  { id: 'go-settings', label: 'Go to Settings', kind: 'navigate', path: '/settings' },
  { id: 'create-task', label: 'Create Task', kind: 'command', path: '/tasks?create=1' },
  { id: 'create-note', label: 'Create Note', kind: 'command', path: '/notes?create=1' },
];

export interface ShortcutDef {
  id: string;
  title: string;
  keys: string;
  action: string;
}

/** Legacy alias. */
export interface Shortcut {
  id: string;
  title: string;
  combo: string;
  actionId: string;
}

const STORAGE_KEY = 'shortcuts_v1';

export const DEFAULT_SHORTCUTS: ShortcutDef[] = [
  { id: 'sc-dashboard', title: 'Dashboard', keys: 'Alt+D', action: 'go-dashboard' },
  { id: 'sc-projects', title: 'Projects', keys: 'Alt+P', action: 'go-projects' },
  { id: 'sc-tasks', title: 'Tasks', keys: 'Alt+T', action: 'go-tasks' },
  { id: 'sc-insights', title: 'Insights', keys: 'Alt+I', action: 'go-insights' },
  { id: 'sc-notes', title: 'Notes', keys: 'Alt+N', action: 'go-notes' },
  { id: 'sc-calendar', title: 'Calendar', keys: 'Alt+C', action: 'go-calendar' },
  { id: 'sc-ai', title: 'AI Assistant', keys: 'Alt+A', action: 'go-ai' },
  { id: 'sc-support', title: 'Support', keys: 'Alt+H', action: 'go-support' },
  { id: 'sc-settings', title: 'Settings', keys: 'Alt+S', action: 'go-settings' },
  { id: 'sc-create-task', title: 'Create Task', keys: 'Alt+Shift+T', action: 'create-task' },
  { id: 'sc-create-note', title: 'Create Note', keys: 'Alt+Shift+N', action: 'create-note' },
];

const LEGACY_DEFAULTS: Shortcut[] = DEFAULT_SHORTCUTS.map(d => ({
  id: d.id, title: d.title, combo: d.keys, actionId: d.action,
}));

export function getActionById(id: string): ShortcutAction | undefined {
  return SHORTCUT_ACTIONS.find(a => a.id === id);
}

function normalizeStored(raw: any): ShortcutDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String((raw as any).id || '');
  const title = String((raw as any).title || '');
  const keys = String((raw as any).keys ?? (raw as any).combo ?? '');
  const action = String((raw as any).action ?? (raw as any).actionId ?? '');
  if (!id || !title || !keys || !action) return null;
  return { id, title, keys, action };
}

export function loadShortcuts(): ShortcutDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SHORTCUTS));
      return [...DEFAULT_SHORTCUTS];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_SHORTCUTS];
    const byId = new Map<string, ShortcutDef>();
    for (const item of parsed) {
      const n = normalizeStored(item);
      if (n) byId.set(n.id, n);
    }
    for (const d of DEFAULT_SHORTCUTS) {
      if (!byId.has(d.id)) byId.set(d.id, { ...d });
    }
    return Array.from(byId.values());
  } catch {
    return [...DEFAULT_SHORTCUTS];
  }
}

export function saveShortcuts(list: Array<ShortcutDef | Shortcut>) {
  try {
    const normalized = (list || []).map(normalizeStored).filter(Boolean) as ShortcutDef[];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent('shortcuts-changed'));
  } catch {}
}

export function comboFromEvent(e: KeyboardEvent): string | null {
  const target = e.target as HTMLElement | null;
  const tag = (target?.tagName || '').toLowerCase();
  const inField = tag === 'input' || tag === 'textarea' || tag === 'select' || (target as any)?.isContentEditable;
  const hasMod = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
  if (inField && !hasMod) return null;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  let key = e.key;
  if (key === ' ') key = 'Space';
  else if (key.length === 1) key = key.toUpperCase();
  else key = key.charAt(0).toUpperCase() + key.slice(1);
  parts.push(key);
  if (parts.length < 2) return null;
  return parts.join('+');
}

function normalizeComboString(raw: string): string {
  const parts = String(raw || '').split('+').map(s => s.trim()).filter(Boolean);
  const mods: string[] = [];
  let key = '';
  for (const p of parts) {
    const l = p.toLowerCase();
    if (l === 'ctrl' || l === 'control') mods.push('Ctrl');
    else if (l === 'meta' || l === 'cmd' || l === 'command') mods.push('Meta');
    else if (l === 'alt' || l === 'option') mods.push('Alt');
    else if (l === 'shift') mods.push('Shift');
    else if (l === 'escape' || l === 'esc') return 'Escape';
    else key = p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1);
  }
  const order = ['Ctrl', 'Meta', 'Alt', 'Shift'];
  mods.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (key) mods.push(key);
  return mods.join('+');
}

/** Accepts a KeyboardEvent (capture mode) or a raw combo string. */
export function normalizeCombo(input: KeyboardEvent | string): string {
  if (typeof input === 'string') return normalizeComboString(input);
  try {
    const c = comboFromEvent(input);
    if (!c) {
      if ((input as KeyboardEvent).key === 'Escape') return 'Escape';
      return '';
    }
    return normalizeComboString(c);
  } catch {
    return '';
  }
}

export function matchesCombo(e: KeyboardEvent, combo: string): boolean {
  const want = normalizeComboString(combo).toLowerCase();
  const got = comboFromEvent(e)?.toLowerCase();
  return !!got && !!want && got === want;
}

type AnyShortcut = ShortcutDef | Shortcut;

function comboOf(s: AnyShortcut): string {
  return String((s as any).keys ?? (s as any).combo ?? '');
}

function actionOf(s: AnyShortcut): string {
  return String((s as any).action ?? (s as any).actionId ?? '');
}

export function matchesAnyShortcut(e: KeyboardEvent, list: AnyShortcut[]): { shortcut: AnyShortcut; action: ShortcutAction } | null {
  for (const sc of list || []) {
    if (!sc) continue;
    const combo = comboOf(sc as AnyShortcut);
    const actionId = actionOf(sc as AnyShortcut);
    if (!combo || !actionId) continue;
    try {
      if (matchesCombo(e, combo)) {
        const action = getActionById(actionId);
        if (action) return { shortcut: sc, action };
      }
    } catch {}
  }
  return null;
}

export function runShortcutAction(action: ShortcutAction, navigate?: (path: string) => void) {
  try {
    const path = action.path || '/';
    if (navigate) {
      navigate(path);
      return;
    }
    try {
      const url = new URL(path, window.location.origin);
      window.history.pushState({}, '', url.pathname + url.search);
      window.dispatchEvent(new PopStateEvent('popstate'));
      setTimeout(() => {
        if (window.location.pathname + window.location.search !== url.pathname + url.search) {
          window.location.assign(path);
        }
      }, 50);
    } catch {
      window.location.assign(path);
    }
  } catch {}
}

export { LEGACY_DEFAULTS as LEGACY_SHORTCUTS };
