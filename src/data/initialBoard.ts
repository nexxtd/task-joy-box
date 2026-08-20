import { Board } from '@/types/board';

export const emptyBoard: Board = {
  id: 'board-1',
  title: 'My Board',
  columns: [
    { id: 'col-to-do', title: 'To Do', order: 0, projectId: null, color: '' },
    { id: 'col-in-progress', title: 'In Progress', order: 1, projectId: null, color: '' },
    { id: 'col-done', title: 'Done', order: 2, projectId: null, color: '' },
  ],
  tasks: [],
};
