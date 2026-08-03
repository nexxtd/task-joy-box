import { useState, useEffect, useMemo } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import {
  CheckSquare, TrendingUp, AlertTriangle, Clock, BarChart3,
  Sparkles, Bot, Loader2, X, RefreshCw, Lock,
  Flame, Sun, Sunrise, Sunset, ChevronRight,
  Target, Zap
} from 'lucide-react';

type TimeRange = 'day' | 'week' | 'month';

const COLORS = {
  urgent: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
  primary: 'hsl(var(--primary))',
  muted: 'hsl(var(--muted))',
  border: 'hsl(var(--border))',
};

function PremiumBlur({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative group">
      <div className="blur-sm select-none pointer-events-none">{children}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider bg-card/80 px-2 py-0.5 rounded">Premium</span>
        </div>
        <a href="/pricing" className="text-xs text-primary hover:underline font-medium">Upgrade</a>
      </div>
    </div>
  );
}

function CircularProgress({ value, size = 96 }: { value: number; size?: number }) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (value / 100) * circumference;
  return (
    <svg width={size} height={size} className="-rotate-90" viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="6"
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        className="transition-all duration-1000 ease-out" />
    </svg>
  );
}

function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let cumulative = 0;
  const slices = segments.filter(s => s.value > 0).map(s => {
    const startAngle = (cumulative / total) * 360;
    cumulative += s.value;
    const endAngle = (cumulative / total) * 360;
    return { ...s, startAngle, endAngle };
  });

  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 60;

  function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(cx: number, cy: number, r: number, start: number, end: number) {
    const s = polarToCartesian(cx, cy, r, end);
    const e = polarToCartesian(cx, cy, r, start);
    const large = end - start > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((s, i) => (
        <path key={i} d={describeArc(cx, cy, r, s.startAngle, s.endAngle)} fill={s.color} />
      ))}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="hsl(var(--card))" />
    </svg>
  );
}

function SimpleBarChart({ data, highlightIndex }: { data: { label: string; value: number; color?: string }[]; highlightIndex?: number }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1.5 h-28">
      {data.map((d, i) => {
        const h = Math.max((d.value / max) * 100, 4);
        const isHighlight = i === highlightIndex;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{d.value}</span>
            <div
              className={`w-full rounded-t ${isHighlight ? 'opacity-100' : 'opacity-50'}`}
              style={{
                height: `${h}%`,
                backgroundColor: d.color || (isHighlight ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'),
                minHeight: 4,
              }}
            />
            <span className="text-[10px] text-muted-foreground truncate w-full text-center">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function SimpleLineChart({ data, color = 'hsl(var(--primary))' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const w = 400;
  const h = 120;
  const padding = 24;
  const chartW = w - padding * 2;
  const chartH = h - padding * 2;

  if (data.length < 2) {
    return <div className="flex items-center justify-center h-[120px] text-xs text-muted-foreground">Not enough data</div>;
  }

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * chartW;
    const y = padding + chartH - (d.value / max) * chartH;
    return `${x},${y}`;
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p}`).join(' ');
  const fillPath = `${linePath} L ${padding + chartW},${padding + chartH} L ${padding},${padding + chartH} Z`;

  const isImproving = data.length >= 2 && data[data.length - 1].value < data[0].value;

  return (
    <div>
      <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        <path d={fillPath} fill={`${color}15`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => {
          const x = padding + (i / (data.length - 1)) * chartW;
          const y = padding + chartH - (d.value / max) * chartH;
          return <circle key={i} cx={x} cy={y} r="3" fill={color} />;
        })}
      </svg>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-muted-foreground">{data[0].label}</span>
        <span className="text-[10px] text-muted-foreground">{data[data.length - 1].label}</span>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <Icon className={`w-5 h-5 ${color} mb-3`} />
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

type AIData = {
  overallScore: number;
  scoreRationale?: string;
  contributors?: string[];
  penalties?: string[];
  focusArea: string;
  insights: string[];
  recommendations: string[];
};

const Insights: React.FC = () => {
  const { board } = useBoardContext();
  const { user } = useAuth();
  const isPro = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  const isPremium = user?.subscriptionTier === 'premium';

  const [aiData, setAiData] = useState<AIData | null>(null);
  const [loadingAI, setLoadingAI] = useState(false);
  const [showAIModal, setShowAIModal] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [streakDays, setStreakDays] = useState(0);
  const [weeklyRate, setWeeklyRate] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);

  const tasks = board?.tasks || [];
  const columns = board?.columns || [];

  const doneColIds = useMemo(() =>
    columns.filter(c => /done|completed|finish/i.test(c.title)).map(c => c.id),
    [columns]
  );

  const total = tasks.length;
  const completed = tasks.filter(t => doneColIds.includes(t.columnId)).length;
  const overdue = tasks.filter(t => t.dueDate && t.dueDate < new Date().toISOString().split('T')[0] && !doneColIds.includes(t.columnId)).length;
  const highPriority = tasks.filter(t => t.priority === 'urgent' || t.priority === 'high').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const columnStats = useMemo(() =>
    columns.map(col => ({
      name: col.title,
      count: tasks.filter(t => t.columnId === col.id).length,
      color: col.color || 'hsl(var(--primary))',
    })),
    [columns, tasks]
  );

  const priorityBreakdown = useMemo(() => {
    const counts: Record<string, number> = { urgent: 0, high: 0, medium: 0, low: 0 };
    tasks.forEach(t => { if (t.priority !== 'none') counts[t.priority] = (counts[t.priority] || 0) + 1; });
    const totalPriorities = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
    return [
      { label: 'Urgent', value: counts.urgent, color: COLORS.urgent, pct: Math.round((counts.urgent / totalPriorities) * 100) },
      { label: 'High', value: counts.high, color: COLORS.high, pct: Math.round((counts.high / totalPriorities) * 100) },
      { label: 'Medium', value: counts.medium, color: COLORS.medium, pct: Math.round((counts.medium / totalPriorities) * 100) },
      { label: 'Low', value: counts.low, color: COLORS.low, pct: Math.round((counts.low / totalPriorities) * 100) },
    ];
  }, [tasks]);

  const avgTimeToComplete = useMemo(() => {
    const completedWithDates = tasks.filter(t => doneColIds.includes(t.columnId) && t.createdAt);
    if (completedWithDates.length === 0) return { days: 0, hours: 0, display: '0 days', isHours: false };
    const totalMs = completedWithDates.reduce((sum, t) => {
      const created = new Date(t.createdAt).getTime();
      const completedAt = t.completedAt ? new Date(t.completedAt).getTime() : Date.now();
      return sum + (completedAt - created);
    }, 0);
    const avgDays = totalMs / completedWithDates.length / (1000 * 60 * 60 * 24);
    if (avgDays < 1) {
      const avgHours = Math.round(avgDays * 24);
      return { days: 0, hours: avgHours, display: `${avgHours}h`, isHours: true };
    }
    return { days: Math.round(avgDays), hours: 0, display: `${Math.round(avgDays)} day${Math.round(avgDays) !== 1 ? 's' : ''}`, isHours: false };
  }, [tasks, doneColIds]);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayData = useMemo(() => {
    const dayCount = Array(7).fill(0);
    tasks.forEach(t => {
      if (doneColIds.includes(t.columnId) && t.createdAt) {
        const d = new Date(t.createdAt);
        dayCount[d.getDay()]++;
      }
    });
    const max = Math.max(...dayCount, 1);
    const peakIdx = dayCount.indexOf(Math.max(...dayCount));
    return dayCount.map((val, i) => ({ label: dayLabels[i], value: val, isPeak: i === peakIdx }));
  }, [tasks, doneColIds]);

  const timeOfDayData = useMemo(() => {
    const times = { morning: 0, afternoon: 0, evening: 0 };
    tasks.forEach(t => {
      if (doneColIds.includes(t.columnId) && t.createdAt) {
        const h = new Date(t.createdAt).getHours();
        if (h < 12) times.morning++;
        else if (h < 17) times.afternoon++;
        else times.evening++;
      }
    });
    const maxVal = Math.max(times.morning, times.afternoon, times.evening, 1);
    const peak = ['morning', 'afternoon', 'evening'].find(k => times[k as keyof typeof times] === maxVal) as string;
    return [
      { label: 'Morning', value: times.morning, color: '#fbbf24', icon: Sunrise, peak: peak === 'morning' },
      { label: 'Afternoon', value: times.afternoon, color: '#f97316', icon: Sun, peak: peak === 'afternoon' },
      { label: 'Evening', value: times.evening, color: '#6366f1', icon: Sunset, peak: peak === 'evening' },
    ];
  }, [tasks, doneColIds]);

  const overdueTrendData = useMemo(() => {
    if (tasks.length === 0) return [];
    const now = new Date();
    const points: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const count = tasks.filter(t => t.dueDate && t.dueDate === dateStr && t.dueDate < now.toISOString().split('T')[0] && !doneColIds.includes(t.columnId)).length;
      points.push({ label: dayLabels[d.getDay()], value: count });
    }
    return points;
  }, [tasks, doneColIds]);

  const completedOverTimeData = useMemo(() => {
    const now = new Date();
    if (timeRange === 'day') {
      const points: { label: string; value: number }[] = [];
      for (let i = 23; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(d.getHours() - i);
        const hour = d.getHours();
        const count = tasks.filter(t => doneColIds.includes(t.columnId) && t.completedAt && new Date(t.completedAt).getHours() === hour && new Date(t.completedAt).toDateString() === now.toDateString()).length;
        points.push({ label: `${hour}:00`, value: count });
      }
      return points;
    } else if (timeRange === 'week') {
      const points: { label: string; value: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const count = tasks.filter(t => doneColIds.includes(t.columnId) && t.completedAt && new Date(t.completedAt).toISOString().split('T')[0] === dateStr).length;
        points.push({ label: dayLabels[d.getDay()], value: count });
      }
      return points;
    } else {
      const points: { label: string; value: number }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now);
        d.setMonth(d.getMonth() - i);
        const monthStr = d.toLocaleString('default', { month: 'short' });
        const count = tasks.filter(t => doneColIds.includes(t.columnId) && t.completedAt && new Date(t.completedAt).getMonth() === d.getMonth() && new Date(t.completedAt).getFullYear() === d.getFullYear()).length;
        points.push({ label: monthStr, value: count });
      }
      return points;
    }
  }, [tasks, doneColIds, timeRange]);

  const createdVsCompleted = useMemo(() => {
    const created = tasks.length;
    const completedCount = completed;
    const ratio = completedCount > 0 ? `${Math.round(created / completedCount)}:1` : `${created}:0`;
    let context = '';
    if (created > completedCount) context = 'You are creating tasks faster than you are completing them.';
    else if (created === completedCount) context = 'You are keeping up with your workload.';
    else context = 'You are staying ahead of your tasks!';
    return { created, completed: completedCount, ratio, context };
  }, [tasks, completed]);

  const focusTasks = useMemo(() => {
    const withDuration = tasks.filter(t => (t.duration || 0) > 0).sort((a, b) => (b.duration || 0) - (a.duration || 0));
    const totalMinutes = withDuration.reduce((s, t) => s + (t.duration || 0), 0);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return {
      totalDisplay: `${hours}h ${mins}m`,
      top3: withDuration.slice(0, 3).map(t => ({ title: t.title, duration: t.duration || 0 })),
    };
  }, [tasks]);

  useEffect(() => {
    const saved = localStorage.getItem('ta_insights_streak');
    let currentStreak = 0;
    let currentWeekly = 85;
    let currentLongest = 0;
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        currentStreak = parsed.current || 0;
        currentWeekly = parsed.weekly || 85;
        currentLongest = parsed.longest || 0;
        setStreakDays(currentStreak);
        setWeeklyRate(currentWeekly);
        setLongestStreak(currentLongest);
      } catch { /* ignore */ }
    }

    const today = new Date().toISOString().split('T')[0];
    const lastDate = localStorage.getItem('ta_insights_last_date');
    if (lastDate !== today && completed > 0) {
      const newStreak = lastDate && new Date(lastDate).getTime() === new Date(today).getTime() - 86400000 ? currentStreak + 1 : 1;
      const newLongest = Math.max(newStreak, currentLongest || 0);
      setStreakDays(newStreak);
      setLongestStreak(newLongest);
      localStorage.setItem('ta_insights_streak', JSON.stringify({ current: newStreak, weekly: currentWeekly, longest: newLongest }));
      localStorage.setItem('ta_insights_last_date', today);
    }
  }, [completed]);

  const buildFallbackAnalysis = (): AIData => {
    const today = new Date().toISOString().split('T')[0];
    const openTasks = tasks.filter(t => !doneColIds.includes(t.columnId));
    const overdueTasks = tasks.filter(t => t.dueDate && t.dueDate < today && !doneColIds.includes(t.columnId));
    const highOpen = openTasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
    const lowOpen = openTasks.filter(t => t.priority === 'low');
    const completedHigh = completed ? tasks.filter(t => doneColIds.includes(t.columnId) && (t.priority === 'urgent' || t.priority === 'high')) : [];

    const short = (t: (typeof tasks)[number]) => t.title.length > 40 ? `${t.title.slice(0, 40)}…` : t.title;

    let score = 50
      + Math.min(40, completed * 5)
      - Math.min(30, overdueTasks.length * 6)
      - Math.min(20, highOpen.length * 4)
      - Math.min(15, lowOpen.length * 2);
    score = Math.max(1, Math.min(99, score));

    const contributors: string[] = [];
    if (completed > 0) {
      contributors.push(`${completed} task${completed !== 1 ? 's' : ''} completed (${completionRate}%) — ${completed * 5} points`,);
      if (completedHigh.length > 0) {
        contributors.push(`High-priority win: "${short(completedHigh[0])}" was completed — matters more than lower-priority work`);
      }
    } else {
      contributors.push('No tasks completed yet — the score is currently held up entirely by a clean (non-overdue) workload.');
    }
    if (overdueTasks.length === 0) {
      contributors.push('No overdue tasks — nothing is being dragged down by missed deadlines.');
    }
    if (highPriority > 0 && highOpen.length === 0) {
      contributors.push('All urgent/high-priority tasks are handled.');
    }

    const penalties: string[] = [];
    overdueTasks.slice(0, 4).forEach(t => {
      penalties.push(`"${short(t)}" is overdue (was due ${t.dueDate}) — pulling the score down about 6 points.`);
    });
    if (overdueTasks.length > 4) {
      penalties.push(`${overdueTasks.length - 4} more overdue task${overdueTasks.length - 4 > 1 ? 's' : ''} each costing about 6 points.`);
    }
    highOpen.slice(0, 3).forEach(t => {
      penalties.push(`"${t.title}" is still open despite being ${t.priority} priority — about 4 points lost.`);
    });
    if (highOpen.length > 3) {
      penalties.push(`${highOpen.length - 3} more open ${highOpen[0]?.priority || 'high'}-priority task${highOpen.length - 3 > 1 ? 's' : ''} still pending.`);
    }
    if (lowOpen.length > 0) {
      const labels = lowOpen.slice(0, 3).map(t => `"${short(t)}"`).join(', ');
      penalties.push(`${lowOpen.length} low-priority task${lowOpen.length !== 1 ? 's' : ''} left open (${labels}${lowOpen.length > 3 ? '…' : ''}) — each worth about 2 points.`);
    }
    if (penalties.length === 0 && completed > 0) {
      penalties.push('Nothing critical is dragging the score down right now — keep the completion streak going.');
    }

    const insights: string[] = [
      `You have ${total} total task${total !== 1 ? 's' : ''} with ${completed} completed (${completionRate}%), spread across ${columns.length} column${columns.length !== 1 ? 's' : ''}.`,
      `${highPriority} task${highPriority !== 1 ? 's' : ''} marked urgent or high priority${highOpen.length > 0 ? `, ${highOpen.length} still open` : ' — all under control'}.`,
      overdueTasks.length > 0
        ? `${overdueTasks.length} task${overdueTasks.length > 1 ? 's' : ''} past due — "${short(overdueTasks[0])}" is the oldest, costing the most.`
        : 'No overdue tasks — deadlines are in good shape.',
    ];

    const recommendations: string[] = [
      overdueTasks.length > 0 ? `Clear overdue tasks first — starting with "${short(overdueTasks[0])}" — to recover lost points.` : 'Review your task list for anything that can be archived or consolidated.',
      highOpen.length > 0 ? `Finish open ${highOpen[0].priority}-priority tasks before moving to medium or low ones.` : 'Break larger tasks into smaller subtasks for better progress tracking.',
      'Set realistic deadlines and review them weekly.',
    ];

    return {
      overallScore: score,
      scoreRationale: `Starting from a neutral base of 50: ${completed} completions at +5 each${overdueTasks.length > 0 ? `, ${overdueTasks.length} overdue at −6 each` : ''}${highOpen.length > 0 ? `, ${highOpen.length} open urgent/high tasks at −4 each` : ''}${lowOpen.length > 0 ? `, ${lowOpen.length} open low-priority tasks at −2 each` : ''}. That lands the score at ${score}.`,
      contributors,
      penalties,
      focusArea: overdueTasks.length > 0
        ? `Deal with the ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} (like "${short(overdueTasks[0])}") first — they're draining the most score.`
        : highOpen.length > 0
          ? `Push the ${highOpen.length} open urgent/high-priority task${highOpen.length > 1 ? 's' : ''} to done to lift the score fastest.`
          : 'Keep completing tasks to sustain your momentum.',
      insights,
      recommendations,
    };
  };

  const handleAIAnalysis = async () => {
    setLoadingAI(true);
    try {
      const res = await fetch('/api/ai/analyze-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tasks: tasks.map(t => ({
            title: t.title,
            priority: t.priority,
            dueDate: t.dueDate,
            columnId: t.columnId,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setAiData({
          overallScore: Math.round(Number(data.overallScore) || 0),
          focusArea: data.focusArea || 'Focus on the most critical task',
          insights: Array.isArray(data.insights) ? data.insights : [],
          recommendations: Array.isArray(data.recommendations) ? data.recommendations : [],
          scoreRationale: typeof data.scoreRationale === 'string' ? data.scoreRationale : undefined,
          contributors: Array.isArray(data.contributors) ? data.contributors : undefined,
          penalties: Array.isArray(data.penalties) ? data.penalties : undefined,
        });
      } else {
        setAiData(buildFallbackAnalysis());
      }
    } catch {
      setAiData(buildFallbackAnalysis());
    } finally {
      setLoadingAI(false);
      setShowAIModal(true);
    }
  };

  const timeRangeToggles: { label: string; value: TimeRange }[] = [
    { label: 'Day', value: 'day' },
    { label: 'Week', value: 'week' },
    { label: 'Month', value: 'month' },
  ];

  const cardClasses = "bg-card border border-border rounded-xl p-5";

  return (
    <div className="flex-1 overflow-y-auto">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
        <h1 className="text-base font-bold text-foreground">Insights & Analytics</h1>
        <button
          onClick={handleAIAnalysis}
          disabled={loadingAI}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loadingAI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
          {loadingAI ? 'Analyzing...' : 'AI Analysis'}
        </button>
      </header>

      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Top stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <InfoCard icon={CheckSquare} label="Total Tasks" value={total} color="text-primary" />
          <InfoCard icon={TrendingUp} label="Completed" value={completed} color="text-green-500" />
          <InfoCard icon={AlertTriangle} label="Overdue" value={overdue} color="text-destructive" />
          <InfoCard icon={Clock} label="High Priority" value={highPriority} color="text-orange-500" />
        </div>

        {/* Task Distribution */}
        <div className={cardClasses}>
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Task Distribution
          </h2>
          <div className="space-y-3">
            {columnStats.map((col, i) => (
              <div key={col.name}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground font-medium">{col.name}</span>
                  <span className="text-xs text-muted-foreground">{col.count} tasks</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: total > 0 ? `${(col.count / total) * 100}%` : '0%', backgroundColor: col.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Completion Rate */}
        <div className={cardClasses}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Completion Rate</h2>
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <CircularProgress value={completionRate} />
              <span className="absolute text-lg font-bold text-foreground">{completionRate}%</span>
            </div>
            <div>
              <p className="text-sm text-foreground font-medium">{completed} of {total} tasks completed</p>
              <p className="text-xs text-muted-foreground mt-1">
                {completionRate >= 80 ? 'Keep up the great work!' : completionRate >= 50 ? 'Good progress, keep going!' : 'Every step counts — keep pushing!'}
              </p>
            </div>
          </div>
        </div>

        {/* Daily Habits */}
        <div className={cardClasses}>
          <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <CheckSquare className="w-4 h-4 text-green-500" /> Daily Habits
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="text-3xl font-bold text-green-500">{streakDays}</p>
              <p className="text-xs text-muted-foreground">Keep it going!</p>
            </div>
            <div className="p-4 bg-muted/30 rounded-lg">
              <p className="text-3xl font-bold text-primary">{weeklyRate || 85}%</p>
              <p className="text-xs text-muted-foreground">This week</p>
            </div>
          </div>
          {/* Longest Streak (premium) — inside Daily Habits, full width */}
          {isPremium ? (
            <div className="mt-4 pt-4 border-t border-border flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Flame className="w-5 h-5 text-orange-500" />
                <span className="text-2xl font-bold text-foreground">{longestStreak || streakDays}</span>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">longest streak ever</p>
                <p className="text-[11px] text-muted-foreground">All-time best</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 pt-4 border-t border-border">
              <PremiumBlur>
                <div className="flex items-center gap-3">
                  <Flame className="w-5 h-5 text-orange-500" />
                  <span className="text-2xl font-bold text-foreground">0</span>
                  <div>
                    <p className="text-xs font-medium text-foreground">longest streak ever</p>
                    <p className="text-[11px] text-muted-foreground">All-time best</p>
                  </div>
                </div>
              </PremiumBlur>
            </div>
          )}
        </div>

        {/* Tasks Completed Over Time (premium) */}
        {isPremium ? (
          <div className={cardClasses}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Tasks Completed Over Time</h2>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                {timeRangeToggles.map(t => (
                  <button key={t.value} onClick={() => setTimeRange(t.value)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${timeRange === t.value ? 'bg-card text-foreground font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <SimpleLineChart data={completedOverTimeData} color="hsl(var(--primary))" />
          </div>
        ) : (
          <div className={cardClasses}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Tasks Completed Over Time</h2>
              <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
                {timeRangeToggles.map(t => (
                  <span key={t.value} className="px-2.5 py-1 text-xs text-muted-foreground">{t.label}</span>
                ))}
              </div>
            </div>
            <PremiumBlur>
              <div className="h-32" />
            </PremiumBlur>
          </div>
        )}

        {/* Most Productive Day and Time (premium) */}
        {isPremium ? (
          <div className={`${cardClasses} grid grid-cols-1 md:grid-cols-2 gap-6`}>
            <div>
              <h3 className="text-xs font-semibold text-foreground mb-3">Most Productive Day</h3>
              <SimpleBarChart
                data={dayData.map(d => ({ label: d.label, value: d.value, color: d.isPeak ? 'hsl(var(--primary))' : undefined }))}
                highlightIndex={dayData.findIndex(d => d.isPeak)} />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-foreground mb-3">Most Productive Time</h3>
              <div className="space-y-2">
                {timeOfDayData.map(t => (
                  <div key={t.label} className={`flex items-center gap-3 p-2 rounded-lg ${t.peak ? 'bg-primary/10 border border-primary/20' : ''}`}>
                    <t.icon className={`w-4 h-4 ${t.peak ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div className="flex-1">
                      <div className="flex justify-between text-xs">
                        <span className={t.peak ? 'text-foreground font-medium' : 'text-muted-foreground'}>{t.label}</span>
                        <span className={t.peak ? 'text-foreground font-medium' : 'text-muted-foreground'}>{t.value} tasks</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${(t.value / Math.max(...timeOfDayData.map(x => x.value), 1)) * 100}%`, backgroundColor: t.peak ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }} />
                      </div>
                    </div>
                    {t.peak && <Zap className="w-3.5 h-3.5 text-primary shrink-0" />}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className={`${cardClasses} grid grid-cols-1 md:grid-cols-2 gap-6`}>
            <PremiumBlur>
              <h3 className="text-xs font-semibold text-foreground mb-3">Most Productive Day</h3>
              <div className="h-28" />
            </PremiumBlur>
            <PremiumBlur>
              <h3 className="text-xs font-semibold text-foreground mb-3">Most Productive Time</h3>
              <div className="space-y-2">
                {['Morning', 'Afternoon', 'Evening'].map(t => (
                  <div key={t} className="flex items-center gap-3 p-2 rounded-lg">
                    <span className="text-muted-foreground">{t}</span>
                  </div>
                ))}
              </div>
            </PremiumBlur>
          </div>
        )}

        {/* Average Time to Complete (premium) */}
        {isPremium ? (
          <div className={`${cardClasses} flex items-center gap-4`}>
            <Clock className="w-5 h-5 text-primary" />
            <div>
              <p className="text-2xl font-bold text-foreground">{avgTimeToComplete.display}</p>
              <p className="text-xs text-muted-foreground mt-1">{avgTimeToComplete.isHours ? 'hours on average' : 'days on average'}</p>
            </div>
          </div>
        ) : (
          <PremiumBlur>
            <div className={`${cardClasses} flex items-center gap-4`}>
              <Clock className="w-5 h-5 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">—</p>
                <p className="text-xs text-muted-foreground mt-1">{avgTimeToComplete.isHours ? 'hours on average' : 'days on average'}</p>
              </div>
            </div>
          </PremiumBlur>
        )}

        {/* Overdue Trends (premium) */}
        {isPremium ? (
          <div className={cardClasses}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Overdue Trends</h2>
              {overdueTrendData.length >= 2 && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${overdueTrendData[overdueTrendData.length - 1].value < overdueTrendData[0].value ? 'bg-green-500/10 text-green-600' : 'bg-destructive/10 text-destructive'}`}>
                  {overdueTrendData[overdueTrendData.length - 1].value < overdueTrendData[0].value ? 'Improving' : 'Needs attention'}
                </span>
              )}
            </div>
            <SimpleLineChart data={overdueTrendData} color="hsl(var(--destructive))" />
          </div>
        ) : (
          <div className={cardClasses}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Overdue Trends</h2>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">—</span>
            </div>
            <PremiumBlur>
              <div className="h-32" />
            </PremiumBlur>
          </div>
        )}

        {/* Priority Breakdown (premium) */}
        {isPremium ? (
          <div className={cardClasses}>
            <h2 className="text-sm font-semibold text-foreground mb-4">Priority Breakdown</h2>
            <div className="flex items-center gap-6">
              <DonutChart segments={priorityBreakdown} />
              <div className="flex-1 space-y-2">
                {priorityBreakdown.map(p => (
                  <div key={p.label} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                    <span className="flex-1 text-foreground">{p.label}</span>
                    <span className="text-muted-foreground">{p.value} tasks</span>
                    <span className="text-muted-foreground w-8 text-right">{p.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className={cardClasses}>
            <h2 className="text-sm font-semibold text-foreground mb-4">Priority Breakdown</h2>
            <PremiumBlur>
              <div className="flex items-center gap-6">
                <DonutChart segments={priorityBreakdown} />
                <div className="flex-1 space-y-2">
                  {priorityBreakdown.map(p => (
                    <div key={p.label} className="flex items-center gap-2 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="flex-1 text-foreground">{p.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </PremiumBlur>
          </div>
        )}

        {/* Tasks Created vs Completed Ratio (premium) */}
        {isPremium ? (
          <div className={cardClasses}>
            <h2 className="text-sm font-semibold text-foreground mb-4">Tasks Created vs Completed</h2>
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <p className="text-3xl font-bold text-foreground">{createdVsCompleted.created}</p>
                <p className="text-xs text-muted-foreground">Created</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{createdVsCompleted.ratio}</p>
                <p className="text-xs text-muted-foreground">ratio</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-500">{createdVsCompleted.completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-3">{createdVsCompleted.context}</p>
          </div>
        ) : (
          <PremiumBlur>
            <div className={cardClasses}>
              <h2 className="text-sm font-semibold text-foreground mb-4">Tasks Created vs Completed</h2>
              <div className="flex items-center justify-center gap-8">
                <div className="text-center"><p className="text-3xl font-bold text-foreground">—</p><p className="text-xs text-muted-foreground">Created</p></div>
                <div className="text-center"><p className="text-2xl font-bold text-primary">—</p><p className="text-xs text-muted-foreground">ratio</p></div>
                <div className="text-center"><p className="text-3xl font-bold text-green-500">—</p><p className="text-xs text-muted-foreground">Completed</p></div>
              </div>
            </div>
          </PremiumBlur>
        )}

        {/* Focus Time Logged (premium) */}
        {isPremium ? (
          <div className={cardClasses}>
            <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" /> Focus Time Logged
            </h2>
            <p className="text-3xl font-bold text-foreground mb-4">{focusTasks.totalDisplay}</p>
            {focusTasks.top3.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Top tasks</p>
                {focusTasks.top3.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-xs py-1.5 px-3 bg-muted/30 rounded-lg">
                    <span className="text-foreground font-medium truncate flex-1">{t.title}</span>
                    <span className="text-muted-foreground ml-2">{Math.floor(t.duration / 60)}h {t.duration % 60}m</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No focus time logged yet. Set task durations to track focus time.</p>
            )}
          </div>
        ) : (
          <PremiumBlur>
            <div className={cardClasses}>
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" /> Focus Time Logged
              </h2>
              <p className="text-3xl font-bold text-foreground mb-4">—</p>
            </div>
          </PremiumBlur>
        )}

        {/* Show upgrade prompt for free users below premium cards */}
        {!isPro && (
          <div className="p-8 text-center bg-muted/10 border border-dashed border-border rounded-2xl">
            <Sparkles className="w-8 h-8 text-primary mx-auto mb-3" />
            <h3 className="text-base font-bold text-foreground mb-2">Unlock Premium Insights</h3>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
              Get charts, trends, and deep analytics to supercharge your productivity.
            </p>
            <a href="/pricing" className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors">
              Upgrade to Premium <ChevronRight className="w-3.5 h-3.5" />
            </a>
          </div>
        )}
      </div>

      {/* AI Analysis Modal */}
      {showAIModal && aiData && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-12">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowAIModal(false)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto animate-fade-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground">AI Productivity Analysis</h2>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleAIAnalysis} disabled={loadingAI} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Refresh">
                  <RefreshCw className={`w-4 h-4 text-muted-foreground ${loadingAI ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setShowAIModal(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              {/* Score */}
              <div className="text-center">
                <p className="text-5xl font-black text-foreground">{aiData.overallScore}</p>
                <p className="text-xs text-muted-foreground mt-1">overall productivity score</p>
                {aiData.scoreRationale && (
                  <div className="mt-3 px-4 py-3 bg-muted/50 border border-border rounded-xl text-left">
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">How this score was reached</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{aiData.scoreRationale}</p>
                  </div>
                )}
              </div>

              {/* Focus area */}
              <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1">Focus Area</p>
                <p className="text-sm text-foreground">{aiData.focusArea}</p>
              </div>

              {/* What's helping */}
              {aiData.contributors && aiData.contributors.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">What's Helping</p>
                  <ul className="space-y-2">
                    {aiData.contributors.map((item: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">●</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* What's dragging it down */}
              {aiData.penalties && aiData.penalties.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">What's Dragging It Down</p>
                  <ul className="space-y-2">
                    {aiData.penalties.map((item: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-destructive mt-0.5">●</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Key insights */}
              {aiData.insights && aiData.insights.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Key Insights</p>
                  <ul className="space-y-2">
                    {aiData.insights.map((insight: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span>
                        <span>{insight}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Recommendations */}
              {aiData.recommendations && aiData.recommendations.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Recommendations</p>
                  <ul className="space-y-2">
                    {aiData.recommendations.map((rec: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5">→</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Insights;
