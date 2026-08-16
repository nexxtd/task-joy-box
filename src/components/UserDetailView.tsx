import React, { useEffect, useMemo, useState } from 'react';
import {
  User, ChevronDown, ChevronUp, ChevronRight, CheckSquare, FolderOpen, Target,
  CheckCircle2, NotebookPen, LayoutGrid, Sparkles, LayoutDashboard, MessageSquare,
  Save, Loader2, X,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface UserDetailViewProps {
  details: any;
  onBack?: () => void;
  onUpdated?: () => void;
}

const PAGE_META: { id: string; label: string; icon: any }[] = [
  { id: 'overview', label: 'Account', icon: User },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'projects', label: 'Projects', icon: FolderOpen },
  { id: 'goals', label: 'Goals', icon: Target },
  { id: 'habits', label: 'Habits', icon: CheckCircle2 },
  { id: 'notes', label: 'Notes', icon: NotebookPen },
  { id: 'whiteboard', label: 'Whiteboards', icon: LayoutGrid },
  { id: 'ai-focus', label: 'AI & Focus', icon: Sparkles },
  { id: 'dashboard', label: 'Dashboard Widgets', icon: LayoutDashboard },
  { id: 'engagement', label: 'Support & Billing', icon: MessageSquare },
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

const StatSection: React.FC<{ id: string; title: string; rows: { label: string; value: any }[]; expanded: boolean; onToggle: () => void; icon?: any }> = ({ id, title, rows, expanded, onToggle, icon: Icon }) => (
  <div className="border border-border rounded-xl overflow-hidden bg-card/40">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs font-bold hover:bg-muted/60 transition-colors"
    >
      <span className="flex items-center gap-2">
        {Icon && <Icon className="w-3.5 h-3.5 text-primary" />}
        {title}
      </span>
      {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
    </button>
    {expanded && (
      <div className="border-t border-border divide-y divide-border/50">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-between px-3.5 py-2">
            <span className="text-[11px] text-muted-foreground">{row.label}</span>
            <span className="text-[11px] font-bold text-foreground text-right">{row.value ?? 0}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

export const UserDetailView: React.FC<UserDetailViewProps> = ({ details, onBack, onUpdated }) => {
  const [page, setPage] = useState('overview');
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set(PAGE_META.map(p => p.id)));
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const u = details?.user;
    if (u) {
      setForm({ name: u.name, email: u.email, tier: u.tier, status: u.status, location: u.location || '', language: u.language || 'en' });
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

  const sections = useMemo(() => {
    const t = fu.tasks || {}, p = fu.projects || {}, g = fu.goals || {}, h = fu.habits || {},
      n = fu.notes || {}, w = fu.whiteboard || {}, ai = fu.ai || {}, f = fu.focus || {},
      d = fu.dashboard || {}, e = fu.engagement || {};
    const s: Record<string, { id: string; title: string; icon?: any; rows: { label: string; value: any }[] }[]> = {
      overview: [
        { id: 'ov-sub', title: 'Subscription', icon: Target, rows: [
          { label: 'Tier', value: (user.tier || 'free').toUpperCase() },
          { label: 'Status', value: (user.status || 'inactive').toUpperCase() },
          { label: 'Renews / Ends', value: user.subscriptionEndsAt ? format(new Date(user.subscriptionEndsAt), 'MMM dd, yyyy') : '—' },
        ]},
        { id: 'ov-activity', title: 'Activity Overview', icon: Sparkles, rows: [
          { label: 'Joined', value: user.createdAt ? format(new Date(user.createdAt), 'MMM dd, yyyy') : '—' },
          { label: 'Last active', value: user.lastActiveAt ? format(new Date(user.lastActiveAt), 'MMM dd, yyyy, HH:mm') : '—' },
          { label: 'Location', value: user.location || '—' },
          { label: 'Language', value: LANGUAGE_LABELS[user.language || 'en'] || user.language },
        ]},
      ],
      tasks: [
        { id: 'ts-status', title: 'Task Status', rows: [
          { label: 'Total tasks', value: t.total }, { label: 'Completed', value: t.completed },
        ]},
        { id: 'ts-content', title: 'Task Content', rows: [
          { label: 'Subtasks', value: t.subtasks }, { label: 'Checklists', value: t.checklists },
          { label: 'Checklist items', value: t.checklistItems }, { label: 'Images', value: t.images },
          { label: 'Attachments', value: t.attachments }, { label: 'Labels', value: t.labels },
        ]},
        { id: 'ts-focus', title: 'Deep Focus', rows: [
          { label: 'Sessions', value: t.deepFocusSessions },
        ]},
      ],
      projects: [
        { id: 'pr-boards', title: 'Projects & Boards', rows: [
          { label: 'Boards', value: p.boards }, { label: 'Milestones', value: p.milestones },
        ]},
        { id: 'pr-wb', title: 'Whiteboards', rows: [
          { label: 'Whiteboards created', value: p.whiteboards },
        ]},
      ],
      goals: [
        { id: 'gl-total', title: 'Goals', rows: [
          { label: 'Goals created', value: g.total }, { label: 'Goals completed', value: g.completed },
        ]},
      ],
      habits: [
        { id: 'hb-total', title: 'Habits', rows: [
          { label: 'Habits created', value: h.total }, { label: 'Total completions', value: h.totalCompletions },
          { label: 'Highest streak', value: h.highestStreak },
        ]},
      ],
      notes: [
        { id: 'nt-total', title: 'Notes', rows: [
          { label: 'Notes created', value: n.total }, { label: 'Tags created', value: n.tags },
          { label: 'Pinned notes', value: n.pinned }, { label: 'Attachments', value: n.attachments },
        ]},
      ],
      whiteboard: [
        { id: 'wb-items', title: 'Whiteboard Items', rows: Object.entries(w.items || {}).map(([k, v]) => ({ label: k.replace(/-/g, ' '), value: v })).concat([{ label: 'Whiteboards created', value: w.whiteboardsCreated }]) },
      ],
      'ai-focus': [
        { id: 'ai-total', title: 'AI Assistant', rows: [{ label: 'Total AI messages', value: ai.totalMessages }] },
        { id: 'focus-sessions', title: 'Focus Sessions', rows: [
          { label: 'Sessions', value: f.sessions }, { label: 'Total minutes', value: f.totalMinutes },
          { label: 'Completed', value: f.completed },
        ]},
      ],
      dashboard: [
        { id: 'dw-widgets', title: 'Widget Usage', rows: Object.entries(d.widgets || {}).map(([k, v]) => ({ label: WIDGET_LABELS[k] || k.replace(/-/g, ' '), value: v })).concat([{ label: 'Total usage events', value: Object.values(d.widgets || {}).reduce((a: number, b: any) => a + (Number(b) || 0), 0) }]) },
      ],
      engagement: [
        { id: 'eg-tickets', title: 'Support Tickets', rows: [
          { label: 'Tickets created', value: e.tickets }, { label: 'Open tickets', value: e.openTickets },
        ]},
        { id: 'eg-billing', title: 'Billing & Coupons', rows: [
          { label: 'Transactions', value: e.transactions }, { label: 'Total spent', value: `$${(Number(e.totalSpent) || 0).toFixed(2)}` },
          { label: 'Coupons redeemed', value: e.couponsRedeemed },
        ]},
      ],
    };
    return s;
  }, [details]);

  const pageSections = sections[page] || [];
  const pageHasData = pageSections.some(sec => sec.rows.length > 0);
  const statCards = [
    { label: 'Tasks', value: details?.stats?.tasks ?? fu.tasks?.total },
    { label: 'Goals', value: details?.stats?.goals ?? fu.goals?.total },
    { label: 'Habits', value: details?.stats?.habits ?? fu.habits?.total },
  ];

  const toggleSections = (id: string) => setExpandedSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <div className="flex h-full overflow-hidden" style={{ maxHeight: 'inherit' }}>
      <div className="w-56 border-r border-border overflow-y-auto flex-shrink-0 bg-card/30">
        {PAGE_META.map(p => (
          <div key={p.id}>
            <button
              onClick={() => {
                setPage(p.id);
                setExpandedPages(prev => { const next = new Set(prev); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next; });
              }}
              className={`w-full text-left px-3 py-2.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider transition-colors ${page === p.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            >
              <span className="flex items-center gap-2">
                <p.icon className="w-3.5 h-3.5" />
                {p.label}
              </span>
              {expandedPages.has(p.id) ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {expandedPages.has(p.id) && (
              <div className="px-3 pb-2 pt-0.5">
                {(sections[p.id] || []).map(sec => (
                  <button
                    key={sec.id}
                    onClick={() => toggleSections(sec.id)}
                    className="w-full text-left px-2 py-1.5 text-[11px] rounded-md transition-colors flex items-center justify-between text-foreground hover:bg-muted"
                  >
                    <span className="truncate">{sec.title}</span>
                    {expandedSections.has(sec.id) ? <ChevronUp className="w-3 h-3 opacity-50 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 opacity-50 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {onBack && (
          <button onClick={onBack} className="mb-3 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
            <X className="w-3.5 h-3.5" /> Back to user list
          </button>
        )}

        {page === 'overview' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold flex-shrink-0">
                {(user.name || '?')[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {statCards.map(s => (
                <div key={s.label} className="bg-muted/50 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-foreground">{s.value ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
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
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Email</label>
                      <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:border-primary outline-none" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} />
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
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Location</label>
                      <input className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs focus:border-primary outline-none" placeholder="e.g. Paris, France" value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} />
                    </div>
                    <div>
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
                  <button
                    onClick={handleSave}
                    disabled={!dirty || saving}
                    className="w-full flex items-center justify-center gap-1.5 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 disabled:opacity-50 transition-all"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>

            {pageSections.map(sec => (
              <StatSection key={sec.id} id={sec.id} title={sec.title} icon={sec.icon} rows={sec.rows} expanded={expandedSections.has(sec.id)} onToggle={() => toggleSections(sec.id)} />
            ))}
          </div>
        )}

        {page !== 'overview' && (
          <div className="space-y-4">
            {page === 'tasks' && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-foreground">{fu.tasks?.total ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Total Tasks</p>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-foreground">{fu.tasks?.completed ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Completed</p>
                </div>
                <div className="bg-purple-500/5 border border-purple-500/10 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-foreground">{fu.tasks?.deepFocusSessions ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Focus Sessions</p>
                </div>
              </div>
            )}
            {page === 'projects' && (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-primary/5 border border-primary/10 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-foreground">{fu.projects?.boards ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Boards</p>
                </div>
                <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold text-foreground">{fu.projects?.milestones ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground">Milestones</p>
                </div>
              </div>
            )}
            {page === 'whiteboard' && (
              <div className="bg-muted/50 rounded-xl p-2.5 text-center">
                <p className="text-lg font-bold text-foreground">{fu.whiteboard?.whiteboardsCreated ?? 0}</p>
                <p className="text-[10px] text-muted-foreground">Whiteboards Created</p>
              </div>
            )}
            {page === 'dashboard' && (() => {
              const widgets = fu.dashboard?.widgets || {};
              const entries = Object.entries(widgets);
              return entries.length > 0 ? (
                <div className="border border-border rounded-xl overflow-hidden bg-card/40">
                  <div className="px-3.5 py-2.5 text-xs font-bold border-b border-border">Top Widgets</div>
                  <div className="divide-y divide-border/50">
                    {entries.sort((a: any, b: any) => b[1] - a[1]).slice(0, 5).map(([k, v]: any) => (
                      <div key={k} className="flex items-center justify-between px-3.5 py-2">
                        <span className="text-[11px] text-muted-foreground">{WIDGET_LABELS[k] || k.replace(/-/g, ' ')}</span>
                        <span className="text-[11px] font-bold text-foreground">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
            {!pageHasData && (
              <p className="text-xs text-muted-foreground text-center py-6">No data available for this section yet.</p>
            )}
            {pageSections.map(sec => (
              <StatSection key={sec.id} id={sec.id} title={sec.title} icon={sec.icon} rows={sec.rows} expanded={expandedSections.has(sec.id)} onToggle={() => toggleSections(sec.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserDetailView;