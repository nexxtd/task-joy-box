import React, { useState, useEffect } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Column as ColumnType, Task } from '@/types/board';
import { useBoardContext } from '@/context/BoardContext';
import TaskCard from './TaskCard';
import { Plus, MoreHorizontal, Trash2, Sparkles, Lock, X, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface BoardColumnProps {
  column: ColumnType;
  tasks: Task[];
  index: number;
  onTaskClick: (task: Task) => void;
  canCreateTasks?: boolean;
  onAddClick?: () => void;
  canEdit?: boolean;
}

const BoardColumn: React.FC<BoardColumnProps> = ({ column, tasks, index, onTaskClick, canCreateTasks = true, onAddClick, canEdit = true }) => {
  const { addTask, deleteColumn, updateColumn, updateTask, moveTask } = useBoardContext();
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'urgent' | 'high' | 'medium' | 'low' | 'none'>('none');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [subject, setSubject] = useState('');
  const [color, setColor] = useState('');
  const [icon, setIcon] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [duration, setDuration] = useState<number>(60);
  const [showRowUpgradePrompt, setShowRowUpgradePrompt] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const isPremium = user?.subscriptionTier === 'premium';
  const isFree = !user?.subscriptionTier || user.subscriptionTier === 'free';
  const [showMenu, setShowMenu] = useState(false);
  const [editingColumnName, setEditingColumnName] = useState(false);
  const [columnName, setColumnName] = useState(column.title);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [columnIcon, setColumnIcon] = useState(column.icon || '');
  const [assignableUsers, setAssignableUsers] = useState<{ id: number; name: string; avatarUrl?: string }[]>([]);

  const COLUMN_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', 
    '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f43f5e'
  ];

  // Separate completed and uncompleted tasks
  const uncompletedTasks = tasks.filter(task => !task.completed);
  const completedTasks = tasks.filter(task => task.completed);

  // Fetch assignable users
  useEffect(() => {
    const fetchAssignableUsers = async () => {
      try {
        const response = await fetch('/api/boards/assignable-users', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await response.json();
        if (data.users) {
          setAssignableUsers(data.users);
        }
      } catch (error) {
        console.error('Failed to fetch assignable users:', error);
      }
    };
    
    fetchAssignableUsers();
  }, []);

  // Function to update task assignment
  const updateTaskAssignment = async (taskId: string, userId: number | null) => {
    // Only allow assignment if user has edit permissions
    if (!canEdit) return;
    
    try {
      const response = await fetch(`/api/boards/tasks/${taskId}/assignment`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ assignedToUserId: userId })
      });
      
      if (response.ok) {
        // Update the local task with the assignment
        const userObj = userId !== null 
          ? assignableUsers.find(u => u.id === userId) 
          : null;
          
        updateTask(taskId, { 
          assignedTo: userObj ? { 
            id: userObj.id, 
            name: userObj.name, 
            avatarUrl: userObj.avatarUrl 
          } : null 
        });
      } else {
        console.error('Failed to update task assignment');
      }
    } catch (error) {
      console.error('Error updating task assignment:', error);
    }
  };

  const handleAddTask = async () => {
    if (!newTitle.trim()) return;

    if (isFree && tasks.length >= 10) {
      setShowRowUpgradePrompt(true);
      return;
    }

    // Create a new task object
    const newTask: Omit<Task, 'id'> = {
      title: newTitle,
      description,
      priority,
      dueDate: dueDate || undefined,
      dueTime: dueTime || undefined,
      subject: subject || undefined,
      color: color || undefined,
      icon: icon || undefined,
      duration: duration || undefined,
      labels: [],
      checklists: [],
      subtasks: subtasks.map(text => ({ id: crypto.randomUUID(), text, completed: false })),
      createdAt: new Date().toISOString(),
      columnId: column.id,
      order: tasks.length,
      assignedTo: null
    };

    // Add the task via context
    addTask(newTask, column.id);

    // Reset form
    setNewTitle('');
    setDescription('');
    setPriority('none');
    setDueDate('');
    setDueTime('');
    setSubject('');
    setColor('');
    setIcon('');
    setDuration(60);
    setSubtasks([]);
    setNewFiles([]);
    setIsAdding(false);
  };

  const handleToggleComplete = (e: React.MouseEvent, task: Task) => {
    e.stopPropagation();
    if (!canEdit) return;
    
    const completedCol = column.title.toLowerCase().includes('completed');
    updateTask(task.id, { 
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : undefined
    });
  };

  return (
    <>
    <Draggable draggableId={column.id} index={index} isDragDisabled={!canEdit}>
      {(provided) => (
        <div ref={provided.innerRef} {...provided.draggableProps} className="flex-shrink-0 w-80">
          <div {...provided.dragHandleProps} className="flex items-center justify-between px-2 py-2 mb-2">
            <div className="flex items-center gap-2">
              {column.icon && <span className="text-sm">{column.icon}</span>}
              <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: column.color }} />
              {editingColumnName ? (
                <input
                  autoFocus
                  value={columnName}
                  onChange={e => setColumnName(e.target.value)}
                  onBlur={() => {
                    if (columnName.trim() && columnName !== column.title) {
                      updateColumn(column.id, { title: columnName.trim() });
                    }
                    setEditingColumnName(false);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (columnName.trim() && columnName !== column.title) {
                        updateColumn(column.id, { title: columnName.trim() });
                      }
                      setEditingColumnName(false);
                    }
                    if (e.key === 'Escape') {
                      setColumnName(column.title);
                      setEditingColumnName(false);
                    }
                  }}
                  className="text-sm font-bold text-foreground bg-muted border border-border rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              ) : (
                <h3 className="text-sm font-bold text-foreground tracking-tight">{column.title}</h3>
              )}
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-bold">{tasks.length}</span>
            </div>
            {canEdit && (
              <div className="relative">
                <button onClick={() => setShowMenu(!showMenu)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-9 bg-popover border border-border rounded-xl shadow-2xl z-50 py-1.5 min-w-[200px] animate-in fade-in zoom-in-95 duration-200">
                    <button
                      onClick={() => { setShowMenu(false); setEditingColumnName(true); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Rename Column
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); setShowColorPicker(!showColorPicker); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <div className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: column.color }} />
                      Change Color
                    </button>
                    <button
                      onClick={() => { setShowMenu(false); setShowIconPicker(!showIconPicker); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <Sparkles className="w-4 h-4" /> Change Icon
                    </button>
                    <div className="border-t border-border my-1" />
                    <button
                      onClick={() => { setShowMenu(false); deleteColumn(column.id); }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-destructive/5 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Column
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <Droppable droppableId={column.id} type="task">
            {(dropProvided, snapshot) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className={`min-h-[100px] space-y-3 p-2 rounded-xl transition-all duration-300 ${snapshot.isDraggingOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset' : ''}`}
              >
                {/* Uncompleted tasks */}
                {uncompletedTasks.map((task, taskIndex) => (
                  <Draggable key={task.id} draggableId={task.id} index={taskIndex} isDragDisabled={!canEdit}>
                    {(taskProvided, taskSnapshot) => (
                      <div ref={taskProvided.innerRef} {...taskProvided.draggableProps} {...taskProvided.dragHandleProps}>
                        <TaskCard 
                          task={task} 
                          onClick={() => onTaskClick(task)} 
                          isDragging={taskSnapshot.isDragging}
                          onToggleComplete={(e) => handleToggleComplete(e, task)}
                          canEdit={canEdit}  // Pass the canEdit prop to TaskCard
                          onAssignUser={canEdit ? updateTaskAssignment : undefined}  // Only allow assignment if user can edit
                          assignableUsers={assignableUsers}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                
                {/* Completed tasks section */}
                {completedTasks.length > 0 && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2 px-1">Completed ({completedTasks.length})</p>
                    {completedTasks.map((task, taskIndex) => (
                      <Draggable key={task.id} draggableId={task.id} index={uncompletedTasks.length + taskIndex} isDragDisabled={!canEdit}>
                        {(taskProvided, taskSnapshot) => (
                          <div ref={taskProvided.innerRef} {...taskProvided.draggableProps} {...taskProvided.dragHandleProps}>
                            <TaskCard 
                              task={task} 
                              onClick={() => onTaskClick(task)} 
                              isDragging={taskSnapshot.isDragging}
                              onToggleComplete={(e) => handleToggleComplete(e, task)}
                              canEdit={canEdit}  // Pass the canEdit prop to TaskCard
                              onAssignUser={canEdit ? updateTaskAssignment : undefined}  // Only allow assignment if user can edit
                              assignableUsers={assignableUsers}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                  </div>
                )}
                
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>

          {/* Only show add task button if user can edit */}
          {isAdding ? (
            <div className="mt-3 p-4 bg-card border-2 border-primary/20 rounded-2xl shadow-xl animate-in slide-in-from-top-2 duration-300 overflow-hidden">

              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Plus className="w-4 h-4 text-primary" />
                </div>
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">New Task</h4>
              </div>

              <textarea
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full text-sm bg-muted border border-border rounded-xl px-3 py-2 mb-3 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                rows={2}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleAddTask())}
              />

              <div className="flex flex-wrap gap-2 mb-3">
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as any)}
                  className="text-xs bg-muted border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="none">Priority</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>

                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="text-xs bg-muted border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                />

                <input
                  type="time"
                  value={dueTime}
                  onChange={e => setDueTime(e.target.value)}
                  className="text-xs bg-muted border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                />

                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="Subject"
                  className="text-xs bg-muted border border-border rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary flex-1 min-w-[100px]"
                />
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setIsAdding(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded-lg transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
                <button
                  onClick={handleAddTask}
                  disabled={!newTitle.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Task
                </button>
              </div>
            </div>
          ) : (
            canEdit && onAddClick && (  // Only show add button if user can edit and onAddClick is provided
              <button
                onClick={onAddClick}
                className="w-full mt-3 p-3 border-2 border-dashed border-border rounded-xl text-muted-foreground hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center gap-2 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Task
              </button>
            )
          )}
        </div>
      )}
    </Draggable>

    {showRowUpgradePrompt && (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowRowUpgradePrompt(false)}>
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
        <div
          className="relative bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm p-8 animate-fade-in text-center"
          onClick={e => e.stopPropagation()}
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-amber-500" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Premium Feature</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Adding tasks (rows) to your board is a <strong>Pro feature</strong>. Upgrade to unlock unlimited tasks across all your projects.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => { setShowRowUpgradePrompt(false); navigate('/pricing'); }}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors"
            >
              View Plans
            </button>
            <button
              onClick={() => setShowRowUpgradePrompt(false)}
              className="w-full py-2.5 text-muted-foreground text-sm hover:text-foreground transition-colors"
            >
              Stay on Free
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default BoardColumn;