import { format, addMinutes, differenceInMinutes } from 'date-fns';
import { CalendarSlot } from '@/types/calendar';

export const HOUR_HEIGHT = 72;
export const START_HOUR = 0;
export const END_HOUR = 24;

export const snapTo5 = (minutes: number): number => Math.round(minutes / 5) * 5;

export const timeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export const minutesToTime = (minutes: number): string => {
  const total = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

export const addMinutesToTime = (time: string, mins: number): string => {
  return minutesToTime(timeToMinutes(time) + mins);
};

export const calculateDuration = (start: string, end: string): number => {
  return timeToMinutes(end) - timeToMinutes(start);
};

export const formatTimeDisplay = (time: string): string => {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hour12}${period}` : `${hour12}:${m.toString().padStart(2, '0')}${period}`;
};

export const snapTimeTo5 = (time: string): string => {
  const [h, m] = time.split(':').map(Number);
  const snapped = snapTo5(m);
  return snapped >= 60
    ? `${h + 1}:00`
    : `${h.toString().padStart(2, '0')}:${snapped.toString().padStart(2, '0')}`;
};

export const topForTime = (time: string): number => {
  const totalMin = timeToMinutes(time);
  return (totalMin - START_HOUR * 60) * (HOUR_HEIGHT / 60);
};

export const timeForPosition = (y: number, scrollTop: number): string => {
  const totalMin = (y + scrollTop) / (HOUR_HEIGHT / 60) + START_HOUR * 60;
  const snapped = snapTo5(totalMin);
  return minutesToTime(snapped);
};

export const slotHeight = (duration: number): number => (duration / 60) * HOUR_HEIGHT;

export const generateId = (): string => `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export const RECURRING_LABELS: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

export const SLOT_COLORS: Record<string, string> = {
  task: '#4f46e5',
  goal: '#059669',
  habit: '#d97706',
  'fixed-event': '#7c3aed',
  break: '#0891b2',
};

export const RECURRING_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];
