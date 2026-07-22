import React, { useState } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { Task, PRIORITY_CONFIG, LABEL_COLORS } from '@/types/board';
import { Calendar, CheckSquare, ChevronDown, ChevronUp, ChevronRight, Brain, Plus } from 'lucide-react';
import { CircleToggle } from '@/components/ToggleComponents';
import { useDeepFocus } from '@/hooks/useDeepFocus';
import { useAuth } from '@/context/AuthContext';
import { TaskDropdownExpanded } from '@/pages/Tasks';

interface ListViewProps {
  onTaskClick: (task: Task) => void;
  projectId?: number | null;
}

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
                <div className="bg-card border border-border rounded-xl divide-y divide-border">
                  {tasks.map(task => {
                    const isExpanded = expandedTaskIds.includes(task.id);
                    const totalItems = task.checklists.reduce((s, c) => s + c.items.length, 0);
                    const doneItems = task.checklists.reduce((s, c) => s + c.items.filter(i => i.completed).length, 0);
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.completed;

                    return (
                      <div key={task.id} className="border-b border-border last:border-b-0">
                        <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                          <div className="w-1 h-8 rounded-full flex-shrink-0" style={{
                            backgroundColor: task.priority !== 'none'
                              ? `hsl(var(--priority-${task.priority === 'urgent' ? 'urgent' : task.priority === 'high' ? 'high' : task.priority === 'medium' ? 'medium' : 'low'}))`
                              : 'transparent'
                          }} />

                          <CircleToggle
                            completed={task.completed || false}
                            onClick={(e) => { e.stopPropagation(); updateTask(task.id, { completed: !task.completed, completedAt: !task.completed ? new Date().toISOString() : undefined }); }}
                            size="sm"
                          />

                          <div className="flex-1 min-w-0">
                            <span className={`text-sm font-medium text-foreground truncate block ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                              {task.title}
                            </span>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {task.priority !== 'none' && (
                                <span className={`${PRIORITY_CONFIG[task.priority].className} text-[10px] font-bold px-1.5 py-0.5 rounded`}>
                                  {PRIORITY_CONFIG[task.priority].label}
                                </span>
                              )}
                              {task.dueDate && (
                                <span className={`flex items-center gap-1 text-[11px] ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                                  <Calendar className="w-3 h-3" />
                                  {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                              {totalItems > 0 && (
                                <span className={`flex items-center gap-1 text-[11px] ${doneItems === totalItems ? 'text-label-green' : 'text-muted-foreground'}`}>
                                  <CheckSquare className="w-3 h-3" />
                                  {doneItems}/{totalItems}
                                </span>
                              )}
                              {task.labels.map(label => (
                                <span key={label.id} className={`${LABEL_COLORS[label.color]} text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-primary-foreground`}>
                                  {label.name}
                                </span>
                              ))}
                            </div>
                          </div>

                          <button
                            onClick={(e) => { e.stopPropagation(); onTaskClick(task); }}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                            title="Open details"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => { e.stopPropagation(); openDeepFocus(task); }}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-all"
                            title="Deep Focus"
                          >
                            <Brain className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(task.id); }}
                            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
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