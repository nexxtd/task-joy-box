export const APP_VERSION = "0.7.0";
export const APP_BUILD_DATE = "2026-09-09";

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.7.0",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Signup now pending until email verified — no account created until you click the link",
      "2FA via email: enable in Settings → Privacy, code sent on every login",
      "Fixed verification email not sending (Resend domain fallback + SMTP fallback, logs link if undeliverable)",
    ],
  },
  {
    version: "0.6.2",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Fix: delete account now works (cascading deletes for all user data)",
      "All popups now in-app (no more native browser confirm/alert)",
      "Delete Account uses in-app two-step confirmation modal",
    ],
  },
  {
    version: "0.6.1",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Fix: removed stray � character (encoding fix in Settings)",
      "Email Notifications now really sends weekly AI summaries via Resend/SMTP",
      "Weekly cron at Mondays 08:00 UTC via /api/cron/weekly-ai-summary (Vercel Cron)",
      "Test your weekly email via GET /api/cron/weekly-ai-summary/test?email=you@example.com",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Fix: accent color no longer persists on login page after logout",
      "Fix: signup now requires email verification before login",
      "Login now blocks unverified accounts and offers resend link",
      "Verification wall shown for logged-in unverified users",
    ],
  },
  {
    version: "0.5.3",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Fix: /api/auth/me now returns 200 with null when logged out (no more 401 spam)",
      "Fix: silence AuthContext error log for expected Not authenticated",
      "Fix: COOP warning is harmless — Google GSI postMessage blocked is expected",
    ],
  },
  {
    version: "0.5.2",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Fix: signup 500 on Vercel — ensure email verification table exists",
      "Fix: silence AbortError spam on visibility sync (4 contexts)",
      "Google sign-in init warning is harmless (StrictMode double mount)",
    ],
  },
  {
    version: "0.5.1",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Fix: custom accent colour now requires Premium/Pro (free users see presets only)",
      "Server now enforces premium for custom colours, fonts and themes",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Email verification on signup with confirmation link",
      "Password reset now sends email via SMTP or Resend",
      "New /verify-email page to confirm address",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Goals, Habits and Whiteboard removed everywhere including tutorial and help",
      "Support guides and pricing now reflect Tasks, Notes, Tags and Projects only",
      "Projects add menu now shows only Tasks and Notes",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Dashboard & Insights now focus on Tasks, Notes, Tags and Projects only",
      "New note widgets added to Dashboard and Insights",
      "Goals and Habits removed from navigation and hidden from Dashboard/Insights",
      "Admin panel cleaned: whiteboard, goals and habit settings removed",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Deep Focus: images now upload reliably and persist after reload",
      "Deep Focus: completion flow fixed — Redo restarts the timer, Done marks the task complete and moves it to Done",
      "Navigation cleaned up: Habits and Goals hidden from sidebar (still available via direct link if needed)",
      "Performance and stability improvements",
    ],
  },
  {
    version: "0.1.0-beta",
    date: "2026-09-01",
    title: "Initial beta",
    changes: ["Task board, projects, notes, calendar and insights"],
  },
];
