import React, { useState } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { Task, PRIORITY_CONFIG, LABEL_COLORS } from '@/types/board';
import { Calendar, CheckSquare, ChevronDown, ChevronUp, Brain, Clock } from 'lucide-react';
import { CircleToggle } from '@/components/ToggleComponents';
import { useDeepFocus } from '@/hooks/useDeepFocus';
import { useAuth } from '@/context/AuthContext';
import { TaskDropdownExpanded } from '@/pages/Tasks';

interface ListViewProps {
  onTaskClick: (task: Task) => void;
  projectId?: number | null;
}

const formatDuration = (minutes: number) => {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const formatDate = (value?: string) => {
  if (!value) return 'No due date';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getDueTimeWarning = (task: Task): 'overdue' | 'imminent' | 'soon' | 'normal' => {
  if (!task.dueDate) return 'normal';
  const now = new Date();
  const dueDate = new Date(task.dueDate);
  if (task.completed) return 'normal';
  const diffMs = dueDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffMs < 0) return 'overdue';
  if (diffDays <= 0.5) return 'imminent';
  if (diffDays <= 2) return 'soon';
  return 'normal';
};

const ListView: React.FC<ListViewProps> = ({ onTaskClick, projectId }) => {
  const { board, updateTask, toggleChecklistItem, addChecklistItem, deleteChecklistItem } = useBoardContext();
  const { user } = useAuth();
  const { open: openDeepFocus } = useDeepFocus();
  const isPremium = user?.subscriptionTier === 'pro' || user?.subscriptionTier === 'premium';
  const isPro = user?.subscriptionTier === 'pro';

  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);
  const toggleExpand = (taskId: string) => {
    setExpandedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const sortedColumns = [...board.columns]
    .filter(c => projectId === undefined ? true : c.projectId === projectId)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="flex-1 overflow-y-auto p-6" style={{ scrollbarGutter: 'stable' }}>
      <div className="max-w-4xl mx-auto space-y-6">
        {sortedColumns.map(column => {
          const tasks = board.tasks
            .filter(t => t.columnId === column.id && (projectId === undefined ? true : t.projectId === projectId))
            .sort((a, b) => a.order - b.order);

          return (
            <div key={column.id}>
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: column.color }} />
                <h3 className="text-sm font-semibold text-foreground truncate">{column.title}</h3>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{tasks.length}</span>
              </div>

              {tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground px-4 py-3">No tasks</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {tasks.map(task => {
                    const isExpanded = expandedTaskIds.includes(task.id);
                    const checklistTotal = task.checklists.reduce((s, l) => s + l.items.length, 0);
                    const checklistDone = task.checklists.reduce((s, l) => s + l.items.filter(i => i.completed).length, 0);
                    const subtaskCount = task.subtasks?.length || 0;
                    const subtaskDone = (task.subtasks || []).filter(s => s.completed).length;
                    const taskDurFmt = formatDuration(task.duration || 0);
                    const taskTags = task.labels.slice(0, 3);

                    return (
                      <div key={task.id} className={`group rounded-xl border bg-card transition-[opacity,box-shadow,border-color] duration-200 cursor-pointer hover:border-border/80 hover:shadow-sm ${task.completed ? 'opacity-60' : ''}`}>
                        <div className="flex items-center gap-1 px-3 py-3" onClick={() => onTaskClick(task)}>
                          <CircleToggle
                            completed={task.completed || false}
                            onClick={(e) => { e.stopPropagation(); updateTask(task.id, { completed: !task.completed, completedAt: !task.completed ? new Date().toISOString() : undefined }); }}
                            size="sm"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-sm font-medium text-foreground truncate ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                                {task.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {(task.priority !== 'none') && (
                                <span className={`${PRIORITY_CONFIG[task.priority].className} text-[10px] font-bold px-1.5 py-0.5 rounded`}>
                                  {PRIORITY_CONFIG[task.priority].label}
                                </span>
                              )}
                              {taskDurFmt && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {taskDurFmt}
                                </span>
                              )}
                              {task.dueDate && (() => {
                                const warning = getDueTimeWarning(task);
                                return (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1 ${
                                    warning === 'overdue'
                                      ? 'bg-destructive/10 text-destructive'
                                      : warning === 'imminent' || warning === 'soon'
                                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                        : 'bg-muted text-muted-foreground'
                                  }`}>
                                    <Calendar className="w-2.5 h-2.5" />
                                    {formatDate(task.dueDate)}{task.dueTime ? ` ${task.dueTime}` : ''}
                                  </span>
                                );
                              })()}
                              {checklistTotal > 0 && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                                  {checklistDone}/{checklistTotal} checklist
                                </span>
                              )}
                              {subtaskCount > 0 && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                                  {subtaskDone}/{subtaskCount} sub task
                                </span>
                              )}
                              {taskTags.map(label => (
                                <span key={label.id} className={`${LABEL_COLORS[label.color]} text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-primary-foreground`}>
                                  {label.name}
                                </span>
                              ))}
                              {task.labels.length > taskTags.length && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                                  +{task.labels.length - taskTags.length}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); openDeepFocus(task); }}
                              className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary"
                              title="Open Deep Focus"
                            >
                              <Brain className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="border-t border-border px-4 py-3 space-y-4 bg-muted/10 rounded-b-xl">
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
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ListView;
