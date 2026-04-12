import React from 'react';
import { Task, LABEL_COLORS, PRIORITY_CONFIG } from '@/types/board';
import { Calendar, CheckSquare, AlertTriangle } from 'lucide-react';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isDragging?: boolean;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onClick, isDragging }) => {
  const totalItems = task.checklists.reduce((s, c) => s + c.items.length, 0);
  const doneItems = task.checklists.reduce((s, c) => s + c.items.filter(i => i.completed).length, 0);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

  return (
    <div
      onClick={onClick}
      className={`group rounded-lg bg-task p-3 cursor-pointer border border-transparent hover:border-border transition-all duration-150 hover:bg-task-hover ${isDragging ? 'task-dragging' : ''}`}
    >
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.labels.map(label => (
            <span key={label.id} className={`${LABEL_COLORS[label.color]} text-[10px] font-semibold px-2 py-0.5 rounded-full text-primary-foreground`}>
              {label.name}
            </span>
          ))}
        </div>
      )}

      <p className="text-sm font-medium text-foreground leading-snug mb-2">{task.title}</p>

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
          </span>
        )}
        {totalItems > 0 && (
          <span className={`flex items-center gap-1 text-[11px] ${doneItems === totalItems ? 'text-label-green' : 'text-muted-foreground'}`}>
            <CheckSquare className="w-3 h-3" />
            {doneItems}/{totalItems}
          </span>
        )}
      </div>
    </div>
  );
};

export default TaskCard;
