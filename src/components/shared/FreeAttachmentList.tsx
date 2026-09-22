import React from 'react';
import { GripVertical } from 'lucide-react';
import { Attachment } from '@/types/board';
import AttachmentRow from '@/components/AttachmentRow';
import { useFreeReorderDrag } from '@/hooks/useFreeReorderDrag';

export const FreeAttachmentList: React.FC<{
  attachments: Attachment[];
  onReorder: (newItems: Attachment[]) => void;
  onDelete: (id: string) => void;
  taskId: string | number;
  taskTitle?: string;
}> = ({ attachments, onReorder, onDelete, taskId, taskTitle }) => {
  const { displayItems, dragId, ghostPos, onPointerDown, setItemRef } = useFreeReorderDrag({
    items: attachments,
    onReorder,
  });

  if (attachments.length === 0) return null;

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl p-1 -m-1 transition-colors select-none ${dragId ? 'bg-primary/5 border border-dashed border-primary/20 cursor-grabbing' : ''}`}>
      {displayItems.map((a) => {
        const isDragged = dragId === a.id;
        return (
          <div
            key={a.id}
            ref={(el) => setItemRef(a.id, el)}
            className={`relative ${isDragged ? 'opacity-30 border-dashed border-primary/50 scale-[0.97] z-0 border rounded-xl' : 'hover:shadow-md hover:border-primary/40'}`}
            style={{ transition: isDragged ? 'none' : 'transform 200ms cubic-bezier(0.22,1,0.36,1), opacity 150ms, border-color 150ms' }}
          >
            <div className="relative">
              <AttachmentRow attachment={a} taskId={taskId} taskTitle={taskTitle} onDelete={() => onDelete(a.id)} dragHandleProps={{ onPointerDown: (e: any) => onPointerDown(e, a.id) }} />
            </div>
          </div>
        );
      })}
      {dragId && ghostPos && (() => { const dragged = attachments.find(x => x.id === dragId); if (!dragged) return null; return <div className="fixed pointer-events-none z-50 rounded-xl shadow-2xl ring-2 ring-primary bg-card border opacity-95 scale-105 rotate-1 flex items-center gap-3 p-3 will-change-transform" style={{ left: 0, top: 0, transform: `translate3d(${ghostPos.x}px, ${ghostPos.y}px, 0)`, width: ghostPos.w, height: ghostPos.h }}><div className="p-1"><GripVertical className="w-4 h-4 text-muted-foreground" /></div><span className="text-sm truncate flex-1">{dragged.fileName}</span></div>; })()}
    </div>
  );
};

export default FreeAttachmentList;
