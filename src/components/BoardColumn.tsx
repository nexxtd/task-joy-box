import React, { useState } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Column as ColumnType, Task, LABEL_COLORS } from '@/types/board';
import { useBoardContext } from '@/context/BoardContext';
import TaskCard from './TaskCard';
import { Plus, MoreHorizontal, Trash2, Sparkles, Lock, X, CheckCircle2, ChevronDown, ChevronRight, ChevronUp, Calendar, CheckSquare, Brain } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CircleToggle } from '@/components/ToggleComponents';

const PRIORITY_COLORS: Record<string, { bg: string; label: string }> = {
  urgent: { bg: '#dc2626', label: 'Urgent' },
  high: { bg: '#ea580c', label: 'High' },
  medium: { bg: '#ca8a04', label: 'Medium' },
  low: { bg: '#2563eb', label: 'Low' },
  none: { bg: '#9ca3af', label: 'None' },
};
import { useDeepFocus } from '@/hooks/useDeepFocus';
import { TaskDropdownExpanded } from '@/pages/Tasks';

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
  const { addTask, deleteColumn, updateColumn, updateTask, moveTask, toggleChecklistItem, addChecklistItem, deleteChecklistItem } = useBoardContext();
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
  const isPremium = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  const isPro = user?.subscriptionTier === 'pro';
  const isFree = !user?.subscriptionTier || user.subscriptionTier === 'free';
  const [showMenu, setShowMenu] = useState(false);
  const [editingColumnName, setEditingColumnName] = useState(false);
  const [columnName, setColumnName] = useState(column.title);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [columnIcon, setColumnIcon] = useState(column.icon || '');

  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const { open: openDeepFocus } = useDeepFocus();

  const toggleExpand = (taskId: string) => {
    setExpandedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const COLUMN_COLORS = [
    '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', 
    '#8b5cf6', '#ec4899', '#6b7280', '#14b8a6', '#f43f5e'
  ];

  // Separate completed and uncompleted tasks
  const uncompletedTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  const handleAddSubtask = () => {
    if (newSubtask.trim()) {
      setSubtasks([...subtasks, newSubtask.trim()]);
      setNewSubtask('');
    }
  };

  const removeSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  const handleAdd = async () => {
    if (newTitle.trim()) {
      const taskId = crypto.randomUUID();
      addTask(column.id, newTitle.trim(), {
        id: taskId,
        description: description.trim(),
        priority,
        dueDate: dueDate || undefined,
        subject: subject.trim() || undefined,
        color: color || undefined,
        icon: icon || undefined,
        duration: duration || undefined,
        subtasks: subtasks.length > 0 ? subtasks.map(s => ({ id: crypto.randomUUID(), text: s, completed: false })) : [],
        dueTime: dueTime || undefined,
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
    }
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
        <div ref={provided.innerRef} {...provided.draggableProps} className="flex-shrink-0 w-[28rem]">
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
                <h3 className="text-sm font-bold text-foreground tracking-tight truncate">{column.title}</h3>
              )}
              <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full font-bold">{tasks.length}</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setTasksCollapsed(!tasksCollapsed)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all" title={tasksCollapsed ? 'Show tasks' : 'Hide tasks'}>
                {tasksCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
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
                {showColorPicker && (
                  <div className="absolute right-0 top-9 bg-popover border border-border rounded-xl shadow-2xl z-50 p-3 min-w-[180px] animate-in fade-in zoom-in-95 duration-200">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Column Color</p>
                    <div className="flex flex-wrap gap-2">
                      {COLUMN_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => { updateColumn(column.id, { color: c }); setShowColorPicker(false); }}
                          className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110 ${column.color === c ? 'border-foreground ring-2 ring-primary/30' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {showIconPicker && (
                  <div className="absolute right-0 top-9 bg-popover border border-border rounded-xl shadow-2xl z-50 p-3 min-w-[200px] animate-in fade-in zoom-in-95 duration-200">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2">Column Icon</p>
                    <div className="flex gap-2">
                      <input
                        autoFocus
                        value={columnIcon}
                        onChange={e => setColumnIcon(e.target.value)}
                        placeholder="e.g. 📋 or 🚀"
                        className="flex-1 bg-muted border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        onClick={() => { updateColumn(column.id, { icon: columnIcon || undefined }); setShowIconPicker(false); }}
                        className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold"
                      >Save</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>

          <Droppable droppableId={column.id} type="task">
            {(dropProvided, snapshot) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className={`${tasksCollapsed ? 'min-h-0 p-0' : 'min-h-[100px] p-2'} space-y-3 rounded-xl transition-all duration-300 ${snapshot.isDraggingOver ? 'bg-primary/5 ring-2 ring-primary/20 ring-inset' : ''}`}
              >
                {/* Uncompleted tasks */}
                {!tasksCollapsed && uncompletedTasks.map((task, taskIndex) => (
                  <Draggable key={task.id} draggableId={task.id} index={taskIndex} isDragDisabled={!canEdit}>
                    {(taskProvided, taskSnapshot) => {
                      const isExpanded = expandedTaskIds.includes(task.id);
                      const totalItems = task.checklists.reduce((s, c) => s + c.items.length, 0);
                      const doneItems = task.checklists.reduce((s, c) => s + c.items.filter(i => i.completed).length, 0);
                      const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.completed;
                      return (
                        <div ref={taskProvided.innerRef} {...taskProvided.draggableProps}>
                          <div className={`rounded-lg border bg-card transition-[opacity,box-shadow,border-color] duration-200 ${taskSnapshot.isDragging ? 'border-primary/40 shadow-lg' : 'border-border hover:border-border/80 hover:shadow-sm'} ${task.completed ? 'opacity-60' : ''}`}>
                            <div {...taskProvided.dragHandleProps} className="flex items-center gap-2 px-3 py-2.5 min-w-0">
                              <CircleToggle
                                completed={task.completed || false}
                                onClick={(e) => { e.stopPropagation(); handleToggleComplete(e, task); }}
                                size="sm"
                              />
                              {task.color && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: task.color }} />}
                              <div className="flex-1 min-w-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}>
                                <span className={`text-sm font-medium text-foreground truncate block ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                                  {task.title}
                                </span>
                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                  {task.priority !== 'none' && (() => {
                                    const pc = PRIORITY_COLORS[task.priority];
                                    return (
                                      <span style={{ backgroundColor: pc?.bg }} className="text-[9px] px-1.5 py-0.5 rounded-full font-medium text-white inline-flex items-center">
                                        {pc?.label}
                                      </span>
                                    );
                                  })()}
                                  {task.dueDate && (
                                    <span className={`flex items-center gap-1 text-[10px] ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                                      <Calendar className="w-2.5 h-2.5" />
                                      {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                  )}
                                  {totalItems > 0 && (
                                    <span className={`flex items-center gap-1 text-[10px] ${doneItems === totalItems ? 'text-label-green' : 'text-muted-foreground'}`}>
                                      <CheckSquare className="w-2.5 h-2.5" />
                                      {doneItems}/{totalItems}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); openDeepFocus(task); }}
                                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-all shrink-0"
                                title="Deep Focus"
                              >
                                <Brain className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                                className="p-1 rounded-md hover:bg-muted text-muted-foreground shrink-0"
                              >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            {isExpanded && (
                              <div className="border-t border-border px-3 py-2 space-y-3 bg-muted/10 rounded-b-lg">
                                <TaskDropdownExpanded
                                  task={task}
                                  onUpdateTask={updateTask}
                                  onToggleChecklistItem={toggleChecklistItem}
                                  onAddChecklistItem={addChecklistItem}
                                  onDeleteChecklistItem={deleteChecklistItem}
                                  isPremium={isPremium}
                                  isPro={isPro}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }}
                  </Draggable>
                ))}
                
                {/* Completed tasks section */}
                {!tasksCollapsed && completedTasks.length > 0 && (
                  <div className="pt-2 border-t border-border/50">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase mb-2 px-1">Completed ({completedTasks.length})</p>
                    {completedTasks.map((task, taskIndex) => (
                      <Draggable key={task.id} draggableId={task.id} index={uncompletedTasks.length + taskIndex} isDragDisabled={!canEdit}>
                        {(taskProvided, taskSnapshot) => {
                          const isExpanded = expandedTaskIds.includes(task.id);
                          const totalItems = task.checklists.reduce((s, c) => s + c.items.length, 0);
                          const doneItems = task.checklists.reduce((s, c) => s + c.items.filter(i => i.completed).length, 0);
                          const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.completed;
                          return (
                            <div ref={taskProvided.innerRef} {...taskProvided.draggableProps}>
                              <div className={`rounded-lg border bg-card transition-[opacity,box-shadow,border-color] duration-200 ${taskSnapshot.isDragging ? 'border-primary/40 shadow-lg' : 'border-border hover:border-border/80 hover:shadow-sm'} ${task.completed ? 'opacity-60' : ''}`}>
                            <div {...taskProvided.dragHandleProps} className="flex items-center gap-2 px-3 py-2.5 min-w-0">
                              <CircleToggle
                                completed={task.completed || false}
                                onClick={(e) => { e.stopPropagation(); handleToggleComplete(e, task); }}
                                size="sm"
                              />
                              {task.color && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: task.color }} />}
                              <div className="flex-1 min-w-0 cursor-pointer" onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}>
                                    <span className={`text-sm font-medium text-foreground truncate block ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                                      {task.title}
                                    </span>
                                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                      {task.priority !== 'none' && (() => {
                                        const pc = PRIORITY_COLORS[task.priority];
                                        return (
                                          <span style={{ backgroundColor: pc?.bg }} className="text-[9px] px-1.5 py-0.5 rounded-full font-medium text-white inline-flex items-center">
                                            {pc?.label}
                                          </span>
                                        );
                                      })()}
                                      {task.dueDate && (
                                        <span className={`flex items-center gap-1 text-[10px] ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                                          <Calendar className="w-2.5 h-2.5" />
                                          {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                        </span>
                                      )}
                                      {totalItems > 0 && (
                                        <span className={`flex items-center gap-1 text-[10px] ${doneItems === totalItems ? 'text-label-green' : 'text-muted-foreground'}`}>
                                          <CheckSquare className="w-2.5 h-2.5" />
                                          {doneItems}/{totalItems}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openDeepFocus(task); }}
                                    className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-all shrink-0"
                                    title="Deep Focus"
                                  >
                                    <Brain className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                                    className="p-1 rounded-md hover:bg-muted text-muted-foreground shrink-0"
                                  >
                                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                                {isExpanded && (
                                  <div className="border-t border-border px-3 py-2 space-y-3 bg-muted/10 rounded-b-lg">
                                    <TaskDropdownExpanded
                                      task={task}
                                      onUpdateTask={updateTask}
                                      onToggleChecklistItem={toggleChecklistItem}
                                      onAddChecklistItem={addChecklistItem}
                                      onDeleteChecklistItem={deleteChecklistItem}
                                      isPremium={isPremium}
                                      isPro={isPro}
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        }}
                      </Draggable>
                    ))}
                  </div>
                )}
                
                {!tasksCollapsed && dropProvided.placeholder}
              </div>
            )}
          </Droppable>

          {isAdding ? (
            <div className={`${tasksCollapsed ? 'mt-0' : 'mt-3'} p-4 bg-card border-2 border-primary/20 rounded-2xl shadow-xl animate-in slide-in-from-top-2 duration-300 overflow-hidden`}>

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
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); }
                  if (e.key === 'Escape') setIsAdding(false);
                }}
                placeholder="What needs to be done?"
                className="w-full bg-muted/30 border border-border rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all mb-3 font-medium"
                rows={2}
              />
              
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Priority</label>
                  <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                    <SelectTrigger className="w-full bg-muted/30 border border-border text-xs">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Due Time</label>
                  <input
                    type="time"
                    value={dueTime}
                    onChange={e => setDueTime(e.target.value)}
                    className="w-full bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Subject</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={e => setSubject(e.target.value)}
                    placeholder="e.g. Maths"
                    className="w-full bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Duration (min)</label>
                  <input
                    type="number"
                    min={5}
                    max={480}
                    step={5}
                    value={duration}
                    onChange={e => setDuration(Number(e.target.value))}
                    className="w-full bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Color & Icon</label>
                  <div className="flex gap-1">
                    <input
                      type="color"
                      value={color}
                      onChange={e => setColor(e.target.value)}
                      className="w-8 h-8 rounded bg-muted/30 border border-border p-0.5 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={icon}
                      onChange={e => setIcon(e.target.value)}
                      placeholder="Icon name"
                      className="flex-1 bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Subtasks Section */}
              <div className="mb-4 space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Subtasks</label>
                <div className="space-y-1 mb-2">
                  {subtasks.map((st, i) => (
                    <div key={i} className="flex items-center gap-2 bg-muted/20 px-2 py-1 rounded-lg border border-border/50 group">
                      <span className="flex-1 text-[11px] text-foreground/80">{st}</span>
                      <button onClick={() => removeSubtask(i)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    value={newSubtask}
                    onChange={e => setNewSubtask(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
                    placeholder="Add subtask..."
                    className="flex-1 bg-muted/30 border border-border rounded-lg p-2 text-xs text-foreground focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                  <button 
                    onClick={handleAddSubtask}
                    className="p-2 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Add more details..."
                className="w-full bg-muted/30 border border-border rounded-xl p-3 text-xs text-foreground placeholder:text-muted-foreground resize-none mb-4 focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                rows={2}
              />

              {/* Attachments Section */}
              <div className="mb-4 space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Attachments</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {newFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 bg-primary/5 px-2 py-1 rounded-lg border border-primary/20 text-[9px] font-medium text-primary uppercase">
                      {f.name}
                      <button onClick={() => setNewFiles(newFiles.filter((_, idx) => idx !== i))} className="hover:text-destructive">
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <label 
                  className={`flex items-center gap-2 w-max px-3 py-1.5 border rounded-lg text-[10px] font-bold transition-all ${
                    isPremium 
                      ? 'bg-muted/30 border-border text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer'
                      : 'bg-primary/5 border-primary/20 text-primary opacity-80 cursor-pointer'
                  }`}
                  onClick={() => !isPremium && (window.location.href = '/pricing')}
                >
                  {isPremium ? <Plus className="w-3 h-3" /> : <Sparkles className="w-3 h-3 fill-current" />}
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
                  onClick={handleAdd} 
                  className="flex-1 bg-primary text-primary-foreground text-sm font-bold px-4 py-2.5 rounded-xl hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 shadow-md shadow-primary/20"
                  disabled={!newTitle.trim()}
                >
                  Create Task
                </button>
                <button 
                  onClick={() => setIsAdding(false)} 
                  className="px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
          {canEdit && (
            <button
              onClick={() => {
                if (onAddClick) { onAddClick(); return; }
                if (!canCreateTasks) return;
                setIsAdding(true);
              }}
              disabled={!onAddClick && !canCreateTasks}
              className={`${tasksCollapsed ? 'mt-0' : 'mt-3'} w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-muted-foreground hover:text-primary hover:bg-primary/5 border-2 border-dashed border-border hover:border-primary/20 rounded-2xl transition-all duration-300 hover:scale-[1.02] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
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