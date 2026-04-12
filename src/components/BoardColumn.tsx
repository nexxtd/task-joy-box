import React, { useState } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Column as ColumnType, Task } from '@/types/board';
import { useBoardContext } from '@/context/BoardContext';
import TaskCard from './TaskCard';
import { Plus, MoreHorizontal, Trash2 } from 'lucide-react';

interface BoardColumnProps {
  column: ColumnType;
  tasks: Task[];
  index: number;
  onTaskClick: (task: Task) => void;
}

const BoardColumn: React.FC<BoardColumnProps> = ({ column, tasks, index, onTaskClick }) => {
  const { addTask, deleteColumn } = useBoardContext();
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showMenu, setShowMenu] = useState(false);

  const handleAdd = () => {
    if (newTitle.trim()) {
      addTask(column.id, newTitle.trim());
      setNewTitle('');
      setIsAdding(false);
    }
  };

  return (
    <Draggable draggableId={column.id} index={index}>
      {(provided) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          className="flex-shrink-0 w-72"
        >
          {/* Column header */}
          <div
            {...provided.dragHandleProps}
            className="flex items-center justify-between px-2 py-2 mb-2"
          >
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: column.color }} />
              <h3 className="text-sm font-semibold text-foreground">{column.title}</h3>
              <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full font-medium">
                {tasks.length}
              </span>
            </div>
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showMenu && (
                <div className="absolute left-0 top-8 bg-popover border border-border rounded-lg shadow-xl z-50 py-1 min-w-[140px] animate-fade-in">
                  <button
                    onClick={() => { deleteColumn(column.id); setShowMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    מחק עמודה
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Tasks droppable */}
          <Droppable droppableId={column.id} type="task">
            {(dropProvided, snapshot) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className={`min-h-[60px] space-y-2 p-1 rounded-lg transition-colors ${snapshot.isDraggingOver ? 'bg-muted/40' : ''}`}
              >
                {tasks.map((task, taskIndex) => (
                  <Draggable key={task.id} draggableId={task.id} index={taskIndex}>
                    {(taskProvided, taskSnapshot) => (
                      <div
                        ref={taskProvided.innerRef}
                        {...taskProvided.draggableProps}
                        {...taskProvided.dragHandleProps}
                      >
                        <TaskCard
                          task={task}
                          onClick={() => onTaskClick(task)}
                          isDragging={taskSnapshot.isDragging}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>

          {/* Add task */}
          {isAdding ? (
            <div className="mt-2 p-1">
              <textarea
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); }
                  if (e.key === 'Escape') setIsAdding(false);
                }}
                placeholder="הכנס שם משימה..."
                className="w-full bg-task border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                rows={2}
              />
              <div className="flex gap-2 mt-2">
                <button onClick={handleAdd} className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 rounded-md hover:opacity-90 transition-opacity">
                  הוסף
                </button>
                <button onClick={() => setIsAdding(false)} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1.5 transition-colors">
                  ביטול
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAdding(true)}
              className="mt-2 w-full flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              הוסף משימה
            </button>
          )}
        </div>
      )}
    </Draggable>
  );
};

export default BoardColumn;
