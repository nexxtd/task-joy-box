/**
 * Ready-made split-screen layouts offered from Settings > Shortcuts.
 *
 * A preset is just a primary page (the side the app navigates to) plus the
 * page that opens beside it. `openSplitPreset` dispatches a DOM event instead
 * of owning navigation, so SplitView can keep the split state while the real
 * router performs the route change.
 */

export interface SplitPreset {
  id: string;
  label: string;
  description: string;
  primaryPath: string;
  secondaryPath: string;
}

export const SPLIT_PRESETS: SplitPreset[] = [
  {
    id: 'tasks-notes',
    label: 'Tasks + Notes',
    description: 'Work through your task list while keeping notes beside it.',
    primaryPath: '/tasks',
    secondaryPath: '/notes',
  },
  {
    id: 'tasks-calendar',
    label: 'Tasks + Calendar',
    description: 'See your task list and schedule at the same time.',
    primaryPath: '/tasks',
    secondaryPath: '/calendar',
  },
  {
    id: 'notes-calendar',
    label: 'Notes + Calendar',
    description: 'Capture notes next to your weekly plan.',
    primaryPath: '/notes',
    secondaryPath: '/calendar',
  },
  {
    id: 'notes-ai',
    label: 'Notes + AI Assistant',
    description: 'Draft notes with Planora available alongside.',
    primaryPath: '/notes',
    secondaryPath: '/ai-chat',
  },
  {
    id: 'dashboard-tasks',
    label: 'Dashboard + Tasks',
    description: 'Keep your overview visible while working through tasks.',
    primaryPath: '/',
    secondaryPath: '/tasks',
  },
  {
    id: 'projects-tasks',
    label: 'Projects + Tasks',
    description: 'Move between project boards and your task list.',
    primaryPath: '/projects',
    secondaryPath: '/tasks',
  },
  {
    id: 'insights-tasks',
    label: 'Insights + Tasks',
    description: 'Compare productivity insights with the tasks behind them.',
    primaryPath: '/insights',
    secondaryPath: '/tasks',
  },
];

export const SPLIT_OPEN_EVENT = 'split:open';

export interface SplitOpenDetail {
  primaryPath: string;
  secondaryPath: string;
  /** Which side the primary page should occupy. Defaults to the left. */
  side?: 'left' | 'right';
}

export function findSplitPreset(id: string): SplitPreset | undefined {
  return SPLIT_PRESETS.find(preset => preset.id === id);
}

export function openSplitPreset(preset: SplitPreset | string): void {
  const resolved = typeof preset === 'string' ? findSplitPreset(preset) : preset;
  if (!resolved) return;
  if (!resolved.primaryPath || !resolved.secondaryPath) return;
  if (resolved.primaryPath === resolved.secondaryPath) return;
  try {
    window.dispatchEvent(
      new CustomEvent<SplitOpenDetail>(SPLIT_OPEN_EVENT, {
        detail: {
          primaryPath: resolved.primaryPath,
          secondaryPath: resolved.secondaryPath,
          side: 'left',
        },
      }),
    );
  } catch {
    /* CustomEvent unavailable (very old browsers) — nothing to do */
  }
}
