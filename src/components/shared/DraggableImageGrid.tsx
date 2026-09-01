import React from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Image, Trash2, GripVertical } from 'lucide-react';
import { Attachment } from '@/types/board';
import { useLanguage } from '@/context/LanguageContext';

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
  disabledInBuilder = false,
  droppableId = "images-grid",
}) => {
  const { t } = useLanguage();
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const reordered = Array.from(images);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    onReorder(reordered);
  };

  if (images.length === 0) return null;

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId={droppableId} direction="horizontal">
        {(droppableProvided, droppableSnapshot) => (
          <div
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className={`grid grid-cols-2 sm:grid-cols-3 gap-3 draggable-image-grid transition-colors ${droppableSnapshot.isDraggingOver ? 'bg-primary/5 rounded-xl p-1' : ''}`}
          >
            {images.map((img, index) => (
              <Draggable key={img.id} draggableId={img.id} index={index}>
                {(draggableProvided, snapshot) => (
                  <div
                    ref={draggableProvided.innerRef}
                    {...draggableProvided.draggableProps}
                    className={`relative group/img aspect-square rounded-xl border border-border bg-muted/40 overflow-hidden transition-all duration-150 select-none ${
                      snapshot.isDragging
                        ? 'shadow-2xl ring-2 ring-primary border-primary/50 z-50 scale-105 opacity-90'
                        : 'hover:border-primary/40 hover:shadow-md'
                    }`}
                    style={{ ...draggableProvided.draggableProps.style, transition: snapshot.isDragging ? draggableProvided.draggableProps.style?.transition : 'all 180ms cubic-bezier(0.22,1,0.36,1)' } as any}
                  >
                    <div
                      {...draggableProvided.dragHandleProps}
                      className="absolute top-1.5 left-1.5 p-1 rounded-lg bg-black/40 text-white/80 opacity-0 group-hover/img:opacity-100 transition-opacity cursor-grab active:cursor-grabbing z-20"
                      title="Drag to reorder"
                    >
                      <GripVertical className="w-3.5 h-3.5" />
                    </div>

                    {img.fileUrl ? (
                      <img
                        src={img.fileUrl}
                        alt={img.fileName}
                        className="w-full h-full object-cover pointer-events-none"
                        onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Image className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}

                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6 pointer-events-none">
                      <p className="text-xs font-medium text-white truncate">{img.fileName}</p>
                      {img.fileSize != null && (
                        <p className="text-[10px] text-white/70">{(img.fileSize / 1024).toFixed(1)} KB</p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemove(img.id);
                      }}
                      className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-background/80 border border-border text-muted-foreground hover:text-destructive opacity-0 group-hover/img:opacity-100 transition-all shadow-sm z-20 cursor-pointer"
                      title="Remove image"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </Draggable>
            ))}
            {droppableProvided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

export default DraggableImageGrid;
