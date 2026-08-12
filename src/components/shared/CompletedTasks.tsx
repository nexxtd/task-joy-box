import React from 'react';
import { Trash2 } from 'lucide-react';
import { Task } from '@/types/board';
import { CircleToggle } from '@/components/ToggleComponents';

export const daysUntilAutoDelete = (completedAt?: string) => {
  if (!completedAt) return 5;
  const started = new Date(completedAt);
  if (Number.isNaN(started.getTime())) return 5;
  const expires = new Date(started);
  expires.setDate(expires.getDate() + 5);
  return Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86400000));
};

interface CompletedTaskRowProps {
  task: Task;
  onToggleComplete?: (task: Task) => void;
  onOpenTask?: (task: Task) => void;
  onDeleteTask?: (task: Task) => void;
}

export const CompletedTaskRow: React.FC<CompletedTaskRowProps> = ({
  task,
  onToggleComplete,
  onOpenTask,
  onDeleteTask,
}) => {
  return (
    <div
      onClick={() => onOpenTask?.(task)}
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all group border-label-green/15 bg-background/70 hover:bg-muted/40"
    >
      <CircleToggle
        completed
        onClick={(e) => { e.stopPropagation(); onToggleComplete?.(task); }}
        size="md"
        title="Mark active"
      />
      <span className="text-sm text-left flex-1 text-muted-foreground/80 line-through">
        {task.title}
      </span>
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-label-green/15 text-label-green font-medium flex-shrink-0">
        Auto-delete in {daysUntilAutoDelete(task.completedAt)} day{daysUntilAutoDelete(task.completedAt) === 1 ? '' : 's'}
      </span>
      {onDeleteTask && (
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteTask(task); }}
          className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
          title="Delete task"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
