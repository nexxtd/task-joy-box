import React, { useState, useEffect } from 'react';
import { Check, Sparkles, Zap, Crown, ArrowLeft, X, CreditCard, Building2, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

const CURRENCY_RATES: Record<string, { symbol: string; rate: number }> = {
  USD: { symbol: '$', rate: 1 },
  AUD: { symbol: 'A$', rate: 1.53 },
  GBP: { symbol: '£', rate: 0.79 },
  EUR: { symbol: '€', rate: 0.92 },
};

const detectCurrency = (): string => {
  try {
    const lang = navigator.language || '';
    if (lang.includes('AU')) return 'AUD';
    if (lang.includes('GB')) return 'GBP';
    if (lang.includes('DE') || lang.includes('FR') || lang.includes('IT') || lang.includes('ES') || lang.includes('NL')) return 'EUR';
  } catch {}
  return 'USD';
};

const Pricing: React.FC = () => {
  const { user } = useAuth();
  const [planCategory, setPlanCategory] = useState<'personal' | 'organizations'>('personal');
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');
  const [schoolSeats, setSchoolSeats] = useState(25);

  // Checkout flow state
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; tier: 'premium' | 'pro'; price: number; planType?: string; seats?: number } | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'paypal' | 'card'>('paypal');

  const [pricing, setPricing] = useState<{ pro: number; premium: number }>({ pro: 9.99, premium: 4.99 });
  const [pricingLoading, setPricingLoading] = useState(true);

  useEffect(() => {
    setCurrency(detectCurrency());
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/payment/pricing');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.pro?.price != null && data?.premium?.price != null) {
          setPricing({ pro: Number(data.pro.price), premium: Number(data.premium.price) });
        }
      } catch {} finally { if (!cancelled) setPricingLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const convertPrice = (usd: number): string => {
    const c = CURRENCY_RATES[currency] || CURRENCY_RATES.USD;
    return `${c.symbol}${(usd * c.rate).toFixed(2)}`;
  };

  const yearlyFromMonthly = (m: number) => Math.round(m * 0.8 * 100) / 100;

  const personalPlans = [
    {
      name: 'Free',
      monthlyPrice: 0,
      yearlyPrice: 0,
      icon: Zap,
      tier: 'free' as const,
      description: 'Essential organization for individuals.',
      cta: 'Get Free',
      features: [
        'Max 25 active tasks & 25 active notes',
        'Max 5 templates (tasks & notes)',
        '20 sub-tasks & 20 checklist items per task',
        'Max 5 projects (10 people, 10 columns)',
        'Project chat history kept 30 days',
        'Up to 8 dashboard & insights widgets',
        'Max 10 tags & 3 custom shortcuts',
        'Normal support & normal alerts',
        'Completed tasks auto-delete after 5 days',
      ],
    },
    {
      name: 'Premium',
      monthlyPrice: pricing.premium,
      yearlyPrice: yearlyFromMonthly(pricing.premium),
      icon: Crown,
      tier: 'premium' as const,
      description: 'The standard for advanced productivity and power users.',
      cta: 'Get Premium',
      features: [
        'Everything in Free, plus:',
        'Max 100 active tasks & 100 active notes',
        'Max 15 projects (15 people, 15 columns)',
        'Project chat history kept 1 year',
        'Files & Images (15 each per task/note, 10MB max)',
        'AI Assistant (20 msgs/day, max 10 chats, creates/edits tasks & notes)',
        'Up to 14 dashboard & insights widgets',
        'Export CSV insights reports',
        'Max 15 templates, 40 sub-tasks & checklists',
        'Max 15 tags & 10 custom shortcuts',
        'Full appearance colors, Smart alerts & Email notifications',
        'Energy tracker & Priority support',
        'Completed tasks auto-delete after 30 days',
      ],
    },
    {
      name: 'Pro',
      monthlyPrice: pricing.pro,
      yearlyPrice: yearlyFromMonthly(pricing.pro),
      icon: Sparkles,
      tier: 'pro' as const,
      description: 'Peak performance with AI-powered intelligence.',
      cta: 'Get Pro',
      popular: true,
      features: [
        'Everything in Premium, plus:',
        'Unlimited active tasks, notes & templates',
        'AI Task Builder & AI Note Builder',
        'Task Analysis & Note Analysis',
        'AI Assistant (100 msgs/day, unlimited chats, file attachments)',
        'Max 20 projects (20 people, 20 columns, unlimited chat)',
        'Files & Images (25 each per task/note, 25MB max)',
        'Unlimited dashboard & insights widgets',
        'Export CSV & PDF insights reports',
        '60 sub-tasks & 60 checklists per task',
        'Max 25 tags & Unlimited custom shortcuts',
        'Weekly AI summary emails',
        'Never auto-delete completed tasks',
        'Priority support with priority badge',
      ],
    },
  ];

  const currentTier = (user?.subscriptionTier || 'free').toLowerCase();
  const derivedPersonalPlans = personalPlans.map((plan) => ({
    ...plan,
    current: currentTier === plan.name.toLowerCase(),
    price: billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice,
    period: plan.monthlyPrice === 0 ? '' : '/mo',
  }));

  const openCheckout = (name: string, tier: 'premium' | 'pro', price: number, planType: string = 'personal', seats?: number) => {
    setSelectedPlan({ name, tier, price, planType, seats });
    setCheckoutStep(1);
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponError('');
    setAgreeTerms(false);
    setCheckoutOpen(true);
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    setCouponError('');
    try {
      const res = await fetch('/api/payment/validate-coupon', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode.trim(), plan: selectedPlan?.name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCouponError(data.error || 'Invalid coupon');
        setAppliedCoupon(null);
      } else {
        setAppliedCoupon(data);
        setCouponError('');
      }
    } catch {
      setCouponError('Failed to validate coupon');
    } finally {
      setCouponLoading(false);
    }
  };

  const getChargeAmount = (): number => {
    if (!selectedPlan) return 0;
    return billingPeriod === 'yearly'
      ? Math.round(selectedPlan.price * 12 * 100) / 100
      : selectedPlan.price;
  };

  const getDiscountedPrice = (): number => {
    const base = getChargeAmount();
    if (!selectedPlan || !appliedCoupon) return base;
    if (appliedCoupon.discountType === 'percentage') {
      return Math.max(0, Math.round(base * (1 - appliedCoupon.discountValue / 100) * 100) / 100);
    }
    return Math.max(0, Math.round((base - appliedCoupon.discountValue) * 100) / 100);
  };

  const handleCheckoutComplete = async () => {
    if (!selectedPlan) return;
    if (!user) {
      toast({
        title: 'Sign in required',
        description: 'Please log in or create an account before completing checkout.',
        variant: 'destructive',
      });
      return;
    }
    setLoadingTier(selectedPlan.name);
    try {
      const response = await fetch('/api/payment/create-checkout-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: selectedPlan.tier,
          paymentMethod,
          billingPeriod,
          planType: selectedPlan.planType || 'personal',
          seats: selectedPlan.seats,
          couponCode: appliedCoupon?.code || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = (data as any).details ? ` — ${(data as any).details}` : (data as any).hint ? ` — ${(data as any).hint}` : '';
        throw new Error(((data as any).error || 'Failed to start checkout') + detail);
      }
      if (data.approvalUrl) {
        window.location.href = data.approvalUrl;
        return;
      }
      throw new Error('Checkout session URL was not returned');
    } catch (error) {
      toast({
        title: 'Checkout failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoadingTier(null);
      setCheckoutOpen(false);
    }
  };

  const totalSteps = 5;

  return (
    <div className="flex-1 overflow-y-auto bg-background/50">
      <header className="px-4 sm:px-8 h-16 border-b border-border bg-card/30 backdrop-blur-md sticky top-0 z-10 flex items-center">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Crown className="w-5 h-5 text-primary" />
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <h1 className="text-base font-black text-foreground truncate">Select Your Power Plan</h1>
            <p className="text-xs text-muted-foreground truncate">Simple plans for personal productivity.</p>
          </div>
        </div>
      </header>

      <div className="p-4 sm:p-8 max-w-7xl mx-auto">
        {/* Category Switcher: Personal vs Organizations */}
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="inline-flex rounded-2xl border border-border bg-card p-1 shadow-xs">
            <button
              onClick={() => setPlanCategory('personal')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                planCategory === 'personal'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Personal Plans
            </button>
            <button
              onClick={() => setPlanCategory('organizations')}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                planCategory === 'organizations'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Organizations (School & Family)
            </button>
          </div>

          <div className="flex items-center bg-card border border-border rounded-xl px-4 py-2 gap-4 shadow-sm animate-fade-in">
            <span className={`text-[10px] font-black uppercase ${billingPeriod === 'monthly' ? 'text-foreground' : 'text-muted-foreground'}`}>Monthly</span>
            <button
              onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
              className="w-12 h-6 bg-muted rounded-full relative transition-all"
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-primary transition-all ${billingPeriod === 'yearly' ? 'left-7' : 'left-1'}`} />
            </button>
            <span className={`text-[10px] font-black uppercase flex items-center gap-2 ${billingPeriod === 'yearly' ? 'text-foreground' : 'text-muted-foreground'}`}>
              Yearly <span className="bg-emerald-500 text-white text-[8px] px-2 py-0.5 rounded-full">Save 20%</span>
            </span>
          </div>
        </div>

        {planCategory === 'personal' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {derivedPersonalPlans.map((plan, i) => (
              <div
                key={plan.name}
                className={`relative flex flex-col bg-card border-2 rounded-[2.5rem] p-8 sm:p-10 transition-all duration-500 animate-fade-in hover:-translate-y-2 hover:shadow-2xl ${
                  plan.popular ? 'border-emerald-500 shadow-2xl shadow-emerald-500/10 scale-105 z-10' : 'border-border hover:border-primary/30'
                }`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {plan.popular && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-full shadow-xl">
                    Most Popular
                  </div>
                )}
                <div className="mb-8">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                    <plan.icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="text-3xl font-black text-foreground mb-2">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-5xl font-black text-foreground">{plan.price === 0 ? '$0' : convertPrice(plan.price)}</span>
                    {plan.period && <span className="text-sm text-muted-foreground font-black uppercase tracking-tighter">{plan.period}</span>}
                  </div>
                  <p className="text-sm text-muted-foreground font-medium leading-relaxed">{plan.description}</p>
                </div>
                <div className="flex-1">
                  <ul className="space-y-4 mb-10">
                    {plan.features.map((f, fi) => (
                      <li key={fi} className="flex items-start gap-4 text-sm text-muted-foreground font-bold">
                        <div className="mt-1 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-primary" />
                        </div>
                        <span className="leading-snug">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={() => {
                    if (plan.current || plan.price === 0) return;
                    openCheckout(plan.name, (plan as any).tier as 'premium' | 'pro', plan.price);
                  }}
                  disabled={plan.current || plan.price === 0}
                  className={`w-full py-5 rounded-2xl font-black tracking-widest uppercase text-xs transition-all shadow-xl active:scale-95 ${
                    plan.current || plan.price === 0
                      ? 'bg-muted text-muted-foreground cursor-default'
                      : plan.popular
                        ? 'bg-emerald-500 text-white hover:bg-emerald-600 hover:shadow-emerald-500/30 hover:scale-[1.02]'
                        : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/30 hover:scale-[1.02]'
                  }`}
                >
                  {plan.current ? 'Current Plan' : plan.cta}
                </button>
              </div>
            ))}
          </div>
        ) : (
          /* Organizations Tab: Family Plan & School Plan */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch max-w-5xl mx-auto">
            {/* Family Plan */}
            <div className="relative flex flex-col bg-card border-2 border-border rounded-[2.5rem] p-8 sm:p-10 transition-all hover:border-primary/40 hover:shadow-2xl">
              <div className="mb-6">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                  <Users className="w-7 h-7 text-primary" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-3xl font-black text-foreground">Family Plan</h3>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                    5 Seats
                  </span>
                </div>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-5xl font-black text-foreground">
                    {convertPrice(billingPeriod === 'yearly' ? 11.99 : 14.99)}
                  </span>
                  <span className="text-sm text-muted-foreground font-black uppercase tracking-tighter">/mo</span>
                </div>
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">
                  Includes 5 full Pro seats (1 owner + 4 members). Perfect for households to manage personal productivity privately under one subscription.
                </p>
              </div>

              <div className="flex-1">
                <ul className="space-y-4 mb-8">
                  {[
                    '5 independent Pro accounts included',
                    'Zero shared notes or tasks (complete member privacy)',
                    'Buyer becomes Organization Owner',
                    'Simplified family admin view (Users & Settings)',
                    'Generate simple shareable join codes',
                    'Full AI Assistant and note builder for all members',
                  ].map((f, fi) => (
                    <li key={fi} className="flex items-start gap-4 text-sm text-muted-foreground font-bold">
                      <div className="mt-1 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-primary" />
                      </div>
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => openCheckout('Family Plan', 'pro', billingPeriod === 'yearly' ? 11.99 : 14.99, 'family', 5)}
                className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider bg-primary text-primary-foreground shadow-xl shadow-primary/10 hover:bg-primary/90 active:scale-95 transition-all"
              >
                Get Family Plan
              </button>
            </div>

            {/* School / Team Plan */}
            <div className="relative flex flex-col bg-card border-2 border-emerald-500/80 shadow-2xl shadow-emerald-500/10 rounded-[2.5rem] p-8 sm:p-10 transition-all hover:shadow-2xl">
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-full shadow-xl">
                Volume Pricing
              </div>

              <div className="mb-6">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6">
                  <Building2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-3xl font-black text-foreground">School Plan</h3>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    Pro Tier
                  </span>
                </div>

                {/* Seat Selector Slider & Input */}
                <div className="p-4 rounded-2xl border border-border bg-muted/30 my-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black uppercase text-foreground">Custom Seats</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={10}
                        max={1000}
                        value={schoolSeats}
                        onChange={e => setSchoolSeats(Math.max(10, Math.min(1000, parseInt(e.target.value) || 10)))}
                        className="w-16 px-2 py-1 rounded-lg border border-border bg-background text-center text-sm font-black text-foreground outline-none focus:border-primary"
                      />
                      <span className="text-xs text-muted-foreground font-bold">seats</span>
                    </div>
                  </div>

                  <input
                    type="range"
                    min={10}
                    max={250}
                    step={5}
                    value={schoolSeats}
                    onChange={e => setSchoolSeats(parseInt(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />

                  {/* Volume discount breakdown */}
                  <div className="flex items-center justify-between text-[11px] font-bold text-muted-foreground pt-1 border-t border-border/60">
                    <span>Rate: <span className="text-foreground">{convertPrice(billingPeriod === 'yearly' ? (schoolSeats <= 20 ? 3.2 : schoolSeats <= 50 ? 2.8 : schoolSeats <= 100 ? 2.4 : schoolSeats <= 250 ? 2.0 : 1.6) : (schoolSeats <= 20 ? 4.0 : schoolSeats <= 50 ? 3.5 : schoolSeats <= 100 ? 3.0 : schoolSeats <= 250 ? 2.5 : 2.0))}/seat</span></span>
                    <span className="text-emerald-600 dark:text-emerald-400">Drops as seats increase</span>
                  </div>
                </div>

                {/* Live Total Calculator */}
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-5xl font-black text-foreground">
                    {(() => {
                      const baseRate = schoolSeats <= 20 ? 4.0 : schoolSeats <= 50 ? 3.5 : schoolSeats <= 100 ? 3.0 : schoolSeats <= 250 ? 2.5 : 2.0;
                      const effectiveRate = billingPeriod === 'yearly' ? baseRate * 0.8 : baseRate;
                      return convertPrice(Math.round(effectiveRate * schoolSeats * 100) / 100);
                    })()}
                  </span>
                  <span className="text-sm text-muted-foreground font-black uppercase tracking-tighter">/mo</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Price automatically scales with volume. Includes full school dashboard with Year Groups & Classes.
                </p>
              </div>

              <div className="flex-1">
                <ul className="space-y-4 mb-8">
                  {[
                    `Pro tier access for all ${schoolSeats} students & staff`,
                    'Hierarchical Groups & Sub-groups (Year 9 -> Class A)',
                    'Join codes with auto-assignment & expiry limits',
                    'Both tab with Board View & Drag-and-drop',
                    '100% student data isolation (no shared notes/tasks)',
                    'Add administrators to manage users and classes',
                  ].map((f, fi) => (
                    <li key={fi} className="flex items-start gap-4 text-sm text-muted-foreground font-bold">
                      <div className="mt-1 w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <span className="leading-snug">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => {
                  const baseRate = schoolSeats <= 20 ? 4.0 : schoolSeats <= 50 ? 3.5 : schoolSeats <= 100 ? 3.0 : schoolSeats <= 250 ? 2.5 : 2.0;
                  const effectiveRate = billingPeriod === 'yearly' ? baseRate * 0.8 : baseRate;
                  const total = Math.round(effectiveRate * schoolSeats * 100) / 100;
                  openCheckout('School Plan', 'pro', total, 'school', schoolSeats);
                }}
                className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-wider bg-emerald-500 text-white shadow-xl shadow-emerald-500/20 hover:bg-emerald-600 active:scale-95 transition-all"
              >
                Get School Plan ({schoolSeats} Seats)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Multi-step Checkout Modal */}
      {checkoutOpen && selectedPlan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-background/90 backdrop-blur-lg" onClick={() => setCheckoutOpen(false)} />
          <div className="relative w-full max-w-lg bg-card border-2 border-primary/20 rounded-[2rem] shadow-2xl animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
            {/* Step indicators */}
            <div className="flex items-center justify-center gap-2 pt-6 pb-2">
              {Array.from({ length: totalSteps }, (_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-all ${i + 1 <= checkoutStep ? 'bg-primary w-6' : 'bg-muted'}`} />
              ))}
            </div>

            <div className="p-8">
              {/* Step 1: Plan confirmation */}
              {checkoutStep === 1 && (
                <div className="animate-in fade-in duration-200">
                  <h3 className="text-xl font-black mb-2">Plan confirmation</h3>
                  <p className="text-sm text-muted-foreground mb-6">Review your selected plan.</p>
                  <div className="bg-muted/50 rounded-xl p-4 mb-6">
                    <p className="font-black text-lg">{selectedPlan.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {billingPeriod === 'monthly' ? 'Monthly' : 'Yearly'} billing
                      {selectedPlan.seats ? ` · ${selectedPlan.seats} seats` : ''}
                    </p>
                    <p className="text-2xl font-black mt-2">{convertPrice(selectedPlan.price)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setCheckoutOpen(false)} className="flex-1 py-3 bg-muted text-foreground font-bold rounded-xl">Cancel</button>
                    <button
                      onClick={() => setCheckoutStep(2)}
                      className="flex-[2] py-3 bg-primary text-primary-foreground rounded-xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Account */}
              {checkoutStep === 2 && (
                <div className="animate-in fade-in duration-200">
                  <h3 className="text-xl font-black mb-2">Account</h3>
                  <p className="text-sm text-muted-foreground mb-6">{user ? `Signed in as ${user.email}` : 'Please log in or create an account to continue.'}</p>
                  {user ? (
                    <div className="bg-muted/50 rounded-xl p-4 mb-6 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">{(user.name || user.email || '?')[0].toUpperCase()}</div>
                      <div>
                        <p className="font-bold text-sm">{user.name}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 mb-6 space-y-3">
                      <p className="text-sm text-foreground font-semibold">Sign in or create an account to link your subscription.</p>
                      <div className="flex gap-2">
                        <a href="/login" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold">Sign In</a>
                        <a href="/signup" className="px-4 py-2 rounded-lg bg-muted text-foreground text-xs font-bold">Create Account</a>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => setCheckoutStep(1)} className="flex-1 py-3 bg-muted text-foreground font-bold rounded-xl flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" />Back</button>
                    <button onClick={() => setCheckoutStep(3)} disabled={!user} className="flex-[2] py-3 bg-primary text-primary-foreground rounded-xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">Continue</button>
                  </div>
                </div>
              )}

              {/* Step 3: Payment method */}
              {checkoutStep === 3 && (
                <div className="animate-in fade-in duration-200">
                  <h3 className="text-xl font-black mb-2">Payment method</h3>
                  <p className="text-sm text-muted-foreground mb-6">Choose how you'd like to pay.</p>
                  <div className="space-y-3 mb-6">
                    <button
                      onClick={() => setPaymentMethod('paypal')}
                      className={`w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${paymentMethod === 'paypal' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
                    >
                      <span className="font-bold">PayPal</span>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'paypal' ? 'border-primary' : 'border-muted-foreground'}`}>
                        {paymentMethod === 'paypal' && <div className="w-2.5 h-2.5 bg-primary rounded-full" />}
                      </div>
                    </button>
                    <button
                      onClick={() => setPaymentMethod('card')}
                      className={`w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${paymentMethod === 'card' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30'}`}
                    >
                      <span className="font-bold flex items-center gap-2"><CreditCard className="w-4 h-4" /> Debit/Credit Card</span>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === 'card' ? 'border-primary' : 'border-muted-foreground'}`}>
                        {paymentMethod === 'card' && <div className="w-2.5 h-2.5 bg-primary rounded-full" />}
                      </div>
                    </button>
                  </div>
                  {paymentMethod === 'card' && (
                    <div className="mb-6 p-4 bg-muted/40 border border-border rounded-xl text-xs text-muted-foreground leading-relaxed">
                      Debit and credit cards are processed securely on the next screen via PayPal Guest Checkout (no PayPal account required). Card details are never stored on our servers.
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => setCheckoutStep(2)} className="flex-1 py-3 bg-muted text-foreground font-bold rounded-xl flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" />Back</button>
                    <button onClick={() => setCheckoutStep(4)} className="flex-[2] py-3 bg-primary text-primary-foreground rounded-xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all">Continue</button>
                  </div>
                </div>
              )}

              {/* Step 4: Review and confirm */}
              {checkoutStep === 4 && (
                <div className="animate-in fade-in duration-200">
                  <h3 className="text-xl font-black mb-2">Review and confirm</h3>
                  <p className="text-sm text-muted-foreground mb-6">Verify your order details below.</p>

                  <div className="bg-muted/50 rounded-xl p-4 mb-4 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Plan</span><span className="font-bold">{selectedPlan.name}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Billing</span><span className="font-bold">{billingPeriod === 'monthly' ? 'Monthly' : 'Yearly'}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Payment</span><span className="font-bold capitalize">{paymentMethod === 'paypal' ? 'PayPal' : 'Card'}</span></div>
                  </div>

                  {/* Coupon input */}
                  <div className="mb-4">
                    <label className="text-xs font-bold text-muted-foreground mb-2 block">Coupon code</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter coupon code"
                        className="flex-1 bg-background border border-input rounded-lg px-4 py-2.5 text-sm font-mono uppercase"
                        value={couponCode}
                        onChange={e => setCouponCode(e.target.value.toUpperCase())}
                        disabled={!!appliedCoupon}
                      />
                      {appliedCoupon ? (
                        <button onClick={() => { setAppliedCoupon(null); setCouponCode(''); }} className="px-3 py-2 bg-red-500/10 text-red-500 rounded-lg text-xs font-bold"><X className="w-4 h-4" /></button>
                      ) : (
                        <button onClick={applyCoupon} disabled={couponLoading || !couponCode.trim()} className="px-4 py-2 bg-muted text-foreground rounded-lg text-xs font-bold disabled:opacity-50">
                          {couponLoading ? '...' : 'Apply'}
                        </button>
                      )}
                    </div>
                    {couponError && <p className="text-xs text-red-500 mt-1">{couponError}</p>}
                    {appliedCoupon && (
                      <div className="flex items-center gap-2 mt-2 text-xs text-emerald-600 font-bold">
                        <Check className="w-3 h-3" />{appliedCoupon.discountLabel}
                      </div>
                    )}
                  </div>

                  <div className="bg-muted/50 rounded-xl p-4 mb-6">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-muted-foreground">
                        {selectedPlan.name} {billingPeriod === 'yearly' ? `(${convertPrice(selectedPlan.price)}/mo × 12)` : ''}
                      </span>
                      <span className="font-bold">{convertPrice(getChargeAmount())}</span>
                    </div>
                    {appliedCoupon && (
                      <div className="flex justify-between text-sm mb-1 text-emerald-600">
                        <span>{appliedCoupon.discountLabel}</span>
                        <span className="font-bold">
                          -{appliedCoupon.discountType === 'percentage'
                            ? `-${appliedCoupon.discountValue}%`
                            : `-${convertPrice(appliedCoupon.discountValue)}`}
                        </span>
                      </div>
                    )}
                    <div className="border-t border-border mt-2 pt-2 flex justify-between">
                      <span className="font-black">Total due {billingPeriod === 'yearly' ? '(Yearly)' : '(Monthly)'}</span>
                      <span className="font-black text-lg">{convertPrice(getDiscountedPrice())}</span>
                    </div>
                  </div>

                  <label className="flex items-start gap-3 mb-6 cursor-pointer">
                    <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} className="mt-1" />
                    <span className="text-xs text-muted-foreground">I agree to the terms and conditions</span>
                  </label>

                  <div className="flex gap-3">
                    <button onClick={() => setCheckoutStep(3)} className="flex-1 py-3 bg-muted text-foreground font-bold rounded-xl flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" />Back</button>
                    <button
                      onClick={handleCheckoutComplete}
                      disabled={!agreeTerms || !!loadingTier}
                      className="flex-[2] py-3 bg-primary text-primary-foreground rounded-xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loadingTier ? 'Processing...' : 'Pay Now'}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 5: Confirmation */}
              {checkoutStep === 5 && (
                <div className="animate-in fade-in duration-200 text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h3 className="text-2xl font-black mb-2">You're all set!</h3>
                  <p className="text-muted-foreground mb-6">Your {selectedPlan.name} plan is now active.</p>
                  <button onClick={() => { setCheckoutOpen(false); window.location.href = '/'; }} className="px-8 py-3 bg-primary text-primary-foreground rounded-xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all">
                    Go to Dashboard
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pricing;
