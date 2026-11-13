import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  UNLIMITED_PAUSE_MARKER,
  computePersonalVsOrgReconciliation,
} from './orgReconciliation';

describe('computePersonalVsOrgReconciliation (Rules 8 & 9)', () => {
  const nowMs = Date.UTC(2026, 4, 15, 12, 0, 0);

  it('grants Free users the highest active organization tier', () => {
    const result = computePersonalVsOrgReconciliation({
      ownTier: 'free',
      ownStatus: 'inactive',
      ownEndsAt: null,
      pausedTier: null,
      pausedStatus: null,
      pausedRemainingMs: null,
      orgMemberships: [
        { orgId: 1, orgName: 'Sci Dept', tier: 'premium', status: 'active' },
        { orgId: 2, orgName: 'Smith Family', tier: 'pro', status: 'active' },
        { orgId: 3, orgName: 'Cancelled Org', tier: 'pro', status: 'cancelled' },
      ],
      nowMs,
    });

    expect(result.effectiveTier).toBe('pro');
    expect(result.source).toBe('organization');
    expect(result.bestOrgId).toBe(2);
    expect(result.personalPlanPaused).toBe(false);
    expect(result.action).toBe('none');
  });

  it('pauses a personal plan when an active org grants >= personal tier', () => {
    const endsAt = new Date(nowMs + 12 * DAY_MS).toISOString();
    const result = computePersonalVsOrgReconciliation({
      ownTier: 'premium',
      ownStatus: 'active',
      ownEndsAt: endsAt,
      pausedTier: null,
      pausedStatus: null,
      pausedRemainingMs: null,
      orgMemberships: [{ orgId: 5, orgName: 'Work', tier: 'pro', status: 'active' }],
      nowMs,
    });

    expect(result.effectiveTier).toBe('pro');
    expect(result.source).toBe('organization');
    expect(result.personalPlanPaused).toBe(true);
    expect(result.pausedPersonalTier).toBe('premium');
    expect(result.newRemainingMs).toBe(12 * DAY_MS);
    expect(result.action).toBe('pause_personal');
  });

  it('keeps personal Pro active and holds lower org tier in reserve', () => {
    const result = computePersonalVsOrgReconciliation({
      ownTier: 'pro',
      ownStatus: 'active',
      ownEndsAt: new Date(nowMs + 5 * DAY_MS).toISOString(),
      pausedTier: null,
      pausedStatus: null,
      pausedRemainingMs: null,
      orgMemberships: [{ orgId: 7, orgName: 'Club', tier: 'premium', status: 'active' }],
      nowMs,
    });

    expect(result.effectiveTier).toBe('pro');
    expect(result.source).toBe('personal');
    expect(result.personalPlanPaused).toBe(false);
    expect(result.reservedOrgTier).toBe('premium');
    expect(result.action).toBe('none');
  });

  it('resumes a paused personal plan with preserved remaining time when org coverage ends', () => {
    const remaining = 9 * DAY_MS;
    const result = computePersonalVsOrgReconciliation({
      ownTier: 'free',
      ownStatus: 'paused',
      ownEndsAt: null,
      pausedTier: 'premium',
      pausedStatus: 'active',
      pausedRemainingMs: String(remaining),
      orgMemberships: [{ orgId: 5, orgName: 'Work', tier: 'pro', status: 'inactive' }],
      nowMs,
    });

    expect(result.effectiveTier).toBe('premium');
    expect(result.source).toBe('personal');
    expect(result.personalPlanPaused).toBe(false);
    expect(result.action).toBe('resume_personal');
    expect(result.newEndsAt).toBe(new Date(nowMs + remaining).toISOString());
  });

  it('resumes unlimited paused personal plans cleanly without an end timestamp', () => {
    const result = computePersonalVsOrgReconciliation({
      ownTier: 'free',
      ownStatus: 'paused',
      ownEndsAt: null,
      pausedTier: 'pro',
      pausedStatus: 'active',
      pausedRemainingMs: UNLIMITED_PAUSE_MARKER,
      orgMemberships: [],
      nowMs,
    });

    expect(result.effectiveTier).toBe('pro');
    expect(result.action).toBe('resume_personal');
    expect(result.newEndsAt).toBeNull();
  });

  it('expires an overdue personal plan when no active organization covers it', () => {
    const result = computePersonalVsOrgReconciliation({
      ownTier: 'pro',
      ownStatus: 'active',
      ownEndsAt: new Date(nowMs - DAY_MS).toISOString(),
      pausedTier: null,
      pausedStatus: null,
      pausedRemainingMs: null,
      orgMemberships: [],
      nowMs,
    });

    expect(result.effectiveTier).toBe('free');
    expect(result.effectiveStatus).toBe('inactive');
    expect(result.source).toBe('free');
    expect(result.action).toBe('expire_personal');
  });
});

