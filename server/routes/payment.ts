import { Router, Request, Response } from 'express';
import { db } from '../db';
import { users, organizations, coupons, couponRedemptions, pendingPayments, transactions, type UpdateUser, type UpdateOrganization } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getSettingNumber } from '../lib/settings';

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
// paypal-rest-sdk is deprecated by PayPal and fails for newer app integrations).
const paypalConfigured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
const paypalApiBase = (process.env.PAYPAL_MODE || 'sandbox') === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

let paypalTokenCache: { token: string; expiresAt: number } | null = null;

async function getPayPalAccessToken(): Promise<string> {
  if (paypalTokenCache && paypalTokenCache.expiresAt > Date.now() + 60_000) {
    return paypalTokenCache.token;
  }
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${paypalApiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PayPal authentication failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('PayPal authentication returned no access token');
  paypalTokenCache = { token: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return data.access_token;
}

const newRequestId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

async function createPayPalOrder(options: {
  amount: string;
  returnUrl: string;
  cancelUrl: string;
  description: string;
}): Promise<{ approvalUrl: string; paymentId: string }> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${paypalApiBase}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': newRequestId(),
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        description: options.description.slice(0, 127),
        amount: { currency_code: 'USD', value: options.amount },
      }],
      application_context: {
        brand_name: 'Task Joy Box',
        return_url: options.returnUrl,
        cancel_url: options.cancelUrl,
        user_action: 'PAY_NOW',
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PayPal order creation failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = await res.json() as { id?: string; links?: Array<{ rel: string; href: string }> };
  const approvalUrl = data.links?.find((l: any) => l.rel === 'approve')?.href;
  if (!data.id || !approvalUrl) {
    throw new Error('No approval URL in PayPal response');
  }
  return { approvalUrl, paymentId: data.id };
}

async function capturePayPalOrder(orderId: string): Promise<void> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${paypalApiBase}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': newRequestId(),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PayPal capture failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

// Plan definitions matching the new tier structure
const PRICING_TIERS = {
  free: {
    name: 'Free',
    price: 0,
    features: [
      'Basic task list',
      'Simple daily planner',
      'Up to 2 projects',
      'Basic calendar view',
    ],
  },
  pro: {
    name: 'Premium',
    price: 5.99,
    features: [
      'Everything in Free',
      'Unlimited tasks and projects',
      'Full calendar system',
      'Reminders and notifications',
      'Habit tracker',
      'Notes section',
      'Custom categories',
      'Cloud sync across devices',
    ],
  },
  premium: {
    name: 'Pro',
    price: 12.99,
    features: [
      'Everything in Premium',
      'AI planning assistant',
      'Advanced analytics & productivity tracking',
      'Goal tracking with progress charts',
      'Collaboration & team sharing',
      'Priority support',
      'Full customisation (themes, layouts)',
    ],
  },
};

router.get('/pricing', async (_req: Request, res: Response) => {
  const proPrice = await getSettingNumber('price_pro_monthly', PRICING_TIERS.pro.price);
  const premiumPrice = await getSettingNumber('price_premium_monthly', PRICING_TIERS.premium.price);
  res.json({
    ...PRICING_TIERS,
    pro: { ...PRICING_TIERS.pro, price: proPrice },
    premium: { ...PRICING_TIERS.premium, price: premiumPrice },
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

// Create PayPal checkout (only payment method)
router.post('/create-checkout-session', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tier = req.body?.tier as SubscriptionTier;
    const planType = req.body?.planType || 'personal';
    const couponCode = req.body?.couponCode || null;

    console.log('Payment request received:', { tier, planType, userId: req.userId, couponCode });

    if (!tier || !['premium', 'pro'].includes(tier)) {
      console.log('Invalid tier validation failed:', { tier, planType, body: req.body });
      return res.status(400).json({ 
        error: 'Invalid tier selected. Available tiers: premium, pro. Family and business plans are not currently available.' 
      });
    }

    if (!paypalConfigured) {
      return res.status(503).json({ error: 'PayPal is not configured on this server' });
    }

    const selectedTier = PRICING_TIERS[tier];
    const appBaseUrl = getAppBaseUrl(req);

    let adjustedPrice = selectedTier.price;
    if (planType === 'education' || planType === 'business') {
      const seats = req.body?.seats || 1;
      adjustedPrice = tier === 'premium' ? 3 * seats : 8 * seats;
    } else if (planType === 'family') {
      adjustedPrice = tier === 'premium' ? 9.99 : 14.99;
    }

    // Apply coupon discount
    let couponId: number | null = null;
    if (couponCode) {
      const [coupon] = await db.select().from(coupons).where(eq(coupons.code, couponCode.toUpperCase())).limit(1);
      if (coupon && coupon.active) {
        const now = new Date().toISOString();
        const isValid = (!coupon.startDate || coupon.startDate <= now) &&
          (!coupon.expiresAt || coupon.expiresAt >= now) &&
          (coupon.maxUses === null || coupon.usedCount < coupon.maxUses);

        if (isValid) {
          if (coupon.discountType === 'percentage') {
            adjustedPrice = adjustedPrice * (1 - coupon.discountValue / 100);
          } else {
            adjustedPrice = Math.max(0, adjustedPrice - coupon.discountValue);
          }
          couponId = coupon.id;
        }
      }
    }

    const paymentData = {
      amount: adjustedPrice.toFixed(2),
      returnUrl: `${appBaseUrl}/api/payment/execute-payment?tier=${tier}&planType=${planType}${couponId ? `&couponId=${couponId}` : ''}`,
      cancelUrl: `${appBaseUrl}/pricing?subscription=cancelled`,
      description: `${selectedTier.name} ${planType.charAt(0).toUpperCase() + planType.slice(1)} Plan — My Planner subscription`,
    };

    const { approvalUrl, paymentId } = await createPayPalOrder(paymentData);
    console.log('PayPal order created successfully:', { paymentId, approvalUrl });

    // Record the exact purchase intent so the return URL can't be tampered with
    // (tier/seats/coupon are read back from this record, never from the query string).
    await db.insert(pendingPayments).values({
      userId: req.userId!,
      orderId: paymentId,
      tier,
      planType,
      couponId,
      amountCents: Math.round(adjustedPrice * 100),
    }).onConflictDoUpdate({
      target: pendingPayments.orderId,
      set: { userId: req.userId!, tier, planType, couponId, amountCents: Math.round(adjustedPrice * 100), status: 'pending' },
    });

    res.json({ approvalUrl, paymentId });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session', details: error instanceof Error ? error.message : 'Unknown PayPal error' });
  }
});

// Create PayPal checkout for org seats
router.post('/create-org-checkout-session', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { orgId, tier, seats } = req.body;

    if (!tier || !['premium', 'pro'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier selected' });
    }

    const parsedOrgId = safeParseInt(orgId);
    const parsedSeats = safeParseInt(seats);

    if (!parsedOrgId || !parsedSeats || parsedSeats < 1) {
      return res.status(400).json({ error: 'Invalid organization or seat count' });
    }

    if (!paypalConfigured) return res.status(503).json({ error: 'PayPal is not configured' });

    const orgs = await db.select().from(organizations).where(eq(organizations.id, parsedOrgId)).limit(1);
    if (!orgs.length || orgs[0].ownerId !== req.userId) {
      return res.status(403).json({ error: 'Not authorized to manage this organization' });
    }

    const selectedTier = PRICING_TIERS[tier as SubscriptionTier];
    const appBaseUrl = getAppBaseUrl(req);
    const totalCents = Math.round(selectedTier.price * parsedSeats * 100);
    const total = (totalCents / 100).toFixed(2);

    const { approvalUrl, paymentId } = await createPayPalOrder({
      amount: total,
      returnUrl: `${appBaseUrl}/api/payment/execute-org-payment?orgId=${parsedOrgId}&tier=${tier}&seats=${parsedSeats}`,
      cancelUrl: `${appBaseUrl}/collaboration?org_payment=cancelled`,
      description: `Organization Seats — ${selectedTier.name} (${parsedSeats} seats)`,
    });

    await db.insert(pendingPayments).values({
      userId: req.userId!,
      orderId: paymentId,
      tier: tier as string,
      planType: 'org',
      seats: parsedSeats,
      orgId: parsedOrgId,
      amountCents: totalCents,
    }).onConflictDoUpdate({
      target: pendingPayments.orderId,
      set: { userId: req.userId!, tier: tier as string, planType: 'org', seats: parsedSeats, orgId: parsedOrgId, amountCents: totalCents, status: 'pending' },
    });

    res.json({ approvalUrl, paymentId });
  } catch (error) {
    console.error('Error creating org checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session', details: error instanceof Error ? error.message : 'Unknown PayPal error' });
  }
});

// Execute PayPal payment after approval
router.get('/execute-payment', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!paypalConfigured) return res.status(503).json({ error: 'PayPal is not configured' });

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
    await db.update(users)
      .set({
        subscriptionTier: intent.tier,
        subscriptionStatus: 'active',
        subscriptionEndsAt: null,
      } as UpdateUser)
      .where(eq(users.id, req.userId!));

    // Track coupon redemption from the recorded intent
    if (intent.couponId) {
      await db.insert(couponRedemptions).values({
        couponId: intent.couponId,
        userId: req.userId!,
      });

      // Increment used count
      const [coupon] = await db.select().from(coupons).where(eq(coupons.id, intent.couponId)).limit(1);
      if (coupon) {
        const newUsedCount = coupon.usedCount + 1;
        const updateData: any = { usedCount: newUsedCount };

        // Auto-deactivate if usage limit reached
        if (coupon.maxUses !== null && newUsedCount >= coupon.maxUses) {
          updateData.active = false;
        }

        await db.update(coupons).set(updateData).where(eq(coupons.id, intent.couponId));
      }
    }

    // Record the completed transaction for revenue tracking
    await db.insert(transactions).values({
      userId: req.userId!,
      amount: intent.amountCents,
      currency: 'USD',
      status: 'completed',
      provider: 'paypal',
      providerTransactionId: paymentId,
      couponId: intent.couponId || null,
    }).onConflictDoNothing({ target: transactions.providerTransactionId });

    await db.update(pendingPayments).set({ status: 'paid' }).where(eq(pendingPayments.orderId, paymentId));

    res.redirect(`${getAppBaseUrl(req)}/pricing?subscription=success`);
  } catch (dbError) {
    console.error('Database update error:', dbError);
    res.status(500).json({ error: 'Failed to update subscription status' });
  }
});

// Execute PayPal organization payment
router.get('/execute-org-payment', requireAuth, async (req: AuthRequest, res: Response) => {
  const paymentId = (req.query.paymentId || req.query.token) as string | undefined;
  if (!paymentId) return res.status(400).json({ error: 'Missing parameters' });

  // Seats/org/tier come from the recorded intent, never from the query string
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
    await db.update(organizations)
      .set({ status: 'active', tier: intent.tier, maxSeats: intent.seats || 1 } as UpdateOrganization)
      .where(eq(organizations.id, intent.orgId));

    await db.insert(transactions).values({
      userId: req.userId!,
      amount: intent.amountCents,
      currency: 'USD',
      status: 'completed',
      provider: 'paypal',
      providerTransactionId: paymentId,
    }).onConflictDoNothing({ target: transactions.providerTransactionId });

    await db.update(pendingPayments).set({ status: 'paid' }).where(eq(pendingPayments.orderId, paymentId));

    res.redirect(`${getAppBaseUrl(req)}/collaboration?org_payment=success`);
  } catch {
    res.status(500).json({ error: 'Failed to activate organization' });
  }
});

// Get user's subscription status
router.get('/subscription-status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await db.select().from(users).where(eq(users.id, req.userId!)).limit(1);
    if (!user.length) return res.status(404).json({ error: 'User not found' });
    res.json({
      tier: user[0].subscriptionTier || 'free',
      status: user[0].subscriptionStatus || 'inactive',
      endsAt: user[0].subscriptionEndsAt || null,
    });
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

export default router;