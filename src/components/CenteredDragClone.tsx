import React from 'react';

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
  const match = String(style?.transform || '').match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  const dx = match ? Number(match[1]) : 0;
  const dy = match ? Number(match[2]) : 0;

  // dnd's transform is the offset from where the drag started, and style.left/top
  // is the element's original layout position. Adding them keeps the exact point
  // the user grabbed (handle/grip) anchored under the cursor instead of centering.
  const tx = dx + (style?.left ?? 0);
  const ty = dy + (style?.top ?? 0);

  const renderedW = style?.width ?? 0;
  const renderedH = style?.height ?? 0;

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