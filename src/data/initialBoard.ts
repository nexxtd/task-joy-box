import { Board } from '@/types/board';

export const emptyBoard: Board = {
  id: 'board-1',
  title: 'My Board',
  columns: [
    { id: 'col-1', title: 'To Do', order: 0, color: 'hsl(var(--muted-foreground))' },
    { id: 'col-2', title: 'In Progress', order: 1, color: 'hsl(var(--label-blue))' },
    { id: 'col-3', title: 'Review', order: 2, color: 'hsl(var(--label-yellow))' },
    { id: 'col-4', title: 'Completed', order: 3, color: 'hsl(var(--label-green))' },
  ],
  tasks: [],
};
