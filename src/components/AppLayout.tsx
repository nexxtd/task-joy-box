import React, { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import MobileNav from './MobileNav';
import { loadShortcuts, matchesAnyShortcut, runShortcutAction, isShortcutCapturing } from '@/lib/shortcuts';
import { trackPageVisit } from '@/lib/usage';

const pathToPage = (pathname: string): string => {
  if (pathname === '/' || pathname === '') return 'dashboard';
  if (pathname.startsWith('/projects')) return 'projects';
  if (pathname.startsWith('/tasks')) return 'tasks';
  if (pathname.startsWith('/calendar')) return 'calendar';
  if (pathname.startsWith('/insights')) return 'insights';
  if (pathname.startsWith('/ai-chat')) return 'ai-assistant';
  if (pathname.startsWith('/notes')) return 'notes';
  if (pathname.startsWith('/support')) return 'support';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/collaboration')) return 'collaboration';
  if (pathname.startsWith('/pricing')) return 'pricing';
  if (pathname.startsWith('/admin')) return 'admin';
  return 'other';
};

const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Per-page visit baseline (button presses are tracked separately per feature).
  useEffect(() => {
    try { trackPageVisit(pathToPage(location.pathname)); } catch {}
  }, [location.pathname]);
  // Global keyboard shortcuts (Settings > Shortcuts). Rebound combos apply app-wide.
  // Capture phase + stopPropagation so browser-reserved Alt combos are claimed
  // before the browser (or a child handler) swallows them — this is what made
  // shortcuts flaky on the first press.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // While Settings is capturing a new combo, never fire shortcuts.
      if (isShortcutCapturing()) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        // Allow shortcuts with modifiers even inside fields (e.g. Alt+T),
        // but never hijack plain typing.
        const hasMod = (e as KeyboardEvent).ctrlKey || (e as KeyboardEvent).metaKey || (e as KeyboardEvent).altKey;
        if (!hasMod) return;
      }
      try {
        const list = loadShortcuts();
        const hit = matchesAnyShortcut(e, list);
        if (hit) {
          e.preventDefault();
          e.stopPropagation();
          runShortcutAction(hit.action, (p: string) => navigate(p));
        }
      } catch {}
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [navigate]);
  return (
    <div className="h-dvh flex flex-col md:flex-row bg-background overflow-hidden">
      <div className="hidden md:block">
        <AppSidebar />
      </div>
      {/* Mobile top bar lives inside MobileNav (sticky). Main content leaves
          room for the bottom tab bar on phones. */}
      <MobileNav />
      <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden pb-[64px] md:pb-0">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
