/**
 * Per-button usage tracking (not just per page visit).
 * Records every feature interaction so the admin user profile can show
 * a full feature + usage breakdown per page.
 *
 * Storage: reuses the existing `dashboard_widget_usage` table via
 * POST /api/dashboard/widget-usage with namespaced types `ui:<page>:<feature>`.
 * Also mirrors to localStorage `usage_events_v1` for instant local reads.
 */

export function trackUsage(page: string, feature: string) {
  const p = String(page || 'unknown').toLowerCase();
  const f = String(feature || 'unknown').toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
  const key = `ui:${p}:${f}`;
  try {
    const raw = localStorage.getItem('usage_events_v1');
    const data = raw ? JSON.parse(raw) : {};
    data[p] = data[p] || {};
    data[p][f] = (Number(data[p][f]) || 0) + 1;
    localStorage.setItem('usage_events_v1', JSON.stringify(data));
  } catch {}
  try {
    fetch('/api/dashboard/widget-usage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ widgetTypes: [key] }),
    }).catch(() => {});
  } catch {}
}

export function trackPageVisit(page: string) {
  trackUsage(page, 'page-visit');
}

export function getLocalUsage(): Record<string, Record<string, number>> {
  try {
    const raw = localStorage.getItem('usage_events_v1');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
