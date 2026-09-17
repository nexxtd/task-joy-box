import React, { useCallback, useMemo, useRef, useState } from 'react';

type RectSnapshot = {
  id: string;
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
};

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

const MOVE_EPSILON = 0.5;

export function useFreeReorderDrag<T extends { id: string }>({
  items,
  onReorder,
}: UseFreeReorderDragOptions<T>) {
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const dragIdRef = useRef<string | null>(null);
  const previewRef = useRef<T[] | null>(null);
  const rectsRef = useRef<RectSnapshot[]>([]);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const [dragId, setDragId] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<T[] | null>(null);
  const [ghostPos, setGhostPos] = useState<GhostPosition | null>(null);

  const displayItems = previewOrder ?? items;

  const setItemRef = useCallback((id: string, node: HTMLElement | null) => {
    if (node) itemRefs.current.set(id, node);
    else itemRefs.current.delete(id);
  }, []);

  const snapshotRects = useCallback((draggedId: string) => {
    rectsRef.current = items
      .map((item, index) => {
        const el = itemRefs.current.get(item.id);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          id: item.id,
          index,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
        };
      })
      .filter((rect): rect is RectSnapshot => Boolean(rect) && rect.id !== draggedId);
  }, [items]);

  const getInsertIndex = useCallback((clientX: number, clientY: number, draggedId: string) => {
    const current = previewRef.current ?? items;
    const ids = current.map((item) => item.id);
    const draggedIdx = ids.indexOf(draggedId);
    if (draggedIdx === -1) return 0;

    let nearest: RectSnapshot | null = null;
    let bestDistance = Infinity;

    for (const rect of rectsRef.current) {
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
    setGhostPos((prev) => prev ? { ...prev, x: pointer.x - prev.w / 2, y: pointer.y - prev.h / 2 } : null);

    const idx = getInsertIndex(pointer.x, pointer.y, did);
    const cur = [...previewRef.current];
    const from = cur.findIndex((item) => item.id === did);
    if (from === -1 || from === idx) return;

    const [moved] = cur.splice(from, 1);
    cur.splice(idx, 0, moved);
    previewRef.current = cur;
    setPreviewOrder(cur);
  }, [getInsertIndex]);

  const onPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    const el = itemRefs.current.get(id);
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragIdRef.current = id;
    previewRef.current = [...items];
    pointerRef.current = { x: e.clientX, y: e.clientY };
    pendingPointerRef.current = null;
    snapshotRects(id);

    setDragId(id);
    setPreviewOrder([...items]);
    setGhostPos({ x: e.clientX - rect.width / 2, y: e.clientY - rect.height / 2, w: rect.width, h: rect.height });
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [items, snapshotRects]);

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
    rectsRef.current = [];
    pointerRef.current = null;
    pendingPointerRef.current = null;
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
