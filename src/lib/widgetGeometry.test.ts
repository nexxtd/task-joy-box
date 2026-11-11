import { describe, expect, it } from 'vitest';
import {
  compactWidgets, getWidgetGrab, moveWidgetFromGrab, normalizeWidget,
  resizeWidget, widgetColumnPitch, widgetsIntersect, WIDGET_ROW_PITCH,
} from './widgetGeometry';

const widget = (id: string, col: number, row: number, w = 6, h = 3) => ({ id, col, row, w, h });

describe('widget layout compaction', () => {
  it('fills the gap left when a module is made shorter', () => {
    const resized = widget('resized', 1, 1, 6, 3);
    const result = compactWidgets([resized, widget('below', 1, 8), widget('adjacent', 7, 1)], resized.id);
    expect(result.find(item => item.id === 'below')?.row).toBe(4);
    expect(result.find(item => item.id === 'adjacent')?.row).toBe(1);
    expect(result.find(item => item.id === 'resized')).toEqual(resized);
  });

  it('only pulls a module into a space that fits its full width and height', () => {
    const result = compactWidgets([
      widget('resized', 1, 1, 6, 3), widget('beside', 7, 1, 6, 5),
      widget('narrow-below', 1, 8, 6, 3), widget('wide-below', 1, 12, 12, 3),
    ], 'resized');
    expect(result.find(item => item.id === 'narrow-below')?.row).toBe(4);
    expect(result.find(item => item.id === 'wide-below')?.row).toBe(7);
    for (const left of result) for (const right of result) {
      if (left.id !== right.id) expect(widgetsIntersect(left, right)).toBe(false);
    }
  });

  it('does not move the actively resized module out from under the pointer', () => {
    const active = widget('active', 5, 7, 6, 3);
    const result = compactWidgets([active, widget('below', 5, 12)], active.id);
    expect(result.find(item => item.id === active.id)).toEqual(active);
    expect(result.find(item => item.id === 'below')?.row).toBe(1);
  });

  it('heals tiny legacy modules and overlapping saved positions without mutating input', () => {
    const input = [widget('old', 12, 1, 1, 1), widget('other', 9, 1, 6, 3)];
    const before = structuredClone(input);
    const result = compactWidgets(input);
    expect(input).toEqual(before);
    expect(result.every(item => item.w >= 6 && item.h >= 3)).toBe(true);
    expect(result.every(item => item.col + item.w <= 13)).toBe(true);
    expect(widgetsIntersect(result[0], result[1])).toBe(false);
  });
});

describe('widget pointer anchoring', () => {
  const bounds = { left: 100, top: 40, width: 1216 };
  const pitch = widgetColumnPitch(bounds.width);

  it('keeps a grab near the left edge instead of centering the module', () => {
    const current = widget('moving', 5, 3, 6, 3);
    const pointer = { x: bounds.left + 4 * pitch + 7, y: bounds.top + 2 * WIDGET_ROW_PITCH + 19 };
    const grab = getWidgetGrab(pointer.x, pointer.y, bounds, current);
    expect(grab.x).toBeCloseTo(7);
    expect(grab.y).toBe(19);
    expect(moveWidgetFromGrab(pointer.x, pointer.y, bounds, grab, current)).toEqual({ col: 5, row: 3, w: 6, h: 3 });
    expect(moveWidgetFromGrab(pointer.x + pitch, pointer.y + WIDGET_ROW_PITCH, bounds, grab, current))
      .toEqual({ col: 6, row: 4, w: 6, h: 3 });
  });

  it('uses the grid gutter when translating horizontal movement', () => {
    expect(pitch).toBeCloseTo((1216 + 16) / 12);
    const current = widget('moving', 1, 1);
    expect(moveWidgetFromGrab(bounds.left + 3 * pitch + 10, bounds.top + 20, bounds, { x: 10, y: 20 }, current).col).toBe(4);
  });

  it('tracks a scrolled grid through its viewport rectangle without counting the scroll twice', () => {
    const current = widget('moving', 1, 5);
    const grab = { x: 13, y: 21 };
    const pointerX = bounds.left + grab.x;
    const pointerY = bounds.top + 4 * WIDGET_ROW_PITCH + grab.y;
    const scrolled = { ...bounds, top: bounds.top - 2 * WIDGET_ROW_PITCH };
    expect(moveWidgetFromGrab(pointerX, pointerY, scrolled, grab, current).row).toBe(7);
  });

  it('preserves the original picker-card grab point when adding a module', () => {
    const dimensions = widget('new', 1, 1, 6, 3);
    const grab = { x: 9, y: 15 };
    const result = moveWidgetFromGrab(bounds.left + 2 * pitch + grab.x, bounds.top + WIDGET_ROW_PITCH + grab.y,
      bounds, grab, dimensions);
    expect(result).toEqual({ col: 3, row: 2, w: 6, h: 3 });
  });

  it('keeps a dragged module inside the grid at either horizontal edge', () => {
    const current = widget('moving', 1, 1, 6, 3);
    expect(moveWidgetFromGrab(-1000, -1000, bounds, { x: 10, y: 10 }, current)).toEqual({ col: 1, row: 1, w: 6, h: 3 });
    expect(moveWidgetFromGrab(10000, 300, bounds, { x: 10, y: 10 }, current).col).toBe(7);
  });
});

describe('widget resize limits', () => {
  it('prevents unreadable small modules', () => {
    expect(resizeWidget(widget('sizing', 1, 1, 8, 5), -10000, -10000, 1200))
      .toEqual({ col: 1, row: 1, w: 6, h: 3 });
  });

  it('respects custom size limits per module', () => {
    const limits = { minW: 8, minH: 4, maxW: 10, maxH: 6 };
    expect(resizeWidget(widget('custom', 1, 1, 8, 5), -10000, -10000, 1200, limits))
      .toEqual({ col: 1, row: 1, w: 8, h: 4 });
    expect(resizeWidget(widget('custom', 1, 1, 8, 5), 10000, 10000, 1200, limits))
      .toEqual({ col: 1, row: 1, w: 10, h: 6 });
  });

  it('keeps a resized module within the remaining grid columns', () => {
    expect(resizeWidget(widget('sizing', 5, 1, 6, 3), 10000, 10000, 1200))
      .toEqual({ col: 5, row: 1, w: 8, h: 30 });
  });

  it('normalizes malformed saved dimensions into finite valid geometry', () => {
    expect(normalizeWidget({ col: Infinity, row: NaN, w: -100, h: 500 }))
      .toEqual({ col: 1, row: 1, w: 6, h: 30 });
  });
});
