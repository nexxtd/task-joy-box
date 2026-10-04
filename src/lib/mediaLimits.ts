export type PlanTier = 'free' | 'premium' | 'pro' | string;

export function normalizeTier(tier?: string | null): 'free' | 'premium' | 'pro' {
  const t = (tier || 'free').toLowerCase();
  if (t === 'pro') return 'pro';
  if (t === 'premium') return 'premium';
  return 'free';
}

export function getMediaLimit(tier?: string | null): number {
  const n = normalizeTier(tier);
  if (n === 'pro') return 20;
  if (n === 'premium') return 10;
  return 5;
}

export function isMaxPlan(tier?: string | null): boolean {
  return normalizeTier(tier) === 'pro';
}

export function limitMessage(tier: string | null | undefined, limit: number): string {
  if (isMaxPlan(tier)) return `Limit reached (${limit} max)`;
  return 'Limit reached — upgrade for more';
}
