import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, CheckSquare, CalendarDays,
  BarChart3, StickyNote, Users, CreditCard, Settings,
  X, Sparkles, Wand2, LifeBuoy, ShieldCheck, Sun, Moon, LogOut, MoreHorizontal
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme } from '@/context/ThemeContext';
import NotificationBell from '@/components/NotificationBell';

const MobileNav: React.FC = () => {
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { T, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const isPremium = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';

  // 4 primary tabs + More — fits 375px without crowding.
  const primaryTabs = [
    { icon: LayoutDashboard, label: T.nav_dashboard, path: '/' },
    { icon: FolderKanban, label: T.nav_projects, path: '/projects' },
    { icon: CheckSquare, label: T.nav_tasks, path: '/tasks' },
    { icon: CalendarDays, label: T.nav_calendar, path: '/calendar' },
  ];

  const moreItems = [
    { icon: BarChart3, label: T.nav_insights, path: '/insights' },
    { icon: Wand2, label: t('AI Assistant'), path: '/ai-chat' },
    { icon: StickyNote, label: T.nav_notes, path: '/notes' },
    ...(user?.subscriptionTier && user.subscriptionTier !== 'free'
      ? [{ icon: Users, label: T.nav_collaboration, path: '/collaboration' }]
      : []),
    { icon: LifeBuoy, label: t('Support'), path: '/support' },
    ...(user?.isAdmin ? [{ icon: ShieldCheck, label: t('Admin Panel'), path: '/admin' }] : []),
    { icon: CreditCard, label: T.nav_pricing, path: '/pricing' },
    { icon: Settings, label: T.nav_settings, path: '/settings' },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const moreActive = moreItems.some(i => isActive(i.path));

  const go = (path: string) => {
    navigate(path);
    setMoreOpen(false);
  };

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <>
      {/* Mobile top bar — owns the status-area space so page headers never
          slide under a floating button. Desktop keeps its sidebar. */}
      <div
        className="md:hidden flex items-center gap-2 border-b border-border bg-card/90 backdrop-blur-xl px-4 h-14 flex-shrink-0"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground text-[15px] truncate">MyPlanner</span>
        </div>
        <NotificationBell />
        <button
          onClick={() => setMoreOpen(true)}
          aria-label="Open account menu"
          className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0 overflow-hidden"
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[11px] font-bold text-primary-foreground">{initials}</span>
          )}
        </button>
      </div>

      {/* Bottom tab bar — thumb-reachable, 44px+ targets, safe-area aware */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-xl"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label="Primary"
      >
        <div className="grid grid-cols-5 h-[64px]">
          {primaryTabs.map(item => {
            const active = isActive(item.path);
            return (
              <button
                key={item.path}
                onClick={() => go(item.path)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className={`text-[10px] leading-none truncate max-w-full px-1 ${active ? 'font-bold' : 'font-medium'}`}>
                  {item.label}
                </span>
                {active && <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
              </button>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-label="More navigation options"
            className={`flex flex-col items-center justify-center gap-0.5 min-h-[56px] transition-colors ${
              moreActive ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <MoreHorizontal className="w-5 h-5" />
            <span className={`text-[10px] leading-none font-medium ${moreActive ? 'font-bold' : ''}`}>
              {t('More')}
            </span>
            {moreActive && <div className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
          </button>
        </div>
      </nav>

      {/* More sheet — bottom sheet, not a full sidebar, so context is kept */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={t('More')}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setMoreOpen(false)} />
          <div className="relative w-full max-w-md bg-card rounded-t-2xl border-t border-x border-border shadow-2xl animate-slide-up max-h-[85dvh] flex flex-col">
            <div className="pt-2 pb-1 flex justify-center flex-shrink-0" aria-hidden="true">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>
            <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4 h-4 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-foreground text-sm truncate">{user?.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                </div>
              </div>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
                className="p-2.5 min-w-[44px] min-h-[44px] rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
              {moreItems.map(item => {
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => go(item.path)}
                    className={`w-full flex items-center gap-3 px-3 py-3 min-h-[48px] text-sm rounded-xl transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    <span className="truncate flex-1 text-left">{item.label}</span>
                    {active && <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                  </button>
                );
              })}
            </nav>

            <div className="px-3 py-3 border-t border-border space-y-0.5 flex-shrink-0">
              <button
                onClick={() => (isPremium ? toggleTheme() : go('/pricing'))}
                className="w-full flex items-center gap-3 px-3 py-3 min-h-[48px] text-sm rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-5 h-5 flex-shrink-0" /> : <Moon className="w-5 h-5 flex-shrink-0" />}
                <span className="flex-1 text-left">{theme === 'dark' ? T.nav_light_mode : T.nav_dark_mode}</span>
                {!isPremium && <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />}
              </button>
              <button
                onClick={() => { setMoreOpen(false); logout(); }}
                className="w-full flex items-center gap-3 px-3 py-3 min-h-[48px] text-sm rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors"
              >
                <LogOut className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1 text-left">{T.sign_out}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileNav;
