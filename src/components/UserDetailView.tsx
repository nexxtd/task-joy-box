import React, { useEffect, useMemo, useState } from 'react';
import {
  User, CheckSquare, FolderOpen, Target, CheckCircle2, NotebookPen, LayoutGrid, Sparkles,
  LayoutDashboard, MessageSquare, Save, Loader2, X, Calendar, BarChart3, FileText, Users, Crown, Shield, KeyRound, Mail, Ban,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface UserDetailViewProps {
  details: any;
  onBack?: () => void;
  onUpdated?: () => void;
}

const PAGES: { id: string; label: string; icon: any }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'projects', label: 'Projects', icon: FolderOpen },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
  { id: 'ai', label: 'AI Assistant', icon: Sparkles },
  { id: 'notes', label: 'Notes', icon: NotebookPen },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'habits', label: 'Habits', icon: CheckCircle2 },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'collaboration', label: 'Collaboration', icon: Users },
  { id: 'whiteboard', label: 'Whiteboard', icon: LayoutGrid },
  { id: 'support', label: 'Support', icon: MessageSquare },
];

const LANGUAGES = ['en', 'fr', 'es', 'de'];
const LANGUAGE_LABELS: Record<string, string> = { en: 'English', fr: 'Français', es: 'Español', de: 'Deutsch' };

const WIDGET_LABELS: Record<string, string> = {
  stats: 'Stats Overview', tasks: 'Tasks', projects: 'Projects', 'project-tasks': 'Project Tasks',
  insights: 'Insights', energy: 'Energy Recommendations', 'peak-hours': 'Peak Hours', weekly: 'Weekly Activity',
  account: 'Account Status', overdue: 'Overdue Tasks', deadlines: 'Upcoming Deadlines',
  'project-progress': 'Project Progress', 'recently-completed': 'Recently Completed',
  'priority-breakdown': 'Priority Breakdown', 'tags-overview': 'Tags Overview',
  'advanced-insights': 'Advanced Insights', 'custom-report': 'Custom Report',
  'multi-project': 'Multi-Project Comparison', 'ai-score': 'AI Productivity Score',
  'ai-prioritize': 'AI Task Prioritizer', 'ai-bottlenecks': 'AI Bottleneck Detector', 'ai-weekly': 'AI Weekly Summary',
};

const FlatSection: React.FC<{ title: string; icon?: any; rows: { label: string; value: any }[] }> = ({ title, icon: Icon, rows }) => (
  <div className="border border-border rounded-xl overflow-hidden bg-card/40">
    <div className="px-3.5 py-2.5 text-xs font-bold flex items-center gap-2 border-b border-border">
      {Icon && <Icon className="w-3.5 h-3.5 text-primary" />}
      {title}
    </div>
    <div className="divide-y divide-border/50">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center justify-between px-3.5 py-2">
          <span className="text-[11px] text-muted-foreground">{row.label}</span>
          <span className="text-[11px] font-bold text-foreground text-right">{row.value ?? 0}</span>
        </div>
      ))}
    </div>
  </div>
);

export const UserDetailView: React.FC<UserDetailViewProps> = ({ details, onBack, onUpdated }) => {
  const [page, setPage] = useState('personal');
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [editingPassword, setEditingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const u = details?.user;
    if (u) {
      setForm({ name: u.name, email: u.email, tier: u.tier, status: u.status, location: u.location || '', language: u.language || 'en' });
      setNewEmail(u.email || '');
    }
  }, [details?.user?.id]);

  const user = details?.user || {};
  const fu = details?.featureUsage || {};

  const dirty = form && (
    form.name !== (user.name || '') || form.email !== (user.email || '') || form.tier !== (user.tier || 'free') ||
    form.status !== (user.status || 'inactive') || form.location !== (user.location || '') || form.language !== (user.language || 'en')
  );

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast({ title: 'Success', description: 'User updated' });
        onUpdated?.();
      } else {
        const data = await res.json();
        toast({ title: 'Error', description: data.error || 'Failed to update user', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Server error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim() || newEmail.trim() === user.email) { setEditingEmail(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: newEmail.trim() }),
      });
      if (res.ok) {
        toast({ title: 'Email updated', description: `Changed to ${newEmail.trim()}` });
        setEditingEmail(false);
        onUpdated?.();
      } else {
        const d = await res.json();
        toast({ title: 'Error', description: d.error || 'Failed to change email', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Server error', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleChangePassword = async () => {
    if (!newPassword.trim() || newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: newPassword }),
      });
      if (res.ok) {
        toast({ title: 'Password updated', description: 'User password has been changed' });
        setNewPassword('');
        setEditingPassword(false);
        onUpdated?.();
      } else {
        const d = await res.json();
        toast({ title: 'Error', description: d.error || 'Failed to change password', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Server error', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleCancelSubscription = async () => {
    if (!confirm(`Cancel subscription for ${user.email || user.name}? This will downgrade the user to FREE and deactivate billing.`)) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier: 'free', status: 'inactive' }),
      });
      if (res.ok) {
        toast({ title: 'Subscription cancelled', description: 'User downgraded to FREE' });
        onUpdated?.();
      } else {
        const d = await res.json();
        toast({ title: 'Error', description: d.error || 'Failed to cancel subscription', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Server error', variant: 'destructive' });
    } finally { setCancelling(false); }
  };

  const sections = useMemo(() => {
    const t = fu.tasks || {}, p = fu.projects || {}, g = fu.goals || {}, h = fu.habits || {},
      n = fu.notes || {}, w = fu.whiteboard || {}, ai = fu.ai || {}, f = fu.focus || {},
      d = fu.dashboard || {}, e = fu.engagement || {};
    const widgetEntries: [string, any][] = Object.entries(d.widgets || {});
    const totalWidgets = widgetEntries.reduce((a, [, b]: any) => a + (Number(b) || 0), 0);
    const topWidget = widgetEntries.length ? [...widgetEntries].sort((a: any, b: any) => Number(b[1]) - Number(a[1]))[0] as any : null;
    const activeTasks = Math.max(0, (Number(t.total) || 0) - (Number(t.completed) || 0));
    const completionRate = t.total ? Math.round((Number(t.completed || 0) / Number(t.total)) * 100) + '%' : '—';
    const avgChecklistItems = t.checklists ? (Number(t.checklistItems || 0) / Number(t.checklists)).toFixed(1) : '—';
    const totalMedia = (Number(t.images) || 0) + (Number(t.attachments) || 0);
    const totalFiles = (Number(n.attachments) || 0) + (Number(t.attachments) || 0) + (Number(t.images) || 0);
    const s: Record<string, { title: string; icon?: any; rows: { label: string; value: any }[] }[]> = {
      dashboard: [
        { title: 'Widget Usage — Every Widget', icon: LayoutDashboard, rows: widgetEntries.length ? widgetEntries.map(([k, v]: any) => ({ label: WIDGET_LABELS[k] || k.replace(/-/g, ' '), value: v })) : [{ label: 'Widgets tracked', value: 0 }, { label: 'No widget activity yet', value: '—' }] },
        { title: 'Dashboard Activity', rows: [
          { label: 'Total usage events', value: totalWidgets },
          { label: 'Distinct widgets used', value: widgetEntries.length },
          { label: 'Most used widget', value: topWidget ? `${WIDGET_LABELS[topWidget[0]] || topWidget[0]} (${topWidget[1]})` : '—' },
          { label: 'Avg uses per widget', value: widgetEntries.length ? (totalWidgets / widgetEntries.length).toFixed(1) : '—' },
          { label: 'Boards tracked', value: p.boards ?? 0 },
          { label: 'Tasks tracked', value: t.total ?? 0 },
        ]},
      ],
      projects: [
        { title: 'Projects & Boards', icon: FolderOpen, rows: [
          { label: 'Boards created', value: p.boards },
          { label: 'Milestones created', value: p.milestones },
          { label: 'Milestones per board', value: p.boards ? (Number(p.milestones || 0) / Number(p.boards)).toFixed(1) : '—' },
          { label: 'Whiteboards linked', value: p.whiteboards },
          { label: 'Total project items', value: (Number(p.boards) || 0) + (Number(p.milestones) || 0) + (Number(p.whiteboards) || 0) },
        ]},
        { title: 'Project Activity', rows: [
          { label: 'Whiteboards created', value: p.whiteboards },
          { label: 'Avg whiteboards per board', value: p.boards ? (Number(p.whiteboards || 0) / Number(p.boards)).toFixed(1) : '—' },
        ]},
      ],
      tasks: [
        { title: 'Task Overview — Status', icon: CheckSquare, rows: [
          { label: 'Total created', value: t.total },
          { label: 'Completed', value: t.completed },
          { label: 'Active / Pending', value: activeTasks },
          { label: 'Overdue (tracked)', value: (t as any).overdue ?? 0 },
          { label: 'Completion rate', value: completionRate },
          { label: 'Avg checklists per task', value: t.total ? (Number(t.checklists || 0) / Number(t.total)).toFixed(2) : '—' },
        ]},
        { title: 'Sub-tasks & Checklists', rows: [
          { label: 'Sub-tasks created', value: t.subtasks },
          { label: 'Checklist lists', value: t.checklists },
          { label: 'Checklist items total', value: t.checklistItems },
          { label: 'Avg items per checklist', value: avgChecklistItems },
          { label: 'Checklist items per task', value: t.total ? (Number(t.checklistItems || 0) / Number(t.total)).toFixed(1) : '—' },
        ]},
        { title: 'Organization & Templates', icon: FileText, rows: [
          { label: 'Labels / Tags applied', value: t.labels },
          { label: 'Tags per task', value: t.total ? (Number(t.labels || 0) / Number(t.total)).toFixed(2) : '—' },
          { label: 'Template usage', value: (t as any).templatesUsed ?? (t as any).templateUsage ?? 0 },
          { label: 'Templates per task', value: t.total ? ((Number((t as any).templatesUsed) || 0) / Number(t.total)).toFixed(2) : '—' },
          { label: 'Deep Focus sessions linked', value: t.deepFocusSessions },
        ]},
        { title: 'Media & Attachments', rows: [
          { label: 'Images attached', value: t.images },
          { label: 'Files attached', value: t.attachments },
          { label: 'Total media', value: totalMedia },
          { label: 'Media per task', value: t.total ? (totalMedia / Number(t.total)).toFixed(2) : '—' },
        ]},
      ],
      calendar: [
        { title: 'Calendar — Scheduling', icon: Calendar, rows: [
          { label: 'Total tasks scheduled', value: t.total },
          { label: 'Completed', value: t.completed },
          { label: 'Active', value: activeTasks },
          { label: 'Overdue', value: (t as any).overdue ?? 0 },
          { label: 'Tasks with checklists (scheduled)', value: t.checklists },
          { label: 'Checklist items (agenda)', value: t.checklistItems },
        ]},
        { title: 'Calendar Activity', rows: [
          { label: 'Deep focus sessions', value: f.sessions ?? t.deepFocusSessions ?? 0 },
          { label: 'Total focus minutes', value: f.totalMinutes ?? 0 },
          { label: 'Completed focus', value: f.completed ?? 0 },
          { label: 'Avg minutes per session', value: f.sessions ? (Number(f.totalMinutes || 0) / Number(f.sessions)).toFixed(1) : '—' },
          { label: 'Calendar events (est.)', value: t.total ?? 0 },
        ]},
      ],
      insights: [
        { title: 'Insights — Productivity', icon: BarChart3, rows: [
          { label: 'Tasks total', value: t.total },
          { label: 'Tasks completed', value: t.completed },
          { label: 'Goals completed', value: g.completed },
          { label: 'Habits with streak', value: h.highestStreak },
          { label: 'Focus completion rate', value: f.sessions ? Math.round((Number(f.completed || 0) / Number(f.sessions)) * 100) + '%' : '—' },
        ]},
        { title: 'Per-Widget Insights Usage', rows: widgetEntries.length ? widgetEntries.map(([k, v]: any) => ({ label: WIDGET_LABELS[k] || k.replace(/-/g, ' '), value: v })) : [{ label: 'No insights widgets used', value: '—' }] },
        { title: 'Advanced', rows: [
          { label: 'AI messages informing insights', value: ai.totalMessages },
          { label: 'Dashboard events', value: totalWidgets },
        ]},
      ],
      ai: [
        { title: 'AI Assistant — Usage', icon: Sparkles, rows: [
          { label: 'Total AI messages', value: ai.totalMessages },
          { label: 'Avg per task', value: t.total ? (Number(ai.totalMessages || 0) / Number(t.total)).toFixed(2) : '—' },
          { label: 'Focus sessions (AI-assisted)', value: f.sessions },
        ]},
        { title: 'Deep Focus', rows: [
          { label: 'Sessions', value: f.sessions },
          { label: 'Total minutes', value: f.totalMinutes },
          { label: 'Completed', value: f.completed },
          { label: 'Pending', value: Math.max(0, (Number(f.sessions) || 0) - (Number(f.completed) || 0)) },
          { label: 'Completion rate', value: f.sessions ? Math.round((Number(f.completed || 0) / Number(f.sessions)) * 100) + '%' : '—' },
        ]},
      ],
      notes: [
        { title: 'Notes — Library', icon: NotebookPen, rows: [
          { label: 'Notes created', value: n.total },
          { label: 'Pinned notes', value: n.pinned },
          { label: 'Pinned %', value: n.total ? Math.round((Number(n.pinned || 0) / Number(n.total)) * 100) + '%' : '—' },
          { label: 'Tags created', value: n.tags },
          { label: 'Tags per note', value: n.total ? (Number(n.tags || 0) / Number(n.total)).toFixed(2) : '—' },
        ]},
        { title: 'Notes — Attachments', rows: [
          { label: 'Attachments', value: n.attachments },
          { label: 'Attachments per note', value: n.total ? (Number(n.attachments || 0) / Number(n.total)).toFixed(2) : '—' },
        ]},
      ],
      goals: [
        { title: 'Goals — Overview', icon: Target, rows: [
          { label: 'Goals created', value: g.total },
          { label: 'Goals completed', value: g.completed },
          { label: 'Active goals', value: Math.max(0, (Number(g.total) || 0) - (Number(g.completed) || 0)) },
          { label: 'Completion rate', value: g.total ? Math.round((Number(g.completed || 0) / Number(g.total)) * 100) + '%' : '—' },
        ]},
      ],
      habits: [
        { title: 'Habits — Tracking', icon: CheckCircle2, rows: [
          { label: 'Habits created', value: h.total },
          { label: 'Total completions', value: h.totalCompletions },
          { label: 'Avg completions per habit', value: h.total ? (Number(h.totalCompletions || 0) / Number(h.total)).toFixed(1) : '—' },
          { label: 'Highest streak', value: h.highestStreak },
        ]},
      ],
      documents: [
        { title: 'Documents — Files', icon: FileText, rows: [
          { label: 'Note attachments', value: n.attachments },
          { label: 'Task attachments', value: t.attachments },
          { label: 'Task images', value: t.images },
          { label: 'Whiteboard exports (est.)', value: w.whiteboardsCreated },
          { label: 'Total files', value: totalFiles },
          { label: 'Files per note', value: n.total ? (Number(n.attachments || 0) / Number(n.total)).toFixed(2) : '—' },
          { label: 'Files per task', value: t.total ? (Number(t.attachments || 0) / Number(t.total)).toFixed(2) : '—' },
        ]},
      ],
      collaboration: [
        { title: 'Collaboration — Workspace', icon: Users, rows: [
          { label: 'Boards (shared)', value: p.boards },
          { label: 'Milestones (team)', value: p.milestones },
          { label: 'Whiteboards (collab)', value: w.whiteboardsCreated },
          { label: 'Open support tickets', value: e.openTickets },
          { label: 'Total tickets (collab history)', value: e.tickets },
        ]},
        { title: 'Collaboration Activity', rows: [
          { label: 'Whiteboard items (total)', value: (Object.values((w.items as any) || {}) as any[]).reduce((a: number, b: any) => a + Number(b || 0), 0) },
          { label: 'Avg items per whiteboard', value: w.whiteboardsCreated ? (Number((Object.values((w.items as any) || {}) as any[]).reduce((a: number, b: any) => a + Number(b || 0), 0)) / Number(w.whiteboardsCreated)).toFixed(1) : '—' },
        ]},
      ],
      whiteboard: [
        { title: 'Whiteboard — Boards', icon: LayoutGrid, rows: [{ label: 'Whiteboards created', value: w.whiteboardsCreated }] },
        { title: 'Whiteboard — Items Breakdown', rows: Object.entries(w.items || {}).length ? Object.entries(w.items || {}).map(([k, v]) => ({ label: k.replace(/-/g, ' '), value: v })) : [{ label: 'No items yet', value: '—' }] },
        { title: 'Whiteboard — Totals', rows: [
          { label: 'Total items', value: (Object.values((w.items as any) || {}) as any[]).reduce((a: number, b: any) => a + Number(b || 0), 0) },
          { label: 'Items per board', value: w.whiteboardsCreated ? (Number((Object.values((w.items as any) || {}) as any[]).reduce((a: number, b: any) => a + Number(b || 0), 0)) / Number(w.whiteboardsCreated)).toFixed(1) : '—' },
        ]},
      ],
      support: [
        { title: 'Support — Tickets', icon: MessageSquare, rows: [
          { label: 'Tickets created', value: e.tickets },
          { label: 'Open tickets', value: e.openTickets },
          { label: 'Closed tickets', value: Math.max(0, (Number(e.tickets) || 0) - (Number(e.openTickets) || 0)) },
          { label: 'Open %', value: e.tickets ? Math.round((Number(e.openTickets || 0) / Number(e.tickets)) * 100) + '%' : '—' },
        ]},
        { title: 'Billing & Coupons', rows: [
          { label: 'Transactions', value: e.transactions },
          { label: 'Total spent', value: `$${(Number(e.totalSpent) || 0).toFixed(2)}` },
          { label: 'Avg per transaction', value: e.transactions ? `$${(Number(e.totalSpent || 0) / Number(e.transactions)).toFixed(2)}` : '—' },
          { label: 'Coupons redeemed', value: e.couponsRedeemed },
        ]},
      ],
    };
    return s;
  }, [details, user]);

  const activePageMeta = PAGES.find(p => p.id === page);
  const isPersonal = page === 'personal';
  const pageSections = !isPersonal ? (sections[page] || []) : [];
  const ActiveIcon = isPersonal ? Crown : (activePageMeta?.icon || User);

  return (
    <div className="flex h-full overflow-hidden" style={{ maxHeight: 'inherit' }}>
      <nav className="w-60 border-r border-border overflow-y-auto flex-shrink-0 bg-card/30 flex flex-col">
        <div className="p-2 pb-3">
          <button
            onClick={() => setPage('personal')}
            className={`w-full text-left rounded-xl p-3 flex items-center gap-3 transition-all border ${isPersonal ? 'bg-primary text-primary-foreground border-primary shadow-md' : 'bg-card border-border hover:border-primary/30 hover:bg-muted text-foreground'}`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isPersonal ? 'bg-white/20' : 'bg-primary/10'}`}>
              <Crown className={`w-4 h-4 ${isPersonal ? 'text-primary-foreground' : 'text-primary'}`} />
            </div>
            <div className="min-w-0 text-left">
              <div className="text-xs font-bold leading-none">Personal</div>
              <div className={`text-[10px] leading-none mt-1 ${isPersonal ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>Account & billing</div>
            </div>
            {isPersonal && <Shield className="w-3.5 h-3.5 ml-auto opacity-70" />}
          </button>
        </div>

        <div className="mx-2 h-px bg-border" />

        <div className="p-2 space-y-1 flex-1 overflow-y-auto">
          <p className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pages</p>
          {PAGES.map(p => {
            const isActive = page === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setPage(p.id)}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 text-xs font-semibold rounded-lg transition-colors ${isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
              >
                <p.icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                <span className="truncate">{p.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {onBack && (
          <button onClick={onBack} className="mb-1 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <X className="w-3.5 h-3.5" /> Back to user list
          </button>
        )}

        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <ActiveIcon className="w-4 h-4 text-primary" />
          </div>
          <h2 className="text-sm font-bold text-foreground">{isPersonal ? 'Personal' : activePageMeta?.label}</h2>
          <span className="text-xs text-muted-foreground">— {user.name || user.email || 'User'}</span>
        </div>

        {isPersonal && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">
                {(user.name || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
              <span className={`ml-auto px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${user.tier === 'premium' ? 'bg-amber-500/10 text-amber-600' : user.tier === 'pro' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                {user.tier || 'free'}
              </span>
            </div>

            <div className="border border-border rounded-xl overflow-hidden bg-card/40">
              <div className="px-3.5 py-2.5 text-xs font-bold border-b border-border flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-primary" /> Core Account Info
              </div>
              <div className="divide-y divide-border/50">
                <div className="flex items-center justify-between px-3.5 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-foreground">Email</p>
                    {!editingEmail ? (
                      <p className="text-xs text-muted-foreground truncate">{user.email || '—'}</p>
                    ) : (
                      <input autoFocus className="mt-1 w-full bg-background border border-primary/30 rounded-lg px-3 py-1.5 text-xs outline-none" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@email.com" />
                    )}
                  </div>
                  {!editingEmail ? (
                    <button onClick={() => { setNewEmail(user.email || ''); setEditingEmail(true); }} className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-muted flex items-center gap-1.5">
                      <Mail className="w-3 h-3" /> Change Email
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={handleChangeEmail} disabled={saving} className="px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                      </button>
                      <button onClick={() => setEditingEmail(false)} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted">Cancel</button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between px-3.5 py-3 gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-foreground">Password</p>
                    {!editingPassword ? (
                      <p className="text-xs text-muted-foreground">••••••••••••</p>
                    ) : (
                      <input autoFocus type="password" className="mt-1 w-full bg-background border border-primary/30 rounded-lg px-3 py-1.5 text-xs outline-none" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (min 6 chars)" />
                    )}
                  </div>
                  {!editingPassword ? (
                    <button onClick={() => setEditingPassword(true)} className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-muted flex items-center gap-1.5">
                      <KeyRound className="w-3 h-3" /> Change Password
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button onClick={handleChangePassword} disabled={saving} className="px-3 py-1.5 text-xs font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                      </button>
                      <button onClick={() => { setEditingPassword(false); setNewPassword(''); }} className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted">Cancel</button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between px-3.5 py-3">
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">Plan</p>
                    <p className="text-xs text-muted-foreground capitalize">{user.tier || 'free'} <span className="text-[11px]">— {user.status || 'inactive'}</span></p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${user.tier === 'free' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>{user.tier || 'free'}</span>
                </div>

                <div className="grid grid-cols-2 gap-0 divide-x divide-border/50">
                  <div className="px-3.5 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Joined</p>
                    <p className="text-xs font-semibold text-foreground mt-0.5">{user.createdAt ? format(new Date(user.createdAt), 'MMM dd, yyyy') : '—'}</p>
                  </div>
                  <div className="px-3.5 py-2.5">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Last active</p>
                    <p className="text-xs font-semibold text-foreground mt-0.5">{user.lastActiveAt ? format(new Date(user.lastActiveAt), 'MMM dd, yyyy') : '—'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border border-destructive/20 bg-destructive/[0.03] rounded-xl overflow-hidden">
              <div className="px-3.5 py-2.5 text-xs font-bold border-b border-destructive/10 flex items-center gap-2 text-destructive">
                <Ban className="w-3.5 h-3.5" /> Admin Controls
              </div>
              <div className="p-3.5 space-y-3">
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setEditingEmail(true)} className="px-3 py-2 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5" /> Change Email
                  </button>
                  <button onClick={() => setEditingPassword(true)} className="px-3 py-2 text-xs font-semibold border border-border bg-card rounded-lg hover:bg-muted flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5" /> Change Password
                  </button>
                  <button onClick={handleCancelSubscription} disabled={cancelling || user.tier === 'free'} className="px-3 py-2 text-xs font-semibold bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 disabled:opacity-50 flex items-center gap-1.5">
                    {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />} Cancel Subscription
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">Cancel moves the user to FREE and deactivates billing. Use Change Email / Password to update credentials directly.</p>
              </div>
            </div>

            <div className="border border-border rounded-xl overflow-hidden bg-card/40">
              <div className="px-3.5 py-2.5 text-xs font-bold border-b border-border">Account Details</div>
              {form && (
                <div className="p-3.5 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Name</label>
                      <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:border-primary outline-none" value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Location</label>
                      <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:border-primary outline-none" placeholder="e.g. Paris, France" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Tier</label>
                      <Select value={form.tier} onValueChange={v => setForm({ ...form, tier: v })}>
                        <SelectTrigger className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">FREE</SelectItem>
                          <SelectItem value="pro">PRO</SelectItem>
                          <SelectItem value="premium">PREMIUM</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Status</label>
                      <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                        <SelectTrigger className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">ACTIVE</SelectItem>
                          <SelectItem value="inactive">INACTIVE</SelectItem>
                          <SelectItem value="trialing">TRIALING</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Language</label>
                      <Select value={form.language} onValueChange={v => setForm({ ...form, language: v })}>
                        <SelectTrigger className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LANGUAGES.map(l => <SelectItem key={l} value={l}>{LANGUAGE_LABELS[l]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <button onClick={handleSave} disabled={!dirty || saving} className="w-full flex items-center justify-center gap-1.5 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all">
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {!isPersonal && (
          <div className="space-y-4">
            {pageSections.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No data available for this section yet.</p>
            ) : (
              pageSections.map(sec => (
                <FlatSection key={sec.title} title={sec.title} icon={sec.icon} rows={sec.rows} />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDetailView;
