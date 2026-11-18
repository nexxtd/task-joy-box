import type React from 'react';

export interface DraggedPlannerItem {
  type: 'task' | 'note';
  id: string;
  title: string;
  column?: string;
}

let activeDraggedItem: DraggedPlannerItem | null = null;

export function setActiveDraggedPlannerItem(item: DraggedPlannerItem | null): void {
  activeDraggedItem = item;
}

export function getActiveDraggedPlannerItem(): DraggedPlannerItem | null {
  return activeDraggedItem;
}

export function startPlannerItemDrag(
  e: React.DragEvent,
  item: DraggedPlannerItem,
): boolean {
  const target = e.target as HTMLElement | null;
  if (
    target?.closest(
      'input, textarea, select, [contenteditable="true"], .kanban-grip, [data-rfd-drag-handle-draggable-id], [class*="cursor-grab"]',
    )
  ) {
    return false;
  }
  const payload: DraggedPlannerItem = {
    type: item.type,
    id: String(item.id),
    title: item.title || (item.type === 'note' ? 'Untitled note' : 'Untitled task'),
    ...(item.column ? { column: item.column } : {}),
  };
  const encoded = JSON.stringify(payload);
  setActiveDraggedPlannerItem(payload);
  try {
    e.dataTransfer.setData('application/x-planner-item', encoded);
    e.dataTransfer.setData('text/plain', encoded);
    e.dataTransfer.effectAllowed = 'copyLink';
  } catch {
    // Ignore environments with synthetic/restricted dataTransfer objects.
  }
  return true;
}

export function endPlannerItemDrag(): void {
  setActiveDraggedPlannerItem(null);
}

