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
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [dragId, setDragId] = useState<string | null>(null);
  const [previewOrder, setPreviewOrder] = useState<Attachment[] | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const previewRef = useRef<Attachment[] | null>(null);
  const rafRef = useRef<number | null>(null);

  const display = previewOrder ?? attachments;

  const getInsertIndex = useCallback((clientX: number, clientY: number, draggedId: string) => {
    const ids = (previewRef.current ?? attachments).map(i => i.id);
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
  }, [attachments]);

  const onPointerDown = (e: React.PointerEvent, id: string) => {
    const el = itemRefs.current.get(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragIdRef.current = id;
    previewRef.current = [...attachments];
    setDragId(id);
    setPreviewOrder([...attachments]);
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
      const origIds = attachments.map(i => i.id).join(',');
      const newIds = finalOrder.map(i => i.id).join(',');
      if (origIds !== newIds) onReorder(finalOrder);
    }
    dragIdRef.current = null;
    previewRef.current = null;
    setDragId(null);
    setPreviewOrder(null);
    setGhostPos(null);
  }, [attachments, onReorder]);

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

  if (attachments.length === 0) return null;

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl p-1 -m-1 transition-colors select-none ${dragId ? 'bg-primary/5 border border-dashed border-primary/20 cursor-grabbing' : ''}`}>
      {display.map((a) => {
        const isDragged = dragId === a.id;
        return (
          <div
            key={a.id}
            ref={(el) => { if (el) itemRefs.current.set(a.id, el); else itemRefs.current.delete(a.id); }}
            className={`relative ${isDragged ? 'opacity-30 border-dashed border-primary/50 scale-[0.97] z-0 border rounded-xl' : 'hover:shadow-md'}`}
            style={{ transition: isDragged ? 'none' : 'transform 200ms cubic-bezier(0.22,1,0.36,1), opacity 150ms, border-color 150ms' }}
          >
            <div className="relative">
              <AttachmentRow attachment={a} taskId={taskId} taskTitle={taskTitle} onDelete={() => onDelete(a.id)} dragHandleProps={{ onPointerDown: (e: any) => onPointerDown(e, a.id) }} />
            </div>
          </div>
        );
      })}
      {dragId && ghostPos && (() => { const dragged = attachments.find(x => x.id === dragId); if (!dragged) return null; return <div className="fixed pointer-events-none z-50 rounded-xl shadow-2xl ring-2 ring-primary bg-card border opacity-95 scale-105 flex items-center gap-3 p-3" style={{ left: ghostPos.x, top: ghostPos.y, width: ghostPos.w, height: ghostPos.h }}><div className="p-1"><GripVertical className="w-4 h-4 text-muted-foreground" /></div><span className="text-sm truncate flex-1">{dragged.fileName}</span></div>; })()}
    </div>
  );
};

export default FreeAttachmentList;
