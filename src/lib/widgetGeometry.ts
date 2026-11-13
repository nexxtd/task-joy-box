export const WIDGET_COLUMNS = 12;
export const WIDGET_ROW_HEIGHT = 112;
export const WIDGET_GAP = 16;
export const WIDGET_ROW_PITCH = WIDGET_ROW_HEIGHT + WIDGET_GAP;
export const MIN_WIDGET_COLUMNS = 6;
export const MIN_WIDGET_ROWS = 3;
export const MAX_WIDGET_ROWS = 30;

export interface WidgetSizeLimits {
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface WidgetRect {
  id?: string;
  type?: string;
  col: number;
  row: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface GridBounds {
  left: number;
  top: number;
  width: number;
}

export interface WidgetGrab {
  x: number;
  y: number;
}

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const integer = (value: number, fallback: number) => Number.isFinite(value) ? Math.round(value) : fallback;

/** The space between column starts includes the gutter, unlike width / 12. */
export const widgetColumnPitch = (width: number) => (width + WIDGET_GAP) / WIDGET_COLUMNS;

export function normalizeWidget<T extends WidgetRect>(widget: T, limits?: WidgetSizeLimits): T {
  const customLimits: WidgetSizeLimits = {
    minW: limits?.minW ?? widget.minW ?? MIN_WIDGET_COLUMNS,
    minH: limits?.minH ?? widget.minH ?? MIN_WIDGET_ROWS,
    maxW: limits?.maxW ?? widget.maxW ?? WIDGET_COLUMNS,
    maxH: limits?.maxH ?? widget.maxH ?? MAX_WIDGET_ROWS,
  };

  const minW = Math.max(MIN_WIDGET_COLUMNS, customLimits.minW ?? MIN_WIDGET_COLUMNS);
  const maxW = Math.min(WIDGET_COLUMNS, customLimits.maxW ?? WIDGET_COLUMNS);
  const minH = Math.max(MIN_WIDGET_ROWS, customLimits.minH ?? MIN_WIDGET_ROWS);
  const maxH = Math.min(MAX_WIDGET_ROWS, customLimits.maxH ?? MAX_WIDGET_ROWS);

  const w = clamp(integer(widget.w, minW), minW, maxW);
  return {
    ...widget,
    w,
    h: clamp(integer(widget.h, minH), minH, maxH),
    col: clamp(integer(widget.col, 1), 1, WIDGET_COLUMNS - w + 1),
    row: Math.max(1, integer(widget.row, 1)),
  };
}

export function widgetsIntersect(a: WidgetRect, b: WidgetRect) {
  return !(a.col >= b.col + b.w || a.col + a.w <= b.col || a.row >= b.row + b.h || a.row + a.h <= b.row);
}

/** Pack matching-width gaps while optionally keeping the active module anchored. */
export function compactWidgets<T extends WidgetRect>(widgets: T[], anchoredId?: string, limitsMap?: Record<string, WidgetSizeLimits>): T[] {
  const normalized = widgets.map(w => {
    const limits = limitsMap
      ? (w.id && limitsMap[w.id] ? limitsMap[w.id] : w.type && limitsMap[w.type] ? limitsMap[w.type] : undefined)
      : undefined;
    return normalizeWidget(w, limits);
  });
  const anchored = anchoredId ? normalized.find(widget => widget.id === anchoredId) : undefined;
  const placed: T[] = anchored ? [anchored] : [];
  const rest = normalized.filter(widget => widget !== anchored).sort((a, b) => a.row - b.row || a.col - b.col);
  for (const widget of rest) {
    const next = { ...widget, row: 1 };
    while (true) {
      const blocker = placed.find(other => widgetsIntersect(next, other));
      if (!blocker) break;
      next.row = blocker.row + blocker.h;
    }
    placed.push(next);
  }
  return placed;
}

export function getWidgetGrab(clientX: number, clientY: number, bounds: GridBounds, widget: WidgetRect): WidgetGrab {
  return {
    x: clientX - bounds.left - (widget.col - 1) * widgetColumnPitch(bounds.width),
    y: clientY - bounds.top - (widget.row - 1) * WIDGET_ROW_PITCH,
  };
}

/** bounds.top already reflects ancestor scrolling; never add scrollTop again. */
export function moveWidgetFromGrab(clientX: number, clientY: number, bounds: GridBounds, grab: WidgetGrab, widget: WidgetRect): WidgetRect {
  return {
    col: clamp(Math.round((clientX - bounds.left - grab.x) / widgetColumnPitch(bounds.width)) + 1, 1, WIDGET_COLUMNS - widget.w + 1),
    row: Math.max(1, Math.round((clientY - bounds.top - grab.y) / WIDGET_ROW_PITCH) + 1),
    w: widget.w,
    h: widget.h,
  };
}

export function resizeWidget(
  widget: WidgetRect,
  deltaX: number,
  deltaY: number,
  gridWidth: number,
  limits?: WidgetSizeLimits,
): WidgetRect {
  const customLimits: WidgetSizeLimits = {
    minW: limits?.minW ?? widget.minW ?? MIN_WIDGET_COLUMNS,
    minH: limits?.minH ?? widget.minH ?? MIN_WIDGET_ROWS,
    maxW: limits?.maxW ?? widget.maxW ?? WIDGET_COLUMNS,
    maxH: limits?.maxH ?? widget.maxH ?? MAX_WIDGET_ROWS,
  };

  const minW = Math.max(MIN_WIDGET_COLUMNS, customLimits.minW ?? MIN_WIDGET_COLUMNS);
  const maxW = Math.min(customLimits.maxW ?? WIDGET_COLUMNS, WIDGET_COLUMNS - widget.col + 1);
  const minH = Math.max(MIN_WIDGET_ROWS, customLimits.minH ?? MIN_WIDGET_ROWS);
  const maxH = customLimits.maxH ?? MAX_WIDGET_ROWS;

  const targetW = widget.w + Math.round(deltaX / widgetColumnPitch(gridWidth));
  const targetH = widget.h + Math.round(deltaY / WIDGET_ROW_PITCH);

  return {
    col: widget.col,
    row: widget.row,
    w: clamp(targetW, Math.min(minW, WIDGET_COLUMNS - widget.col + 1), maxW),
    h: clamp(targetH, minH, maxH),
  };
}
