import { useCallback, useEffect, useState } from 'react';

interface AnchorPos {
  top: number;
  left: number;
}

/**
 * Anchors a fixed-position popup just below a given element (e.g. a column
 * header), keeping it attached while the page/containers scroll or resize.
 */
export function useAnchoredPopup(maxWidth = 448) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [pos, setPos] = useState<AnchorPos | null>(null);

  const reposition = useCallback(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = Math.min(maxWidth, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    setPos({ top: rect.bottom + 8, left });
  }, [anchor, maxWidth]);

  const open = useCallback((el: HTMLElement) => {
    setAnchor(el);
  }, []);

  const close = useCallback(() => {
    setAnchor(null);
    setPos(null);
  }, []);

  useEffect(() => {
    if (!anchor) {
      setPos(null);
      return;
    }
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [anchor, reposition]);

  return { open, close, pos };
}
