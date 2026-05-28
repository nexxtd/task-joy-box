import React, { useState } from 'react';
import { Modal, Form, Input, Select, DatePicker, TimePicker, Upload, Button, Space, Tag } from 'antd';
import { PlusOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { Task, LABEL_COLORS, PRIORITY_CONFIG, TaskStatus, Checklist, Subtask } from '@/types/board';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useDeepFocus } from '@/hooks/useDeepFocus';

const ProjectBoard = () => {
  const { board, addTask, updateTask, deleteTask, addChecklist, toggleChecklistItem, addChecklistItem, deleteChecklistItem } = useBoardContext();
  const { user } = useAuth();
  const { open: openDeepFocus } = useDeepFocus();
  const navigate = useNavigate();
  
  const [form] = Form.useForm();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskDetailModalVisible, setIsTaskDetailModalVisible] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'urgent' | 'high' | 'medium' | 'low' | 'none'>('none');
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('to_do');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskSubject, setNewTaskSubject] = useState('');
  const [newTaskColor, setNewTaskColor] = useState('');
  const [newTaskIcon, setNewTaskIcon] = useState('');
  const [newTaskDuration, setNewTaskDuration] = useState<number>(60);
  const [newTaskColumnId, setNewTaskColumnId] = useState<string>('');
  const [newTaskSubtasks, setNewTaskSubtasks] = useState<string[]>([]);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [showRowUpgradePrompt, setShowRowUpgradePrompt] = useState(false);

  const isPremium = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  const isFree = !user?.subscriptionTier || user.subscriptionTier === 'free';

  // Default columns that can't be deleted
  const defaultColumns = [
    { id: 'to_do', title: 'To Do', color: '#f59e0b' },
    { id: 'in_progress', title: 'In Progress', color: '#3b82f6' },
    { id: 'review', title: 'Review', color: '#f59e0b' },
    { id: 'completed', title: 'Completed', color: '#10b981' }
  ];

  // Custom columns for free plan (2 custom columns)
  const customColumns = board.columns
    .filter(col => !defaultColumns.some(dc => dc.id === col.id))
    .map(col => ({ ...col, color: col.color || '#6b7280' }));

  // Limit to 2 custom columns for free plan
  const limitedCustomColumns = customColumns.slice(0, 2);
  const allColumns = [...defaultColumns, ...limitedCustomColumns];

  const handleCreateTask = (columnId: string) => {
    if (isFree) {
      setNewTaskColumnId(columnId);
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
    if (newTaskTitle.trim() && newTaskColumnId) {
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
        attachments: []
      });

      // Handle file uploads
      if (newFiles.length > 0) {
        for (const file of newFiles) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('taskId', taskId);
          try {
            await fetch('/api/attachments/upload', {
              method: 'POST',
              body: formData,
              credentials: 'include'
            });
          } catch (err) {
            console.error('Failed to upload file:', file.name, err);
          }
        }
      }
      
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskPriority('none');
      setNewTaskStatus('to_do');
      setNewTaskDueDate('');
      setNewTaskSubject('');
      setNewTaskColor('');
      setNewTaskIcon('');
      setNewTaskDuration(60);
      setNewTaskSubtasks([]);
      setNewSubtaskText('');
      setNewFiles([]);
      setIsAddingTask(false);
    }
  };

  const handleCancelAddTask = () => {
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskPriority('none');
    setNewTaskStatus('to_do');
    setNewTaskDueDate('');
    setNewTaskSubject('');
    setNewTaskColor('');
    setNewTaskIcon('');
    setNewTaskDuration(60);
    setNewTaskSubtasks([]);
    setNewSubtaskText('');
    setNewFiles([]);
    setIsAddingTask(false);
  };

  const handleTaskDetailClose = () => {
    setIsTaskDetailModalVisible(false);
    setSelectedTask(null);
  };

  const handleDeepFocusClick = (task: Task) => {
    openDeepFocus(task);
  };

  const totalItems = selectedTask?.checklists.reduce((s, c) => s + c.items.length, 0) || 0;
  const doneItems = selectedTask?.checklists.reduce((s, c) => s + c.items.filter(i => i.completed).length, 0) || 0;
  const isOverdue = selectedTask?.dueDate && new Date(selectedTask.dueDate) < new Date();

  return (
    <div className="project-board">
      <div className="board-header">
        <h1>Project Board</h1>
      </div>
      
      <div className="board-columns">
        {allColumns.map((column) => {
          const tasksInColumn = board.tasks.filter(task => task.columnId === column.id);
          
          return (
            <div key={column.id} className="board-column">
              <div className="column-header">
                <div className="column-title" style={{ backgroundColor: column.color }}>
                  {column.title}
                </div>
                <div className="column-count">{tasksInColumn.length}</div>
              </div>
              
              <div className="column-tasks">
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

                    {(task.subject || task.labels.length > 0) && (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {task.subject && (
                          <span className="bg-blue-100 text-blue-800 text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                            {task.subject}
                          </span>
                        )}
                        {task.labels.map(label => (
                          <span key={label.id} className={`${LABEL_COLORS[label.color]} text-[10px] font-semibold px-2 py-0.5 rounded-full text-white`}>
                            {label.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                      {task.priority !== 'none' && (
                        <span className={`${PRIORITY_CONFIG[task.priority].className} text-[10px] font-bold px-1.5 py-0.5 rounded text-white flex items-center gap-1`}>
                          {task.priority === 'urgent' && <AlertTriangleIcon className="w-3 h-3" />}
                          {PRIORITY_CONFIG[task.priority].label}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className={`flex items-center gap-1 text-[11px] ${isOverdue ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                          <CalendarIcon className="w-3 h-3" />
                          {new Date(task.dueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                        </span>
                      )}
                      {(task.checklists?.reduce((s, c) => s + c.items.length, 0) || 0) > 0 && (
                        <span className={`flex items-center gap-1 text-[11px] ${(task.checklists?.reduce((s, c) => s + c.items.filter(i => i.completed).length, 0) || 0) === (task.checklists?.reduce((s, c) => s + c.items.length, 0) || 0) ? 'text-green-600' : 'text-gray-500'}`}>
                          <CheckSquareIcon className="w-3 h-3" />
                          {task.checklists?.reduce((s, c) => s + c.items.filter(i => i.completed).length, 0) || 0}/{task.checklists?.reduce((s, c) => s + c.items.length, 0) || 0}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              
              {isFree ? (
                <button
                  onClick={() => {
                    setNewTaskColumnId(column.id);
                    setShowRowUpgradePrompt(true);
                  }}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-amber-600 border-2 border-dashed border-amber-400/50 hover:border-amber-400 hover:bg-amber-50 rounded-2xl transition-all duration-300"
                >
                  <DeleteOutlined />
                  Upgrade to Add Tasks
                </button>
              ) : (
                <button
                  onClick={() => handleCreateTask(column.id)}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-gray-500 hover:text-blue-600 hover:bg-blue-50 border-2 border-dashed border-gray-300 hover:border-blue-200 rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-95"
                >
                  <PlusOutlined />
                  Add New Task
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Task Modal */}
      {isAddingTask && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 md:p-8" onClick={handleCancelAddTask}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-3xl bg-white border border-gray-200 rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Create Task</h2>
              <button onClick={handleCancelAddTask} className="p-1.5 rounded-lg hover:bg-gray-100">
                <XIcon className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div>
                <label className="text-xs font-semibold uppercase text-gray-500">Task title</label>
                <input
                  autoFocus
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  className="mt-1 w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">Status</label>
                  <select
                    value={newTaskStatus}
                    onChange={e => setNewTaskStatus(e.target.value as TaskStatus)}
                    className="mt-1 w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="to_do">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={e => setNewTaskPriority(e.target.value as any)}
                    className="mt-1 w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="none">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">Due Date</label>
                  <input
                    type="date"
                    value={newTaskDueDate}
                    onChange={e => setNewTaskDueDate(e.target.value)}
                    className="mt-1 w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">Due Time</label>
                  <input
                    type="time"
                    className="mt-1 w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">Subject</label>
                  <input
                    type="text"
                    value={newTaskSubject}
                    onChange={e => setNewTaskSubject(e.target.value)}
                    placeholder="e.g. Maths"
                    className="mt-1 w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">Duration (min)</label>
                  <input
                    type="number"
                    min={5}
                    max={480}
                    step={5}
                    value={newTaskDuration}
                    onChange={e => setNewTaskDuration(Number(e.target.value))}
                    className="mt-1 w-full bg-gray-50 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold uppercase text-gray-500">Color & Icon</label>
                  <div className="flex gap-1">
                    <input
                      type="color"
                      value={newTaskColor}
                      onChange={e => setNewTaskColor(e.target.value)}
                      className="w-8 h-8 rounded bg-gray-50 border border-gray-300 p-0.5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={newTaskIcon}
                      onChange={e => setNewTaskIcon(e.target.value)}
                      placeholder="Icon name"
                      className="flex-1 bg-gray-50 border border-gray-300 rounded-xl p-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Subtasks Section */}
              <div className="mb-4 space-y-2">
                <label className="text-xs font-semibold uppercase text-gray-500">Subtasks</label>
                <div className="space-y-1 mb-2">
                  {newTaskSubtasks.map((st, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-100 px-2 py-1 rounded-lg border border-gray-200 group">
                      <span className="flex-1 text-sm text-gray-700">{st}</span>
                      <button onClick={() => removeSubtask(i)} className="text-gray-500 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                        <DeleteOutlined />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    value={newSubtaskText}
                    onChange={e => setNewSubtaskText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
                    placeholder="Add subtask..."
                    className="flex-1 bg-gray-50 border border-gray-300 rounded-xl p-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button 
                    onClick={handleAddSubtask}
                    className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-all"
                  >
                    <PlusOutlined />
                  </button>
                </div>
              </div>
              
              <textarea
                value={newTaskDescription}
                onChange={e => setNewTaskDescription(e.target.value)}
                placeholder="Add more details..."
                className="w-full bg-gray-50 border border-gray-300 rounded-xl p-3 text-sm text-gray-900 placeholder-gray-500 resize-none mb-4 focus:outline-none focus:ring-1 focus:ring-blue-500"
                rows={3}
              />

              {/* Attachments Section */}
              <div className="mb-4 space-y-2">
                <label className="text-xs font-semibold uppercase text-gray-500">Attachments</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {newFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 text-xs font-medium text-blue-600 uppercase">
                      {f.name}
                      <button onClick={() => setNewFiles(newFiles.filter((_, idx) => idx !== i))} className="hover:text-red-500">
                        <DeleteOutlined />
                      </button>
                    </div>
                  ))}
                </div>
                <label 
                  className={`flex items-center gap-2 w-max px-3 py-1.5 border rounded-lg text-xs font-bold transition-all ${
                    isPremium 
                      ? 'bg-gray-50 border-gray-300 text-gray-700 hover:text-gray-900 hover:bg-gray-100 cursor-pointer'
                      : 'bg-blue-50 border-blue-200 text-blue-600 opacity-80 cursor-pointer'
                  }`}
                  onClick={() => !isPremium && (navigate('/pricing'))}
                >
                  {isPremium ? <PlusOutlined /> : <SparklesIcon className="w-3 h-3" />}
                  {isPremium ? 'Add File' : 'Post Files (Premium)'}
                  {isPremium && (
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={e => {
                        if (e.target.files) {
                          setNewFiles([...newFiles, ...Array.from(e.target.files)]);
                        }
                      }}
                    />
                  )}
                </label>
              </div>
              
              <div className="flex gap-2">
                <button 
                  onClick={handleAddTask} 
                  className="flex-1 bg-blue-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-md shadow-blue-200"
                  disabled={!newTaskTitle.trim()}
                >
                  Create Task
                </button>
                <button 
                  onClick={handleCancelAddTask} 
                  className="px-4 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      {isTaskDetailModalVisible && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4" onClick={handleTaskDetailClose}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between z-10">
              <div className="flex-1">
                <input
                  className="w-full text-lg font-semibold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-0"
                  value={selectedTask.title}
                  onChange={(e) => {
                    const updatedTask = { ...selectedTask, title: e.target.value };
                    setSelectedTask(updatedTask);
                    updateTask(updatedTask.id, { title: e.target.value });
                  }}
                />
                <p className="text-xs text-gray-500 mt-1">
                  in column: <span className="text-gray-900 font-medium">{allColumns.find(c => c.id === selectedTask.columnId)?.title}</span>
                </p>
              </div>
              <button onClick={handleTaskDetailClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Labels */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <TagIcon className="w-3.5 h-3.5" /> Labels
                  </h4>
                </div>
                {selectedTask.labels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedTask.labels.map(l => (
                      <span key={l.id} className={`${LABEL_COLORS[l.color]} text-xs font-medium px-2.5 py-1 rounded-full text-white`}>
                        {l.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Status */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    Status
                  </h4>
                  <select
                    value={selectedTask.status || 'to_do'}
                    onChange={e => {
                      const newStatus = e.target.value as TaskStatus;
                      const updatedTask = { ...selectedTask, status: newStatus };
                      
                      // If moving to a default column, update the columnId accordingly
                      let newColumnId = selectedTask.columnId;
                      if (['to_do', 'in_progress', 'review', 'completed'].includes(newStatus)) {
                        newColumnId = newStatus;
                      }
                      
                      setSelectedTask(updatedTask);
                      updateTask(updatedTask.id, { status: newStatus, columnId: newColumnId });
                    }}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="to_do">To Do</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                {/* Priority */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <AlertTriangleIcon className="w-3.5 h-3.5" /> Priority
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        const updatedTask = { ...selectedTask, priority: 'none' };
                        setSelectedTask(updatedTask);
                        updateTask(updatedTask.id, { priority: 'none' });
                      }}
                      className={`text-xs px-3 py-1.5 rounded-md border transition-all ${selectedTask.priority === 'none' ? 'border-blue-600 bg-blue-100 text-blue-600' : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400'}`}
                    >
                      None
                    </button>
                    {(Object.entries(PRIORITY_CONFIG) as [Exclude<typeof selectedTask.priority, 'none'>, typeof PRIORITY_CONFIG[keyof typeof PRIORITY_CONFIG]][]).map(([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() => {
                          const updatedTask = { ...selectedTask, priority: key as any };
                          setSelectedTask(updatedTask);
                          updateTask(updatedTask.id, { priority: key as any });
                        }}
                        className={`text-xs px-3 py-1.5 rounded-md border transition-all ${selectedTask.priority === key ? `${cfg.className} text-white border-transparent` : 'border-gray-300 text-gray-500 hover:text-gray-900 hover:border-gray-400'}`}
                      >
                        {cfg.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                {/* Due date */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <CalendarIcon className="w-3.5 h-3.5" /> Due Date
                  </h4>
                  <input
                    type="date"
                    value={selectedTask.dueDate || ''}
                    onChange={e => {
                      const updatedTask = { ...selectedTask, dueDate: e.target.value || undefined };
                      setSelectedTask(updatedTask);
                      updateTask(updatedTask.id, { dueDate: e.target.value || undefined });
                    }}
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    Due Time
                  </h4>
                  <input
                    type="time"
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-200">
                {/* Subject */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    Subject / Category
                  </h4>
                  <input
                    type="text"
                    value={selectedTask.subject || ''}
                    onChange={e => {
                      const updatedTask = { ...selectedTask, subject: e.target.value || undefined };
                      setSelectedTask(updatedTask);
                      updateTask(updatedTask.id, { subject: e.target.value || undefined });
                    }}
                    placeholder="e.g. Maths"
                    className="w-full bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Color & Icon */}
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    Color & Icon
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={selectedTask.color || '#000000'}
                      onChange={e => {
                        const updatedTask = { ...selectedTask, color: e.target.value };
                        setSelectedTask(updatedTask);
                        updateTask(updatedTask.id, { color: e.target.value });
                      }}
                      className="w-10 h-10 rounded-md bg-gray-50 border border-gray-300 p-1 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={selectedTask.icon || ''}
                      onChange={e => {
                        const updatedTask = { ...selectedTask, icon: e.target.value || undefined };
                        setSelectedTask(updatedTask);
                        updateTask(updatedTask.id, { icon: e.target.value || undefined });
                      }}
                      placeholder="Icon (e.g. 📚)"
                      className="flex-1 bg-gray-50 border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <AlignLeftIcon className="w-3.5 h-3.5" /> Description
                </h4>
                <textarea
                  value={selectedTask.description || ''}
                  onChange={e => {
                    const updatedTask = { ...selectedTask, description: e.target.value };
                    setSelectedTask(updatedTask);
                    updateTask(updatedTask.id, { description: e.target.value });
                  }}
                  placeholder="Add a description..."
                  className="w-full bg-gray-50 border border-gray-300 rounded-lg p-3 text-sm text-gray-900 placeholder-gray-500 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 min-h-[80px]"
                  rows={3}
                />
              </div>

              {/* Checklists */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckSquareIcon className="w-3.5 h-3.5" /> Checklists
                  </h4>
                </div>

                {selectedTask.checklists.map(cl => {
                  const done = cl.items.filter(i => i.completed).length;
                  const total = cl.items.length;
                  const pct = total > 0 ? (done / total) * 100 : 0;
                  return (
                    <div key={cl.id} className="mb-4 last:mb-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{cl.title}</span>
                          {total > 0 && <span className="text-xs text-gray-500">{done}/{total}</span>}
                        </div>
                      </div>
                      {total > 0 && (
                        <div className="w-full h-1.5 bg-gray-200 rounded-full mb-2 overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      <div className="space-y-1">
                        {cl.items.map(item => {
                          return (
                            <div key={item.id} className="flex items-center gap-2 group">
                              <input type="checkbox" checked={item.completed} onChange={() => {
                                const updatedTask = { ...selectedTask };
                                const checklist = updatedTask.checklists.find(c => c.id === cl.id);
                                if (checklist) {
                                  const checklistItem = checklist.items.find(i => i.id === item.id);
                                  if (checklistItem) {
                                    checklistItem.completed = !checklistItem.completed;
                                  }
                                }
                                setSelectedTask(updatedTask);
                                toggleChecklistItem(selectedTask.id, cl.id, item.id);
                              }} className="w-4 h-4 rounded border-gray-300 accent-blue-600" />
                              
                              <span 
                                className={`text-sm flex-1 ${item.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}
                              >
                                {item.text}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Delete */}
              <div className="pt-4 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
                      deleteTask(selectedTask.id);
                      handleTaskDetailClose();
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-all"
                >
                  <DeleteOutlined />
                  Delete Task
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade Prompt Modal */}
      {showRowUpgradePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowRowUpgradePrompt(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-sm p-8 animate-fade-in text-center"
            onClick={e => e.stopPropagation()}
          >
            <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
              <LockIcon className="w-7 h-7 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Premium Feature</h2>
            <p className="text-sm text-gray-600 mb-6">
              Adding tasks (rows) to your board is a <strong>Pro feature</strong>. Upgrade to unlock unlimited tasks across all your projects.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setShowRowUpgradePrompt(false); navigate('/pricing'); }}
                className="w-full py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
              >
                View Plans
              </button>
              <button
                onClick={() => setShowRowUpgradePrompt(false)}
                className="w-full py-2.5 text-gray-500 text-sm hover:text-gray-900 transition-colors"
              >
                Stay on Free
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper Icons for Ant Design compatibility
const XIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const TagIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
  </svg>
);

const AlignLeftIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
  </svg>
);

const SparklesIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
  </svg>
);

const LockIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const CalendarIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const CheckSquareIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const AlertTriangleIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const BrainIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9c0 1.105 3.134 2 7 2s7-.895 7-2M3 9c0-1.105 3.134-2 7-2s7 .895 7 2M3 9v6c0 1.105 3.134 2 7 2s7-.895 7-2V9M10 15c0-.552-.448-1-1-1s-1 .448-1 1 .448 1 1 1 1-.448 1-1z" />
  </svg>
);

export default ProjectBoard;