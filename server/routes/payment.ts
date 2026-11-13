import { Router, Request, Response } from 'express';
import { db } from '../db.js';
import { users, organizations, organizationMembers, coupons, couponRedemptions, pendingPayments, transactions, type UpdateUser, type UpdateOrganization } from '../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getSettingNumber } from '../lib/settings.js';
import {
  applyCouponDiscount,
  calculateCheckoutPricing,
  normalizeBillingPeriod,
  normalizePlanType,
  FAMILY_MONTHLY_PRICE,
  FAMILY_SEATS,
} from '../lib/pricing.js';
import {
  reconcileUserOrgState,
  reconcileOrgMembers,
  resolveEffectiveUserPlan,
  DAY_MS,
} from '../lib/orgLifecycle.js';
import {
  capturePayPalOrder,
  createPayPalOrder,
  getPayPalCredentials,
  getPayPalMode,
  getPayPalAccessToken,
  isPayPalConfigured,
} from '../lib/paypal.js';

const router = Router();
const frontendUrl = process.env.FRONTEND_URL || '';

type SubscriptionTier = 'free' | 'premium' | 'pro';

function getAppBaseUrl(req: Request): string {
  if (frontendUrl) return frontendUrl;
  return `${req.protocol}://${req.get('host')}`;
}

function safeParseInt(value: unknown): number | null {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

// ── PayPal Orders v2 integration (the legacy REST v1 /v1/payments API used by
// paypal-rest-sdk is deprecated by PayPal and fails for newer app integrations
// with `invalid_client`). Shared helpers live in server/lib/paypal.ts.

// Plan definitions matching the active tier limits
const PRICING_TIERS = {
  free: {
    name: 'Free',
    price: 0,
    features: [
      'Up to 5 projects & 10 tags',
      '25 active tasks & 25 active notes',
      '5 task templates & 5 note templates',
      'Normal alerts & 30-day project chat history',
    ],
  },
  premium: {
    name: 'Premium',
    price: 4.99,
    features: [
      'Up to 15 projects & 15 tags',
      '100 active tasks & 100 active notes',
      'Files & images (15 each, 10MB max)',
      'AI Assistant, Smart Alerts & Email notifications',
      'CSV insights export & 1-year project chat history',
    ],
  },
  pro: {
    name: 'Pro',
    price: 9.99,
    features: [
      'Up to 20 projects & 25 tags',
      'Unlimited active tasks, notes & templates',
      'Files & images (25 each, 25MB max)',
      'AI Task & Note Builders + Task & Note Analysis',
      'CSV & PDF insights export, Weekly AI Summary & Priority Support',
    ],
  },
};

router.get('/pricing', async (_req: Request, res: Response) => {
  const proPrice = await getSettingNumber('price_pro_monthly', PRICING_TIERS.pro.price);
  const premiumPrice = await getSettingNumber('price_premium_monthly', PRICING_TIERS.premium.price);
  const familyPrice = await getSettingNumber('price_family_monthly', FAMILY_MONTHLY_PRICE);
  res.json({
    ...PRICING_TIERS,
    pro: { ...PRICING_TIERS.pro, price: proPrice },
    premium: { ...PRICING_TIERS.premium, price: premiumPrice },
    family: { name: 'Family', price: familyPrice, seats: FAMILY_SEATS, tier: 'pro' },
    school: {
      name: 'School',
      tier: 'pro',
      volumeTiers: [
        { maxSeats: 20, perSeatMonthly: 4.0 },
        { maxSeats: 50, perSeatMonthly: 3.5 },
        { maxSeats: 100, perSeatMonthly: 3.0 },
        { maxSeats: 250, perSeatMonthly: 2.5 },
        { maxSeats: null, perSeatMonthly: 2.0 },
      ],
    },
  });
});

// Validate a coupon code
router.post('/validate-coupon', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { code, plan } = req.body;
    if (!code) return res.status(400).json({ error: 'Coupon code is required' });

    const [coupon] = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase())).limit(1);
    if (!coupon) return res.status(404).json({ error: 'This coupon does not exist' });
    if (!coupon.active) return res.status(400).json({ error: 'This coupon is no longer active' });

    const now = new Date().toISOString();
    if (coupon.startDate && coupon.startDate > now) {
      return res.status(400).json({ error: 'This coupon has not started yet' });
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      return res.status(400).json({ error: 'This coupon has expired' });
    }
    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ error: 'This coupon has reached its usage limit' });
    }
    if (coupon.restrictedToEmail) {
      const [user] = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
      if (!user || user.email !== coupon.restrictedToEmail) {
        return res.status(400).json({ error: 'This coupon is not valid for your account' });
      }
    }
    if (coupon.restrictedToPlan && plan && coupon.restrictedToPlan !== plan) {
      return res.status(400).json({ error: `This coupon is only valid for the ${coupon.restrictedToPlan} plan` });
    }
    if (coupon.oneTimePerUser) {
      const [existing] = await db.select().from(couponRedemptions)
        .where(and(eq(couponRedemptions.couponId, coupon.id), eq(couponRedemptions.userId, req.userId!)))
        .limit(1);
      if (existing) {
        return res.status(400).json({ error: 'You have already used this coupon' });
      }
    }

    const discount = coupon.discountType === 'percentage' ? `${coupon.discountValue}% OFF` : `$${coupon.discountValue} OFF`;
    res.json({
      valid: true,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountLabel: `${coupon.code} — ${discount}`,
    });
  } catch (error) {
    console.error('Coupon validation error:', error);
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
});

// Create PayPal checkout (personal, family, or school)
router.post('/create-checkout-session', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const requestedTier = String(req.body?.tier || 'pro').toLowerCase() as SubscriptionTier;
    const planType = normalizePlanType(req.body?.planType);
    const billingPeriod = normalizeBillingPeriod(req.body?.billingPeriod);
    const couponCode = req.body?.couponCode || null;

    if (!['premium', 'pro'].includes(requestedTier)) {
      return res.status(400).json({
        error: 'Invalid tier selected. Please choose Premium, Pro, Family, or School.',
      });
    }

    const paidTier = (planType === 'family' ? 'pro' : requestedTier) as 'premium' | 'pro';
    const selectedTier = PRICING_TIERS[paidTier];
    const appBaseUrl = getAppBaseUrl(req);

    const personalUnitMonthly = await getSettingNumber(
      paidTier === 'pro' ? 'price_pro_monthly' : 'price_premium_monthly',
      selectedTier.price
    );
    const familyMonthly = await getSettingNumber('price_family_monthly', FAMILY_MONTHLY_PRICE);

    const pricingCalc = calculateCheckoutPricing({
      tier: paidTier,
      planType,
      billingPeriod,
      seats: req.body?.seats,
      personalUnitMonthly,
      familyMonthly,
    });

    let adjustedPrice = pricingCalc.totalDueNow;

    // Apply coupon discount
    let couponId: number | null = null;
    if (couponCode) {
      const [coupon] = await db.select().from(coupons).where(eq(coupons.code, String(couponCode).toUpperCase())).limit(1);
      if (coupon && coupon.active) {
        const now = new Date().toISOString();
        const isValid = (!coupon.startDate || coupon.startDate <= now) &&
          (!coupon.expiresAt || coupon.expiresAt >= now) &&
          (coupon.maxUses === null || coupon.usedCount < coupon.maxUses);

        if (isValid) {
          adjustedPrice = applyCouponDiscount(adjustedPrice, coupon.discountType, coupon.discountValue);
          couponId = coupon.id;
        }
      }
    }

    const storedPlanType = `${pricingCalc.planType}|${pricingCalc.billingPeriod}`;

    // If a valid 100%-off coupon covers the entire charge, fulfill directly without PayPal $0 error
    if (adjustedPrice <= 0 && couponId) {
      const endsAt = new Date(Date.now() + pricingCalc.durationDays * DAY_MS).toISOString();
      let createdOrgId: number | null = null;
      await db.transaction(async (tx) => {
        if (pricingCalc.planType === 'personal') {
          await tx.update(users)
            .set({
              subscriptionTier: pricingCalc.tier,
              subscriptionStatus: 'active',
              subscriptionEndsAt: endsAt,
              pausedPersonalTier: null,
              pausedPersonalStatus: null,
              pausedPersonalRemainingMs: null,
              pausedPersonalAt: null,
            } as UpdateUser)
            .where(eq(users.id, req.userId!));
        } else {
          const [purchaser] = await tx.select().from(users).where(eq(users.id, req.userId!)).limit(1);
          const orgName = pricingCalc.planType === 'family'
            ? `${purchaser?.name || 'Family'} Plan`
            : `${purchaser?.name || 'School'} Organization`;
          const rootCode = String(Math.floor(100000 + Math.random() * 900000));
          const [newOrg] = await tx.insert(organizations).values({
            name: orgName,
            type: pricingCalc.planType,
            ownerId: req.userId!,
            maxSeats: pricingCalc.seats,
            currentSeats: 1,
            tier: pricingCalc.tier,
            status: 'active',
            joinCode: rootCode,
          }).returning();
          createdOrgId = newOrg.id;
          await tx.insert(organizationMembers).values({
            organizationId: newOrg.id,
            userId: req.userId!,
            role: 'owner',
          });
        }

        await tx.insert(couponRedemptions).values({ couponId: couponId!, userId: req.userId! });
        const [updatedCoupon] = await tx.update(coupons)
          .set({ usedCount: sql`${coupons.usedCount} + 1` })
          .where(and(eq(coupons.id, couponId!), sql`(${coupons.maxUses} IS NULL OR ${coupons.usedCount} < ${coupons.maxUses})`))
          .returning({ id: coupons.id, usedCount: coupons.usedCount, maxUses: coupons.maxUses });
        if (updatedCoupon && updatedCoupon.maxUses !== null && updatedCoupon.usedCount >= updatedCoupon.maxUses) {
          await tx.update(coupons).set({ active: false }).where(eq(coupons.id, couponId!));
        }
      });

      await reconcileUserOrgState(req.userId!);
      return res.json({
        approvalUrl: createdOrgId
          ? `${appBaseUrl}/organizations?id=${createdOrgId}&org_payment=success`
          : `${appBaseUrl}/pricing?subscription=success`,
        paymentId: `FREE-${Date.now()}`,
      });
    }

    if (!isPayPalConfigured()) {
      console.error('PayPal not configured — missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET env vars');
      return res.status(503).json({ error: 'PayPal is not configured on this server. Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_MODE in Render/Vercel Environment Variables and redeploy.' });
    }

    const planLabel =
      pricingCalc.planType === 'family'
        ? `Family Plan (5 seats)`
        : pricingCalc.planType === 'school'
        ? `School Plan (${pricingCalc.seats} seats)`
        : `${selectedTier.name} Personal Plan`;

    const paymentData = {
      amount: adjustedPrice.toFixed(2),
      returnUrl: `${appBaseUrl}/api/payment/execute-payment`,
      cancelUrl: `${appBaseUrl}/pricing?subscription=cancelled`,
      description: `${planLabel} (${pricingCalc.billingPeriod}) — My Planner`,
    };

    const { approvalUrl, paymentId } = await createPayPalOrder(paymentData);

    await db.insert(pendingPayments).values({
      userId: req.userId!,
      orderId: paymentId,
      tier: pricingCalc.tier,
      planType: storedPlanType,
      seats: pricingCalc.seats,
      couponId,
      amountCents: Math.round(adjustedPrice * 100),
    }).onConflictDoUpdate({
      target: pendingPayments.orderId,
      set: {
        userId: req.userId!,
        tier: pricingCalc.tier,
        planType: storedPlanType,
        seats: pricingCalc.seats,
        couponId,
        amountCents: Math.round(adjustedPrice * 100),
        status: 'pending',
      },
    });

    res.json({ approvalUrl, paymentId });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    const msg = error instanceof Error ? error.message : 'Unknown PayPal error';
    // Surface PayPal auth / DB table-missing errors with more context so server logs are actionable
    const hint = msg.includes('relation') && msg.includes('does not exist')
      ? 'Database table missing — redeploy after api/index.ts fix or run initDatabase.'
      : msg.includes('PayPal authentication failed')
        ? `invalid_client means the credentials were rejected for PAYPAL_MODE=${getPayPalMode()}. Use SANDBOX credentials with PAYPAL_MODE=sandbox, or LIVE credentials with PAYPAL_MODE=live (developer.paypal.com > your App > Client ID/Secret). Also set the same 3 vars on Render/Vercel and redeploy.`
        : undefined;
    res.status(500).json({ error: 'Failed to create checkout session', details: msg, hint });
  }
});

// Create PayPal checkout for upgrading/resizing an existing organization's seats/plan
router.post('/create-org-checkout-session', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { orgId, tier, seats, billingPeriod: rawBillingPeriod } = req.body;

    if (!tier || !['premium', 'pro'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier selected' });
    }

    const parsedOrgId = safeParseInt(orgId);
    const parsedSeats = safeParseInt(seats);
    const billingPeriod = normalizeBillingPeriod(rawBillingPeriod);

    if (!parsedOrgId || !parsedSeats || parsedSeats < 1) {
      return res.status(400).json({ error: 'Invalid organization or seat count' });
    }

    if (!isPayPalConfigured()) return res.status(503).json({ error: 'PayPal is not configured' });

    const [org] = await db.select().from(organizations).where(eq(organizations.id, parsedOrgId)).limit(1);
    if (!org || org.ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to manage this organization' });
    }
    if (org.type === 'family' && parsedSeats !== FAMILY_SEATS) {
      return res.status(400).json({ error: 'Family plans are fixed at 5 seats.' });
    }
    if (parsedSeats < org.currentSeats) {
      return res.status(400).json({ error: `Cannot set seats below current usage (${org.currentSeats}).` });
    }

    const familyMonthly = await getSettingNumber('price_family_monthly', FAMILY_MONTHLY_PRICE);
    const proUnit = await getSettingNumber('price_pro_monthly', PRICING_TIERS.pro.price);
    const pricingCalc = calculateCheckoutPricing({
      tier: org.type === 'family' ? 'pro' : (tier as 'premium' | 'pro'),
      planType: org.type === 'family' ? 'family' : 'school',
      billingPeriod,
      seats: parsedSeats,
      personalUnitMonthly: proUnit,
      familyMonthly,
    });

    const appBaseUrl = getAppBaseUrl(req);
    const totalCents = Math.round(pricingCalc.totalDueNow * 100);
    const total = (totalCents / 100).toFixed(2);

    const { approvalUrl, paymentId } = await createPayPalOrder({
      amount: total,
      returnUrl: `${appBaseUrl}/api/payment/execute-org-payment`,
      cancelUrl: `${appBaseUrl}/organizations?id=${parsedOrgId}&org_payment=cancelled`,
      description: `${org.name} — ${pricingCalc.tier.toUpperCase()} (${pricingCalc.seats} seats, ${pricingCalc.billingPeriod})`,
    });

    const storedPlanType = `${org.type}|${pricingCalc.billingPeriod}`;
    await db.insert(pendingPayments).values({
      userId: req.userId!,
      orderId: paymentId,
      tier: pricingCalc.tier,
      planType: storedPlanType,
      seats: pricingCalc.seats,
      orgId: parsedOrgId,
      amountCents: totalCents,
    }).onConflictDoUpdate({
      target: pendingPayments.orderId,
      set: { userId: req.userId!, tier: pricingCalc.tier, planType: storedPlanType, seats: pricingCalc.seats, orgId: parsedOrgId, amountCents: totalCents, status: 'pending' },
    });

    res.json({ approvalUrl, paymentId });
  } catch (error) {
    console.error('Error creating org checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session', details: error instanceof Error ? error.message : 'Unknown PayPal error' });
  }
});

// Execute PayPal payment after approval
router.get('/execute-payment', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!isPayPalConfigured()) return res.status(503).json({ error: 'PayPal is not configured' });

  // Orders v2 appends `token` (the order id) to the return URL; older links use `paymentId`.
  const paymentId = (req.query.paymentId || req.query.token) as string | undefined;
  if (!paymentId) return res.status(400).json({ error: 'Missing payment parameters' });

  // The tier/coupon come from the recorded intent, never from the query string
  const [intent] = await db.select().from(pendingPayments).where(eq(pendingPayments.orderId, paymentId)).limit(1);
  if (!intent || intent.userId !== req.userId!) {
    return res.status(403).json({ error: 'Payment session not found for this account. Please contact support.' });
  }
  if (intent.status !== 'pending') {
    return res.status(409).json({ error: 'This payment has already been processed' });
  }

  try {
    await capturePayPalOrder(paymentId);
  } catch (error) {
    console.error('PayPal payment capture error:', error);
    return res.status(500).json({
      error: 'Failed to execute PayPal payment',
      details: error instanceof Error ? error.message : 'Unknown PayPal error',
    });
  }

  try {
    const [rawPlanType, rawPeriod] = String(intent.planType || 'personal|monthly').split('|');
    const basePlanType = normalizePlanType(rawPlanType);
    const durationDays = normalizeBillingPeriod(rawPeriod) === 'yearly' ? 365 : 30;
    const endsAt = new Date(Date.now() + durationDays * DAY_MS).toISOString();
    let createdOrgId: number | null = null;

    await db.transaction(async (tx) => {
      if (basePlanType === 'personal') {
        // Personal plan purchase updates user's own personal subscription directly
        await tx.update(users)
          .set({
            subscriptionTier: intent.tier,
            subscriptionStatus: 'active',
            subscriptionEndsAt: endsAt,
            pausedPersonalTier: null,
            pausedPersonalStatus: null,
            pausedPersonalRemainingMs: null,
            pausedPersonalAt: null,
          } as UpdateUser)
          .where(eq(users.id, req.userId!));
      } else {
        // Family or School purchase creates an organization (buyer is owner using 1 seat);
        // Rule 9 pause/reserve on any personal plan is reconciled via reconcileUserOrgState below.
        const orgSeats = basePlanType === 'family' ? FAMILY_SEATS : (intent.seats || 10);
        const [purchaser] = await tx.select().from(users).where(eq(users.id, req.userId!)).limit(1);
        const orgName = basePlanType === 'family' ? `${purchaser?.name || 'Family'} Plan` : `${purchaser?.name || 'School'} Organization`;
        const rootCode = String(Math.floor(100000 + Math.random() * 900000));

        const [newOrg] = await tx.insert(organizations).values({
          name: orgName,
          type: basePlanType,
          ownerId: req.userId!,
          maxSeats: orgSeats,
          currentSeats: 1,
          tier: intent.tier,
          status: 'active',
          joinCode: rootCode,
        }).returning();
        createdOrgId = newOrg.id;

        await tx.insert(organizationMembers).values({
          organizationId: newOrg.id,
          userId: req.userId!,
          role: 'owner',
        });
      }

      // Track coupon redemption from the recorded intent
      if (intent.couponId) {
        await tx.insert(couponRedemptions).values({
          couponId: intent.couponId,
          userId: req.userId!,
        });

        const [updated] = await tx.update(coupons)
          .set({ usedCount: sql`${coupons.usedCount} + 1` })
          .where(and(
            eq(coupons.id, intent.couponId),
            sql`(${coupons.maxUses} IS NULL OR ${coupons.usedCount} < ${coupons.maxUses})`,
          ))
          .returning({ id: coupons.id, usedCount: coupons.usedCount, maxUses: coupons.maxUses });
        if (updated && updated.maxUses !== null && updated.usedCount >= updated.maxUses) {
          await tx.update(coupons).set({ active: false }).where(eq(coupons.id, intent.couponId));
        }
      }

      await tx.insert(transactions).values({
        userId: req.userId!,
        amount: intent.amountCents,
        currency: 'USD',
        status: 'completed',
        provider: 'paypal',
        providerTransactionId: paymentId,
        couponId: intent.couponId || null,
      }).onConflictDoNothing({ target: transactions.providerTransactionId });

      await tx.update(pendingPayments).set({ status: 'paid' }).where(eq(pendingPayments.orderId, paymentId));
    });

    await reconcileUserOrgState(req.userId!);

    if (createdOrgId) {
      res.redirect(`${getAppBaseUrl(req)}/organizations?id=${createdOrgId}&org_payment=success`);
    } else {
      res.redirect(`${getAppBaseUrl(req)}/pricing?subscription=success`);
    }
  } catch (dbError) {
    console.error('Database update error:', dbError);
    res.status(500).json({ error: 'Failed to update subscription status' });
  }
});

// Execute PayPal organization payment (upgrade/resize existing org)
router.get('/execute-org-payment', requireAuth, async (req: AuthRequest, res: Response) => {
  const paymentId = (req.query.paymentId || req.query.token) as string | undefined;
  if (!paymentId) return res.status(400).json({ error: 'Missing parameters' });

  const [intent] = await db.select().from(pendingPayments).where(eq(pendingPayments.orderId, paymentId)).limit(1);
  if (!intent || intent.userId !== req.userId! || !intent.orgId) {
    return res.status(403).json({ error: 'Payment session not found for this account. Please contact support.' });
  }
  if (intent.status !== 'pending') {
    return res.status(409).json({ error: 'This payment has already been processed' });
  }

  try {
    await capturePayPalOrder(paymentId);
  } catch (error) {
    console.error('PayPal org capture error:', error);
    return res.status(500).json({ error: 'Failed to execute payment', details: error instanceof Error ? error.message : 'Unknown PayPal error' });
  }

  try {
    const orgId = intent.orgId;
    await db.transaction(async (tx) => {
      await tx.update(organizations)
        .set({ status: 'active', tier: intent.tier, maxSeats: intent.seats || 1, updatedAt: new Date().toISOString() } as UpdateOrganization)
        .where(eq(organizations.id, orgId));

      await tx.insert(transactions).values({
        userId: req.userId!,
        amount: intent.amountCents,
        currency: 'USD',
        status: 'completed',
        provider: 'paypal',
        providerTransactionId: paymentId,
      }).onConflictDoNothing({ target: transactions.providerTransactionId });

      await tx.update(pendingPayments).set({ status: 'paid' }).where(eq(pendingPayments.orderId, paymentId));
    });

    await reconcileOrgMembers(orgId);

    res.redirect(`${getAppBaseUrl(req)}/organizations?id=${orgId}&org_payment=success`);
  } catch {
    res.status(500).json({ error: 'Failed to activate organization' });
  }
});

// Diagnose PayPal credentials without creating an order.
// Returns configured/mode/client prefix only (never the secret).
router.get('/paypal-status', requireAuth, async (_req: AuthRequest, res: Response) => {
  const { clientId, clientSecret } = getPayPalCredentials();
  const mode = getPayPalMode();
  if (!clientId || !clientSecret) {
    return res.status(503).json({
      configured: false,
      mode,
      error: 'Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET on this server',
    });
  }
  try {
    await getPayPalAccessToken();
    res.json({ configured: true, mode, clientPrefix: `${clientId.slice(0, 6)}...`, ok: true });
  } catch (error) {
    res.status(502).json({
      configured: true,
      mode,
      clientPrefix: `${clientId.slice(0, 6)}...`,
      ok: false,
      error: error instanceof Error ? error.message : 'PayPal auth failed',
      hint: `invalid_client = credentials rejected for PAYPAL_MODE=${mode}. Match sandbox creds <-> sandbox mode, live creds <-> live mode.`,
    });
  }
});

// Get user's subscription status (effective personal + org reconciliation)
router.get('/subscription-status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    if (!user.length) return res.status(404).json({ error: 'User not found' });
    const plan = await resolveEffectiveUserPlan(req.userId!);
    res.json({
      tier: plan.tier,
      status: plan.status,
      endsAt: user[0].subscriptionEndsAt || null,
      source: plan.source,
      personalTier: plan.personalTier,
      personalPlanPaused: plan.personalPlanPaused,
      pausedPersonalTier: plan.pausedPersonalTier,
      reservedOrgTier: plan.reservedOrgTier,
      bestOrgName: plan.bestOrgName,
      archivedAttachmentCount: plan.archivedAttachmentCount,
      oldestArchiveExpiresAt: plan.oldestArchiveExpiresAt,
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

export default router;