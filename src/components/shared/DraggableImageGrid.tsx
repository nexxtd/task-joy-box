import React, { useRef, useState, useCallback } from 'react';
import { Image, Trash2, GripVertical } from 'lucide-react';
import { Attachment } from '@/types/board';

interface DraggableImageGridProps {
  images: Attachment[];
  onReorder: (newImages: Attachment[]) => void;
  onRemove: (id: string) => void;
  disabledInBuilder?: boolean;
  droppableId?: string;
}

export const DraggableImageGrid: React.FC<DraggableImageGridProps> = ({
  images,
  onReorder,
  onRemove,
}) => {
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [dragId, setDragId] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<Attachment[] | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const previewRef = useRef<Attachment[] | null>(null);
  const rafRef = useRef<number | null>(null);

  const display = previewOrder ?? images;

  const getInsertIndex = useCallback((clientX: number, clientY: number, draggedId: string) => {
    const ids = (previewRef.current ?? images).map(i => i.id);
    const draggedIdx = ids.indexOf(draggedId);
    if (draggedIdx === -1) return 0;
    let bestIdx = 0;
    let bestDist = Infinity;
    ids.forEach((id, idx) => {
      if (id === draggedId) return;
      const el = itemRefs.current.get(id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    const targetId = ids[bestIdx];
    const targetEl = targetId ? itemRefs.current.get(targetId) : null;
    if (targetEl) {
      const r = targetEl.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const isAfter = clientY > cy + 6 || (Math.abs(clientY - cy) < 18 && clientX > cx);
      let insertIdx = isAfter ? bestIdx + 1 : bestIdx;
      if (draggedIdx < insertIdx) insertIdx -= 1;
      return Math.max(0, Math.min(insertIdx, ids.length - 1));
    }
    return bestIdx;
  }, [images]);

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    const el = itemRefs.current.get(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragIdRef.current = id;
    previewRef.current = [...images];
    setDragId(id);
    setPreviewOrder([...images]);
    setGhostPos({ x: e.clientX - r.width / 2, y: e.clientY - r.height / 2, w: r.width, h: r.height });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = useCallback((e: PointerEvent) => {
    const did = dragIdRef.current;
    if (!did || !previewRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setGhostPos(prev => prev ? { ...prev, x: e.clientX - prev.w / 2, y: e.clientY - prev.h / 2 } : null);
      const idx = getInsertIndex(e.clientX, e.clientY, did);
      const cur = [...previewRef.current!];
      const from = cur.findIndex(i => i.id === did);
      if (from === -1 || from === idx) return;
      const [moved] = cur.splice(from, 1);
      cur.splice(idx, 0, moved);
      previewRef.current = cur;
      setPreviewOrder([...cur]);
    });
  }, [getInsertIndex]);

  const onPointerUp = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const did = dragIdRef.current;
    if (did && previewRef.current) {
      const finalOrder = [...previewRef.current];
      const origIds = images.map(i => i.id).join(',');
      const newIds = finalOrder.map(i => i.id).join(',');
      if (origIds !== newIds) onReorder(finalOrder);
    }
    dragIdRef.current = null;
    previewRef.current = null;
    setDragId(null);
    setPreviewOrder(null);
    setGhostPos(null);
  }, [images, onReorder]);

  React.useEffect(() => {
    if (!dragId) return;
    const move = (e: PointerEvent) => onPointerMove(e);
    const up = () => onPointerUp();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [dragId, onPointerMove, onPointerUp]);

  if (images.length === 0) return null;

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 select-none ${dragId ? 'cursor-grabbing bg-primary/5 rounded-xl p-1 border border-dashed border-primary/20' : ''}`}>
      {display.map((img) => {
        const isDragged = dragId === img.id;
        return (
          <div
            key={img.id}
            ref={(el) => { if (el) itemRefs.current.set(img.id, el); else itemRefs.current.delete(img.id); }}
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
              <img src={img.fileUrl} alt={img.fileName} className="w-full h-full object-cover pointer-events-none" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
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
          <div className="fixed pointer-events-none z-50 rounded-xl overflow-hidden shadow-2xl ring-2 ring-primary border-primary/50 opacity-95 scale-105" style={{ left: ghostPos.x, top: ghostPos.y, width: ghostPos.w, height: ghostPos.h }}>
            {dragged.fileUrl ? <img src={dragged.fileUrl} alt={dragged.fileName} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center bg-muted"><Image className="w-8 h-8" /></div>}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2"><p className="text-xs text-white truncate">{dragged.fileName}</p></div>
          </div>
        );
      })()}
    </div>
  );
};

export default DraggableImageGrid;
