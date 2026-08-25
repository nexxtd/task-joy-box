import React, { useEffect, useState } from 'react';
import { Bell, Check, X, Clock, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface PendingChange {
  id: number;
  changeType: string;
  payload: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

export const NotificationBell: React.FC = () => {
  const [pendings, setPendings] = useState<PendingChange[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchPendings = async () => {
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPendings(data.pendings || []);
      }
    } catch {}
  };

  useEffect(() => {
    fetchPendings();
    const id = setInterval(fetchPendings, 15000);
    return () => clearInterval(id);
  }, []);

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

  const formatPayload = (p: PendingChange) => {
    try {
      const data = JSON.parse(p.payload);
      if (p.changeType === 'email' && data.email) return `Email → ${data.email}`;
      if (p.changeType === 'password') return 'Password change';
      if (p.changeType === 'subscription' || p.changeType === 'tier') return `Plan → ${data.tier || data.status || 'free'}`;
      return Object.entries(data).map(([k,v]) => `${k}: ${String(v)}`).join(', ');
    } catch { return p.changeType; }
  };

  const timeLeft = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'auto-approving...';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m left`;
  };

  const count = pendings.length;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        title={count ? `${count} pending approval${count>1?'s':''}` : 'No notifications'}
      >
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
            {count}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-2 sm:right-0 top-full mt-2 w-80 max-w-[calc(100vw-16px)] bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden -translate-x-1">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h4 className="text-sm font-bold">Notifications</h4>
              <span className="text-xs text-muted-foreground">{count} pending</span>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {count === 0 ? (
                <div className="p-6 text-center">
                  <Bell className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-xs text-muted-foreground">No pending approvals</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1">Admin changes will appear here for 24h before auto-approval.</p>
                </div>
              ) : (
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
                      <p className="text-[11px] text-muted-foreground">Approve or deny — auto-approves in 24h if no action.</p>
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
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
