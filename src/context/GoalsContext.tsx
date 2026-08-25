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

// Helper function to load from localStorage only
function loadBoardFromCache(userId: number): Board | null {
  try {
    const cached = localStorage.getItem(getBoardKey(userId));
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed?.columns) return parsed;
    }
  } catch (e) {
    console.error("Error loading board from cache:", e);
  }
  return null;
}

async function loadBoard(userId: number, cachedBoardOnEntry: Board | null): Promise<Board> {
  // Attempt network fetch with timeout
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch('/api/goal-boards/snapshot', { credentials: 'include', signal: ctrl.signal });
    clearTimeout(tid);

    // Check for 403/400 immediately and return cached board if present
    if (res.status === 403 || res.status === 400) {
        console.debug("Server responded with 403/400, returning cached board if available.");
        if (cachedBoardOnEntry) {
            return cachedBoardOnEntry;
        }
        // If no cache and got 403/400, we must return empty board as per policy
        return { ...emptyBoard };
    }

    if (res.ok) {
      const data = await res.json();
      const board = data?.board ?? (data && typeof data === 'object' && 'columns' in data ? data : null);
      if (board) {
        // Update localStorage cache with fresh data
        localStorage.setItem(getBoardKey(userId), JSON.stringify(board));
        return board as Board;
      }
    }
    // If res.ok is false but status is not 403/400 (e.g., 500), we proceed to fallback
    console.debug("Server fetch failed with status:", res.status, "attempting cache fallback.");
    if (cachedBoardOnEntry) {
      return cachedBoardOnEntry;
    }
  } catch (networkError) {
    console.debug("Network fetch failed or timed out, attempting cache fallback.", networkError);
    // Network error occurred (including timeout), try cache
    if (cachedBoardOnEntry) {
      return cachedBoardOnEntry;
    }
  }
  
  // Final fallback to empty board if network fails and no cache
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
  useEffect(() => { boardRef.current = board; }, [board]);

  // Track sync status for cross-device sync
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('synced');

  useEffect(() => {
    if (user) {
      // Stale-while-revalidate: Load from cache first
      const cachedBoard = loadBoardFromCache(user.id);
      if (cachedBoard) {
        setBoard(cachedBoard);
        setLoading(false); // Stop loading indicator as we have data
        // Initial status after loading from cache
        setSyncStatus('synced');
      } else {
         // If no cache, still go through the loadBoard flow which includes network and emptyBoard fallback
         setLoading(true);
         // Set status to syncing when attempting network fetch
         setSyncStatus('syncing');
         // Pass null as cachedBoardOnEntry since there was no cache initially
         loadBoard(user.id, null).then(loaded => {
           setBoard(loaded);
           setLoading(false);
           setLastSyncTime(new Date());
           // Set status to synced after successful load
           setSyncStatus('synced');
         }).catch(() => {
           setBoard({ ...emptyBoard });
           setLoading(false);
           // Set status to offline after load failure
           setSyncStatus('offline');
         });
      }

      // Now, initiate the background refresh from the server
      // This ensures Pro users get fresh data and caches stay updated.
      // We only do this if we had some initial data (either from cache or initial load).
      if (cachedBoard) {
        // Pass the cached board so loadBoard can return it quickly on 403/400
        // Indicate syncing for the background refresh
        setSyncStatus('syncing');
        loadBoard(user.id, cachedBoard).then(freshBoard => {
          // Update state and cache with fresh data if different
          const currentBoardStr = JSON.stringify(boardRef.current);
          const freshBoardStr = JSON.stringify(freshBoard);
          if (currentBoardStr !== freshBoardStr) {
            setBoard(freshBoard);
            // The saveBoard call inside loadBoard already updated localStorage
            setLastSyncTime(new Date());
          }
          // Set status to synced after background refresh attempt
          setSyncStatus('synced');
        }).catch(err => {
          console.debug("Background refresh failed, keeping cached data.", err);
          // Set status to offline after background refresh failure
          setSyncStatus('offline');
          // No state change needed, we keep the stale data.
        });
      }
    } else {
      setBoard({ ...emptyBoard });
      setLoading(false);
      // Reset status when user logs out
      setSyncStatus('synced');
    }
  }, [user?.id, setSyncStatus]); // Added setSyncStatus to dependency array

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
    const syncInterval = setInterval(async () => {
      const success = await saveBoard(user.id, boardRef.current);
      if (success) setLastSyncTime(new Date());
    }, 30000);
    return () => clearInterval(syncInterval);
  }, [user?.id]);

  // Periodic pull sync to check for server updates while on the page
  useEffect(() => {
    if (!user) return;

    const pullSyncInterval = setInterval(async () => {
        // Set status to syncing when starting pull sync
        setSyncStatus('syncing');
      try {
        const ctrl = new AbortController();
        // Slightly shorter timeout for pull sync compared to initial load
        const tid = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch('/api/goal-boards/snapshot', { credentials: 'include', signal: ctrl.signal });
        clearTimeout(tid);

        // Fast-path 403/400 (free tier restrictions)
        if (res.status === 403 || res.status === 400) {
            // Treat 403/400 as synced for pull sync
            setSyncStatus('synced');
            return;
        }

        if (res.ok) {
          const data = await res.json();
          const serverBoard = data?.board ?? (data && typeof data === 'object' && 'columns' in data ? data : null);
          if (serverBoard) {
            const localBoardStr = JSON.stringify(boardRef.current);
            const serverBoardStr = JSON.stringify(serverBoard);
            if (serverBoardStr !== localBoardStr) {
              setBoard(serverBoard);
              localStorage.setItem(getBoardKey(user.id), JSON.stringify(serverBoard));
              setLastSyncTime(new Date());
            }
          }
          // Set status to synced after successful pull
          setSyncStatus('synced');
        } else {
            // Handle non-OK response (e.g., 5xx)
            setSyncStatus('offline');
        }
      } catch (err) {
        console.debug("Periodic pull sync failed:", err);
        // Set status to offline on error/timeout
        setSyncStatus('offline');
        // Silently ignore errors during pull sync, rely on other mechanisms
      }
    }, 30000); // Sync every 30 seconds, same as push sync

    return () => clearInterval(pullSyncInterval);
  }, [user?.id, boardRef, setBoard, setLastSyncTime, setSyncStatus]); // Added setSyncStatus to dependency array

  useEffect(() => {
    if (!user) return;
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible') {
        // Set status to syncing when starting visibility sync
        setSyncStatus('syncing');
        let timeoutId: ReturnType<typeof setTimeout> | null = null; // Declare timeoutId
        try {
          const vc = new AbortController();
          // Store the timeout ID
          timeoutId = setTimeout(() => {
              console.debug("Visibility sync fetch timed out after 4000ms");
              vc.abort();
          }, 4000);
          
          const res = await fetch('/api/goal-boards/snapshot', { credentials: 'include', signal: vc.signal });
          clearTimeout(timeoutId);
          
          // Fast-path 403/400 (free tier restrictions)
          if (res.status === 403 || res.status === 400) {
            // Treat 403/400 as synced for visibility sync
            setSyncStatus('synced');
            return;
          }

          if (res.ok) {
            const data = await res.json();
            const serverBoard = data?.board ?? (data && typeof data === 'object' && 'columns' in data ? data : null);
            if (serverBoard) {
              const localBoardStr = JSON.stringify(boardRef.current);
              const serverBoardStr = JSON.stringify(serverBoard);
              if (serverBoardStr !== localBoardStr) {
                setBoard(serverBoard);
                localStorage.setItem(getBoardKey(user.id), JSON.stringify(serverBoard));
                setLastSyncTime(new Date());
              }
            }
            // Set status to synced after successful visibility sync
            setSyncStatus('synced');
          } else {
            // Handle non-OK response (e.g., 5xx)
            setSyncStatus('offline');
          }
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
             console.debug("Visibility sync fetch was aborted.");
          } else {
             console.error('Failed to sync on visibility change:', err);
          }
          // Set status to offline on error/timeout
          setSyncStatus('offline');
        } finally {
          // Clear the timeout if it was set and hasn't fired yet
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [user?.id, boardRef, setBoard, setLastSyncTime, setSyncStatus]); // Added setSyncStatus to dependency array

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

        return {
          ...prev,
          tasks: [...prev.tasks, newTask], // Add the correctly typed newTask
        };
      });
      // Log activity after the state update is scheduled
      // Assuming logActivity relies on the new state being flushed or is handled via useEffect
      logActivity(newTaskId, `Task created`);
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
      // Corrected implementation: Calculate order inside the setBoard callback
      const newColumnId = genId();
      setBoard(prev => {
         // Calculate the order for the new column based on the current number of columns
         const newOrder = prev.columns.length;

         const newColumn: Column = {
           id: newColumnId, // Use the ID generated outside
           title,
           projectId,
           order: newOrder, // Added required field, calculated based on prev state
           color: 'hsl(var(--muted-foreground))', // Added required field, using a default from elsewhere in the codebase
         };

         return {
           ...prev,
           columns: [...prev.columns, newColumn], // Add the correctly typed newColumn
         };
      });
      // Log activity after the state update is scheduled
      logActivity(newColumnId, `Column created`);
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
