import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, CheckSquare, CalendarDays,
  BarChart3, StickyNote, Target, Users, CreditCard, Settings,
  Menu, X, Sparkles, Wand2, Flame, LifeBuoy, ShieldCheck
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

const MobileNav: React.FC = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { T } = useLanguage();

  const navItems = [
    { icon: LayoutDashboard, label: T.nav_dashboard, path: '/' },
    { icon: FolderKanban, label: T.nav_projects, path: '/projects' },
    { icon: CheckSquare, label: T.nav_tasks, path: '/tasks' },
    { icon: CalendarDays, label: T.nav_calendar, path: '/calendar' },
    { icon: BarChart3, label: T.nav_insights, path: '/insights' },
    { icon: Wand2, label: 'AI Assistant', path: '/ai-chat' },
    { icon: StickyNote, label: T.nav_notes, path: '/notes' },
    { icon: Target, label: T.nav_goals, path: '/goals' },
    { icon: Flame, label: 'Habits', path: '/habits' },
    ...(user?.subscriptionTier && user.subscriptionTier !== 'free' 
      ? [{ icon: Users, label: T.nav_collaboration, path: '/collaboration' }]
      : []),
    ...(user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium'
      ? [{ icon: LifeBuoy, label: 'Support', path: '/support' }]
      : []),
    ...(user?.isAdmin ? [{ icon: ShieldCheck, label: 'Admin Panel', path: '/admin' }] : []),
  ];

  const bottomItems = [
    { icon: CreditCard, label: T.nav_pricing, path: '/pricing' },
    { icon: Settings, label: T.nav_settings, path: '/settings' },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <>
      {/* Mobile menu button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setOpen(true)}
          className="p-2 bg-card border border-border rounded-lg shadow-lg"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative w-80 bg-card border-r border-border flex flex-col">
            {/* Header */}
            <div className="px-4 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary-foreground" />
                </div>
                <span className="font-bold text-foreground text-base">MyPlanner</span>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
              {navItems.map(item => {
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg transition-all duration-200 ${
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? 'scale-110' : ''}`} />
                    <span className="truncate">{item.label}</span>
                    {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </nav>

            {/* Bottom items */}
            <div className="px-2 py-3 border-t border-border space-y-0.5">
              {bottomItems.map(item => {
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg transition-all duration-200 ${
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{item.label}</span>
                    {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileNav;
