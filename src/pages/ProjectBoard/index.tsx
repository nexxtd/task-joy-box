import React, { useState, useEffect } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import { Task, TaskStatus, Priority } from '@/types/board';
import { Brain as BrainIcon, GripVertical } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const ProjectBoard: React.FC = () => {
  const { board, addTask, updateTask, deleteTask, addColumn, updateColumn, deleteColumn, reorderColumns } = useBoardContext();
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isAddingColumn, setIsAddingColumn] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('none');
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('to_do');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskSubject, setNewTaskSubject] = useState('');
  const [newTaskColor, setNewTaskColor] = useState('');
  const [newTaskIcon, setNewTaskIcon] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState(60);
  const [newTaskColumnId, setNewTaskColumnId] = useState('');
  const [newTaskSubtasks, setNewTaskSubtasks] = useState<string[]>([]);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskDetailModalVisible, setIsTaskDetailModalVisible] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [showRowUpgradePrompt, setShowRowUpgradePrompt] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<number | null>(null);
  
  const isFree = user?.subscriptionTier === 'free';

  // Load projects
  useEffect(() => {
    const loadProjects = async () => {
      try {
        const response = await fetch('/api/projects', { credentials: 'include' });
        if (!response.ok) throw new Error('Failed to load projects');
        const data = await response.json();
        setProjects(data.projects || []);
      } catch (error) {
        console.error('Error loading projects:', error);
        toast({ title: 'Error', description: 'Failed to load projects' });
      }
    };
    loadProjects();
  }, []);

  // Load project-specific columns and tasks when project is selected
  useEffect(() => {
    if (selectedProjectId) {
      // Fetch project-specific columns
      const loadProjectColumns = async () => {
        try {
          const response = await fetch(`/api/projects/${selectedProjectId}/columns`, { credentials: 'include' });
          if (response.ok) {
            const data = await response.json();
            setColumns(data.columns || []);
          } else {
            // If no project-specific columns exist, initialize with empty array
            setColumns([]);
          }
        } catch (error) {
          console.error('Error loading project columns:', error);
          // Initialize with empty array
          setColumns([]);
        }
      };
      
      // Filter tasks for the selected project
      const projectTasks = board.tasks.filter(task => task.projectId === selectedProjectId);
      setTasks(projectTasks);
      loadProjectColumns();
    } else {
      setTasks([]);
      setColumns([]);
    }
  }, [selectedProjectId, board.tasks]);

  const handleCreateTask = (columnId: string) => {
    if (isFree) {
      setShowRowUpgradePrompt(true);
      return;
    }
    
    // Determine the status based on the column ID
    let status: TaskStatus = 'to_do';
    if (columnId === 'in_progress') status = 'in_progress';
    else if (columnId === 'review') status = 'review';
    else if (columnId === 'completed') status = 'completed';
    
    setNewTaskColumnId(columnId);
    setNewTaskStatus(status);
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskPriority('none');
    setNewTaskDueDate('');
    setNewTaskSubject('');
    setNewTaskColor('');
    setNewTaskIcon('');
    setNewTaskDuration(60);
    setNewTaskSubtasks([]);
    setNewSubtaskText('');
    setNewFiles([]);
    setIsAddingTask(true);
  };

  const handleViewTask = (task: Task) => {
    setSelectedTask(task);
    setIsTaskDetailModalVisible(true);
  };

  const handleAddSubtask = () => {
    if (newSubtaskText.trim()) {
      setNewTaskSubtasks([...newTaskSubtasks, newSubtaskText.trim()]);
      setNewSubtaskText('');
    }
  };

  const removeSubtask = (index: number) => {
    setNewTaskSubtasks(newTaskSubtasks.filter((_, i) => i !== index));
  };

  const handleAddTask = async () => {
    if (newTaskTitle.trim() && newTaskColumnId && selectedProjectId) {
      const taskId = crypto.randomUUID();
      addTask(newTaskColumnId, newTaskTitle.trim(), {
        id: taskId,
        description: newTaskDescription.trim(),
        priority: newTaskPriority,
        status: newTaskStatus,
        dueDate: newTaskDueDate || undefined,
        subject: newTaskSubject.trim() || undefined,
        color: newTaskColor || undefined,
        icon: newTaskIcon || undefined,
        duration: newTaskDuration || undefined,
        subtasks: newTaskSubtasks.length > 0 ? newTaskSubtasks.map(s => ({ id: crypto.randomUUID(), text: s, completed: false })) : [],
        attachments: [],
        projectId: selectedProjectId, // Associate with selected project
      });

      setIsAddingTask(false);
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskPriority('none');
      setNewTaskStatus('to_do');
      setNewTaskDueDate('');
      setNewTaskSubject('');
      setNewTaskColor('');
      setNewTaskIcon('');
      setNewTaskDuration(60);
      setNewTaskColumnId('');
      setNewTaskSubtasks([]);
      setNewSubtaskText('');
      setNewFiles([]);
    }
  };

  const handleAddColumn = async () => {
    if (newColumnName.trim() && selectedProjectId) {
      try {
        const response = await fetch(`/api/projects/${selectedProjectId}/columns`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            title: newColumnName.trim(),
            order: columns.length,
            color: '#9CA3AF',
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          setColumns([...columns, data.column]);
          setNewColumnName('');
          setIsAddingColumn(false);
        } else {
          throw new Error('Failed to add column');
        }
      } catch (error) {
        console.error('Error adding column:', error);
        toast({ title: 'Error', description: 'Failed to add column' });
      }
    }
  };

  const handleDeepFocusClick = (task: Task) => {
    // Implementation for deep focus mode
    console.log('Starting deep focus for task:', task.title);
  };

  // Drag and drop handlers for columns
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: number) => {
    e.dataTransfer.setData("text/plain", id.toString());
    setDraggedColumn(id);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetId: number) => {
    e.preventDefault();
    const draggedId = parseInt(e.dataTransfer.getData("text/plain"));
    
    if (draggedId === targetId) return;
    
    const draggedIndex = columns.findIndex(col => col.id === draggedId);
    const targetIndex = columns.findIndex(col => col.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Create a new array with the dragged column moved to the target position
    const newColumns = [...columns];
    const [draggedColumnItem] = newColumns.splice(draggedIndex, 1);
    newColumns.splice(targetIndex, 0, draggedColumnItem);
    
    // Update the order property for each column
    const reorderedColumns = newColumns.map((col, index) => ({
      ...col,
      order: index
    }));
    
    setColumns(reorderedColumns);
    setDraggedColumn(null);
    
    // Update the order on the server
    updateColumnOrder(reorderedColumns);
  };

  const updateColumnOrder = async (orderedColumns: any[]) => {
    try {
      for (let i = 0; i < orderedColumns.length; i++) {
        const response = await fetch(`/api/projects/${selectedProjectId}/columns/${orderedColumns[i].id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ orderNum: i }),
        });
        
        if (!response.ok) {
          throw new Error('Failed to update column order');
        }
      }
    } catch (error) {
      console.error('Error updating column order:', error);
      toast({ title: 'Error', description: 'Failed to update column order' });
    }
  };

  const totalItems = selectedTask?.checklists.reduce((s, c) => s + c.items.length, 0) || 0;
  const doneItems = selectedTask?.checklists.reduce((s, c) => s + c.items.filter(i => i.completed).length, 0) || 0;
  const isOverdue = selectedTask?.dueDate && new Date(selectedTask.dueDate) < new Date();

  return (
    <div className="project-board min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="board-header mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold text-gray-900">Project Board</h1>
            <div className="flex items-center gap-4">
              <select
                value={selectedProjectId || ''}
                onChange={(e) => setSelectedProjectId(e.target.value ? Number(e.target.value) : null)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a project</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
              <button
                onClick={() => setIsAddingColumn(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Add Column
              </button>
            </div>
          </div>
        </div>

        {isAddingColumn && (
          <div className="mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
            <div className="flex gap-2">
              <input
                type="text"
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="Column name"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={handleAddColumn}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setIsAddingColumn(false);
                  setNewColumnName('');
                }}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {columns.length === 0 && selectedProjectId && (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-lg border border-gray-200">
            <div className="text-center max-w-md">
              <h3 className="text-lg font-medium text-gray-900 mb-2">No columns yet</h3>
              <p className="text-gray-500 mb-4">This project doesn't have any columns. Add your first column to get started.</p>
              <button
                onClick={() => setIsAddingColumn(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Add Your First Column
              </button>
            </div>
          </div>
        )}

        <div className="board-columns flex gap-4 overflow-x-auto pb-4">
          {columns.map((column) => {
            const tasksInColumn = tasks.filter(task => task.columnId === column.id);
            
            return (
              <div 
                key={column.id}
                draggable
                onDragStart={(e) => handleDragStart(e, column.id)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, column.id)}
                className="board-column min-w-[280px] bg-gray-100 rounded-lg p-3 flex flex-col"
              >
                <div className="column-header flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="w-4 h-4 text-gray-400" />
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: column.color }}
                    />
                    <div className="column-title font-semibold text-gray-800">
                      {column.title}
                    </div>
                  </div>
                  <div className="column-count bg-gray-200 text-gray-700 rounded-full w-6 h-6 flex items-center justify-center text-xs">
                    {tasksInColumn.length}
                  </div>
                </div>
                
                <div className="column-tasks flex-grow space-y-3">
                  {tasksInColumn.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => handleViewTask(task)}
                      className="task-card group rounded-lg bg-white p-3 cursor-pointer border border-gray-200 hover:border-gray-300 transition-all duration-150 hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        {task.color && (
                          <div className="w-2.5 h-2.5 rounded-full shadow-sm flex-shrink-0" style={{ backgroundColor: task.color }} />
                        )}
                        <p className="text-sm font-bold text-gray-900 leading-snug truncate">{task.title}</p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeepFocusClick(task);
                          }}
                          className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-blue-100 rounded text-gray-500 hover:text-blue-600"
                          title="Start Deep Focus"
                        >
                          <BrainIcon className="w-3.5 h-3.5" />
                        </button>
                        {task.icon && <span className="text-xs opacity-70">{task.icon}</span>}
                      </div>
                      
                      <div className="flex flex-wrap gap-1">
                        {task.priority !== 'none' && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            task.priority === 'urgent' ? 'bg-red-100 text-red-800' :
                            task.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                            task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {task.priority.toUpperCase()}
                          </span>
                        )}
                        {task.dueDate && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                            new Date(task.dueDate) < new Date() ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {task.duration && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-800">
                            {task.duration}m
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <button
                    onClick={() => handleCreateTask(column.id)}
                    className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <span>+ Add Task</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Task Modal */}
      {isAddingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Add New Task</h3>
                <button 
                  onClick={() => setIsAddingTask(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Title</label>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter task title"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newTaskDescription}
                  onChange={(e) => setNewTaskDescription(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter description"
                  rows={3}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as Priority)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="none">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={newTaskStatus}
                    onChange={(e) => setNewTaskStatus(e.target.value as TaskStatus)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="to_do">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={(e) => setNewTaskDueDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                  <input
                    type="number"
                    value={newTaskDuration}
                    onChange={(e) => setNewTaskDuration(Number(e.target.value))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="0"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={newTaskSubject}
                  onChange={(e) => setNewTaskSubject(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter subject"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                  <input
                    type="color"
                    value={newTaskColor}
                    onChange={(e) => setNewTaskColor(e.target.value)}
                    className="w-full h-10 border border-gray-300 rounded-lg px-1 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
                  <input
                    type="text"
                    value={newTaskIcon}
                    onChange={(e) => setNewTaskIcon(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter emoji or icon"
                  />
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtasks</label>
                <div className="space-y-2 mb-2">
                  {newTaskSubtasks.map((subtask, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-100 p-2 rounded">
                      <span className="text-sm">{subtask}</span>
                      <button 
                        onClick={() => removeSubtask(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newSubtaskText}
                    onChange={(e) => setNewSubtaskText(e.target.value)}
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Add subtask"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddSubtask()}
                  />
                  <button
                    onClick={handleAddSubtask}
                    className="px-3 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 text-sm font-medium"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-5 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setIsAddingTask(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTask}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                disabled={!newTaskTitle.trim() || !newTaskColumnId}
              >
                Add Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {isTaskDetailModalVisible && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Task Details</h3>
                <button 
                  onClick={() => setIsTaskDetailModalVisible(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-2">{selectedTask.title}</h4>
                <p className="text-gray-600">{selectedTask.description}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Priority</p>
                  <p className="text-sm font-medium capitalize">{selectedTask.priority}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <p className="text-sm font-medium capitalize">{selectedTask.status}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Due Date</p>
                  <p className="text-sm font-medium">
                    {selectedTask.dueDate ? new Date(selectedTask.dueDate).toLocaleDateString() : 'No due date'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Duration</p>
                  <p className="text-sm font-medium">{selectedTask.duration} minutes</p>
                </div>
              </div>
              
              {selectedTask.subtasks && selectedTask.subtasks.length > 0 && (
                <div>
                  <h5 className="text-sm font-semibold text-gray-900 mb-2">Subtasks</h5>
                  <ul className="space-y-1">
                    {selectedTask.subtasks.map((subtask, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <input 
                          type="checkbox" 
                          checked={subtask.completed} 
                          onChange={() => {
                            const updatedSubtasks = [...selectedTask.subtasks];
                            updatedSubtasks[index] = { ...subtask, completed: !subtask.completed };
                            updateTask(selectedTask.id, { subtasks: updatedSubtasks });
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span className={`${subtask.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                          {subtask.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            
            <div className="p-5 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setIsTaskDetailModalVisible(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Prompt for Free Users */}
      {showRowUpgradePrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Upgrade Required</h3>
              <p className="text-gray-600 mb-4">Free plan users cannot add tasks to project boards. Upgrade to add tasks.</p>
              <button
                onClick={() => setShowRowUpgradePrompt(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectBoard;