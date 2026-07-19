import React from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { Task, PRIORITY_CONFIG, LABEL_COLORS } from '@/types/board';
import { Calendar, CheckSquare, AlertTriangle } from 'lucide-react';

interface ListViewProps {
  onTaskClick: (task: Task) => void;
  projectId?: number | null;
}

const ListView: React.FC<ListViewProps> = ({ onTaskClick, projectId }) => {
  const { board } = useBoardContext();
  const sortedColumns = [...board.columns]
    .filter(c => projectId === undefined ? true : c.projectId === projectId)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="flex-1 overflow-y-auto p-6">
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
                <div className="bg-card border border-border rounded-lg divide-y divide-border">
                  {tasks.map(task => {
                    const totalItems = task.checklists.reduce((s, c) => s + c.items.length, 0);
                    const doneItems = task.checklists.reduce((s, c) => s + c.items.filter(i => i.completed).length, 0);
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();

                    return (
                      <div
                        key={task.id}
                        onClick={() => onTaskClick(task)}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors"
                      >
                        {/* Priority indicator */}
                        <div className="w-1 h-8 rounded-full flex-shrink-0" style={{
                          backgroundColor: task.priority !== 'none'
                            ? `hsl(var(--priority-${task.priority === 'urgent' ? 'urgent' : task.priority === 'high' ? 'high' : task.priority === 'medium' ? 'medium' : 'low'}))`
                            : 'transparent'
                        }} />

                        {/* Title + labels */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                          {task.labels.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {task.labels.map(l => (
                                <span key={l.id} className={`${LABEL_COLORS[l.color]} text-[9px] font-semibold px-1.5 py-0.5 rounded-full text-primary-foreground`}>
                                  {l.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Meta */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {totalItems > 0 && (
                            <span className={`flex items-center gap-1 text-[11px] ${doneItems === totalItems ? 'text-label-green' : 'text-muted-foreground'}`}>
                              <CheckSquare className="w-3 h-3" />
                              {doneItems}/{totalItems} checklist
                            </span>
                          )}
                          {((task.subtasks || []).length > 0) && (() => {
                            const stTotal = (task.subtasks || []).length;
                            const stDone = (task.subtasks || []).filter(s => s.completed).length;
                            return (
                              <span className={`flex items-center gap-1 text-[11px] ${stDone === stTotal ? 'text-label-green' : 'text-muted-foreground'}`}>
                                {stDone}/{stTotal} sub task
                              </span>
                            );
                          })()}
                          {task.dueDate && (
                            <span className={`flex items-center gap-1 text-[11px] ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                              <Calendar className="w-3 h-3" />
                              {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                          {task.priority !== 'none' && (
                            <span className={`${PRIORITY_CONFIG[task.priority].className} text-[10px] font-bold px-1.5 py-0.5 rounded text-primary-foreground`}>
                              {PRIORITY_CONFIG[task.priority].label}
                            </span>
                          )}
                          {task.projectId && (() => {
                            const col = board.columns.find(c => c.id === task.columnId);
                            if (!col) return null;
                            return (
                              <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-border/60 text-muted-foreground">
                                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                                {col.title}
                              </span>
                            );
                          })()}
                        </div>
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
