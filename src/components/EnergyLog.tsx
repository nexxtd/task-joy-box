import React, { useState, useEffect, useCallback } from 'react';
import { Zap, Sun, Coffee, Moon, Loader2 } from 'lucide-react';
import { ENERGY_STORAGE_KEY, ENERGY_UPDATED_EVENT, EnergyLevel, EnergySlot } from '@/utils/energyStats';
import { useLanguage } from '@/context/LanguageContext';

interface EnergyEntry {
  date: string;
  morning?: EnergyLevel;
  midday?: EnergyLevel;
  afternoon?: EnergyLevel;
  evening?: EnergyLevel;
}

const SLOT_META: { key: EnergySlot; label: string; timeHint: string; icon: React.ReactNode }[] = [
  { key: 'morning', label: 'Morning', timeHint: '8:00 AM', icon: <Sun className="w-3.5 h-3.5 text-amber-500" /> },
  { key: 'midday', label: 'Midday', timeHint: '12:00 PM', icon: <Coffee className="w-3.5 h-3.5 text-orange-500" /> },
  { key: 'afternoon', label: 'Afternoon', timeHint: '4:00 PM', icon: <Moon className="w-3.5 h-3.5 text-indigo-500" /> },
];

const LEVEL_OPTIONS: Array<{ value: EnergyLevel; label: string; dot: string }> = [
  { value: 'low', label: 'Low', dot: 'bg-red-500' },
  { value: 'medium', label: 'Medium', dot: 'bg-yellow-500' },
  { value: 'high', label: 'High', dot: 'bg-green-500' },
];

const LEVEL_COLORS: Record<string, string> = {
  low: 'bg-red-500',
  medium: 'bg-yellow-500',
  high: 'bg-green-500',
};

function localDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mergeEnergyLists(localList: EnergyEntry[], remoteList: EnergyEntry[]): EnergyEntry[] {
  const map = new Map<string, EnergyEntry>();
  for (const item of localList) {
    if (item?.date) map.set(item.date, { ...item });
  }
  for (const item of remoteList) {
    if (!item?.date) continue;
    const prev = map.get(item.date) || { date: item.date };
    map.set(item.date, {
      date: item.date,
      morning: item.morning || prev.morning,
      midday: item.midday || prev.midday,
      afternoon: item.afternoon || prev.afternoon,
      evening: prev.evening || prev.evening,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

const EnergyLog: React.FC = () => {
  const { language, t } = useLanguage();
  const [entries, setEntries] = useState<EnergyEntry[]>([]);
  const [syncing, setSyncing] = useState(true);
  const [savingSlot, setSavingSlot] = useState<string | null>(null);

  const readLocal = useCallback((): EnergyEntry[] => {
    try {
      const raw = localStorage.getItem(ENERGY_STORAGE_KEY);
      if (!raw) return [];
      const parsed: EnergyEntry[] = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter(e => e && e.date && (e.morning || e.midday || e.afternoon || e.evening))
        : [];
    } catch {
      return [];
    }
  }, []);

  const applyLocalEntries = useCallback(() => {
    const localList = readLocal();
    setEntries([...localList].sort((a, b) => b.date.localeCompare(a.date)));
  }, [readLocal]);

  useEffect(() => {
    applyLocalEntries();
    let cancelled = false;
    (async () => {
      try {
        const localList = readLocal();
        const res = localList.length > 0
          ? await fetch('/api/energy/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ entries: localList }),
            })
          : await fetch('/api/energy', { credentials: 'include' });

        if (!cancelled && res.ok) {
          const data = await res.json();
          const remoteGrouped: EnergyEntry[] = Array.isArray(data?.grouped) ? data.grouped : [];
          const merged = mergeEnergyLists(localList, remoteGrouped);
          try {
            localStorage.setItem(ENERGY_STORAGE_KEY, JSON.stringify(merged));
            window.dispatchEvent(new Event(ENERGY_UPDATED_EVENT));
          } catch { /* ignore storage failure */ }
          setEntries([...merged].filter(e => e.morning || e.midday || e.afternoon || e.evening).sort((a, b) => b.date.localeCompare(a.date)));
        }
      } catch {
        /* keep local entries when offline */
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();

    const onUpdated = () => applyLocalEntries();
    window.addEventListener(ENERGY_UPDATED_EVENT, onUpdated);
    window.addEventListener('storage', onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(ENERGY_UPDATED_EVENT, onUpdated);
      window.removeEventListener('storage', onUpdated);
    };
  }, [applyLocalEntries, readLocal]);

  const today = localDayKey();
  const todayEntry = entries.find(e => e.date === today);

  const handleQuickLog = async (slot: EnergySlot, level: EnergyLevel) => {
    setSavingSlot(slot);
    try {
      const current = readLocal();
      const existing = current.find(e => e.date === today) || { date: today };
      const updated: EnergyEntry = { ...existing, [slot]: level };
      const next = [...current.filter(e => e.date !== today), updated].sort((a, b) => a.date.localeCompare(b.date));
      localStorage.setItem(ENERGY_STORAGE_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event(ENERGY_UPDATED_EVENT));
      setEntries([...next].reverse());

      await fetch('/api/energy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ date: today, timeSlot: slot, energyLevel: level }),
      });
    } catch {
      /* optimistic local entry already saved */
    } finally {
      setSavingSlot(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-foreground">{t("Log today's energy")}</p>
            <p className="text-[11px] text-muted-foreground">{t('Quick check-in updates both your History and Energy Levels AI analysis.')}</p>
          </div>
          {syncing && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {SLOT_META.map(slot => {
            const selected = todayEntry?.[slot.key];
            return (
              <div key={slot.key} className="bg-card border border-border/80 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    {slot.icon}
                    {t(slot.label)}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{slot.timeHint}</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {LEVEL_OPTIONS.map(opt => {
                    const active = selected === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={savingSlot === slot.key}
                        onClick={() => handleQuickLog(slot.key, opt.value)}
                        className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                          active
                            ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                            : 'bg-muted/40 text-muted-foreground border-border/70 hover:text-foreground hover:bg-muted'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-primary-foreground' : opt.dot}`} />
                        <span>{t(opt.label)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Zap className="w-6 h-6 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground">{t('No energy logs yet')}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('Use the check-in bar above or complete daily energy popups to see your log here.')}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {entries.map(entry => {
            const dateObj = new Date(entry.date.includes('T') ? entry.date : `${entry.date}T00:00:00`);
            const dateStr = !isNaN(dateObj.getTime())
              ? dateObj.toLocaleDateString(language && language !== 'en' ? language : undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
              : entry.date;
            return (
              <div key={entry.date} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-medium text-foreground">
                  {dateStr}
                </p>
                <div className="flex gap-2 flex-wrap">
                  {SLOT_META.map(slot => {
                    const level = entry[slot.key];
                    if (!level) return null;
                    const levelLabel = level === 'low' ? 'Low' : level === 'medium' ? 'Medium' : 'High';
                    return (
                      <span
                        key={slot.key}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        <span className={`w-2 h-2 rounded-full ${LEVEL_COLORS[level] || 'bg-muted'}`} />
                        {slot.icon}
                        {t(slot.label)}: <span className="text-foreground capitalize">{t(levelLabel)}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EnergyLog;
