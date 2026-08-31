import React, { useState, useEffect, useRef } from 'react';
import { useAdminPreview } from '@/hooks/useAdminPreview';
import {
  ShieldCheck, DollarSign, Users, CreditCard, Ticket, TrendingUp, Calendar,
  Trash2, Plus, Activity, X, Target, CheckSquare, BarChart3,
  MessageSquare, ChevronDown, ChevronUp, ChevronRight, Send, Loader2, BookOpen,
  Zap, User, LayoutDashboard, Sparkles, Tag, Gift, Star, Heart, Rocket, Crown,
  Trophy, Package, Save, Globe, Eye, Settings,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import TicketConversation from '@/components/TicketConversation';
import UserDetailView from '@/components/UserDetailView';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

interface AdminStats {
  summary: {
    totalUsers: number;
    totalEarnings: number;
    activeSubscriptions: number;
    totalCouponsUsed: number;
    revenueThisMonth: number;
    newUsersThisWeek: number;
    newUsersThisMonth: number;
    activeUsers7d: number;
    openTickets: number;
    totalTickets: number;
    unreadMessages: number;
    couponsCreated: number;
  };
  recentTransactions: any[];
  recentRegistrations: any[];
  topCoupons: any[];
}

interface Coupon {
  id: number;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  maxUses: number | null;
  usedCount: number;
  restrictedToEmail: string | null;
  restrictedToPlan: string | null;
  startDate: string | null;
  expiresAt: string | null;
  oneTimePerUser: boolean;
  active: boolean;
  sortOrder: number;
  groupId: number | null;
  createdAt: string;
}

interface CouponGroup {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  tier: string;
  status: string;
  location: string | null;
  language: string;
  createdAt: string;
  lastActiveAt: string | null;
  avatarUrl: string | null;
}

type LayoutItem =
  | { kind: 'group'; group: CouponGroup; coupons: Coupon[] }
  | { kind: 'coupon'; coupon: Coupon };

interface SystemSetting {
  key: string;
  label: string;
  description: string;
  type: 'boolean' | 'select' | 'currency' | 'number' | 'text';
  options?: { value: string; label: string }[];
  defaultValue: string;
  suffix?: string;
}

interface SystemSettingGroup {
  id: string;
  label: string;
  description: string;
  icon: any;
  rows: SystemSetting[];
}

const SETTINGS_GROUPS: SystemSettingGroup[] = [
  {
    id: 'platform-access',
    label: 'Platform Access',
    description: 'Controls who can reach the app and create new accounts.',
    icon: ShieldCheck,
    rows: [
      { key: 'maintenance_mode', label: 'Maintenance mode', description: 'Show a maintenance notice to all non-admin users across the app.', type: 'boolean', defaultValue: 'false' },
      { key: 'signup_open', label: 'Registrations open', description: 'Allow new users to create accounts.', type: 'boolean', defaultValue: 'true' },
    ],
  },
  {
    id: 'pricing',
    label: 'Pricing',
    description: 'Monthly prices shown on the pricing page.',
    icon: DollarSign,
    rows: [
      { key: 'price_pro_monthly', label: 'Pro plan price', description: 'Monthly price shown on the pricing page for the Pro plan.', type: 'currency', defaultValue: '9.99', suffix: '$/mo' },
      { key: 'price_premium_monthly', label: 'Premium plan price', description: 'Monthly price shown on the pricing page for the Premium plan.', type: 'currency', defaultValue: '14.99', suffix: '$/mo' },
    ],
  },
  {
    id: 'usage-limits',
    label: 'Usage Limits',
    description: 'Per-plan caps enforced by the server when creating content.',
    icon: Package,
    rows: [
      { key: 'free_tier_task_limit', label: 'Free task limit', description: 'Maximum tasks a Free user can have on their board.', type: 'number', defaultValue: '40' },
      { key: 'free_tier_goal_limit', label: 'Free goal limit', description: 'Maximum goals a Free user can create.', type: 'number', defaultValue: '5' },
      { key: 'free_tier_habit_limit', label: 'Free habit limit', description: 'Maximum habits a Free user can create.', type: 'number', defaultValue: '4' },
      { key: 'max_attachment_mb', label: 'Attachment size limit', description: 'Maximum upload size for task attachments.', type: 'number', defaultValue: '25', suffix: 'MB' },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Banners and announcements shown to all users.',
    icon: MessageSquare,
    rows: [
      { key: 'announcement_banner', label: 'Announcement banner', description: 'Show a dismissible announcement banner to all users.', type: 'boolean', defaultValue: 'false' },
      { key: 'announcement_banner_message', label: 'Announcement message', description: 'The text shown in the announcement banner.', type: 'text', defaultValue: '' },
    ],
  },
  {
    id: 'support',
    label: 'Support',
    description: 'Defaults used by the support and ticket system.',
    icon: Ticket,
    rows: [
      { key: 'support_auto_response_time', label: 'Auto-response time', description: 'Target time within which support replies to a new ticket.', type: 'number', defaultValue: '24', suffix: 'hours' },
    ],
  },
];

const GROUP_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#6b7280'];
const GROUP_ICONS: Record<string, any> = {
  tag: Tag, gift: Gift, star: Star, heart: Heart, rocket: Rocket, zap: Zap,
  crown: Crown, sparkles: Sparkles, trophy: Trophy, package: Package,
};

const GUIDE_CATS: { id: string; label: string; guides: { id: string; title: string; sections: { heading: string; body: string }[] }[] }[] = [
  {
    id: 'handling-tickets', label: 'Handling Tickets',
    guides: [
      { id: 'ht-overview', title: 'Overview', sections: [
        { heading: 'First principles', body: 'When a user submits a ticket, respond within 24 hours. Always acknowledge their issue first before diving into troubleshooting.\n\nKey principles:\n- Be empathetic and professional\n- Ask clarifying questions early\n- Set clear expectations about resolution time\n- Document everything in the ticket\n- Never blame the user or assume prior knowledge' },
        { heading: 'Ticket lifecycle', body: 'Every ticket moves through the same pipeline: Received → Acknowledged → Investigated → Resolved → Closed.\n\nAn acknowledgement is a simple human message ("We received your report and we are looking into it"). An investigation is a status update, even if nothing is fixed yet. Never close a ticket without the user confirming the fix worked - unless they stop replying for 7 days.\n\nKeep the ticket status updated in real time. It is the user\'s only window into your work.' },
      ]},
      { id: 'ht-response-time', title: 'Response Time', sections: [
        { heading: 'Targets', body: 'Target response times:\n\n• Urgent (app down): 2 hours\n• High (feature broken): 4 hours\n• Medium (workaround exists): 24 hours\n• Low (enhancement): 48 hours\n\nAlways update the ticket status if you need more time. Users appreciate transparency.' },
        { heading: 'Managing delays', body: 'If a reply will exceed the target, send a short holding message: "I am still on this - here is what I have done so far, and when you will hear from me next."\n\nBatch small updates when possible, but never go silent on a ticket that is being actively worked. Silence is what converts a support request into a complaint.' },
      ]},
      { id: 'ht-escalation', title: 'Escalation Process', sections: [
        { heading: 'When to escalate', body: 'Escalate to engineering when:\n\n1. You cannot reproduce the issue\n2. The bug is in core functionality\n3. Data loss is involved\n4. A security vulnerability is reported\n\nInclude the ticket ID, steps to reproduce, your findings so far, and the affected account.' },
        { heading: 'Escalation workflow', body: '1. Tag the ticket as in_progress and note the escalation in a message to the user ("our team is taking a closer look").\n2. Inform the on-call engineer with a short summary.\n3. Check back after 24 hours - escalation only works if someone follows up.\n4. When engineering responds, relay findings to the user in plain language, never in internal jargon.' },
      ]},
      { id: 'ht-priorities', title: 'Ticket Priorities', sections: [
        { heading: 'Priority levels', body: 'Priority levels:\n\n🔴 Urgent: App unusable, data loss, security issue, payments broken\n🟠 High: Key feature broken, no workaround\n🟡 Medium: Feature impaired but workaround exists\n🟢 Low: Enhancement, cosmetic issue, question\n\nAlways match the user\'s perceived severity with the appropriate priority. Dismissing a user\'s sense of urgency is the fastest way to earn a bad review.' },
        { heading: 'Prioritizing workload', body: 'Work in this order: security issues first, then data loss, then payment/billing, then functional breakage, then everything else.\n\nIf several high-priority tickets arrive at once, tell lower-priority requesters you are working through a queue. Two messages cost nothing; radio silence costs a customer.' },
      ]},
    ],
  },
  {
    id: 'bug-reports', label: 'Bug Reports',
    guides: [
      { id: 'br-triage', title: 'Triage Steps', sections: [
        { heading: 'Triage workflow', body: 'Bug report triage steps:\n\n1. Read the full ticket carefully\n2. Check if it is a known issue (search bug tracker)\n3. Try to reproduce the bug yourself\n4. Note browser, OS, and device info\n5. Assign priority level\n6. Tag the relevant team\n\nDo all of this before replying, so the first reply is meaningful.' },
        { heading: 'Known issues', body: 'If the bug is already tracked: acknowledge the duplicate politely and link the resolution progress ("we are rolling out a fix this week").\n\nNever mark a duplicate as "already reported" without showing the user you care - they took time to write it up.' },
      ]},
      { id: 'br-reproduce', title: 'Reproducing Issues', sections: [
        { heading: 'Reproduction steps', body: 'To reproduce a bug:\n\n1. Ask for specific steps if not provided\n2. Test on the same browser/OS if possible\n3. Check if it happens with different accounts\n4. Try clearing cache/cookies\n5. Test in incognito mode\n6. Document exact steps that trigger the bug\n\nSave a copy of the console errors if you can see them.' },
        { heading: 'When you cannot reproduce', body: 'Ask for: a screen recording, the exact error text, and what changed before the bug started.\n\nSet expectations: "we could not reproduce it yet, but we are digging. Could you send a quick video?" Most users are happy to help when asked kindly.' },
      ]},
      { id: 'br-communication', title: 'User Communication', sections: [
        { heading: 'Tone', body: 'When communicating about bugs:\n\n• Thank the user for reporting\n• Explain what you are doing to investigate\n• Give a timeline if possible\n• Do not promise a fix date unless confirmed\n• Update them when there is progress\n• Close with next steps\n\nUse plain words. Technical jargon means nothing to a user; consequences mean everything.' },
        { heading: 'Progress updates', body: 'Send a progress update at least every 2 days while a bug is under investigation, even if it is "no news yet".\n\nWhen fixed: tell them what was wrong, what you changed, and invite them to verify. Users who are told the fix and asked to confirm feel like collaborators, not customers.' },
      ]},
      { id: 'br-documentation', title: 'Documenting Bugs', sections: [
        { heading: 'What to record', body: 'Every confirmed bug deserves a small entry: repro steps, environment, first affected version, impact, and who is assigned.\n\nThis turns support knowledge into a company asset. Future tickets matching the entry are resolved in minutes, not days.' },
        { heading: 'Reusing knowledge', body: 'Keep a "known issues" list visible to the whole support team. Before replying to a bug ticket, search it first.\n\nWhen a workaround exists, standardize it so everyone recommends the same fix and the same wording.' },
      ]},
    ],
  },
  {
    id: 'account-issues', label: 'Account Issues',
    guides: [
      { id: 'ai-verification', title: 'Identity Verification', sections: [
        { heading: 'Verification checklist', body: 'Before making account changes:\n\n1. Verify user identity via the email on their account\n2. Ask for recent activity details you can check (last login, plan, recent transactions)\n3. Check account creation date\n4. Never share one user\'s data with another\n5. If in doubt, ask them to confirm from the account email\n\nNever accept screenshots of credit cards as proof of identity.' },
        { heading: 'Common requests', body: 'Email changes, password resets, plan switches and data exports all require verification.\n\nFor password resets, always use the in-app reset flow with a link - never set passwords manually unless the user cannot receive email.' },
      ]},
      { id: 'ai-subscription', title: 'Subscription Issues', sections: [
        { heading: 'Recurring scenarios', body: 'Common subscription issues:\n\n• Cancelled but still charged → Check the billing cycle and proration\n• Cannot upgrade → Clear cache, try another browser, check payment provider errors\n• Missing features → Verify tier after refresh\n• Proration questions → Explain billing logic\n\nAlways confirm what the user actually purchased before promising anything.' },
        { heading: 'Entitlement flows', body: 'When a user has paid but the app still shows Free: wait 60 seconds and refresh. If it persists, verify the payment status on the provider dashboard, then confirm the webhook was delivered.\n\nIf you manually grant a tier, immediately tell the user so they can verify it looks right.' },
      ]},
      { id: 'ai-billing', title: 'Billing Problems', sections: [
        { heading: 'Resolution path', body: 'Billing problem resolution:\n\n1. Check payment history on the provider dashboard\n2. Verify the charge amount and date\n3. Look for failed payment retries\n4. Check if coupons were applied\n5. Escalate to finance if needed\n\nAlways provide the transaction ID to the user so they can match it on their statement.' },
        { heading: 'Failed payments', body: 'Failed payments are not the user\'s fault to fix alone. Offer the direct update-card link and explain what failed (expired card, insufficient funds, provider block).\n\nIf a charge failed but the user believes they paid, verify both sides before giving any refund - banks often show pending charges for days.' },
      ]},
      { id: 'ai-data-request', title: 'Data & Privacy Requests', sections: [
        { heading: 'Legal requests', body: 'Data requests (GDPR/CCPA):\n\n• Data export: process within 30 days\n• Account deletion: confirm with the user first, and list what gets lost (boards, notes, history)\n• Data correction: verify and update\n• Portable export: provide a clear, documented format (JSON)\n\nLog all requests in the compliance tracker.' },
        { heading: 'Account deletion', body: 'Never delete on first message. Confirm: "This permanently removes all your data. Are you sure?"\n\nOffer the pause or downgrade alternative first - most "deletions" are actually users wanting to stop paying. If they confirm twice, delete fully and send a confirmation.' },
      ]},
      { id: 'ai-security', title: 'Security Incidents', sections: [
        { heading: 'First response', body: 'If a user reports suspicious activity (unknown logins, strange emails):\n\n1. Take it seriously - never dismiss\n2. Guide them to reset their password immediately\n3. Check login history for anomalies\n4. Review recent changes to their account\n5. Note the incident for review\n\nAdvise them to use a password manager and unique passwords.' },
        { heading: 'Handling reported vulnerabilities', body: 'Security reports go straight to engineering, always.\n\nThank the reporter, capture all details (endpoint, payload, screenshots), and never discuss the fix timeline publicly. For accepted reports, offer credit in the public acknowledgements - it encourages more good reports.' },
      ]},
    ],
  },
  {
    id: 'feature-requests', label: 'Feature Requests',
    guides: [
      { id: 'fr-evaluation', title: 'Evaluating Requests', sections: [
        { heading: 'Evaluation checklist', body: 'When evaluating feature requests:\n\n1. Check if it is already planned\n2. Assess the number of users who want it\n3. Consider implementation complexity\n4. Look at competitor offerings\n5. Tag the product team for review\n\nOne user asking loudly is not a trend; three users asking independently is.' },
        { heading: 'Answering users', body: 'Every feature request deserves a real answer: "Planned for Q3", "We are exploring this", or "Not on the roadmap - here is why".\n\nExplain the reasoning briefly and offer the closest alternative that exists today.' },
      ]},
      { id: 'fr-roadmap', title: 'Roadmap Communication', sections: [
        { heading: 'Safe communication', body: 'Communicating roadmap:\n\n• Never share specific dates unless confirmed by product\n• Mention if it is planned, exploring, or not planned\n• Offer workarounds when available\n• Thank them for the suggestion\n• Add them to the update list if appropriate\n\nA roadmap that slips quietly is worse than not promising at all.' },
        { heading: 'Update list', body: 'Keep a short "voters" list per roadmap item. When an item ships, message the voters inviting them to try it.\n\nThis is the single highest-ROI support habit: users who requested a feature and see it ship feel ownership.' },
      ]},
      { id: 'fr-feedback', title: 'Collecting Feedback', sections: [
        { heading: 'Getting usable input', body: 'Collecting quality feedback:\n\n• Ask "what problem does this solve?"\n• Get specific use cases, not adjectives\n• Understand their current workflow\n• Check if it aligns with product vision\n• Pass the raw feedback, not your summary, to product\n\n"Make it better" is noise. "I lose my place every time the list reorders" is a spec.' },
        { heading: 'Closing the loop', body: 'After a request is declined or deferred, tell the user within a week so they are not left hanging.\n\nFor deferred requests, note when it may be reconsidered. Transparency builds more trust than vague positivity.' },
      ]},
    ],
  },
  {
    id: 'refund-policy', label: 'Refund Policy',
    guides: [
      { id: 'rp-eligibility', title: 'Eligibility Criteria', sections: [
        { heading: 'Eligibility', body: 'Refund eligibility:\n\n• Within 14 days of purchase: full refund\n• Annual plan (first 30 days): full refund\n• Annual plan (after 30 days): prorated\n• Monthly plan: refund for the current month\n• Violation of terms of service: no refund\n\nGrace exceptions (double charges, provider errors) always get refunded in full.' },
      ]},
      { id: 'rp-process', title: 'Processing Refunds', sections: [
        { heading: 'Steps', body: 'Processing a refund:\n\n1. Verify eligibility criteria\n2. Process via the payment provider dashboard\n3. Send a confirmation email with the amount and timing\n4. Update the ticket status\n5. Note the refund in the ticket\n6. Follow up in 3-5 business days if not visible on their statement\n\nBank processing can take up to 10 days - set expectations so users are not surprised.' },
      ]},
      { id: 'rp-disputes', title: 'Handling Disputes', sections: [
        { heading: 'De-escalation', body: 'Handling refund disputes:\n\n• Listen to the user\'s concern fully first\n• Review the case objectively against policy\n• Offer alternatives (credit, downgrade, trial extension)\n• Escalate to management if the user requests it\n• Document the resolution\n• Update policies if the case exposes a gap\n\nA refund costs money; a dispute costs money plus chargeback fees plus reputation. De-escalate early.' },
      ]},
    ],
  },
  {
    id: 'sla-metrics', label: 'SLA & Quality',
    guides: [
      { id: 'sm-targets', title: 'Team Targets', sections: [
        { heading: 'Core metrics', body: 'Track each week:\n\n• First response time (target: under 24h, stretch 12h)\n• Resolution time (target: under 4 days)\n• Customer satisfaction per ticket\n• Reopen rate (target: under 8%)\n• Backlog of open tickets\n\nPick two to improve per sprint - teams that track everything improve nothing.' },
      ]},
      { id: 'sm-tracking', title: 'Tracking Issues', sections: [
        { heading: 'Tools', body: 'Mark every metric in this dashboard:\n\n• Use ticket statuses as the source of truth\n• Tag delays with a reason so patterns emerge (waiting on user, waiting on engineering)\n• Review weekly, celebrate wins with the team\n\nIf a metric is red for two weeks straight, stop and fix the process, not the number.' },
      ]},
      { id: 'sm-improvement', title: 'Continuous Improvement', sections: [
        { heading: 'Rituals', body: 'Improve by ritual:\n\n• Monthly: review the 5 most painful tickets\n• Monthly: update template messages from what you learned\n• Every quarter: re-check SLA targets against reality\n• After every incident: one-paragraph postmortem\n\nQuality is compounding: fixing the root cause of one recurring ticket saves fifty future tickets.' },
      ]},
    ],
  },
];

const AUTO_MSG_CATS: { id: string; label: string; messages: { id: string; title: string; when: string; purpose: string }[] }[] = [
  {
    id: 'acknowledgement', label: 'Acknowledgement',
    messages: [
      { id: 'ack-welcome', title: 'Welcome Message', when: 'The first ticket a new user ever opens', purpose: 'Greets the user, sets the response-time expectation, and lowers anxiety on their very first contact.' },
      { id: 'ack-received', title: 'Ticket Received', when: 'Any ticket, immediately after submission', purpose: 'Confirms the report arrived, names its type, and tells them when to expect a real answer.' },
      { id: 'ack-preferred-contact', title: 'Preferred Contact', when: 'The user mentions email problems or slow delivery', purpose: 'Asks how they would prefer to be reached and keeps the support channel open.' },
      { id: 'ack-followup', title: 'Follow Up', when: '48 hours after a suggestion or guide was sent', purpose: 'Checks whether the proposed solution worked, keeping the ticket warm instead of assuming.' },
    ],
  },
  {
    id: 'investigation', label: 'Investigation',
    messages: [
      { id: 'inv-more-info', title: 'Need More Info', when: 'The report lacks steps, screenshots or environment details', purpose: 'Requests exactly what is needed to reproduce, with concrete examples so the user knows the expected format.' },
      { id: 'inv-need-info-2', title: 'Second Info Request', when: 'No reply to the first request within 3 days', purpose: 'Politely nudges for the missing details, restating what is still needed without sounding annoyed.' },
      { id: 'inv-status', title: 'Status Update', when: '24 hours without new information while the case is active', purpose: 'Keeps the user informed that work continues, preventing "have I been forgotten?" feelings.' },
      { id: 'inv-status-delay', title: 'Delay Notice', when: 'Investigation will exceed its expected timeline', purpose: 'States the reason, the new expected time, and the concrete next checkpoint - transparency protects trust.' },
      { id: 'inv-escalated', title: 'Escalated', when: 'Issue has been handed to engineering', purpose: 'Tells the user the fix is in expert hands and refreshes the expectation of when to hear back.' },
    ],
  },
  {
    id: 'resolution', label: 'Resolution',
    messages: [
      { id: 'res-fixed', title: 'Issue Fixed', when: 'A fix is verified and deployed', purpose: 'Explains what was wrong, what the user needs to do to get the fix (refresh), and invites confirmation.' },
      { id: 'res-updated', title: 'Fix Incoming', when: 'Fix is in the next release, not yet live', purpose: 'Tells them when to expect the update and how they will be notified, avoiding "was this fixed?" tickets.' },
      { id: 'res-workaround', title: 'Workaround Provided', when: 'We can unblock the user but not fix yet', purpose: 'Delivers the unblocking steps clearly, with a clearly marked editable placeholder, plus the permanent-fix timeline.' },
      { id: 'res-bydesign', title: 'By Design', when: 'The behavior matches the intended product design', purpose: 'Explains the intended behavior, acknowledges the feedback, and logs it for future consideration.' },
    ],
  },
  {
    id: 'closing', label: 'Closing',
    messages: [
      { id: 'close-resolved', title: 'Mark as Resolved', when: 'User confirms the fix, or 3 days after a "fix incoming" message', purpose: 'Politely closes the ticket and makes reopening effortless if anything recurs.' },
      { id: 'close-no-reply', title: 'No Reply Close', when: '7 days with no user response on an unresolved case', purpose: 'Closes without blame, restates the last position, and invites a fresh ticket if they come back.' },
      { id: 'close-thank', title: 'Thank You', when: 'Sincere thanks from the user, or after a particularly positive outcome', purpose: 'Warm sign-off that ends interactions on a human note.' },
      { id: 'close-downgrade-offer', title: 'Downgrade Offer', when: 'User complains about price or plans to cancel', purpose: 'Offers the free or cheaper tier instead of losing the account entirely - saves the relationship.' },
      { id: 'close-survey', title: 'Closing Survey', when: 'Ticket resolved and closed', purpose: 'Asks for a 1-5 rating and optional feedback; the answer feeds satisfaction tracking.' },
    ],
  },
];

const AUTO_MSG_TEMPLATES: Record<string, (v: { userName: string; ticketType: string }) => string> = {
  'ack-welcome': ({ userName }) => `Hi ${userName},\n\nWelcome to our support! We've received your ticket and our team is reviewing it now.\n\nWe typically respond within 24 hours. If your issue is urgent, please reply with "URGENT" and we'll prioritize your case.\n\nBest regards,\nSupport Team`,
  'ack-received': ({ userName, ticketType }) => `Hi ${userName},\n\nThank you for reaching out! We've received your ${ticketType} ticket and our team is reviewing it now.\n\nWe'll get back to you as soon as possible.\n\nBest regards,\nSupport Team`,
  'ack-preferred-contact': ({ userName }) => `Hi ${userName},\n\nThanks for your patience! While we work on this, could you let us know your preferred way to be contacted? You can keep replying here, or tell us an email address you check more often.\n\nBest regards,\nSupport Team`,
  'ack-followup': ({ userName }) => `Hi ${userName},\n\nJust checking in on your recent ticket. Have you been able to try the suggestions we provided?\n\nLet us know if you need any further assistance!\n\nBest regards,\nSupport Team`,
  'inv-more-info': ({ userName }) => `Hi ${userName},\n\nCould you please provide a bit more detail about the issue you're experiencing? Screenshots or steps to reproduce the problem would be very helpful.\n\nThank you!`,
  'inv-need-info-2': ({ userName }) => `Hi ${userName},\n\nJust a friendly reminder that we're still waiting for a bit more detail to solve your issue (a screenshot, the exact steps, or your device/browser).\n\nNo rush - we just want to make sure we fix the right thing for you!\n\nBest regards,\nSupport Team`,
  'inv-status': ({ userName }) => `Hi ${userName},\n\nWe wanted to give you a quick update on your ticket. Our team is actively investigating the issue and we'll have more information for you soon.\n\nThank you for your patience!`,
  'inv-status-delay': ({ userName }) => `Hi ${userName},\n\nQuick update: this issue is taking a little longer than expected because it touches a core part of the app and we want to fix it properly.\n\nWe'll come back to you by [date] with concrete news - even if it's just a progress note.\n\nBest regards,\nSupport Team`,
  'inv-escalated': ({ userName }) => `Hi ${userName},\n\nWe've identified the issue you reported and our engineering team is actively working on a fix. We'll keep you updated on the progress.\n\nThank you for your patience!`,
  'res-fixed': ({ userName }) => `Hi ${userName},\n\nGood news - this issue has been resolved in our latest update. Please refresh your browser and let us know if you're still experiencing any problems.\n\nBest regards,\nSupport Team`,
  'res-updated': ({ userName }) => `Hi ${userName},\n\nHeads up: the fix for your issue is already built and will roll out in our next release (expected [date]).\n\nYou'll get an in-app note when it's live - no need to check manually. If it's blocking you in the meantime, let us know and we'll find a temporary path.\n\nBest regards,\nSupport Team`,
  'res-workaround': ({ userName }) => `Hi ${userName},\n\nWe've found a temporary workaround for your issue:\n\n[Describe workaround here]\n\nOur engineering team is working on a permanent fix. We'll notify you once it's available.\n\nBest regards,\nSupport Team`,
  'res-bydesign': ({ userName }) => `Hi ${userName},\n\nThank you for your feedback! After reviewing your request, we found that this behavior is working as designed.\n\nHowever, we've logged your suggestion for future consideration. Thank you for helping us improve!\n\nBest regards,\nSupport Team`,
  'close-resolved': ({ userName }) => `Hi ${userName},\n\nSince this issue has been resolved, we're closing this ticket. If you experience any further problems, feel free to open a new ticket anytime.\n\nBest regards,\nSupport Team`,
  'close-no-reply': ({ userName }) => `Hi ${userName},\n\nSince we haven't heard back, we're closing this ticket. If you need further assistance, feel free to open a new ticket anytime.\n\nBest regards,\nSupport Team`,
  'close-thank': ({ userName }) => `Hi ${userName},\n\nThank you for using our support! We're glad we could help resolve your issue.\n\nIf you have any other questions, don't hesitate to reach out.\n\nBest regards,\nSupport Team`,
  'close-downgrade-offer': ({ userName }) => `Hi ${userName},\n\nWe're sorry to see you consider leaving! Before you cancel, we'd love to offer a downgrade to our free or lighter plan instead - you'd keep your data and can upgrade again anytime.\n\nIf you'd like that, just reply "downgrade" and we'll set it up for you right away.\n\nBest regards,\nSupport Team`,
  'close-survey': ({ userName }) => `Hi ${userName},\n\nWe've closed your ticket - thanks for sticking with us!\n\nMind sharing a quick rating of how we handled it (1-5)? Your answer directly helps us get better.\n\nBest regards,\nSupport Team`,
};

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'coupons' | 'users' | 'tickets' | 'settings'>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponGroups, setCouponGroups] = useState<CouponGroup[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [savingSetting, setSavingSetting] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Coupon Form State
  const [isAddingCoupon, setIsAddingCoupon] = useState(false);
  const [newCoupon, setNewCoupon] = useState({
    code: '', discountType: 'percentage', discountValue: 0, maxUses: '', restrictedToEmail: '',
    restrictedToPlan: 'all', startDate: '', expiresAt: '', oneTimePerUser: false, groupId: 'none',
  });

  // Coupon tab state
  const [couponSearch, setCouponSearch] = useState('');
  const [couponFilter, setCouponFilter] = useState<'all' | 'active' | 'expired'>('all');
  const [expandedCouponId, setExpandedCouponId] = useState<number | null>(null);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<number>>(new Set());
  const [groupModal, setGroupModal] = useState<{ mode: 'add' | 'edit'; id?: number } | null>(null);
  const [groupForm, setGroupForm] = useState({ name: '', color: GROUP_COLORS[0], icon: 'tag' });
  const [draftLayout, setDraftLayout] = useState<LayoutItem[] | null>(null);
  const dragRef = useRef<{ kind: 'group' | 'coupon'; id: number } | null>(null);

  const [activeSettingGroup, setActiveSettingGroup] = useState<string>('platform-access');
  const { viewAsUser, setViewAsUser } = useAdminPreview();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, couponsRes, usersRes, groupsRes, settingsRes] = await Promise.all([
        fetch('/api/admin/stats', { credentials: 'include' }),
        fetch('/api/admin/coupons', { credentials: 'include' }),
        fetch('/api/admin/users', { credentials: 'include' }),
        fetch('/api/admin/coupon-groups', { credentials: 'include' }),
        fetch('/api/admin/settings', { credentials: 'include' }),
      ]);

      if ([statsRes, couponsRes, usersRes, groupsRes, settingsRes].some(res => !res.ok)) {
        throw new Error('One or more API requests failed');
      }

      if (statsRes.ok) setStats(await statsRes.json());
      if (couponsRes.ok) setCoupons(await couponsRes.json());
      if (usersRes.ok) setUsers(await usersRes.json());
      if (groupsRes.ok) setCouponGroups(await groupsRes.json());
      if (settingsRes.ok) {
        const rows = await settingsRes.json();
        const map: Record<string, string> = {};
        (rows || []).forEach((row: any) => { map[row.key] = row.value; });
        setSettings(map);
      }
    } catch (error) {
      console.error('Error fetching admin data:', error);
      setError('Failed to load admin data. Please check console for details.');
      toast({ title: 'Error', description: 'Failed to fetch admin data. Please refresh the page.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSetting = async (row: SystemSetting, value: string) => {
    setSavingSetting(row.key);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: row.key, value }),
      });
      if (res.ok) {
        setSettings(prev => ({ ...prev, [row.key]: value }));
        toast({ title: 'Setting updated', description: `${row.label} saved. Changes apply within a few seconds.` });
      } else {
        const d = await res.json();
        toast({ title: 'Error', description: d.error || 'Failed to update setting', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Server error', variant: 'destructive' });
    } finally {
      setSavingSetting(null);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...newCoupon,
          discountValue: Number(newCoupon.discountValue),
          maxUses: newCoupon.maxUses ? Number(newCoupon.maxUses) : null,
          restrictedToPlan: newCoupon.restrictedToPlan === 'all' ? null : newCoupon.restrictedToPlan,
          restrictedToEmail: newCoupon.restrictedToEmail || null,
          startDate: newCoupon.startDate || null,
          expiresAt: newCoupon.expiresAt || null,
          groupId: newCoupon.groupId === 'none' ? null : Number(newCoupon.groupId),
        })
      });
      if (res.ok) {
        toast({ title: 'Success', description: 'Coupon created successfully' });
        setIsAddingCoupon(false);
        setNewCoupon({ code: '', discountType: 'percentage', discountValue: 0, maxUses: '', restrictedToEmail: '', restrictedToPlan: 'all', startDate: '', expiresAt: '', oneTimePerUser: false, groupId: 'none' });
        fetchData();
      } else {
        const errorData = await res.json();
        toast({ title: 'Error', description: errorData.error || 'Failed to create coupon', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Server error', variant: 'destructive' });
    }
  };

  const handleDeleteCoupon = async (id: number) => {
    if (!confirm('Are you sure you want to delete this coupon?')) return;
    try {
      const res = await fetch(`/api/admin/coupons/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        toast({ title: 'Success', description: 'Coupon deleted' });
        fetchData();
      } else {
        const errorData = await res.json();
        toast({ title: 'Error', description: errorData.error || 'Failed to delete coupon', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to delete coupon', variant: 'destructive' });
    }
  };

  const handleUpdateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoupon) return;
    try {
      const res = await fetch(`/api/admin/coupons/${editingCoupon.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          code: editingCoupon.code,
          discountType: editingCoupon.discountType,
          discountValue: Number(editingCoupon.discountValue),
          maxUses: editingCoupon.maxUses || null,
          restrictedToEmail: editingCoupon.restrictedToEmail || null,
          restrictedToPlan: editingCoupon.restrictedToPlan || null,
          startDate: editingCoupon.startDate || null,
          expiresAt: editingCoupon.expiresAt || null,
          oneTimePerUser: editingCoupon.oneTimePerUser,
          active: editingCoupon.active,
          groupId: editingCoupon.groupId,
        })
      });
      if (res.ok) {
        toast({ title: 'Success', description: 'Coupon updated' });
        setEditingCoupon(null);
        fetchData();
      } else {
        const errorData = await res.json();
        toast({ title: 'Error', description: errorData.error || 'Failed to update', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Server error', variant: 'destructive' });
    }
  };

  // ---- Coupon groups ----
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/coupon-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(groupForm),
      });
      if (res.ok) {
        toast({ title: 'Success', description: 'Group created' });
        setGroupModal(null);
        fetchData();
      } else {
        const errorData = await res.json();
        toast({ title: 'Error', description: errorData.error || 'Failed to create group', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Server error', variant: 'destructive' });
    }
  };

  const handleUpdateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupModal?.id) return;
    try {
      const res = await fetch(`/api/admin/coupon-groups/${groupModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(groupForm),
      });
      if (res.ok) {
        toast({ title: 'Success', description: 'Group updated' });
        setGroupModal(null);
        fetchData();
      } else {
        const errorData = await res.json();
        toast({ title: 'Error', description: errorData.error || 'Failed to update group', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Server error', variant: 'destructive' });
    }
  };

  const handleDeleteGroup = async (id: number) => {
    const group = couponGroups.find(g => g.id === id);
    const count = coupons.filter(c => c.groupId === id).length;
    if (!confirm(`Delete group "${group?.name}"? Its ${count} coupon(s) will move to "No group".`)) return;
    try {
      const res = await fetch(`/api/admin/coupon-groups/${id}`, { method: 'DELETE', credentials: 'include' });
      if (res.ok) {
        toast({ title: 'Success', description: 'Group deleted' });
        setGroupModal(null);
        fetchData();
      } else {
        const errorData = await res.json();
        toast({ title: 'Error', description: errorData.error || 'Failed to delete group', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Server error', variant: 'destructive' });
    }
  };

  const openEditGroup = (group: CouponGroup) => {
    setGroupForm({ name: group.name, color: group.color || GROUP_COLORS[0], icon: group.icon || 'tag' });
    setGroupModal({ mode: 'edit', id: group.id });
  };

  // ---- Coupon layout (drag & drop with groups) ----
  const buildLayout = (c = coupons, g = couponGroups): LayoutItem[] => {
    const groups = [...g].sort((a, b) => a.sortOrder - b.sortOrder);
    const items: LayoutItem[] = [];
    for (const grp of groups) {
      const gCoupons = c.filter(x => x.groupId === grp.id).sort((a, b) => a.sortOrder - b.sortOrder);
      items.push({ kind: 'group', group: grp, coupons: gCoupons });
    }
    const ungrouped = c.filter(x => !x.groupId).sort((a, b) => a.sortOrder - b.sortOrder);
    for (const cup of ungrouped) items.push({ kind: 'coupon', coupon: cup });
    return items;
  };

  const keyOf = (item: LayoutItem) => item.kind === 'group' ? `g${item.group.id}` : `c${item.coupon.id}`;

  const moveBlock = (items: LayoutItem[], from: number, size: number, before: number): LayoutItem[] => {
    const block = items.slice(from, from + size);
    const rest = items.filter((_, i) => i < from || i >= from + size);
    let target = before;
    if (before > from) target = before - Math.min(before - from, size);
    target = Math.max(0, Math.min(target, rest.length));
    return [...rest.slice(0, target), ...block, ...rest.slice(target)];
  };

  const handleDragStart = (item: LayoutItem) => {
    dragRef.current = { kind: item.kind, id: item.kind === 'group' ? item.group.id : item.coupon.id };
    setDraftLayout(buildLayout());
  };

  const handleDragOver = (e: React.DragEvent, over: LayoutItem) => {
    e.preventDefault();
    const drag = dragRef.current;
    if (!drag || !draftLayout) return;
    const draggedKey = drag.kind === 'group' ? `g${drag.id}` : `c${drag.id}`;
    const overKey = keyOf(over);
    if (draggedKey === overKey) return;

    const items = draftLayout;
    const fromIdx = items.findIndex(i => keyOf(i) === draggedKey);
    if (fromIdx === -1) return;

    let blockSize = 1;
    if (items[fromIdx].kind === 'group') {
      let j = fromIdx + 1;
      while (j < items.length && items[j].kind === 'coupon') { blockSize += 1; j += 1; }
    }

    let insertBefore: number;
    if (over.kind === 'coupon') {
      insertBefore = items.findIndex(i => keyOf(i) === overKey);
    } else if (drag.kind === 'group') {
      insertBefore = items.findIndex(i => keyOf(i) === overKey);
    } else {
      // Coupon dropped on a group -> append to the end of that group's coupons
      const gIdx = items.findIndex(i => keyOf(i) === overKey);
      let end = gIdx + 1;
      while (end < items.length && items[end].kind === 'coupon') end += 1;
      insertBefore = end;
    }

    const next = moveBlock(items, fromIdx, blockSize, insertBefore);
    const same = next.length === items.length && next.every((it, i) => keyOf(it) === keyOf(items[i]));
    if (!same) setDraftLayout(next);
  };

  const handleDragEnd = async () => {
    dragRef.current = null;
    if (!draftLayout) return;
    const items = draftLayout;
    setDraftLayout(null);

    // Optimistic local update
    let couponOrder = 0;
    let curGroup: number | null = null;
    const newGroups = [...couponGroups];
    const newCoupons = coupons.map(c => ({ ...c }));
    let gi = 0;
    for (const item of items) {
      if (item.kind === 'group') {
        curGroup = item.group.id;
        newGroups[gi] = { ...newGroups[gi], sortOrder: gi };
        gi += 1;
      } else {
        const idx = newCoupons.findIndex(c => c.id === item.coupon.id);
        if (idx !== -1) {
          newCoupons[idx] = { ...newCoupons[idx], sortOrder: couponOrder, groupId: curGroup };
          couponOrder += 1;
        }
      }
    }
    setCouponGroups(newGroups);
    setCoupons(newCoupons);

    // Persist flat layout
    const payload: ({ type: 'group'; id: number } | { type: 'coupon'; id: number; groupId?: number | null })[] = items.map(item => item.kind === 'group'
      ? { type: 'group', id: item.group.id }
      : { type: 'coupon', id: item.coupon.id });
    let payloadGroup: number | null = null;
    for (let i = 0; i < payload.length; i += 1) {
      const it = payload[i];
      if (it.type === 'group') payloadGroup = it.id;
      else payload[i] = { ...it, groupId: payloadGroup };
    }

    try {
      const res = await fetch('/api/admin/coupons/layout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ layout: payload }),
      });
      if (!res.ok) fetchData();
    } catch {
      fetchData();
    }
  };

  const handleUpdateUserTier = async (userId: number, tier: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier })
      });
      if (res.ok) {
        toast({ title: 'Success', description: `User updated to ${tier.toUpperCase()}` });
        fetchData();
      } else {
        const errorData = await res.json();
        toast({ title: 'Error', description: errorData.error || 'Failed to update user tier', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Failed to update user tier', variant: 'destructive' });
    }
  };

  const [adminTickets, setAdminTickets] = useState<any[]>([]);
  const [activePanelTicket, setActivePanelTicket] = useState<any | null>(null);
  const [panelMessages, setPanelMessages] = useState<any[]>([]);
  const [sendingAdminMessage, setSendingAdminMessage] = useState(false);
  const [userFullDetails, setUserFullDetails] = useState<any | null>(null);
  const [chatExpanded, setChatExpanded] = useState(false);
  const [ticketFilter, setTicketFilter] = useState<string>('all');
  const [ticketSort, setTicketSort] = useState<string>('newest');
  const [ticketTypeFilter, setTicketTypeFilter] = useState<string>('all');
  const [adminPanelTab, setAdminPanelTab] = useState<'guide' | 'auto-messages' | 'user-profile'>('guide');
  const [guideExpandedCats, setGuideExpandedCats] = useState<Set<string>>(new Set(['handling-tickets']));
  const [selectedGuide, setSelectedGuide] = useState<{ catId: string; guideId: string } | null>({ catId: 'handling-tickets', guideId: 'ht-overview' });
  const [autoMsgExpandedCats, setAutoMsgExpandedCats] = useState<Set<string>>(new Set(['acknowledgement']));
  const [selectedAutoMsg, setSelectedAutoMsg] = useState<{ catId: string; msgId: string } | null>({ catId: 'acknowledgement', msgId: 'ack-welcome' });

  // Users tab full page view
  const [activeUserView, setActiveUserView] = useState<any | null>(null);

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/admin/tickets', { credentials: 'include' });
      if (res.ok) setAdminTickets(await res.json());
    } catch {}
  };

  useEffect(() => {
    if (activeTab === 'tickets') fetchTickets();
  }, [activeTab]);

  useEffect(() => {
    if (!activePanelTicket) return;
    const fetchMessages = async () => {
      try {
        const res = await fetch(`/api/admin/tickets/${activePanelTicket.id}/messages`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setPanelMessages(data.messages || []);
          setActivePanelTicket((prev: any) => prev ? { ...prev, ...data.ticket } : null);
          setAdminTickets(prev => prev.map((t: any) => t.id === data.ticket.id ? { ...t, ...data.ticket, unreadCount: 0 } : t));
        }
      } catch {}
    };
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [activePanelTicket?.id]);

  const handleAdminSendMessage = async (text: string, file?: File | null) => {
    if (!activePanelTicket) return;
    setSendingAdminMessage(true);
    try {
      if (file) {
        const form = new FormData();
        form.append('message', text || '');
        form.append('file', file);
        await fetch(`/api/admin/tickets/${activePanelTicket.id}/messages`, {
          method: 'POST',
          credentials: 'include',
          body: form as any,
        });
      } else {
        await fetch(`/api/admin/tickets/${activePanelTicket.id}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message: text }),
        });
      }
      const res = await fetch(`/api/admin/tickets/${activePanelTicket.id}/messages`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setPanelMessages(data.messages || []);
        setActivePanelTicket((prev: any) => prev ? { ...prev, ...data.ticket } : null);
      }
    } catch {} finally {
      setSendingAdminMessage(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!activePanelTicket) return;
    await fetch(`/api/admin/tickets/${activePanelTicket.id}/close`, { method: 'PATCH', credentials: 'include' });
    setActivePanelTicket((prev: any) => prev ? { ...prev, status: 'closed' } : null);
    fetchTickets();
  };

  const handleViewUserData = async (userId: number, asFullPage = false) => {
    try {
      setUserFullDetails(null);
      const res = await fetch(`/api/admin/users/${userId}/full-details`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUserFullDetails(data);
        if (asFullPage) setActiveUserView(data);
      }
    } catch {}
  };

  const refetchPanelUser = async () => {
    if (activePanelTicket?.userId) handleViewUserData(activePanelTicket.userId);
    fetchData();
  };

  const TYPE_COLORS: Record<string, string> = {
    suggestion: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    bug: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    report: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    support: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  };

if (loading && !stats) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center">
          <Activity className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-lg font-medium">Loading admin dashboard...</p>
          <p className="text-muted-foreground mt-2">Verifying admin permissions</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 mb-4">
            <ShieldCheck className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-6">
            You don't have permission to access the admin dashboard. Contact an administrator if you believe this is an error.
          </p>
          <button
            onClick={() => window.location.href = '/'}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  const layout = draftLayout || buildLayout();

  const renderCouponRow = (coupon: Coupon) => {
    const isExpired = (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) || (!coupon.active);
    const isExpanded = expandedCouponId === coupon.id;
    return (
      <div key={coupon.id}>
        <div
          draggable
          onDragStart={() => handleDragStart({ kind: 'coupon', coupon })}
          onDragOver={(e) => handleDragOver(e, { kind: 'coupon', coupon })}
          onDragEnd={handleDragEnd}
          className={`flex items-center gap-3 p-4 bg-card border rounded-2xl transition-all group ${
            isExpanded ? 'border-primary/30 shadow-sm' : 'border-border hover:border-border'
          } ${dragRef.current?.kind === 'coupon' && dragRef.current.id === coupon.id ? 'opacity-50' : ''}`}
        >
          <div className="w-6 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
            <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
            </svg>
          </div>
          <span className="font-semibold text-sm tracking-wide">{coupon.code}</span>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-muted">
            {coupon.usedCount} / {coupon.maxUses || '∞'}
          </span>
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
            isExpired ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
          }`}>
            {isExpired ? 'Expired' : 'Active'}
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground hidden sm:block">
            {coupon.discountType === 'percentage' ? `${coupon.discountValue}% OFF` : `$${coupon.discountValue} OFF`}
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setEditingCoupon(coupon)}
            className="px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
          >
            Edit
          </button>
          <button
            onClick={() => setExpandedCouponId(isExpanded ? null : coupon.id)}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        {isExpanded && (
          <div className="ml-8 p-4 bg-muted/30 border border-border rounded-2xl -mt-1 mb-2 animate-in fade-in duration-200">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Start Date</span>
                <p className="font-medium">{coupon.startDate ? format(new Date(coupon.startDate), 'MMM dd, yyyy') : 'No start date'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Expiry Date</span>
                <p className="font-medium">{coupon.expiresAt ? format(new Date(coupon.expiresAt), 'MMM dd, yyyy') : 'Never'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Discount</span>
                <p className="font-medium">{coupon.discountType === 'percentage' ? `${coupon.discountValue}% OFF` : `$${coupon.discountValue} OFF`}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Usage Limit</span>
                <p className="font-medium">{coupon.maxUses || 'Unlimited'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">One Time Per User</span>
                <p className="font-medium">{coupon.oneTimePerUser ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Restricted to Plan</span>
                <p className="font-medium">{coupon.restrictedToPlan || 'All Plans'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Restricted to Email</span>
                <p className="font-medium">{coupon.restrictedToEmail || 'Public'}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Group</span>
                <p className="font-medium">{couponGroups.find(g => g.id === coupon.groupId)?.name || 'No group'}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderGroupRow = (item: Extract<LayoutItem, { kind: 'group' }>) => {
    const { group, coupons: gCoupons } = item;
    const expanded = expandedGroupIds.has(group.id);
    const Icon = GROUP_ICONS[group.icon || ''] || Tag;
    return (
      <div key={`g${group.id}`} className="space-y-2">
        <div
          draggable
          onDragStart={() => handleDragStart(item)}
          onDragOver={(e) => handleDragOver(e, item)}
          onDragEnd={handleDragEnd}
          onClick={() => openEditGroup(group)}
          className={`flex items-center gap-3 p-4 bg-card border rounded-2xl transition-all group cursor-pointer select-none ${
            expanded ? 'border-primary/30 shadow-sm' : 'border-border hover:border-border'
          } ${dragRef.current?.kind === 'group' && dragRef.current.id === group.id ? 'opacity-50' : ''}`}
        >
          <div className="w-6 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
            <svg className="w-4 h-4 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
            </svg>
          </div>
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: group.color || '#6b7280' }} />
          <Icon className="w-4 h-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{group.name}</span>
          <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-muted">
            {gCoupons.length} coupon{gCoupons.length === 1 ? '' : 's'}
          </span>
          <span className="text-[10px] text-muted-foreground hidden md:inline">Click to rename or recolor</span>
          <div className="flex-1" />
          <button
            onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group.id); }}
            className="p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive rounded-lg transition-colors opacity-0 group-hover:opacity-100"
            title="Delete group"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openEditGroup(group); }}
            className="px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedGroupIds(prev => { const next = new Set(prev); next.has(group.id) ? next.delete(group.id) : next.add(group.id); return next; });
            }}
            className="p-1.5 hover:bg-muted rounded-lg transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        {expanded && (
          <div className="ml-8 space-y-2 border-l-2 border-border/40 pl-4">
            {gCoupons.length === 0 && (
              <p className="text-xs text-muted-foreground py-1 px-2">No coupons in this group yet — drag one here, or pick the group when creating a coupon.</p>
            )}
            {gCoupons.map(cup => renderCouponRow(cup))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-background">
      <header className="px-4 sm:px-6 h-16 border-b border-border bg-card/30 backdrop-blur-sm flex items-center justify-between flex-shrink-0 gap-3 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-foreground whitespace-nowrap">Admin Center</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">Manage your workspace and platform settings</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-muted p-1 rounded-xl flex-shrink-0 overflow-x-auto scrollbar-none max-w-[60vw] sm:max-w-none">
          {(['overview', 'coupons', 'users', 'tickets', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg capitalize transition-all flex items-center gap-1.5 text-sm font-medium ${
                activeTab === tab
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab}
              {tab === 'tickets' && adminTickets.some((t: any) => t.unreadCount > 0) && (
                <span className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />
              )}
            </button>
          ))}
          {viewAsUser !== undefined && (
            <button
              onClick={() => setViewAsUser(!viewAsUser)}
              className="px-3 py-1.5 rounded-lg capitalize transition-all flex items-center gap-1.5 text-sm font-medium ${
                viewAsUser ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }"
            >
              {viewAsUser ? 'View as Regular User' : 'View as Admin'}
              {viewAsUser && (
                <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
              )}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
        <div className="max-w-[1440px] mx-auto w-full min-w-0 space-y-6">
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {loading ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="rounded-2xl bg-card border border-border p-5">
                      <Skeleton className="w-9 h-9 rounded-xl mb-3" />
                      <Skeleton className="h-3 w-20 mb-2" />
                      <Skeleton className="h-7 w-24" />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="rounded-2xl bg-card border border-border p-6 lg:col-span-2">
                    <Skeleton className="h-5 w-40 mb-6" />
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="flex gap-4">
                          <Skeleton className="h-10 flex-1" />
                          <Skeleton className="h-10 w-20" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-2xl bg-card border border-border p-6">
                      <Skeleton className="h-5 w-32 mb-4" />
                      <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    </div>
                    <div className="rounded-2xl bg-card border border-border p-6">
                      <Skeleton className="h-5 w-28 mb-4" />
                      <div className="space-y-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <Skeleton key={i} className="h-8 w-full" />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Earnings', value: `$${stats?.summary.totalEarnings?.toLocaleString() ?? '0'}`, icon: DollarSign, accent: 'label-green' },
                { label: 'Revenue This Month', value: `$${stats?.summary.revenueThisMonth?.toLocaleString() ?? '0'}`, icon: TrendingUp, accent: 'label-green' },
                { label: 'Total Users', value: stats?.summary.totalUsers?.toLocaleString() ?? '0', icon: Users, accent: 'label-blue' },
                { label: 'New Users (7d)', value: `+${stats?.summary.newUsersThisWeek ?? 0}`, icon: User, accent: 'label-blue' },
                { label: 'Active Subscriptions', value: stats?.summary.activeSubscriptions ?? 0, icon: CreditCard, accent: 'label-purple' },
                { label: 'Active Users (7d)', value: stats?.summary.activeUsers7d ?? 0, icon: Activity, accent: 'label-purple' },
                { label: 'Coupons Redeemed', value: stats?.summary.totalCouponsUsed ?? 0, icon: Ticket, accent: 'label-orange' },
                { label: 'Open Tickets', value: stats?.summary.openTickets ?? 0, icon: MessageSquare, accent: 'label-red' },
              ].map((stat, i) => (
                <div key={i} className="rounded-2xl bg-card border border-border p-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: `hsl(var(--${stat.accent}) / 0.12)` }}>
                    <stat.icon className="w-4 h-4" style={{ color: `hsl(var(--${stat.accent}))` }} />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-card border border-border overflow-hidden lg:col-span-2">
                <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'hsl(var(--label-blue) / 0.12)' }}>
                    <Calendar className="w-3.5 h-3.5" style={{ color: 'hsl(var(--label-blue))' }} />
                  </div>
                  <h2 className="text-sm font-bold">Recent Transactions</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border bg-muted/20">
                        <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide">User</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Plan</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Amount</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Status</th>
                        <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stats?.recentTransactions?.map((tx: any) => (
                        <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-3">
                            <p className="text-sm font-medium">{tx.userName || `User #${tx.userId}`}</p>
                            <p className="text-xs text-muted-foreground">{tx.userEmail}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground capitalize">{tx.plan || 'free'}</td>
                          <td className="px-4 py-3 text-sm font-semibold" style={{ color: 'hsl(var(--label-green))' }}>${(tx.amount / 100).toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                              tx.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
                            }`}>
                              {tx.status}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-sm text-muted-foreground">{format(new Date(tx.createdAt), 'MMM dd, HH:mm')}</td>
                        </tr>
                      ))}
                      {(!stats?.recentTransactions || stats.recentTransactions.length === 0) && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-sm text-muted-foreground">
                            No transactions found yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl bg-card border border-border p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'hsl(var(--label-purple) / 0.12)' }}>
                      <Sparkles className="w-3.5 h-3.5" style={{ color: 'hsl(var(--label-purple))' }} />
                    </div>
                    <h2 className="text-sm font-bold">Recent Registrations</h2>
                  </div>
                  <div className="space-y-3">
                    {stats?.recentRegistrations?.map((u: any) => (
                      <div key={u.id} className="flex items-center justify-between gap-2 py-2 border-b border-border/50 last:border-0">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{u.tier}</span>
                          <p className="text-[10px] text-muted-foreground">{format(new Date(u.createdAt), 'MMM d')}</p>
                        </div>
                      </div>
                    ))}
                    {(!stats?.recentRegistrations || stats.recentRegistrations.length === 0) && (
                      <p className="text-sm text-muted-foreground">No registrations yet.</p>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl bg-card border border-border p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'hsl(var(--label-orange) / 0.12)' }}>
                      <Ticket className="w-3.5 h-3.5" style={{ color: 'hsl(var(--label-orange))' }} />
                    </div>
                    <h2 className="text-sm font-bold">Top Coupons</h2>
                  </div>
                  <div className="space-y-2">
                    {stats?.topCoupons?.map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                        <span className="font-mono text-xs font-semibold">{c.code}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.discountType === 'percentage' ? `${c.discountValue}%` : `$${c.discountValue}`} · {c.usedCount}/{c.maxUses || '∞'} used
                        </span>
                      </div>
                    ))}
                    {(!stats?.topCoupons || stats.topCoupons.length === 0) && (
                      <p className="text-sm text-muted-foreground">No coupons yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'coupons' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="rounded-2xl bg-card border border-border p-6">
              <div className="flex flex-wrap justify-between items-start gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'hsl(var(--label-orange) / 0.12)' }}>
                    <Ticket className="w-4 h-4" style={{ color: 'hsl(var(--label-orange))' }} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold">Promotions & Discounts</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Create and manage active coupon codes. Drag to reorder — coupons stay with their group.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setGroupForm({ name: '', color: GROUP_COLORS[0], icon: 'tag' }); setGroupModal({ mode: 'add' }); }}
                    className="bg-card border border-border text-foreground px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-muted transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    Add Group
                  </button>
                  <button
                    onClick={() => setIsAddingCoupon(true)}
                    className="bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 hover:bg-primary/90 transition-all"
                  >
                    <Plus className="w-4 h-4" />
                    New Coupon
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Search coupons..."
                value={couponSearch}
                onChange={e => setCouponSearch(e.target.value)}
                className="flex-1 min-w-[200px] bg-background border border-input rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              />
              <div className="flex items-center bg-muted rounded-xl p-1">
                {(['all', 'active', 'expired'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setCouponFilter(f)}
                    className={`px-4 py-2 text-xs font-bold rounded-lg capitalize transition-all ${
                      couponFilter === f ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground">Drag group headers and coupons to reorder.</span>
            </div>

            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))
              ) : (
                <>
                  {layout.map(item =>
                    item.kind === 'group' ? renderGroupRow(item) : renderCouponRow(item.coupon)
                  )}
                  {layout.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                      <Ticket className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No coupons yet. Create your first coupon to get started.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

{activeTab === 'users' && (
          <div className="animate-in fade-in duration-300">
            {activeUserView ? (
              <div className="rounded-2xl bg-card border border-border overflow-hidden">
                <div className="h-[calc(100vh-160px)] min-h-[420px]">
                  <UserDetailView
                    details={activeUserView}
                    onBack={() => setActiveUserView(null)}
                    onUpdated={() => { handleViewUserData(activeUserView.user?.id, false); fetchData(); }}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-card border border-border overflow-hidden">
                <div className="px-6 py-5 border-b border-border flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'hsl(var(--label-blue) / 0.12)' }}>
                    <Users className="w-4 h-4" style={{ color: 'hsl(var(--label-blue))' }} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold">User Management</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">Monitor users and adjust status or access levels. Click a name for the full profile.</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border bg-muted/20">
                        <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide">Name</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Email</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-center">Tier</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-center">Status</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Joined</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Last Active</th>
                        <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide hidden lg:table-cell">Location</th>
                        <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wide text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {loading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                          <tr key={i}>
                            <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                            <td className="px-4 py-4"><Skeleton className="h-4 w-32" /></td>
                            <td className="px-4 py-4"><Skeleton className="h-5 w-16 mx-auto" /></td>
                            <td className="px-4 py-4"><Skeleton className="h-5 w-16 mx-auto" /></td>
                            <td className="px-4 py-4"><Skeleton className="h-4 w-20" /></td>
                            <td className="px-4 py-4"><Skeleton className="h-4 w-20" /></td>
                            <td className="px-4 py-4 hidden lg:table-cell"><Skeleton className="h-4 w-16" /></td>
                            <td className="px-6 py-4"><Skeleton className="h-7 w-20 ml-auto" /></td>
                          </tr>
                        ))
                      ) : users.map((u) => (
                        <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-6 py-3 font-medium">
                            <button onClick={() => handleViewUserData(u.id, true)} className="hover:text-primary transition-colors flex items-center gap-1 text-sm">
                              {u.name || '—'}
                              <Eye className="w-3 h-3 opacity-50" />
                            </button>
                            {u.location && <p className="text-xs text-muted-foreground font-normal lg:hidden">{u.location}</p>}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{u.email}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
                              u.tier === 'premium' ? 'bg-amber-500/10 text-amber-600' :
                              u.tier === 'pro' ? 'bg-primary/10 text-primary' :
                              'bg-muted text-muted-foreground'
                            }`}>
                              {u.tier === 'premium' ? 'Premium' : u.tier === 'pro' ? 'Pro' : u.tier}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${
                              u.status === 'active' || u.status === 'trialing' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'
                            }`}>
                              {u.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                            {u.createdAt ? format(new Date(u.createdAt), 'MMM dd, yyyy') : '—'}
                          </td>
                          <td className="p-4 text-muted-foreground whitespace-nowrap">
                            {u.lastActiveAt ? format(new Date(u.lastActiveAt), 'MMM dd, HH:mm') : '—'}
                          </td>
                          <td className="p-4 text-muted-foreground hidden lg:table-cell">{u.location || '—'}</td>
                          <td className="p-4 text-right pr-8">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleViewUserData(u.id, true)}
                                className="px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10 rounded-lg transition-colors"
                              >
                                View
                              </button>
                              <Select value={u.tier} onValueChange={(value) => handleUpdateUserTier(u.id, value)}>
                                <SelectTrigger className="bg-background border border-border rounded-lg px-2 py-1 text-xs font-semibold h-8">
                                  <SelectValue placeholder="Select tier" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="free">FREE</SelectItem>
                                  <SelectItem value="pro">PRO</SelectItem>
                                  <SelectItem value="premium">PREMIUM</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

{activeTab === 'tickets' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="rounded-2xl bg-card border border-border p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'hsl(var(--label-red) / 0.12)' }}>
                  <MessageSquare className="w-4 h-4" style={{ color: 'hsl(var(--label-red))' }} />
                </div>
                <h2 className="text-base font-bold">Support Tickets ({adminTickets.length})</h2>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={ticketTypeFilter} onValueChange={setTicketTypeFilter}>
                  <SelectTrigger className="w-[130px] bg-card border border-border text-xs h-8">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="bug">Bug</SelectItem>
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="suggestion">Suggestion</SelectItem>
                    <SelectItem value="report">Report</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={ticketFilter} onValueChange={setTicketFilter}>
                  <SelectTrigger className="w-[130px] bg-card border border-border text-xs h-8">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={ticketSort} onValueChange={setTicketSort}>
                  <SelectTrigger className="w-[130px] bg-card border border-border text-xs h-8">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                    <SelectItem value="unread">Unread First</SelectItem>
                  </SelectContent>
                </Select>
                <button onClick={fetchTickets} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 bg-muted rounded-lg transition-colors">Refresh</button>
              </div>
            </div>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : adminTickets.length === 0 ? (
              <div className="rounded-2xl bg-card border border-border py-16 text-center text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No tickets submitted yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {adminTickets
                  .filter((t: any) => ticketFilter === 'all' || t.status === ticketFilter)
                  .filter((t: any) => ticketTypeFilter === 'all' || t.type === ticketTypeFilter)
                  .sort((a: any, b: any) => {
                    if (ticketSort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
                    if (ticketSort === 'unread') return (b.unreadCount || 0) - (a.unreadCount || 0);
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                  })
                  .map((ticket: any) => (
                  <button
                    key={ticket.id}
                    onClick={() => { setActivePanelTicket(ticket); setChatExpanded(false); }}
                    className={`w-full flex items-center justify-between p-4 bg-card border rounded-xl hover:bg-muted/50 transition-colors text-left ${activePanelTicket?.id === ticket.id ? 'border-primary' : 'border-border'}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {ticket.unreadCount > 0 && <span className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />}
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${TYPE_COLORS[ticket.type] || 'bg-muted text-muted-foreground'}`}>{ticket.type}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{ticket.subject}</p>
                        <p className="text-xs text-muted-foreground">{ticket.userName} · {ticket.userEmail}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                      <span className="text-xs text-muted-foreground hidden sm:block">{ticket.createdAt ? format(new Date(ticket.createdAt), 'MMM d, HH:mm') : ''}</span>
                      {!ticket.staffReplied && ticket.status !== 'closed' && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">New</span>}
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        ticket.status === 'open' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                        ticket.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                        ticket.status === 'resolved' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                        'bg-muted text-muted-foreground'
                      }`}>{ticket.status === 'in_progress' ? 'In Progress' : ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}</span>
                    </div>
                  </button>
                ))}
                {adminTickets.filter((t: any) => ticketFilter === 'all' || t.status === ticketFilter)
                  .filter((t: any) => ticketTypeFilter === 'all' || t.type === ticketTypeFilter).length === 0 && (
                  <div className="text-center py-10 text-muted-foreground">
                    <p className="text-sm">No tickets match the selected filters.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      {/* Group Modal (Add / Edit) - same design as Edit Column popup */}
      {groupModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form
            onSubmit={groupModal.mode === 'add' ? handleCreateGroup : handleUpdateGroup}
            className="bg-card w-full max-w-md rounded-2xl p-6 border border-border shadow-2xl animate-in zoom-in-95 duration-200"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-foreground">{groupModal.mode === 'add' ? 'Add Group' : 'Edit Group'}</h3>
                <p className="text-sm text-muted-foreground">Organize coupons under a named, colorful group.</p>
              </div>
              <button type="button" onClick={() => setGroupModal(null)} className="p-2 hover:bg-muted rounded-full transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Group name</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Summer Campaign"
                  className="w-full bg-background border border-input rounded-lg px-4 py-3 font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  value={groupForm.name}
                  onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Color</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {GROUP_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setGroupForm({ ...groupForm, color })}
                      className={`w-7 h-7 rounded-full transition-all hover:scale-110 ${groupForm.color === color ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Icon</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {Object.entries(GROUP_ICONS).map(([key, Icon]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setGroupForm({ ...groupForm, icon: key })}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all border ${
                        groupForm.icon === key ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              {groupModal.mode === 'edit' && (
                <button
                  type="button"
                  onClick={() => groupModal.id && handleDeleteGroup(groupModal.id)}
                  className="px-4 py-3 bg-destructive/10 text-destructive font-medium rounded-xl hover:bg-destructive/20 transition-all flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={() => setGroupModal(null)}
                className="flex-1 px-4 py-3 bg-muted text-foreground font-medium rounded-xl hover:bg-muted/80 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
              >
                {groupModal.mode === 'add' ? 'Create Group' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

{/* New Coupon Modal */}
      {isAddingCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form
            onSubmit={handleCreateCoupon}
            className="bg-card w-full max-w-lg rounded-2xl p-6 border border-border shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-foreground">Create Coupon</h3>
                <p className="text-sm text-muted-foreground">Generate a discount code for your users</p>
              </div>
              <button
                type="button"
                onClick={() => setIsAddingCoupon(false)}
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Code</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. SUMMER2026"
                  className="w-full bg-background border border-input rounded-lg px-4 py-3 font-mono text-lg font-semibold uppercase tracking-wider focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  value={newCoupon.code}
                  onChange={e => setNewCoupon({ ...newCoupon, code: e.target.value.toUpperCase() })}
                />
                <p className="text-xs text-muted-foreground mt-1">Code will be converted to uppercase</p>
              </div>

<div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Group</label>
                  <Select value={newCoupon.groupId} onValueChange={(value) => setNewCoupon({ ...newCoupon, groupId: value })}>
                    <SelectTrigger className="w-full bg-background border border-input rounded-lg px-4 py-3 h-9">
                      <SelectValue placeholder="Select group" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No group</SelectItem>
                      {couponGroups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-foreground mb-2 block">Discount type</label>
                    <Select value={newCoupon.discountType} onValueChange={(value) => setNewCoupon({ ...newCoupon, discountType: value as any })}>
                    <SelectTrigger className="w-full bg-background border border-input rounded-lg px-4 py-3 h-9">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Discount %</label>
                  <div className="relative">
                    <input
                      required
                      type="number"
                      min="1"
                      max="100"
                      placeholder="20"
                      className="w-full bg-background border border-input rounded-lg pl-4 pr-8 py-3 font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      value={newCoupon.discountValue || ''}
                      onChange={e => setNewCoupon({ ...newCoupon, discountValue: Number(e.target.value) })}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Usage limit</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Leave empty for unlimited"
                  className="w-full bg-background border border-input rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  value={newCoupon.maxUses}
                  onChange={e => setNewCoupon({ ...newCoupon, maxUses: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">Leave empty for unlimited</p>
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">One time use per user</label>
                <button
                  type="button"
                  onClick={() => setNewCoupon({ ...newCoupon, oneTimePerUser: !newCoupon.oneTimePerUser })}
                  className={`w-10 h-6 rounded-full transition-colors relative ${newCoupon.oneTimePerUser ? 'bg-primary' : 'bg-muted'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${newCoupon.oneTimePerUser ? 'left-5' : 'left-1'}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Start date</label>
                  <input
                    type="date"
                    className="w-full bg-background border border-input rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all cursor-pointer"
                    value={newCoupon.startDate}
                    onChange={e => setNewCoupon({ ...newCoupon, startDate: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Optional start date</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Expiry date</label>
                  <input
                    type="date"
                    className="w-full bg-background border border-input rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all cursor-pointer"
                    value={newCoupon.expiresAt}
                    onChange={e => setNewCoupon({ ...newCoupon, expiresAt: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Optional expiry date</p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Restrict to plan</label>
                <Select value={newCoupon.restrictedToPlan} onValueChange={(value) => setNewCoupon({ ...newCoupon, restrictedToPlan: value })}>
                  <SelectTrigger className="w-full bg-background border border-input rounded-lg px-4 py-3 h-9">
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Plans</SelectItem>
                    <SelectItem value="Free">Free</SelectItem>
                    <SelectItem value="Premium">Premium</SelectItem>
                    <SelectItem value="Pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Restrict to email</label>
                <input
                  type="email"
                  placeholder="Only this user can redeem. Leave empty for public use"
                  className="w-full bg-background border border-input rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  value={newCoupon.restrictedToEmail}
                  onChange={e => setNewCoupon({ ...newCoupon, restrictedToEmail: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">Only this user can redeem. Leave empty for public use</p>
              </div>
            </div>

            <div className="flex gap-3 mt-8">
              <button
                type="button"
                onClick={() => setIsAddingCoupon(false)}
                className="flex-1 px-4 py-3 bg-muted text-foreground font-medium rounded-xl hover:bg-muted/80 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
              >
                Create Coupon
              </button>
            </div>
          </form>
        </div>
      )}

{/* Edit Coupon Modal */}
      {editingCoupon && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form
            onSubmit={handleUpdateCoupon}
            className="bg-card w-full max-w-lg rounded-2xl p-6 border border-border shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-bold text-foreground">Edit Coupon</h3>
                <p className="text-sm text-muted-foreground">Modify this discount code</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCoupon(null)}
                className="p-2 hover:bg-muted rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Code</label>
                <input
                  required
                  type="text"
                  placeholder="e.g. SUMMER2026"
                  className="w-full bg-background border border-input rounded-lg px-4 py-3 font-mono text-lg font-semibold uppercase tracking-wider focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  value={editingCoupon.code || ''}
                  onChange={e => setEditingCoupon({ ...editingCoupon, code: e.target.value.toUpperCase() })}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Group</label>
                <Select value={editingCoupon.groupId ? String(editingCoupon.groupId) : 'none'} onValueChange={(value) => setEditingCoupon({ ...editingCoupon, groupId: value === 'none' ? null : Number(value) })}>
                  <SelectTrigger className="w-full bg-background border border-input rounded-lg px-4 py-3 h-9">
                    <SelectValue placeholder="Select group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No group</SelectItem>
                    {couponGroups.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Discount type</label>
                  <Select value={editingCoupon.discountType} onValueChange={(value) => setEditingCoupon({ ...editingCoupon, discountType: value as any })}>
                    <SelectTrigger className="w-full bg-background border border-input rounded-lg px-4 py-3 h-9">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Discount %</label>
                  <div className="relative">
                    <input
                      required
                      type="number"
                      min="1"
                      max="100"
                      placeholder="20"
                      className="w-full bg-background border border-input rounded-lg pl-4 pr-8 py-3 font-semibold focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                      value={editingCoupon.discountValue || ''}
                      onChange={e => setEditingCoupon({ ...editingCoupon, discountValue: Number(e.target.value) })}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Usage limit</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Leave empty for unlimited"
                  className="w-full bg-background border border-input rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  value={editingCoupon.maxUses || ''}
                  onChange={e => setEditingCoupon({ ...editingCoupon, maxUses: e.target.value === '' ? null : Number(e.target.value) })}
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">One time use per user</label>
                <button
                  type="button"
                  onClick={() => setEditingCoupon({ ...editingCoupon, oneTimePerUser: !editingCoupon.oneTimePerUser })}
                  className={`w-10 h-6 rounded-full transition-colors relative ${editingCoupon.oneTimePerUser ? 'bg-primary' : 'bg-muted'}`}
                >
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${editingCoupon.oneTimePerUser ? 'left-5' : 'left-1'}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Start date</label>
                  <input
                    type="date"
                    className="w-full bg-background border border-input rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all cursor-pointer"
                    value={editingCoupon.startDate || ''}
                    onChange={e => setEditingCoupon({ ...editingCoupon, startDate: e.target.value || null })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Expiry date</label>
                  <input
                    type="date"
                    className="w-full bg-background border border-input rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all cursor-pointer"
                    value={editingCoupon.expiresAt ? String(editingCoupon.expiresAt).slice(0, 10) : ''}
                    onChange={e => setEditingCoupon({ ...editingCoupon, expiresAt: e.target.value || null })}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Restrict to plan</label>
                <Select value={editingCoupon.restrictedToPlan} onValueChange={(value) => setEditingCoupon({ ...editingCoupon, restrictedToPlan: value })}>
                  <SelectTrigger className="w-full bg-background border border-input rounded-lg px-4 py-3 h-9">
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Plans</SelectItem>
                    <SelectItem value="Free">Free</SelectItem>
                    <SelectItem value="Premium">Premium</SelectItem>
                    <SelectItem value="Pro">Pro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Restrict to email</label>
                <input
                  type="email"
                  placeholder="Only this user can redeem. Leave empty for public use"
                  className="w-full bg-background border border-input rounded-lg px-4 py-3 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                  value={editingCoupon.restrictedToEmail || ''}
                  onChange={e => setEditingCoupon({ ...editingCoupon, restrictedToEmail: e.target.value })}
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleDeleteCoupon(editingCoupon.id)}
                  className="px-4 py-3 bg-destructive/10 text-destructive font-medium rounded-xl hover:bg-destructive/20 transition-all flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCoupon(null)}
                  className="flex-1 px-4 py-3 bg-muted text-foreground font-medium rounded-xl hover:bg-muted/80 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

{/* Ticket Conversation (admin side) with Guide / Auto Messages / User Profile panel */}
      {activePanelTicket && (
        <TicketConversation
          ticket={activePanelTicket}
          messages={panelMessages}
          viewAs="admin"
          currentUserName={activePanelTicket?.userName || 'Support'}
          onClose={() => setActivePanelTicket(null)}
          onCloseTicket={handleCloseTicket}
          onSendMessage={handleAdminSendMessage}
          sending={sendingAdminMessage}
          expanded={chatExpanded}
          onToggleExpand={() => setChatExpanded(!chatExpanded)}
          onUserNameClick={() => {
            setAdminPanelTab('user-profile');
            if (activePanelTicket?.userId) handleViewUserData(activePanelTicket.userId);
          }}
          leftPanel={
            <div className="flex flex-col h-full min-h-0">
              <div className="flex items-center gap-1 p-2 border-b border-border flex-shrink-0">
                {([
                  { id: 'guide', label: 'Guide', icon: BookOpen },
                  { id: 'auto-messages', label: 'Auto Messages', icon: MessageSquare },
                  { id: 'user-profile', label: 'User', icon: User },
                ] as const).map(t => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setAdminPanelTab(t.id);
                      if (t.id === 'user-profile' && activePanelTicket?.userId) handleViewUserData(activePanelTicket.userId);
                    }}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      adminPanelTab === t.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <t.icon className="w-3.5 h-3.5" />
                    {t.id === 'auto-messages' ? 'Auto Msgs' : t.label}
                  </button>
                ))}
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                {adminPanelTab === 'guide' && (
                  <div className="flex h-full min-h-0">
                    <div className="w-[38%] min-w-[150px] border-r border-border overflow-y-auto p-2 space-y-1 flex-shrink-0">
                      {GUIDE_CATS.map(cat => (
                        <div key={cat.id}>
                          <button
                            onClick={() => setGuideExpandedCats(prev => {
                              const next = new Set(prev);
                              if (next.has(cat.id)) next.delete(cat.id);
                              else next.add(cat.id);
                              return next;
                            })}
                            className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-left"
                          >
                            <span className="text-xs font-bold">{cat.label}</span>
                            {guideExpandedCats.has(cat.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                          {guideExpandedCats.has(cat.id) && cat.guides.map(g => (
                            <button
                              key={g.id}
                              onClick={() => setSelectedGuide({ catId: cat.id, guideId: g.id })}
                              className={`w-full text-left px-2 py-1.5 pl-4 rounded-lg text-xs transition-colors ${
                                selectedGuide?.guideId === g.id && selectedGuide?.catId === cat.id
                                  ? 'bg-primary/10 text-primary font-semibold'
                                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                              }`}
                            >
                              {g.title}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 min-w-0 overflow-y-auto p-3 space-y-3">
                      {(() => {
                        const cat = GUIDE_CATS.find(c => c.id === selectedGuide?.catId);
                        const guide = cat?.guides.find(g => g.id === selectedGuide?.guideId);
                        if (!guide) return <p className="text-xs text-muted-foreground italic">Select a guide from the left.</p>;
                        return (
                          <div>
                            <h4 className="text-sm font-bold mb-2">{guide.title}</h4>
                            {guide.sections.map((s, i) => (
                              <div key={i} className="bg-muted/40 rounded-xl p-3 mb-2">
                                <div className="flex items-center justify-between mb-1">
                                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{s.heading}</p>
                                  <button
                                    onClick={() => {
                                      navigator.clipboard.writeText(s.heading + '\n\n' + s.body).then(() => {
                                        toast({ title: 'Copied', description: 'Guide section copied to clipboard' });
                                      });
                                    }}
                                    className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
                                  >
                                    Copy
                                  </button>
                                </div>
                                <p className="text-xs whitespace-pre-wrap">{s.body.replace(/14 days/g, `${settings.refund_days || '14'} days`)}</p>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {adminPanelTab === 'auto-messages' && (
                  <div className="flex h-full min-h-0">
                    <div className="w-[38%] min-w-[150px] border-r border-border overflow-y-auto p-2 space-y-1 flex-shrink-0">
                      {AUTO_MSG_CATS.map(cat => (
                        <div key={cat.id}>
                          <button
                            onClick={() => setAutoMsgExpandedCats(prev => {
                              const next = new Set(prev);
                              if (next.has(cat.id)) next.delete(cat.id);
                              else next.add(cat.id);
                              return next;
                            })}
                            className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-muted transition-colors text-left"
                          >
                            <span className="text-xs font-bold">{cat.label}</span>
                            {autoMsgExpandedCats.has(cat.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </button>
                          {autoMsgExpandedCats.has(cat.id) && cat.messages.map(m => (
                            <button
                              key={m.id}
                              onClick={() => setSelectedAutoMsg({ catId: cat.id, msgId: m.id })}
                              className={`w-full text-left px-2 py-1.5 pl-4 rounded-lg text-xs transition-colors ${
                                selectedAutoMsg?.msgId === m.id && selectedAutoMsg?.catId === cat.id
                                  ? 'bg-primary/10 text-primary font-semibold'
                                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                              }`}
                            >
                              {m.title}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div className="flex-1 min-w-0 overflow-y-auto p-3">
                      {(() => {
                        const cat = AUTO_MSG_CATS.find(c => c.id === selectedAutoMsg?.catId);
                        const msg = cat?.messages.find(m => m.id === selectedAutoMsg?.msgId);
                        if (!msg) return <p className="text-xs text-muted-foreground italic">Select a message from the left.</p>;
                        const preview = AUTO_MSG_TEMPLATES[msg.id]?.({ userName: activePanelTicket?.userName || 'there', ticketType: activePanelTicket?.type || 'support' }) || '';
                        const hasMarkup = preview.includes('{userName}') || preview.includes('{ticketType}');
                        return (
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">When to send</p>
                              <p className="text-xs">{msg.when}</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">Purpose</p>
                              <p className="text-xs">{msg.purpose}</p>
                            </div>
                            <div>
                              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">
                                {hasMarkup ? 'Preview (interpolated for this ticket)' : 'Template'}
                              </p>
                              <p className="text-xs whitespace-pre-wrap bg-muted/40 rounded-xl p-3">{preview}</p>
                            </div>
                            <button
                              onClick={() => handleAdminSendMessage(preview)}
                              disabled={sendingAdminMessage || activePanelTicket?.status === 'closed'}
                              className="w-full px-3 py-2 bg-primary text-primary-foreground rounded-xl text-xs font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                              {sendingAdminMessage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                              Send to {activePanelTicket?.userName || 'user'}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {adminPanelTab === 'user-profile' && (
                  <div className="h-full overflow-y-auto">
                    {!activePanelTicket?.userId ? (
                      <p className="text-xs text-muted-foreground italic p-4">No user attached to this ticket.</p>
                    ) : !userFullDetails ? (
                      <div className="h-full flex items-center justify-center">
                        <Loader2 className="w-5 h-5 animate-spin text-primary" />
                      </div>
                    ) : (
                      <UserDetailView
                        details={userFullDetails}
                        onUpdated={refetchPanelUser}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          }
        />
      )}

      {activeTab === 'settings' && (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
          <div className="rounded-2xl bg-card border border-border p-6 flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'hsl(var(--label-purple) / 0.12)' }}>
              <Settings className="w-5 h-5" style={{ color: 'hsl(var(--label-purple))' }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold">System Settings</h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Server-enforced controls — pricing, usage limits, signup rules and maintenance mode apply within seconds of saving.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl bg-card border border-border overflow-hidden flex flex-col md:flex-row min-h-[480px]">
              <div className="w-full md:w-56 border-b md:border-b-0 md:border-r border-border p-4 space-y-2 bg-muted/20">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-lg" />)}
              </div>
              <div className="flex-1 p-6 space-y-4">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-20 w-full rounded-xl" />
                <Skeleton className="h-20 w-full rounded-xl" />
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-card border border-border overflow-hidden flex flex-col md:flex-row min-h-[480px]">
              <div className="w-full md:w-56 border-b md:border-b-0 md:border-r border-border p-3 space-y-1 flex-shrink-0 bg-muted/20">
                {SETTINGS_GROUPS.map(group => {
                  const GroupIcon = group.icon;
                  const isActive = activeSettingGroup === group.id;
                  const count = group.id === 'notifications' && (settings['announcement_banner'] ?? 'false') !== 'true' ? group.rows.length - 1 : group.rows.length;
                  return (
                    <button
                      key={group.id}
                      onClick={() => setActiveSettingGroup(group.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all duration-200 ${isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
                    >
                      <GroupIcon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-primary-foreground' : ''}`} />
                      <span className="text-sm font-medium flex-1 truncate">{group.label}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'}`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 min-w-0 flex flex-col">
                {(() => {
                  const group = SETTINGS_GROUPS.find(g => g.id === activeSettingGroup) || SETTINGS_GROUPS[0];
                  const GroupIcon = group.icon;
                  const accentMap: Record<string, string> = {
                    'platform-access': 'label-red',
                    'pricing': 'label-green',
                    'usage-limits': 'label-orange',
                    'notifications': 'label-blue',
                    'support': 'label-purple',
                  };
                  const accent = accentMap[group.id] || 'label-purple';
                  const visibleRows = group.rows.filter(r => !(r.key === 'announcement_banner_message' && (settings['announcement_banner'] ?? 'false') !== 'true'));
                  return (
                    <>
                      <div className="px-6 py-5 border-b border-border flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `hsl(var(--${accent}) / 0.12)` }}>
                          <GroupIcon className="w-4 h-4" style={{ color: `hsl(var(--${accent}))` }} />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold">{group.label}</h3>
                          <p className="text-xs text-muted-foreground">{group.description}</p>
                        </div>
                      </div>
                      <div className="flex-1 p-6">
                        <div className="max-w-2xl space-y-4">
                          {visibleRows.map(row => {
                            const current = settings[row.key] ?? row.defaultValue;
                            return (
                              <div key={row.key} className="p-4 bg-card border border-border rounded-xl">
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                                      {row.label}
                                      {savingSetting === row.key && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{row.description}</p>
                                  </div>
                                  <div className={`flex-shrink-0 ${row.type === 'text' ? 'w-full sm:w-72' : row.type === 'boolean' ? 'w-auto' : 'w-44'}`}>
                                    {row.type === 'boolean' ? (
                                      <button
                                        onClick={() => handleUpdateSetting(row, current === 'true' ? 'false' : 'true')}
                                        disabled={savingSetting === row.key}
                                        className={`w-11 h-6 rounded-full transition-all duration-200 relative flex-shrink-0 disabled:opacity-50 ${current === 'true' ? 'bg-primary' : 'bg-muted'}`}
                                      >
                                        <div className={`w-5 h-5 bg-white rounded-full shadow absolute top-0.5 transition-transform duration-200 ${current === 'true' ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                      </button>
                                    ) : row.type === 'select' ? (
                                      <Select value={current} onValueChange={v => handleUpdateSetting(row, v)} disabled={savingSetting === row.key}>
                                        <SelectTrigger className="w-full bg-muted/30 border border-border rounded-lg text-sm h-10">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {row.options?.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <input
                                          key={`${row.key}-${current}`}
                                          type={row.type === 'currency' || row.type === 'number' ? 'number' : 'text'}
                                          step="any"
                                          min="0"
                                          defaultValue={current}
                                          placeholder={row.defaultValue}
                                          onBlur={e => { const v = e.target.value.trim(); if (v && v !== current) handleUpdateSetting(row, v); }}
                                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                          className="w-full bg-muted/30 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                                        />
                                        {row.suffix && <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">{row.suffix}</span>}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                {row.type === 'boolean' && (
                                  <p className={`text-[11px] font-medium mt-2 ${current === 'true' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>{current === 'true' ? 'Enabled' : 'Disabled'}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;