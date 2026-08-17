import { useCallback, useEffect, useRef, useState } from 'react';

export type WidgetTier = 'free' | 'premium' | 'pro';

export interface GridWidgetDef<Type extends string = string> {
  type: Type;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  accent: string;
  w: number;
  h: number;
  tier: WidgetTier;
}

export interface GridRect {
  id?: string;
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface GridWidget<Type extends string = string> extends GridRect {
  id: string;
  type: Type;
  title: string;
}

export const GRID_COLS = 12;
export const ROW_PX = 112;
export const GAP_PX = 16;
export const CELL_H = ROW_PX + GAP_PX;

export const genKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const intersects = (a: GridRect, b: GridRect) =>
  !(a.col >= b.col + b.w || a.col + a.w <= b.col || a.row >= b.row + b.h || a.row + a.h <= b.row);

export const packLayout = <T extends GridWidget>(widgets: T[]): T[] => {
  const sorted = [...widgets].sort((a, b) => (a.row - b.row) || (a.col - b.col));
  const result: T[] = [];
  for (const w of sorted) {
    const cur = { ...w };
    let guard = 0;
    // Pull the widget up to the highest free position so gaps above get filled.
    while (guard < 200 && cur.row > 1) {
      const up = { ...cur, row: cur.row - 1 };
      if (result.some(o => intersects(up, o))) break;
      cur.row = up.row;
      guard += 1;
    }
    // Resolve any remaining overlap with already-placed widgets by pushing
    // down below the blocker — this heals overlapping stored layouts too.
    guard = 0;
    while (guard < 200) {
      const hit = result.find(o => intersects(cur, o));
      if (!hit) break;
      cur.row = hit.row + hit.h;
      guard += 1;
    }
    result.push(cur);
  }
  return result;
};

const GRID_GAP_TOTAL = (GRID_COLS - 1) * GAP_PX;

export const cellStyle = (r: GridRect): React.CSSProperties => ({
  left: `calc((100% - ${GRID_GAP_TOTAL}px) * ${(r.col - 1) / GRID_COLS} + ${(r.col - 1) * GAP_PX}px)`,
  top: (r.row - 1) * CELL_H,
  width: `calc((100% - ${GRID_GAP_TOTAL}px) * ${r.w / GRID_COLS} + ${(r.w - 1) * GAP_PX}px)`,
  height: r.h * ROW_PX + (r.h - 1) * GAP_PX,
});

type Gesture<T extends string> =
  | { mode: 'move' | 'resize'; w: GridWidget<T>; sx: number; sy: number; lastX: number; lastY: number; col: number; row: number; ww: number; hh: number; grabCol: number; grabRow: number }
  | { mode: 'panel'; def: GridWidgetDef<T>; sx: number; sy: number; lastX: number; lastY: number; col: number; row: number; ww: number; hh: number; grabCol: number; grabRow: number };

export interface UseWidgetGridOptions<T extends string> {
  defs: GridWidgetDef<T>[];
  storageKey: string;
  defaultLayout: () => GridWidget<T>[];
  tier: WidgetTier;
}

export interface UseWidgetGridApi<T extends string> {
  layout: GridWidget<T>[];
  setLayout: React.Dispatch<React.SetStateAction<GridWidget<T>[]>>;
  previewLayout: GridWidget<T>[] | null;
  draft: GridRect | null;
  activeDragId: string | null;
  suppressMotion: boolean;
  displacedIds: Set<string>;
  gridHeight: number;
  gridRef: React.RefObject<HTMLDivElement | null>;
  scrollElRef: React.RefObject<HTMLDivElement | null>;
  bodyRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>;
  hasWidget: (type: T) => boolean;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, patch: Partial<GridWidget<T>> & Record<string, unknown>) => void;
  startGesture: (e: React.PointerEvent, widget: GridWidget<T>, mode: 'move' | 'resize') => void;
  onPanelItemPointerDown: (def: GridWidgetDef<T>) => (e: React.PointerEvent) => void;
  showCustomize: boolean;
  setShowCustomize: (v: boolean) => void;
  panelClosing: boolean;
  resetToDefault: () => void;
  canAccessTier: (widgetTier: WidgetTier) => boolean;
}

export function useWidgetGrid<T extends string>({
  defs,
  storageKey,
  defaultLayout,
  tier,
}: UseWidgetGridOptions<T>): UseWidgetGridApi<T> {
  const [layout, setLayout] = useState<GridWidget<T>[]>([]);
  const [draft, setDraft] = useState<GridRect | null>(null);
  const [previewLayout, setPreviewLayout] = useState<GridWidget<T>[] | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [suppressMotion, setSuppressMotion] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [panelClosing, setPanelClosing] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollElRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture<T> | null>(null);
  const draftRef = useRef<GridRect | null>(null);
  const solvedLayoutRef = useRef<GridWidget<T>[] | null>(null);
  const layoutRef = useRef<GridWidget<T>[]>([]);
  const bodyRefs = useRef(new Map<string, HTMLDivElement | null>());
  const panelPendingRef = useRef<{ def: GridWidgetDef<T>; sx: number; sy: number } | null>(null);
  const autoScrollRaf = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as GridWidget<T>[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const known = parsed.filter((w: GridWidget<T>) => defs.some(d => d.type === w.type));
          if (known.length > 0) { setLayout(packLayout(known)); return; }
        }
      }
    } catch { /* ignore */ }
    setLayout(defaultLayout());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (layout.length > 0) {
      layoutRef.current = layout;
      try { localStorage.setItem(storageKey, JSON.stringify(layout)); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout]);

  const TIER_RANK: Record<WidgetTier, number> = { free: 0, premium: 1, pro: 2 };
  const canAccessTier = useCallback((widgetTier: WidgetTier) => TIER_RANK[tier] >= TIER_RANK[widgetTier], [tier]);

  const cellFromPoint = useCallback((clientX: number, clientY: number) => {
    const el = gridRef.current;
    if (!el) return { col: 1, row: 1 };
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return { col: 1, row: 1 };
    const colW = rect.width / GRID_COLS;
    const x = clientX - rect.left;
    const y = clientY - rect.top + (scrollElRef.current ? scrollElRef.current.scrollTop : 0);
    return {
      col: clamp(Math.floor(x / colW) + 1, 1, GRID_COLS),
      row: Math.max(1, Math.floor(y / CELL_H) + 1),
    };
  }, []);

  const hasWidget = useCallback((type: T) => layout.some(w => w.type === type), [layout]);

  const removeWidget = useCallback((id: string) => {
    setLayout(prev => packLayout(prev.filter(w => w.id !== id)));
  }, []);

  const updateWidget = useCallback((id: string, patch: Partial<GridWidget<T>> & Record<string, unknown>) => {
    setLayout(prev => packLayout(prev.map(w => w.id === id ? { ...w, ...patch } : w)));
  }, []);

  const solveLayout = useCallback((g: NonNullable<Gesture<T>>, rect: GridRect) => {
    const others = layoutRef.current.filter(o => g.mode === 'panel' || o.id !== g.w.id);
    const active: GridWidget<T> = g.mode === 'panel'
      ? { id: '__dragging__', type: g.def.type, title: g.def.title, col: rect.col, row: rect.row, w: rect.w, h: rect.h }
      : { ...g.w, col: rect.col, row: rect.row, w: rect.w, h: rect.h };
    // Place the dragged widget at its target first and push colliding widgets
    // down, so moving upward never fights the user.
    const rest = [...others].sort((a, b) => (a.row - b.row) || (a.col - b.col));
    const placed: GridWidget<T>[] = [active];
    for (const w of rest) {
      let cur = { ...w };
      let guard = 0;
      while (guard < 200) {
        const hit = placed.find(o => intersects(cur, o));
        if (!hit) break;
        cur.row = hit.row + hit.h;
        guard += 1;
      }
      placed.push(cur);
    }
    const solved = placed.find(o => o.id === active.id) ?? active;
    return { widgets: placed, activeRect: { col: solved.col, row: solved.row, w: solved.w, h: solved.h } };
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollRaf.current) cancelAnimationFrame(autoScrollRaf.current);
    autoScrollRaf.current = 0;
  }, []);

  const startAutoScroll = useCallback(() => {
    if (autoScrollRaf.current) return;
    const tick = () => {
      const g = gestureRef.current;
      const el = scrollElRef.current;
      if (!g || !el) { autoScrollRaf.current = 0; return; }
      const r = el.getBoundingClientRect();
      const margin = 70;
      let dy = 0;
      if (g.lastY < r.top + margin) dy = -((r.top + margin - g.lastY) / margin) * 22;
      else if (g.lastY > r.bottom - margin) dy = ((g.lastY - (r.bottom - margin)) / margin) * 22;
      if (dy !== 0) el.scrollTop = clamp(el.scrollTop + dy, 0, Math.max(0, el.scrollHeight - el.clientHeight));
      autoScrollRaf.current = requestAnimationFrame(tick);
    };
    autoScrollRaf.current = requestAnimationFrame(tick);
  }, []);

  const onGestureKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') cancelGesture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onGestureMove = useCallback((e: PointerEvent) => {
    const g = gestureRef.current;
    const el = gridRef.current;
    if (!g || !el) return;
    g.lastX = e.clientX;
    g.lastY = e.clientY;
    const bounds = el.getBoundingClientRect();
    const tol = 24;
    // Allow dragging beyond the grid's top/bottom edges so widgets can be
    // moved to the very top or beneath everything else — the grid auto-scrolls
    // and the layout grows while the drag continues.
    if (e.clientX < bounds.left - tol || e.clientX > bounds.right + tol) {
      cancelGesture();
      return;
    }
    const cell = cellFromPoint(e.clientX, e.clientY);
    let rect: GridRect;
    if (g.mode === 'resize') {
      const colW = bounds.width / GRID_COLS;
      const dw = Math.round((e.clientX - g.sx) / colW);
      const dh = Math.round((e.clientY - g.sy) / CELL_H);
      rect = { col: g.col, row: g.row, w: clamp(g.ww + dw, 1, GRID_COLS - g.col + 1), h: clamp(g.hh + dh, 1, 30) };
    } else if (g.mode === 'move') {
      const colW = bounds.width / GRID_COLS;
      const scrollTop = scrollElRef.current ? scrollElRef.current.scrollTop : 0;
      const gx = (e.clientX - bounds.left) / colW + 1;
      const gy = (e.clientY - bounds.top + scrollTop) / CELL_H + 1;
      const col = clamp(Math.round(gx - g.grabCol), 1, GRID_COLS - g.ww + 1);
      const row = Math.max(1, Math.round(gy - g.grabRow));
      rect = { col, row, w: g.ww, h: g.hh };
    } else {
      const col = clamp(cell.col - Math.round((g.ww - 1) / 2), 1, GRID_COLS - g.ww + 1);
      const row = Math.max(1, cell.row - Math.round((g.hh - 1) / 2));
      rect = { col, row, w: g.ww, h: g.hh };
    }
    const { widgets, activeRect } = solveLayout(g, rect);
    solvedLayoutRef.current = widgets;
    draftRef.current = activeRect;
    setDraft(activeRect);
    setPreviewLayout(widgets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellFromPoint, solveLayout]);

  const cancelGesture = useCallback(() => {
    const g = gestureRef.current;
    if (!g) return;
    window.removeEventListener('pointermove', onGestureMove);
    window.removeEventListener('pointerup', onGestureEnd);
    window.removeEventListener('pointercancel', onGestureEnd);
    window.removeEventListener('keydown', onGestureKey);
    stopAutoScroll();
    gestureRef.current = null;
    panelPendingRef.current = null;
    draftRef.current = null;
    solvedLayoutRef.current = null;
    setDraft(null);
    setPreviewLayout(null);
    setActiveDragId(null);
    setSuppressMotion(true);
    requestAnimationFrame(() => setSuppressMotion(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onGestureMove, stopAutoScroll]);

  const onGestureEnd = useCallback(() => {
    const g = gestureRef.current;
    window.removeEventListener('pointermove', onGestureMove);
    window.removeEventListener('pointerup', onGestureEnd);
    window.removeEventListener('pointercancel', onGestureEnd);
    window.removeEventListener('keydown', onGestureKey);
    stopAutoScroll();
    const finalRect = draftRef.current;
    const solved = solvedLayoutRef.current;
    gestureRef.current = null;
    draftRef.current = null;
    solvedLayoutRef.current = null;
    setDraft(null);
    setPreviewLayout(null);
    setActiveDragId(null);
    if (g && finalRect) {
      if (g.mode === 'panel') {
        const def = g.def;
        const widget: GridWidget<T> = { id: genKey(), type: def.type, title: def.title, col: finalRect.col, row: finalRect.row, w: def.w, h: def.h };
        setLayout(prev => packLayout([...prev, widget]));
      } else if (solved) {
        // Commit exactly what the preview showed, so a move-up actually
        // swaps the widget instead of being re-derived (and undone) by packing.
        setLayout(solved);
      } else {
        setLayout(prev => packLayout(prev.map(wg => wg.id === g.w.id
          ? { ...wg, col: finalRect.col, row: finalRect.row, w: finalRect.w, h: finalRect.h }
          : wg)));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onGestureMove, stopAutoScroll]);

  const startGesture = useCallback((e: React.PointerEvent, widget: GridWidget<T>, mode: 'move' | 'resize') => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = gridRef.current;
    let grabCol = (widget.w - 1) / 2;
    let grabRow = (widget.h - 1) / 2;
    if (el) {
      const bounds = el.getBoundingClientRect();
      const colW = bounds.width / GRID_COLS;
      const scrollTop = scrollElRef.current ? scrollElRef.current.scrollTop : 0;
      grabCol = (e.clientX - bounds.left) / colW + 1 - widget.col;
      grabRow = (e.clientY - bounds.top + scrollTop) / CELL_H + 1 - widget.row;
    }
    gestureRef.current = { mode, w: widget, sx: e.clientX, sy: e.clientY, lastX: e.clientX, lastY: e.clientY, col: widget.col, row: widget.row, ww: widget.w, hh: widget.h, grabCol, grabRow };
    const start: GridRect = { col: widget.col, row: widget.row, w: widget.w, h: widget.h };
    draftRef.current = start;
    setDraft(start);
    setActiveDragId(widget.id);
    setSuppressMotion(false);
    const solved = solveLayout(gestureRef.current, start);
    setPreviewLayout(solved.widgets);
    window.addEventListener('pointermove', onGestureMove);
    window.addEventListener('pointerup', onGestureEnd);
    window.addEventListener('pointercancel', onGestureEnd);
    window.addEventListener('keydown', onGestureKey);
    startAutoScroll();
  }, [onGestureEnd, onGestureKey, onGestureMove, solveLayout, startAutoScroll]);

  const onPanelItemPointerDown = useCallback((def: GridWidgetDef<T>) => (e: React.PointerEvent) => {
    if (hasWidget(def.type)) return;
    if (e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    panelPendingRef.current = { def, sx, sy };
    const onMove = (ev: PointerEvent) => {
      const p = panelPendingRef.current;
      if (!p) return;
      if (Math.hypot(ev.clientX - p.sx, ev.clientY - p.sy) < 6) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      panelPendingRef.current = null;
      setPanelClosing(true);
      window.setTimeout(() => { setShowCustomize(false); setPanelClosing(false); }, 200);
      const cell = cellFromPoint(ev.clientX, ev.clientY);
      gestureRef.current = { mode: 'panel', def: p.def, sx, sy, lastX: ev.clientX, lastY: ev.clientY, col: 1, row: 1, ww: p.def.w, hh: p.def.h, grabCol: (p.def.w - 1) / 2, grabRow: (p.def.h - 1) / 2 };
      setActiveDragId('__dragging__');
      setSuppressMotion(false);
      const rect: GridRect = { col: clamp(cell.col - Math.round((p.def.w - 1) / 2), 1, GRID_COLS - p.def.w + 1), row: Math.max(1, cell.row - Math.round((p.def.h - 1) / 2)), w: p.def.w, h: p.def.h };
      const solved = solveLayout(gestureRef.current, rect);
      solvedLayoutRef.current = solved.widgets;
      draftRef.current = solved.activeRect;
      setDraft(solved.activeRect);
      setPreviewLayout(solved.widgets);
      window.addEventListener('pointermove', onGestureMove);
      window.addEventListener('pointerup', onGestureEnd);
      window.addEventListener('pointercancel', onGestureEnd);
      window.addEventListener('keydown', onGestureKey);
      startAutoScroll();
    };
    const onUp = () => {
      panelPendingRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }, [cellFromPoint, hasWidget, onGestureEnd, onGestureKey, onGestureMove, solveLayout, startAutoScroll]);

  const displacedIds = (() => {
    if (!previewLayout) return new Set<string>();
    const rest = new Map(layout.map(w => [w.id, w]));
    const out = new Set<string>();
    for (const w of previewLayout) {
      const orig = rest.get(w.id);
      if (!orig) continue;
      if (orig.col !== w.col || orig.row !== w.row || orig.w !== w.w || orig.h !== w.h) out.add(w.id);
    }
    return out;
  })();

  const gridHeight = (() => {
    const src = previewLayout ?? layout;
    const bottom = src.reduce((mx, w) => Math.max(mx, (w.row - 1) * CELL_H + w.h * ROW_PX + (w.h - 1) * GAP_PX), 0);
    return bottom + GAP_PX;
  })();

  const resetToDefault = useCallback(() => {
    setLayout(defaultLayout());
    setShowCustomize(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    layout,
    setLayout,
    previewLayout,
    draft,
    activeDragId,
    suppressMotion,
    displacedIds,
    gridHeight,
    gridRef,
    scrollElRef,
    bodyRefs,
    hasWidget,
    removeWidget,
    updateWidget,
    startGesture,
    onPanelItemPointerDown,
    showCustomize,
    setShowCustomize,
    panelClosing,
    resetToDefault,
    canAccessTier,
  };
}
