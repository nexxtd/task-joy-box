import React from 'react';
import { ViewType } from '@/types/board';
import {
  LayoutDashboard, List, CalendarDays, Home,
  Settings, Users, BarChart3, Clock, Target
} from 'lucide-react';

interface SidebarProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange }) => {
  const mainNav = [
    { icon: Home, label: 'Home', id: 'home' as const },
  ];

  const viewItems = [
    { icon: LayoutDashboard, label: 'Board', id: 'board' as ViewType },
    { icon: List, label: 'List', id: 'list' as ViewType },
    { icon: CalendarDays, label: 'Calendar', id: 'calendar' as ViewType },
  ];

  const moreItems = [
    { icon: BarChart3, label: 'Dashboard', id: 'dashboard' },
    { icon: Clock, label: 'Time Tracking', id: 'time' },
    { icon: Target, label: 'Goals', id: 'goals' },
    { icon: Users, label: 'Team', id: 'team' },
  ];

  return (
    <div className="w-[220px] h-screen bg-card border-r border-border flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground text-base">MyPlanner</span>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {mainNav.map(item => (
          <button
            key={item.id}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        ))}

        <div className="pt-4 pb-1 px-3">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Views</span>
        </div>
        {viewItems.map(item => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors ${
              currentView === item.id
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        ))}

        <div className="pt-4 pb-1 px-3">
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">More</span>
        </div>
        {moreItems.map(item => (
          <button
            key={item.id}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors opacity-50 cursor-not-allowed"
            title="Coming soon"
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-2 py-3 border-t border-border">
        <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors">
          <Settings className="w-4 h-4" />
          Settings
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
