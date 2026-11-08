import React, { useCallback, useMemo, useRef, useState } from 'react';

type GhostPosition = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type UseFreeReorderDragOptions<T extends { id: string }> = {
  items: T[];
  onReorder: (items: T[]) => void;
};

const MOVE_EPSILON = 3; // Increased to prevent jitter from micro-movements / trackpad tremor
const DRAG_START_THRESHOLD = 4; // Require 4px movement before reordering starts, prevents accidental jumps on click

export function useFreeReorderDrag<T extends { id: string }>({
  items,
  onReorder,
}: UseFreeReorderDragOptions<T>) {
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const dragIdRef = useRef<string | null>(null);
  const previewRef = useRef<T[] | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const startPointerRef = useRef<{ x: number; y: number } | null>(null);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const grabOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const hasMovedRef = useRef(false);

  const [dragId, setDragId] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<T[] | null>(null);
  const [ghostPos, setGhostPos] = useState<GhostPosition | null>(null);

  const displayItems = previewOrder ?? items;

  const setItemRef = useCallback((id: string, node: HTMLElement | null) => {
    if (node) itemRefs.current.set(id, node);
    else itemRefs.current.delete(id);
  }, []);

  const getInsertIndexLive = useCallback((clientX: number, clientY: number, draggedId: string) => {
    const current = previewRef.current ?? items;
    const ids = current.map((item) => item.id);
    const draggedIdx = ids.indexOf(draggedId);
    if (draggedIdx === -1) return 0;

    // Read live rects for all items except dragged - ensures positions reflect current reflow
    const liveRects: { id: string; centerX: number; centerY: number; height: number }[] = [];
    for (const item of current) {
      if (item.id === draggedId) continue;
      const el = itemRefs.current.get(item.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      liveRects.push({
        id: item.id,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        height: rect.height,
      });
    }

    if (liveRects.length === 0) return draggedIdx;

    let nearest: { id: string; centerX: number; centerY: number; height: number } | null = null;
    let bestDistance = Infinity;

    for (const rect of liveRects) {
      const dx = clientX - rect.centerX;
      const dy = clientY - rect.centerY;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        nearest = rect;
      }
    }

    if (!nearest) return draggedIdx;

    const draggedRect = itemRefs.current.get(draggedId)?.getBoundingClientRect();
    // A handle at the left edge is always far from a row's horizontal center.
    // Compare row positions instead of pointer distance to decide the axis.
    const sameRow = draggedRect && Math.abs(
      draggedRect.top + draggedRect.height / 2 - nearest.centerY,
    ) < Math.min(draggedRect.height, nearest.height) / 2;
    const isAfter = sameRow
      ? clientX > nearest.centerX
      : clientY > nearest.centerY;
    const targetCurrentIdx = ids.indexOf(nearest.id);
    if (targetCurrentIdx === -1) return draggedIdx;

    let insertIdx = isAfter ? targetCurrentIdx + 1 : targetCurrentIdx;
    if (draggedIdx < insertIdx) insertIdx -= 1;
    return Math.max(0, Math.min(insertIdx, ids.length - 1));
  }, [items]);

  const flushDragFrame = useCallback(() => {
    rafRef.current = null;
    const did = dragIdRef.current;
    const pointer = pendingPointerRef.current;
    if (!did || !pointer || !previewRef.current) return;

    pendingPointerRef.current = null;
    // Keep the ghost anchored to the exact point the user grabbed: the pointer
    // stays where it clicked inside the row, rather than the row's center
    // jumping under the cursor.
    const grab = grabOffsetRef.current;
    setGhostPos((prev) => prev ? { ...prev, x: pointer.x - grab.x, y: pointer.y - grab.y } : null);

    // Only reorder after threshold to prevent jitter on initial hold
    if (!hasMovedRef.current) {
      const start = startPointerRef.current;
      if (start) {
        const dist = Math.hypot(pointer.x - start.x, pointer.y - start.y);
        if (dist < DRAG_START_THRESHOLD) return;
        hasMovedRef.current = true;
      }
    }

    const idx = getInsertIndexLive(pointer.x, pointer.y, did);
    const cur = [...previewRef.current];
    const from = cur.findIndex((item) => item.id === did);
    if (from === -1 || from === idx) return;

    const [moved] = cur.splice(from, 1);
    cur.splice(idx, 0, moved);
    previewRef.current = cur;
    setPreviewOrder(cur);
  }, [getInsertIndexLive]);

  const onPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    const el = itemRefs.current.get(id);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragIdRef.current = id;
    previewRef.current = [...items];
    const startPos = { x: e.clientX, y: e.clientY };
    pointerRef.current = startPos;
    startPointerRef.current = startPos;
    pendingPointerRef.current = null;
    hasMovedRef.current = false;
    // Remember where inside the item the pointer went down. The ghost keeps
    // that same offset, so grabbing a left-edge handle does not re-center the
    // item under the cursor.
    const grabX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const grabY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
    grabOffsetRef.current = { x: grabX, y: grabY };

    setDragId(id);
    setPreviewOrder([...items]);
    setGhostPos({ x: e.clientX - grabX, y: e.clientY - grabY, w: rect.width, h: rect.height });
    // Use setPointerCapture for reliable drag even outside element
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
  }, [items]);

  const onPointerMove = useCallback((e: PointerEvent) => {
    if (!dragIdRef.current || !previewRef.current) return;

    const previous = pointerRef.current;
    if (
      previous &&
      Math.abs(e.clientX - previous.x) < MOVE_EPSILON &&
      Math.abs(e.clientY - previous.y) < MOVE_EPSILON
    ) {
      return;
    }

    pointerRef.current = { x: e.clientX, y: e.clientY };
    pendingPointerRef.current = { x: e.clientX, y: e.clientY };
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(flushDragFrame);
    }
  }, [flushDragFrame]);

  const endDrag = useCallback((event?: PointerEvent) => {
    if (event && dragIdRef.current) {
      pendingPointerRef.current = { x: event.clientX, y: event.clientY };
    }
    // A quick release can arrive before the queued animation frame. Apply its
    // final pointer position before committing the order.
    if (pendingPointerRef.current) flushDragFrame();
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const did = dragIdRef.current;
    if (did && previewRef.current) {
      const finalOrder = [...previewRef.current];
      const origIds = items.map((item) => item.id).join(',');
      const newIds = finalOrder.map((item) => item.id).join(',');
      if (origIds !== newIds) {
        onReorder(finalOrder);
        // Keep previewOrder as finalOrder until parent items prop catches up
        // to avoid flicker "switch back" to original order before re-render
        previewRef.current = [...finalOrder];
        setPreviewOrder([...finalOrder]);
      } else {
        previewRef.current = null;
        setPreviewOrder(null);
      }
    } else {
      previewRef.current = null;
      setPreviewOrder(null);
    }

    dragIdRef.current = null;
    pointerRef.current = null;
    startPointerRef.current = null;
    pendingPointerRef.current = null;
    hasMovedRef.current = false;
    grabOffsetRef.current = { x: 0, y: 0 };
    setDragId(null);
    setGhostPos(null);
  }, [flushDragFrame, items, onReorder]);

  React.useLayoutEffect(() => {
    if (!dragId) return undefined;

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [dragId, endDrag, onPointerMove]);

  // Clear stale preview once parent state has caught up to the reordered result
  // Prevents flicker where display would snap back to original order for one frame
  React.useEffect(() => {
    if (previewOrder && !dragId) {
      const previewIds = previewOrder.map(i => i.id).join(',');
      const currentIds = items.map(i => i.id).join(',');
      if (previewIds === currentIds) {
        setPreviewOrder(null);
        previewRef.current = null;
      }
    }
  }, [items, previewOrder, dragId]);

  return useMemo(() => ({
    displayItems,
    dragId,
    ghostPos,
    onPointerDown,
    setItemRef,
  }), [displayItems, dragId, ghostPos, onPointerDown, setItemRef]);
}
