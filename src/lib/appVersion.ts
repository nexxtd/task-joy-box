export const APP_VERSION = "0.7.2";
export const APP_BUILD_DATE = "2026-09-09";

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

// ---------------------------------------------------------------------------
// Admin-added updates (Update Log) + per-user "What's New" seen tracking.
// The built-in CHANGELOG above is the base. Admins can append entries from
// the Admin panel; those are stored in localStorage (same browser, survives
// refresh) and mirrored to the `app_changelog_extra` system setting so other
// browsers pick them up via GET /api/updates. Everything reads through
// getCombinedChangelog() so Support, WhatsNew and the Admin panel agree.
// ---------------------------------------------------------------------------

export const ADMIN_CHANGELOG_KEY = "admin_changelog_v1";
export const CHANGELOG_EVENT = "app-changelog-change";

const MAX_ADMIN_ENTRIES = 50;
const MAX_CHANGES_PER_ENTRY = 30;

function sanitizeEntry(raw: any): ChangelogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const version = String(raw.version || "").trim().slice(0, 20);
  if (!version) return null;
  const date = String(raw.date || "").trim().slice(0, 20) || new Date().toISOString().slice(0, 10);
  const title = String(raw.title || "What's New").slice(0, 80);
  const changes = Array.isArray(raw.changes)
    ? raw.changes
        .map((c: any) => String(c ?? "").trim())
        .filter(Boolean)
        .slice(0, MAX_CHANGES_PER_ENTRY)
        .map((c: string) => c.slice(0, 500))
    : [];
  if (changes.length === 0) return null;
  return { version, date, title, changes };
}

export function readAdminChangelog(): ChangelogEntry[] {
  try {
    const raw = localStorage.getItem(ADMIN_CHANGELOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeEntry)
      .filter((e: ChangelogEntry | null): e is ChangelogEntry => e !== null)
      .slice(0, MAX_ADMIN_ENTRIES);
  } catch {
    return [];
  }
}

/** Server-mirrored admin entries (written by Admin panel write-through). */
export function readServerChangelogCache(): ChangelogEntry[] {
  try {
    const raw = localStorage.getItem("admin_changelog_server_v1");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeEntry)
      .filter((e: ChangelogEntry | null): e is ChangelogEntry => e !== null)
      .slice(0, MAX_ADMIN_ENTRIES);
  } catch {
    return [];
  }
}

function dedupeByVersion(lists: ChangelogEntry[][]): ChangelogEntry[] {
  const seen = new Set<string>();
  const out: ChangelogEntry[] = [];
  for (const list of lists) {
    for (const e of list) {
      const key = e.version.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

/**
 * Every update newest-first: server-mirrored admin entries, then this-browser
 * admin entries, then the built-in CHANGELOG. Admin entries win on duplicate
 * versions. Stable date-desc sort keeps same-day order deterministic.
 */
export function getCombinedChangelog(
  adminLocal?: ChangelogEntry[],
  adminServer?: ChangelogEntry[]
): ChangelogEntry[] {
  const local = adminLocal ?? readAdminChangelog();
  const server = adminServer ?? readServerChangelogCache();
  const merged = dedupeByVersion([server, local, CHANGELOG]);
  merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return merged;
}

export function getLatestEntry(
  adminLocal?: ChangelogEntry[],
  adminServer?: ChangelogEntry[]
): ChangelogEntry {
  return getCombinedChangelog(adminLocal, adminServer)[0] ?? CHANGELOG[0];
}

/** Best-effort fetch of admin entries mirrored via GET /api/updates. */
export async function fetchServerChangelog(timeoutMs = 3500): Promise<ChangelogEntry[]> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch("/api/updates", { credentials: "include", signal: ctrl.signal });
      if (!res.ok) return [];
      const data = await res.json().catch(() => []);
      if (!Array.isArray(data)) return [];
      const clean = data
        .map(sanitizeEntry)
        .filter((e: ChangelogEntry | null): e is ChangelogEntry => e !== null)
        .slice(0, MAX_ADMIN_ENTRIES);
      try {
        localStorage.setItem("admin_changelog_server_v1", JSON.stringify(clean));
      } catch {}
      return clean;
    } finally {
      clearTimeout(tid);
    }
  } catch {
    return readServerChangelogCache();
  }
}

function notifyChangelogChanged() {
  try {
    window.dispatchEvent(new Event(CHANGELOG_EVENT));
  } catch {}
}

export function addAdminEntry(entry: { version: string; title?: string; changes: string[]; date?: string }): boolean {
  const clean = sanitizeEntry({
    version: entry.version,
    date: entry.date || new Date().toISOString().slice(0, 10),
    title: entry.title || "What's New",
    changes: entry.changes,
  });
  if (!clean) return false;
  try {
    const prev = readAdminChangelog().filter((e) => e.version.toLowerCase() !== clean.version.toLowerCase());
    const next = [clean, ...prev].slice(0, MAX_ADMIN_ENTRIES);
    localStorage.setItem(ADMIN_CHANGELOG_KEY, JSON.stringify(next));
    // Best-effort mirror so other browsers see it via GET /api/updates.
    try {
      fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key: "app_changelog_extra", value: JSON.stringify(next) }),
      }).catch(() => {});
    } catch {}
    notifyChangelogChanged();
    return true;
  } catch {
    return false;
  }
}

export function deleteAdminEntry(version: string): void {
  try {
    const key = String(version).toLowerCase();
    const next = readAdminChangelog().filter((e) => e.version.toLowerCase() !== key);
    localStorage.setItem(ADMIN_CHANGELOG_KEY, JSON.stringify(next));
    try {
      fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key: "app_changelog_extra", value: JSON.stringify(next) }),
      }).catch(() => {});
    } catch {}
    notifyChangelogChanged();
  } catch {}
}

/** Re-read the combined list when the admin list changes (same tab or another). */
export function subscribeChangelog(cb: () => void): () => void {
  const onCustom = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === ADMIN_CHANGELOG_KEY || e.key === "admin_changelog_server_v1") cb();
  };
  try {
    window.addEventListener(CHANGELOG_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
  } catch {}
  return () => {
    try {
      window.removeEventListener(CHANGELOG_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    } catch {}
  };
}

// --- Per-user "What's New" seen/pending tracking (legacy global keys kept) ---

const pendingKeyFor = (userId?: number | string | null) =>
  userId === undefined || userId === null ? "whats_new_pending" : `whats_new_pending_${userId}`;
const seenKeyFor = (userId?: number | string | null) =>
  userId === undefined || userId === null ? "whats_new_seen" : `whats_new_seen_${userId}`;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Pending version for this user (per-user key first, legacy global fallback). */
export function getWhatsNewPending(userId?: number | string | null): string | null {
  if (userId !== undefined && userId !== null) {
    const perUser = safeGet(pendingKeyFor(userId));
    if (perUser) return perUser;
  }
  return safeGet("whats_new_pending");
}

export function setWhatsNewPending(version: string, userId?: number | string | null): void {
  try {
    localStorage.setItem("whats_new_pending", version);
    if (userId !== undefined && userId !== null) {
      localStorage.setItem(pendingKeyFor(userId), version);
    }
  } catch {}
}

export function hasSeenVersion(version: string, userId?: number | string | null): boolean {
  if (userId !== undefined && userId !== null && safeGet(seenKeyFor(userId)) === version) return true;
  return safeGet("whats_new_seen") === version;
}

/** True when the user still needs the WhatsNew page for `version`. */
export function needsWhatsNew(version: string, userId?: number | string | null): boolean {
  if (hasSeenVersion(version, userId)) return false;
  const pending = getWhatsNewPending(userId);
  // Explicit pending flag, or a previously-seen older version (upgraded user
  // whose pending flag was set pre-login).
  if (pending === version) return true;
  const seen = userId !== undefined && userId !== null
    ? safeGet(seenKeyFor(userId)) ?? safeGet("whats_new_seen")
    : safeGet("whats_new_seen");
  return seen !== null && seen !== version;
}

export function markWhatsNewSeen(version: string, userId?: number | string | null): void {
  try {
    localStorage.setItem("whats_new_seen", version);
    localStorage.removeItem("whats_new_pending");
    if (userId !== undefined && userId !== null) {
      localStorage.setItem(seenKeyFor(userId), version);
      localStorage.removeItem(pendingKeyFor(userId));
    }
  } catch {}
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.7.2",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Fix: signup message now clarifies no account created until email verified",
      "Show verification link in UI when email delivery fails (Resend domain not verified)",
      "Pending signup correctly handled for all new registrations",
    ],
  },
  {
    version: "0.7.1",
    date: "2026-09-09",
    title: "What's New",
    changes: [
      "Fix: pending signup now correctly creates user on verification with trial handling",
      "2FA email code now logs to server and falls back when Resend domain not verified",
      "Settings 2FA toggle now reflects real status from /me",
    ],
  },
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
