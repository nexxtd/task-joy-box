export const MIN_RATIO = 0.2;
export const MAX_RATIO = 0.8;
export const MIN_PANE_WIDTH = 400;
export const SPLIT_DIVIDER_WIDTH = 6;

/** Width excludes the divider. Both panes keep their minimum when space is tight. */
export function getSplitBounds(width: number, leftMinimum: number, rightMinimum: number) {
  const availableWidth = Math.max(width, leftMinimum + rightMinimum);
  return {
    min: Math.max(MIN_RATIO, leftMinimum / availableWidth),
    max: Math.min(MAX_RATIO, 1 - rightMinimum / availableWidth),
  };
}

export function clampSplitRatio(ratio: number, bounds: ReturnType<typeof getSplitBounds>) {
  return Math.min(bounds.max, Math.max(bounds.min, ratio));
}
