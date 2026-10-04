/**
 * Keyboard shortcuts system.
 * - Pre-loaded defaults to every page + Create Task / Create Note / New AI Chat.
 * - Persisted in localStorage `shortcuts_v1`.
 * - Each shortcut can be rebound by capturing a new key combo.
 *
 * Supports both shapes:
 * - New UI (Settings > Shortcuts): ShortcutDef { id, title, keys, action }
 * - Legacy: Shortcut { id, title, combo, actionId }
 */

export type ShortcutCategory = 'pages' | 'create' | 'settings';

export const SHORTCUT_CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  pages: 'Pages',
  create: 'Create',
  settings: 'Settings',
};

export interface ShortcutAction {
  id: string;
  label: string;
  kind: 'navigate' | 'command';
  path?: string;
  category: ShortcutCategory;
  description?: string;
}

export const SHORTCUT_ACTIONS: ShortcutAction[] = [
  // ---- Pages ----
  { id: 'go-dashboard', label: 'Go to Dashboard', kind: 'navigate', path: '/', category: 'pages', description: 'Open your home dashboard' },
  { id: 'go-projects', label: 'Go to Projects', kind: 'navigate', path: '/projects', category: 'pages', description: 'Open the projects board' },
  { id: 'go-tasks', label: 'Go to Tasks', kind: 'navigate', path: '/tasks', category: 'pages', description: 'Open your task list' },
  { id: 'go-calendar', label: 'Go to Calendar', kind: 'navigate', path: '/calendar', category: 'pages', description: 'Open the calendar view' },
  { id: 'go-insights', label: 'Go to Insights', kind: 'navigate', path: '/insights', category: 'pages', description: 'Open productivity insights' },
  { id: 'go-notes', label: 'Go to Notes', kind: 'navigate', path: '/notes', category: 'pages', description: 'Open your notes' },
  { id: 'go-ai', label: 'Go to AI Assistant', kind: 'navigate', path: '/ai-chat', category: 'pages', description: 'Open the AI chat' },
  { id: 'go-collaboration', label: 'Go to Collaboration', kind: 'navigate', path: '/collaboration', category: 'pages', description: 'Open shared boards and teams' },
  { id: 'go-support', label: 'Go to Support', kind: 'navigate', path: '/support', category: 'pages', description: 'Open help and support' },
  { id: 'go-whats-new', label: "Go to What's New", kind: 'navigate', path: '/whats-new', category: 'pages', description: 'See the latest updates' },
  { id: 'go-pricing', label: 'Go to Pricing', kind: 'navigate', path: '/pricing', category: 'pages', description: 'View plans and upgrade' },
  { id: 'go-settings', label: 'Go to Settings', kind: 'navigate', path: '/settings', category: 'pages', description: 'Open app settings' },
  // ---- Create ----
  { id: 'create-task', label: 'Create Task', kind: 'command', path: '/tasks?create=1', category: 'create', description: 'Open the new-task form' },
  { id: 'create-note', label: 'Create Note', kind: 'command', path: '/notes?create=1', category: 'create', description: 'Open the new-note form' },
  { id: 'new-ai-chat', label: 'New AI Chat', kind: 'command', path: '/ai-chat?new=1', category: 'create', description: 'Start a fresh AI conversation' },
  // ---- Settings sections ----
  { id: 'settings-appearance', label: 'Settings: Appearance', kind: 'navigate', path: '/settings?section=appearance', category: 'settings', description: 'Theme, colour, font and language' },
  { id: 'settings-notifications', label: 'Settings: Notifications', kind: 'navigate', path: '/settings?section=notifications', category: 'settings', description: 'Smart alerts and emails' },
  { id: 'settings-calendar', label: 'Settings: Calendar', kind: 'navigate', path: '/settings?section=calendar', category: 'settings', description: 'Calendar connection' },
  { id: 'settings-energy', label: 'Settings: Energy', kind: 'navigate', path: '/settings?section=energy', category: 'settings', description: 'Energy tracker and insights' },
  { id: 'settings-history', label: 'Settings: History', kind: 'navigate', path: '/settings?section=history', category: 'settings', description: 'Energy and focus history' },
  { id: 'settings-shortcuts', label: 'Settings: Shortcuts', kind: 'navigate', path: '/settings?section=shortcuts', category: 'settings', description: 'Manage keyboard shortcuts' },
  { id: 'settings-account', label: 'Settings: Account', kind: 'navigate', path: '/settings?section=account', category: 'settings', description: 'Profile and sign out' },
  { id: 'settings-security', label: 'Settings: Privacy', kind: 'navigate', path: '/settings?section=security', category: 'settings', description: 'Two-factor and security' },
  { id: 'settings-tickets', label: 'Settings: Tickets', kind: 'navigate', path: '/settings?section=tickets', category: 'settings', description: 'Your support tickets' },
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
  { id: 'sc-collaboration', title: 'Collaboration', keys: 'Alt+O', action: 'go-collaboration' },
  { id: 'sc-whats-new', title: "What's New", keys: 'Alt+W', action: 'go-whats-new' },
  { id: 'sc-support', title: 'Support', keys: 'Alt+H', action: 'go-support' },
  { id: 'sc-settings', title: 'Settings', keys: 'Alt+S', action: 'go-settings' },
  { id: 'sc-shortcut-settings', title: 'Shortcut Settings', keys: 'Alt+K', action: 'settings-shortcuts' },
  { id: 'sc-create-task', title: 'Create Task', keys: 'Alt+Shift+T', action: 'create-task' },
  { id: 'sc-create-note', title: 'Create Note', keys: 'Alt+Shift+N', action: 'create-note' },
  { id: 'sc-new-ai-chat', title: 'New AI Chat', keys: 'Alt+Shift+A', action: 'new-ai-chat' },
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

export function removeShortcut(id: string) {
  const current = loadShortcuts();
  const filtered = current.filter(s => s.id !== id);
  saveShortcuts(filtered);
}

// ---------------------------------------------------------------------------
// Capture guard: while the user is rebinding a shortcut (Settings is listening
// for the next keypress), the global handler must stay quiet so the capture
// keystroke isn't also executed as a shortcut.
// ---------------------------------------------------------------------------
let captureCount = 0;

export function beginShortcutCapture() {
  captureCount++;
  try { (window as any).__shortcutsCapturing = true; } catch {}
}

export function endShortcutCapture() {
  captureCount = Math.max(0, captureCount - 1);
  if (captureCount === 0) {
    try {
      if ((window as any).__shortcutsCapturing) delete (window as any).__shortcutsCapturing;
    } catch {
      try { (window as any).__shortcutsCapturing = false; } catch {}
    }
  }
}

export function isShortcutCapturing(): boolean {
  if (captureCount > 0) return true;
  try { return !!(window as any).__shortcutsCapturing; } catch { return false; }
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
  else {
    // Alt/AltGr on some layouts produces 'Dead' or 'Unidentified' instead of
    // the real key — fall back to the physical code (KeyT, Digit1, …) so the
    // shortcut still matches. Named keys (Enter, Tab, arrows, …) are kept.
    const code = (e as any).code as string | undefined;
    let fromCode = '';
    if (code) {
      const mKey = /^Key([A-Z])$/.exec(code);
      const mDig = /^Digit([0-9])$/.exec(code);
      if (mKey) fromCode = mKey[1];
      else if (mDig) fromCode = mDig[1];
    }
    key = fromCode || (key.charAt(0).toUpperCase() + key.slice(1));
  }
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

/**
 * DOM events fired (before navigation) so the target page can react even when
 * it is already mounted — e.g. pressing "Create Task" while on /tasks opens
 * the modal instead of doing nothing because the URL barely changed.
 */
export const SHORTCUT_DOM_EVENTS: Record<string, string> = {
  'create-task': 'shortcut:create-task',
  'create-note': 'shortcut:create-note',
  'new-ai-chat': 'shortcut:new-ai-chat',
};

export function runShortcutAction(action: ShortcutAction, navigate?: (path: string) => void) {
  try {
    // Notify the live page first so already-mounted targets respond instantly.
    const domEvent = SHORTCUT_DOM_EVENTS[action.id];
    if (domEvent) {
      try { window.dispatchEvent(new CustomEvent(domEvent)); } catch {}
    }
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
