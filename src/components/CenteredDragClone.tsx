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
  if (!style) {
    return (
      <div ref={innerRef} {...draggableProps} {...dragHandleProps} style={{ pointerEvents: 'none' }}>
        {children}
      </div>
    );
  }
  const rawTransform = String(style?.transform || '');
  let dx = 0;
  let dy = 0;
  const m2 = rawTransform.match(/translate\(\s*([-\d.]+)px,?\s*([-\d.]+)px/);
  const m3 = rawTransform.match(/translate3d\(\s*([-\d.]+)px,?\s*([-\d.]+)px/);
  const m = m2 || m3;
  if (m) {
    dx = Number(m[1]) || 0;
    dy = Number(m[2]) || 0;
  }
  const left = typeof style?.left === 'number' ? style.left : Number(style?.left) || 0;
  const top = typeof style?.top === 'number' ? style.top : Number(style?.top) || 0;
  const tx = dx + left;
  const ty = dy + top;
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
        width: renderedW ? renderedW / zoom : undefined,
        height: renderedH ? renderedH / zoom : undefined,
        zIndex: style?.zIndex ?? 5000,
        opacity: typeof style?.opacity === 'number' ? style.opacity : undefined,
        transition: 'none',
        transform: `translate(${tx}px, ${ty}px)${zoom !== 1 ? ` scale(${zoom})` : ''}`,
        transformOrigin: '0 0',
        pointerEvents: 'none',
      }}
    >
      <div style={{ width: '100%', height: '100%' }}>{children}</div>
    </div>
  );
};

export default CenteredDragClone;