import React, { useState, useEffect } from 'react';
import { Check, Sparkles, Zap, Crown, Building2, GraduationCap, Users, ArrowLeft, ArrowRight, X, CreditCard } from 'lucide-react';
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
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [activeTab, setActiveTab] = useState<string>('personal');
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [currency, setCurrency] = useState('USD');

  // Checkout flow state
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; tier: 'premium' | 'pro'; planType: string; price: number } | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'paypal' | 'card'>('paypal');
  const [workspaceName, setWorkspaceName] = useState('');
  const [seats, setSeats] = useState(1);

  useEffect(() => {
    setCurrency(detectCurrency());
  }, []);

  const convertPrice = (usd: number): string => {
    const c = CURRENCY_RATES[currency] || CURRENCY_RATES.USD;
    return `${c.symbol}${(usd * c.rate).toFixed(2)}`;
  };

  const getSavingsPercent = (monthly: number, yearly: number): number => {
    return Math.round((1 - (yearly * 12) / (monthly * 12)) * 100) || Math.round((1 - yearly / monthly) * 100);
  };

  const personalPlans = [
    {
      name: 'Free',
      monthlyPrice: 0,
      yearlyPrice: 0,
      icon: Zap,
      description: 'Basic organisation for students and individuals.',
      cta: 'Get Free',
      features: [
        'Basic task list and simple daily planner',
        'Limited projects (1–2 active)',
        'Basic calendar view',
        'Cloud sync across devices',
        'Manual progress tracking',
        'Simple notes section and goals',
      ],
    },
    {
      name: 'Premium',
      monthlyPrice: 4.99,
      yearlyPrice: 3.99,
      icon: Crown,
      description: 'The standard for advanced productivity.',
      cta: 'Get Premium',
      features: [
        'Everything in Free, plus:',
        'Unlimited tasks and projects',
        'Auto-schedule calendar system',
        'Smart reminders and notifications',
        'Dedicated habit tracker',
        'Cloud-synced notes section',
        'Custom task categories and labels',
        'Full cloud synchronisation',
        'Attachments on tasks',
        'Task Analysis',
      ],
    },
    {
      name: 'Pro',
      monthlyPrice: 9.99,
      yearlyPrice: 7.99,
      icon: Sparkles,
      description: 'Peak performance with AI-powered intelligence.',
      cta: 'Get Pro',
      popular: true,
      features: [
        'Everything in Premium, plus:',
        'AI Planning Assistant',
        'AI Task Builder',
        'AI Task Prioritisation',
        'Advanced analytics and productivity tracking',
        'Goal tracking with progress charts',
        'Full team and family collaboration',
        'Personalised themes',
        'Priority 24/7 support',
        'Energy tracker',
      ],
    },
  ];

  const familyPlans = [
    { name: 'Premium Family', tier: 'premium' as const, monthlyPrice: 9.99, yearlyPrice: 99, popular: true, features: ['Up to 6 family members', 'Shared family calendar', 'Priority support'] },
    { name: 'Pro Family', tier: 'pro' as const, monthlyPrice: 14.99, yearlyPrice: 149, features: ['Separate accounts for each member', 'AI features for all members'] },
  ];

  const schoolPlans = [
    { name: 'School Premium', tier: 'premium' as const, monthlyPrice: 4, yearlyPrice: 40, perSeat: true, features: ['Seat-based licences', 'Optional groups with random join codes'] },
    { name: 'School Pro', tier: 'pro' as const, monthlyPrice: 8, yearlyPrice: 80, perSeat: true, popular: true, features: ['Organisation-wide join code', 'Admin dashboard showing seats used and remaining'] },
  ];

  const businessPlans = [
    { name: 'Business Premium', tier: 'premium' as const, monthlyPrice: 5, yearlyPrice: 50, perSeat: true, features: ['Everything in Premium per seat', 'Advanced analytics per user'] },
    { name: 'Business Pro', tier: 'pro' as const, monthlyPrice: 9, yearlyPrice: 90, perSeat: true, popular: true, features: ['AI prioritisation and smart scheduling', 'Priority support'] },
  ];

  const currentTier = (user?.subscriptionTier || 'free').toLowerCase();
  const derivedPersonalPlans = personalPlans.map((plan) => ({
    ...plan,
    current: currentTier === plan.name.toLowerCase(),
    price: billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice,
    period: plan.monthlyPrice === 0 ? '' : '/mo',
  }));

  const openCheckout = (name: string, tier: 'premium' | 'pro', planType: string, price: number) => {
    setSelectedPlan({ name, tier, planType, price });
    setCheckoutStep(1);
    setCouponCode('');
    setAppliedCoupon(null);
    setCouponError('');
    setAgreeTerms(false);
    setWorkspaceName('');
    setSeats(1);
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

  const getDiscountedPrice = (): number => {
    if (!selectedPlan || !appliedCoupon) return selectedPlan?.price || 0;
    const base = selectedPlan.price;
    if (appliedCoupon.discountType === 'percentage') {
      return Math.max(0, base * (1 - appliedCoupon.discountValue / 100));
    }
    return Math.max(0, base - appliedCoupon.discountValue);
  };

  const handleCheckoutComplete = async () => {
    if (!selectedPlan) return;
    setLoadingTier(selectedPlan.name);
    try {
      const response = await fetch('/api/payment/create-checkout-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: selectedPlan.tier,
          paymentMethod,
          planType: selectedPlan.planType,
          couponCode: appliedCoupon?.code || undefined,
          seats: selectedPlan.planType !== 'personal' ? seats : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to start checkout');
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

  const isTeamPlan = activeTab === 'family' || activeTab === 'business' || activeTab === 'school';
  const totalSteps = 5;

  return (
    <div className="flex-1 overflow-y-auto bg-background/50">
      <header className="px-8 h-16 border-b border-border bg-card/30 backdrop-blur-md sticky top-0 z-10 flex items-center">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Crown className="w-5 h-5 text-primary" />
          </div>
          <div className="flex items-baseline gap-2 min-w-0">
            <h1 className="text-base font-black text-foreground truncate">Select Your Power Plan</h1>
            <p className="text-xs text-muted-foreground truncate">Elevate your productivity with tailored solutions.</p>
          </div>
        </div>
      </header>

      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center mb-12">
          <div className="flex items-center bg-muted rounded-2xl p-1 mb-6 shadow-inner border border-border/50">
            {(['personal', 'family', 'business', 'school'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 text-xs rounded-xl transition-all duration-300 font-black tracking-widest uppercase ${
                  activeTab === tab ? 'bg-card text-foreground shadow-xl border border-border/50' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'personal' ? 'Personal' : tab === 'family' ? 'Family' : tab === 'business' ? 'Business' : 'School'}
              </button>
            ))}
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
              Yearly <span className="bg-emerald-500 text-white text-[8px] px-2 py-0.5 rounded-full">Save {billingPeriod === 'yearly' ? '~20%' : '17%'}</span>
            </span>
          </div>
        </div>

        {activeTab === 'personal' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {derivedPersonalPlans.map((plan, i) => (
              <div
                key={plan.name}
                className={`relative flex flex-col bg-card border-2 rounded-[2.5rem] p-10 transition-all duration-500 animate-fade-in hover:-translate-y-2 hover:shadow-2xl ${
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
                    openCheckout(plan.name, plan.name.toLowerCase() as 'premium' | 'pro', 'personal', plan.price);
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
        )}

        {activeTab === 'family' && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Users className="w-5 h-5 text-primary" /></div>
              <h2 className="text-xl font-black">Family</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-8 max-w-lg">Share with your family members. Everyone gets their own account under one plan.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {familyPlans.map((plan, i) => {
                const price = billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
                return (
                  <div key={i} className={`bg-card border-2 rounded-[2rem] p-8 transition-all hover:-translate-y-1 hover:shadow-xl ${plan.popular ? 'border-primary shadow-lg' : 'border-border hover:border-primary/30'}`}>
                    {plan.popular && <div className="bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full inline-block mb-4">Popular</div>}
                    <h3 className="text-xl font-black mb-1">{plan.name}</h3>
                    <p className="text-3xl font-black mb-4">{convertPrice(price)}<span className="text-sm text-muted-foreground font-normal">/mo</span></p>
                    <ul className="space-y-2 mb-6">
                      {plan.features.map((f, fi) => (
                        <li key={fi} className="flex items-start gap-2 text-sm text-muted-foreground font-bold">
                          <Check className="w-3 h-3 text-primary mt-1 flex-shrink-0" />{f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => openCheckout(plan.name, plan.tier, 'family', price)}
                      className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/10 active:scale-95 transition-all"
                    >
                      Get {plan.name}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'business' && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Building2 className="w-5 h-5 text-primary" /></div>
              <h2 className="text-xl font-black">Business / Team</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-8 max-w-lg">Simple per-seat pricing. Each user gets their own account — admins manage seats.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {businessPlans.map((plan, i) => {
                const price = billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
                return (
                  <div key={i} className={`bg-card border-2 rounded-[2rem] p-8 transition-all hover:-translate-y-1 hover:shadow-xl ${plan.popular ? 'border-primary shadow-lg' : 'border-border hover:border-primary/30'}`}>
                    {plan.popular && <div className="bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full inline-block mb-4">Popular</div>}
                    <h3 className="text-xl font-black mb-1">{plan.name}</h3>
                    <p className="text-3xl font-black mb-1">{convertPrice(price)}<span className="text-sm text-muted-foreground font-normal">/seat/mo</span></p>
                    <p className="text-xs text-muted-foreground mb-4">Total: {convertPrice(price * seats)}/mo for {seats} seat{seats > 1 ? 's' : ''}</p>
                    <ul className="space-y-2 mb-6">
                      {plan.features.map((f, fi) => (
                        <li key={fi} className="flex items-start gap-2 text-sm text-muted-foreground font-bold">
                          <Check className="w-3 h-3 text-primary mt-1 flex-shrink-0" />{f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => openCheckout(plan.name, plan.tier, 'business', price)}
                      className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/10 active:scale-95 transition-all"
                    >
                      Get {plan.name}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'school' && (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><GraduationCap className="w-5 h-5 text-primary" /></div>
              <h2 className="text-xl font-black">School / University</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {schoolPlans.map((plan, i) => {
                const price = billingPeriod === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
                return (
                  <div key={i} className={`bg-card border-2 rounded-[2rem] p-8 transition-all hover:-translate-y-1 hover:shadow-xl ${plan.popular ? 'border-primary shadow-lg' : 'border-border hover:border-primary/30'}`}>
                    {plan.popular && <div className="bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full inline-block mb-4">Popular</div>}
                    <h3 className="text-xl font-black mb-1">{plan.name}</h3>
                    <p className="text-3xl font-black mb-1">{convertPrice(price)}<span className="text-sm text-muted-foreground font-normal">/seat/mo</span></p>
                    <p className="text-xs text-muted-foreground mb-4">Total: {convertPrice(price * seats)}/mo for {seats} seat{seats > 1 ? 's' : ''}</p>
                    <ul className="space-y-2 mb-6">
                      {plan.features.map((f, fi) => (
                        <li key={fi} className="flex items-start gap-2 text-sm text-muted-foreground font-bold">
                          <Check className="w-3 h-3 text-primary mt-1 flex-shrink-0" />{f}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => openCheckout(plan.name, plan.tier, 'school', price)}
                      className="w-full py-3 bg-primary text-primary-foreground rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/10 active:scale-95 transition-all"
                    >
                      Get {plan.name}
                    </button>
                  </div>
                );
              })}
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
              {/* Step 1: Workspace name (team plans) or Plan confirmation (personal) */}
              {checkoutStep === 1 && (
                <div className="animate-in fade-in duration-200">
                  {isTeamPlan ? (
                    <>
                      <h3 className="text-xl font-black mb-2">Workspace name</h3>
                      <p className="text-sm text-muted-foreground mb-6">This name appears in the collaboration tab.</p>
                      <input
                        type="text"
                        placeholder="e.g. My Team"
                        className="w-full bg-background border border-input rounded-xl px-4 py-3 font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all mb-6"
                        value={workspaceName}
                        onChange={e => setWorkspaceName(e.target.value)}
                      />
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-black mb-2">Plan confirmation</h3>
                      <p className="text-sm text-muted-foreground mb-6">Review your selected plan.</p>
                    </>
                  )}
                  <div className="bg-muted/50 rounded-xl p-4 mb-6">
                    <p className="font-black text-lg">{selectedPlan.name}</p>
                    <p className="text-sm text-muted-foreground">{billingPeriod === 'monthly' ? 'Monthly' : 'Yearly'} billing</p>
                    <p className="text-2xl font-black mt-2">{convertPrice(selectedPlan.price)}<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setCheckoutOpen(false)} className="flex-1 py-3 bg-muted text-foreground font-bold rounded-xl">Cancel</button>
                    <button
                      onClick={() => setCheckoutStep(isTeamPlan ? 2 : 2)}
                      className="flex-[2] py-3 bg-primary text-primary-foreground rounded-xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all"
                    >
                      Continue
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Seats (team) or Account */}
              {checkoutStep === 2 && (
                <div className="animate-in fade-in duration-200">
                  {isTeamPlan ? (
                    <>
                      <h3 className="text-xl font-black mb-2">Number of seats</h3>
                      <p className="text-sm text-muted-foreground mb-6">How many users need access?</p>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        className="w-full bg-background border border-input rounded-xl px-4 py-3 font-semibold text-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all mb-4"
                        value={seats}
                        onChange={e => setSeats(Math.max(1, parseInt(e.target.value) || 1))}
                      />
                      <p className="text-sm text-muted-foreground mb-6">Total: <span className="font-black text-foreground">{convertPrice(selectedPlan.price * seats)}/mo</span></p>
                      <div className="flex gap-3">
                        <button onClick={() => setCheckoutStep(1)} className="flex-1 py-3 bg-muted text-foreground font-bold rounded-xl flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" />Back</button>
                        <button onClick={() => setCheckoutStep(3)} className="flex-[2] py-3 bg-primary text-primary-foreground rounded-xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all">Continue</button>
                      </div>
                    </>
                  ) : (
                    <>
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
                        <p className="text-sm text-muted-foreground mb-6">You will be prompted to log in after payment.</p>
                      )}
                      <div className="flex gap-3">
                        <button onClick={() => setCheckoutStep(1)} className="flex-1 py-3 bg-muted text-foreground font-bold rounded-xl flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" />Back</button>
                        <button onClick={() => setCheckoutStep(3)} className="flex-[2] py-3 bg-primary text-primary-foreground rounded-xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all">Continue</button>
                      </div>
                    </>
                  )}
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
                    <div className="space-y-3 mb-6 p-4 bg-muted/30 rounded-xl">
                      <input type="text" placeholder="Card number" className="w-full bg-background border border-input rounded-lg px-4 py-3 text-sm" />
                      <input type="text" placeholder="Name on card" className="w-full bg-background border border-input rounded-lg px-4 py-3 text-sm" />
                      <div className="grid grid-cols-2 gap-3">
                        <input type="text" placeholder="MM/YY" className="bg-background border border-input rounded-lg px-4 py-3 text-sm" />
                        <input type="text" placeholder="CVV" className="bg-background border border-input rounded-lg px-4 py-3 text-sm" />
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => setCheckoutStep(isTeamPlan ? 2 : 2)} className="flex-1 py-3 bg-muted text-foreground font-bold rounded-xl flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" />Back</button>
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
                    {isTeamPlan && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Seats</span><span className="font-bold">{seats}</span></div>}
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
                      <span className="text-muted-foreground">{selectedPlan.name}</span>
                      <span className="font-bold">{convertPrice(selectedPlan.price * (isTeamPlan ? seats : 1))}</span>
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
                      <span className="font-black">Total</span>
                      <span className="font-black text-lg">{convertPrice(getDiscountedPrice() * (isTeamPlan ? seats : 1))}</span>
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
