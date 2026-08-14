import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Battery } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ENERGY_UPDATED_EVENT } from '@/utils/energyStats';

type Slot = 'morning' | 'midday' | 'afternoon';
type Level = 'low' | 'medium' | 'high';

interface EnergyEntry {
  date: string;
  morning?: Level;
  midday?: Level;
  afternoon?: Level;
  evening?: Level;
  note?: string;
}

const STORAGE_KEY = 'energy_history';
const ENABLED_KEY = 'energyTrackerEnabled';
const DEFER_KEY_PREFIX = 'energy_midday_deferred_';

const SLOTS: Array<{ id: Slot; label: string; hour: number; checkLabel: string }> = [
  { id: 'morning', label: 'Morning', hour: 8, checkLabel: 'Morning Energy Check' },
  { id: 'midday', label: 'Midday', hour: 12, checkLabel: 'Midday Energy Check' },
  { id: 'afternoon', label: 'Afternoon', hour: 16, checkLabel: 'Afternoon Energy Check' },
];

const ENERGY_LEVELS: Array<{ value: Level; label: string; selected: string; dot: string }> = [
  { value: 'low', label: 'Low', selected: 'bg-red-500 text-white shadow-lg scale-105 border-red-500', dot: 'bg-red-500' },
  { value: 'medium', label: 'Medium', selected: 'bg-yellow-500 text-white shadow-lg scale-105 border-yellow-500', dot: 'bg-yellow-500' },
  { value: 'high', label: 'High', selected: 'bg-green-500 text-white shadow-lg scale-105 border-green-500', dot: 'bg-green-500' },
];

const localDayKey = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function loadHistory(): EnergyEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: EnergyEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(ENERGY_UPDATED_EVENT));
}

const isPremiumTier = (tier?: string) => tier === 'pro' || tier === 'premium';

const EnergyPopup: React.FC = () => {
  const { user } = useAuth();
  const [pendingSlots, setPendingSlots] = useState<Slot[]>([]);
  const [levels, setLevels] = useState<Record<Slot, Level>>({ morning: 'medium', midday: 'medium', afternoon: 'medium' });
  const lastHourRef = useRef(new Date().getHours());
  const [, setTick] = useState(0);

  const isEnabled = () => localStorage.getItem(ENABLED_KEY) !== 'false' && isPremiumTier(user?.subscriptionTier);
  const enabled = isEnabled();

  const getTodayEntry = useCallback((): EnergyEntry | null => {
    const today = localDayKey();
    const entries = loadHistory();
    const entry = entries.find(e => e.date === today);
    if (entry) return entry;
    return null;
  }, []);

  const computePending = useCallback((): Slot[] => {
    const now = new Date();
    const h = now.getHours();
    if (h < 8) return [];
    const entry = getTodayEntry();
    const completed = new Set<Slot>();
    if (entry) {
      if (entry.morning) completed.add('morning');
      if (entry.midday) completed.add('midday');
      if (entry.afternoon) completed.add('afternoon');
    }
    const deferred = localStorage.getItem(DEFER_KEY_PREFIX + localDayKey()) === 'true';
    const queue: Slot[] = [];
    if (!completed.has('morning')) queue.push('morning');
    if (!completed.has('midday')) {
      if (!deferred) queue.push('midday');
      else if (h >= 16) queue.push('midday');
    }
    if (!completed.has('afternoon') && h >= 16) queue.push('afternoon');
    return queue;
  }, [getTodayEntry]);

  const saveAll = useCallback(() => {
    const today = localDayKey();
    if (pendingSlots.length === 0) return;
    const entries = loadHistory();
    const existing = entries.find(e => e.date === today);
    const updated: EnergyEntry = {
      date: today,
      morning: existing?.morning,
      midday: existing?.midday,
      afternoon: existing?.afternoon,
      evening: existing?.evening,
      note: existing?.note,
    };
    pendingSlots.forEach(slot => { updated[slot] = levels[slot]; });
    const next = [...entries.filter(e => e.date !== today), updated].sort((a, b) => a.date.localeCompare(b.date));
    saveHistory(next);
    setPendingSlots([]);
  }, [pendingSlots, levels]);

  useEffect(() => {
    const tick = () => {
      if (!isEnabled()) {
        setPendingSlots([]);
        return;
      }
      const h = new Date().getHours();
      // Defers midday only if the morning check was still open when the clock
      // hit 12:00. A check opened at/after noon queues morning then midday as usual.
      if (pendingSlots.includes('morning') && h >= 12 && lastHourRef.current < 12) {
        localStorage.setItem(DEFER_KEY_PREFIX + localDayKey(), 'true');
      }
      lastHourRef.current = h;
      const pending = computePending();
      setPendingSlots(prev => {
        if (prev.length === pending.length && prev.every((s, i) => pending[i] === s)) return prev;
        return pending.length > 0 ? pending : [];
      });
      setTick(t => t + 1);
    };
    tick();
    const interval = setInterval(tick, 30000);
    return () => clearInterval(interval);
  }, [pendingSlots, computePending]);

  useEffect(() => {
    const today = localDayKey();
    // Reset stale defer flags when the day rolls over.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const entries: EnergyEntry[] = raw ? JSON.parse(raw) : [];
      const knownDates = new Set(entries.map(e => e.date));
      Object.keys(localStorage)
        .filter(k => k.startsWith(DEFER_KEY_PREFIX))
        .forEach(k => {
          const date = k.slice(DEFER_KEY_PREFIX.length);
          if (date !== today && !knownDates.has(date)) localStorage.removeItem(k);
        });
    } catch {
      // Ignore
    }
  }, [getTodayEntry, pendingSlots]);

  if (!enabled || pendingSlots.length === 0) return null;

  const today = localDayKey();
  const multiple = pendingSlots.length > 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" />
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Battery className="w-5 h-5 text-primary" />
          <h3 className="text-base font-bold text-foreground">
            {multiple ? 'Energy Check' : SLOTS.find(s => s.id === pendingSlots[0])?.checkLabel}
          </h3>
        </div>
        <p className="text-center text-sm text-muted-foreground mt-2 mb-5">
          {multiple
            ? 'How is your energy right now? Select a level for each check below.'
            : 'How is your energy right now?'}
        </p>

        <div className={multiple ? 'space-y-4' : ''}>
          {pendingSlots.map(slot => {
            const slotDef = SLOTS.find(s => s.id === slot);
            return (
              <div key={slot} className={multiple ? 'rounded-xl border border-border/70 bg-muted/20 p-4' : ''}>
                {multiple && (
                  <p className="text-center text-sm font-bold text-foreground mb-3">{slotDef?.checkLabel}</p>
                )}
                <div className="flex gap-3">
                  {ENERGY_LEVELS.map(level => {
                    const isSelected = levels[slot] === level.value;
                    return (
                      <button
                        key={level.value}
                        onClick={() => setLevels(prev => ({ ...prev, [slot]: level.value }))}
                        className={`flex-1 py-4 px-2 text-sm font-bold rounded-xl transition-all duration-200 border-2 ${
                          isSelected
                            ? level.selected
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted border-transparent hover:border-primary/20'
                        }`}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full mx-auto mb-2 ${isSelected ? 'bg-white/40' : level.dot}`} />
                        {level.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={saveAll}
          className="w-full py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98] mt-5"
        >
          Save{multiple ? ' All' : ''}
        </button>
        <p className="text-center text-[10px] text-muted-foreground/60 mt-2">
          Logged for {today}
        </p>
      </div>
    </div>
  );
};

export default EnergyPopup;