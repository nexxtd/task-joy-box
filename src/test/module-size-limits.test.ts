import { describe, expect, it } from 'vitest';
import {
  MIN_WIDGET_COLUMNS,
  MIN_WIDGET_ROWS,
  compactWidgets,
  normalizeWidget,
} from '@/lib/widgetGeometry';

describe('module minimum size bounds', () => {
  it('enforces large base minimum grid bounds so no module can be sized small', () => {
    expect(MIN_WIDGET_ROWS).toBeGreaterThanOrEqual(5);
    expect(MIN_WIDGET_COLUMNS).toBeGreaterThanOrEqual(6);

    const normalized = normalizeWidget({ id: 'w1', col: 1, row: 1, w: 2, h: 1 });
    expect(normalized.w).toBeGreaterThanOrEqual(MIN_WIDGET_COLUMNS);
    expect(normalized.h).toBeGreaterThanOrEqual(MIN_WIDGET_ROWS);
  });

  it('enforces custom per-module size limits when higher than the global floor', () => {
    const compacted = compactWidgets(
      [
        { id: 'overview', type: 'overview', col: 1, row: 1, w: 3, h: 2 },
        { id: 'ai-coach', type: 'ai-coach', col: 7, row: 1, w: 4, h: 3 },
      ],
      undefined,
      {
        overview: { minW: 6, minH: 6, maxW: 12, maxH: 10 },
        'ai-coach': { minW: 8, minH: 7, maxW: 12, maxH: 12 },
      },
    );

    const overview = compacted.find((w) => w.id === 'overview')!;
    const coach = compacted.find((w) => w.id === 'ai-coach')!;

    expect(overview.w).toBe(6);
    expect(overview.h).toBe(6);
    expect(coach.w).toBe(8);
    expect(coach.h).toBe(7);
  });
});
