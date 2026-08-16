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
    const onMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const match = String(style?.transform || '').match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  const dx = match ? Number(match[1]) : 0;
  const dy = match ? Number(match[2]) : 0;

  const renderedW = style?.width ?? 0;
  const renderedH = style?.height ?? 0;
  const p = pointerRef.current;
  const tx = p ? p.x - renderedW / 2 - (style?.left ?? 0) : dx;
  const ty = p ? p.y - renderedH / 2 - (style?.top ?? 0) : dy;

  return (
    <div
      {...draggableProps}
      {...dragHandleProps}
      ref={innerRef}
      style={{
        position: 'fixed',
        top: style?.top ?? 0,
        left: style?.left ?? 0,
        boxSizing: 'border-box',
        width: renderedW / zoom,
        height: renderedH / zoom,
        zIndex: style?.zIndex ?? 5000,
        opacity: typeof style?.opacity === 'number' ? style.opacity : undefined,
        transition: style?.transition,
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