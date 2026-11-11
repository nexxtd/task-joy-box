import { useCallback, useEffect, useRef, useState } from 'react';
import { compactWidgets, getWidgetGrab, moveWidgetFromGrab, normalizeWidget, resizeWidget, widgetsIntersect } from '@/lib/widgetGeometry';

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
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface GridRect {
  id?: string;
  col: number;
  row: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export interface GridWidget<Type extends string = string> extends GridRect {
  id: string;
  type: Type;
  title: string;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

export const GRID_COLS = 12;
export const ROW_PX = 112;
export const GAP_PX = 16;
export const CELL_H = ROW_PX + GAP_PX;

export const genKey = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const intersects = widgetsIntersect;
export const packLayout = compactWidgets;

const GRID_GAP_TOTAL = (GRID_COLS - 1) * GAP_PX;

export const cellStyle = (r: GridRect): React.CSSProperties => ({
  left: `calc((100% - ${GRID_GAP_TOTAL}px) * ${(r.col - 1) / GRID_COLS} + ${(r.col - 1) * GAP_PX}px)`,
  top: (r.row - 1) * CELL_H,
  width: `calc((100% - ${GRID_GAP_TOTAL}px) * ${r.w / GRID_COLS} + ${(r.w - 1) * GAP_PX}px)`,
  height: r.h * ROW_PX + (r.h - 1) * GAP_PX,
});

type Gesture<T extends string> =
  | { mode: 'move' | 'resize'; w: GridWidget<T>; sx: number; sy: number; lastX: number; lastY: number; col: number; row: number; ww: number; hh: number; grabX: number; grabY: number }
  | { mode: 'panel'; def: GridWidgetDef<T>; sx: number; sy: number; lastX: number; lastY: number; col: number; row: number; ww: number; hh: number; grabX: number; grabY: number };

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
  addWidget: (definition: GridWidgetDef<T>) => void;
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
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
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
  const panelPendingRef = useRef<{ def: GridWidgetDef<T>; sx: number; sy: number; grabX: number; grabY: number } | null>(null);
  const autoScrollRaf = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as GridWidget<T>[];
        if (Array.isArray(parsed)) {
          const known = parsed.filter((w: GridWidget<T>) => defs.some(d => d.type === w.type));
          if (parsed.length === 0 || known.length > 0) {
            setLayout(packLayout(known));
            setLoadedStorageKey(storageKey);
            return;
          }
        }
      }
    } catch { /* ignore */ }
    setLayout(packLayout(defaultLayout()));
    setLoadedStorageKey(storageKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    layoutRef.current = layout;
    if (loadedStorageKey === storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(layout)); } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, loadedStorageKey, storageKey]);

  const TIER_RANK: Record<WidgetTier, number> = { free: 0, premium: 1, pro: 2 };
  const canAccessTier = useCallback((widgetTier: WidgetTier) => TIER_RANK[tier] >= TIER_RANK[widgetTier], [tier]);

  const hasWidget = useCallback((type: T) => layout.some(w => w.type === type), [layout]);

  const addWidget = useCallback((definition: GridWidgetDef<T>) => {
    if (!canAccessTier(definition.tier)) return;
    setLayout(previous => {
      if (previous.some(widget => widget.type === definition.type)) return previous;
      const row = previous.reduce((bottom, widget) => Math.max(bottom, widget.row + widget.h), 1);
      return packLayout([...previous, {
        id: genKey(), type: definition.type, title: definition.title,
        col: 1, row, w: definition.w, h: definition.h,
      }]);
    });
  }, [canAccessTier]);

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
    // A shorter module releases space immediately. Other modules rise into
    // matching-width gaps while the module under the pointer keeps its anchor.
    const widgets = g.mode === 'resize' ? packLayout(placed, active.id) : placed;
    const solved = widgets.find(o => o.id === active.id) ?? active;
    return { widgets, activeRect: { col: solved.col, row: solved.row, w: solved.w, h: solved.h } };
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
      if (dy !== 0) {
        el.scrollTop = clamp(el.scrollTop + dy, 0, Math.max(0, el.scrollHeight - el.clientHeight));
        onGestureMove({ clientX: g.lastX, clientY: g.lastY } as PointerEvent);
      }
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
    let rect: GridRect;
    if (g.mode === 'resize') {
      const def = defs.find(d => d.type === g.w.type);
      const limits = {
        minW: def?.minW ?? g.w.minW,
        minH: def?.minH ?? g.w.minH,
        maxW: def?.maxW ?? g.w.maxW,
        maxH: def?.maxH ?? g.w.maxH,
      };
      rect = resizeWidget({ col: g.col, row: g.row, w: g.ww, h: g.hh },
        e.clientX - g.sx, e.clientY - bounds.top - g.sy, bounds.width, limits);
    } else {
      rect = moveWidgetFromGrab(e.clientX, e.clientY, bounds, { x: g.grabX, y: g.grabY },
        { col: g.col, row: g.row, w: g.ww, h: g.hh });
    }
    const { widgets, activeRect } = solveLayout(g, rect);
    solvedLayoutRef.current = widgets;
    draftRef.current = activeRect;
    setDraft(activeRect);
    setPreviewLayout(widgets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solveLayout]);

  const cancelGesture = useCallback(() => {
    const g = gestureRef.current;
    if (!g) return;
    window.removeEventListener('pointermove', onGestureMove);
    window.removeEventListener('pointerup', onGestureEnd);
    window.removeEventListener('pointercancel', cancelGesture);
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
    window.removeEventListener('pointercancel', cancelGesture);
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
        const widget: GridWidget<T> = { ...finalRect, id: genKey(), type: def.type, title: def.title };
        setLayout(prev => solved ? solved.map(item => item.id === '__dragging__' ? widget : item) : packLayout([...prev, widget]));
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
    if (!el || el.clientWidth <= 0) return;
    const bounds = el.getBoundingClientRect();
    const grab = getWidgetGrab(e.clientX, e.clientY, bounds, widget);
    gestureRef.current = { mode, w: widget, sx: e.clientX, sy: e.clientY - bounds.top, lastX: e.clientX, lastY: e.clientY, col: widget.col, row: widget.row, ww: widget.w, hh: widget.h, grabX: grab.x, grabY: grab.y };
    const start: GridRect = { col: widget.col, row: widget.row, w: widget.w, h: widget.h };
    draftRef.current = start;
    setDraft(start);
    setActiveDragId(widget.id);
    setSuppressMotion(false);
    const solved = solveLayout(gestureRef.current, start);
    solvedLayoutRef.current = solved.widgets;
    setPreviewLayout(solved.widgets);
    window.addEventListener('pointermove', onGestureMove);
    window.addEventListener('pointerup', onGestureEnd);
    window.addEventListener('pointercancel', cancelGesture);
    window.addEventListener('keydown', onGestureKey);
    startAutoScroll();
  }, [onGestureEnd, onGestureKey, onGestureMove, solveLayout, startAutoScroll]);

  const onPanelItemPointerDown = useCallback((def: GridWidgetDef<T>) => (e: React.PointerEvent) => {
    if (hasWidget(def.type)) return;
    if (e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const source = e.currentTarget.getBoundingClientRect();
    panelPendingRef.current = { def, sx, sy, grabX: sx - source.left, grabY: sy - source.top };
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
      const bounds = gridRef.current?.getBoundingClientRect();
      if (!bounds || bounds.width <= 0) return;
      const dimensions = normalizeWidget({ col: 1, row: 1, w: p.def.w, h: p.def.h });
      gestureRef.current = { mode: 'panel', def: p.def, sx, sy, lastX: ev.clientX, lastY: ev.clientY, col: 1, row: 1, ww: dimensions.w, hh: dimensions.h, grabX: p.grabX, grabY: p.grabY };
      setActiveDragId('__dragging__');
      setSuppressMotion(false);
      const rect = moveWidgetFromGrab(ev.clientX, ev.clientY, bounds, { x: p.grabX, y: p.grabY }, dimensions);
      const solved = solveLayout(gestureRef.current, rect);
      solvedLayoutRef.current = solved.widgets;
      draftRef.current = solved.activeRect;
      setDraft(solved.activeRect);
      setPreviewLayout(solved.widgets);
      window.addEventListener('pointermove', onGestureMove);
      window.addEventListener('pointerup', onGestureEnd);
      window.addEventListener('pointercancel', cancelGesture);
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
  }, [hasWidget, onGestureEnd, onGestureKey, onGestureMove, solveLayout, startAutoScroll]);

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
    setLayout(packLayout(defaultLayout()));
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
    addWidget,
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
