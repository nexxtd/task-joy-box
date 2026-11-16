import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response, Router } from 'express';

const {
  selectQueue,
  updateQueue,
  insertQueue,
  deleteQueue,
  mockReconcileUserOrgState,
  mockReconcileOrgMembers,
  mockResolveEffectiveUserPlan,
  mockCreateNotification,
} = vi.hoisted(() => ({
  selectQueue: [] as any[],
  updateQueue: [] as any[],
  insertQueue: [] as any[],
  deleteQueue: [] as any[],
  mockReconcileUserOrgState: vi.fn(),
  mockReconcileOrgMembers: vi.fn(),
  mockResolveEffectiveUserPlan: vi.fn(),
  mockCreateNotification: vi.fn(),
}));

function makeQueryChain(queue: any[]) {
  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    set: () => chain,
    values: () => chain,
    onConflictDoNothing: () => chain,
    returning: () => chain,
    then: (onFulfilled: (value: any) => any, onRejected?: (reason: any) => any) => {
      const next = queue.length > 0 ? queue.shift() : [];
      return Promise.resolve(next).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

vi.mock('../db.js', () => ({
  db: {
    select: () => makeQueryChain(selectQueue),
    update: () => makeQueryChain(updateQueue),
    insert: () => makeQueryChain(insertQueue),
    delete: () => makeQueryChain(deleteQueue),
    transaction: async (cb: (tx: any) => Promise<any>) =>
      cb({
        select: () => makeQueryChain(selectQueue),
        update: () => makeQueryChain(updateQueue),
        insert: () => makeQueryChain(insertQueue),
        delete: () => makeQueryChain(deleteQueue),
      }),
  },
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: NextFunction) => {
    if (!req.userId) req.userId = Number(req.headers['x-test-user-id'] || 101);
    next();
  },
}));

vi.mock('../lib/orgLifecycle.js', () => ({
  DAY_MS: 86_400_000,
  reconcileUserOrgState: (...args: any[]) => mockReconcileUserOrgState(...args),
  reconcileOrgMembers: (...args: any[]) => mockReconcileOrgMembers(...args),
  resolveEffectiveUserPlan: (...args: any[]) => mockResolveEffectiveUserPlan(...args),
}));

vi.mock('../lib/notifications.js', () => ({
  createNotification: (...args: any[]) => mockCreateNotification(...args),
}));

vi.mock('../lib/settings.js', () => ({
  getSettingNumber: async (_key: string, fallback: number) => fallback,
}));

vi.mock('../lib/paypal.js', () => ({
  capturePayPalOrder: vi.fn(),
  createPayPalOrder: vi.fn(),
  getPayPalCredentials: () => ({ clientId: 'test', clientSecret: 'test' }),
  getPayPalMode: () => 'sandbox',
  getPayPalAccessToken: vi.fn(),
  isPayPalConfigured: () => false,
}));

import organizationsRouter from './organizations';
import paymentRouter from './payment';
import { DAY_MS, computePersonalVsOrgReconciliation } from '../lib/orgReconciliation';

function invokeRouter(
  router: Router,
  opts: {
    method: string;
    url: string;
    userId?: number;
    body?: any;
  },
): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let statusCode = 200;

    const parsedUrl = new URL(opts.url, 'http://localhost');
    const parsedQuery: Record<string, string> = {};
    parsedUrl.searchParams.forEach((v, k) => { parsedQuery[k] = v; });

    const req = {
      method: opts.method.toUpperCase(),
      url: opts.url,
      originalUrl: opts.url,
      headers: opts.userId ? { 'x-test-user-id': String(opts.userId) } : {},
      body: opts.body ?? {},
      query: parsedQuery,
      params: {},
      userId: opts.userId ?? 101,
      protocol: 'http',
      get: (header: string) => (header.toLowerCase() === 'host' ? 'localhost' : ''),
    } as unknown as Request;

    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: any) {
        settled = true;
        resolve({ status: statusCode, json: payload });
        return this;
      },
      send(payload: any) {
        settled = true;
        resolve({ status: statusCode, json: payload });
        return this;
      },
      redirect(url: string) {
        settled = true;
        resolve({ status: 302, json: { redirect: url } });
      },
    } as unknown as Response;

    (router as any).handle(req, res, (err: any) => {
      if (settled) return;
      if (err) reject(err);
      else resolve({ status: 404, json: { error: 'Not handled' } });
    });
  });
}

beforeEach(() => {
  selectQueue.length = 0;
  updateQueue.length = 0;
  insertQueue.length = 0;
  deleteQueue.length = 0;
  vi.clearAllMocks();
  mockReconcileUserOrgState.mockResolvedValue({
    tier: 'pro',
    status: 'active',
    source: 'organization',
    personalPlanPaused: false,
    archivedAttachmentCount: 0,
  });
  mockReconcileOrgMembers.mockResolvedValue(undefined);
});

describe('organizations routes access control & seat rules', () => {
  it('omits joinCode for regular members in GET /api/organizations and reveals it to admins/owners', async () => {
    selectQueue.push([
      {
        membershipId: 1,
        role: 'member',
        joinedAt: '2026-01-01T00:00:00Z',
        orgId: 10,
        name: 'Springfield High',
        type: 'school',
        ownerId: 1,
        maxSeats: 25,
        currentSeats: 3,
        tier: 'pro',
        status: 'active',
        joinCode: 'SECRET99',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        membershipId: 2,
        role: 'admin',
        joinedAt: '2026-01-01T00:00:00Z',
        orgId: 11,
        name: 'Club Admin',
        type: 'school',
        ownerId: 2,
        maxSeats: 15,
        currentSeats: 2,
        tier: 'premium',
        status: 'active',
        joinCode: 'ADMIN77',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    const res = await invokeRouter(organizationsRouter, {
      method: 'GET',
      url: '/',
      userId: 55,
    });

    expect(res.status).toBe(200);
    const memberOrg = res.json.joinedOrganizations.find((o: any) => o.id === 10);
    const adminOrg = res.json.organizations.find((o: any) => o.id === 11);
    expect(memberOrg).toBeDefined();
    expect(memberOrg.joinCode).toBeUndefined();
    expect(adminOrg.joinCode).toBe('ADMIN77');
  });

  it('blocks non-admin members from GET /api/organizations/:id with 403', async () => {
    selectQueue.push(
      [{ id: 10, name: 'Springfield High', type: 'school', ownerId: 1, maxSeats: 25, currentSeats: 3, tier: 'pro', status: 'active' }],
      [{ id: 9, organizationId: 10, userId: 55, role: 'member' }],
    );

    const res = await invokeRouter(organizationsRouter, {
      method: 'GET',
      url: '/10',
      userId: 55,
    });

    expect(res.status).toBe(403);
    expect(res.json.error).toMatch(/administrator/i);
  });

  it('rejects lowering seats below live member count in PUT /api/organizations/:id', async () => {
    selectQueue.push(
      [{ id: 10, name: 'Springfield High', type: 'school', ownerId: 1, maxSeats: 25, currentSeats: 4, tier: 'pro', status: 'active' }],
      [{ id: 1, organizationId: 10, userId: 1, role: 'owner' }],
      [{ cnt: 4 }], // countOrganizationMembers -> 4
    );

    const res = await invokeRouter(organizationsRouter, {
      method: 'PUT',
      url: '/10',
      userId: 1,
      body: { maxSeats: 3 },
    });

    expect(res.status).toBe(400);
    expect(res.json.error).toContain('4');
  });

  it('blocks non-owner admins from changing owner-only fields in PUT /api/organizations/:id', async () => {
    selectQueue.push(
      [{ id: 10, name: 'Springfield High', type: 'school', ownerId: 1, maxSeats: 25, currentSeats: 4, tier: 'pro', status: 'active' }],
      [{ id: 2, organizationId: 10, userId: 77, role: 'admin' }],
    );

    const res = await invokeRouter(organizationsRouter, {
      method: 'PUT',
      url: '/10',
      userId: 77,
      body: { maxSeats: 30 },
    });

    expect(res.status).toBe(403);
  });

  it('returns "Organization is full" when live member count reaches maxSeats on join', async () => {
    const familyOrg = {
      id: 20,
      name: 'Smith Family',
      type: 'family',
      ownerId: 1,
      maxSeats: 5,
      currentSeats: 5,
      tier: 'pro',
      status: 'active',
      joinCode: 'FAM555',
    };
    selectQueue.push(
      [], // matchingGroup -> none
      [familyOrg], // matchingOrg root code match
      [familyOrg], // fetch org by orgId
      [], // existingMembership -> none
      [{ cnt: 5 }], // countOrganizationMembers -> 5
    );

    const res = await invokeRouter(organizationsRouter, {
      method: 'POST',
      url: '/join',
      userId: 88,
      body: { code: 'FAM555' },
    });

    expect(res.status).toBe(400);
    expect(res.json.error).toBe('Organization is full');
  });

  it('rejects assigning a sub-group whose parent does not match parentGroupId', async () => {
    selectQueue.push(
      [{ id: 10, name: 'Springfield High', type: 'school', ownerId: 1, maxSeats: 25, currentSeats: 4, tier: 'pro', status: 'active' }],
      [{ id: 1, organizationId: 10, userId: 1, role: 'owner' }],
      [{ id: 5, organizationId: 10, userId: 42, role: 'member' }], // target membership
      [{ id: 100, organizationId: 10, parentId: null, name: 'Year 9' }], // parentGroup
      [{ id: 205, organizationId: 10, parentId: 999, name: 'Wrong Class' }], // subGroup wrong parentId
    );

    const res = await invokeRouter(organizationsRouter, {
      method: 'POST',
      url: '/10/assign-member',
      userId: 1,
      body: { targetUserId: 42, groupId: 100, subGroupId: 205 },
    });

    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/sub-group/i);
  });
});

describe('payment coupon restriction enforcement', () => {
  it('enforces restrictedToEmail and restrictedToPlan on both validate-coupon and create-checkout-session', async () => {
    const emailRestrictedCoupon = {
      id: 7,
      code: 'VIP50',
      active: true,
      discountType: 'percentage',
      discountValue: 50,
      startDate: null,
      expiresAt: null,
      maxUses: null,
      usedCount: 0,
      restrictedToEmail: 'vip@example.com',
      restrictedToPlan: null,
      oneTimePerUser: false,
    };

    // /validate-coupon with wrong user email
    selectQueue.push([emailRestrictedCoupon], [{ id: 101, email: 'other@example.com' }]);
    const validateWrongEmail = await invokeRouter(paymentRouter, {
      method: 'POST',
      url: '/validate-coupon',
      userId: 101,
      body: { code: 'VIP50', plan: 'Pro', tier: 'pro', planType: 'personal' },
    });
    expect(validateWrongEmail.status).toBe(400);

    // /create-checkout-session must ALSO block the wrong user email (not silently proceed)
    selectQueue.push([emailRestrictedCoupon], [{ id: 101, email: 'other@example.com' }]);
    const checkoutWrongEmail = await invokeRouter(paymentRouter, {
      method: 'POST',
      url: '/create-checkout-session',
      userId: 101,
      body: { tier: 'pro', planType: 'personal', billingPeriod: 'monthly', couponCode: 'VIP50' },
    });
    expect(checkoutWrongEmail.status).toBe(400);

    // /create-checkout-session enforces restrictedToPlan against chosen tier
    const proOnlyCoupon = {
      ...emailRestrictedCoupon,
      id: 8,
      code: 'PROONLY',
      restrictedToEmail: null,
      restrictedToPlan: 'pro',
    };
    selectQueue.push([proOnlyCoupon]);
    const checkoutWrongPlan = await invokeRouter(paymentRouter, {
      method: 'POST',
      url: '/create-checkout-session',
      userId: 101,
      body: { tier: 'premium', planType: 'personal', billingPeriod: 'monthly', couponCode: 'PROONLY' },
    });
    expect(checkoutWrongPlan.status).toBe(400);
    expect(checkoutWrongPlan.json.error).toMatch(/pro/i);
  });
});

describe('multi-organization plan reconciliation cascading', () => {
  const nowMs = Date.UTC(2026, 6, 1, 12, 0, 0);

  it('drops from Pro org to remaining Premium org and reserves equal-tier comparison cleanly', () => {
    const withBoth = computePersonalVsOrgReconciliation({
      ownTier: 'free',
      ownStatus: 'inactive',
      ownEndsAt: null,
      pausedTier: null,
      pausedStatus: null,
      pausedRemainingMs: null,
      orgMemberships: [
        { orgId: 1, orgName: 'School A', tier: 'premium', status: 'active' },
        { orgId: 2, orgName: 'Family B', tier: 'pro', status: 'active' },
      ],
      nowMs,
    });
    expect(withBoth.effectiveTier).toBe('pro');
    expect(withBoth.source).toBe('organization');

    const afterLeavingPro = computePersonalVsOrgReconciliation({
      ownTier: 'free',
      ownStatus: 'inactive',
      ownEndsAt: null,
      pausedTier: null,
      pausedStatus: null,
      pausedRemainingMs: null,
      orgMemberships: [{ orgId: 1, orgName: 'School A', tier: 'premium', status: 'active' }],
      nowMs,
    });
    expect(afterLeavingPro.effectiveTier).toBe('premium');
    expect(afterLeavingPro.source).toBe('organization');

    const withEqualPersonalPro = computePersonalVsOrgReconciliation({
      ownTier: 'pro',
      ownStatus: 'active',
      ownEndsAt: new Date(nowMs + 20 * DAY_MS).toISOString(),
      pausedTier: null,
      pausedStatus: null,
      pausedRemainingMs: null,
      orgMemberships: [{ orgId: 2, orgName: 'Family B', tier: 'pro', status: 'active' }],
      nowMs,
    });
    expect(withEqualPersonalPro.personalPlanPaused).toBe(true);
    expect(withEqualPersonalPro.action).toBe('pause_personal');
  });
});

describe('organization seat capacity billing quotes & policy enforcement', () => {
  it('quotes higher total when adding seats and lower total when reducing seats', async () => {
    const schoolOrg = {
      id: 10,
      name: 'Springfield High',
      type: 'school',
      ownerId: 1,
      maxSeats: 10,
      currentSeats: 4,
      tier: 'pro',
      status: 'active',
    };

    // Upgrade 10 -> 15 seats ($40 -> $60, +$20)
    selectQueue.push([schoolOrg]);
    const upgradeQuote = await invokeRouter(paymentRouter, {
      method: 'GET',
      url: '/org-seat-quote?orgId=10&seats=15&tier=pro&billingPeriod=monthly',
      userId: 1,
    });
    expect(upgradeQuote.status).toBe(200);
    expect(upgradeQuote.json.currentSeats).toBe(10);
    expect(upgradeQuote.json.newSeats).toBe(15);
    expect(upgradeQuote.json.seatDelta).toBe(5);
    expect(upgradeQuote.json.currentTotal).toBe(40);
    expect(upgradeQuote.json.newTotal).toBe(60);
    expect(upgradeQuote.json.difference).toBe(20);

    // Shrink 10 -> 6 seats ($40 -> $24, -$16)
    selectQueue.push([schoolOrg]);
    const shrinkQuote = await invokeRouter(paymentRouter, {
      method: 'GET',
      url: '/org-seat-quote?orgId=10&seats=6&tier=pro&billingPeriod=monthly',
      userId: 1,
    });
    expect(shrinkQuote.status).toBe(200);
    expect(shrinkQuote.json.newSeats).toBe(6);
    expect(shrinkQuote.json.seatDelta).toBe(-4);
    expect(shrinkQuote.json.currentTotal).toBe(40);
    expect(shrinkQuote.json.newTotal).toBe(24);
    expect(shrinkQuote.json.difference).toBe(-16);
  });

  it('rejects non-equal seat capacity changes via PUT /api/organizations/:id with 402 checkout required', async () => {
    selectQueue.push(
      [{ id: 10, name: 'Springfield High', type: 'school', ownerId: 1, maxSeats: 10, currentSeats: 4, tier: 'pro', status: 'active' }],
      [{ id: 1, organizationId: 10, userId: 1, role: 'owner' }],
      [{ cnt: 4 }],
    );

    const res = await invokeRouter(organizationsRouter, {
      method: 'PUT',
      url: '/10',
      userId: 1,
      body: { maxSeats: 15 },
    });

    expect(res.status).toBe(402);
    expect(res.json.requiresCheckout).toBe(true);
  });

  it('blocks joining via group code when allowJoinViaGroupCode is false in org settings', async () => {
    selectQueue.push(
      [{ id: 55, organizationId: 10, name: 'Year 9', joinCode: 'Y9CODE', codeActive: true }],
      [{ id: 10, name: 'Springfield High', status: 'active', settings: JSON.stringify({ allowJoinViaGroupCode: false }) }],
    );

    const res = await invokeRouter(organizationsRouter, {
      method: 'POST',
      url: '/join',
      userId: 88,
      body: { code: 'Y9CODE' },
    });

    expect(res.status).toBe(403);
    expect(res.json.error).toMatch(/group codes is disabled/i);
  });
});
