import React, { useRef, useState, useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import { Attachment } from '@/types/board';
import AttachmentRow from '@/components/AttachmentRow';

export const FreeAttachmentList: React.FC<{
  attachments: Attachment[];
  onReorder: (newItems: Attachment[]) => void;
  onDelete: (id: string) => void;
  taskId: string | number;
  taskTitle?: string;
}> = ({ attachments, onReorder, onDelete, taskId, taskTitle }) => {
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Attachment[] | null>(null);
  const dragRef = useRef<string | null>(null);
  const previewRef = useRef<Attachment[] | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  const display = preview ?? attachments;

  const getInsertIndex = useCallback((clientX: number, clientY: number, did: string) => {
    const ids = (previewRef.current ?? attachments).map(a => a.id);
    const draggedIdx = ids.indexOf(did);
    if (draggedIdx === -1) return 0;
    let bestIdx = 0;
    let bestDist = Infinity;
    ids.forEach((id, idx) => {
      if (id === did) return;
      const el = itemRefs.current.get(id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
    });
    const targetId = ids[bestIdx];
    const targetEl = targetId ? itemRefs.current.get(targetId) : null;
    if (targetEl) {
      const r = targetEl.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const grid = containerRef.current;
      const isGrid = grid ? window.getComputedStyle(grid).gridTemplateColumns.split(' ').length > 1 : false;
      let isAfter: boolean;
      if (isGrid) {
        isAfter = clientY > cy + 4 || (Math.abs(clientY - cy) < 20 && clientX > cx);
      } else {
        isAfter = clientY > cy;
      }
      let insert = isAfter ? bestIdx + 1 : bestIdx;
      const from = ids.indexOf(did);
      if (from !== -1 && from < insert) insert -= 1;
      return Math.max(0, Math.min(insert, ids.length - 1));
    }
    return bestIdx;
  }, [attachments]);

  const onDown = (e: React.PointerEvent, id: string) => {
    const el = itemRefs.current.get(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragRef.current = id;
    previewRef.current = [...attachments];
    setDragId(id);
    setPreview([...attachments]);
    setGhostPos({ x: e.clientX - r.width / 2, y: e.clientY - r.height / 2, w: r.width, h: r.height });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onMove = useCallback((e: PointerEvent) => {
    const did = dragRef.current;
    if (!did || !previewRef.current) return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setGhostPos(prev => prev ? { ...prev, x: e.clientX - prev.w / 2, y: e.clientY - prev.h / 2 } : null);
      const idx = getInsertIndex(e.clientX, e.clientY, did);
      const cur = [...previewRef.current!];
      const from = cur.findIndex(a => a.id === did);
      if (from === -1 || from === idx) return;
      const [m] = cur.splice(from, 1);
      cur.splice(idx, 0, m);
      previewRef.current = cur;
      setPreview([...cur]);
    });
  }, [getInsertIndex]);

  const onUp = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const did = dragRef.current;
    if (did && previewRef.current) {
      const finalOrder = [...previewRef.current];
      const orig = attachments.map(a => a.id).join(',');
      const now = finalOrder.map(a => a.id).join(',');
      if (orig !== now) onReorder(finalOrder);
    }
    dragRef.current = null;
    previewRef.current = null;
    setDragId(null);
    setPreview(null);
    setGhostPos(null);
  }, [attachments, onReorder]);

  React.useEffect(() => {
    if (!dragId) return;
    const m = (e: PointerEvent) => onMove(e);
    const u = () => onUp();
    window.addEventListener('pointermove', m);
    window.addEventListener('pointerup', u);
    window.addEventListener('pointercancel', u);
    return () => { window.removeEventListener('pointermove', m); window.removeEventListener('pointerup', u); window.removeEventListener('pointercancel', u); if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [dragId, onMove, onUp]);

  if (attachments.length === 0) return null;

  return (
    <div ref={containerRef} className={`grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl p-1 -m-1 transition-colors ${dragId ? 'bg-primary/5 border border-dashed border-primary/20' : ''}`}>
      {display.map((a) => {
        const isDragged = dragId === a.id;
        return (
          <div key={a.id} ref={el => { if (el) itemRefs.current.set(a.id, el); else itemRefs.current.delete(a.id); }} className={`${isDragged ? 'opacity-30 border border-dashed border-primary/40 rounded-xl scale-[0.98]' : ''} transition-all duration-200`}>
            <div className="relative" style={{ transition: isDragged ? 'none' : 'transform 200ms cubic-bezier(0.22,1,0.36,1)' }}>
              <AttachmentRow attachment={a} taskId={taskId} taskTitle={taskTitle} onDelete={() => onDelete(a.id)} dragHandleProps={{ onPointerDown: (e: any) => onDown(e, a.id) }} />
            </div>
          </div>
        );
      })}
      {dragId && ghostPos && (() => { const dragged = attachments.find(x => x.id === dragId); if (!dragged) return null; return <div className="fixed pointer-events-none z-50 rounded-xl shadow-2xl ring-2 ring-primary bg-card border opacity-95 flex items-center gap-3 p-3" style={{ left: ghostPos.x, top: ghostPos.y, width: ghostPos.w, height: ghostPos.h }}><div className="p-1"><GripVertical className="w-4 h-4 text-muted-foreground" /></div><span className="text-sm truncate flex-1">{dragged.fileName}</span></div>; })()}
    </div>
  );
};

export default FreeAttachmentList;
