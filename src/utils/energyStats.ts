import { useEffect, useMemo, useState } from 'react';

export type EnergyLevel = 'low' | 'medium' | 'high';
export type EnergySlot = 'morning' | 'midday' | 'afternoon';

export interface EnergyEntry {
  date: string;
  morning?: EnergyLevel;
  midday?: EnergyLevel;
  afternoon?: EnergyLevel;
  evening?: EnergyLevel;
  note?: string;
}

export const ENERGY_STORAGE_KEY = 'energy_history';
export const ENERGY_ENABLED_KEY = 'energyTrackerEnabled';
export const ENERGY_UPDATED_EVENT = 'energy-history-updated';

export const ENERGY_SLOTS: Array<{ id: EnergySlot; label: string; hour: number; window: string; accent: string }> = [
  { id: 'morning', label: 'Morning', hour: 8, window: '8am–12pm', accent: 'label-yellow' },
  { id: 'midday', label: 'Midday', hour: 12, window: '12pm–4pm', accent: 'label-orange' },
  { id: 'afternoon', label: 'Afternoon', hour: 16, window: '4pm onward', accent: 'label-blue' },
];

export const energyLevelValue = (level?: EnergyLevel): number =>
  level === 'high' ? 3 : level === 'medium' ? 2 : level === 'low' ? 1 : 0;

export const energyLevelColor = (level: EnergyLevel): string =>
  level === 'high'
    ? 'hsl(var(--label-green))'
    : level === 'medium'
      ? 'hsl(var(--label-yellow))'
      : 'hsl(var(--label-red))';

export const energyLocalDayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const isEnergyTrackerEnabled = (): boolean =>
  localStorage.getItem(ENERGY_ENABLED_KEY) !== 'false';

export const isEnergyPremiumTier = (tier?: string): boolean => tier === 'pro' || tier === 'premium';

export function readEnergyHistory(): EnergyEntry[] {
  try {
    const raw = localStorage.getItem(ENERGY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EnergyEntry[]) : [];
  } catch {
    return [];
  }
}

export interface EnergySlotStat {
  avg: number;
  logged: number;
}

export interface EnergyAnalysis {
  daysLogged: number;
  checksCount: number;
  today: Record<EnergySlot, EnergyLevel | null>;
  slots: Record<EnergySlot, EnergySlotStat>;
  peak: EnergySlot | null;
  trough: EnergySlot | null;
  trendDelta: number;
}

export function buildEnergyAnalysis(entries: EnergyEntry[]): EnergyAnalysis {
  const now = new Date();
  const todayKey = energyLocalDayKey(now);
  const sevenAgo = energyLocalDayKey(new Date(now.getTime() - 6 * 86400000));
  const fourteenAgo = energyLocalDayKey(new Date(now.getTime() - 13 * 86400000));

  const todayEntry = entries.find(e => e.date === todayKey);
  const today: Record<EnergySlot, EnergyLevel | null> = {
    morning: todayEntry?.morning ?? null,
    midday: todayEntry?.midday ?? null,
    afternoon: todayEntry?.afternoon ?? null,
  };

  const recent = entries.filter(e => e.date >= sevenAgo && e.date <= todayKey);
  const prevWindow = entries.filter(e => e.date >= fourteenAgo && e.date < sevenAgo);

  const slots: Record<EnergySlot, EnergySlotStat> = {
    morning: { avg: 0, logged: 0 },
    midday: { avg: 0, logged: 0 },
    afternoon: { avg: 0, logged: 0 },
  };
  const daySet = new Set<string>();
  let checksCount = 0;
  let sum = 0;
  let count = 0;

  recent.forEach(entry => {
    daySet.add(entry.date);
    (['morning', 'midday', 'afternoon'] as EnergySlot[]).forEach(slot => {
      const v = energyLevelValue(entry[slot]);
      if (v === 0) return;
      slots[slot].avg += v;
      slots[slot].logged += 1;
      sum += v;
      count += 1;
      checksCount += 1;
    });
  });
  (['morning', 'midday', 'afternoon'] as EnergySlot[]).forEach(slot => {
    if (slots[slot].logged > 0) slots[slot].avg /= slots[slot].logged;
  });

  let prevSum = 0;
  let prevCount = 0;
  prevWindow.forEach(entry => {
    (['morning', 'midday', 'afternoon'] as EnergySlot[]).forEach(slot => {
      const v = energyLevelValue(entry[slot]);
      if (v > 0) {
        prevSum += v;
        prevCount += 1;
      }
    });
  });
  const avgAll = count > 0 ? sum / count : 0;
  const prevAvgAll = prevCount > 0 ? prevSum / prevCount : avgAll;

  const loggedSlots = (['morning', 'midday', 'afternoon'] as EnergySlot[]).filter(s => slots[s].logged > 0);
  let peak: EnergySlot | null = null;
  let trough: EnergySlot | null = null;
  if (loggedSlots.length > 0) {
    peak = loggedSlots.reduce((best, s) => (slots[s].avg > slots[best].avg ? s : best), loggedSlots[0]);
    trough = loggedSlots.reduce((worst, s) => (slots[s].avg < slots[worst].avg ? s : worst), loggedSlots[0]);
  }

  return {
    daysLogged: daySet.size,
    checksCount,
    today,
    slots,
    peak,
    trough,
    trendDelta: prevCount > 0 ? avgAll - prevAvgAll : 0,
  };
}

export function useEnergyAnalysis(): EnergyAnalysis {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick(t => t + 1);
    window.addEventListener(ENERGY_UPDATED_EVENT, handler);
    return () => window.removeEventListener(ENERGY_UPDATED_EVENT, handler);
  }, []);
  return useMemo(() => buildEnergyAnalysis(readEnergyHistory()), [tick]);
}