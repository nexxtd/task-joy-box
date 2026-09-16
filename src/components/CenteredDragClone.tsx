import React from 'react';
import { createPortal } from 'react-dom';
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
  if (!style || typeof document === 'undefined') {
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
  // dnd positions the clone with position:fixed + viewport coordinates, which keeps
  // the exact grabbed point under the cursor. Portal to body so ancestor transforms
  // (board zoom/pan) can't offset it. dnd includes explicit width/height in style,
  // so the clone keeps the grabbed row's dimensions.
  return createPortal(
    <div ref={innerRef} {...draggableProps} {...dragHandleProps} style={s}>
      {children}
    </div>,
    document.body
  );
};
export default CenteredDragClone;
