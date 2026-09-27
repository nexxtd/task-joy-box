export const TIER_RANK: Record<string, number> = { free: 0, premium: 1, pro: 2 };

export function tierRank(tier?: string | null): number {
  return TIER_RANK[String(tier || 'free').toLowerCase()] ?? 0;
}
