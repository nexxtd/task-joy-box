import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, CheckSquare, CalendarDays,
  BarChart3, StickyNote, Target, Users, CreditCard, Settings,
  ChevronLeft, ChevronRight, Sparkles, Sun, Moon, LogOut, Wand2, Brain, LifeBuoy, Flame, ShieldCheck, X
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';

const AppSidebar: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { T } = useLanguage();
  const [showWhiteboardModal, setShowWhiteboardModal] = useState(false);

  const isPremium = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';

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
    { icon: LifeBuoy, label: 'Support', path: '/support' },
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

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div
      className={`h-screen bg-card border-r border-border flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[68px]' : 'w-[220px]'
      }`}
    >
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="font-bold text-foreground text-base whitespace-nowrap animate-fade-in">
              MyPlanner
            </span>
          )}
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          data-testid="button-collapse-sidebar"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(item => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => {
                if (item.path === '/whiteboard') {
                  setShowWhiteboardModal(true);
                } else {
                  navigate(item.path);
                }
              }}
              title={collapsed ? item.label : undefined}
              data-testid={`nav-${item.path === '/' ? 'dashboard' : item.path.slice(1)}`}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg transition-all duration-200 group ${
                active
                  ? 'bg-primary/10 text-primary font-medium border border-black'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
              }`}
            >
              <item.icon className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-105'}`} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {active && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
            </button>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="px-2 py-3 border-t border-border space-y-0.5">
        {bottomItems.map(item => {
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              title={collapsed ? item.label : undefined}
              data-testid={`nav-${item.path.slice(1)}`}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg transition-all duration-200 ${
                active
                  ? 'bg-primary/10 text-primary font-medium border border-black'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted border border-transparent'
              }`}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}

        {/* Theme toggle */}
        <button
          onClick={() => isPremium ? toggleTheme() : navigate('/pricing')}
          title={collapsed ? (theme === 'dark' ? T.nav_light_mode : T.nav_dark_mode) : undefined}
          data-testid="button-toggle-theme"
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-lg transition-all duration-200 text-muted-foreground ${isPremium ? 'hover:text-foreground hover:bg-muted' : 'opacity-80 hover:bg-primary/5'}`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 flex-shrink-0" /> : <Moon className="w-4 h-4 flex-shrink-0" />}
          {!collapsed && (
            <span className="flex items-center flex-1">
              {theme === 'dark' ? T.nav_light_mode : T.nav_dark_mode}
              {!isPremium && <Sparkles className="w-3.5 h-3.5 text-primary ml-auto" />}
            </span>
          )}
        </button>

        {/* User + Logout */}
        {user && (
          <div className={`flex items-center gap-2 px-3 py-2 mt-1 ${collapsed ? 'justify-center' : ''}`}>
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="w-6 h-6 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-[10px] font-bold text-primary-foreground">{initials}</span>
              </div>
            )}
            {!collapsed && (
              <>
                <span className="text-xs text-muted-foreground truncate flex-1">{user.name}</span>
                <button
                  onClick={logout}
                  title={T.sign_out}
                  data-testid="button-logout"
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Whiteboard Coming Soon Modal */}
      {showWhiteboardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowWhiteboardModal(false)}>
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
          <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-foreground">Whiteboard Coming Soon</h3>
              <button onClick={() => setShowWhiteboardModal(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                The whiteboard feature is currently under development. Soon you'll be able to:
              </p>
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>Create visual mind maps and diagrams</li>
                <li>Collaborate with team members in real-time</li>
                <li>Link whiteboards to your tasks and projects</li>
                <li>Use drawing tools and sticky notes</li>
              </ul>
              <p className="text-sm text-muted-foreground">
                Stay tuned for updates!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppSidebar;
