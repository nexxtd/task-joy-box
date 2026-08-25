import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Board, Task, TaskActivity, Column, Checklist, ChecklistItem } from '@/types/board';
import { emptyBoard } from '@/data/initialBoard';
import { useAuth } from '@/context/AuthContext';

interface BoardContextType {
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
  reorderTasksInSection: (orderedIds: string[]) => void;
  // Sync status
  lastSyncTime: Date | null;
  syncStatus: 'synced' | 'syncing' | 'offline';
}

const BoardContext = createContext<BoardContextType | null>(null);

export const useBoardContext = () => {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoardContext must be used within BoardProvider');
  return ctx;
};

const genId = () => crypto.randomUUID();

function getBoardKey(userId: number) {
  return `board_${userId}`;
}

async function loadBoard(userId: number): Promise<Board> {
  try {
    const cached = localStorage.getItem(getBoardKey(userId));
    if (cached) {
      try { const parsed = JSON.parse(cached); if (parsed?.columns) return parsed; } catch {}
    }
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('/api/boards/snapshot', { credentials: 'include', signal: ctrl.signal });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      if (data.board) {
        localStorage.setItem(getBoardKey(userId), JSON.stringify(data.board));
        return data.board;
      }
    }
  } catch {}
  // Fallback to localStorage
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

    const ac = new AbortController();
    const at = setTimeout(() => ac.abort(), 5000);
    const response = await fetch('/api/boards/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      signal: ac.signal,
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

export const BoardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [board, setBoard] = useState<Board>({ ...emptyBoard });
  const [loading, setLoading] = useState(true);

  // Track sync status for cross-device sync
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('synced');

  // Latest board + dirty flag for debounced background saves (avoid uploading the full
  // board for every keystroke/mutation, and never upload anything while the user is idle)
  const boardRef = useRef<Board>({ ...emptyBoard });
  const dirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushBoardSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!dirtyRef.current || !user) return;
    const boardToSave = boardRef.current;
    dirtyRef.current = false;
    saveBoard(user.id, boardToSave).then(ok => {
      if (ok) setLastSyncTime(new Date());
    });
  }, [user]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      loadBoard(user.id).then(loaded => {
        if (loaded.columns.length === 0) {
          loaded = {
            ...loaded,
            columns: [
              { id: 'col-to-do', title: 'To Do', order: 0, projectId: null, color: '' },
              { id: 'col-in-progress', title: 'In Progress', order: 1, projectId: null, color: '' },
              { id: 'col-done', title: 'Done', order: 2, projectId: null, color: '' },
            ],
          };
          saveBoard(user.id, loaded);
        }
        setBoard(loaded);
        setLoading(false);
        setLastSyncTime(new Date());
      }).catch(() => {
        setBoard({ ...emptyBoard });
        setLoading(false);
      });
    } else {
      setBoard({ ...emptyBoard });
      setLoading(false);
    }
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

  // Periodic safety-net sync to server (every 30 seconds) — only uploads when the
  // board actually changed since the last save (dirty flag), so idle tabs upload nothing
  useEffect(() => {
    if (!user) return;

    const syncInterval = setInterval(() => {
      flushBoardSave();
    }, 30000);

    return () => clearInterval(syncInterval);
  }, [user?.id, flushBoardSave]);

  // Flush pending changes when the tab is hidden/closed so nothing is lost
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushBoardSave();
    };
    const handlePageHide = () => flushBoardSave();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      flushBoardSave();
    };
  }, [user?.id, flushBoardSave]);

  // Sync when window regains focus (user returns from another device/tab)
  useEffect(() => {
    if (!user) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Refresh board from server when returning to the app
        try {
          const vc = new AbortController(); setTimeout(() => vc.abort(), 8000);
          const res = await fetch('/api/boards/snapshot', { credentials: 'include', signal: vc.signal });
          if (res.ok) {
            const data = await res.json();
            if (data.board) {
              // Only update if server data is newer or different
              const serverBoard = data.board;
              const localBoardStr = JSON.stringify(board);
              const serverBoardStr = JSON.stringify(serverBoard);

              if (serverBoardStr !== localBoardStr) {
                setBoard(serverBoard);
                localStorage.setItem(getBoardKey(user.id), JSON.stringify(serverBoard));
                setLastSyncTime(new Date());
              }
            }
          }
        } catch (err) {
          console.error('Failed to sync on visibility change:', err);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user?.id, board]);

  const logActivity = useCallback((taskId: string, text: string) => {
    setBoard(prev => ({
      ...prev,
      tasks: prev.tasks.map(t =>
        t.id === taskId
          ? { ...t, updatedAt: new Date().toISOString(), activityLog: [...(t.activityLog || []), { id: genId(), text, createdAt: new Date().toISOString(), actor: user?.name }] }
          : t
      ),
    }));
  }, [user?.name]);

  const persist = useCallback((updater: (b: Board) => Board) => {
    setBoard(prev => {
      const next = updater(prev);
      boardRef.current = next;
      dirtyRef.current = true;
      return next;
    });
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushBoardSave, 1500);
  }, [flushBoardSave]);

  const handleRecurrence = useCallback((b: Board, task: Task, toColumnId: string) => {
    const isPro = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
    if (!isPro) return b;
    
    const toCol = b.columns.find(c => c.id === toColumnId);
    if (!toCol || toCol.title.toLowerCase().trim() !== 'completed') return b;
    if (!task.recurrencePattern) return b;

    const nextDate = calculateNextDate(task.dueDate || new Date().toISOString().split('T')[0], task.recurrencePattern);
    const firstCol = b.columns[0];
    if (!firstCol) return b;

    const newTask: Task = {
      ...task,
      id: genId(),
      status: 'to_do',
      columnId: firstCol.id,
      completed: false,
      completedAt: undefined,
      dueDate: nextDate,
      order: b.tasks.filter(t => t.columnId === firstCol.id).length,
      createdAt: new Date().toISOString().split('T')[0],
      checklists: task.checklists.map(cl => ({
        ...cl,
        id: genId(),
        items: cl.items.map(it => ({ ...it, id: genId(), completed: false }))
      })),
      subtasks: task.subtasks.map(st => ({ ...st, id: genId(), completed: false })),
      attachments: [],
      comments: [],
    };

    return { ...b, tasks: [...b.tasks, newTask] };
  }, []);

  const addTask = useCallback((columnId: string, title: string, details: Partial<Task> = {}) => {
    const taskId = details.id || genId();
    persist(b => {
      const tasksInCol = b.tasks.filter(t => t.columnId === columnId);
      const now = new Date().toISOString();
      const newTask: Task = {
        id: taskId,
        title,
      description: details.description || '',
      status: details.status || 'to_do',
      priority: details.priority || 'none',
        labels: details.labels || [],
        checklists: details.checklists || [],
        subtasks: details.subtasks || [],
        createdAt: now,
        columnId,
        order: tasksInCol.length,
        dueDate: details.dueDate,
        dueTime: details.dueTime,
        startDate: details.startDate,
        startTime: details.startTime,
        duration: details.duration,
        sessionsNeeded: details.sessionsNeeded,
        subject: details.subject,
        color: details.color,
        icon: details.icon,
        completed: details.completed || false,
        completedAt: details.completedAt,
        recurrencePattern: details.recurrencePattern,
        attachments: details.attachments || [],
        comments: details.comments || [],
        projectId: details.projectId,
        projectName: details.projectName,
        activityLog: [{ id: genId(), text: 'Task created', createdAt: now, actor: user?.name }],
      };
      return { ...b, tasks: [...b.tasks, newTask] };
    });
  }, [persist, user?.name]);

  const updateTask = useCallback((taskId: string, updates: Partial<Task>) => {
    const activityTexts: string[] = [];
    persist(b => {
      const task = b.tasks.find(t => t.id === taskId);
      if (!task) return b;
      if (updates.title && updates.title !== task.title) activityTexts.push(`Title changed to "${updates.title}"`);
      if (updates.priority && updates.priority !== task.priority) activityTexts.push(`Priority set to ${updates.priority}`);
      if (updates.status && updates.status !== task.status) activityTexts.push(`Status changed to ${updates.status}`);
      if (updates.columnId && updates.columnId !== task.columnId) {
        const toCol = b.columns.find(c => c.id === updates.columnId);
        activityTexts.push(`Moved to "${toCol?.title || 'unknown'}"`);
      }
      if (updates.description !== undefined && updates.description !== task.description) activityTexts.push('Description updated');
      if (updates.dueDate !== undefined && updates.dueDate !== task.dueDate) activityTexts.push(`Due date ${updates.dueDate ? `set to ${updates.dueDate}` : 'removed'}`);
      if (updates.dueTime !== undefined && updates.dueTime !== task.dueTime) activityTexts.push(`Due time ${updates.dueTime ? `set to ${updates.dueTime}` : 'removed'}`);
      if (updates.startDate !== undefined && updates.startDate !== task.startDate) activityTexts.push(`Start date ${updates.startDate ? `set to ${updates.startDate}` : 'removed'}`);
      if (updates.startTime !== undefined && updates.startTime !== task.startTime) activityTexts.push(`Start time ${updates.startTime ? `set to ${updates.startTime}` : 'removed'}`);
      if (updates.duration !== undefined && updates.duration !== task.duration) activityTexts.push(`Duration ${updates.duration ? `set to ${updates.duration} min` : 'removed'}`);
      if (updates.projectId !== undefined && updates.projectId !== task.projectId) {
        const projName = updates.projectName || (updates.projectId ? 'a project' : 'no project');
        activityTexts.push(`Assigned to ${projName}`);
      }
      if (updates.labels) activityTexts.push('Tags updated');
      if (updates.subtasks) {
        if (!task.subtasks || updates.subtasks.length > task.subtasks.length) {
          activityTexts.push('Subtask added');
        } else if (updates.subtasks.length < (task.subtasks?.length || 0)) {
          activityTexts.push('Subtask removed');
        }
        const changed = updates.subtasks.filter((s, i) => {
          const existing = task.subtasks?.[i];
          return existing && (s.completed !== existing.completed);
        });
        if (changed.length > 0) {
          changed.forEach(s => activityTexts.push(s.completed ? `Subtask "${s.text}" completed` : `Subtask "${s.text}" uncompleted`));
        }
      }
      return { ...b, tasks: b.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t) };
    });
    activityTexts.forEach(text => logActivity(taskId, text));
  }, [persist, logActivity]);

  const deleteTask = useCallback((taskId: string) => {
    logActivity(taskId, 'Task deleted');
    persist(b => ({ ...b, tasks: b.tasks.filter(t => t.id !== taskId) }));
  }, [persist, logActivity]);

  const moveTask = useCallback((taskId: string, toColumnId: string, newOrder: number) => {
    persist(b => {
      const task = b.tasks.find(t => t.id === taskId);
      if (!task) return b;
      
      const toCol = b.columns.find(c => c.id === toColumnId);
      const fromCol = b.columns.find(c => c.id === task.columnId);
      logActivity(taskId, `Moved from "${fromCol?.title || 'unknown'}" to "${toCol?.title || 'unknown'}"`);
      const isCompletedCol = toCol?.title.toLowerCase().trim() === 'completed';
      
      const otherTasks = b.tasks.filter(t => t.id !== taskId);
      const movedTask = { 
        ...task, 
        columnId: toColumnId,
        completed: isCompletedCol ? true : task.completed,
        completedAt: isCompletedCol && !task.completedAt ? new Date().toISOString() : task.completedAt,
      };
      const colTasks = otherTasks.filter(t => t.columnId === toColumnId).sort((a, c) => a.order - c.order);
      colTasks.splice(newOrder, 0, movedTask);
      const reordered = colTasks.map((t, i) => ({ ...t, order: i }));
      
      let nextBoard = { 
        ...b, 
        tasks: otherTasks.filter(t => t.columnId !== toColumnId).concat(reordered) 
      };
      
      const updatedTask = reordered.find(t => t.id === taskId);
      if (updatedTask) {
        nextBoard = handleRecurrence(nextBoard, updatedTask, toColumnId);
      }
      
      return nextBoard;
    });
  }, [persist, handleRecurrence, logActivity]);

  // Auto-delete completed tasks after 5 days
  useEffect(() => {
    const cleanup = () => {
      const fiveDaysAgo = new Date();
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      
      setBoard(prev => {
        const hasOld = prev.tasks.some(t => {
          if (!t.completed || !t.completedAt) return false;
          return new Date(t.completedAt) < fiveDaysAgo;
        });
        
        if (!hasOld) return prev;
        
        const next = {
          ...prev,
          tasks: prev.tasks.filter(t => {
            if (!t.completed || !t.completedAt) return true;
            return new Date(t.completedAt) >= fiveDaysAgo;
          }),
        };
        if (user) saveBoard(user.id, next);
        return next;
      });
    };
    
    cleanup(); // Run on mount
    const timer = setInterval(cleanup, 60 * 60 * 1000); // Check every hour
    return () => clearInterval(timer);
  }, [user]);

  const addColumn = useCallback((title: string, projectId?: number | null) => {
    persist(b => {
      const newCol: Column = { id: genId(), title, order: b.columns.length, color: 'hsl(var(--muted-foreground))', projectId };
      return { ...b, columns: [...b.columns, newCol] };
    });
  }, [persist]);

  const updateColumn = useCallback((columnId: string, updates: Partial<Column>) => {
    persist(b => ({
      ...b,
      columns: b.columns.map(c => c.id === columnId ? { ...c, ...updates } : c),
    }));
  }, [persist]);

  const deleteColumn = useCallback((columnId: string) => {
    persist(b => ({
      ...b,
      columns: b.columns.filter(c => c.id !== columnId),
      tasks: b.tasks.filter(t => t.columnId !== columnId),
    }));
  }, [persist]);

  const reorderColumns = useCallback((startIndex: number, endIndex: number, projectId?: number | null) => {
    persist(b => {
      const projectCols = b.columns.filter(c => projectId === undefined ? true : c.projectId === projectId).sort((a, c) => a.order - c.order);
      const otherCols = b.columns.filter(c => projectId === undefined ? false : c.projectId !== projectId);
      
      const [moved] = projectCols.splice(startIndex, 1);
      projectCols.splice(endIndex, 0, moved);
      
      const reorderedProjectCols = projectCols.map((c, i) => ({ ...c, order: i }));
      return { ...b, columns: [...otherCols, ...reorderedProjectCols] };
    });
  }, [persist]);

  const addChecklist = useCallback((taskId: string, title: string) => {
    const newChecklist: Checklist = { id: genId(), title, items: [] };
    logActivity(taskId, `Checklist "${title}" added`);
    persist(b => ({
      ...b,
      tasks: b.tasks.map(t => t.id === taskId ? { ...t, checklists: [...t.checklists, newChecklist] } : t),
    }));
  }, [persist, logActivity]);

  const toggleChecklistItem = useCallback((taskId: string, checklistId: string, itemId: string) => {
    let itemText = '';
    persist(b => {
      const task = b.tasks.find(t => t.id === taskId);
      const cl = task?.checklists.find(c => c.id === checklistId);
      const item = cl?.items.find(i => i.id === itemId);
      if (item) itemText = item.text;
      return {
        ...b,
        tasks: b.tasks.map(t => {
          if (t.id !== taskId) return t;
          return {
            ...t,
            checklists: t.checklists.map(cl => {
              if (cl.id !== checklistId) return cl;
              return { ...cl, items: cl.items.map(i => i.id === itemId ? { ...i, completed: !i.completed } : i) };
            }),
          };
        }),
      };
    });
    if (itemText) logActivity(taskId, `Checklist item "${itemText}" toggled`);
  }, [persist, logActivity]);

  const addChecklistItem = useCallback((taskId: string, checklistId: string, text: string) => {
    const newItem: ChecklistItem = { id: genId(), text, completed: false };
    logActivity(taskId, `Checklist item "${text}" added`);
    persist(b => ({
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
  }, [persist, logActivity]);

  const deleteChecklistItem = useCallback((taskId: string, checklistId: string, itemId: string) => {
    let itemText = '';
    persist(b => {
      const task = b.tasks.find(t => t.id === taskId);
      const cl = task?.checklists.find(c => c.id === checklistId);
      const item = cl?.items.find(i => i.id === itemId);
      if (item) itemText = item.text;
      return {
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
      };
    });
    if (itemText) logActivity(taskId, `Checklist item "${itemText}" deleted`);
  }, [persist, logActivity]);

  const findTasksByTitle = useCallback((title: string): Task[] => {
    const lower = title.toLowerCase().trim();
    return board.tasks.filter(t =>
      t.title.toLowerCase().includes(lower) || lower.includes(t.title.toLowerCase())
    );
  }, [board.tasks]);

  const findDuplicates = useCallback((): Map<string, Task[]> => {
    const groups = new Map<string, Task[]>();
    for (const task of board.tasks) {
      const key = task.title.toLowerCase().trim();
      const list = groups.get(key) || [];
      list.push(task);
      groups.set(key, list);
    }
    const duplicates = new Map<string, Task[]>();
    groups.forEach((tasks, key) => {
      if (tasks.length > 1) duplicates.set(key, tasks);
    });
    return duplicates;
  }, [board.tasks]);

  const getColumnByName = useCallback((name: string): Column | undefined => {
    const lower = name.toLowerCase().trim();
    return board.columns.find(c => c.title.toLowerCase().trim() === lower);
  }, [board.columns]);

  const bulkDeleteTasks = useCallback((taskIds: string[]) => {
    persist(b => ({ ...b, tasks: b.tasks.filter(t => !taskIds.includes(t.id)) }));
  }, [persist]);

  const reorderTasks = useCallback((orderedIds: string[]) => {
    persist(b => {
      const taskMap = new Map(b.tasks.map(t => [t.id, t]));
      const newTasks: Task[] = [];
      
      orderedIds.forEach((id, index) => {
        const task = taskMap.get(id);
        if (task) {
          newTasks.push({ ...task, order: index });
          taskMap.delete(id);
        }
      });
      
      const remainingTasks = Array.from(taskMap.values()).map((t, index) => ({
        ...t,
        order: orderedIds.length + index
      }));
      
      return { ...b, tasks: [...newTasks, ...remainingTasks] };
    });
  }, [persist]);

  const reorderTasksInSection = useCallback((orderedIds: string[]) => {
    persist(b => {
      const ids = new Set(orderedIds);
      return {
        ...b,
        tasks: b.tasks.map(t => {
          const idx = orderedIds.indexOf(t.id);
          return ids.has(t.id) && idx >= 0 ? { ...t, order: idx } : t;
        }),
      };
    });
  }, [persist]);

  return (
    <BoardContext.Provider value={{
      board, addTask, updateTask, deleteTask, moveTask,
      addColumn, updateColumn, deleteColumn, reorderColumns,
      addChecklist, toggleChecklistItem, addChecklistItem, deleteChecklistItem,
      findTasksByTitle, findDuplicates, getColumnByName, bulkDeleteTasks, reorderTasks, reorderTasksInSection,
      lastSyncTime, syncStatus,
    }}>
      {children}
    </BoardContext.Provider>
  );
};
