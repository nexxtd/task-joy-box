import { describe, expect, it } from 'vitest';
import { clampSplitRatio, getSplitBounds } from './splitSizing';

describe('split pane size limits', () => {
  it('keeps Tasks at 400px and Calendar at 560px when dragged to either edge', () => {
    const availableWidth = 1360;
    const bounds = getSplitBounds(availableWidth, 400, 560);
    expect(clampSplitRatio(-1, bounds) * availableWidth).toBeCloseTo(400);
    expect((1 - clampSplitRatio(2, bounds)) * availableWidth).toBeCloseTo(560);
  });

  it('keeps both minima when the split surface has to scroll', () => {
    const bounds = getSplitBounds(640, 400, 560);
    expect(clampSplitRatio(0.2, bounds) * 960).toBeCloseTo(400);
    expect((1 - clampSplitRatio(0.8, bounds)) * 960).toBeCloseTo(560);
  });

  it('respects the limits after swapping the two pages', () => {
    const bounds = getSplitBounds(1360, 560, 400);
    expect(clampSplitRatio(0, bounds) * 1360).toBeCloseTo(560);
    expect((1 - clampSplitRatio(1, bounds)) * 1360).toBeCloseTo(400);
  });

  it('retains the 20–80% range on wide screens', () => {
    const bounds = getSplitBounds(3000, 400, 560);
    expect(clampSplitRatio(0, bounds)).toBe(0.2);
    expect(clampSplitRatio(1, bounds)).toBe(0.8);
    expect(clampSplitRatio(0.5, bounds)).toBe(0.5);
  });

  it('reclamps a previous ratio when the content area becomes smaller', () => {
    const bounds = getSplitBounds(1000, 400, 560);
    expect(clampSplitRatio(0.75, bounds) * 1000).toBeCloseTo(440);
  });

  it.each([[400, 400], [400, 560], [560, 400], [560, 560]])(
    'preserves both pixel minima from the initial measurement through window resizing (%i/%i)',
    (leftMinimum, rightMinimum) => {
      for (const width of [0, 320, 800, 960, 1120, 1360, 1920, 3840]) {
        const surfaceWidth = Math.max(width, leftMinimum + rightMinimum);
        const bounds = getSplitBounds(width, leftMinimum, rightMinimum);
        expect(bounds.min).toBeLessThanOrEqual(bounds.max + Number.EPSILON);
        for (const requestedRatio of [-1, 0.2, 0.5, 0.8, 2]) {
          const ratio = clampSplitRatio(requestedRatio, bounds);
          // Allow a fraction of a pixel for normal floating-point rounding.
          expect(ratio * surfaceWidth).toBeGreaterThanOrEqual(leftMinimum - 0.001);
          expect((1 - ratio) * surfaceWidth).toBeGreaterThanOrEqual(rightMinimum - 0.001);
        }
      }
    },
  );
});
