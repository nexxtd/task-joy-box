import React, { useState } from 'react';
import { DragDropContext, Droppable, DropResult } from '@hello-pangea/dnd';
import { useBoardContext } from '@/context/BoardContext';
import BoardColumn from './BoardColumn';
import { Task } from '@/types/board';

const KanbanBoard: React.FC = () => {
  const { board, addTask, updateTask, deleteTask, addColumn, updateColumn, deleteColumn, reorderColumns } = useBoardContext();
  const [newColTitle, setNewColTitle] = useState('');

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId, type } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    if (type === 'COLUMN') {
      const sourceIndex = source.index;
      const destIndex = destination.index;
      reorderColumns(sourceIndex, destIndex);
      return;
    }

    const start = board.columns.find(col => col.id === source.droppableId);
    const finish = board.columns.find(col => col.id === destination.droppableId);

    if (!start || !finish) return;

    if (start.id === finish.id) {
      // Reordering in the same column
      // Get all tasks in this column and sort them by their order
      const columnTasks = board.tasks
        .filter(task => task.columnId === start.id)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // Create a new array with the updated order
      const updatedTasks = [...columnTasks];
      const [movedTask] = updatedTasks.splice(source.index, 1);
      updatedTasks.splice(destination.index, 0, movedTask);
      
      // Update the order property of each task
      const tasksWithNewOrder = updatedTasks.map((task, index) => ({
        ...task,
        order: index
      }));
      
      // Update each task in the board context
      tasksWithNewOrder.forEach(task => {
        updateTask(task.id, { order: task.order });
      });
      
      return;
    }

    // Moving between columns
    // Update the task's columnId
    updateTask(draggableId, { columnId: finish.id });
  };

  const handleAddColumn = () => {
    if (!newColTitle.trim()) return;
    
    // Create a new column object with all required properties
    const newColumn = {
      id: `column-${Date.now()}`,
      title: newColTitle.trim(),
      color: '#9CA3AF',
      icon: undefined,
      order: board.columns.length,
    };
    
    addColumn(newColumn);
    setNewColTitle('');
  };

  return (
    <div className="kanban-board flex gap-4 overflow-x-auto pb-4">
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="all-columns" direction="horizontal" type="COLUMN">
          {(provided) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="flex gap-4"
            >
              {board.columns.map((column, index) => {
                const columnTasks = board.tasks.filter(task => task.columnId === column.id);
                return (
                  <BoardColumn
                    key={column.id}
                    column={column}
                    tasks={columnTasks as Task[]}
                    onTaskClick={(task) => console.log('Task clicked:', task)}
                  />
                );
              })}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
      
      <div className="w-72 flex-shrink-0">
        <div className="bg-gray-100 rounded-lg p-3">
          <input
            type="text"
            value={newColTitle}
            onChange={(e) => setNewColTitle(e.target.value)}
            placeholder="New column title"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg mb-2"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddColumn();
            }}
          />
          <button
            onClick={handleAddColumn}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Add Column
          </button>
        </div>
      </div>
    </div>
  );
};

export default KanbanBoard;
