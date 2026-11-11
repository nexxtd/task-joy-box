import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SMART_ALERTS_CHANGED_EVENT,
  SMART_ALERTS_STORAGE_KEY,
  deviceNotify,
  sendTestNotification,
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
