import React from 'react';
import { CheckIcon, Sparkles, Zap, Shield, Crown, DollarSign } from 'lucide-react';

// ──────────────────────────────────────────────────────────────────────────────
// Plan definitions — exactly matching the user's spec
// ──────────────────────────────────────────────────────────────────────────────
const FREE_FEATURES: { text: string; badge?: string }[] = [
  { text: 'Basic task list & Simple daily planner' },
  { text: 'Limited projects (1–2 active)', badge: '2 max' },
  { text: 'Basic calendar view' },
  { text: 'Cloud sync across devices' },
  { text: 'Manual progress tracking' },
  { text: 'Simple notes section & Goals' },
];

const PRO_FEATURES: { text: string; badge?: string }[] = [
  { text: 'Everything in Free' },
  { text: 'Unlimited tasks and projects', badge: 'No limits' },
  { text: 'Auto-schedule calendar system', badge: 'Smart scheduling' },
  { text: 'Smart reminders and notifications', badge: 'Push & email' },
  { text: 'Dedicated Habit tracker', badge: 'Daily streaks' },
  { text: 'Cloud-synced Notes section', badge: 'Synced everywhere' },
  { text: 'Custom task categories (Labels)', badge: 'Colour labels' },
  { text: 'Full cloud synchronization', badge: 'All devices' },
];

const PREMIUM_FEATURES: { text: string; badge?: string }[] = [
  { text: 'Everything in Pro' },
  { text: 'AI Planning Assistant', badge: 'Schedule suggestions' },
  { text: 'AI Task Prioritisation', badge: 'Smart reordering' },
  { text: 'Advanced Analytics & Productivity Tracking', badge: 'Weekly insights' },
  { text: 'Goal tracking with progress charts', badge: 'Visual charts' },
  { text: 'Full Team/Family Collaboration', badge: 'Share & delegate' },
  { text: 'Personalised Themes (Colors & Fonts)', badge: 'Fonts, colours & layouts' },
  { text: 'File attachments on tasks', badge: 'Up to 50 MB/file' },
  { text: 'Priority 24/7 Support', badge: 'Fastest response' },
];

// ──────────────────────────────────────────────────────────────────────────────
// Feature row
// ──────────────────────────────────────────────────────────────────────────────
const Feature = ({ text, badge }: { text: string; badge?: string }) => (
  <li className="flex items-start gap-3 py-1">
    <CheckIcon className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
    <span className="text-sm text-muted-foreground flex-1">{text}</span>
    {badge && (
      <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary whitespace-nowrap flex-shrink-0">
        {badge}
      </span>
    )}
  </li>
);

// ──────────────────────────────────────────────────────────────────────────────
// PayPal checkout helper
// ──────────────────────────────────────────────────────────────────────────────
async function startPayPalCheckout(tier: string, planType = 'personal', seats = 1) {
  try {
    const res = await fetch('/api/payment/create-checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, planType, seats }),
      credentials: 'include',
    });
    
    if (res.status === 401) {
      // User is not authenticated, redirect to login
      window.location.href = '/login';
      return;
    }
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to start checkout');
    if (data.approvalUrl) window.location.href = data.approvalUrl;
    else throw new Error('No PayPal approval URL returned');
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Checkout failed. Please try again.');
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main pricing page
// ──────────────────────────────────────────────────────────────────────────────
const PricingPage = () => {
  return (
    <div className="h-full overflow-y-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-14">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Start free. Upgrade whenever you need more power.
          </p>
          <div className="inline-flex items-center gap-2 mt-5 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-sm font-medium">
            <DollarSign className="w-4 h-4" />
            Secure payments via PayPal
          </div>
        </div>

        {/* ── 3 Plan Cards ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">

          {/* FREE */}
          <div className="rounded-2xl border border-border bg-card p-8 flex flex-col gap-6 shadow-sm hover:shadow-md transition-shadow">
            <div>
              <div className="w-11 h-11 rounded-xl bg-slate-500/10 flex items-center justify-center mb-4">
                <Shield className="w-5 h-5 text-slate-500" />
              </div>
              <h2 className="text-2xl font-bold">Free</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Good for basic users who just need simple organisation.
              </p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">$0</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </div>
            <ul className="space-y-1 flex-1">
              {FREE_FEATURES.map((f, i) => <Feature key={i} {...f} />)}
            </ul>
            <button
              disabled
              className="w-full py-2.5 border border-border rounded-xl text-sm font-semibold text-muted-foreground cursor-default"
            >
              Current Plan
            </button>
          </div>

          {/* PRO — Most Popular */}
          <div className="rounded-2xl border-2 border-blue-500 bg-card p-8 flex flex-col gap-6 shadow-xl shadow-blue-500/10 scale-[1.03] relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white text-[11px] font-bold px-4 py-1.5 rounded-full shadow-lg uppercase tracking-wider">
                Most Popular
              </span>
            </div>
            <div>
              <div className="w-11 h-11 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
                <Zap className="w-5 h-5 text-blue-500" />
              </div>
              <h2 className="text-2xl font-bold">Pro</h2>
              <p className="text-sm text-muted-foreground mt-1">
                The standard for advanced productivity.
              </p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">$4.99</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
            </div>
            <ul className="space-y-1 flex-1">
              {PRO_FEATURES.map((f, i) => <Feature key={i} {...f} />)}
            </ul>
            <button
              onClick={() => startPayPalCheckout('pro', 'personal')}
              className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <DollarSign className="inline w-4 h-4 mr-1" />
              Get Pro
            </button>
          </div>

          {/* PREMIUM */}
          <div className="rounded-2xl border border-purple-400/60 bg-card p-8 flex flex-col gap-6 shadow-sm hover:shadow-lg hover:shadow-purple-500/10 transition-shadow">
            <div>
              <div className="w-11 h-11 rounded-xl bg-purple-500/10 flex items-center justify-center mb-4">
                <Crown className="w-5 h-5 text-purple-500" />
              </div>
              <h2 className="text-2xl font-bold">Premium</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Peak performance with AI-powered intelligence.
              </p>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold">$9.99</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
            </div>
            <ul className="space-y-1 flex-1">
              {PREMIUM_FEATURES.map((f, i) => <Feature key={i} {...f} />)}
            </ul>
            <button
              onClick={() => startPayPalCheckout('premium', 'personal')}
              className="w-full py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-purple-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Sparkles className="inline w-4 h-4 mr-1" />
              Get Premium
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">
          Billed monthly. Cancel any time. All payments secured by PayPal.
        </p>

        {/* ── Feature comparison note ── */}
        <div className="mt-20 bg-muted/40 border border-border rounded-2xl p-8">
          <h2 className="text-2xl font-bold text-center mb-8">What each plan includes</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-4 h-4 text-slate-500" />
                <h3 className="font-semibold">Free</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Perfect for light personal use. Get the core task, note, and goal tools — no credit card needed.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-blue-500" />
                <h3 className="font-semibold">Pro</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Removes all limits: unlimited projects, smart auto-scheduling, habit tracking, labels, and full cloud sync across all devices.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Crown className="w-4 h-4 text-purple-500" />
                <h3 className="font-semibold">Premium</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Everything in Pro plus AI-driven scheduling, analytics dashboards, goal charts, collaboration, custom fonts & themes, and file attachments.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default PricingPage;