import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical } from 'lucide-react';
import AttachmentRow from '@/components/AttachmentRow';
import { useFreeReorderDrag } from '@/hooks/useFreeReorderDrag';

type DraftFileItem = {
  id: string;
  file: File;
};

// Files don't carry ids, and the create modal keeps plain File[] state. A
// WeakMap gives every File object a stable id for as long as it is attached,
// so drag previews keep tracking the right row after reordering.
const fileIds = new WeakMap<File, string>();
const idForFile = (file: File): string => {
  let id = fileIds.get(file);
  if (!id) {
    id = crypto.randomUUID();
    fileIds.set(file, id);
  }
  return id;
};

interface DraftFileListProps {
  files: File[];
  onChange: (files: File[]) => void;
  onRemove: (file: File) => void;
  emptyLabel?: string;
}

/**
 * Reorderable list of files attached while creating a task or note.
 * Uses the same free-drag system as attachments on saved tasks.
 */
const DraftFileList: React.FC<DraftFileListProps> = ({
  files,
  onChange,
  onRemove,
  emptyLabel,
}) => {
  const items = useMemo<DraftFileItem[]>(
    () => files.map(file => ({ id: idForFile(file), file })),
    [files],
  );

  const { displayItems, dragId, ghostPos, onPointerDown, setItemRef } = useFreeReorderDrag({
    items,
    onReorder: ordered => onChange(ordered.map(item => item.file)),
  });

  if (files.length === 0) {
    return emptyLabel ? (
      <p className="text-xs text-muted-foreground">{emptyLabel}</p>
    ) : null;
  }

  return (
    <div
      className={`grid grid-cols-1 gap-2 rounded-xl p-1 -m-1 transition-colors select-none ${
        dragId ? 'bg-primary/5 border border-dashed border-primary/20 cursor-grabbing' : ''
      }`}
    >
      {displayItems.map(item => {
        const isDragged = dragId === item.id;
        return (
          <div
            key={item.id}
            ref={el => setItemRef(item.id, el)}
            className={`relative ${
              isDragged
                ? 'opacity-30 border-dashed border-primary/50 scale-[0.97] z-0 border rounded-xl'
                : 'hover:shadow-md hover:border-primary/40'
            }`}
            style={{
              transition: isDragged
                ? 'none'
                : 'transform 200ms cubic-bezier(0.22,1,0.36,1), opacity 150ms, border-color 150ms',
            }}
          >
            <AttachmentRow
              attachment={{
                id: item.id,
                fileName: item.file.name,
                fileSize: item.file.size,
                fileType: item.file.type,
                fileUrl: '',
              }}
              taskId="draft"
              onDelete={() => onRemove(item.file)}
              disabledInBuilder
              dragHandleProps={{
                onPointerDown: (event: React.PointerEvent) => onPointerDown(event, item.id),
              }}
            />
          </div>
        );
      })}

      {dragId && ghostPos
        ? (() => {
            const dragged = files.find(file => idForFile(file) === dragId);
            if (!dragged) return null;
            return createPortal(
              <div
                className="fixed pointer-events-none z-[100] rounded-xl shadow-2xl ring-2 ring-primary bg-card border opacity-95 scale-105 rotate-1 flex items-center gap-3 p-3 will-change-transform"
                style={{
                  left: 0,
                  top: 0,
                  transform: `translate3d(${ghostPos.x}px, ${ghostPos.y}px, 0)`,
                  width: ghostPos.w,
                  height: ghostPos.h,
                }}
              >
                <div className="p-1">
                  <GripVertical className="w-4 h-4 text-muted-foreground" />
                </div>
                <span className="text-sm truncate flex-1">{dragged.name}</span>
              </div>,
              document.body,
            );
          })()
        : null}
    </div>
  );
};

export default DraftFileList;
