import React from 'react';
import { Archive, RotateCcw, Trash2 } from 'lucide-react';
import { Task } from '@/types/board';
import { useLanguage } from '@/context/LanguageContext';

interface ArchivedRowProps {
  task: Task;
  meta?: React.ReactNode;
  onRestore: (task: Task) => void;
  onOpenTask?: (task: Task) => void;
  onDeleteTask: (task: Task) => void;
  isDeleteMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (task: Task) => void;
}

export const ArchivedRow: React.FC<ArchivedRowProps> = ({
  task,
  meta,
  onRestore,
  onOpenTask,
  onDeleteTask,
  isDeleteMode = false,
  isSelected = false,
  onToggleSelect,
}) => {
  const { t } = useLanguage();
  return (
    <div
      onClick={() => (isDeleteMode ? onToggleSelect?.(task) : onOpenTask?.(task))}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all group ${
        isDeleteMode
          ? isSelected
            ? 'border-destructive bg-destructive/5 cursor-pointer hover:bg-destructive/10'
            : 'border-border bg-background/50 cursor-pointer hover:bg-muted/20'
          : 'border-border bg-muted/20 hover:bg-muted/40'
      }`}
    >
      {isDeleteMode ? (
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect?.(task)}
          onClick={(e) => e.stopPropagation()}
          className="w-4 h-4 rounded border-border accent-destructive flex-shrink-0 cursor-pointer"
        />
      ) : (
        <div className="w-6 h-6 rounded-md bg-muted/40 border border-border flex items-center justify-center flex-shrink-0">
          <Archive className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <span className={`text-sm text-left block truncate ${isDeleteMode ? 'text-foreground font-medium' : 'text-muted-foreground/80'}`}>
          {task.title}
        </span>
        {meta && <div className="flex items-center gap-1.5 flex-wrap mt-0.5">{meta}</div>}
      </div>
      {!isDeleteMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onRestore(task); }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all flex-shrink-0 opacity-0 group-hover:opacity-100"
          title={t('Restore')}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t('Restore')}
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onDeleteTask(task); }}
        className="p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
        title={t('Delete')}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export default ArchivedRow;