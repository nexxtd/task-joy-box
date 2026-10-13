import { APP_VERSION, setWhatsNewPending } from "./appVersion";

/**
 * Boot-time version gate (item 7). Runs synchronously from main.tsx BEFORE
 * React renders anything, so a stale session from a previous bundle is
 * cleared before any page content or data loads.
 *
 * If the saved `app_version` is older than the live bundle:
 * - flags `whats_new_pending` so the user sees What's New after re-login,
 * - clears the old session + appearance caches immediately,
 * - fires a best-effort server logout (never awaited),
 * - clears old cached files (CacheStorage + legacy global projects cache).
 *
 * The gate then stamps the new version and records a one-shot session flag
 * so AuthProvider can skip the /me round-trip and land on Login within 1-2s.
 * Post-update login works with no refresh because `app_version` is already
 * current when the login completes.
 */
export function runVersionGate(): void {
  try {
    const stored = localStorage.getItem("app_version");
    if (stored === APP_VERSION) return;
    const hadSession = !!localStorage.getItem("auth_user_cache");
    if (stored !== null && hadSession) {
      try {
        setWhatsNewPending(APP_VERSION);
      } catch {}
      try {
        localStorage.removeItem("auth_user_cache");
        localStorage.removeItem("accentColor");
        localStorage.removeItem("accentHsl");
        // Legacy global (non per-user) projects cache from older bundles.
        localStorage.removeItem("projects_cache");
      } catch {}
      try {
        document.body.style.fontFamily = "";
        const r = document.documentElement.style;
        r.setProperty("--primary", "0 0% 0%");
        r.setProperty("--ring", "0 0% 0%");
      } catch {}
      try {
        fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
      } catch {}
      try {
        if (typeof caches !== "undefined" && caches.keys) {
          caches
            .keys()
            .then((keys) => {
              keys.forEach((k) => {
                caches.delete(k).catch(() => {});
              });
            })
            .catch(() => {});
        }
      } catch {}
      try {
        sessionStorage.setItem("version_session_cleared", "1");
      } catch {}
    }
    try {
      localStorage.setItem("app_version", APP_VERSION);
    } catch {}
  } catch {}
}

/** One-shot flag set by runVersionGate when it cleared a stale session. */
export function consumeVersionSessionCleared(): boolean {
  try {
    if (sessionStorage.getItem("version_session_cleared") === "1") {
      sessionStorage.removeItem("version_session_cleared");
      return true;
    }
  } catch {}
  return false;
}
