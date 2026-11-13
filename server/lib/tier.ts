export const TIER_RANK: Record<string, number> = { free: 0, premium: 1, pro: 2 };

export function tierRank(tier?: string | null): number {
  return TIER_RANK[String(tier || 'free').toLowerCase()] ?? 0;
}

export type PlanTier = 'free' | 'premium' | 'pro';

export function normalizeTier(tier?: string | null): PlanTier {
  const t = String(tier || 'free').toLowerCase();
  if (t === 'pro') return 'pro';
  if (t === 'premium') return 'premium';
  return 'free';
}

export const SERVER_PLAN_LIMITS = {
  tags: { free: 10, premium: 15, pro: 25 },
  projects: { free: 5, premium: 15, pro: 20 },
  projectMembers: { free: 10, premium: 15, pro: 20 },
  projectColumns: { free: 10, premium: 15, pro: 20 },
  projectChatHistoryDays: { free: 30, premium: 365, pro: Infinity },
  activeTasks: { free: 25, premium: 100, pro: Infinity },
  subtasksPerTask: { free: 20, premium: 40, pro: 60 },
  checklistItemsPerTask: { free: 20, premium: 40, pro: 60 },
  taskTemplates: { free: 5, premium: 15, pro: Infinity },
  taskAutoDeleteDays: { free: 5, premium: 30, pro: Infinity },
  taskMedia: {
    maxPerTask: { free: 0, premium: 15, pro: 25 },
    maxFileSizeBytes: { free: 0, premium: 10 * 1024 * 1024, pro: 25 * 1024 * 1024 },
  },
  activeNotes: { free: 25, premium: 100, pro: Infinity },
  noteTemplates: { free: 5, premium: 15, pro: Infinity },
  noteAutoDeleteDays: { free: 5, premium: 30, pro: Infinity },
  noteMedia: {
    maxPerNote: { free: 0, premium: 15, pro: 25 },
    maxFileSizeBytes: { free: 0, premium: 10 * 1024 * 1024, pro: 25 * 1024 * 1024 },
  },
  aiAssistant: {
    dailyMessages: { free: 0, premium: 20, pro: 100 },
    maxChats: { free: 0, premium: 10, pro: Infinity },
  },
  customShortcuts: { free: 3, premium: 10, pro: Infinity },
};
