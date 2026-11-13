import { tt } from '@/i18n/translations';
import type { Task } from '@/types/board';

const PERMISSION_KEY = 'notif_permission_requested';

export const NORMAL_ALERTS_STORAGE_KEY = 'normalAlerts';
export const NORMAL_ALERTS_CHANGED_EVENT = 'normal-alerts:changed';
export const SMART_ALERTS_STORAGE_KEY = 'smartAlerts';
/** Fired whenever the Smart Alerts preference changes so the notifier can react without a reload. */
export const SMART_ALERTS_CHANGED_EVENT = 'smart-alerts:changed';
export const NOTIFICATIONS_REFRESH_EVENT = 'notifications:refresh';

export type AlertTier = 'premium' | 'pro';

export const notificationsSupported = (): boolean => typeof window !== 'undefined' && 'Notification' in window;

/** Whether Normal Alerts (Free) are enabled on this device. Defaults to on. */
export const normalAlertsEnabled = (): boolean => {
  try {
    return localStorage.getItem(NORMAL_ALERTS_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
};

export const setNormalAlertsEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(NORMAL_ALERTS_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore quota/private-mode failures.
  }
  try {
    window.dispatchEvent(new CustomEvent(NORMAL_ALERTS_CHANGED_EVENT, { detail: { enabled } }));
  } catch {
    // Ignore environments without CustomEvent (SSR/tests).
  }
};

/** Whether Smart Alerts are enabled on this device. Defaults to on. */
export const smartAlertsEnabled = (): boolean => {
  try {
    return localStorage.getItem(SMART_ALERTS_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
};

export const setSmartAlertsEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(SMART_ALERTS_STORAGE_KEY, String(enabled));
  } catch {
    // Ignore quota/private-mode failures.
  }
  try {
    window.dispatchEvent(new CustomEvent(SMART_ALERTS_CHANGED_EVENT, { detail: { enabled } }));
  } catch {
    // Ignore environments without CustomEvent (SSR/tests).
  }
};

export const notificationPermission = (): 'granted' | 'denied' | 'default' =>
  notificationsSupported() ? Notification.permission : ('denied' as NotificationPermission);

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!notificationsSupported()) return false;
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      localStorage.setItem(PERMISSION_KEY, 'true');
      return true;
    }
    return false;
  } catch {
    return false;
  }
};

export const hasRequestedPermission = (): boolean => localStorage.getItem(PERMISSION_KEY) === 'true';

export const deviceNotify = (title: string, body: string, tag?: string): boolean => {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  try {
    const tTitle = typeof title === 'string' ? tt(title) : title;
    const tBody = typeof body === 'string' ? tt(body) : body;
    const n = new Notification(tTitle, { body: tBody, icon: '/favicon.ico', tag, silent: false });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 15000);
    return true;
  } catch {
    // Ignore — notification failures must never break the app.
    return false;
  }
};

/** Sends an immediate device notification so users can verify alerts work. */
export const sendTestNotification = (): boolean =>
  deviceNotify(
    'Smart Alerts are working',
    'This is a test notification. You will get alerts here for overdue tasks, due deadlines and energy checks.',
    'smart-alerts-test',
  );

const SENT_KEY = 'smart_alerts_sent_v2';
const loadSent = (): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(SENT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};
const saveSent = (map: Record<string, boolean>) => {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(map));
  } catch {
    // Ignore
  }
};
const pruneOldKeys = (map: Record<string, boolean>): Record<string, boolean> => {
  const today = new Date();
  const cutoff = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const pruned: Record<string, boolean> = {};
  Object.keys(map).forEach(k => {
    const date = k.split('::')[1];
    if (date && date >= cutoff) pruned[k] = true;
  });
  return pruned;
};

const dayKey = (d: Date) => d.toISOString().split('T')[0];

export const markAlertSent = (key: string) => {
  const map = pruneOldKeys(loadSent());
  map[`${key}::${dayKey(new Date())}`] = true;
  saveSent(map);
};

export const wasAlertSent = (key: string): boolean => {
  const map = loadSent();
  return map[`${key}::${dayKey(new Date())}`] === true;
};

export const isTaskDueSoon = (dueDate: string, dueTime?: string) => {
  try {
    const due = dueTime ? new Date(`${dueDate}T${dueTime}`) : new Date(`${dueDate}T23:59:59`);
    const diff = due.getTime() - Date.now();
    return diff > 0 && diff < 60 * 60 * 1000;
  } catch {
    return false;
  }
};

export const isTaskOverdue = (dueDate: string, dueTime?: string) => {
  try {
    const due = dueTime ? new Date(`${dueDate}T${dueTime}`) : new Date(`${dueDate}T23:59:59`);
    return due.getTime() < Date.now();
  } catch {
    return false;
  }
};

export const formatOverdueDelta = (dueDate: string, dueTime?: string): string => {
  try {
    const due = dueTime ? new Date(`${dueDate}T${dueTime}`) : new Date(`${dueDate}T23:59:59`);
    const mins = Math.floor((Date.now() - due.getTime()) / 60000);
    if (mins < 60) return tt('{{count}} minutes ago', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 48) return hours === 1 ? tt('{{count}} hour ago', { count: hours }) : tt('{{count}} hours ago', { count: hours });
    const days = Math.floor(hours / 24);
    return days === 1 ? tt('{{count}} day ago', { count: days }) : tt('{{count}} days ago', { count: days });
  } catch {
    return tt('overdue');
  }
};

export const WEEKLY_EMAIL_KEY = 'weekly_email_last_sent';
export const shouldSendWeeklyEmail = (): boolean => {
  const last = localStorage.getItem(WEEKLY_EMAIL_KEY);
  if (!last) return true;
  const lastDate = new Date(last);
  if (Number.isNaN(lastDate.getTime())) return true;
  const diff = Date.now() - lastDate.getTime();
  return diff >= 6.5 * 24 * 60 * 60 * 1000;
};

export const sendWeeklySummaryEmail = async (summaryText: string): Promise<boolean> => {
  try {
    const res = await fetch('/api/notifications/weekly-summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ summary: summaryText }),
    });
    if (res.ok) return true;
    return false;
  } catch {
    return false;
  }
};

export interface BuiltAlertItem {
  key: string;
  kind: 'normal_alert' | 'smart_alert';
  title: string;
  body: string;
  toastTitle: string;
  toastBody: string;
}

/** Build active Normal (Free) and Smart AI (Premium/Pro) alerts from the user's tasks. */
export const buildActiveAlerts = (
  tasks: Task[],
  opts: { normalEnabled: boolean; smartEnabled: boolean },
): BuiltAlertItem[] => {
  const out: BuiltAlertItem[] = [];
  const now = Date.now();
  const isOpen = (task: Task) =>
    !task.completed && !(task.columnId && task.columnId.toLowerCase().includes('done'));

  const openTasks = tasks.filter(isOpen);

  if (opts.normalEnabled) {
    openTasks.forEach(task => {
      if (!task.dueDate) return;
      const due = new Date(`${task.dueDate}T${task.dueTime || '23:59:59'}`);
      if (Number.isNaN(due.getTime())) return;
      const diff = due.getTime() - now;
      const overdue = diff < 0;
      const urgent = task.priority === 'urgent';
      if (urgent && !overdue && diff < 12 * 60 * 60 * 1000) {
        out.push({
          key: `normal_urgent_${task.id}_${task.dueDate}`,
          kind: 'normal_alert',
          title: 'Urgent Deadline',
          body: `Task "${task.title}" is due soon!`,
          toastTitle: 'Urgent Deadline',
          toastBody: `Task "${task.title}" is due soon!`,
        });
      }
      if (!overdue && diff < 60 * 60 * 1000) {
        out.push({
          key: `normal_soon_${task.id}_${task.dueDate}`,
          kind: 'normal_alert',
          title: 'Due Soon',
          body: `Task "${task.title}" is due by ${task.dueTime || 'end of day'} today`,
          toastTitle: 'Due Soon',
          toastBody: `Task "${task.title}" is due within the hour`,
        });
      }
      if (overdue) {
        out.push({
          key: `normal_overdue_${task.id}_${task.dueDate}_${task.dueTime || ''}`,
          kind: 'normal_alert',
          title: 'Overdue Task',
          body: `Task "${task.title}" is ${formatOverdueDelta(task.dueDate, task.dueTime)}`,
          toastTitle: 'Overdue',
          toastBody: `Task "${task.title}" is overdue`,
        });
      }
    });
  }

  if (opts.smartEnabled) {
    const overdueTasks = openTasks.filter(t => t.dueDate && isTaskOverdue(t.dueDate, t.dueTime));
    const urgentOverdue = overdueTasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
    if (overdueTasks.length >= 2 || urgentOverdue.length >= 1) {
      const quickWin = [...overdueTasks].sort((a, b) => (a.duration || 30) - (b.duration || 30))[0] || overdueTasks[0];
      const preview = overdueTasks.slice(0, 2).map(t => `"${t.title}"`).join(', ');
      const extra = overdueTasks.length > 2 ? ` +${overdueTasks.length - 2} more` : '';
      const msg = `You are falling behind on ${overdueTasks.length} task${overdueTasks.length > 1 ? 's' : ''} (${preview}${extra}). Consider finishing "${quickWin.title}" (${quickWin.duration || 15}m) first or rescheduling low-priority work.`;
      out.push({
        key: `smart_falling_behind_${overdueTasks.length}_${overdueTasks[0].id}`,
        kind: 'smart_alert',
        title: 'AI Smart Alert: Falling Behind',
        body: msg,
        toastTitle: 'AI Smart Alert',
        toastBody: msg,
      });
    }

    const dueWithin24h = openTasks.filter(t => {
      if (!t.dueDate) return false;
      const due = new Date(`${t.dueDate}T${t.dueTime || '23:59:59'}`);
      const diff = due.getTime() - now;
      return diff >= 0 && diff <= 24 * 60 * 60 * 1000;
    });
    if (dueWithin24h.length >= 3) {
      const msg = `${dueWithin24h.length} tasks are due within 24 hours (${dueWithin24h.slice(0, 2).map(t => `"${t.title}"`).join(', ')}). Tackle the highest-priority item first and defer non-critical tasks.`;
      out.push({
        key: `smart_packed_24h_${dueWithin24h.length}_${dueWithin24h[0].id}`,
        kind: 'smart_alert',
        title: 'AI Smart Alert: Heavy 24h Workload',
        body: msg,
        toastTitle: 'AI Smart Alert',
        toastBody: msg,
      });
    }

    const stalled = openTasks.find(t => {
      const hasSteps = (t.subtasks?.length || 0) + (t.checklists?.length || 0) > 0;
      if (!hasSteps) return false;
      const refTime = new Date(t.updatedAt || t.createdAt).getTime();
      return !Number.isNaN(refTime) && (now - refTime) >= 5 * 24 * 60 * 60 * 1000;
    });
    if (stalled) {
      const msg = `"${stalled.title}" has unfinished breakdown steps untouched for 5+ days. Completing one small step now can break the stall.`;
      out.push({
        key: `smart_stalled_${stalled.id}`,
        kind: 'smart_alert',
        title: 'AI Smart Alert: Stalled Task',
        body: msg,
        toastTitle: 'AI Smart Alert',
        toastBody: msg,
      });
    }
  }

  return out;
};