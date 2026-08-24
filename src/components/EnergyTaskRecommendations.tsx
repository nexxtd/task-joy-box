import { Zap, Clock, Lock, Settings, TrendingUp, Calendar } from 'lucide-react';
import { Task, PRIORITY_CONFIG } from '@/types/board';
import { ENERGY_SLOTS, EnergySlot, useEnergyAnalysis, isEnergyTrackerEnabled, isEnergyPremiumTier } from '@/utils/energyStats';

interface EnergyTaskRecommendationsProps {
  tasks: Task[];
  tier?: string;
  onUpgrade?: () => void;
}

type Intensity = 'deep' | 'steady' | 'light';

interface RankedTask {
  task: Task;
  slot: EnergySlot;
  intensity: Intensity;
  reason: string;
}

const INTENSITY_RANK: Record<Intensity, number> = { deep: 0, steady: 1, light: 2 };
const PRIORITY_VALUE: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1, none: 0 };

const getIntensity = (priority?: string): Intensity =>
  priority === 'urgent' || priority === 'high'
    ? 'deep'
    : priority === 'medium'
      ? 'steady'
      : 'light';

const slotGradient = (accent: string) =>
  `linear-gradient(135deg, hsl(var(--${accent})) 0%, hsl(var(--${accent}) / 0.72) 130%)`;

const EnergyTaskRecommendations: React.FC<EnergyTaskRecommendationsProps> = ({
  tasks,
  tier,
  onUpgrade,
}) => {
  const analysis = useEnergyAnalysis();
  const enabled = isEnergyTrackerEnabled();
  const premium = isEnergyPremiumTier(tier);
  const openTasks = tasks.filter(t => !t.completed);
  const peak = analysis.peak ? ENERGY_SLOTS.find(s => s.id === analysis.peak) : null;
  const trough = analysis.trough ? ENERGY_SLOTS.find(s => s.id === analysis.trough) : null;

  const ranked: RankedTask[] = openTasks.map(task => {
    const intensity = getIntensity(task.priority);
    let slot: EnergySlot | null = null;
    let reason = '';

    if (intensity === 'deep') {
      slot = peak ? peak.id : (['morning', 'midday', 'afternoon'] as EnergySlot[]).find(s => analysis.slots[s].logged > 0) ?? null;
      const meta = slot ? ENERGY_SLOTS.find(s => s.id === slot) : null;
      reason = meta
        ? `Logs show you're strongest here (${meta.window}) — save this task for your peak window.`
        : 'Once energy logs build up, your strongest tasks will be scheduled into your peak window.';
    } else if (intensity === 'steady') {
      const steady = (['morning', 'midday', 'afternoon'] as EnergySlot[]).find(
        s => analysis.slots[s].avg >= 2 && analysis.slots[s].logged > 0
      );
      slot = steady ?? (peak ? peak.id : null);
      const meta = slot ? ENERGY_SLOTS.find(s => s.id === slot) : null;
      reason = meta
        ? `Steady-focus work fits your ${meta.label.toLowerCase()} window (${meta.window}) — solid energy without peak demand.`
        : 'A medium-energy slot will show up here once you log a few checks.';
    } else {
      slot = trough && trough.id !== peak?.id ? trough.id : peak ? peak.id : 'afternoon';
      const meta = ENERGY_SLOTS.find(s => s.id === slot);
      reason = peak
        ? `Light work fits ${meta?.label.toLowerCase()} (${meta?.window}) — keep your peak window free for demanding tasks.`
        : 'Low-energy work can land in any window once logs exist.';
    }

    return { task, slot, intensity, reason };
  }).sort((a, b) => {
    const i = INTENSITY_RANK[a.intensity] - INTENSITY_RANK[b.intensity];
    if (i !== 0) return i;
    const p = PRIORITY_VALUE[b.task.priority ?? 'none'] - PRIORITY_VALUE[a.task.priority ?? 'none'];
    if (p !== 0) return p;
    return (a.task.dueDate || '').localeCompare(b.task.dueDate || '');
  });

  if (!premium) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
        <div className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center">
          <Lock className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-[11px] font-bold text-foreground uppercase tracking-wide">Premium feature</p>
        <p className="text-xs text-muted-foreground max-w-[230px] leading-snug">
          Daily energy checks at 8am, 12pm and 4pm reveal your peak windows — unlock them with Premium.
        </p>
        {onUpgrade && (
          <button
            onClick={onUpgrade}
            className="mt-1 px-4 py-2 text-xs font-bold text-white rounded-lg bg-primary hover:bg-primary/90 transition-all"
          >
            Upgrade
          </button>
        )}
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
        <div className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center">
          <Settings className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-[11px] font-bold text-foreground uppercase tracking-wide">Energy Tracker is off</p>
        <p className="text-xs text-muted-foreground max-w-[230px] leading-snug">
          Turn on the Energy Tracker in Settings — your 8am, 12pm and 4pm checks power these recommendations.
        </p>
      </div>
    );
  }

  if (analysis.daysLogged === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
        <div className="w-9 h-9 rounded-full bg-muted/60 flex items-center justify-center">
          <Zap className="w-4 h-4 text-muted-foreground" />
        </div>
        <p className="text-[11px] font-bold text-foreground uppercase tracking-wide">No energy logs yet</p>
        <p className="text-xs text-muted-foreground max-w-[240px] leading-snug">
          Complete the 8am, 12pm and 4pm energy checks and your top tasks will be scheduled into your strongest windows here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {peak && (
        <div
          className="p-3 rounded-xl text-white"
          style={{ background: slotGradient(peak.accent), boxShadow: '0 10px 24px -16px hsl(228 25% 25% / 0.5)' }}
        >
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/20">
              <Zap className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-wide opacity-90">Peak window</p>
              <p className="text-sm font-black leading-tight truncate">
                {peak.label} · {peak.window}
              </p>
            </div>
            <span className="ml-auto text-[10px] font-bold bg-white/20 rounded-full px-2 py-0.5 shrink-0">
              {analysis.slots[peak.id].avg.toFixed(1)}/3 avg
            </span>
          </div>
          <p className="text-[10px] text-white/90 leading-snug mt-1.5">
            Schedule urgent and high-priority work here — {analysis.slots[peak.id].logged} check
            {analysis.slots[peak.id].logged !== 1 ? 's' : ''} logged in the last 7 days.
          </p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {ENERGY_SLOTS.map(s => {
          const level = analysis.today[s.id];
          const hour = new Date().getHours();
          const pending = level === null && hour >= s.hour;
          return (
            <div
              key={s.id}
              className="rounded-xl px-2 py-1.5 text-center"
              style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}
            >
              <p className="text-[9px] font-black uppercase tracking-wide text-muted-foreground">{s.label}</p>
              {level ? (
                <p
                  className="text-[10px] font-bold mt-0.5"
                  style={{ color: level === 'high' ? 'hsl(var(--label-green))' : level === 'medium' ? 'hsl(var(--label-yellow))' : 'hsl(var(--label-red))' }}
                >
                  {level[0].toUpperCase() + level.slice(1)}
                </p>
              ) : (
                <p className={`text-[10px] mt-0.5 ${pending ? 'text-primary font-semibold' : 'text-muted-foreground/50'}`}>
                  {pending ? 'Pending' : '—'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {ranked.length === 0 ? (
        <div className="py-5 text-center">
          <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-2">
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No open tasks to schedule</p>
          <p className="text-xs text-muted-foreground/70 mt-1">Add tasks and they will be ranked by energy here.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {ranked.slice(0, 5).map(({ task, slot, intensity, reason }) => {
            const meta = ENERGY_SLOTS.find(s => s.id === slot);
            const cfg = task.priority !== 'none' ? PRIORITY_CONFIG[task.priority] : null;
            return (
              <div key={task.id} className="p-2.5 rounded-lg" style={{ background: 'hsl(var(--muted) / 0.35)', border: '1px solid hsl(var(--border))' }}>
                <div className="flex items-center gap-2">
                  {cfg && (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${cfg.className} text-primary-foreground shrink-0`}>
                      {cfg.label}
                    </span>
                  )}
                  <span className="flex-1 min-w-0 text-xs font-semibold text-foreground truncate">{task.title}</span>
                </div>
                {meta && (
                  <div className="mt-1.5 flex items-start gap-1.5">
                    <span
                      className="mt-0.5 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold text-white shrink-0"
                      style={{ background: slotGradient(meta.accent) }}
                    >
                      <Clock className="w-2.5 h-2.5" /> {meta.label} · {meta.window}
                    </span>
                    <p className="text-[10px] text-muted-foreground leading-snug">{reason}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <Calendar className="w-3 h-3" />
        {analysis.daysLogged} day{analysis.daysLogged !== 1 ? 's' : ''} logged ·{' '}
        {analysis.trendDelta >= 0.15
          ? `energy up ${analysis.trendDelta.toFixed(1)}/3 over the last two weeks`
          : analysis.trendDelta <= -0.15
            ? `energy down ${(-analysis.trendDelta).toFixed(1)}/3 over the last two weeks`
            : 'energy steady over the last two weeks'}
      </p>
      <div className="p-2.5 rounded-lg bg-primary/5 border border-primary/10">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          <span className="font-bold text-foreground">Premium insight:</span> {peak ? `Your ${peak.label.toLowerCase()} peak (${analysis.slots[peak.id].avg.toFixed(1)}/3) suggests deep work belongs in ${peak.window} — trough in ${trough ? trough.label.toLowerCase() : 'your low slot'} should handle light tasks.` : 'Log all three daily checks for a week to reveal a stable peak window.'}
        </p>
        <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
          <span>{analysis.daysLogged}/7 logged</span>
          <span>·</span>
          <span>{analysis.slots.morning.logged + analysis.slots.midday.logged + analysis.slots.afternoon.logged} checks</span>
          <span className="ml-auto font-bold text-foreground">{peak ? `${peak.label} peak` : 'building'}</span>
        </div>
      </div>
    </div>
  );
};

export default EnergyTaskRecommendations;