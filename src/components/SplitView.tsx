import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  NavigationType,
  UNSAFE_LocationContext,
  UNSAFE_NavigationContext,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { ArrowLeftRight, GripHorizontal, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { APP_PAGES, findAppPage } from '@/lib/appPages';
import { useAuth } from '@/context/AuthContext';
import { useAdminPreview } from '@/hooks/useAdminPreview';
import { useLanguage } from '@/context/LanguageContext';
import { PageSkeleton } from '@/components/PageSkeleton';

/** How far (px) the handle must travel before the split is committed. */
const DRAG_THRESHOLD = 64;
/** The divider can never collapse a pane below 20% of the content area. */
const MIN_RATIO = 0.2;
const MAX_RATIO = 0.8;

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
  icon?: LucideIcon;
  label: string;
  onClose: () => void;
  closeTitle: string;
}> = ({ icon: Icon, label, onClose, closeTitle }) => (
  <div className="flex h-8 flex-shrink-0 items-center gap-1.5 border-b border-border bg-muted/40 px-2">
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
 * The current route is rendered as `children`. Dragging the grip at the top
 * centre of the content area (left or right) parks the current page on that
 * side and opens a page picker on the opposite side. Picking a page turns the
 * picker into the second pane. The divider between panes is resizable.
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
  const [side, setSide] = useState<Side | null>(null);
  /** Path of the second page. null while the picker is open. */
  const [secondary, setSecondary] = useState<string | null>(null);
  const [ratio, setRatio] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);

  const dragRef = useRef<{ startX: number; startY: number } | null>(null);
  const resizeRef = useRef(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const pathRef = useRef(location.pathname);

  // Navigating anywhere else (sidebar, shortcut, in-page link) ends split mode.
  useEffect(() => {
    if (pathRef.current === location.pathname) return;
    pathRef.current = location.pathname;
    setSide(null);
    setSecondary(null);
  }, [location.pathname]);

  // Escape cancels the page picker.
  useEffect(() => {
    if (!side || secondary) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSide(null);
        setSecondary(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [side, secondary]);

  const primaryDef = findAppPage(location.pathname);
  const primaryLabel = primaryDef ? t(primaryDef.label) : t('This page');

  const options = useMemo(
    () =>
      APP_PAGES.filter(
        page =>
          page.inSplitPicker &&
          page.path !== location.pathname &&
          (!page.paidOnly || isPaid),
      ),
    [location.pathname, isPaid],
  );

  // Calendar/Collaboration show a Coming Soon screen to non-admins; Documents
  // is not implemented at all yet.
  const isComingSoon = (path: string) =>
    path === '/documents' ||
    (!isAdminView && (path === '/calendar' || path === '/collaboration'));

  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
    setOffset(0);
  };

  const onHandlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (side || event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic/unsupported pointer capture — drag still works */
    }
    dragRef.current = { startX: event.clientX, startY: event.clientY };
    setDragging(true);
    setOffset(0);
  };

  const onHandlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    // Only a mostly-horizontal drag counts, so scrolling near the handle
    // never opens the picker by accident.
    if (Math.abs(dx) <= Math.abs(dy)) {
      setOffset(0);
      return;
    }
    if (Math.abs(dx) >= DRAG_THRESHOLD) {
      setSide(dx < 0 ? 'left' : 'right');
      setSecondary(null);
      dragRef.current = null;
      setDragging(false);
      setOffset(0);
      return;
    }
    setOffset(dx);
  };

  const startSide = (next: Side) => {
    setSide(next);
    setSecondary(null);
  };

  const closeSplit = () => {
    setSide(null);
    setSecondary(null);
  };

  // Closing the pane that owns the URL hands the URL to the other page.
  const closePrimary = () => {
    const next = secondary;
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

  const renderPicker = () => (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-card/40">
      <div className="flex h-8 flex-shrink-0 items-center gap-1.5 border-b border-border bg-muted/40 px-2">
        <ArrowLeftRight className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
        <span className="text-[11px] font-semibold text-foreground">{t('Split screen')}</span>
        <button
          type="button"
          onClick={closeSplit}
          className="ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {t('Cancel')}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        <p className="mb-3 text-xs text-muted-foreground">
          {t('Choose a page to open next to {{name}}.', { name: primaryLabel })}
        </p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {options.map(page => {
            const Icon = page.icon;
            const soon = isComingSoon(page.path);
            return (
              <button
                key={page.path}
                type="button"
                onClick={() => setSecondary(page.path)}
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

  const renderPane = (which: Side) => {
    if (side === which) {
      return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PaneHeader
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

    if (secondary) {
      const def = findAppPage(secondary);
      return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <PaneHeader
            icon={def?.icon}
            label={def ? t(def.label) : t('This page')}
            onClose={closeSplit}
            closeTitle={t('Exit split screen')}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <SplitPage key={secondary} path={secondary} />
          </div>
        </div>
      );
    }

    return renderPicker();
  };

  const dragDir: Side | null = offset < -6 ? 'left' : offset > 6 ? 'right' : null;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
      {side === null ? (
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

      {side === null ? (
        <button
          type="button"
          aria-label={t('Split screen')}
          title={t('Drag left or right to split')}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={event => {
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              startSide('left');
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              startSide('right');
            }
          }}
          className={`group absolute left-1/2 top-0 z-40 hidden h-5 w-14 -translate-x-1/2 touch-none select-none items-center justify-center rounded-b-lg border border-t-0 border-border bg-card/90 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:flex ${
            dragging ? 'cursor-grabbing bg-card text-foreground' : 'cursor-grab'
          }`}
        >
          <GripHorizontal className="h-4 w-4" />
          <span className="pointer-events-none absolute top-full mt-1 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[10px] font-medium text-background opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            {t('Drag left or right to split')}
          </span>
        </button>
      ) : null}

      {dragging && side === null ? (
        <div className="pointer-events-none absolute inset-0 z-30">
          <div
            className={`absolute inset-y-0 left-0 w-1/2 transition-colors duration-150 ${
              dragDir === 'left' ? 'bg-primary/10 ring-2 ring-inset ring-primary/40' : ''
            }`}
          />
          <div
            className={`absolute inset-y-0 right-0 w-1/2 transition-colors duration-150 ${
              dragDir === 'right' ? 'bg-primary/10 ring-2 ring-inset ring-primary/40' : ''
            }`}
          />
          {dragDir ? (
            <div className="absolute left-1/2 top-16 -translate-x-1/2 whitespace-nowrap rounded-full bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background shadow-lg">
              {dragDir === 'left'
                ? t('Split screen on the left')
                : t('Split screen on the right')}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default SplitView;
