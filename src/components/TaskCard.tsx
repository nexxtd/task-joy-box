import React from 'react';
import { Task, LABEL_COLORS, PRIORITY_CONFIG } from '@/types/board';
import { Calendar, CheckSquare, AlertTriangle, CheckCircle2, User } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isDragging?: boolean;
  onToggleComplete?: (e: React.MouseEvent) => void;
  canEdit?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, isDragging, onToggleComplete, canEdit = true }) => {
  const totalItems = task.checklists.reduce((s, c) => s + c.items.length, 0);
  const doneItems = task.checklists.reduce((s, c) => s + c.items.filter(i => i.completed).length, 0);
  const subtaskTotal = (task.subtasks || []).length;
  const subtaskDone = (task.subtasks || []).filter(s => s.completed).length;
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.completed;

  return (
    <div
      onClick={onClick}
      className={`group rounded-lg bg-task p-3 cursor-pointer border border-transparent hover:border-border transition-all duration-150 hover:bg-task-hover ${isDragging ? 'task-dragging' : ''} ${task.completed ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2 mb-2">
        {/* Completion checkbox */}
        {onToggleComplete && (
          <button
            onClick={onToggleComplete}
            className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
              task.completed 
                ? 'bg-green-500 border-green-500 text-white' 
                : 'border-muted-foreground/30 hover:border-primary'
            }`}
            disabled={!canEdit}
          >
            {task.completed && <CheckCircle2 className="w-3.5 h-3.5" />}
          </button>
        )}
        {task.color && (
          <div className="w-2.5 h-2.5 rounded-full shadow-sm flex-shrink-0" style={{ backgroundColor: task.color }} />
        )}
        <p className={`text-sm font-bold text-foreground leading-snug truncate flex-1 ${task.completed ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
        {task.icon && <span className="text-xs opacity-70">{task.icon}</span>}
      </div>

      {(task.subject || task.labels.length > 0) && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.subject && (
            <span className="bg-primary/10 text-primary text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
              {task.subject}
            </span>
          )}
          {task.labels.map(label => (
            <span key={label.id} className={`${LABEL_COLORS[label.color]} text-[10px] font-semibold px-2 py-0.5 rounded-full text-primary-foreground`}>
              {label.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {task.priority !== 'none' && (
          <span className={`${PRIORITY_CONFIG[task.priority].className} text-[10px] font-bold px-1.5 py-0.5 rounded text-primary-foreground flex items-center gap-1`}>
            {task.priority === 'urgent' && <AlertTriangle className="w-3 h-3" />}
            {PRIORITY_CONFIG[task.priority].label}
          </span>
        )}
        {task.dueDate && (
          <span className={`flex items-center gap-1 text-[11px] ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
            <Calendar className="w-3 h-3" />
            {new Date(task.dueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
            {task.dueTime && <span className="ml-0.5">{task.dueTime}</span>}
          </span>
        )}
        {totalItems > 0 && (
          <span className={`flex items-center gap-1 text-[11px] ${doneItems === totalItems ? 'text-label-green' : 'text-muted-foreground'}`}>
            <CheckSquare className="w-3 h-3" />
            {doneItems}/{totalItems} checklist
          </span>
        )}
        {subtaskTotal > 0 && (
          <span className={`flex items-center gap-1 text-[11px] ${subtaskDone === subtaskTotal ? 'text-label-green' : 'text-muted-foreground'}`}>
            {subtaskDone}/{subtaskTotal} sub task
          </span>
        )}
        {task.assignedToUserId && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground ml-auto" title={task.assignedToUserName || 'Assigned'}>
            <User className="w-3 h-3" />
          </span>
        )}
      </div>
    </div>
  );
};

export default TaskCard;