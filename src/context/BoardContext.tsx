import React, { createContext, useContext, useReducer, ReactNode, useEffect } from 'react';
import { Board, Column, Task, TaskStatus, Checklist, ChecklistItem, Label, Attachment, Subtask } from '@/types/board';
import { v4 as uuidv4 } from 'uuid';

// Define action types
type BoardAction =
  | { type: 'SET_BOARD'; board: Board }
  | { type: 'ADD_TASK'; columnId: string; task: Task }
  | { type: 'UPDATE_TASK'; taskId: string; updates: Partial<Task> }
  | { type: 'DELETE_TASK'; taskId: string }
  | { type: 'MOVE_TASK'; taskId: string; newColumnId: string; newIndex: number }
  | { type: 'TOGGLE_CHECKLIST_ITEM'; taskId: string; checklistId: string; itemId: string }
  | { type: 'ADD_CHECKLIST_ITEM'; taskId: string; checklistId: string; item: Omit<ChecklistItem, 'id'> }
  | { type: 'DELETE_CHECKLIST_ITEM'; taskId: string; checklistId: string; itemId: string }
  | { type: 'ADD_COLUMN'; column: Column }
  | { type: 'UPDATE_COLUMN'; columnId: string; updates: Partial<Column> }
  | { type: 'DELETE_COLUMN'; columnId: string }
  | { type: 'REORDER_COLUMNS'; sourceIndex: number; destinationIndex: number }
  | { type: 'ADD_ATTACHMENT'; taskId: string; attachment: Attachment }
  | { type: 'DELETE_ATTACHMENT'; taskId: string; attachmentId: string }
  | { type: 'ADD_SUBTASK'; taskId: string; subtask: Omit<Subtask, 'id'> }
  | { type: 'UPDATE_SUBTASK'; taskId: string; subtaskId: string; updates: Partial<Subtask> }
  | { type: 'DELETE_SUBTASK'; taskId: string; subtaskId: string }
  | { type: 'RESET_BOARD' };

// Define initial state
const initialState: Board = {
  id: 'default-board',
  title: 'Default Board',
  columns: [],
  tasks: [],
};

// Reducer function
const boardReducer = (state: Board, action: BoardAction): Board => {
  switch (action.type) {
    case 'SET_BOARD':
      return action.board;

    case 'ADD_TASK':
      const newTask = action.task;
      const taskExists = state.tasks.some(task => task.id === newTask.id);
      if (taskExists) return state; // Prevent duplicate tasks
      
      return {
        ...state,
        tasks: [...state.tasks, newTask],
      };

    case 'UPDATE_TASK':
      return {
        ...state,
        tasks: state.tasks.map(task =>
          task.id === action.taskId ? { ...task, ...action.updates } : task
        ),
      };

    case 'DELETE_TASK':
      return {
        ...state,
        tasks: state.tasks.filter(task => task.id !== action.taskId),
      };

    case 'MOVE_TASK':
      return {
        ...state,
        tasks: state.tasks.map(task => 
          task.id === action.taskId 
            ? { ...task, columnId: action.newColumnId } 
            : task
        ),
      };

    case 'TOGGLE_CHECKLIST_ITEM':
      return {
        ...state,
        tasks: state.tasks.map(task => {
          if (task.id === action.taskId) {
            return {
              ...task,
              checklists: task.checklists.map(checklist => {
                if (checklist.id === action.checklistId) {
                  return {
                    ...checklist,
                    items: checklist.items.map(item => {
                      if (item.id === action.itemId) {
                        return { ...item, completed: !item.completed };
                      }
                      return item;
                    }),
                  };
                }
                return checklist;
              }),
            };
          }
          return task;
        }),
      };

    case 'ADD_CHECKLIST_ITEM':
      return {
        ...state,
        tasks: state.tasks.map(task => {
          if (task.id === action.taskId) {
            return {
              ...task,
              checklists: task.checklists.map(checklist => {
                if (checklist.id === action.checklistId) {
                  return {
                    ...checklist,
                    items: [
                      ...checklist.items,
                      { ...action.item, id: uuidv4(), completed: false },
                    ],
                  };
                }
                return checklist;
              }),
            };
          }
          return task;
        }),
      };

    case 'DELETE_CHECKLIST_ITEM':
      return {
        ...state,
        tasks: state.tasks.map(task => {
          if (task.id === action.taskId) {
            return {
              ...task,
              checklists: task.checklists.map(checklist => {
                if (checklist.id === action.checklistId) {
                  return {
                    ...checklist,
                    items: checklist.items.filter(item => item.id !== action.itemId),
                  };
                }
                return checklist;
              }),
            };
          }
          return task;
        }),
      };

    case 'ADD_COLUMN':
      // Check if column already exists
      const columnExists = state.columns.some(col => col.id === action.column.id);
      if (columnExists) return state;
      
      return {
        ...state,
        columns: [...state.columns, action.column],
      };

    case 'UPDATE_COLUMN':
      return {
        ...state,
        columns: state.columns.map(column =>
          column.id === action.columnId ? { ...column, ...action.updates } : column
        ),
      };

    case 'DELETE_COLUMN':
      return {
        ...state,
        columns: state.columns.filter(column => column.id !== action.columnId),
        tasks: state.tasks.filter(task => task.columnId !== action.columnId), // Remove tasks in the deleted column
      };

    case 'REORDER_COLUMNS':
      const reorderedColumns = [...state.columns];
      const [movedItem] = reorderedColumns.splice(action.sourceIndex, 1);
      reorderedColumns.splice(action.destinationIndex, 0, movedItem);
      
      // Update order property
      const updatedColumns = reorderedColumns.map((col, index) => ({
        ...col,
        order: index,
      }));
      
      return {
        ...state,
        columns: updatedColumns,
      };

    case 'ADD_ATTACHMENT':
      return {
        ...state,
        tasks: state.tasks.map(task => {
          if (task.id === action.taskId) {
            return {
              ...task,
              attachments: [...(task.attachments || []), action.attachment],
            };
          }
          return task;
        }),
      };

    case 'DELETE_ATTACHMENT':
      return {
        ...state,
        tasks: state.tasks.map(task => {
          if (task.id === action.taskId) {
            return {
              ...task,
              attachments: (task.attachments || []).filter(att => att.id !== action.attachmentId),
            };
          }
          return task;
        }),
      };

    case 'ADD_SUBTASK':
      return {
        ...state,
        tasks: state.tasks.map(task => {
          if (task.id === action.taskId) {
            return {
              ...task,
              subtasks: [
                ...(task.subtasks || []),
                { ...action.subtask, id: uuidv4(), completed: false },
              ],
            };
          }
          return task;
        }),
      };

    case 'UPDATE_SUBTASK':
      return {
        ...state,
        tasks: state.tasks.map(task => {
          if (task.id === action.taskId) {
            return {
              ...task,
              subtasks: (task.subtasks || []).map(subtask => {
                if (subtask.id === action.subtaskId) {
                  return { ...subtask, ...action.updates };
                }
                return subtask;
              }),
            };
          }
          return task;
        }),
      };

    case 'DELETE_SUBTASK':
      return {
        ...state,
        tasks: state.tasks.map(task => {
          if (task.id === action.taskId) {
            return {
              ...task,
              subtasks: (task.subtasks || []).filter(subtask => subtask.id !== action.subtaskId),
            };
          }
          return task;
        }),
      };

    case 'RESET_BOARD':
      return initialState;

    default:
      return state;
  }
};

// Create context
const BoardContext = createContext<{
  board: Board;
  dispatch: React.Dispatch<BoardAction>;
  addTask: (columnId: string, title: string, options?: Partial<Task>) => void;
  updateTask: (taskId: string, updates: Partial<Task>) => void;
  deleteTask: (taskId: string) => void;
  moveTask: (taskId: string, newColumnId: string, newIndex: number) => void;
  toggleChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  addChecklistItem: (taskId: string, checklistId: string, text: string) => void;
  deleteChecklistItem: (taskId: string, checklistId: string, itemId: string) => void;
  addColumn: (column: Omit<Column, 'order'>) => void;
  updateColumn: (columnId: string, updates: Partial<Column>) => void;
  deleteColumn: (columnId: string) => void;
  reorderColumns: (sourceIndex: number, destinationIndex: number) => void;
  addAttachment: (taskId: string, attachment: Attachment) => void;
  deleteAttachment: (taskId: string, attachmentId: string) => void;
  addSubtask: (taskId: string, subtask: Omit<Subtask, 'id'>) => void;
  updateSubtask: (taskId: string, subtaskId: string, updates: Partial<Subtask>) => void;
  deleteSubtask: (taskId: string, subtaskId: string) => void;
  resetBoard: () => void;
} | undefined>(undefined);

// Provider component
export const BoardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(boardReducer, initialState);

  // Load board from localStorage on mount
  useEffect(() => {
    const savedBoard = localStorage.getItem('board-data');
    if (savedBoard) {
      try {
        const parsedBoard = JSON.parse(savedBoard);
        dispatch({ type: 'SET_BOARD', board: parsedBoard });
      } catch (error) {
        console.error('Failed to parse saved board:', error);
      }
    }
  }, []);

  // Save board to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('board-data', JSON.stringify(state));
  }, [state]);

  // Action creators
  const addTask = (columnId: string, title: string, options: Partial<Task> = {}) => {
    const newTask: Task = {
      id: options.id || uuidv4(),
      title,
      description: options.description || '',
      status: options.status || 'to_do',
      priority: options.priority || 'none',
      dueDate: options.dueDate,
      dueTime: options.dueTime,
      subject: options.subject,
      color: options.color,
      icon: options.icon,
      duration: options.duration,
      columnId,
      order: options.order || 0,
      completed: options.completed || false,
      completedAt: options.completedAt,
      labels: options.labels || [],
      checklists: options.checklists || [],
      subtasks: options.subtasks || [],
      attachments: options.attachments || [],
      comments: options.comments || [],
      createdAt: options.createdAt || new Date().toISOString(),
      updatedAt: options.updatedAt || new Date().toISOString(),
      projectId: options.projectId || null, // Associate with project
      projectName: options.projectName || undefined, // Store project name for reference
    };
    dispatch({ type: 'ADD_TASK', columnId, task: newTask });
  };

  const updateTask = (taskId: string, updates: Partial<Task>) => {
    dispatch({ type: 'UPDATE_TASK', taskId, updates });
  };

  const deleteTask = (taskId: string) => {
    dispatch({ type: 'DELETE_TASK', taskId });
  };

  const moveTask = (taskId: string, newColumnId: string, newIndex: number) => {
    dispatch({ type: 'MOVE_TASK', taskId, newColumnId, newIndex });
  };

  const toggleChecklistItem = (taskId: string, checklistId: string, itemId: string) => {
    dispatch({ type: 'TOGGLE_CHECKLIST_ITEM', taskId, checklistId, itemId });
  };

  const addChecklistItem = (taskId: string, checklistId: string, text: string) => {
    const newItem: Omit<ChecklistItem, 'id'> = {
      text,
      completed: false,
    };
    dispatch({ type: 'ADD_CHECKLIST_ITEM', taskId, checklistId, item: newItem });
  };

  const deleteChecklistItem = (taskId: string, checklistId: string, itemId: string) => {
    dispatch({ type: 'DELETE_CHECKLIST_ITEM', taskId, checklistId, itemId });
  };

  const addColumn = (column: Omit<Column, 'order'>) => {
    const newColumn: Column = {
      ...column,
      order: state.columns.length, // Add order based on current length
    };
    dispatch({ type: 'ADD_COLUMN', column: newColumn });
  };

  const updateColumn = (columnId: string, updates: Partial<Column>) => {
    dispatch({ type: 'UPDATE_COLUMN', columnId, updates });
  };

  const deleteColumn = (columnId: string) => {
    dispatch({ type: 'DELETE_COLUMN', columnId });
  };

  const reorderColumns = (sourceIndex: number, destinationIndex: number) => {
    dispatch({ type: 'REORDER_COLUMNS', sourceIndex, destinationIndex });
  };

  const addAttachment = (taskId: string, attachment: Attachment) => {
    dispatch({ type: 'ADD_ATTACHMENT', taskId, attachment });
  };

  const deleteAttachment = (taskId: string, attachmentId: string) => {
    dispatch({ type: 'DELETE_ATTACHMENT', taskId, attachmentId });
  };

  const addSubtask = (taskId: string, subtask: Omit<Subtask, 'id'>) => {
    dispatch({ type: 'ADD_SUBTASK', taskId, subtask });
  };

  const updateSubtask = (taskId: string, subtaskId: string, updates: Partial<Subtask>) => {
    dispatch({ type: 'UPDATE_SUBTASK', taskId, subtaskId, updates });
  };

  const deleteSubtask = (taskId: string, subtaskId: string) => {
    dispatch({ type: 'DELETE_SUBTASK', taskId, subtaskId });
  };

  const resetBoard = () => {
    dispatch({ type: 'RESET_BOARD' });
  };

  return (
    <BoardContext.Provider
      value={{
        board: state,
        dispatch,
        addTask,
        updateTask,
        deleteTask,
        moveTask,
        toggleChecklistItem,
        addChecklistItem,
        deleteChecklistItem,
        addColumn,
        updateColumn,
        deleteColumn,
        reorderColumns,
        addAttachment,
        deleteAttachment,
        addSubtask,
        updateSubtask,
        deleteSubtask,
        resetBoard,
      }}
    >
      {children}
    </BoardContext.Provider>
  );
};

// Custom hook to use the BoardContext
export const useBoardContext = () => {
  const context = useContext(BoardContext);
  if (!context) {
    throw new Error('useBoardContext must be used within a BoardProvider');
  }
  return context;
};

export default BoardContext;