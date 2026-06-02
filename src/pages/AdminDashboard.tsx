import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  DollarSign, 
  Users, 
  CreditCard, 
  Ticket, 
  TrendingUp, 
  Calendar, 
  Trash2, 
  Plus, 
  Settings, 
  Check, 
  Activity,
  X,
  Target,
  CheckSquare,
  BarChart3,
  Eye,
  MessageSquare,
  Bell,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import TicketConversation from '@/components/TicketConversation';

interface AdminStats {
  summary: {
    totalUsers: number;
    totalEarnings: number;
    activeSubscriptions: number;
    totalCouponsUsed: number;
  };
  recentTransactions: any[];
}

interface Coupon {
  id: number;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  restrictedToEmail: string | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
}

interface SystemSetting {
  id: number;
  key: string;
  value: string;
  description: string;
}

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'coupons' | 'settings' | 'users' | 'tickets'>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userDetails, setUserDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Coupon Form State
  const [isAddingCoupon, setIsAddingCoupon] = useState(false);
  const [newCoupon, setNewCoupon] = useState({
    code: '',
    discountType: 'percentage',
    discountValue: 0,
    maxUses: '',
    restrictedToEmail: '',
    expiresAt: ''
  });

  useEffect(() => {
    fetchData();
  }, []);
  
  interface User {
    id: number;
    name: string;
    email: string;
    tier: string;
    status: string;
    createdAt: string;
  }

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, couponsRes, settingsRes, usersRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/coupons'),
        fetch('/api/admin/settings'),
        fetch('/api/admin/users')
      ]);
      
      // Check if any requests failed
      const responses = [statsRes, couponsRes, settingsRes, usersRes];
      const hasError = responses.some(res => !res.ok);
      
      if (hasError) {
        throw new Error('One or more API requests failed');
      }

      if (statsRes.ok) setStats(await statsRes.json());
      if (couponsRes.ok) setCoupons(await couponsRes.json());
      if (settingsRes.ok) setSettings(await settingsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
    } catch (error) {
      console.error('Error fetching admin data:', error);
      setError('Failed to load admin data. Please check console for details.');
      toast({ 
        title: 'Error', 
        description: 'Failed to fetch admin data. Please refresh the page.', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newCoupon,
          discountValue: Number(newCoupon.discountValue),
          maxUses: newCoupon.maxUses ? Number(newCoupon.maxUses) : null
        })
      });

      if (res.ok) {
        toast({ title: 'Success', description: 'Coupon created successfully' });
        setIsAddingCoupon(false);
        setNewCoupon({ code: '', discountType: 'percentage', discountValue: 0, maxUses: '', restrictedToEmail: '', expiresAt: '' });
        fetchData();
      } else {
        const errorData = await res.json();
        toast({ 
          title: 'Error', 
          description: errorData.error || 'Failed to create coupon', 
          variant: 'destructive' 
        });
      }
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: 'Server error', 
        variant: 'destructive' 
      });
    }
  };

  const handleDeleteCoupon = async (id: number) => {
    if (!confirm('Are you sure you want to delete this coupon?')) return;
    try {
      const res = await fetch(`/api/admin/coupons/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast({ title: 'Success', description: 'Coupon deleted' });
        fetchData();
      } else {
        const errorData = await res.json();
        toast({ 
          title: 'Error', 
          description: errorData.error || 'Failed to delete coupon', 
          variant: 'destructive' 
        });
      }
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: 'Failed to delete coupon', 
        variant: 'destructive' 
      });
    }
  };

  const handleUpdateSetting = async (key: string, value: string) => {
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value })
      });
      if (res.ok) {
        toast({ title: 'Success', description: 'Setting updated' });
        fetchData();
      } else {
        const errorData = await res.json();
        toast({ 
          title: 'Error', 
          description: errorData.error || 'Failed to update setting', 
          variant: 'destructive' 
        });
      }
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: 'Failed to update setting', 
        variant: 'destructive' 
      });
    }
  };

  const handleUpdateUserTier = async (userId: number, tier: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/tier`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier })
      });
      if (res.ok) {
        toast({ title: 'Success', description: `User updated to ${tier.toUpperCase()}` });
        fetchData();
      } else {
        const errorData = await res.json();
        toast({ 
          title: 'Error', 
          description: errorData.error || 'Failed to update user tier', 
          variant: 'destructive' 
        });
      }
    } catch (error) {
      toast({ 
        title: 'Error', 
        description: 'Failed to update user tier', 
        variant: 'destructive' 
      });
    }
  };

  const [adminTickets, setAdminTickets] = useState<any[]>([]);
  const [activePanelTicket, setActivePanelTicket] = useState<any | null>(null);
  const [panelMessages, setPanelMessages] = useState<any[]>([]);
  const [sendingAdminMessage, setSendingAdminMessage] = useState(false);
  const [userDataPanel, setUserDataPanel] = useState<any | null>(null);
  const [userFullDetails, setUserFullDetails] = useState<any | null>(null);
  const [expandedUsage, setExpandedUsage] = useState<Set<string>>(new Set());

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/admin/tickets', { credentials: 'include' });
      if (res.ok) setAdminTickets(await res.json());
    } catch {}
  };

  useEffect(() => {
    if (activeTab === 'tickets') fetchTickets();
  }, [activeTab]);

  useEffect(() => {
    if (!activePanelTicket) return;
    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/admin/tickets/${activePanelTicket.id}/messages`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setPanelMessages(data.messages || []);
          setActivePanelTicket((prev: any) => prev ? { ...prev, ...data.ticket } : null);
          setAdminTickets(prev => prev.map((t: any) => t.id === data.ticket.id ? { ...t, ...data.ticket, unreadCount: 0 } : t));
        }
      } catch {}
    };
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [activePanelTicket?.id]);

  const handleAdminSendMessage = async (text: string) => {
    if (!activePanelTicket) return;
    setSendingAdminMessage(true);
    try {
      await fetch(`/api/admin/tickets/${activePanelTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text }),
      });
      const res = await fetch(`/api/admin/tickets/${activePanelTicket.id}/messages`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPanelMessages(data.messages || []);
        setActivePanelTicket((prev: any) => prev ? { ...prev, ...data.ticket } : null);
      }
    } catch {} finally {
      setSendingAdminMessage(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!activePanelTicket) return;
    await fetch(`/api/admin/tickets/${activePanelTicket.id}/close`, { method: 'PATCH', credentials: 'include' });
    setActivePanelTicket((prev: any) => prev ? { ...prev, status: 'closed' } : null);
    fetchTickets();
  };

  const handleViewUserData = async (userId: number) => {
    setUserDataPanel({ loading: true });
    try {
      const res = await fetch(`/api/admin/users/${userId}/full-details`, { credentials: 'include' });
      if (res.ok) setUserFullDetails(await res.json());
      setUserDataPanel({ open: true });
    } catch {
      setUserDataPanel(null);
    }
  };

  const TYPE_COLORS: Record<string, string> = {
    suggestion: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    bug: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    report: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    support: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  };

  const fetchUserDetails = async (user: User) => {
    setSelectedUser(user);
    setUserDetails(null);
    try {
      const [tasksRes, goalsRes] = await Promise.all([
        fetch(`/api/admin/users/${user.id}/tasks`),
        fetch(`/api/admin/users/${user.id}/goals`),
      ]);
      const tasks = tasksRes.ok ? await tasksRes.json() : [];
      const goals = goalsRes.ok ? await goalsRes.json() : [];
      setUserDetails({ tasks, goals });
    } catch (err) {
      console.error('Error fetching user details:', err);
      setUserDetails({ tasks: [], goals: [] });
    }
  };

  if (loading && !stats) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center">
          <Activity className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-lg font-medium">Loading admin dashboard...</p>
          <p className="text-muted-foreground mt-2">Verifying admin permissions</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-4">
            <ShieldCheck className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-6">
            You don't have permission to access the admin dashboard. Contact an administrator if you believe this is an error.
          </p>
          <button 
            onClick={() => window.location.href = '/'} 
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background/50 p-8 pt-12 relative">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <ShieldCheck className="w-10 h-10 text-primary" />
              Admin Center
            </h1>
            <p className="text-muted-foreground mt-2">Manage your platform features, coupons, and see real-time performance.</p>
          </div>
          <div className="flex items-center gap-2 bg-muted p-1 rounded-xl flex-wrap">
            {(['overview', 'coupons', 'settings', 'users', 'tickets'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 rounded-lg capitalize transition-all flex items-center gap-1.5 ${
                  activeTab === tab 
                  ? 'bg-background text-foreground shadow-sm shadow-black/5' 
                  : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab}
                {tab === 'tickets' && adminTickets.some((t: any) => t.unreadCount > 0) && (
                  <span className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Total Earnings', value: `$${stats?.summary.totalEarnings.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
                { label: 'Total Users', value: stats?.summary.totalUsers.toLocaleString(), icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                { label: 'Active Subscriptions', value: stats?.summary.activeSubscriptions, icon: CreditCard, color: 'text-purple-500', bg: 'bg-purple-500/10' },
                { label: 'Coupons Redeemed', value: stats?.summary.totalCouponsUsed, icon: Ticket, color: 'text-orange-500', bg: 'bg-orange-500/10' },
              ].map((stat, i) => (
                <div key={i} className="glass card-hover-effect rounded-3xl p-6 border-white/10 dark:border-white/5 shadow-xl shadow-black/5">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-2xl ${stat.bg}`}>
                      <stat.icon className={`w-6 h-6 ${stat.color}`} />
                    </div>
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <h3 className="text-3xl font-bold mt-1">{stat.value}</h3>
                </div>
              ))}
            </div>

            {/* Recent Activity Table */}
            <div className="glass rounded-3xl p-8 border-white/10 dark:border-white/5 shadow-xl shadow-black/5">
              <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                Recent Transactions
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-muted-foreground border-b border-white/5">
                      <th className="pb-4 font-medium italic">User ID</th>
                      <th className="pb-4 font-medium italic">Amount</th>
                      <th className="pb-4 font-medium italic">Status</th>
                      <th className="pb-4 font-medium italic">Date</th>
                      <th className="pb-4 font-medium italic">Transaction ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {stats?.recentTransactions?.map((tx: any) => (
                      <tr key={tx.id} className="group hover:bg-white/5 transition-colors">
                        <td className="py-4 font-medium">{tx.userId}</td>
                        <td className="py-4 text-emerald-500 font-bold">${(tx.amount / 100).toFixed(2)}</td>
                        <td className="py-4">
                          <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-500">
                            {tx.status}
                          </span>
                        </td>
                        <td className="py-4 text-muted-foreground">{format(new Date(tx.createdAt), 'MMM dd, HH:mm')}</td>
                        <td className="py-4 text-xs font-mono text-muted-foreground">{tx.providerTransactionId}</td>
                      </tr>
                    ))}
                    {(!stats?.recentTransactions || stats.recentTransactions.length === 0) && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-muted-foreground italic">
                          No transactions found yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'coupons' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center bg-primary/5 p-6 rounded-3xl border border-primary/10">
              <div>
                <h2 className="text-2xl font-bold italic">Promotions & Discounts</h2>
                <p className="text-muted-foreground">Create and manage active coupon codes for your users.</p>
              </div>
              <button 
                onClick={() => setIsAddingCoupon(true)}
                className="bg-primary text-primary-foreground px-6 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
              >
                <Plus className="w-5 h-5" />
                New Coupon
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {coupons.map(coupon => (
                <div key={coupon.id} className="glass rounded-3xl p-6 border-white/10 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => handleDeleteCoupon(coupon.id)}
                      className="p-2 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-3 mb-6">
                    <div className="bg-primary/20 p-2 rounded-xl">
                      <Ticket className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xl font-black italic tracking-tighter">{coupon.code}</h3>
                      <p className="text-xs text-muted-foreground uppercase font-bold letter-spacing-widest">
                        {coupon.discountType === 'percentage' ? `${coupon.discountValue}% OFF` : `$${coupon.discountValue} OFF`}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground italic">Redemptions</span>
                      <span className="font-bold">{coupon.usedCount} / {coupon.maxUses || '∞'}</span>
                    </div>
                    {coupon.restrictedToEmail && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground italic">Restricted to</span>
                        <span className="font-bold text-xs">{coupon.restrictedToEmail}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground italic">Expires</span>
                      <span className="font-bold">{coupon.expiresAt ? format(new Date(coupon.expiresAt), 'MMM dd, yyyy') : 'Never'}</span>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                      coupon.active ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                    }`}>
                      {coupon.active ? 'Active' : 'Disabled'}
                    </span>
                    <button className="text-primary text-xs font-bold hover:underline">Edit Details</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="glass rounded-[2rem] overflow-hidden border-white/10 shadow-2xl">
              <div className="p-8 bg-primary/5 border-b border-white/5">
                <h2 className="text-2xl font-black italic flex items-center gap-2">
                  <Settings className="w-6 h-6 text-primary" />
                  System Configuration & Feature Gating
                </h2>
                <p className="text-muted-foreground">Adjust platform parameters and control feature access levels in real-time.</p>
              </div>

              <div className="divide-y divide-white/5 p-4">
                {[
                  { key: 'price_pro_monthly', label: 'Pro Tier Price (Monthly)', desc: 'Set the monthly price for the Pro subscription tier.', type: 'number' },
                  { key: 'price_premium_monthly', label: 'Premium Tier Price (Monthly)', desc: 'Set the monthly price for the Premium subscription tier.', type: 'number' },
                  { key: 'feature_ai_tier', label: 'AI Features Gating', desc: 'Minimum tier required for AI Insights and Assistant (free/pro/premium).', type: 'select', options: ['free', 'pro', 'premium'] },
                  { key: 'feature_collaboration_tier', label: 'Collaboration Gating', desc: 'Minimum tier required for Team Workspaces and Collaboration.', type: 'select', options: ['free', 'pro', 'premium'] },
                ].map((setting) => {
                  const dbSetting = settings.find(s => s.key === setting.key);
                  return (
                    <div key={setting.key} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:bg-white/5 transition-all">
                      <div className="max-w-md">
                        <h4 className="font-bold text-lg">{setting.label}</h4>
                        <p className="text-sm text-muted-foreground italic">{setting.desc}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        {setting.type === 'select' ? (
                          <select 
                            className="bg-background border border-white/10 rounded-xl px-4 py-2 font-medium"
                            value={dbSetting?.value || 'pro'}
                            onChange={(e) => handleUpdateSetting(setting.key, e.target.value)}
                          >
                            {setting.options?.map(opt => <option key={opt} value={opt}>{opt.toUpperCase()}</option>)}
                          </select>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">$</span>
                            <input 
                              type="number" 
                              className="bg-background border border-white/10 rounded-xl px-4 py-2 w-24 font-bold text-center"
                              defaultValue={dbSetting?.value || '9.99'}
                              onBlur={(e) => handleUpdateSetting(setting.key, e.target.value)}
                            />
                          </div>
                        )}
                        <span className="text-emerald-500 flex items-center gap-1 text-xs font-bold">
                          <Check className="w-4 h-4" />
                          Live
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="glass rounded-[2rem] overflow-hidden border-white/10 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-8 bg-primary/5 border-b border-white/5">
              <h2 className="text-2xl font-black italic flex items-center gap-2">
                <Users className="w-6 h-6 text-primary" />
                User Management
              </h2>
              <p className="text-muted-foreground">Monitor your users and manually adjust their status or access levels.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-muted-foreground border-b border-white/5 bg-white/5">
                    <th className="p-4 font-bold uppercase text-xs italic tracking-widest pl-8">Name</th>
                    <th className="p-4 font-bold uppercase text-xs italic tracking-widest">Email</th>
                    <th className="p-4 font-bold uppercase text-xs italic tracking-widest text-center">Tier</th>
                    <th className="p-4 font-bold uppercase text-xs italic tracking-widest text-center">Status</th>
                    <th className="p-4 font-bold uppercase text-xs italic tracking-widest text-right pr-8">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 pl-8 font-bold">
                        <button onClick={() => fetchUserDetails(u)} className="hover:text-primary transition-colors flex items-center gap-1">
                          {u.name}
                          <Eye className="w-3 h-3 opacity-50" />
                        </button>
                      </td>
                      <td className="p-4 text-muted-foreground">{u.email}</td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                          u.tier === 'premium' ? 'bg-amber-500/10 text-amber-500' :
                          u.tier === 'pro' ? 'bg-primary/10 text-primary' :
                          'bg-muted text-muted-foreground'
                        }`}>
                          {u.tier === 'premium' ? 'Premium' : u.tier === 'pro' ? 'Pro' : u.tier}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                          u.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                        }`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="p-4 text-right pr-8">
                        <select 
                          className="bg-background border border-white/10 rounded-lg px-2 py-1 text-xs font-bold"
                          value={u.tier}
                          onChange={(e) => handleUpdateUserTier(u.id, e.target.value)}
                        >
                          <option value="free">FREE</option>
                          <option value="pro">PRO</option>
                          <option value="premium">PREMIUM</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card w-full max-w-2xl rounded-2xl p-6 border border-border shadow-2xl animate-in zoom-in-95 duration-200 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-foreground">{selectedUser.name}</h3>
                <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
              </div>
              <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-muted rounded-full transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="p-3 bg-primary/5 border border-primary/10 rounded-xl text-center">
                <BarChart3 className="w-4 h-4 text-primary mx-auto mb-1" />
                <div className="text-lg font-bold text-foreground">{userDetails?.tasks?.length || 0}</div>
                <div className="text-[10px] text-muted-foreground uppercase font-bold">Tasks</div>
              </div>
              <div className="p-3 bg-label-green/5 border border-label-green/10 rounded-xl text-center">
                <Target className="w-4 h-4 text-label-green mx-auto mb-1" />
                <div className="text-lg font-bold text-foreground">{userDetails?.goals?.length || 0}</div>
                <div className="text-[10px] text-muted-foreground uppercase font-bold">Goals</div>
              </div>
              <div className="p-3 bg-label-blue/5 border border-label-blue/10 rounded-xl text-center">
                <CheckSquare className="w-4 h-4 text-label-blue mx-auto mb-1" />
                <div className="text-lg font-bold text-foreground">
                  {userDetails?.tasks?.filter((t: any) => t.columnId?.toLowerCase().includes('done')).length || 0}
                </div>
                <div className="text-[10px] text-muted-foreground uppercase font-bold">Completed</div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-primary" /> Tasks
                </h4>
                {userDetails?.tasks?.length ? (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {userDetails.tasks.map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg text-xs">
                        <span className="text-foreground font-medium">{t.title}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          t.priority === 'urgent' ? 'bg-red-500/10 text-red-500' :
                          t.priority === 'high' ? 'bg-orange-500/10 text-orange-500' :
                          t.priority === 'medium' ? 'bg-yellow-500/10 text-yellow-500' :
                          'bg-muted text-muted-foreground'
                        }`}>{t.priority || 'none'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No tasks found.</p>
                )}
              </div>

              <div>
                <h4 className="text-sm font-bold text-foreground mb-2 flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" /> Goals
                </h4>
                {userDetails?.goals?.length ? (
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {userDetails.goals.map((g: any) => (
                      <div key={g.id} className="flex items-center justify-between p-2 bg-muted/30 rounded-lg text-xs">
                        <span className="text-foreground font-medium">{g.title}</span>
                        <span className="text-muted-foreground">{g.progress || 0}/{g.target || 100} {g.unit || ''}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No goals found.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Coupon Modal */}
      {isAddingCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form 
            onSubmit={handleCreateCoupon}
            className="bg-card w-full max-w-lg rounded-2xl p-6 border border-border shadow-2xl animate-in zoom-in-95 duration-200"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-foreground">Create Coupon</h3>
                <p className="text-sm text-muted-foreground">Generate a discount code for your users</p>
              </div>
              <button 
                type="button" 
                onClick={() => setIsAddingCoupon(false)} 
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            
            <div className="space-y-5">
              {/* Coupon Code */}
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Coupon Code</label>
                <input 
                  required
                  type="text" 
                  placeholder="e.g. SUMMER2026"
                  className="w-full bg-background border border-input rounded-lg px-4 py-3 font-mono text-lg font-semibold uppercase tracking-wider focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  value={newCoupon.code}
                  onChange={e => setNewCoupon({...newCoupon, code: e.target.value.toUpperCase()})}
                />
                <p className="text-xs text-muted-foreground mt-1">Code will be converted to uppercase</p>
              </div>
              
              {/* Discount Type & Value */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Discount Type</label>
                  <select 
                    className="w-full bg-background border border-input rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all cursor-pointer"
                    value={newCoupon.discountType}
                    onChange={e => setNewCoupon({...newCoupon, discountType: e.target.value as any})}
                  >
                    <option value="percentage">Percentage (%)</option>
                    <option value="fixed">Fixed Amount ($)</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">
                    {newCoupon.discountType === 'percentage' ? 'Discount %' : 'Amount ($)'}
                  </label>
                  <div className="relative">
                    {newCoupon.discountType === 'fixed' && (
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    )}
                    <input 
                      required
                      type="number" 
                      min="0"
                      max={newCoupon.discountType === 'percentage' ? '100' : undefined}
                      placeholder={newCoupon.discountType === 'percentage' ? '20' : '10'}
                      className={`w-full bg-background border border-input rounded-lg ${newCoupon.discountType === 'fixed' ? 'pl-8' : 'pl-4'} pr-4 py-3 font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all`}
                      value={newCoupon.discountValue || ''}
                      onChange={e => setNewCoupon({...newCoupon, discountValue: Number(e.target.value)})}
                    />
                    {newCoupon.discountType === 'percentage' && (
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Max Uses & Expiry */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Usage Limit</label>
                  <input 
                    type="number" 
                    min="1"
                    placeholder="Unlimited"
                    className="w-full bg-background border border-input rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    value={newCoupon.maxUses}
                    onChange={e => setNewCoupon({...newCoupon, maxUses: e.target.value})}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Leave empty for unlimited</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Expiry Date</label>
                  <input 
                    type="date" 
                    className="w-full bg-background border border-input rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all cursor-pointer"
                    value={newCoupon.expiresAt}
                    onChange={e => setNewCoupon({...newCoupon, expiresAt: e.target.value})}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Optional expiry date</p>
                </div>
              </div>

              {/* Restricted Email */}
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">
                  Restrict to Email <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <input 
                  type="email" 
                  placeholder="Only this user can redeem"
                  className="w-full bg-background border border-input rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  value={newCoupon.restrictedToEmail}
                  onChange={e => setNewCoupon({...newCoupon, restrictedToEmail: e.target.value})}
                />
                <p className="text-xs text-muted-foreground mt-1">Leave empty for public use</p>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button 
                type="button"
                onClick={() => setIsAddingCoupon(false)}
                className="flex-1 px-4 py-3 bg-muted text-foreground font-medium rounded-xl hover:bg-muted/80 transition-all"
              >
                Cancel
              </button>
              <button 
                type="submit"
                className="flex-1 px-4 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
              >
                Create Coupon
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'tickets' && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Support Tickets</h2>
            <button onClick={fetchTickets} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 bg-muted rounded-lg transition-colors">Refresh</button>
          </div>
          {adminTickets.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No tickets submitted yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {adminTickets.filter((t: any) => t.status === 'open').map((ticket: any) => (
                <button
                  key={ticket.id}
                  onClick={() => setActivePanelTicket(ticket)}
                  className={`w-full flex items-center justify-between p-4 bg-card border rounded-xl hover:bg-muted/50 transition-colors text-left ${activePanelTicket?.id === ticket.id ? 'border-primary' : 'border-border'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {ticket.unreadCount > 0 && <span className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />}
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${TYPE_COLORS[ticket.type] || 'bg-muted text-muted-foreground'}`}>{ticket.type}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{ticket.subject}</p>
                      <p className="text-xs text-muted-foreground">{ticket.userName} · {ticket.userEmail}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    <span className="text-xs text-muted-foreground hidden sm:block">{ticket.createdAt ? format(new Date(ticket.createdAt), 'MMM d, HH:mm') : ''}</span>
                    {!ticket.staffReplied && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">New</span>}
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Open</span>
                  </div>
                </button>
              ))}
              {adminTickets.filter((t: any) => t.status === 'closed').length > 0 && (
                <>
                  <p className="text-xs font-semibold text-muted-foreground pt-4 pb-1 uppercase tracking-wider">Resolved</p>
                  {adminTickets.filter((t: any) => t.status === 'closed').map((ticket: any) => (
                    <button
                      key={ticket.id}
                      onClick={() => setActivePanelTicket(ticket)}
                      className={`w-full flex items-center justify-between p-4 bg-card border rounded-xl hover:bg-muted/50 transition-colors text-left opacity-60 ${activePanelTicket?.id === ticket.id ? 'border-primary opacity-100' : 'border-border'}`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${TYPE_COLORS[ticket.type] || 'bg-muted text-muted-foreground'}`}>{ticket.type}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{ticket.subject}</p>
                          <p className="text-xs text-muted-foreground">{ticket.userName}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                        <span className="text-xs text-muted-foreground hidden sm:block">{ticket.closedAt ? format(new Date(ticket.closedAt), 'MMM d') : ''}</span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Closed</span>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}
    {activePanelTicket && (
      <TicketConversation
          ticket={{ ...activePanelTicket, userName: activePanelTicket.userName }}
          messages={panelMessages}
          viewAs="admin"
          currentUserName="Support"
          onClose={() => { setActivePanelTicket(null); setPanelMessages([]); }}
          onCloseTicket={handleCloseTicket}
          onSendMessage={handleAdminSendMessage}
          onUserNameClick={() => activePanelTicket?.userId && handleViewUserData(activePanelTicket.userId)}
          sending={sendingAdminMessage}
        />
      )}

      {userDataPanel?.open && userFullDetails && userFullDetails.user && (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-end" onClick={() => { setUserDataPanel(null); setUserFullDetails(null); }}>
        <div className="w-[440px] h-full bg-card overflow-y-auto shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
            <h2 className="text-base font-bold">User Details</h2>
            <button onClick={() => { setUserDataPanel(null); setUserFullDetails(null); }} className="p-1 hover:bg-muted rounded-lg transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
          <div className="p-6 space-y-5 flex-1">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                {(userFullDetails.user.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-foreground">{userFullDetails.user.name}</p>
                <p className="text-sm text-muted-foreground">{userFullDetails.user.email}</p>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${userFullDetails.user.tier === 'premium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' : userFullDetails.user.tier === 'pro' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-muted text-muted-foreground'}`}>
                  {userFullDetails.user.tier}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Tasks', value: userFullDetails.stats.tasks },
                { label: 'Goals', value: userFullDetails.stats.goals },
                { label: 'Habits', value: userFullDetails.stats.habits },
              ].map(s => (
                <div key={s.label} className="bg-muted/50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Feature Usage</p>
              {[
                { id: 'tasks', label: 'Tasks', items: [
                  { label: 'Total tasks', value: userFullDetails.featureUsage.tasks.total },
                  { label: 'Completed', value: userFullDetails.featureUsage.tasks.completed },
                  { label: 'Checklists', value: userFullDetails.featureUsage.tasks.checklists },
                  { label: 'Attachments', value: userFullDetails.featureUsage.tasks.attachments },
                  { label: 'Deep focus sessions', value: userFullDetails.featureUsage.tasks.deepFocusSessions },
                ]},
                { id: 'projects', label: 'Projects', items: [
                  { label: 'Boards', value: userFullDetails.featureUsage.projects.boards },
                  { label: 'Whiteboards', value: userFullDetails.featureUsage.projects.whiteboards },
                ]},
                { id: 'goals', label: 'Goals', items: [
                  { label: 'Goals created', value: userFullDetails.featureUsage.goals.total },
                  { label: 'Goals completed', value: userFullDetails.featureUsage.goals.completed },
                ]},
                { id: 'habits', label: 'Habits', items: [
                  { label: 'Habits created', value: userFullDetails.featureUsage.habits.total },
                  { label: 'Total completions', value: userFullDetails.featureUsage.habits.totalCompletions },
                  { label: 'Highest streak', value: userFullDetails.featureUsage.habits.highestStreak },
                ]},
                { id: 'notes', label: 'Notes', items: [
                  { label: 'Notes created', value: userFullDetails.featureUsage.notes.total },
                  { label: 'Tags created', value: userFullDetails.featureUsage.notes.tags },
                  { label: 'Pinned notes', value: userFullDetails.featureUsage.notes.pinned },
                ]},
                { id: 'whiteboard', label: 'Whiteboard', items: [
                  { label: 'Whiteboards created', value: userFullDetails.featureUsage.whiteboard.whiteboardsCreated },
                  ...Object.entries(userFullDetails.featureUsage.whiteboard.items || {}).map(([k, v]) => ({ label: k, value: v as number })),
                ]},
                { id: 'ai', label: 'AI Assistant', items: [
                  { label: 'Total AI messages', value: userFullDetails.featureUsage.ai.totalMessages },
                ]},
              ].map(section => (
                <div key={section.id} className="border border-border rounded-xl overflow-hidden mb-2">
                  <button
                    onClick={() => setExpandedUsage(prev => { const next = new Set(prev); next.has(section.id) ? next.delete(section.id) : next.add(section.id); return next; })}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold hover:bg-muted transition-colors"
                  >
                    {section.label}
                    {expandedUsage.has(section.id) ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {expandedUsage.has(section.id) && (
                    <div className="border-t border-border divide-y divide-border/50">
                      {section.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2">
                          <span className="text-xs text-muted-foreground">{item.label}</span>
                          <span className="text-xs font-bold text-foreground">{item.value ?? 0}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )}
    </div>
  );
};

export default AdminDashboard;
