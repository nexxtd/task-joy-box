import React, { useState, useMemo } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { Task } from '@/types/board';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Brain } from 'lucide-react';

interface ListViewProps {
  onTaskClick: (task: Task) => void;
}

const ListView: React.FC<ListViewProps> = ({ onTaskClick }) => {
  const { board, updateTask, deleteTask } = useBoardContext();
  const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  const toggleTaskCompletion = (task: Task) => {
    updateTask(task.id, {
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : undefined,
      status: !task.completed ? 'completed' : 'to_do'
    });
  };

  // Group tasks by project and column
  const groupedTasks = useMemo(() => {
    const grouped: {[projectId: number]: {[columnId: string]: Task[]}} = {};
    
    board.tasks.forEach(task => {
      const projectId = task.projectId || 0; // 0 for tasks not assigned to any project
      const columnId = task.columnId;
      
      if (!grouped[projectId]) {
        grouped[projectId] = {};
      }
      if (!grouped[projectId][columnId]) {
        grouped[projectId][columnId] = [];
      }
      
      grouped[projectId][columnId].push(task);
    });
    
    // Sort tasks within each column
    Object.keys(grouped).forEach(projectId => {
      Object.keys(grouped[parseInt(projectId)]).forEach(columnId => {
        grouped[parseInt(projectId)][columnId].sort((a, b) => (a.order || 0) - (b.order || 0));
      });
    });
    
    return grouped;
  }, [board.tasks]);

  const handleDeepFocusClick = (task: Task) => {
    // Implementation for deep focus mode
    console.log('Starting deep focus for task:', task.title);
  };

  return (
    <div className="space-y-6">
      {/* My Tasks Section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer">
          <span className="font-semibold text-foreground">MY TASKS</span>
          <span className="text-xs text-muted-foreground">({(groupedTasks[0] ? Object.values(groupedTasks[0]).flat().length : 0)})</span>
        </div>
        
        {groupedTasks[0] && Object.entries(groupedTasks[0]).map(([columnId, tasks]) => {
          const column = board.columns.find(col => col.id === columnId);
          if (!column) return null;
          
          return (
            <div key={columnId} className="pl-4 space-y-2">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted cursor-pointer">
                <span className="font-medium text-muted-foreground">{column.title}</span>
                <span className="text-xs text-muted-foreground">({tasks.length})</span>
              </div>
              
              <div className="pl-4 space-y-2">
                {tasks.map(task => {
                  const isExpanded = expandedTaskIds.includes(task.id);
                  
                  return (
                    <Card key={task.id} className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-4" onClick={() => onTaskClick(task)}>
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={task.completed}
                            onCheckedChange={() => toggleTaskCompletion(task)}
                            className="mt-1"
                          />
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {task.color && (
                                <div 
                                  className="w-2.5 h-2.5 rounded-full shadow-sm flex-shrink-0" 
                                  style={{ backgroundColor: task.color }} 
                                />
                              )}
                              <h3 className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                {task.title}
                              </h3>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeepFocusClick(task);
                                }}
                                className="ml-auto p-1 hover:bg-blue-100 rounded text-gray-500 hover:text-blue-600"
                                title="Start Deep Focus"
                              >
                                <Brain className="w-4 h-4" />
                              </button>
                              {task.icon && <span className="text-xs opacity-70">{task.icon}</span>}
                            </div>
                            
                            {task.description && (
                              <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                            )}
                            
                            <div className="flex flex-wrap gap-2 mb-2">
                              {task.priority !== 'none' && (
                                <Badge variant={
                                  task.priority === 'urgent' ? 'destructive' : 
                                  task.priority === 'high' ? 'default' : 
                                  task.priority === 'medium' ? 'secondary' : 'outline'
                                } className="h-6 text-xs">
                                  {task.priority}
                                </Badge>
                              )}
                              {task.dueDate && (
                                <Badge variant="outline" className="h-6 text-xs">
                                  Due: {new Date(task.dueDate).toLocaleDateString()}
                                </Badge>
                              )}
                              {task.duration && (
                                <Badge variant="outline" className="h-6 text-xs">
                                  {task.duration}m
                                </Badge>
                              )}
                              {task.subject && (
                                <Badge variant="outline" className="h-6 text-xs">
                                  {task.subject}
                                </Badge>
                              )}
                            </div>
                            
                            {task.subtasks && task.subtasks.length > 0 && (
                              <div className="mb-2">
                                <p className="text-xs font-medium text-muted-foreground mb-1">Subtasks:</p>
                                <ul className="space-y-1">
                                  {task.subtasks.map((subtask, idx) => (
                                    <li key={idx} className="flex items-center gap-2 text-xs">
                                      <Checkbox
                                        checked={subtask.completed}
                                        onCheckedChange={() => {
                                          const updatedSubtasks = [...task.subtasks];
                                          updatedSubtasks[idx] = { ...subtask, completed: !subtask.completed };
                                          updateTask(task.id, { subtasks: updatedSubtasks });
                                        }}
                                        className="h-4 w-4"
                                      />
                                      <span className={subtask.completed ? 'line-through text-muted-foreground' : ''}>
                                        {subtask.text}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            
                            {task.checklists && task.checklists.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Checklist:</p>
                                <ul className="space-y-1">
                                  {task.checklists.flatMap(cl => cl.items).map((item, idx) => (
                                    <li key={idx} className="flex items-center gap-2 text-xs">
                                      <Checkbox
                                        checked={item.completed}
                                        onCheckedChange={() => {
                                          const updatedChecklists = [...task.checklists];
                                          const checklistIndex = updatedChecklists.findIndex(cl => cl.items.some(i => i.id === item.id));
                                          if (checklistIndex !== -1) {
                                            const itemIndex = updatedChecklists[checklistIndex].items.findIndex(i => i.id === item.id);
                                            if (itemIndex !== -1) {
                                              updatedChecklists[checklistIndex].items[itemIndex].completed = !item.completed;
                                              updateTask(task.id, { checklists: updatedChecklists });
                                            }
                                          }
                                        }}
                                        className="h-4 w-4"
                                      />
                                      <span className={item.completed ? 'line-through text-muted-foreground' : ''}>
                                        {item.text}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTask(task.id);
                            }}
                          >
                            Delete
                          </Button>
                        </div>
                        
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t space-y-2">
                            <div>
                              <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
                              <p className="text-sm">{task.description || 'No description'}</p>
                            </div>
                            
                            <div className="flex justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteTask(task.id);
                                }}
                              >
                                Delete Task
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Project Sections */}
      {board.tasks.filter(t => t.projectId).map((task, idx, arr) => {
        const uniqueProjects = arr
          .filter((t, i, self) => t.projectId && self.findIndex(p => p.projectId === t.projectId) === i)
          .map(t => t.projectId) as number[];
        
        return uniqueProjects.map(projectId => {
          const projectTasks = arr.filter(t => t.projectId === projectId);
          const projectColumns = [...new Set(projectTasks.map(t => t.columnId))];
          
          return (
            <div key={projectId} className="space-y-2">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer">
                <span className="font-semibold text-foreground">
                  {projectTasks[0].projectName || `PROJECT ${projectId}`}
                </span>
                <span className="text-xs text-muted-foreground">({projectTasks.length})</span>
              </div>
              
              <div className="pl-4 space-y-2">
                {projectColumns.map(columnId => {
                  const columnTasks = projectTasks.filter(t => t.columnId === columnId);
                  const column = board.columns.find(col => col.id === columnId);
                  
                  return (
                    <div key={columnId} className="space-y-2">
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted cursor-pointer">
                        <span className="font-medium text-muted-foreground">{column?.title || columnId}</span>
                        <span className="text-xs text-muted-foreground">({columnTasks.length})</span>
                      </div>
                      
                      <div className="pl-4 space-y-2">
                        {columnTasks.map(task => {
                          const isExpanded = expandedTaskIds.includes(task.id);
                          
                          return (
                            <Card key={task.id} className="hover:shadow-md transition-shadow cursor-pointer">
                              <CardContent className="p-4" onClick={() => onTaskClick(task)}>
                                <div className="flex items-start gap-3">
                                  <Checkbox
                                    checked={task.completed}
                                    onCheckedChange={() => toggleTaskCompletion(task)}
                                    className="mt-1"
                                  />
                                  
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      {task.color && (
                                        <div 
                                          className="w-2.5 h-2.5 rounded-full shadow-sm flex-shrink-0" 
                                          style={{ backgroundColor: task.color }} 
                                        />
                                      )}
                                      <h3 className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                                        {task.title}
                                      </h3>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeepFocusClick(task);
                                        }}
                                        className="ml-auto p-1 hover:bg-blue-100 rounded text-gray-500 hover:text-blue-600"
                                        title="Start Deep Focus"
                                      >
                                        <Brain className="w-4 h-4" />
                                      </button>
                                      {task.icon && <span className="text-xs opacity-70">{task.icon}</span>}
                                    </div>
                                    
                                    {task.description && (
                                      <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                                    )}
                                    
                                    <div className="flex flex-wrap gap-2 mb-2">
                                      {task.priority !== 'none' && (
                                        <Badge variant={
                                          task.priority === 'urgent' ? 'destructive' : 
                                          task.priority === 'high' ? 'default' : 
                                          task.priority === 'medium' ? 'secondary' : 'outline'
                                        } className="h-6 text-xs">
                                          {task.priority}
                                        </Badge>
                                      )}
                                      {task.dueDate && (
                                        <Badge variant="outline" className="h-6 text-xs">
                                          Due: {new Date(task.dueDate).toLocaleDateString()}
                                        </Badge>
                                      )}
                                      {task.duration && (
                                        <Badge variant="outline" className="h-6 text-xs">
                                          {task.duration}m
                                        </Badge>
                                      )}
                                      {task.subject && (
                                        <Badge variant="outline" className="h-6 text-xs">
                                          {task.subject}
                                        </Badge>
                                      )}
                                    </div>
                                    
                                    {task.subtasks && task.subtasks.length > 0 && (
                                      <div className="mb-2">
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Subtasks:</p>
                                        <ul className="space-y-1">
                                          {task.subtasks.map((subtask, idx) => (
                                            <li key={idx} className="flex items-center gap-2 text-xs">
                                              <Checkbox
                                                checked={subtask.completed}
                                                onCheckedChange={() => {
                                                  const updatedSubtasks = [...task.subtasks];
                                                  updatedSubtasks[idx] = { ...subtask, completed: !subtask.completed };
                                                  updateTask(task.id, { subtasks: updatedSubtasks });
                                                }}
                                                className="h-4 w-4"
                                              />
                                              <span className={subtask.completed ? 'line-through text-muted-foreground' : ''}>
                                                {subtask.text}
                                              </span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    
                                    {task.checklists && task.checklists.length > 0 && (
                                      <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-1">Checklist:</p>
                                        <ul className="space-y-1">
                                          {task.checklists.flatMap(cl => cl.items).map((item, idx) => (
                                            <li key={idx} className="flex items-center gap-2 text-xs">
                                              <Checkbox
                                                checked={item.completed}
                                                onCheckedChange={() => {
                                                  const updatedChecklists = [...task.checklists];
                                                  const checklistIndex = updatedChecklists.findIndex(cl => cl.items.some(i => i.id === item.id));
                                                  if (checklistIndex !== -1) {
                                                    const itemIndex = updatedChecklists[checklistIndex].items.findIndex(i => i.id === item.id);
                                                    if (itemIndex !== -1) {
                                                      updatedChecklists[checklistIndex].items[itemIndex].completed = !item.completed;
                                                      updateTask(task.id, { checklists: updatedChecklists });
                                                    }
                                                  }
                                                }}
                                                className="h-4 w-4"
                                              />
                                              <span className={item.completed ? 'line-through text-muted-foreground' : ''}>
                                                {item.text}
                                              </span>
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                  
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteTask(task.id);
                                    }}
                                  >
                                    Delete
                                  </Button>
                                </div>
                                
                                {isExpanded && (
                                  <div className="mt-3 pt-3 border-t space-y-2">
                                    <div>
                                      <h4 className="text-sm font-medium text-muted-foreground">Description</h4>
                                      <p className="text-sm">{task.description || 'No description'}</p>
                                    </div>
                                    
                                    <div className="flex justify-end">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          deleteTask(task.id);
                                        }}
                                      >
                                        Delete Task
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        });
      })}
    </div>
  );
};

export default ListView;