import { Router, Request, Response } from 'express';
import { db } from '../db';
import { users, organizations, type UpdateUser, type UpdateOrganization } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth';
import * as paypalSdk from 'paypal-rest-sdk';
import { encrypt, decrypt } from '../lib/encryption';

const router = Router();
const paypal = paypalSdk;
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

// Configure PayPal
const paypalConfigured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
if (paypalConfigured) {
  paypal.configure({
    mode: process.env.PAYPAL_MODE || 'sandbox',
    client_id: process.env.PAYPAL_CLIENT_ID || '',
    client_secret: process.env.PAYPAL_CLIENT_SECRET || '',
  });
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

router.get('/pricing', (_req: Request, res: Response) => {
  res.json(PRICING_TIERS);
});

// Create PayPal checkout (only payment method)
router.post('/create-checkout-session', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const tier = req.body?.tier as SubscriptionTier;
    const planType = req.body?.planType || 'personal';

    console.log('Payment request received:', { tier, planType, userId: req.userId });

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

    const paymentData = {
      intent: 'sale',
      payer: { payment_method: 'paypal' },
      redirect_urls: {
        return_url: `${appBaseUrl}/api/payment/execute-payment`,
        cancel_url: `${appBaseUrl}/pricing?subscription=cancelled`,
      },
      transactions: [{
        item_list: {
          items: [{
            name: `${selectedTier.name} ${planType.charAt(0).toUpperCase() + planType.slice(1)} Plan`,
            sku: `${planType}_${tier}`,
            price: adjustedPrice.toFixed(2),
            currency: 'USD',
            quantity: 1,
          }]
        },
        amount: { currency: 'USD', total: adjustedPrice.toFixed(2) },
        description: `Task-Joy subscription — ${selectedTier.name} ${planType} plan`,
      }]
    };

    paypal.payment.create(paymentData, (error: any, payment: any) => {
      if (error) {
        console.error('PayPal payment creation error:', {
          error: error,
          message: error.message,
          details: error.details,
          response: error.response,
          paymentData: paymentData
        });
        return res.status(500).json({ 
          error: 'Failed to create PayPal payment', 
          details: error.message || 'Unknown PayPal error' 
        });
      }
      if (!payment) {
        console.error('No payment response from PayPal:', { paymentData });
        return res.status(500).json({ error: 'No payment response from PayPal' });
      }
      const approvalUrl = payment.links?.find((l: any) => l.rel === 'approval_url')?.href;
      if (!approvalUrl) {
        console.error('No approval URL in PayPal response:', { payment, links: payment.links });
        return res.status(500).json({ error: 'No approval URL in PayPal response' });
      }
      console.log('PayPal payment created successfully:', { paymentId: payment.id, approvalUrl });
      res.json({ approvalUrl, paymentId: payment.id });
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
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
    const total = (selectedTier.price * parsedSeats).toFixed(2);

    const paymentData = {
      intent: 'sale',
      payer: { payment_method: 'paypal' },
      redirect_urls: {
        return_url: `${appBaseUrl}/api/payment/execute-org-payment?orgId=${parsedOrgId}&tier=${tier}&seats=${parsedSeats}`,
        cancel_url: `${appBaseUrl}/collaboration?org_payment=cancelled`,
      },
      transactions: [{
        amount: { currency: 'USD', total },
        description: `Organization Seats — ${selectedTier.name} (${parsedSeats} seats)`,
        item_list: {
          items: [{
            name: `${selectedTier.name} Seats`,
            sku: `org_${tier}`,
            price: selectedTier.price.toFixed(2),
            currency: 'USD',
            quantity: parsedSeats,
          }]
        }
      }]
    };

    paypal.payment.create(paymentData, (error: any, payment: any) => {
      if (error) {
        console.error('PayPal org payment error:', error);
        return res.status(500).json({ error: 'Failed to create PayPal payment', details: error.message });
      }
      if (!payment) {
        return res.status(500).json({ error: 'No payment response from PayPal' });
      }
      const approvalUrl = payment.links?.find((l: any) => l.rel === 'approval_url')?.href;
      if (!approvalUrl) {
        return res.status(500).json({ error: 'No approval URL in PayPal response' });
      }
      res.json({ approvalUrl, paymentId: payment.id });
    });
  } catch (error) {
    console.error('Error creating org checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Execute PayPal payment after approval
router.get('/execute-payment', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!paypalConfigured) return res.status(503).json({ error: 'PayPal is not configured' });

  const { paymentId, PayerID } = req.query;
  if (!paymentId || !PayerID) return res.status(400).json({ error: 'Missing payment parameters' });

  paypal.payment.execute(paymentId as string, { payer_id: PayerID as string }, async (error: any, payment: any) => {
    if (error) {
      console.error('PayPal payment execution error:', error);
      return res.status(500).json({ error: 'Failed to execute PayPal payment', details: error.message });
    }
    try {
      const sku = payment.transactions[0].item_list?.items[0]?.sku;
      const parts = sku?.split('_') || [];
      const tier = parts[1] as SubscriptionTier || 'pro';

      await db.update(users)
        .set({
          subscriptionTier: tier,
          subscriptionStatus: 'active',
          subscriptionEndsAt: null,
        } as UpdateUser)
        .where(eq(users.id, req.userId!));

      res.redirect(`${getAppBaseUrl(req)}/pricing?subscription=success`);
    } catch (dbError) {
      console.error('Database update error:', dbError);
      res.status(500).json({ error: 'Failed to update subscription status' });
    }
  });
});

// Execute PayPal organization payment
router.get('/execute-org-payment', requireAuth, async (req: AuthRequest, res: Response) => {
  const { paymentId, PayerID, orgId, tier, seats } = req.query;
  if (!paymentId || !PayerID || !orgId) return res.status(400).json({ error: 'Missing parameters' });

  const parsedOrgId = parseInt(orgId as string);
  const parsedSeats = parseInt(seats as string);
  const selectedTier = PRICING_TIERS[tier as SubscriptionTier];
  const total = (selectedTier.price * parsedSeats).toFixed(2);

  paypal.payment.execute(paymentId as string, { payer_id: PayerID as string }, async (error: any) => {
    if (error) {
      console.error('PayPal org execution error:', error);
      return res.status(500).json({ error: 'Failed to execute payment', details: error.message });
    }
    try {
      await db.update(organizations)
        .set({ status: 'active', tier: tier as string, maxSeats: parsedSeats } as UpdateOrganization)
        .where(eq(organizations.id, parsedOrgId));
      res.redirect(`${getAppBaseUrl(req)}/collaboration?org_payment=success`);
    } catch {
      res.status(500).json({ error: 'Failed to activate organization' });
    }
  });
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