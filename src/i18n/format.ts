import { dateLocaleFromCode } from './bcp47';
import { getCurrentLang, tt } from './translations';

export const dateLocale = (): string => dateLocaleFromCode(getCurrentLang());

export const formatDate = (value?: string, emptyKey = 'No due date'): string => {
  if (!value) return tt(emptyKey);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' });
};

export const formatDateTime = (value?: string): string => {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString(dateLocale(), { month: 'short', day: 'numeric' })
    + ' · '
    + parsed.toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' });
};

export const formatDuration = (minutes?: number | null, empty: string | null = null): string | null => {
  if (!minutes || minutes <= 0) return empty;
  if (minutes < 60) return tt('{{count}} min', { count: Math.round(minutes) });
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? tt('{{count}}h {{mins}}m', { count: h, mins: m }) : tt('{{count}}h', { count: h });
};
