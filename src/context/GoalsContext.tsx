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
      const success = await saveBoard(user.id, boardRef.current, 0, setSyncStatus); // Pass setSyncStatus to periodic save
      // Note: syncStatus is managed within saveBoard now
    }, 30000);
    return () => clearInterval(syncInterval);
  }, [user?.id, boardRef, setSyncStatus]); // Added setSyncStatus to dependency array