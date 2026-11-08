import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

/**
 * App-wide error boundary.
 *
 * Why this exists: every page is `lazy()`-loaded. If a chunk fails to fetch
 * (flaky network, or a redeploy changed the hashed asset URLs while the
 * browser still had the old shell) — or a page throws during render — there
 * was no boundary anywhere, so React unmounted the entire tree and the user
 * got a blank white page. With this boundary, a crashing page is replaced by
 * a readable fallback while the sidebar/layout stay intact.
 *
 * Chunk-load failures are almost always a stale-bundle problem, so the
 * boundary auto-reloads once (with a 2-minute cooldown so a persistently
 * broken chunk can't cause a reload loop). Render errors get a manual
 * "Try again" (state reset) and a hard reload option.
 */

const CHUNK_RELOAD_KEY = "chunk_reload_attempted_at";
const AUTO_RELOAD_COOLDOWN_MS = 2 * 60 * 1000;

const CHUNK_ERROR_PATTERNS = [
  /loading chunk [\w-]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /dynamically imported module/i,
  /error loading dynamically imported module/i,
  /chunkloaderror/i,
  /unable to preload css/i,
];

export const isChunkLoadError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  const name = String((error as { name?: unknown }).name ?? "");
  const message = String((error as { message?: unknown }).message ?? error);
  if (/chunkloaderror/i.test(name)) return true;
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
};

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * When this value changes (e.g. location.pathname), the boundary resets and
   * renders its children again. Lets the user navigate away from a crashed
   * page via the sidebar without a full reload.
   */
  resetKey?: string;
  /** "page" fits inside the app layout's <Outlet />; "app" is full-screen. */
  variant?: "page" | "app";
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
    if (isChunkLoadError(error)) {
      // One automatic reload per cooldown window: the overwhelmingly common
      // cause is a stale bundle after a deploy, which a reload fixes.
      try {
        const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
        if (!Number.isFinite(last) || Date.now() - last > AUTO_RELOAD_COOLDOWN_MS) {
          sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
          window.location.reload();
        }
      } catch {
        // sessionStorage unavailable (private mode) — fall through to fallback UI.
      }
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleTryAgain = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkLoadError(error);
    const fullScreen = this.props.variant === "app";

    return (
      <div
        className={
          fullScreen
            ? "min-h-dvh w-full flex flex-col items-center justify-center gap-4 bg-background text-center px-6"
            : "flex-1 min-h-0 overflow-y-auto bg-background flex flex-col items-center justify-center gap-4 text-center px-6 py-16"
        }
        role="alert"
      >
        <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
          <AlertTriangle className="w-6 h-6 text-destructive" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">
          {chunk ? "This page couldn't load" : "Something went wrong"}
        </h2>
        <p className="text-sm text-muted-foreground max-w-md">
          {chunk
            ? "The app was updated or your connection hiccuped while fetching this page. Reloading usually fixes it."
            : "An unexpected error occurred while rendering this page. Your data is safe — try again, or reload the app."}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={this.handleReload}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Reload
          </button>
          {!chunk && (
            <button
              onClick={this.handleTryAgain}
              className="text-sm text-muted-foreground underline underline-offset-2"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }
}
