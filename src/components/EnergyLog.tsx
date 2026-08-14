import React, { useState, useEffect } from 'react';
import { Zap, Sun, Coffee, Moon } from 'lucide-react';

interface EnergyEntry {
  date: string;
  morning?: 'low' | 'medium' | 'high';
  midday?: 'low' | 'medium' | 'high';
  afternoon?: 'low' | 'medium' | 'high';
  evening?: 'low' | 'medium' | 'high';
}

const STORAGE_KEY = 'energy_history';

const SLOT_META: Array<{ key: 'morning' | 'midday' | 'afternoon'; label: string; icon: React.ReactNode; color: string }> = [
  { key: 'morning', label: 'Morning', icon: <Sun className="w-3 h-3" />, color: 'bg-blue-500' },
  { key: 'midday', label: 'Midday', icon: <Coffee className="w-3 h-3" />, color: 'bg-amber-500' },
  { key: 'afternoon', label: 'Afternoon', icon: <Moon className="w-3 h-3" />, color: 'bg-green-500' },
];

const LEVEL_COLORS: Record<string, string> = {
  low: 'bg-red-500',
  medium: 'bg-yellow-500',
  high: 'bg-green-500',
};

const EnergyLog: React.FC = () => {
  const [entries, setEntries] = useState<EnergyEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: EnergyEntry[] = JSON.parse(raw);
        const withLogs = parsed.filter(e => e.morning || e.midday || e.afternoon);
        setEntries([...withLogs].reverse());
      }
    } catch {
      // Ignore
    }
  }, []);

  if (entries.length === 0) {
    return (
      <div className="text-center py-10">
        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <Zap className="w-6 h-6 text-primary" />
        </div>
        <p className="text-sm font-medium text-foreground">No energy logs yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Complete the daily energy checks and your log will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(entry => (
        <div key={entry.date} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">
            {new Date(entry.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
          <div className="flex gap-2">
            {SLOT_META.map(slot => {
              const level = entry[slot.key];
              if (!level) return null;
              return (
                <span
                  key={slot.key}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  <span className={`w-2 h-2 rounded-full ${LEVEL_COLORS[level]}`} />
                  {slot.icon}
                  {slot.label}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default EnergyLog;