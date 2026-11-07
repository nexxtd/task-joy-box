import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NavigationType,
  UNSAFE_LocationContext,
  UNSAFE_NavigationContext,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { ArrowLeftRight, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { APP_PAGES, findAppPage } from '@/lib/appPages';
import { SPLIT_OPEN_EVENT, type SplitOpenDetail } from '@/lib/splitPresets';
import { useAuth } from '@/context/AuthContext';
import { useAdminPreview } from '@/hooks/useAdminPreview';
import { useLanguage } from '@/context/LanguageContext';
import { PageSkeleton } from '@/components/PageSkeleton';

/**
 * Split-screen sizing limits. The divider can be dragged between these
 * fractions of the content area.
 */
export const MIN_RATIO = 0.2;
export const MAX_RATIO = 0.8;

/** @deprecated Drag-to-split was replaced by the split-screen button. */
export const DRAG_THRESHOLD = 64;
/** @deprecated Drag-to-split was replaced by the split-screen button. */
export const HANDLE_HOT_ZONE = 32;

type Side = 'left' | 'right';

interface MemLocation {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
  key: string;
}

const initialLocation = (path: string): MemLocation => ({
  pathname: path,
  search: '',
  hash: '',
  state: null,
  key: 'split-0',
});

/**
 * Renders a second app page with its own location/navigation contexts.
 *
 * A nested <Router> is illegal inside the app's BrowserRouter, so this
 * provides the two contexts react-router's hooks read instead. Links and
 * navigate() calls inside the pane therefore stay inside the pane and never
 * touch the real URL.
 */
const SplitPage: React.FC<{ path: string }> = ({ path }) => {
  const [location, setLocation] = useState<MemLocation>(() => initialLocation(path));
  const locationRef = useRef(location);
  locationRef.current = location;
  const keyRef = useRef(0);

  const toLocation = useCallback((to: any, state?: unknown): MemLocation => {
    const current = locationRef.current;
    let pathname = current.pathname;
    let search = '';
    let hash = '';
    if (typeof to === 'string') {
      try {
        const url = new URL(to, `http://split.local${current.pathname}${current.search}${current.hash}`);
        pathname = url.pathname;
        search = url.search;
        hash = url.hash;
      } catch {
        pathname = to;
      }
    } else if (to && typeof to === 'object') {
      pathname = to.pathname ?? current.pathname;
      search = to.search ?? '';
      hash = to.hash ?? '';
    }
    keyRef.current += 1;
    return { pathname, search, hash, state: state ?? null, key: `split-${keyRef.current}` };
  }, []);

  const navigate = useCallback(
    (to: any, state?: unknown) => {
      const next = toLocation(to, state);
      locationRef.current = next;
      setLocation(next);
    },
    [toLocation],
  );

  const navigator = useMemo(
    () => ({
      createHref: (to: any) =>
        typeof to === 'string'
          ? to
          : `${to?.pathname ?? ''}${to?.search ?? ''}${to?.hash ?? ''}`,
      encodeLocation: (to: any) => {
        const next = toLocation(to);
        return { pathname: next.pathname, search: next.search, hash: next.hash };
      },
      go: () => {
        /* no history stack inside the pane */
      },
      push: navigate,
      replace: navigate,
    }),
    [navigate, toLocation],
  );

  const navigationContext = useMemo(
    () => ({ basename: '', navigator, static: false, future: { v7_relativeSplatPath: false } }),
    [navigator],
  );
  const locationContext = useMemo(
    () => ({ location, navigationType: NavigationType.Pop }),
    [location],
  );

  // Pages are flat routes; if a pane navigates to an unknown sub-path, keep
  // showing the page it was opened with.
  const def = findAppPage(location.pathname) ?? findAppPage(path);
  if (!def) return null;
  const Page = def.component;

  return (
    <UNSAFE_NavigationContext.Provider value={navigationContext}>
      <UNSAFE_LocationContext.Provider value={locationContext}>
        <Suspense fallback={<PageSkeleton />}>
          <Page />
        </Suspense>
      </UNSAFE_LocationContext.Provider>
    </UNSAFE_NavigationContext.Provider>
  );
};

const PaneHeader: React.FC<{
  side: Side;
  icon?: LucideIcon;
  label: string;
  onClose: () => void;
  closeTitle: string;
}> = ({ side, icon: Icon, label, onClose, closeTitle }) => (
  <div
    className={`flex h-8 flex-shrink-0 items-center gap-1.5 border-b border-border bg-muted/40 ${
      side === 'left' ? 'pl-2 pr-9' : 'pl-9 pr-2'
    }`}
  >
    {Icon ? <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" /> : null}
    <span className="min-w-0 truncate text-[11px] font-semibold text-foreground">{label}</span>
    <button
      type="button"
      onClick={onClose}
      title={closeTitle}
      aria-label={closeTitle}
      className="ml-auto flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  </div>
);

/**
 * Split-screen shell.
 *
 * The current route is rendered as `children`. A small button at the top of
 * every page opens a two-rectangle popover: choosing a half parks the current
 * page there and opens a page picker on the other half. The same button can
 * be used later to change either half. The divider between panes is
 * resizable.
 */
const SplitView: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { viewAsUser } = useAdminPreview();

  const isAdminView = !!user?.isAdmin && !viewAsUser;
  const isPaid = !!user?.subscriptionTier && user.subscriptionTier !== 'free';

  /** Which half the current page occupies. null = not split. */
  const [primarySide, setPrimarySide] = useState<Side | null>(null);
  /** Path of the other page. null while nothing has been chosen yet. */
  const [secondaryPath, setSecondaryPath] = useState<string | null>(null);
  /** Half currently showing the page picker, if any. */
  const [pickerSide, setPickerSide] = useState<Side | null>(null);
  const [ratio, setRatio] = useState(0.5);
  const [popoverOpen, setPopoverOpen] = useState(false);

  /** A shortcut/preset waiting for the router to finish navigating. */
  const pendingSplitRef = useRef<SplitOpenDetail | null>(null);
  /** Navigating to a replacement page for the half that owns the URL. */
  const pendingPrimaryRef = useRef<{ path: string; side: Side } | null>(null);
  const resizeRef = useRef(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const splitButtonRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef(location.pathname);

  const closeSplit = useCallback(() => {
    setPrimarySide(null);
    setSecondaryPath(null);
    setPickerSide(null);
    setPopoverOpen(false);
  }, []);

  const cancelPicker = useCallback(() => {
    setPickerSide(null);
    // No second page chosen yet: leaving the picker also leaves split mode.
    if (!secondaryPath) setPrimarySide(null);
  }, [secondaryPath]);

  const chooseSide = (side: Side) => {
    setPopoverOpen(false);
    if (primarySide === null) {
      // Move the current page to the chosen half and offer pages on the other.
      setPrimarySide(side);
      setSecondaryPath(null);
      setPickerSide(side === 'left' ? 'right' : 'left');
      setRatio(0.5);
      return;
    }
    // Already split: change the page on the chosen half.
    setPickerSide(side);
  };

  // Navigating anywhere else (sidebar, shortcut, in-page link) ends split mode.
  // Exceptions finish a pending split or replace the page on the URL-owning
  // half without dropping the second pane.
  useEffect(() => {
    if (pathRef.current === location.pathname) return;
    pathRef.current = location.pathname;

    const replacement = pendingPrimaryRef.current;
    if (replacement && replacement.path === location.pathname) {
      pendingPrimaryRef.current = null;
      pendingSplitRef.current = null;
      setPrimarySide(replacement.side);
      setPickerSide(null);
      return;
    }
    pendingPrimaryRef.current = null;

    const pending = pendingSplitRef.current;
    if (pending && pending.primaryPath === location.pathname) {
      pendingSplitRef.current = null;
      setPrimarySide(pending.side === 'right' ? 'right' : 'left');
      setSecondaryPath(pending.secondaryPath);
      setPickerSide(null);
      setRatio(0.5);
      return;
    }
    pendingSplitRef.current = null;

    setPrimarySide(null);
    setSecondaryPath(null);
    setPickerSide(null);
  }, [location.pathname]);

  // Split-screen shortcuts announce themselves with an event so they work
  // from any page without importing router internals.
  useEffect(() => {
    const onOpenSplit = (event: Event) => {
      const detail = (event as CustomEvent<SplitOpenDetail>).detail;
      if (!detail?.primaryPath || !detail?.secondaryPath) return;
      if (detail.primaryPath === detail.secondaryPath) return;
      const nextSide: Side = detail.side === 'right' ? 'right' : 'left';
      if (location.pathname === detail.primaryPath) {
        pendingSplitRef.current = null;
        setPrimarySide(nextSide);
        setSecondaryPath(detail.secondaryPath);
        setPickerSide(null);
        setRatio(0.5);
        setPopoverOpen(false);
        return;
      }
      pendingSplitRef.current = { ...detail, side: nextSide };
      navigate(detail.primaryPath);
    };
    window.addEventListener(SPLIT_OPEN_EVENT, onOpenSplit as EventListener);
    return () => window.removeEventListener(SPLIT_OPEN_EVENT, onOpenSplit as EventListener);
  }, [location.pathname, navigate]);

  // Escape closes the popover first, then cancels the page picker.
  useEffect(() => {
    if (!popoverOpen && !pickerSide) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (popoverOpen) {
        setPopoverOpen(false);
        return;
      }
      cancelPicker();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popoverOpen, pickerSide, cancelPicker]);

  // Touch/keyboard users have no hover-out, so tapping outside closes it.
  useEffect(() => {
    if (!popoverOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = splitButtonRef.current;
      if (root && !root.contains(event.target as Node)) setPopoverOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [popoverOpen]);

  const primaryDef = findAppPage(location.pathname);
  const primaryLabel = primaryDef ? t(primaryDef.label) : t('This page');

  const isComingSoon = (path: string) =>
    path === '/documents' ||
    (!isAdminView && (path === '/calendar' || path === '/collaboration'));

  const currentIsComingSoon = isComingSoon(location.pathname);

  // Pages offered in the picker, excluding the two panes already in use.
  const options = useMemo(
    () =>
      APP_PAGES.filter(
        page =>
          page.inSplitPicker &&
          page.path !== location.pathname &&
          page.path !== secondaryPath &&
          (!page.paidOnly || isPaid),
      ),
    [location.pathname, secondaryPath, isPaid],
  );

  const secondaryDef = secondaryPath ? findAppPage(secondaryPath) : undefined;

  /** Label shown for a pane (used in the popover and picker copy). */
  const paneLabel = (side: Side): string => {
    if (primarySide === side) return primaryLabel;
    if (pickerSide === side) return t('Choose a page');
    if (secondaryPath) return secondaryDef ? t(secondaryDef.label) : t('This page');
    // Not split yet — both choices mean “move this page to that half”.
    return primaryLabel;
  };

  const selectPage = (path: string) => {
    const target: Side = pickerSide ?? 'right';
    setPickerSide(null);
    if (target === primarySide) {
      // The page on the URL-owning half is being replaced, so navigate and
      // keep the second pane alive.
      if (path === location.pathname) return;
      pendingPrimaryRef.current = { path, side: target };
      navigate(path);
      return;
    }
    setSecondaryPath(path);
  };

  const closePrimary = () => {
    const next = secondaryPath;
    closeSplit();
    if (next) navigate(next);
  };

  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic/unsupported pointer capture — resize still works */
    }
    resizeRef.current = true;
  };

  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeRef.current) return;
    const el = splitRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width) return;
    const next = (event.clientX - rect.left) / rect.width;
    setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, next)));
  };

  const onResizeEnd = () => {
    resizeRef.current = false;
  };

  const renderPicker = (side: Side) => {
    const otherSide: Side = side === 'left' ? 'right' : 'left';
    const otherLabel = paneLabel(otherSide);
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card/40">
        <div
          className={`flex h-8 flex-shrink-0 items-center gap-1.5 border-b border-border bg-muted/40 ${
            side === 'left' ? 'pl-2 pr-9' : 'pl-9 pr-2'
          }`}
        >
          <ArrowLeftRight className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
          <span className="text-[11px] font-semibold text-foreground">{t('Split screen')}</span>
          <button
            type="button"
            onClick={cancelPicker}
            className="ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {t('Cancel')}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-3 text-xs text-muted-foreground">
            {t('Choose a page for the {{side}} half to open next to {{name}}.', {
              side: t(side === 'left' ? 'left' : 'right'),
              name: otherLabel,
            })}
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {options.map(page => {
              const Icon = page.icon;
              const soon = isComingSoon(page.path);
              return (
                <button
                  key={page.path}
                  type="button"
                  onClick={() => selectPage(page.path)}
                  className="group flex items-center gap-2.5 rounded-xl border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-foreground">
                      {t(page.label)}
                    </span>
                    {soon ? (
                      <span className="block text-[10px] font-medium text-amber-600 dark:text-amber-400">
                        {t('Coming soon')}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderPane = (side: Side) => {
    if (pickerSide === side) return renderPicker(side);

    if (primarySide === side) {
      return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PaneHeader
            side="left"
            icon={primaryDef?.icon}
            label={primaryLabel}
            onClose={closePrimary}
            closeTitle={t('Exit split screen')}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </div>
      );
    }

    if (secondaryPath) {
      return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PaneHeader
            side="right"
            icon={secondaryDef?.icon}
            label={secondaryDef ? t(secondaryDef.label) : t('This page')}
            onClose={closeSplit}
            closeTitle={t('Exit split screen')}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <SplitPage key={secondaryPath} path={secondaryPath} />
          </div>
        </div>
      );
    }

    return renderPicker(side);
  };

  const splitButton = !currentIsComingSoon ? (
    <div
      ref={splitButtonRef}
      className="absolute left-1/2 top-0 z-50 flex -translate-x-1/2 flex-col items-center"
      onMouseEnter={() => setPopoverOpen(true)}
      onMouseLeave={() => setPopoverOpen(false)}
    >
      <button
        type="button"
        aria-label={t('Split screen')}
        aria-haspopup="menu"
        aria-expanded={popoverOpen}
        title={t('Split screen')}
        onClick={() => setPopoverOpen(true)}
        onFocus={() => setPopoverOpen(true)}
        className="group flex h-6 w-14 touch-none select-none items-center justify-center rounded-b-lg border border-t-0 border-border bg-card/90 text-muted-foreground opacity-80 shadow-sm backdrop-blur transition-all hover:bg-card hover:text-foreground hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" />
      </button>

      <div
        className={`absolute left-1/2 top-full flex -translate-x-1/2 gap-2 transition-all ${
          popoverOpen
            ? 'visible translate-y-0 opacity-100'
            : 'invisible -translate-y-1 opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={() => chooseSide('left')}
          aria-label={primarySide === null ? t('Move this page to the left half') : t('Change the left page')}
          title={primarySide === null ? t('Move this page to the left half') : t('Change the left page')}
          className={`h-24 w-[72px] rounded-xl border-2 bg-card shadow-lg transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
            primarySide === 'left' ? 'border-primary/60 bg-primary/5' : 'border-border'
          }`}
        />
        <button
          type="button"
          onClick={() => chooseSide('right')}
          aria-label={primarySide === null ? t('Move this page to the right half') : t('Change the right page')}
          title={primarySide === null ? t('Move this page to the right half') : t('Change the right page')}
          className={`h-24 w-[72px] rounded-xl border-2 bg-card shadow-lg transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
            primarySide === 'right' ? 'border-primary/60 bg-primary/5' : 'border-border'
          }`}
        />
      </div>
    </div>
  ) : null;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {primarySide === null ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {children}
        </div>
      ) : (
        <div ref={splitRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div
            style={{ width: `${ratio * 100}%` }}
            className="flex min-h-0 min-w-0 flex-shrink-0 flex-col overflow-hidden"
          >
            {renderPane('left')}
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t('Resize split screen')}
            aria-valuemin={Math.round(MIN_RATIO * 100)}
            aria-valuemax={Math.round(MAX_RATIO * 100)}
            aria-valuenow={Math.round(ratio * 100)}
            tabIndex={0}
            onPointerDown={onResizeStart}
            onPointerMove={onResizeMove}
            onPointerUp={onResizeEnd}
            onPointerCancel={onResizeEnd}
            onKeyDown={event => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                setRatio(value => Math.max(MIN_RATIO, value - 0.02));
              } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                setRatio(value => Math.min(MAX_RATIO, value + 0.02));
              }
            }}
            className="relative z-10 w-1.5 flex-shrink-0 cursor-col-resize touch-none bg-border/70 transition-colors hover:bg-primary/60 focus-visible:bg-primary focus-visible:outline-none"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {renderPane('right')}
          </div>
        </div>
      )}

      {splitButton}
    </div>
  );
};

export default SplitView;
