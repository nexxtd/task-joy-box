import React from 'react';

interface CenteredDragCloneProps {
  draggableProps: any;
  dragHandleProps?: any;
  innerRef?: any;
  style: any;
  zoom?: number;
  children: React.ReactNode;
}

const getRenderedDimensions = (style: any) => {
  const w = style?.width as string | number | undefined;
  const h = style?.height as string | number | undefined;
  // Normalize: convert 'auto' and undefined to null so we can detect them
  const normalizedW = w === 'auto' || w === undefined ? null : Number(w);
  const normalizedH = h === 'auto' || h === undefined ? null : Number(h);
  // If dimensions are null/0/undefined, try to derive sensible defaults
  if (normalizedW === null || normalizedW === 0 || normalizedH === null || normalizedH === 0) {
    // Fall back: use a reasonable default based on typical task row sizes
    // The actual dimensions will be discovered from the child content
    return { w: 200, h: 60 };
  }
  return { w: normalizedW, h: normalizedH };
};

const CenteredDragClone: React.FC<CenteredDragCloneProps> = ({
  draggableProps,
  dragHandleProps,
  innerRef,
  style,
  zoom = 1,
  children,
}) => {
  const match = String(style?.transform || '').match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  const dx = match ? Number(match[1]) : 0;
  const dy = match ? Number(match[2]) : 0;

  // dnd's transform is the offset from where the drag started, and the element's
  // original left/top position. Adding them keeps the exact point the user grabbed
  // (handle/grip) anchored under the cursor instead of centering the clone.
  const tx = dx + (style?.left ?? 0);
  const ty = dy + (style?.top ?? 0);

  const { w: renderedW, h: renderedH } = getRenderedDimensions(style);

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