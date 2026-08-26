import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Board, Task, TaskActivity, Column, Checklist, ChecklistItem } from '@/types/board';
import { emptyBoard } from '@/data/initialBoard';
import { useAuth } from '@/context/AuthContext';

interface GoalsContextType {
  board: Board;
  addTask: (columnId: string, title: string, details?: Partial<Task>) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  moveTask: (taskId: string, toColumnId: string, newOrder: number) => void;
  addColumn: (title: string, projectId?: number | null) => void;
  updateColumn: (columnId: string, updates: Partial<Column>) => void;
  deleteColumn: (columnId: string) => void;
  reorderColumns: (startIndex: number, endIndex: number, projectId?: number | null) => void;
  addChecklist: (taskId: string, title: string) => void;
  toggleChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  addChecklistItem: (taskId: string, checklistId: string, text: string) => void;
  deleteChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  // AI helper methods
  findTasksByTitle: (title: string) => Task[];
  findDuplicates: () => Map<string, Task[]>;
  getColumnByName: (name: string) => Column | undefined;
  bulkDeleteTasks: (taskIds: string[]) => void;
  reorderTasks: (orderedIds: string[]) => void;
  // Sync status
  lastSyncTime: Date | null;
  syncStatus: 'synced' | 'syncing' | 'offline';
}

const GoalsContext = createContext<GoalsContextType | null>(null);

export const useGoalsContext = () => {
  const ctx = useContext(GoalsContext);
  if (!ctx) throw new Error('useGoalsContext must be used within GoalsProvider');
  return ctx;
};

const genId = () => crypto.randomUUID();

function getBoardKey(userId: number) {
  return `goal_board_${userId}`;
}

async function loadBoard(userId: number): Promise<Board> {
  const cached = localStorage.getItem(getBoardKey(userId));
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      if (parsed?.columns) {
        void (async () => {
          try {
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), 4000);
            const res = await fetch('/api/goal-boards/snapshot', { credentials: 'include', signal: ctrl.signal });
            clearTimeout(tid);
            if (res.status === 403 || res.status === 400) return;
            if (res.ok) {
              const data = await res.json();
              const board = data?.board ?? (data && typeof data === 'object' && 'columns' in data ? data : null);
              if (board) localStorage.setItem(getBoardKey(userId), JSON.stringify(board));
            }
          } catch {}
        })();
        return parsed as Board;
      }
    } catch {}
  }
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('/api/goal-boards/snapshot', { credentials: 'include', signal: ctrl.signal });
    clearTimeout(tid);
    if (res.status === 403 || res.status === 400) return { ...emptyBoard };
    if (res.ok) {
      const data = await res.json();
      const board = data?.board ?? (data && typeof data === 'object' && 'columns' in data ? data : null);
      if (board) {
        localStorage.setItem(getBoardKey(userId), JSON.stringify(board));
        return board as Board;
      }
    }
  } catch {}
  try {
    const saved = localStorage.getItem(getBoardKey(userId));
    if (saved) return JSON.parse(saved);
  } catch {}
  return { ...emptyBoard };
}

async function saveBoard(userId: number, board: Board, retryCount = 0): Promise<boolean> {
  try {
    // Always save to localStorage first for immediate persistence
    localStorage.setItem(getBoardKey(userId), JSON.stringify(board));

    // Sync to server with retry logic
    const ac = new AbortController();
    const at = setTimeout(() => ac.abort(), 5000);
    const response = await fetch('/api/goal-boards/snapshot', {
      signal: ac.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ boardData: board }),
    });

    clearTimeout(at);
    if (!response.ok) {
      if (response.status === 403 || response.status === 400) return false;
      throw new Error(`Server error: ${response.status}`);
    }

    return true;
  } catch (err) {
    console.error('Failed to save board to server:', err);

    // Retry up to 3 times with exponential backoff
    if (retryCount < 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
      return saveBoard(userId, board, retryCount + 1);
    }

    return false;
  }
}

const calculateNextDate = (dateStr: string, pattern: string) => {
  const d = new Date(dateStr);
  if (pattern === 'daily') d.setDate(d.getDate() + 1);
  else if (pattern === 'weekly') d.setDate(d.getDate() + 7);
  else if (pattern === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString().split('T')[0];
};

export const GoalsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [board, setBoard] = useState<Board>({ ...emptyBoard });
  const [loading, setLoading] = useState(true);
  const boardRef = useRef<Board>({ ...emptyBoard });
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushBoardSave = useCallback(() => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (!dirtyRef.current || !user) return;
    const boardToSave = boardRef.current;
    dirtyRef.current = false;
    saveBoard(user.id, boardToSave).then(ok => { if (ok) setLastSyncTime(new Date()); });
  }, [user]);
  const isInitialRef = useRef(true);
  useEffect(() => {
    boardRef.current = board;
    if (isInitialRef.current) { isInitialRef.current = false; return; }
    if (!loading) {
      dirtyRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(flushBoardSave, 1500);
    }
  }, [board, loading, flushBoardSave]);

  // Track sync status for cross-device sync
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('synced');

  useEffect(() => {
    if (user) {
      try {
        const cached = localStorage.getItem(getBoardKey(user.id));
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.columns) { setBoard(parsed); boardRef.current = parsed; setLoading(false); setLastSyncTime(new Date()); }
          else setLoading(false);
        } else {
          const def = { ...emptyBoard, columns: [{ id: 'col-to-do', title: 'To Do', order: 0, projectId: null, color: '' }, { id: 'col-in-progress', title: 'In Progress', order: 1, projectId: null, color: '' }, { id: 'col-done', title: 'Done', order: 2, projectId: null, color: '' }] };
          setBoard(def); boardRef.current = def; setLoading(false); saveBoard(user.id, def);
        }
      } catch { setLoading(false); }
      loadBoard(user.id).then(loaded => {
        if (loaded.columns.length === 0) {
          loaded = { ...loaded, columns: [{ id: 'col-to-do', title: 'To Do', order: 0, projectId: null, color: '' }, { id: 'col-in-progress', title: 'In Progress', order: 1, projectId: null, color: '' }, { id: 'col-done', title: 'Done', order: 2, projectId: null, color: '' }] };
          saveBoard(user.id, loaded);
        }
        const cur = JSON.stringify(boardRef.current);
        const nxt = JSON.stringify(loaded);
        if (cur !== nxt) { setBoard(loaded); boardRef.current = loaded; setLastSyncTime(new Date()); }
        setLoading(false);
      }).catch(() => setLoading(false));
    } else { setBoard({ ...emptyBoard }); setLoading(false); }
  }, [user?.id]);

  // One-time project data reset to ensure fresh independent projects columns and tasks state
  useEffect(() => {
    if (user && !loading && board) {
      const resetKey = `projects_reset_done_v3_${user.id}`;
      if (!localStorage.getItem(resetKey)) {
        setBoard(prev => {
          const nextColumns = prev.columns.filter(c => !c.projectId);
          const nextTasks = prev.tasks.filter(t => !t.projectId);
          const nextBoard = { ...prev, columns: nextColumns, tasks: nextTasks };
          saveBoard(user.id, nextBoard);
          return nextBoard;
        });
        localStorage.setItem(resetKey, 'true');
      }
    }
  }, [user?.id, loading, board?.id]);

  useEffect(() => {
    if (!user) return;
    const syncInterval = setInterval(() => { flushBoardSave(); }, 30000);
    return () => clearInterval(syncInterval);
  }, [user?.id, flushBoardSave]);
  useEffect(() => {
    if (!user) return;
    const handleHide = () => flushBoardSave();
    const handleVis = () => { if (document.visibilityState === 'hidden') flushBoardSave(); };
    document.addEventListener('visibilitychange', handleVis);
    window.addEventListener('pagehide', handleHide);
    return () => { document.removeEventListener('visibilitychange', handleVis); window.removeEventListener('pagehide', handleHide); flushBoardSave(); };
  }, [user?.id, flushBoardSave]);

  useEffect(() => {
    if (!user) return;
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const vc = new AbortController();
          const tid = setTimeout(() => vc.abort(), 4000);
          const res = await fetch('/api/goal-boards/snapshot', { credentials: 'include', signal: vc.signal });
          clearTimeout(tid);
          if (res.ok) {
            const data = await res.json();
            const serverBoard = data?.board ?? (data && typeof data === 'object' && 'columns' in data ? data : null);
            if (serverBoard) {
              const localBoardStr = JSON.stringify(boardRef.current);
              const serverBoardStr = JSON.stringify(serverBoard);
              if (serverBoardStr !== localBoardStr) {
                setBoard(serverBoard);
                boardRef.current = serverBoard;
                localStorage.setItem(getBoardKey(user.id), JSON.stringify(serverBoard));
                setLastSyncTime(new Date());
              }
            }
          }
        } catch (err) {
          console.error('Failed to sync on visibility change:', err);
        }
        if (loading) setLoading(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
    };
  }, [user?.id, loading]);

  const logActivity = useCallback((taskId: string, text: string) => {
    setBoard(prev => {
      const task = prev.tasks.find(t => t.id === taskId);
      if (!task) return prev;
      const newActivity: TaskActivity = {
        id: genId(),
        text,
        createdAt: new Date().toISOString(),
      };
      return {
        ...prev,
        tasks: prev.tasks.map(t => (t.id === taskId ? { ...t, activityLog: [...(t.activityLog || []), newActivity] } : t)),
      };
    });
  }, []);

  const addTask = useCallback(
    (columnId: string, title: string, details?: Partial<Task>) => {
      setBoard(prev => {
        // Calculate the order for the new task based on existing tasks in the column
        const tasksInColumn = prev.tasks.filter(t => t.columnId === columnId);
        const maxOrderInColumn = tasksInColumn.length > 0 ? Math.max(...tasksInColumn.map(t => t.order)) : -1;
        const newOrder = maxOrderInColumn + 1;

        const newTask: Task = {
          id: genId(),
          title,
          description: '', // Added required field
          priority: 'none', // Added required field
          labels: [], // Added required field
          checklists: [], // Added required field
          subtasks: [], // Added required field
          columnId,
          order: newOrder, // Added required field
          createdAt: new Date().toISOString(),
          activityLog: [], // Changed 'activities' to 'activityLog'
          ...details,
        };

        const nextState = {
          ...prev,
          tasks: [...prev.tasks, newTask], // Add the correctly typed newTask
        };

        // Log activity inside the setBoard callback
        logActivity(newTask.id, `Task created`);

        return nextState;
      });
    },
    [logActivity],
  );

  const updateTask = useCallback(
    (taskId: string, updates: Partial<Task>) => {
      setBoard(prev => ({
        ...prev,
        tasks: prev.tasks.map(t => (t.id === taskId ? { ...t, ...updates } : t)),
      }));
      logActivity(taskId, `Task updated`);
    },
    [logActivity],
  );

  const deleteTask = useCallback(
    (taskId: string) => {
      setBoard(prev => ({
        ...prev,
        tasks: prev.tasks.filter(t => t.id !== taskId),
      }));
      logActivity(taskId, `Task deleted`);
    },
    [logActivity],
  );

  const moveTask = useCallback(
    (taskId: string, toColumnId: string, newOrder: number) => {
      setBoard(prev => {
        const task = prev.tasks.find(t => t.id === taskId);
        if (!task) return prev;
        const newTasks = prev.tasks.filter(t => t.id !== taskId);
        newTasks.splice(newOrder, 0, { ...task, columnId: toColumnId });
        return {
          ...prev,
          tasks: newTasks,
        };
      });
      logActivity(taskId, `Task moved to column ${toColumnId}`);
    },
    [logActivity],
  );

  const addColumn = useCallback(
    (title: string, projectId?: number | null) => {
      setBoard(prev => {
         // Calculate the order for the new column based on the current number of columns
         const newOrder = prev.columns.length;

         const newColumn: Column = {
           id: genId(), // Use the ID generated inside the updater
           title,
           projectId,
           order: newOrder, // Added required field, calculated based on prev state
           color: 'hsl(var(--muted-foreground))', // Added required field, using a default from elsewhere in the codebase
         };

         const nextState = {
           ...prev,
           columns: [...prev.columns, newColumn], // Add the correctly typed newColumn
         };

         // Log activity inside the setBoard callback
         logActivity(newColumn.id, `Column created`);

         return nextState;
      });
    },
    [logActivity],
  );

  const updateColumn = useCallback(
    (columnId: string, updates: Partial<Column>) => {
      setBoard(prev => ({
        ...prev,
        columns: prev.columns.map(c => (c.id === columnId ? { ...c, ...updates } : c)),
      }));
      logActivity(columnId, `Column updated`);
    },
    [logActivity],
  );

  const deleteColumn = useCallback(
    (columnId: string) => {
      setBoard(prev => ({
        ...prev,
        columns: prev.columns.filter(c => c.id !== columnId),
        tasks: prev.tasks.filter(t => t.columnId !== columnId),
      }));
      logActivity(columnId, `Column deleted`);
    },
    [logActivity],
  );

  const reorderColumns = useCallback(
    (startIndex: number, endIndex: number, projectId?: number | null) => {
      setBoard(prev => {
        const columns = [...prev.columns];
        const [removed] = columns.splice(startIndex, 1);
        columns.splice(endIndex, 0, removed);
        return {
          ...prev,
          columns,
        };
      });
      logActivity(`Column reorder`, `Reordered columns from ${startIndex} to ${endIndex}`);
    },
    [logActivity],
  );

  const addChecklist = useCallback(
    (taskId: string, title: string) => {
      setBoard(prev => {
        const task = prev.tasks.find(t => t.id === taskId);
        if (!task) return prev;
        const newChecklist: Checklist = {
          id: genId(),
          title,
          items: [],
        };
        return {
          ...prev,
          tasks: prev.tasks.map(t => (t.id === taskId ? { ...t, checklists: [...t.checklists, newChecklist] } : t)),
        };
      });
      logActivity(taskId, `Checklist created`);
    },
    [logActivity],
  );

  const toggleChecklistItem = useCallback(
    (taskId: string, checklistId: string, itemId: string) => {
      setBoard(prev => {
        const task = prev.tasks.find(t => t.id === taskId);
        if (!task) return prev;
        const checklist = task.checklists.find(c => c.id === checklistId);
        if (!checklist) return prev;
        const item = checklist.items.find(i => i.id === itemId);
        if (!item) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map(t =>
            t.id === taskId
              ? {
                  ...t,
                  checklists: t.checklists.map(c =>
                    c.id === checklistId
                      ? {
                          ...c,
                          items: c.items.map(i =>
                            i.id === itemId ? { ...i, completed: !i.completed } : i,
                          ),
                        }
                      : c,
                  ),
                }
              : t,
          ),
        };
      });
      logActivity(taskId, `Checklist item toggled`);
    },
    [logActivity],
  );

  const addChecklistItem = useCallback(
    (taskId: string, checklistId: string, text: string) => {
      setBoard(prev => {
        const task = prev.tasks.find(t => t.id === taskId);
        if (!task) return prev;
        const checklist = task.checklists.find(c => c.id === checklistId);
        if (!checklist) return prev;
        const newItem: ChecklistItem = {
          id: genId(),
          text,
          completed: false,
        };
        return {
          ...prev,
          tasks: prev.tasks.map(t =>
            t.id === taskId
              ? {
                  ...t,
                  checklists: t.checklists.map(c =>
                    c.id === checklistId ? { ...c, items: [...c.items, newItem] } : c,
                  ),
                }
              : t,
          ),
        };
      });
      logActivity(taskId, `Checklist item added`);
    },
    [logActivity],
  );

  const deleteChecklistItem = useCallback(
    (taskId: string, checklistId: string, itemId: string) => {
      setBoard(prev => {
        const task = prev.tasks.find(t => t.id === taskId);
        if (!task) return prev;
        const checklist = task.checklists.find(c => c.id === checklistId);
        if (!checklist) return prev;
        return {
          ...prev,
          tasks: prev.tasks.map(t =>
            t.id === taskId
              ? {
                  ...t,
                  checklists: t.checklists.map(c =>
                    c.id === checklistId
                      ? {
                          ...c,
                          items: c.items.filter(i => i.id !== itemId),
                        }
                      : c,
                  ),
                }
              : t,
          ),
        };
      });
      logActivity(taskId, `Checklist item deleted`);
    },
    [logActivity],
  );

  const findTasksByTitle = useCallback(
    (title: string) => {
      return board.tasks.filter(t => t.title.toLowerCase().includes(title.toLowerCase()));
    },
    [board.tasks],
  );

  const findDuplicates = useCallback(() => {
    const map = new Map<string, Task[]>();
    board.tasks.forEach(task => {
      const lowerTitle = task.title.toLowerCase();
      if (map.has(lowerTitle)) {
        map.get(lowerTitle)?.push(task);
      } else {
        map.set(lowerTitle, [task]);
      }
    });
    return map;
  }, [board.tasks]);

  const getColumnByName = useCallback(
    (name: string) => {
      return board.columns.find(c => c.title.toLowerCase() === name.toLowerCase());
    },
    [board.columns],
  );

  const bulkDeleteTasks = useCallback(
    (taskIds: string[]) => {
      setBoard(prev => ({
        ...prev,
        tasks: prev.tasks.filter(t => !taskIds.includes(t.id)),
      }));
      logActivity(`Bulk delete`, `Deleted ${taskIds.length} tasks`);
    },
    [logActivity],
  );

  const reorderTasks = useCallback(
    (orderedIds: string[]) => {
      setBoard(prev => ({
        ...prev,
        tasks: orderedIds.map(id => prev.tasks.find(t => t.id === id)!),
      }));
      logActivity(`Reorder tasks`, `Reordered tasks`);
    },
    [logActivity],
  );

  return (
    <GoalsContext.Provider
      value={{
        board,
        addTask,
        updateTask,
        deleteTask,
        moveTask,
        addColumn,
        updateColumn,
        deleteColumn,
        reorderColumns,
        addChecklist,
        toggleChecklistItem,
        addChecklistItem,
        deleteChecklistItem,
        findTasksByTitle,
        findDuplicates,
        getColumnByName,
        bulkDeleteTasks,
        reorderTasks,
        lastSyncTime,
        syncStatus,
      }}
    >
      {children}
    </GoalsContext.Provider>
  );
};
