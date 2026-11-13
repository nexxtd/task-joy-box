import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, X, Clock, Loader2, Mail, AlertTriangle, Inbox, CheckCheck, CalendarClock, Copy, ExternalLink, Sparkles } from 'lucide-react';
import { NOTIFICATIONS_REFRESH_EVENT } from '@/lib/notifications';
import { toast } from '@/hooks/use-toast';
import { useBoardContext } from '@/context/BoardContext';
import { useNotesContext } from '@/context/NotesContext';
import type { Task } from '@/types/board';

interface PendingChange {
  id: number;
  changeType: string;
  payload: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

interface AppNotification {
  id: number;
  type: string;
  title: string;
  message: string;
  data: string | null;
  read: boolean;
  createdAt: string;
}

interface OverdueItem {
  id: string;
  title: string;
  dueDate: string;
  dueTime?: string;
  source: 'Task' | 'Note';
}

const parseData = (raw: string | null | undefined): Record<string, any> => {
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
};

const relativeTime = (iso: string): string => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return `${m}m ago`;
  }
  if (diff < 86_400_000) {
    const h = Math.floor(diff / 3_600_000);
    return `${h}h ago`;
  }
  const d = Math.floor(diff / 86_400_000);
  return d === 1 ? '1d ago' : `${d}d ago`;
};

const collectOverdue = (tasks: Task[], source: 'Task' | 'Note'): OverdueItem[] => {
  const now = Date.now();
  return tasks
    .filter(task => {
      if (!task.dueDate || task.completed) return false;
      if (task.columnId && task.columnId.toLowerCase().includes('done')) return false;
      const due = new Date(`${task.dueDate}T${task.dueTime || '23:59:59'}`);
      return !Number.isNaN(due.getTime()) && due.getTime() < now;
    })
    .map(task => ({
      id: task.id,
      title: task.title,
      dueDate: task.dueDate!,
      dueTime: task.dueTime,
      source,
    }));
};

export const NotificationBell: React.FC = () => {
  const [pendings, setPendings] = useState<PendingChange[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyInvite, setBusyInvite] = useState<number | null>(null);
  const { board } = useBoardContext();
  const { board: notesBoard } = useNotesContext();

  const overdue = useMemo(
    () => [...collectOverdue(board.tasks, 'Task'), ...collectOverdue(notesBoard.tasks, 'Note')]
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [board.tasks, notesBoard.tasks],
  );

  const invites = useMemo(
    () => notifications.filter(n => n.type === 'project_invite'),
    [notifications],
  );

  const otherNotifications = useMemo(
    () => notifications.filter(n => n.type !== 'project_invite'),
    [notifications],
  );

  const fetchPendings = async () => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch('/api/notifications', { credentials: 'include', signal: ctrl.signal });
      clearTimeout(tid);
      if (res.ok) {
        const data = await res.json();
        setPendings(data.pendings || []);
        setNotifications(data.notifications || []);
      } else if (res.status >= 500) {
        setPendings([]);
        setNotifications([]);
      }
    } catch { clearTimeout(tid); }
  };

  useEffect(() => {
    fetchPendings();
    const id = setInterval(fetchPendings, 30000);
    const onRefresh = () => { fetchPendings(); };
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    };
  }, []);

  const openPanel = async () => {
    setOpen(true);
    await fetchPendings();
    // Everything currently listed has now been seen; keep invites actionable.
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' }).catch(() => {});
  };

  const handleAction = async (id: number, action: 'approve' | 'deny') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications/${id}/${action}`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        toast({ title: action === 'approve' ? 'Approved' : 'Denied', description: `Change ${action === 'approve' ? 'approved' : 'denied'} successfully.` });
        fetchPendings();
      } else {
        const d = await res.json();
        toast({ title: 'Error', description: d.error || 'Failed', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Network error', variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const respondToInvite = async (notificationId: number, requestId: number, action: 'accept' | 'decline') => {
    setBusyInvite(notificationId);
    try {
      const res = await fetch(`/api/notifications/project-invite/${requestId}/${action}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({
          title: action === 'accept' ? 'Invitation accepted' : 'Invitation declined',
          description: action === 'accept' ? 'You joined the project.' : 'The project owner has been notified.',
        });
        await fetchPendings();
      } else {
        toast({ title: 'Could not respond', description: data?.error || data?.message || 'Please try again.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Could not respond', description: 'Network error', variant: 'destructive' });
    } finally {
      setBusyInvite(null);
    }
  };

  const formatPayload = (p: PendingChange) => {
    try {
      const data = JSON.parse(p.payload);
      if (p.changeType === 'email' && data.email) return `Email → ${data.email}`;
      if (p.changeType === 'password') return 'Password change';
      if (p.changeType === 'subscription' || p.changeType === 'tier') return `Plan → ${data.tier || data.status || 'free'}`;
      return Object.entries(data).map(([k, v]) => `${k}: ${String(v)}`).join(', ');
    } catch { return p.changeType; }
  };

  const timeLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'auto-approving...';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m left`;
  };

  const unreadOther = otherNotifications.filter(n => !n.read).length;
  const count = pendings.length + invites.length + overdue.length + unreadOther;
  const hasAnything = count > 0 || otherNotifications.length > 0;

  return (
    <>
      <button
        onClick={openPanel}
        aria-label={count ? `${count} notifications` : 'No notifications'}
        className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title={count ? `${count} notification${count > 1 ? 's' : ''}` : 'No notifications'}
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
              <h4 className="text-sm font-bold">Notifications</h4>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{count} new</span>
                <button onClick={() => setOpen(false)} aria-label="Close notifications" className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto max-h-[65vh]">
              {!hasAnything ? (
                <div className="p-8 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto mb-3">
                    <Bell className="w-6 h-6 text-muted-foreground/40" />
                  </div>
                  <p className="text-sm font-medium text-foreground">You're all caught up</p>
                  <p className="text-xs text-muted-foreground mt-1">New notifications will appear here.</p>
                </div>
              ) : (
                <div>
                  {/* Project invitations */}
                  {invites.length > 0 && (
                    <div className="border-b border-border/60">
                      <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Invitations</span>
                      </div>
                      <div className="divide-y divide-border/50">
                        {invites.map(n => {
                          const data = parseData(n.data);
                          const requestId = Number(data.requestId);
                          const busy = busyInvite === n.id;
                          return (
                            <div key={n.id} className="p-3 space-y-2.5">
                              <div className="flex items-start gap-2.5">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <Mail className="w-4 h-4 text-primary" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs font-semibold text-foreground">
                                    {data.projectName ? `Invitation to ${data.projectName}` : n.title}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground mt-0.5 break-words">
                                    {data.ownerName ? `${data.ownerName} invited you to join this project.` : n.message}
                                  </p>
                                  {(data.inviteCode || data.inviteLink) && (
                                    <div className="mt-2 flex items-center gap-1.5 p-1.5 rounded-lg bg-muted/60 border border-border/60 text-[11px]">
                                      <span className="text-muted-foreground truncate flex-1 font-mono text-[10px]">
                                        {window.location.origin}/projects?join={data.inviteCode}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigator.clipboard.writeText(`${window.location.origin}/projects?join=${data.inviteCode}`);
                                          toast({ title: 'Link copied', description: 'Invite link copied to clipboard.' });
                                        }}
                                        className="p-1 rounded hover:bg-muted text-primary font-medium flex items-center gap-1 flex-shrink-0 text-[10px]"
                                        title="Copy invite link"
                                      >
                                        <Copy className="w-3 h-3" /> Copy
                                      </button>
                                    </div>
                                  )}
                                  <p className="text-[10px] text-muted-foreground/70 mt-1">{relativeTime(n.createdAt)}</p>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => requestId && respondToInvite(n.id, requestId, 'accept')}
                                  disabled={busy || !requestId}
                                  className="flex-1 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1"
                                >
                                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Accept
                                </button>
                                <button
                                  onClick={() => requestId && respondToInvite(n.id, requestId, 'decline')}
                                  disabled={busy || !requestId}
                                  className="flex-1 py-1.5 bg-muted border border-border rounded-lg text-xs font-semibold hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 disabled:opacity-50 flex items-center justify-center gap-1"
                                >
                                  <X className="w-3 h-3" /> Decline
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Overdue tasks and notes (same alerts as the pop-ups) */}
                  {overdue.length > 0 && (
                    <div className="border-b border-border/60">
                      <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Overdue</span>
                      </div>
                      <div className="divide-y divide-border/50">
                        {overdue.map(item => (
                          <div key={`${item.source}-${item.id}`} className="px-4 py-2.5 flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                              <CalendarClock className="w-3.5 h-3.5 text-destructive" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-foreground truncate">{item.title}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {item.source} was due {item.dueDate}{item.dueTime ? ` at ${item.dueTime}` : ''}
                              </p>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold flex-shrink-0">Overdue</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pending admin changes */}
                  {pendings.length > 0 && (
                    <div className="border-b border-border/60">
                      <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Pending approvals</span>
                      </div>
                      <div className="divide-y divide-border/50">
                        {pendings.map(p => (
                          <div key={p.id} className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground capitalize">{p.changeType} change</p>
                                <p className="text-xs text-muted-foreground break-words">{formatPayload(p)}</p>
                              </div>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 flex items-center gap-1 flex-shrink-0">
                                <Clock className="w-3 h-3" /> {timeLeft(p.expiresAt)}
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">Approve or deny this pending request.</p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAction(p.id, 'approve')}
                                disabled={loading}
                                className="flex-1 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1"
                              >
                                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
                              </button>
                              <button
                                onClick={() => handleAction(p.id, 'deny')}
                                disabled={loading}
                                className="flex-1 py-1.5 bg-muted border border-border rounded-lg text-xs font-semibold hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 disabled:opacity-50 flex items-center justify-center gap-1"
                              >
                                <X className="w-3 h-3" /> Deny
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Activity / other notifications */}
                  {otherNotifications.length > 0 && (
                    <div>
                      <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                        <Inbox className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Updates</span>
                      </div>
                      <div className="divide-y divide-border/50">
                        {otherNotifications.map(n => {
                          const isSmart = n.type === 'smart_alert';
                          const isNormal = n.type === 'normal_alert';
                          return (
                            <div key={n.id} className="px-4 py-3 flex items-start gap-2.5">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${isSmart ? 'bg-purple-500/15' : isNormal ? 'bg-amber-500/15' : n.read ? 'bg-muted/60' : 'bg-primary/10'}`}>
                                {isSmart ? (
                                  <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                                ) : isNormal ? (
                                  <CalendarClock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                ) : (
                                  <CheckCheck className={`w-3.5 h-3.5 ${n.read ? 'text-muted-foreground' : 'text-primary'}`} />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                                    <p className={`text-xs ${n.read ? 'font-medium text-foreground/80' : 'font-semibold text-foreground'}`}>{n.title}</p>
                                    {isSmart && (
                                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400">AI</span>
                                    )}
                                  </div>
                                  <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">{relativeTime(n.createdAt)}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5 break-words">{n.message}</p>
                              </div>
                              {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default NotificationBell;
