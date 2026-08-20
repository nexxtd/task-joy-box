const PERMISSION_KEY = 'notif_permission_requested';

export type AlertTier = 'premium' | 'pro';

export const notificationsSupported = (): boolean => typeof window !== 'undefined' && 'Notification' in window;

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

export const deviceNotify = (title: string, body: string, tag?: string): void => {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon: '/favicon.ico', tag, silent: false });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 15000);
  } catch {
    // Ignore — notification failures must never break the app.
  }
};

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
    if (mins < 60) return `${mins} minutes ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  } catch {
    return 'overdue';
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