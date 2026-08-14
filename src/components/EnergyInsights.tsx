import React, { useState, useEffect } from 'react';
import { TrendingUp, Sun, Coffee, Moon, Sparkles, Calendar } from 'lucide-react';

interface EnergyEntry {
  date: string;
  morning?: 'low' | 'medium' | 'high';
  midday?: 'low' | 'medium' | 'high';
  afternoon?: 'low' | 'medium' | 'high';
  evening?: 'low' | 'medium' | 'high';
}

const STORAGE_KEY = 'energy_history';

const numeric = (level?: string): number =>
  level === 'high' ? 3 : level === 'medium' ? 2 : level === 'low' ? 1 : 0;

const levelOf = (avg: number): 'low' | 'medium' | 'high' =>
  avg >= 2.5 ? 'high' : avg >= 1.5 ? 'medium' : 'low';

const levelColor = (avg: number): string =>
  avg >= 2.5 ? 'text-green-500' : avg >= 1.5 ? 'text-yellow-500' : 'text-red-500';

const SLOT_ICONS: Record<string, React.ReactNode> = {
  morning: <Sun className="w-5 h-5 text-yellow-500" />,
  midday: <Coffee className="w-5 h-5 text-amber-500" />,
  afternoon: <Moon className="w-5 h-5 text-blue-500" />,
};

const EnergyInsights: React.FC = () => {
  const [entries, setEntries] = useState<EnergyEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setEntries(JSON.parse(raw));
    } catch {
      // Ignore
    }
  }, []);

  const avg = (slot: 'morning' | 'midday' | 'afternoon') => {
    const logged = entries.map(e => numeric(e[slot])).filter(v => v > 0);
    if (logged.length === 0) return 0;
    return logged.reduce((a, b) => a + b, 0) / logged.length;
  };

  const morningAvg = avg('morning');
  const middayAvg = avg('midday');
  const afternoonAvg = avg('afternoon');

  const peak = [
    { slot: 'morning', avg: morningAvg, label: 'morning' },
    { slot: 'midday', avg: middayAvg, label: 'midday' },
    { slot: 'afternoon', avg: afternoonAvg, label: 'afternoon' },
  ].reduce((best, cur) => (cur.avg > best.avg ? cur : best), { slot: 'morning', avg: 0, label: 'morning' });

  const last30 = entries.filter(e => {
    const d = new Date(e.date);
    return !Number.isNaN(d.getTime()) && Date.now() - d.getTime() < 30 * 24 * 60 * 60 * 1000;
  });
  const daysTracked = last30.length;
  const fullDays = last30.filter(e => e.morning && e.midday && e.afternoon).length;
  const consistency = daysTracked === 0 ? 0 : fullDays / daysTracked;

  const recommendation =
    peak.avg >= 2.5
      ? `Your energy peaks during the ${peak.label}. Schedule your most demanding, deep-work tasks then, and keep routine work for lower-energy periods.`
      : 'Your energy stays fairly balanced. Pair high-priority tasks with a quick reset break to keep momentum through the day.';

  const slotsLogged = [morningAvg, middayAvg, afternoonAvg].filter(v => v > 0).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {(['morning', 'midday', 'afternoon'] as const).map(slot => (
          <div key={slot} className="bg-card border border-border rounded-xl p-4 text-center">
            <div className="flex items-center justify-center mx-auto mb-2">{SLOT_ICONS[slot]}</div>
            <p className="text-xs text-muted-foreground mb-1 capitalize">{slot}</p>
            <p className={`text-lg font-bold ${levelColor(avg(slot))}`}>
              {avg(slot) > 0 ? levelOf(avg(slot)) : '—'}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {avg(slot) > 0 ? `Avg ${avg(slot).toFixed(1)}/3` : 'No logs yet'}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <div className="p-3 bg-muted/30 rounded-lg">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Sun className="w-3.5 h-3.5 text-yellow-500" />
            Peak Energy Times
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {slotsLogged === 0
              ? 'Log your energy at the morning, midday and afternoon checks to unlock peak-time insights.'
              : peak.avg > 0
                ? `Your highest energy levels occur during the ${peak.label}. Schedule your most challenging tasks during these periods.`
                : 'Your highest energy levels occur in the morning. Schedule your most challenging tasks during these periods.'}
          </p>
        </div>

        <div className="p-3 bg-muted/30 rounded-lg">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            Energy Consistency
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {daysTracked === 0
              ? 'Start logging to measure how consistent your energy is across the day.'
              : consistency >= 0.5
                ? `You logged all three checks on ${fullDays} of your last ${daysTracked} days. Your energy pattern is consistent — plan around it.`
                : `You logged all three checks on ${fullDays} of your last ${daysTracked} days. Your energy varies more day to day — try sticking to a fixed sleep and work rhythm.`}
          </p>
        </div>

        <div className="p-3 bg-muted/30 rounded-lg">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            Recommendations
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {slotsLogged === 0
              ? 'Complete the three daily energy checks so MyPlanner can suggest the best times for demanding tasks.'
              : recommendation}
          </p>
        </div>

        <div className="p-3 bg-muted/30 rounded-lg">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-blue-500" />
            Tracking Streak
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            You logged energy on {daysTracked} of the last 30 days.
          </p>
        </div>
      </div>
    </div>
  );
};

export default EnergyInsights;