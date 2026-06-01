import React, { useState, useEffect } from 'react';
import { Battery, X, TrendingUp, Calendar, ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { useBoardContext } from '@/context/BoardContext';
import { rankTasksByOptimalTiming } from '@/utils/energyTaskScheduler';

interface EnergyEntry {
  date: string;
  morning: string;
  afternoon: string;
  evening: string;
  note: string;
}

const ENERGY_LEVELS = [
  { value: 'low', label: 'Low', color: 'bg-red-500', ring: 'ring-red-200' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-500', ring: 'ring-yellow-200' },
  { value: 'high', label: 'High', color: 'bg-green-500', ring: 'ring-green-200' },
];

const STORAGE_KEY = 'energy_history';
const LAST_PROMPT_KEY = 'energy_last_prompt';

function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

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
}

const EnergyPopup: React.FC = () => {
  const { board } = useBoardContext();
  const [showPopup, setShowPopup] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [morning, setMorning] = useState('high');
  const [afternoon, setAfternoon] = useState('high');
  const [evening, setEvening] = useState('low');
  const [note, setNote] = useState('');
  const [history, setHistory] = useState<EnergyEntry[]>(loadHistory);
  const [historyDate, setHistoryDate] = useState(getToday());
  const [recommendedTasks, setRecommendedTasks] = useState<any[]>([]);

  useEffect(() => {
    const today = getToday();
    const lastPrompt = localStorage.getItem(LAST_PROMPT_KEY);
    if (lastPrompt !== today) {
      const timer = setTimeout(() => setShowPopup(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Update recommendations when energy levels change
  useEffect(() => {
    if (board && board.tasks) {
      const incompleteTasks = board.tasks.filter(task => !task.completed);
      const energySettings = {
        energyMorning: morning as 'low' | 'medium' | 'high',
        energyAfternoon: afternoon as 'low' | 'medium' | 'high',
        energyEvening: evening as 'low' | 'medium' | 'high',
      };
      
      const rankedTasks = rankTasksByOptimalTiming(incompleteTasks, energySettings);
      setRecommendedTasks(rankedTasks.slice(0, 3)); // Show top 3 recommendations
    }
  }, [morning, afternoon, evening, board]);

  const saveEntry = () => {
    const today = getToday();
    const entries = history.filter(e => e.date !== today);
    const entry: EnergyEntry = { date: today, morning, afternoon, evening, note };
    const next = [...entries, entry].sort((a, b) => a.date.localeCompare(b.date));
    saveHistory(next);
    setHistory(next);
    localStorage.setItem(LAST_PROMPT_KEY, today);
    setShowPopup(false);
  };

  const skipToday = () => {
    localStorage.setItem(LAST_PROMPT_KEY, getToday());
    setShowPopup(false);
  };

  const navigateHistory = (dir: number) => {
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const idx = sorted.findIndex(e => e.date === historyDate);
    const next = sorted[idx + dir];
    if (next) setHistoryDate(next.date);
  };

  const selectedEntry = history.find(e => e.date === historyDate);

  if (!showPopup && !showHistory) return null;

  if (showHistory) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-background/90 backdrop-blur-lg" onClick={() => setShowHistory(false)} />
        <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 animate-in zoom-in-95">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Energy History
            </h3>
            <button onClick={() => setShowHistory(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between mb-4">
            <button onClick={() => navigateHistory(-1)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30" disabled={!history.some(e => e.date < historyDate)}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              {historyDate}
            </div>
            <button onClick={() => navigateHistory(1)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground disabled:opacity-30" disabled={!history.some(e => e.date > historyDate)}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {selectedEntry ? (
            <div className="space-y-3">
              {(['morning', 'afternoon', 'evening'] as const).map(period => {
                const level = ENERGY_LEVELS.find(l => l.value === (selectedEntry as any)[period]) || ENERGY_LEVELS[1];
                return (
                  <div key={period} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                    <span className="text-sm font-medium text-foreground capitalize">{period}</span>
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${level.color}`} />
                      <span className="text-sm text-muted-foreground">{level.label}</span>
                    </div>
                  </div>
                );
              })}
              {selectedEntry.note && (
                <div className="p-3 bg-muted/30 rounded-xl text-sm text-muted-foreground">
                  {selectedEntry.note}
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground py-8">No entry for this date.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-background/90 backdrop-blur-lg" />
      <div className="relative w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 animate-in zoom-in-95">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Battery className="w-5 h-5 text-primary" />
            Daily Energy Check
          </h3>
          <button onClick={skipToday} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground mb-4">How is your energy today? This helps us understand your productivity patterns.</p>

        <div className="space-y-4 mb-4">
          {[
            { label: 'Morning', value: morning, set: setMorning },
            { label: 'Afternoon', value: afternoon, set: setAfternoon },
            { label: 'Evening', value: evening, set: setEvening },
          ].map(period => (
            <div key={period.label}>
              <label className="text-sm font-medium text-foreground mb-3 block">{period.label}</label>
              <div className="flex gap-3">
                {ENERGY_LEVELS.map(level => (
                  <button
                    key={level.value}
                    onClick={() => period.set(level.value)}
                    className={`flex-1 py-3 px-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                      period.value === level.value
                        ? `${level.color} text-white shadow-lg scale-105 border-2 border-transparent`
                        : 'bg-muted/50 text-muted-foreground hover:bg-muted border-2 border-transparent hover:border-primary/20'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full mx-auto mb-2 ${
                      period.value === level.value ? 'bg-white/30' : level.color
                    }`} />
                    {level.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Task Recommendations Based on Energy Levels */}
        {recommendedTasks.length > 0 && (
          <div className="mb-4 p-3 bg-primary/5 border border-primary/10 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Task Suggestions</span>
            </div>
            <p className="text-xs text-muted-foreground mb-2">Tasks you should tackle during your peak energy times:</p>
            <ul className="space-y-1">
              {recommendedTasks.map((task, idx) => (
                <li key={idx} className="text-xs text-foreground flex items-start">
                  <span className="mr-2">•</span>
                  <span className="truncate">{task.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Any notes about your energy today? (optional)"
          className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all mb-4"
          rows={2}
        />

        <div className="flex gap-3">
          <button
            onClick={() => { setShowHistory(true); }}
            className="px-4 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all flex items-center gap-2"
          >
            <TrendingUp className="w-4 h-4" />
            History
          </button>
          <button
            onClick={saveEntry}
            className="flex-1 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-95"
          >
            Save Energy Log
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnergyPopup;