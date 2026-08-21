import React from 'react';

interface CenteredDragCloneProps {
  draggableProps: any;
  dragHandleProps?: any;
  innerRef?: any;
  style: any;
  zoom?: number;
  children: React.ReactNode;
}

const parseSize = (v: string | number | undefined): number | null => {
  if (v === undefined || v === null || v === 'auto') return null;
  if (typeof v === 'number') return v || null;
  const s = String(v).trim();
  if (s.endsWith('px')) return parseFloat(s) || null;
  if (s.endsWith('rem')) return (parseFloat(s) || 0) * 16 || null;
  const n = Number(s);
  return Number.isFinite(n) && n !== 0 ? n : null;
};

const getRenderedDimensions = (style: any) => {
  const w = parseSize(style?.width);
  const h = parseSize(style?.height);
  return { w, h };
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
        width: renderedW != null ? renderedW / zoom : undefined,
        minWidth: renderedW == null ? 320 : undefined,
        height: renderedH != null ? renderedH / zoom : 'auto',
        zIndex: style?.zIndex ?? 5000,
        opacity: typeof style?.opacity === 'number' ? style.opacity : undefined,
        transition: 'none',
        transform: `translate(${tx}px, ${ty}px) scale(${zoom})`,
        transformOrigin: '0 0',
        pointerEvents: 'none',
      }}
    >
      <div style={{ width: '100%', height: renderedH != null ? '100%' : 'auto' }}>{children}</div>
    </div>
  );
};

export default CenteredDragClone;