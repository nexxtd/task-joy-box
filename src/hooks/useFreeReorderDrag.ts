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
    const liveRects: { id: string; centerX: number; centerY: number }[] = [];
    for (const item of current) {
      if (item.id === draggedId) continue;
      const el = itemRefs.current.get(item.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      liveRects.push({
        id: item.id,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
      });
    }

    if (liveRects.length === 0) return draggedIdx;

    let nearest: { id: string; centerX: number; centerY: number } | null = null;
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

    const horizontalIntent = Math.abs(clientX - nearest.centerX) > Math.abs(clientY - nearest.centerY);
    const isAfter = horizontalIntent
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
    // Update ghost position via transform-friendly state (will be used with translate)
    setGhostPos((prev) => prev ? { ...prev, x: pointer.x - prev.w / 2, y: pointer.y - prev.h / 2 } : null);

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

    setDragId(id);
    setPreviewOrder([...items]);
    setGhostPos({ x: e.clientX - rect.width / 2, y: e.clientY - rect.height / 2, w: rect.width, h: rect.height });
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

  const endDrag = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const did = dragIdRef.current;
    if (did && previewRef.current) {
      const finalOrder = [...previewRef.current];
      const origIds = items.map((item) => item.id).join(',');
      const newIds = finalOrder.map((item) => item.id).join(',');
      if (origIds !== newIds) onReorder(finalOrder);
    }

    dragIdRef.current = null;
    previewRef.current = null;
    pointerRef.current = null;
    startPointerRef.current = null;
    pendingPointerRef.current = null;
    hasMovedRef.current = false;
    setDragId(null);
    setPreviewOrder(null);
    setGhostPos(null);
  }, [items, onReorder]);

  React.useEffect(() => {
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

  return useMemo(() => ({
    displayItems,
    dragId,
    ghostPos,
    onPointerDown,
    setItemRef,
  }), [displayItems, dragId, ghostPos, onPointerDown, setItemRef]);
}
