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
  const z = zoom && zoom !== 1 ? zoom : 1;
  const s: any = { ...style };
  if (z !== 1 && s.transform) {
    s.transform = `${s.transform} scale(${z})`;
    s.transformOrigin = '0 0';
  }
  s.pointerEvents = 'none';
  s.zIndex = s.zIndex ?? 5000;
  return (
    <div ref={innerRef} {...draggableProps} {...dragHandleProps} style={s}>
      {children}
    </div>
  );
};
export default CenteredDragClone;
