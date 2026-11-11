import { lazy } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckSquare,
  CreditCard,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LifeBuoy,
  Settings,
  StickyNote,
  Users,
  Wand2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Single source of truth for the app's top-level pages.
 *
 * App.tsx turns this list into routes and the split-screen picker reads the
 * same list, so a page only has to be registered once. Keep the lazy imports
 * here (not in App.tsx) so both consumers share one chunk per page.
 */
export interface AppPageDef {
  path: string;
  /** English source label; the JSX runtime translates it on render. */
  label: string;
  icon: LucideIcon;
  component: LazyExoticComponent<ComponentType<any>>;
  /** Offer this page in the split-screen page picker. */
  inSplitPicker?: boolean;
  /** Only show in the picker for pro/premium accounts. */
  paidOnly?: boolean;
  /** Minimum usable width in split view, including this page's own panels. */
  minSplitWidth?: number;
}

export const APP_PAGES: AppPageDef[] = [
  {
    path: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
    component: lazy(() => import('@/pages/Dashboard')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/projects',
    label: 'Projects',
    icon: FolderKanban,
    component: lazy(() => import('@/pages/Projects')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/tasks',
    label: 'Tasks',
    icon: CheckSquare,
    component: lazy(() => import('@/pages/Tasks')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/calendar',
    label: 'Calendar',
    icon: CalendarDays,
    component: lazy(() => import('@/pages/CalendarPage')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/insights',
    label: 'Insights',
    icon: BarChart3,
    component: lazy(() => import('@/pages/Insights')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/ai-chat',
    label: 'AI Assistant',
    icon: Wand2,
    component: lazy(() => import('@/pages/AIChat')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/notes',
    label: 'Notes',
    icon: StickyNote,
    component: lazy(() => import('@/pages/Notes')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/documents',
    label: 'Documents',
    icon: FileText,
    component: lazy(() => import('@/pages/Documents')),
    // Documents is an unbuilt coming-soon stub — keep it out of the split picker.
  },
  {
    path: '/collaboration',
    label: 'Collaboration',
    icon: Users,
    component: lazy(() => import('@/pages/Collaboration')),
    minSplitWidth: 560,
    inSplitPicker: true,
    paidOnly: true,
  },
  {
    path: '/organizations',
    label: 'Organizations',
    icon: Building2,
    component: lazy(() => import('@/pages/Organizations')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/support',
    label: 'Support',
    icon: LifeBuoy,
    component: lazy(() => import('@/pages/Support')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/pricing',
    label: 'Pricing',
    icon: CreditCard,
    component: lazy(() => import('@/pages/Pricing')),
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
    component: lazy(() => import('@/pages/SettingsPage')),
  },
];

export const findAppPage = (path: string): AppPageDef | undefined =>
  APP_PAGES.find(page => page.path === path);
