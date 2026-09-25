import React from 'react';
import { Image, Trash2, GripVertical } from 'lucide-react';
import { Attachment } from '@/types/board';
import { useFreeReorderDrag } from '@/hooks/useFreeReorderDrag';

interface DraggableImageGridProps {
  images: Attachment[];
  onReorder: (newImages: Attachment[]) => void;
  onRemove: (id: string) => void;
  disabledInBuilder?: boolean;
  droppableId?: string;
}

const getImageSrc = (img: Attachment) => {
  // Server-stored attachments have numeric ids and fileUrl like /uploads/...
  // Use the authenticated API endpoint which is reliably accessible via cookie auth.
  // Data URLs (fallback / legacy) are used as-is.
  if (/^\d+$/.test(String(img.id)) && img.fileUrl && !img.fileUrl.startsWith('data:')) {
    return `/api/attachments/file/${img.id}`;
  }
  return img.fileUrl;
};

export const DraggableImageGrid: React.FC<DraggableImageGridProps> = ({
  images,
  onReorder,
  onRemove,
}) => {
  const { displayItems, dragId, ghostPos, onPointerDown, setItemRef } = useFreeReorderDrag({
    items: images,
    onReorder,
  });

  if (images.length === 0) return null;

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 select-none ${dragId ? 'cursor-grabbing bg-primary/5 rounded-xl p-1 border border-dashed border-primary/20' : ''}`}>
      {displayItems.map((img) => {
        const isDragged = dragId === img.id;
        return (
          <div
            key={img.id}
            ref={(el) => setItemRef(img.id, el)}
            className={`relative group/img aspect-square rounded-xl border bg-muted/40 overflow-hidden ${isDragged ? 'opacity-30 border-dashed border-primary/50 scale-[0.97] z-0' : 'hover:border-primary/40 hover:shadow-md border-border'}`}
            style={{ transition: isDragged ? 'none' : 'transform 200ms cubic-bezier(0.22,1,0.36,1), opacity 150ms, border-color 150ms' }}
          >
            <div
              onPointerDown={(e) => onPointerDown(e, img.id)}
              className="absolute top-1.5 left-1.5 p-1 rounded-lg bg-black/40 text-white/80 opacity-0 group-hover/img:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-20 touch-none"
              title="Drag to reorder - drop anywhere"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </div>
            {img.fileUrl ? (
              <img src={getImageSrc(img)} alt={img.fileName} loading="lazy" decoding="async" draggable={false} className="w-full h-full object-cover pointer-events-none" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="w-full h-full flex items-center justify-center"><Image className="w-8 h-8 text-muted-foreground" /></div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6 pointer-events-none">
              <p className="text-xs font-medium text-white truncate">{img.fileName}</p>
              {img.fileSize != null && <p className="text-[10px] text-white/70">{(img.fileSize / 1024).toFixed(1)} KB</p>}
            </div>
            <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(img.id); }} className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/img:opacity-100 transition-all shadow-sm z-20 cursor-pointer" title="Remove image">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
      {dragId && ghostPos && (() => {
        const dragged = images.find(i => i.id === dragId);
        if (!dragged) return null;
        return (
          <div className="fixed pointer-events-none z-50 rounded-xl overflow-hidden shadow-2xl ring-2 ring-primary border-primary/50 opacity-95 scale-105 rotate-1 will-change-transform" style={{ left: 0, top: 0, transform: `translate3d(${ghostPos.x}px, ${ghostPos.y}px, 0)`, width: ghostPos.w, height: ghostPos.h }}>
            {dragged.fileUrl ? <img src={getImageSrc(dragged)} alt={dragged.fileName} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-muted"><Image className="w-8 h-8" /></div>}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2"><p className="text-xs text-white truncate">{dragged.fileName}</p></div>
          </div>
        );
      })()}
    </div>
  );
};

export default DraggableImageGrid;
