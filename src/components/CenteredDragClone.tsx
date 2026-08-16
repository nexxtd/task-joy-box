import React, { useEffect, useRef } from 'react';

interface CenteredDragCloneProps {
  draggableProps: any;
  dragHandleProps?: any;
  innerRef?: any;
  style: any;
  zoom?: number;
  children: React.ReactNode;
}

const CenteredDragClone: React.FC<CenteredDragCloneProps> = ({
  draggableProps,
  dragHandleProps,
  innerRef,
  style,
  zoom = 1,
  children,
}) => {
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (e: any) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('dragover', onMove, { passive: true });
    window.addEventListener('dragenter', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('dragover', onMove);
      window.removeEventListener('dragenter', onMove);
    };
  }, []);

  const match = String(style?.transform || '').match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  const dx = match ? Number(match[1]) : 0;
  const dy = match ? Number(match[2]) : 0;

  const renderedW = style?.width ?? 0;
  const renderedH = style?.height ?? 0;
  const p = pointerRef.current;
  const anchored = p !== null;
  const tx = anchored ? p.x - renderedW / 2 : dx + (style?.left ?? 0);
  const ty = anchored ? p.y - renderedH / 2 : dy + (style?.top ?? 0);

  return (
    <div
      {...draggableProps}
      {...dragHandleProps}
      ref={innerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        boxSizing: 'border-box',
        width: renderedW / zoom,
        height: renderedH / zoom,
        zIndex: style?.zIndex ?? 5000,
        opacity: typeof style?.opacity === 'number' ? style.opacity : undefined,
        transition: 'none',
        transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
        transformOrigin: '0 0',
        pointerEvents: 'none',
      }}
    >
      <div style={{ width: '100%', height: '100%' }}>{children}</div>
    </div>
  );
};

export default CenteredDragClone;