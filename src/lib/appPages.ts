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
  LayoutTemplate,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Single source of truth for the app's top-level pages.
 *
 * App.tsx turns this list into routes and the split-screen picker reads the
 * same list, so a page only has to be registered once. Keep the lazy imports
 * here (not in App.tsx) so both consumers share one chunk per page.
 */
type PageModule = { default: ComponentType<any> };
type PreloadableLazy = LazyExoticComponent<ComponentType<any>> & { preload: () => Promise<PageModule> };

/** lazy() plus a cached preload() so a page chunk can be fetched before navigation. */
const lazyPage = (loader: () => Promise<PageModule>): PreloadableLazy => {
  let pending: Promise<PageModule> | null = null;
  const load = () => {
    if (!pending) pending = loader().catch(err => { pending = null; throw err; });
    return pending;
  };
  const component = lazy(load) as PreloadableLazy;
  component.preload = load;
  return component;
};

export interface AppPageDef {
  path: string;
  /** English source label; the JSX runtime translates it on render. */
  label: string;
  icon: LucideIcon;
  component: PreloadableLazy;
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
    component: lazyPage(() => import('@/pages/Dashboard')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/projects',
    label: 'Projects',
    icon: FolderKanban,
    component: lazyPage(() => import('@/pages/Projects')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/tasks',
    label: 'Tasks',
    icon: CheckSquare,
    component: lazyPage(() => import('@/pages/Tasks')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/calendar',
    label: 'Calendar',
    icon: CalendarDays,
    component: lazyPage(() => import('@/pages/CalendarPage')),
    minSplitWidth: 560,
  },
  {
    path: '/insights',
    label: 'Insights',
    icon: BarChart3,
    component: lazyPage(() => import('@/pages/Insights')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/ai-chat',
    label: 'AI Assistant',
    icon: Wand2,
    component: lazyPage(() => import('@/pages/AIChat')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/notes',
    label: 'Notes',
    icon: StickyNote,
    component: lazyPage(() => import('@/pages/Notes')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/templates',
    label: 'Templates',
    icon: LayoutTemplate,
    component: lazyPage(() => import('@/pages/Templates')),
    minSplitWidth: 560,
  },
  {
    path: '/documents',
    label: 'Documents',
    icon: FileText,
    component: lazyPage(() => import('@/pages/Documents')),
    // Documents is an unbuilt coming-soon stub — keep it out of the split picker.
  },
  {
    path: '/collaboration',
    label: 'Collaboration',
    icon: Users,
    component: lazyPage(() => import('@/pages/Collaboration')),
    minSplitWidth: 560,
    paidOnly: true,
  },
  {
    path: '/organizations',
    label: 'Organizations',
    icon: Building2,
    component: lazyPage(() => import('@/pages/Organizations')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/support',
    label: 'Support',
    icon: LifeBuoy,
    component: lazyPage(() => import('@/pages/Support')),
    minSplitWidth: 560,
    inSplitPicker: true,
  },
  {
    path: '/pricing',
    label: 'Pricing',
    icon: CreditCard,
    component: lazyPage(() => import('@/pages/Pricing')),
  },
  {
    path: '/settings',
    label: 'Settings',
    icon: Settings,
    component: lazyPage(() => import('@/pages/SettingsPage')),
  },
];

export const findAppPage = (path: string): AppPageDef | undefined =>
  APP_PAGES.find(page => page.path === path);

const matchAppPage = (path: string): AppPageDef | undefined =>
  findAppPage(path) ?? APP_PAGES.find(page => page.path !== '/' && path.startsWith(page.path));

/** Fetch a page's chunk ahead of navigation (e.g. on hover) so the switch is instant. */
export const preloadAppPage = (path: string): void => {
  const page = matchAppPage(path);
  if (page) void page.component.preload().catch(() => {});
};

/** Warm every page chunk, one after another, so no navigation waits on the network. */
export const preloadAllAppPages = async (): Promise<void> => {
  for (const page of APP_PAGES) {
    try { await page.component.preload(); } catch { /* retry on real navigation */ }
  }
};
