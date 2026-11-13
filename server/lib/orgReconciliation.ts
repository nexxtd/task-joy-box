import { PlanTier, normalizeTier, tierRank } from './tier.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const ARCHIVE_RETENTION_DAYS = 30;
export const ARCHIVE_WARNING_DAYS_ELAPSED = 20; // 30 - 20 = 10 days before deletion
export const UNLIMITED_PAUSE_MARKER = -1;

export interface OrgMembershipPlanInfo {
  orgId: number;
  orgName: string;
  tier: string | null | undefined;
  status: string | null | undefined;
}

export interface PersonalVsOrgReconciliationInput {
  ownTier: string | null | undefined;
  ownStatus: string | null | undefined;
  ownEndsAt: string | null | undefined;
  pausedTier: string | null | undefined;
  pausedStatus: string | null | undefined;
  pausedRemainingMs: string | number | null | undefined;
  orgMemberships: OrgMembershipPlanInfo[];
  nowMs?: number;
}

export interface PersonalVsOrgReconciliationResult {
  effectiveTier: PlanTier;
  effectiveStatus: 'active' | 'inactive' | 'paused' | 'trialing';
  source: 'personal' | 'organization' | 'free';
  personalTier: PlanTier;
  personalStatus: string;
  personalPlanPaused: boolean;
  pausedPersonalTier: PlanTier | null;
  pausedPersonalRemainingMs: number | null;
  bestOrgTier: PlanTier;
  bestOrgId: number | null;
  bestOrgName: string | null;
  reservedOrgTier: PlanTier | null;
  action: 'none' | 'pause_personal' | 'resume_personal' | 'expire_personal';
  newRemainingMs?: number | null;
  newEndsAt?: string | null;
}

/**
 * Pure state reconciliation for Rules 8 & 9:
 * - Best plan across all active organizations wins.
 * - If an organization grants >= your personal paid tier, your personal paid plan pauses.
 * - If your personal paid plan > best org tier, your personal plan runs and org tier waits in reserve.
 */
export function computePersonalVsOrgReconciliation(
  input: PersonalVsOrgReconciliationInput
): PersonalVsOrgReconciliationResult {
  const nowMs = input.nowMs ?? Date.now();
  const rawOwnStatus = String(input.ownStatus || 'inactive').toLowerCase();
  const isPaused = rawOwnStatus === 'paused';

  let personalTier: PlanTier = 'free';
  let personalRemainingMs: number | null = null;
  let ownExpired = false;

  if (isPaused && input.pausedTier) {
    const candidate = normalizeTier(input.pausedTier);
    const rem = input.pausedRemainingMs != null ? Number(input.pausedRemainingMs) : UNLIMITED_PAUSE_MARKER;
    if (candidate !== 'free' && (rem === UNLIMITED_PAUSE_MARKER || (Number.isFinite(rem) && rem > 0))) {
      personalTier = candidate;
      personalRemainingMs = rem === UNLIMITED_PAUSE_MARKER ? UNLIMITED_PAUSE_MARKER : Math.max(0, rem);
    } else {
      ownExpired = true;
    }
  } else {
    const candidate = normalizeTier(input.ownTier);
    const active = rawOwnStatus === 'active' || rawOwnStatus === 'trialing';
    if (candidate !== 'free' && active) {
      if (input.ownEndsAt) {
        const endsMs = new Date(input.ownEndsAt).getTime();
        if (Number.isFinite(endsMs) && endsMs <= nowMs) {
          ownExpired = true;
        } else {
          personalTier = candidate;
          personalRemainingMs = Number.isFinite(endsMs) ? Math.max(1000, endsMs - nowMs) : UNLIMITED_PAUSE_MARKER;
        }
      } else {
        personalTier = candidate;
        personalRemainingMs = UNLIMITED_PAUSE_MARKER;
      }
    }
  }

  let bestOrgTier: PlanTier = 'free';
  let bestOrgId: number | null = null;
  let bestOrgName: string | null = null;
  for (const m of input.orgMemberships || []) {
    const status = String(m.status || '').toLowerCase();
    if (!['active', 'trialing'].includes(status)) continue;
    const t = normalizeTier(m.tier);
    if (tierRank(t) > tierRank(bestOrgTier)) {
      bestOrgTier = t;
      bestOrgId = m.orgId;
      bestOrgName = m.orgName;
    }
  }

  if (personalTier === 'free') {
    const effectiveTier = bestOrgTier;
    const effectiveStatus: 'active' | 'inactive' | 'paused' | 'trialing' =
      bestOrgTier !== 'free'
        ? 'active'
        : rawOwnStatus === 'trialing' && !ownExpired
        ? 'trialing'
        : 'inactive';
    return {
      effectiveTier,
      effectiveStatus,
      source: bestOrgTier !== 'free' ? 'organization' : 'free',
      personalTier: 'free',
      personalStatus: ownExpired ? 'inactive' : rawOwnStatus,
      personalPlanPaused: false,
      pausedPersonalTier: null,
      pausedPersonalRemainingMs: null,
      bestOrgTier,
      bestOrgId,
      bestOrgName,
      reservedOrgTier: null,
      action: isPaused || ownExpired ? 'expire_personal' : 'none',
    };
  }

  // Personal paid plan is valid (active or paused)
  if (tierRank(bestOrgTier) >= tierRank(personalTier)) {
    return {
      effectiveTier: bestOrgTier,
      effectiveStatus: 'active',
      source: 'organization',
      personalTier,
      personalStatus: 'paused',
      personalPlanPaused: true,
      pausedPersonalTier: personalTier,
      pausedPersonalRemainingMs: personalRemainingMs,
      bestOrgTier,
      bestOrgId,
      bestOrgName,
      reservedOrgTier: null,
      action: isPaused ? 'none' : 'pause_personal',
      newRemainingMs: personalRemainingMs,
    };
  }

  // Personal plan is higher than any org plan: run personal, hold org plan in reserve
  const resumedEndsAt =
    personalRemainingMs === null || personalRemainingMs === UNLIMITED_PAUSE_MARKER
      ? null
      : new Date(nowMs + personalRemainingMs).toISOString();

  return {
    effectiveTier: personalTier,
    effectiveStatus: (rawOwnStatus === 'trialing' || input.pausedStatus === 'trialing') ? 'trialing' : 'active',
    source: 'personal',
    personalTier,
    personalStatus: (rawOwnStatus === 'trialing' || input.pausedStatus === 'trialing') ? 'trialing' : 'active',
    personalPlanPaused: false,
    pausedPersonalTier: null,
    pausedPersonalRemainingMs: null,
    bestOrgTier,
    bestOrgId,
    bestOrgName,
    reservedOrgTier: bestOrgTier !== 'free' ? bestOrgTier : null,
    action: isPaused ? 'resume_personal' : 'none',
    newEndsAt: resumedEndsAt,
  };
}

