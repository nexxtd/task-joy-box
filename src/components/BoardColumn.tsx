import React, { useState } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { Task } from '@/types/board';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Lock, MoreHorizontal, Plus, Sparkles, Trash2 } from 'lucide-react';
import { COLUMN_COLORS } from '@/constants/columnColors';
import TaskCard from './TaskCard'; // Changed import to default import
import { useNavigate } from 'react-router-dom';

interface BoardColumnProps {
  column: {
    id: string;
    title: string;
    color: string;
    icon?: string;
    order: number;
  };
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

const BoardColumn: React.FC<BoardColumnProps> = ({ column, tasks, onTaskClick }) => {
  const { updateColumn, deleteColumn, addTask } = useBoardContext();
  const { user } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [editingColumnName, setEditingColumnName] = useState(false);
  const [columnName, setColumnName] = useState(column.title);
  const [columnIcon, setColumnIcon] = useState(column.icon || '');
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [priority, setPriority] = useState('none');
  const [dueDate, setDueDate] = useState('');
  const [subject, setSubject] = useState('');
  const [duration, setDuration] = useState(60);
  const [color, setColor] = useState('');
  const [icon, setIcon] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [description, setDescription] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [showRowUpgradePrompt, setShowRowUpgradePrompt] = useState(false);
  const navigate = useNavigate();

  const isFree = user?.subscriptionTier === 'free';

  const handleAdd = () => {
    if (!newTitle.trim()) return;
    addTask(column.id, newTitle.trim(), {
      description,
      priority: priority as any,
      dueDate: dueDate || undefined,
      subject: subject || undefined,
      color: color || undefined,
      icon: icon || undefined,
      duration: duration || undefined,
      subtasks: subtasks.map(s => ({ id: crypto.randomUUID(), text: s, completed: false })),
      attachments: newFiles.map(f => ({
        id: crypto.randomUUID(),
        taskId: crypto.randomUUID(),
        fileName: f.name,
        fileType: f.type,
        fileSize: f.size,
        fileUrl: URL.createObjectURL(f),
        createdAt: new Date().toISOString(),
      })),
    });
    setNewTitle('');
    setPriority('none');
    setDueDate('');
    setSubject('');
    setDuration(60);
    setColor('');
    setIcon('');
    setSubtasks([]);
    setNewSubtask('');
    setDescription('');
    setNewFiles([]);
    setIsAdding(false);
  };

  const handleAddSubtask = () => {
    if (!newSubtask.trim()) return;
    setSubtasks([...subtasks, newSubtask.trim()]);
    setNewSubtask('');
  };

  const removeSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  return (
    <div className="w-72 flex-shrink-0 bg-gray-100 rounded-lg p-3 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: column.color }}
          />
          {editingColumnName ? (
            <input
              type="text"
              value={columnName}
              onChange={(e) => setColumnName(e.target.value)}
              className="text-sm font-semibold bg-transparent border-b border-gray-400 focus:outline-none focus:border-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (columnName.trim() && columnName !== column.title) {
                    updateColumn(column.id, { title: columnName.trim() });
                  }
                  setEditingColumnName(false);
                } else if (e.key === 'Escape') {
                  setColumnName(column.title);
                  setEditingColumnName(false);
                }
              }}
              onBlur={() => {
                if (columnName.trim() && columnName !== column.title) {
                  updateColumn(column.id, { title: columnName.trim() });
                }
                setEditingColumnName(false);
              }}
            />
          ) : (
            <h3 
              className="text-sm font-semibold text-gray-800 cursor-pointer hover:bg-gray-200 px-1 rounded"
              onClick={() => setEditingColumnName(true)}
            >
              {column.title}
            </h3>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="relative">
            <button 
              onClick={() => setShowMenu(!showMenu)} 
              className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {showMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                <button 
                  onClick={() => { setShowMenu(false); setEditingColumnName(true); }} 
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Rename Column
                </button>
                <button 
                  onClick={() => { setShowMenu(false); setShowColorPicker(!showColorPicker); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <div 
                    className="w-4 h-4 rounded-full border border-gray-300" 
                    style={{ backgroundColor: column.color }}
                  />
                  Change Color
                </button>
                <button 
                  onClick={() => { setShowMenu(false); setShowIconPicker(!showIconPicker); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" /> Change Icon
                </button>
                <button 
                  onClick={() => { setShowMenu(false); deleteColumn(column.id); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-red-50 text-destructive flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" /> Delete Column
                </button>
              </div>
            )}
          </div>
          <span className="text-xs bg-gray-200 text-gray-700 rounded-full w-5 h-5 flex items-center justify-center">
            {tasks.length}
          </span>
        </div>
      </div>

      {showColorPicker && (
        <div className="mb-3 p-2 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="grid grid-cols-6 gap-1">
            {COLUMN_COLORS.map(c => (
              <button
                key={c}
                className="w-6 h-6 rounded-full border border-gray-300"
                style={{ backgroundColor: c }}
                onClick={() => { updateColumn(column.id, { color: c }); setShowColorPicker(false); }}
              />
            ))}
          </div>
        </div>
      )}

      {showIconPicker && (
        <div className="mb-3 p-2 bg-white border border-gray-200 rounded-lg shadow-sm">
          <input
            type="text"
            value={columnIcon}
            onChange={e => setColumnIcon(e.target.value)}
            placeholder="Enter emoji or icon"
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                updateColumn(column.id, { icon: columnIcon || undefined });
                setShowIconPicker(false);
              }
            }}
            onBlur={() => {
              updateColumn(column.id, { icon: columnIcon || undefined });
              setShowIconPicker(false);
            }}
          />
        </div>
      )}

      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`flex-grow space-y-3 min-h-[100px] ${snapshot.isDraggingOver ? 'bg-gray-200/50' : ''}`}
          >
            {tasks.map((task, index) => (
              <Draggable key={task.id} draggableId={task.id} index={index}>
                {(provided, taskSnapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <TaskCard task={task} onClick={() => onTaskClick(task)} isDragging={taskSnapshot.isDragging} />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>

      {isAdding ? (
        <div className="mt-3 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
          <div className="flex gap-2 mb-3">
            <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-all">
              <Plus className="w-4 h-4 text-primary" />
            </button>
            <textarea
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Task title..."
              className="flex-1 text-sm bg-transparent border-none focus:outline-none focus:ring-0 resize-none"
              rows={2}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAdd(); }
                if (e.key === 'Escape') setIsAdding(false);
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="text-xs text-muted-foreground">Priority</label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value)}
                className="w-full text-sm bg-muted border border-transparent rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full text-sm bg-muted border border-transparent rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="text-xs text-muted-foreground">Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Subject"
                className="w-full text-sm bg-muted border border-transparent rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Duration (min)</label>
              <input
                type="number"
                value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                min="0"
                className="w-full text-sm bg-muted border border-transparent rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-3">
            <div>
              <label className="text-xs text-muted-foreground">Color</label>
              <input
                value={color}
                onChange={e => setColor(e.target.value)}
                type="color"
                className="w-full h-8 border border-transparent rounded"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Icon</label>
              <input
                value={icon}
                onChange={e => setIcon(e.target.value)}
                placeholder="Emoji"
                className="w-full text-sm bg-muted border border-transparent rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="text-xs text-muted-foreground">Subtasks</label>
            <div className="space-y-1 mb-2">
              {subtasks.map((st, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{st}</span>
                  <button 
                    onClick={() => removeSubtask(i)} 
                    className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newSubtask}
                onChange={e => setNewSubtask(e.target.value)}
                placeholder="Add subtask..."
                className="flex-1 text-sm bg-muted border border-transparent rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
              />
              <button 
                onClick={handleAddSubtask}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="mb-3">
            <label className="text-xs text-muted-foreground">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Description..."
              className="w-full text-sm bg-muted border border-transparent rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
              rows={2}
            />
          </div>

          {newFiles.length > 0 && (
            <div className="mb-3 space-y-1">
              {newFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs p-2 bg-muted rounded">
                  <span className="truncate">{f.name}</span>
                  <button 
                    onClick={() => setNewFiles(newFiles.filter((_, idx) => idx !== i))}
                    className="hover:text-destructive"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!isFree ? (
            <div className="mb-3">
              <label className="block w-full p-2 border-2 border-dashed border-gray-300 rounded cursor-pointer hover:bg-muted">
                <div className="flex items-center justify-center gap-1.5 text-muted-foreground text-sm">
                  <Plus className="w-3 h-3" />
                  Add file
                </div>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => setNewFiles([...newFiles, ...Array.from(e.target.files || [])])}
                />
              </label>
            </div>
          ) : (
            <div className="mb-3">
              <button
                onClick={() => setShowRowUpgradePrompt(true)}
                className="w-full flex items-center justify-center gap-1.5 text-xs p-2 border border-dashed border-gray-300 rounded text-muted-foreground hover:bg-muted"
              >
                <Sparkles className="w-3 h-3 fill-current" />
                Post Files (Premium)
              </button>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!newTitle.trim()}
              className="flex-1 text-xs bg-primary text-primary-foreground rounded py-1.5 disabled:opacity-50"
            >
              Add Task
            </button>
            <button
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : isFree ? (
        <button
          onClick={() => setShowRowUpgradePrompt(true)}
          className="mt-3 w-full flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground hover:bg-muted rounded-lg border border-dashed border-gray-300"
        >
          <Lock className="w-4 h-4" />
          <span>Add Task</span>
        </button>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="mt-3 w-full flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground hover:bg-muted rounded-lg border border-dashed border-gray-300"
        >
          <Plus className="w-4 h-4" />
          <span>Add Task</span>
        </button>
      )}

      {showRowUpgradePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowRowUpgradePrompt(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative bg-white rounded-xl p-6 max-w-md w-full shadow-xl">
            <div className="text-center">
              <Lock className="w-7 h-7 text-amber-500 mx-auto mb-3" />
              <h3 className="font-semibold text-foreground mb-1">Upgrade Required</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Free plan users can't add tasks. Upgrade to add tasks and unlock all features.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowRowUpgradePrompt(false); navigate('/pricing'); }}
                  className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium"
                >
                  Upgrade Now
                </button>
                <button
                  onClick={() => setShowRowUpgradePrompt(false)}
                  className="px-4 py-2 border border-input rounded-lg text-sm font-medium"
                >
                  Maybe Later
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BoardColumn;