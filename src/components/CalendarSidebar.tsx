import React, { useState } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { Task, PRIORITY_CONFIG } from '@/types/board';
import { cn } from '@/lib/utils';
import { ChevronDown, GripVertical, Clock, AlertCircle } from 'lucide-react';

interface CalendarSidebarProps {
  onTaskClick: (task: Task) => void;
}

const CalendarSidebar: React.FC<CalendarSidebarProps> = ({ onTaskClick }) => {
  const { board } = useBoardContext();
  const [tasksOpen, setTasksOpen] = useState(true);

  const unscheduledTasks = board.tasks.filter(t => !t.dueDate && !t.completed);

  const handleDragStart = (e: React.DragEvent, type: string, item: any) => {
    e.dataTransfer.setData('application/x-calendar-item', JSON.stringify({ type, ...item }));
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget instanceof HTMLElement) {
      const rect = e.currentTarget.getBoundingClientRect();
      e.dataTransfer.setDragImage(e.currentTarget, rect.width / 2, 20);
    }
  };

  return (
    <div className="w-80 max-w-[85vw] shrink-0 flex flex-col h-full overflow-y-auto bg-gradient-to-b from-card/50 to-background border-r border-border/60">
      <div className="p-4 border-b border-border/60 bg-gradient-to-r from-primary/[0.02] to-transparent">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-primary/40" />
          <h2 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Productivity</h2>
          <div className="h-px flex-1 bg-gradient-to-r from-border/60 to-transparent" />
        </div>
      </div>

      <div className="flex-1 space-y-2 p-3">
        {/* Unscheduled Tasks */}
        <CollapsibleSection
          title={`Unscheduled Tasks`}
          count={unscheduledTasks.length}
          icon={<AlertCircle className="w-3.5 h-3.5 text-primary" />}
          open={tasksOpen}
          onToggle={() => setTasksOpen(!tasksOpen)}
        >
          {unscheduledTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-10 h-10 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-2">
                <AlertCircle className="w-4 h-4 text-primary/40" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">All tasks are scheduled</p>
              <p className="text-[10px] text-muted-foreground/50 mt-0.5">Great job!</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {unscheduledTasks.map(task => (
                <div
                  key={task.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, 'task', {
                    id: task.id,
                    title: task.title,
                    duration: task.duration || 30,
                    color: task.color || '#4f46e5',
                    priority: task.priority,
                    subtasks: task.subtasks,
                  })}
                  onClick={() => onTaskClick(task)}
                  className="group p-3 bg-gradient-to-br from-card to-muted/20 border border-border/60 rounded-xl hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 cursor-grab active:cursor-grabbing flex items-start gap-2.5"
                >
                  <div className="p-1 rounded-md bg-muted/50 group-hover:bg-primary/5 transition-colors">
                    <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary/50 transition-colors" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">{task.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      {task.priority !== 'none' && (
                        <span className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-md tracking-wide",
                          PRIORITY_CONFIG[task.priority]?.className || "bg-muted text-muted-foreground",
                          "text-primary-foreground"
                        )}>
                          {PRIORITY_CONFIG[task.priority]?.label || task.priority}
                        </span>
                      )}
                      {task.duration && (
                        <span className="text-[10px] text-muted-foreground/70 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {task.duration}min
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
};

function CollapsibleSection({
  title, count, icon, open, onToggle, children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all duration-200",
      open ? "border-border/70 shadow-sm" : "border-border/40"
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-muted/40 to-muted/10 hover:from-muted/60 hover:to-muted/20 transition-all duration-200"
      >
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex items-center justify-center transition-transform duration-200",
            open && "scale-110"
          )}>
            {icon}
          </div>
          <span className="text-xs font-bold text-foreground">{title}</span>
          <span className="text-[10px] font-bold text-muted-foreground bg-background/60 px-1.5 py-0.5 rounded-full border border-border/40">
            {count}
          </span>
        </div>
        <div className={cn(
          "transition-transform duration-200",
          open ? "rotate-0" : "-rotate-90"
        )}>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
      </button>
      {open && (
        <div className="p-2.5 pt-1.5 animate-in slide-in-from-top-1 fade-in duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

export default CalendarSidebar;
