import React, { useState } from 'react';
import { Check, Sparkles, Zap, Crown, Building2, GraduationCap, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/hooks/use-toast';

const Pricing: React.FC = () => {
  const { user } = useAuth();
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [activeTab, setActiveTab] = useState<'personal' | 'teams'>('personal');
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<{ tier: 'premium' | 'pro', planType: string } | null>(null);

  const personalPlans = [
    {
      name: 'Free',
      price: '$0',
      period: '',
      icon: Zap,
      description: 'Basic organisation for students and individuals.',
      cta: 'Get Free',
      current: false,
      features: [
        'Basic task list & Simple daily planner',
        'Limited projects (1-2 active)',
        'Basic calendar view',
        'Cloud sync across devices',
        'Manual progress tracking',
        'Simple notes section & Goals',
      ],
    },
    {
      name: 'Premium',
      price: billingPeriod === 'monthly' ? '$4.99' : '$3.99',
      period: '/mo',
      icon: Crown,
      description: 'The standard for advanced productivity.',
      cta: 'Get Premium',
      current: false,
      features: [
        'Everything in Free, plus:',
        'Unlimited tasks and projects',
        'Auto-schedule calendar system',
        'Smart reminders and notifications',
        'Dedicated Habit tracker',
        'Cloud-synced Notes section',
        'Custom task categories (Labels)',
        'Full cloud synchronization',
      ],
    },
    {
      name: 'Pro',
      price: billingPeriod === 'monthly' ? '$9.99' : '$7.99',
      period: '/mo',
      icon: Sparkles,
      description: 'Peak performance with AI-powered intelligence.',
      cta: 'Get Pro',
      current: false,
      popular: true,
      features: [
        'Everything in Premium, plus:',
        'AI Planning Assistant (Suggest schedules)',
        'AI Task Prioritisation (Smart reordering)',
        'Advanced Analytics & Productivity Tracking',
        'Goal tracking with progress charts',
        'Full Team/Family Collaboration',
        'Personalised Themes (Colors & Fonts)',
        'File attachments on tasks',
        'Normal support for everyone',
      ],
    },
  ];

  const teamPlans = [
    {
      name: 'Family',
      icon: Users,
      description: 'Share with your family members. Everyone gets their own account under one plan.',
      tiers: [
        { name: 'Premium Family', price: billingPeriod === 'monthly' ? '$9.99/mo' : '$99/yr', savings: billingPeriod === 'yearly' ? 'Save 17%' : '', popular: true },
        { name: 'Pro Family', price: billingPeriod === 'monthly' ? '$14.99/mo' : '$149/yr', savings: billingPeriod === 'yearly' ? 'Save 17%' : '' },
      ],
      features: [
        'Up to 6 family members',
        'Separate accounts for each member',
        'Shared family calendar',
        'AI features for all members',
        'Priority support',
      ],
    },
    {
      name: 'School / University',
      icon: GraduationCap,
      description: 'Seat-based licensing. Users control their own app content; admins only manage seats.',
      tiers: [
        { name: 'Premium', price: billingPeriod === 'monthly' ? '$4/seat/mo' : '$40/seat/yr', savings: billingPeriod === 'yearly' ? 'Save $8/seat' : '' },
        { name: 'Pro', price: billingPeriod === 'monthly' ? '$8/seat/mo' : '$80/seat/yr', savings: billingPeriod === 'yearly' ? 'Save $16/seat' : '', popular: true },
      ],
      features: [
        'Seat-based licences (one seat = one user account)',
        'Organisation-wide join code (optional)',
        'Optional groups with random join codes',
        'Admin dashboard: seats used/remaining',
      ],
    },
    {
      name: 'Business / Team',
      icon: Building2,
      description: 'Simple per-seat pricing. Each user gets their own account — admins manage seats.',
      tiers: [
        { name: 'Premium', price: billingPeriod === 'monthly' ? '$5/seat/mo' : '$50/seat/yr', savings: billingPeriod === 'yearly' ? 'Save $10/seat' : '' },
        { name: 'Pro', price: billingPeriod === 'monthly' ? '$9/seat/mo' : '$90/seat/yr', savings: billingPeriod === 'yearly' ? 'Save $18/seat' : '', popular: true },
      ],
      features: [
        'Everything in Premium (per seat)',
        'AI prioritisation and smart scheduling',
        'Advanced analytics (per user)',
        'Priority support',
      ],
    },
  ];

  const currentTier = (user?.subscriptionTier || 'free').toLowerCase();
  const derivedPersonalPlans = personalPlans.map((plan) => {
    const isCurrentPlan = currentTier === plan.name.toLowerCase();
    return {
      ...plan,
      current: isCurrentPlan,
      cta: isCurrentPlan ? 'Current Plan' : `Get ${plan.name}`,
    };
  });

  const handleCheckout = async (tier: 'premium' | 'pro', planType: string = 'personal') => {
    setLoadingTier(`${planType}-${tier}`);
    try {
      const response = await fetch('/api/payment/create-checkout-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tier, 
          paymentMethod: 'paypal',
          planType
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to start checkout');
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
      setShowPaymentModal(false);
    }
  };

  const openPaymentModal = (tier: 'premium' | 'pro', planType: string = 'personal') => {
    setPendingSelection({ tier, planType });
    setShowPaymentModal(true);
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background/50">
      <header className="px-8 py-6 border-b border-border bg-card/30 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Crown className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-foreground">Select Your Power Plan</h1>
            <p className="text-sm text-muted-foreground">Elevate your productivity with tailored solutions.</p>
          </div>
        </div>
      </header>

      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex flex-col items-center mb-12">
          <div className="flex items-center bg-muted rounded-2xl p-1 mb-6 shadow-inner border border-border/50">
            <button
              onClick={() => setActiveTab('personal')}
              className={`px-8 py-3 text-xs rounded-xl transition-all duration-300 font-black tracking-widest uppercase ${
                activeTab === 'personal' ? 'bg-card text-foreground shadow-xl border border-border/50' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Personal
            </button>
            <button
              onClick={() => setActiveTab('teams')}
              className={`px-8 py-3 text-xs rounded-xl transition-all duration-300 font-black tracking-widest uppercase ${
                activeTab === 'teams' ? 'bg-card text-foreground shadow-xl border border-border/50' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Business/School
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
                Yearly <span className="bg-emerald-500 text-white text-[8px] px-2 py-0.5 rounded-full">Save ~20%</span>
             </span>
          </div>
        </div>

        {showPaymentModal && pendingSelection && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-background/90 backdrop-blur-lg" onClick={() => setShowPaymentModal(false)} />
            <div className="relative w-full max-w-md bg-card border-2 border-primary/20 rounded-[2.5rem] shadow-2xl p-10 animate-in zoom-in-95 duration-300">
              <h3 className="text-2xl font-black text-foreground mb-2">Secure Checkout</h3>
              <p className="text-sm text-muted-foreground mb-8">Upgrading to {pendingSelection.tier} ({pendingSelection.planType})</p>
              
              <div className="space-y-3 mb-10">
                <div className="w-full flex items-center justify-between p-6 rounded-3xl border-2 border-primary bg-primary/5 shadow-inner">
                  <span className="font-bold">PayPal</span>
                  <div className="w-6 h-6 rounded-full border-2 flex items-center justify-center border-primary">
                    <div className="w-3 h-3 bg-primary rounded-full" />
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                 <button onClick={() => setShowPaymentModal(false)} className="flex-1 py-4 text-sm font-black text-muted-foreground">Back</button>
                 <button 
                  onClick={() => handleCheckout(pendingSelection.tier, pendingSelection.planType)}
                  className="flex-[2] py-4 bg-primary text-primary-foreground rounded-[1.25rem] font-black shadow-xl shadow-primary/20 active:scale-95 transition-all"
                  disabled={!!loadingTier}
                 >
                   {loadingTier ? 'Processing...' : 'Complete Unlock'}
                 </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'personal' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch">
            {derivedPersonalPlans.map((plan, i) => (
              <div
                key={plan.name}
                className={`relative flex flex-col bg-card border-2 rounded-[2.5rem] p-10 transition-all duration-500 animate-fade-in hover:-translate-y-2 hover:shadow-2xl ${
                  plan.popular ? 'border-primary shadow-2xl shadow-primary/10 scale-105 z-10' : 'border-border hover:border-primary/30'
                }`}
                style={{ animationDelay: `${i * 100}ms` }}
              >
                {plan.popular && (
                  <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-full shadow-xl">
                    Most Popular
                  </div>
                )}
                <div className="mb-8">
                   <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
                      <plan.icon className="w-7 h-7 text-primary" />
                   </div>
                   <h3 className="text-3xl font-black text-foreground mb-2">{plan.name}</h3>
                   <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-5xl font-black text-foreground">{plan.price}</span>
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
                    if (plan.current) return;
                    if (plan.name === 'Free') return;
                    openPaymentModal(plan.name.toLowerCase() as 'premium' | 'pro');
                  }}
                  disabled={plan.current || loadingTier === plan.name.toLowerCase()}
                  className={`w-full py-5 rounded-2xl font-black tracking-widest uppercase text-xs transition-all shadow-xl active:scale-95 ${
                    plan.current 
                      ? 'bg-muted text-muted-foreground cursor-default'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/30 hover:scale-[1.02]'
                  }`}
                >
                   {loadingTier === plan.name.toLowerCase() ? 'Processing...' : plan.cta}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
             {teamPlans.map((plan, i) => (
                <div key={i} className="bg-card border-2 border-border rounded-[2.5rem] p-10 hover:border-primary/30 transition-all duration-500 animate-fade-in" style={{ animationDelay: `${i * 150}ms` }}>
                   <div className="flex items-center gap-5 mb-8">
                      <div className="w-16 h-16 rounded-[1.25rem] bg-primary/10 flex items-center justify-center">
                         <plan.icon className="w-8 h-8 text-primary" />
                      </div>
                      <div>
                         <h3 className="text-2xl font-black text-foreground">{plan.name}</h3>
                         <p className="text-sm text-muted-foreground font-bold">Team Governance & Productivity</p>
                      </div>
                   </div>
                   <p className="text-sm text-muted-foreground mb-10 leading-relaxed">{plan.description}</p>
                   
                   <div className="grid grid-cols-2 gap-4 mb-10">
                      {plan.tiers.map((tier, ti) => (
                        <div key={ti} className={`p-6 rounded-[1.5rem] border-2 transition-all ${tier.popular ? 'border-primary bg-primary/5' : 'border-border'}`}>
                           <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">{tier.name}</p>
                           <p className="text-2xl font-black text-foreground">{tier.price}</p>
                           <button 
                             onClick={() => openPaymentModal(tier.name.toLowerCase() as any, plan.name)}
                             className="w-full mt-6 py-3 bg-primary text-primary-foreground rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/10"
                           >
                              Get {tier.name}
                           </button>
                        </div>
                      ))}
                   </div>

                   <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {plan.features.map((f, fi) => (
                        <li key={fi} className="flex items-start gap-3 text-xs text-muted-foreground font-bold leading-tight">
                           <Check className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
                           {f}
                        </li>
                      ))}
                   </ul>
                </div>
             ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Pricing;
