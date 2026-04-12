import React, { createContext, useContext, useState, useCallback } from 'react';
import { Board, Task, Column, Label, Checklist, ChecklistItem, Priority } from '@/types/board';
import { initialBoard } from '@/data/initialBoard';

interface BoardContextType {
  board: Board;
  addTask: (columnId: string, title: string) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  moveTask: (taskId: string, toColumnId: string, newOrder: number) => void;
  addColumn: (title: string) => void;
  updateColumn: (columnId: string, updates: Partial<Column>) => void;
  deleteColumn: (columnId: string) => void;
  reorderColumns: (startIndex: number, endIndex: number) => void;
  addChecklist: (taskId: string, title: string) => void;
  toggleChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  addChecklistItem: (taskId: string, checklistId: string, text: string) => void;
  deleteChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
}

const BoardContext = createContext<BoardContextType | null>(null);

export const useBoardContext = () => {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoardContext must be used within BoardProvider');
  return ctx;
};

const genId = () => crypto.randomUUID();

export const BoardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [board, setBoard] = useState<Board>(initialBoard);

  const addTask = useCallback((columnId: string, title: string) => {
    const tasksInCol = board.tasks.filter(t => t.columnId === columnId);
    const newTask: Task = {
      id: genId(),
      title,
      description: '',
      priority: 'none',
      labels: [],
      checklists: [],
      createdAt: new Date().toISOString().split('T')[0],
      columnId,
      order: tasksInCol.length,
    };
    setBoard(b => ({ ...b, tasks: [...b.tasks, newTask] }));
  }, [board.tasks]);

  const updateTask = useCallback((taskId: string, updates: Partial<Task>) => {
    setBoard(b => ({
      ...b,
      tasks: b.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t),
    }));
  }, []);

  const deleteTask = useCallback((taskId: string) => {
    setBoard(b => ({ ...b, tasks: b.tasks.filter(t => t.id !== taskId) }));
  }, []);

  const moveTask = useCallback((taskId: string, toColumnId: string, newOrder: number) => {
    setBoard(b => {
      const task = b.tasks.find(t => t.id === taskId);
      if (!task) return b;
      const otherTasks = b.tasks.filter(t => t.id !== taskId);
      const colTasks = otherTasks
        .filter(t => t.columnId === toColumnId)
        .sort((a, c) => a.order - c.order);
      colTasks.splice(newOrder, 0, { ...task, columnId: toColumnId });
      const reordered = colTasks.map((t, i) => ({ ...t, order: i }));
      const finalTasks = otherTasks.filter(t => t.columnId !== toColumnId).concat(reordered);
      return { ...b, tasks: finalTasks };
    });
  }, []);

  const addColumn = useCallback((title: string) => {
    const newCol: Column = {
      id: genId(),
      title,
      order: board.columns.length,
      color: 'hsl(var(--muted-foreground))',
    };
    setBoard(b => ({ ...b, columns: [...b.columns, newCol] }));
  }, [board.columns.length]);

  const updateColumn = useCallback((columnId: string, updates: Partial<Column>) => {
    setBoard(b => ({
      ...b,
      columns: b.columns.map(c => c.id === columnId ? { ...c, ...updates } : c),
    }));
  }, []);

  const deleteColumn = useCallback((columnId: string) => {
    setBoard(b => ({
      ...b,
      columns: b.columns.filter(c => c.id !== columnId),
      tasks: b.tasks.filter(t => t.columnId !== columnId),
    }));
  }, []);

  const reorderColumns = useCallback((startIndex: number, endIndex: number) => {
    setBoard(b => {
      const cols = [...b.columns].sort((a, c) => a.order - c.order);
      const [moved] = cols.splice(startIndex, 1);
      cols.splice(endIndex, 0, moved);
      return { ...b, columns: cols.map((c, i) => ({ ...c, order: i })) };
    });
  }, []);

  const addChecklist = useCallback((taskId: string, title: string) => {
    const newChecklist: Checklist = { id: genId(), title, items: [] };
    setBoard(b => ({
      ...b,
      tasks: b.tasks.map(t => t.id === taskId ? { ...t, checklists: [...t.checklists, newChecklist] } : t),
    }));
  }, []);

  const toggleChecklistItem = useCallback((taskId: string, checklistId: string, itemId: string) => {
    setBoard(b => ({
      ...b,
      tasks: b.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          checklists: t.checklists.map(cl => {
            if (cl.id !== checklistId) return cl;
            return {
              ...cl,
              items: cl.items.map(i => i.id === itemId ? { ...i, completed: !i.completed } : i),
            };
          }),
        };
      }),
    }));
  }, []);

  const addChecklistItem = useCallback((taskId: string, checklistId: string, text: string) => {
    const newItem: ChecklistItem = { id: genId(), text, completed: false };
    setBoard(b => ({
      ...b,
      tasks: b.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          checklists: t.checklists.map(cl => {
            if (cl.id !== checklistId) return cl;
            return { ...cl, items: [...cl.items, newItem] };
          }),
        };
      }),
    }));
  }, []);

  const deleteChecklistItem = useCallback((taskId: string, checklistId: string, itemId: string) => {
    setBoard(b => ({
      ...b,
      tasks: b.tasks.map(t => {
        if (t.id !== taskId) return t;
        return {
          ...t,
          checklists: t.checklists.map(cl => {
            if (cl.id !== checklistId) return cl;
            return { ...cl, items: cl.items.filter(i => i.id !== itemId) };
          }),
        };
      }),
    }));
  }, []);

  return (
    <BoardContext.Provider value={{
      board, addTask, updateTask, deleteTask, moveTask,
      addColumn, updateColumn, deleteColumn, reorderColumns,
      addChecklist, toggleChecklistItem, addChecklistItem, deleteChecklistItem,
    }}>
      {children}
    </BoardContext.Provider>
  );
};
