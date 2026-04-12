import React, { useState } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { useBoardContext } from '@/context/BoardContext';
import BoardColumn from './BoardColumn';
import TaskDetailModal from './TaskDetailModal';
import { Task } from '@/types/board';
import { Plus, LayoutDashboard } from 'lucide-react';

const KanbanBoard: React.FC = () => {
  const { board, moveTask, reorderColumns, addColumn } = useBoardContext();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');

  const sortedColumns = [...board.columns].sort((a, b) => a.order - b.order);

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    if (result.type === 'column') {
      reorderColumns(result.source.index, result.destination.index);
      return;
    }

    // Task drag
    moveTask(result.draggableId, result.destination.droppableId, result.destination.index);
  };

  const handleAddColumn = () => {
    if (newColTitle.trim()) {
      addColumn(newColTitle.trim());
      setNewColTitle('');
      setAddingColumn(false);
    }
  };

  // Sync selected task with latest state
  const currentTask = selectedTask ? board.tasks.find(t => t.id === selectedTask.id) : null;

  return (
    <div className="h-screen flex flex-col bg-background" dir="rtl">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <LayoutDashboard className="w-4 h-4 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-bold text-foreground">{board.title}</h1>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{board.tasks.length} משימות</span>
          <span>·</span>
          <span>{board.columns.length} עמודות</span>
        </div>
      </header>

      {/* Board */}
      <div className="flex-1 overflow-x-auto p-6">
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="board" type="column" direction="horizontal">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="flex gap-6 items-start h-full"
              >
                {sortedColumns.map((column, index) => {
                  const tasks = board.tasks
                    .filter(t => t.columnId === column.id)
                    .sort((a, b) => a.order - b.order);
                  return (
                    <BoardColumn
                      key={column.id}
                      column={column}
                      tasks={tasks}
                      index={index}
                      onTaskClick={setSelectedTask}
                    />
                  );
                })}
                {provided.placeholder}

                {/* Add column */}
                {addingColumn ? (
                  <div className="flex-shrink-0 w-72 animate-fade-in">
                    <input
                      autoFocus
                      value={newColTitle}
                      onChange={e => setNewColTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddColumn();
                        if (e.key === 'Escape') setAddingColumn(false);
                      }}
                      placeholder="שם העמודה..."
                      className="w-full bg-task border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <div className="flex gap-2 mt-2">
                      <button onClick={handleAddColumn} className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 rounded-md">הוסף</button>
                      <button onClick={() => setAddingColumn(false)} className="text-xs text-muted-foreground px-3 py-1.5">ביטול</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingColumn(true)}
                    className="flex-shrink-0 w-72 flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border hover:border-foreground/30 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    הוסף עמודה
                  </button>
                )}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* Task detail modal */}
      {currentTask && (
        <TaskDetailModal
          task={currentTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
};

export default KanbanBoard;
