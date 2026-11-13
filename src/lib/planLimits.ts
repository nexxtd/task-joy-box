/**
 * Plan Features & Limits Source of Truth
 * 
 * Free / Premium / Pro tiers across Planora:
 * - Tags, Support, Admin Tickets
 * - Dashboard & Insights Widgets + Reports
 * - Projects, Collaborators, Columns, Chat Retention
 * - Tasks: Active count, Subtasks, Checklists, Templates, Media, Auto-delete
 * - Notes: Active count, Templates, Media, Auto-delete
 * - AI Assistant: Tier gating, daily limits, max chats, file attachments
 * - Settings: Colors, Alerts, Email Notifications, Weekly AI Summary, Custom Shortcuts
 */

export type PlanTier = 'free' | 'premium' | 'pro';

export function normalizePlanTier(tier?: string | null): PlanTier {
  const t = String(tier || 'free').toLowerCase();
  if (t === 'pro') return 'pro';
  if (t === 'premium') return 'premium';
  return 'free';
}

export function isProTier(tier?: string | null): boolean {
  return normalizePlanTier(tier) === 'pro';
}

export function isPremiumOrPro(tier?: string | null): boolean {
  const t = normalizePlanTier(tier);
  return t === 'premium' || t === 'pro';
}

export const PLAN_LIMITS = {
  // Tags
  tags: {
    free: 10,
    premium: 15,
    pro: 25,
  },

  // Support
  support: {
    free: 'Normal support',
    premium: 'Priority support',
    pro: 'Priority support',
  },

  // Dashboard & Insights Modules / Widgets
  widgets: {
    free: 8,
    premium: 14,
    pro: Infinity,
  },

  // Insights Export Reports
  insightsExport: {
    free: [] as ('csv' | 'pdf')[],
    premium: ['csv'] as ('csv' | 'pdf')[],
    pro: ['csv', 'pdf'] as ('csv' | 'pdf')[],
  },

  // Projects
  projects: {
    free: 5,
    premium: 15,
    pro: 20,
  },
  projectMembers: {
    free: 10,
    premium: 15,
    pro: 20,
  },
  projectColumns: {
    free: 10,
    premium: 15,
    pro: 20,
  },
  projectChatHistoryDays: {
    free: 30,
    premium: 365,
    pro: Infinity,
  },

  // Tasks
  activeTasks: {
    free: 25,
    premium: 100,
    pro: Infinity,
  },
  subtasksPerTask: {
    free: 20,
    premium: 40,
    pro: 60,
  },
  checklistItemsPerTask: {
    free: 20,
    premium: 40,
    pro: 60,
  },
  taskTemplates: {
    free: 5,
    premium: 15,
    pro: Infinity,
  },
  taskAutoDeleteDays: {
    free: 5,
    premium: 30,
    pro: Infinity, // never
  },
  taskMedia: {
    allowed: {
      free: false,
      premium: true,
      pro: true,
    },
    maxPerTask: {
      free: 0,
      premium: 15,
      pro: 25,
    },
    maxFileSizeBytes: {
      free: 0,
      premium: 10 * 1024 * 1024, // 10MB
      pro: 25 * 1024 * 1024,      // 25MB
    },
  },

  // Notes
  activeNotes: {
    free: 25,
    premium: 100,
    pro: Infinity,
  },
  noteTemplates: {
    free: 5,
    premium: 15,
    pro: Infinity,
  },
  noteAutoDeleteDays: {
    free: 5,
    premium: 30,
    pro: Infinity, // never
  },
  noteMedia: {
    allowed: {
      free: false,
      premium: true,
      pro: true,
    },
    maxPerNote: {
      free: 0,
      premium: 15,
      pro: 25,
    },
    maxFileSizeBytes: {
      free: 0,
      premium: 10 * 1024 * 1024, // 10MB
      pro: 25 * 1024 * 1024,      // 25MB
    },
  },

  // AI Assistant
  aiAssistant: {
    allowed: {
      free: false,
      premium: true,
      pro: true,
    },
    dailyMessages: {
      free: 0,
      premium: 20,
      pro: 100,
    },
    maxChats: {
      free: 0,
      premium: 10,
      pro: Infinity,
    },
    canMutateTasksNotes: {
      free: false,
      premium: true,
      pro: true,
    },
    attachmentsAllowed: {
      free: false,
      premium: false,
      pro: true,
    },
  },

  // Settings & Shortcuts
  customShortcuts: {
    free: 3,
    premium: 10,
    pro: Infinity,
  },
  shortcuts: {
    free: 3,
    premium: 10,
    pro: Infinity,
  },
  aiChats: {
    free: 0,
    premium: 10,
    pro: Infinity,
  },
  aiDailyMessages: {
    free: 0,
    premium: 20,
    pro: 100,
  },
  appearance: {
    fullColorsAllowed: {
      free: false,
      premium: true,
      pro: true,
    },
  },
  notifications: {
    normalAlerts: { free: true, premium: true, pro: true },
    smartAlerts: { free: false, premium: true, pro: true },
    emailNotifications: { free: false, premium: true, pro: true },
    weeklyAiSummary: { free: false, premium: false, pro: true },
  },
  energyTracker: {
    allowed: {
      free: false,
      premium: true,
      pro: true,
    },
  },
} as const;

/**
 * Handle limit button behavior:
 * If limit is reached:
 * - Free / Premium users: button changes text to "Limit reached", clicking goes to /pricing
 * - Pro users: button changes text to "Limit reached", disabled, no link to pricing
 */
export function getLimitButtonProps({
  isLimitReached,
  tier,
  defaultText,
  defaultLabel,
  limitText = 'Limit reached',
  onAction,
  navigate,
  onNavigatePricing,
}: {
  isLimitReached: boolean;
  tier?: string | null;
  defaultText?: string;
  defaultLabel?: string;
  limitText?: string;
  onAction?: () => void;
  navigate?: (path: string) => void;
  onNavigatePricing?: () => void;
}) {
  const norm = normalizePlanTier(tier);
  const isPro = norm === 'pro';
  const label = defaultLabel || defaultText || '';

  if (!isLimitReached) {
    return {
      text: label,
      label,
      disabled: false,
      isLimitReached: false,
      onClick: onAction,
      className: '',
      title: undefined as string | undefined,
    };
  }

  // Limit reached
  if (isPro) {
    return {
      text: limitText,
      label: limitText,
      disabled: true,
      isLimitReached: true,
      onClick: (e?: any) => {
        if (e?.preventDefault) e.preventDefault();
        if (e?.stopPropagation) e.stopPropagation();
      },
      className: 'opacity-70 cursor-not-allowed border-amber-500/30 text-amber-600 dark:text-amber-400',
      title: 'Limit reached',
    };
  }

  return {
    text: limitText,
    label: limitText,
    disabled: false,
    isLimitReached: true,
    onClick: (e?: any) => {
      if (e?.preventDefault) e.preventDefault();
      if (e?.stopPropagation) e.stopPropagation();
      if (onNavigatePricing) onNavigatePricing();
      else if (navigate) navigate('/pricing');
      else window.location.href = '/pricing';
    },
    className: 'border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 transition-colors',
    title: 'Limit reached — click to upgrade',
  };
}
