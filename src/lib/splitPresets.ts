/**
 * Split-screen entry points.
 *
 * A split is just two page paths. `openSplitPair` dispatches a DOM event
 * instead of owning navigation, so SplitView can keep the split state while
 * the real router performs the route change.
 *
 * The old ready-made presets were removed: users now build their own pair from
 * Settings > Shortcuts > Add Shortcut > Create split screen.
 */

export interface SplitPreset {
  id: string;
  label: string;
  description: string;
  primaryPath: string;
  secondaryPath: string;
}

/**
 * Kept as an empty export for older imports. Split presets are no longer
 * shipped, and no default split shortcuts are seeded.
 */
export const SPLIT_PRESETS: SplitPreset[] = [];

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

/** Opens two specific pages side by side (left page first). */
export function openSplitPair(leftPath: string, rightPath: string): void {
  if (!leftPath || !rightPath || leftPath === rightPath) return;
  try {
    window.dispatchEvent(
      new CustomEvent<SplitOpenDetail>(SPLIT_OPEN_EVENT, {
        detail: {
          primaryPath: leftPath,
          secondaryPath: rightPath,
          side: 'left',
        },
      }),
    );
  } catch {
    /* CustomEvent unavailable (very old browsers) — nothing to do */
  }
}

/** @deprecated Presets were removed; kept so older callers compile. */
export function openSplitPreset(preset: SplitPreset | string): void {
  const resolved = typeof preset === 'string' ? findSplitPreset(preset) : preset;
  if (!resolved) return;
  openSplitPair(resolved.primaryPath, resolved.secondaryPath);
}
