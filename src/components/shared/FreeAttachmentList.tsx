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
  const [preview, setPreview] = useState<Attachment[] | null>(null);
  const dragRef = useRef<string | null>(null);
  const previewRef = useRef<Attachment[] | null>(null);
  const [ghostY, setGhostY] = useState<number | null>(null);

  const display = preview ?? attachments;

  const getIdx = useCallback((y: number, did: string) => {
    const ids = (previewRef.current ?? attachments).map(a => a.id);
    let bestIdx = 0;
    let bestDist = Infinity;
    ids.forEach((id, idx) => {
      if (id === did) return;
      const el = itemRefs.current.get(id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cy = r.top + r.height / 2;
      const dist = Math.abs(y - cy);
      if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
    });
    const targetEl = itemRefs.current.get(ids[bestIdx]);
    if (targetEl) {
      const r = targetEl.getBoundingClientRect();
      const isAfter = y > (r.top + r.height / 2);
      let insert = isAfter ? bestIdx + 1 : bestIdx;
      const from = ids.indexOf(did);
      if (from !== -1 && from < insert) insert -= 1;
      return Math.max(0, Math.min(insert, ids.length - 1));
    }
    return bestIdx;
  }, [attachments]);

  const onDown = (e: React.PointerEvent, id: string) => {
    dragRef.current = id;
    previewRef.current = [...attachments];
    setDragId(id);
    setPreview([...attachments]);
    setGhostY(e.clientY);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMove = useCallback((e: PointerEvent) => {
    const did = dragRef.current;
    if (!did || !previewRef.current) return;
    setGhostY(e.clientY);
    const idx = getIdx(e.clientY, did);
    const cur = [...previewRef.current];
    const from = cur.findIndex(a => a.id === did);
    if (from === -1 || from === idx) return;
    const [m] = cur.splice(from, 1);
    cur.splice(idx, 0, m);
    previewRef.current = cur;
    setPreview([...cur]);
  }, [getIdx]);

  const onUp = useCallback(() => {
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
    setGhostY(null);
  }, [attachments, onReorder]);

  React.useEffect(() => {
    if (!dragId) return;
    const m = (e: PointerEvent) => onMove(e);
    const u = () => onUp();
    window.addEventListener('pointermove', m);
    window.addEventListener('pointerup', u);
    return () => { window.removeEventListener('pointermove', m); window.removeEventListener('pointerup', u); };
  }, [dragId, onMove, onUp]);

  if (attachments.length === 0) return null;

  return (
    <div className={`space-y-1.5 rounded-xl p-1 -m-1 transition-colors ${dragId ? 'bg-primary/5 border border-dashed border-primary/20' : ''}`}>
      {display.map((a) => {
        const isDragged = dragId === a.id;
        return (
          <div key={a.id} ref={el => { if (el) itemRefs.current.set(a.id, el); else itemRefs.current.delete(a.id); }} className={`${isDragged ? 'opacity-40 border border-dashed border-primary/40 rounded-xl scale-[0.98]' : ''} transition-all duration-200`}>
            <div className="relative" style={{ transition: isDragged ? 'none' : 'transform 180ms cubic-bezier(0.22,1,0.36,1)' }}>
              <AttachmentRow attachment={a} taskId={taskId} taskTitle={taskTitle} onDelete={() => onDelete(a.id)} dragHandleProps={{ onPointerDown: (e: any) => onDown(e, a.id) }} />
            </div>
          </div>
        );
      })}
      {dragId && ghostY !== null && (() => { const dragged = attachments.find(x => x.id === dragId); if (!dragged) return null; return <div className="fixed left-1/2 -translate-x-1/2 pointer-events-none z-50 w-[90%] max-w-md rounded-xl shadow-2xl ring-2 ring-primary bg-card border opacity-90" style={{ top: ghostY - 28 }}><div className="flex items-center gap-3 p-3"><div className="p-1"><GripVertical className="w-4 h-4"/></div><span className="text-sm truncate flex-1">{dragged.fileName}</span></div></div>; })()}
    </div>
  );
};

export default FreeAttachmentList;
