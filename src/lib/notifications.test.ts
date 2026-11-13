import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/types/board';
import {
  NORMAL_ALERTS_CHANGED_EVENT,
  NORMAL_ALERTS_STORAGE_KEY,
  SMART_ALERTS_CHANGED_EVENT,
  SMART_ALERTS_STORAGE_KEY,
  buildActiveAlerts,
  deviceNotify,
  normalAlertsEnabled,
  sendTestNotification,
  setNormalAlertsEnabled,
  setSmartAlertsEnabled,
  smartAlertsEnabled,
} from './notifications';

class MockNotification {
  static permission: NotificationPermission = 'granted';
  static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(public title: string, public options?: NotificationOptions) {}
}

const installNotificationMock = (permission: NotificationPermission = 'granted') => {
  MockNotification.permission = permission;
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: MockNotification,
  });
};

describe('smart alerts preference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    delete (window as any).Notification;
    vi.restoreAllMocks();
  });

  it('defaults to enabled for new devices', () => {
    expect(smartAlertsEnabled()).toBe(true);
  });

  it('persists the preference and notifies listeners', () => {
    const listener = vi.fn();
    window.addEventListener(SMART_ALERTS_CHANGED_EVENT, listener);

    setSmartAlertsEnabled(false);

    expect(localStorage.getItem(SMART_ALERTS_STORAGE_KEY)).toBe('false');
    expect(smartAlertsEnabled()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(SMART_ALERTS_CHANGED_EVENT, listener);
  });
});

describe('device notifications', () => {
  afterEach(() => {
    delete (window as any).Notification;
    vi.restoreAllMocks();
  });

  it('does nothing when notifications are unsupported', () => {
    delete (window as any).Notification;
    expect(deviceNotify('Title', 'Body')).toBe(false);
    expect(sendTestNotification()).toBe(false);
  });

  it('does nothing when permission is not granted', () => {
    installNotificationMock('default');
    expect(deviceNotify('Title', 'Body')).toBe(false);
  });

  it('shows a notification when permission is granted', () => {
    installNotificationMock('granted');
    expect(deviceNotify('Title', 'Body', 'tag-1')).toBe(true);
    expect(sendTestNotification()).toBe(true);
  });
});

const makeTask = (overrides: Partial<Task>): Task => ({
  id: 't1',
  title: 'Sample Task',
  description: '',
  priority: 'medium',
  labels: [],
  checklists: [],
  subtasks: [],
  createdAt: '2026-05-01T10:00:00.000Z',
  columnId: 'todo',
  order: 0,
  ...overrides,
});

describe('normal alerts preference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to enabled and emits change events on toggle', () => {
    expect(normalAlertsEnabled()).toBe(true);
    const listener = vi.fn();
    window.addEventListener(NORMAL_ALERTS_CHANGED_EVENT, listener);

    setNormalAlertsEnabled(false);

    expect(localStorage.getItem(NORMAL_ALERTS_STORAGE_KEY)).toBe('false');
    expect(normalAlertsEnabled()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener(NORMAL_ALERTS_CHANGED_EVENT, listener);
  });
});

describe('buildActiveAlerts (Normal Free vs Smart AI Alerts)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 15, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates Free Normal Alerts for overdue, due soon (<1h), and urgent (<12h) tasks', () => {
    const tasks: Task[] = [
      makeTask({ id: 'overdue', title: 'Overdue Tax', dueDate: '2026-05-14', dueTime: '12:00' }),
      makeTask({ id: 'soon', title: 'Standup Prep', dueDate: '2026-05-15', dueTime: '12:30' }),
      makeTask({ id: 'urgent', title: 'Client Deck', priority: 'urgent', dueDate: '2026-05-15', dueTime: '18:00' }),
      makeTask({ id: 'done', title: 'Finished', completed: true, dueDate: '2026-05-14', dueTime: '10:00' }),
    ];

    const alerts = buildActiveAlerts(tasks, { normalEnabled: true, smartEnabled: false });
    expect(alerts.every((a) => a.kind === 'normal_alert')).toBe(true);
    expect(alerts.map((a) => a.title)).toEqual(['Overdue Task', 'Due Soon', 'Urgent Deadline']);
  });

  it('generates Paid Smart AI Alerts recommending quick wins, heavy 24h clusters, and stalled tasks', () => {
    const tasks: Task[] = [
      makeTask({ id: 'o1', title: 'Big Report', duration: 90, dueDate: '2026-05-14', dueTime: '10:00' }),
      makeTask({ id: 'o2', title: 'Quick Reply', duration: 10, dueDate: '2026-05-14', dueTime: '15:00' }),
      makeTask({ id: 'd1', title: 'Spec 1', dueDate: '2026-05-15', dueTime: '17:00' }),
      makeTask({ id: 'd2', title: 'Spec 2', dueDate: '2026-05-15', dueTime: '19:00' }),
      makeTask({ id: 'd3', title: 'Spec 3', dueDate: '2026-05-16', dueTime: '09:00' }),
      makeTask({
        id: 'stalled',
        title: 'Stalled Launch',
        updatedAt: '2026-05-05T10:00:00.000Z',
        subtasks: [{ id: 's1', text: 'Draft outline', completed: false }],
      }),
    ];

    const alerts = buildActiveAlerts(tasks, { normalEnabled: false, smartEnabled: true });
    expect(alerts.every((a) => a.kind === 'smart_alert')).toBe(true);

    const fallingBehind = alerts.find((a) => a.key.startsWith('smart_falling_behind_'));
    expect(fallingBehind).toBeDefined();
    expect(fallingBehind?.body).toContain('falling behind on 2 tasks');
    expect(fallingBehind?.body).toContain('"Quick Reply" (10m)');

    expect(alerts.some((a) => a.key.startsWith('smart_packed_24h_'))).toBe(true);
    expect(alerts.some((a) => a.key === 'smart_stalled_stalled')).toBe(true);
  });
});
