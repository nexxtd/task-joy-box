import React, { useState, useEffect, useMemo } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { useAuth } from '@/context/AuthContext';
import { Task, Checklist, ChecklistItem, Attachment, Subtask, Label, LabelColor } from '@/types/board';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Plus, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  Calendar, 
  Clock, 
  Flag, 
  CheckCircle2, 
  Circle, 
  Square, 
  SquareCheck, 
  Sparkles,
  ChevronDown,
  ChevronRight,
  X,
  Paperclip,
  Download,
  Search,
  Filter,
  Tag,
  Settings,
  User,
  Eye,
  EyeOff
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { LABEL_COLORS } from '@/constants/labelColors';

const Tasks: React.FC = () => {
  const { board, addTask, updateTask, deleteTask, addColumn, updateColumn, deleteColumn } = useBoardContext();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filteredTasks, setFilteredTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Record<number, boolean>>({});
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    dueDate: 'all',
    tags: [] as string[],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [showTagFilter, setShowTagFilter] = useState(false);
  const [availableTags, setAvailableTags] = useState<Label[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('blue');
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'none',
    dueDate: '',
    dueTime: '',
    subject: '',
    color: '',
    icon: '',
    duration: 60,
    columnId: '',
    order: 0,
    labels: [] as Label[],
    checklists: [] as Checklist[],
    subtasks: [] as Subtask[],
    attachments: [] as Attachment[],
    comments: [] as any[],
    projectId: null as number | null,
  });

  // Load tasks and projects
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load projects
        const projectsResponse = await fetch('/api/projects', { credentials: 'include' });
        if (projectsResponse.ok) {
          const projectsData = await projectsResponse.json();
          setProjects(projectsData.projects || []);
        }

        // Load all tasks
        const tasksResponse = await fetch('/api/tasks', { credentials: 'include' });
        if (tasksResponse.ok) {
          const tasksData = await tasksResponse.json();
          setTasks(tasksData.tasks || []);
        }
      } catch (error) {
        console.error('Error loading data:', error);
        toast({ title: 'Error', description: 'Failed to load tasks and projects' });
      }
    };
    loadData();
  }, []);

  // Update filtered tasks based on filters and search query
  useEffect(() => {
    let result = [...tasks];

    // Apply search filter
    if (searchQuery) {
      result = result.filter(task => 
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply status filter
    if (filters.status !== 'all') {
      result = result.filter(task => task.status === filters.status);
    }

    // Apply priority filter
    if (filters.priority !== 'all') {
      result = result.filter(task => task.priority === filters.priority);
    }

    // Apply due date filter
    if (filters.dueDate !== 'all') {
      result = result.filter(task => {
        if (!task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        switch (filters.dueDate) {
          case 'today':
            return dueDate.getTime() === today.getTime();
          case 'upcoming':
            return dueDate >= today;
          case 'overdue':
            return dueDate < today && !task.completed;
          default:
            return true;
        }
      });
    }

    // Apply tag filter
    if (filters.tags.length > 0) {
      result = result.filter(task => 
        task.labels?.some((label: Label) => filters.tags.includes(label.name))
      );
    }

    setFilteredTasks(result);
  }, [tasks, filters, searchQuery]);

  // Get all unique tags from tasks
  useEffect(() => {
    const allLabels: Label[] = [];
    tasks.forEach(task => {
      if (task.labels) {
        task.labels.forEach((label: Label) => {
          if (!allLabels.some(l => l.name === label.name)) {
            allLabels.push(label);
          }
        });
      }
    });
    setAvailableTags(allLabels);
  }, [tasks]);

  const handleAddTask = () => {
    if (!newTask.title.trim()) return;

    const taskToAdd: any = {
      ...newTask,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completed: false,
      completedAt: null,
    };

    addTask(newTask.columnId, newTask.title, taskToAdd);
    setNewTask({
      title: '',
      description: '',
      priority: 'none',
      dueDate: '',
      dueTime: '',
      subject: '',
      color: '',
      icon: '',
      duration: 60,
      columnId: '',
      order: 0,
      labels: [],
      checklists: [],
      subtasks: [],
      attachments: [],
      comments: [],
      projectId: null,
    });
    setIsAddingTask(false);
  };

  const handleToggleTaskCompletion = (task: Task) => {
    updateTask(task.id, { 
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : null
    });
  };

  const handleToggleSubtask = (taskId: string, subtaskId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedSubtasks = task.subtasks?.map(subtask => 
      subtask.id === subtaskId ? { ...subtask, completed: !subtask.completed } : subtask
    );

    updateTask(taskId, { subtasks: updatedSubtasks });
  };

  const handleToggleChecklistItem = (taskId: string, checklistId: string, itemId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedChecklists = task.checklists?.map(checklist => {
      if (checklist.id === checklistId) {
        const updatedItems = checklist.items.map(item => 
          item.id === itemId ? { ...item, completed: !item.completed } : item
        );
        return { ...checklist, items: updatedItems };
      }
      return checklist;
    });

    updateTask(taskId, { checklists: updatedChecklists });
  };

  const handleCreateTag = (taskId: string, name: string, color: string) => {
    // Map the color name to a valid LabelColor type
    const validLabelColors: LabelColor[] = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'];
    const normalizedColor = validLabelColors.includes(color as LabelColor) ? color as LabelColor : 'blue';
    
    const newLabel: Label = { 
      id: crypto.randomUUID(), 
      name, 
      color: normalizedColor
    };
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedLabels = [...(task.labels || []), newLabel];
    updateTask(taskId, { labels: updatedLabels });
  };

  const handleDeleteTag = (taskId: string, labelId: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedLabels = (task.labels || []).filter((label: Label) => label.id !== labelId);
    updateTask(taskId, { labels: updatedLabels });
  };

  const normalizeTagName = (name: string) => {
    return name.toLowerCase().replace(/\s+/g, '-');
  };

  const randomTagColor = () => {
    const colors = Object.keys(LABEL_COLORS);
    return colors[Math.floor(Math.random() * colors.length)];
  };

  const handleAddTagToTask = () => {
    if (!selectedTask || !newTagName.trim()) return;

    const name = normalizeTagName(newTagName);
    const existingTag = (selectedTask.labels || []).find((label: Label) => label.name === name);

    if (!existingTag) {
      handleCreateTag(selectedTask.id, name, newTagColor);
    }

    setNewTagName('');
    setNewTagColor(randomTagColor());
    setTagPickerOpen(false);
  };

  const toggleProjectExpansion = (projectId: number) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  };

  const toggleColumnExpansion = (columnId: string) => {
    setExpandedColumns(prev => ({
      ...prev,
      [columnId]: !prev[columnId]
    }));
  };

  // Group tasks by project and column
  const groupedTasks = useMemo(() => {
    const grouped: Record<string, Record<string, Task[]>> = {};
    
    // Group tasks by project
    tasks.forEach(task => {
      const projectId = task.projectId || 'my_tasks';
      if (!grouped[projectId]) {
        grouped[projectId] = {};
      }
      
      const columnId = task.columnId;
      if (!grouped[projectId][columnId]) {
        grouped[projectId][columnId] = [];
      }
      
      grouped[projectId][columnId].push(task);
    });
    
    return grouped;
  }, [tasks]);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Tasks</h2>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {/* Filters */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filters</h3>
            </div>
            
            <div className="space-y-2">
              <Input
                placeholder="Search tasks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-sm"
              />
              
              <Select value={filters.status} onValueChange={(value) => setFilters({...filters, status: value})}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="to_do">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="review">Review</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={filters.priority} onValueChange={(value) => setFilters({...filters, priority: value})}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="none">No Priority</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={filters.dueDate} onValueChange={(value) => setFilters({...filters, dueDate: value})}>
                <SelectTrigger className="w-full text-sm">
                  <SelectValue placeholder="Due Date" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Dates</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                </SelectContent>
              </Select>
              
              <Button 
                variant="outline" 
                className="w-full justify-start text-sm"
                onClick={() => setShowTagFilter(!showTagFilter)}
              >
                <Tag className="w-4 h-4 mr-2" />
                Tags {filters.tags.length > 0 && `(${filters.tags.length})`}
              </Button>
              
              {showTagFilter && (
                <div className="p-2 bg-gray-50 rounded-lg border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Tags</span>
                    <X className="w-4 h-4 cursor-pointer" onClick={() => setShowTagFilter(false)} />
                  </div>
                  
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {availableTags.map(tag => (
                      <div key={tag.id} className="flex items-center">
                        <Checkbox
                          checked={filters.tags.includes(tag.name)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setFilters({...filters, tags: [...filters.tags, tag.name]});
                            } else {
                              setFilters({...filters, tags: filters.tags.filter(t => t !== tag.name)});
                            }
                          }}
                        />
                        <Badge 
                          className="ml-2 text-xs cursor-pointer" 
                          style={{ backgroundColor: tag.color }}
                          onClick={() => {
                            if (filters.tags.includes(tag.name)) {
                              setFilters({...filters, tags: filters.tags.filter(t => t !== tag.name)});
                            } else {
                              setFilters({...filters, tags: [...filters.tags, tag.name]});
                            }
                          }}
                        >
                          {tag.name}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Task List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">My Tasks</h3>
            </div>
            
            {groupedTasks['my_tasks'] ? (
              Object.entries(groupedTasks['my_tasks']).map(([columnId, columnTasks]) => (
                <div key={columnId} className="mb-2">
                  <div 
                    className="flex items-center gap-1 p-1 rounded cursor-pointer hover:bg-gray-100"
                    onClick={() => toggleColumnExpansion(columnId)}
                  >
                    {expandedColumns[columnId] ? 
                      <ChevronDown className="w-4 h-4" /> : 
                      <ChevronRight className="w-4 h-4" />
                    }
                    <span className="text-sm font-medium">{columnId}</span>
                  </div>
                  
                  {expandedColumns[columnId] && (
                    <div className="ml-5 space-y-1">
                      {columnTasks.map(task => (
                        <div
                          key={task.id}
                          onClick={() => setSelectedTask(task)}
                          className={`p-2 rounded cursor-pointer ${
                            selectedTask?.id === task.id ? 'bg-blue-100' : 'hover:bg-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={task.completed}
                              onCheckedChange={() => handleToggleTaskCompletion(task)}
                            />
                            <span className={`text-sm ${task.completed ? 'line-through text-gray-500' : ''}`}>
                              {task.title}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-xs text-gray-500 p-2">No tasks</div>
            )}
          </div>
          
          {/* Project Sections */}
          {projects.map(project => {
            const projectTasks = groupedTasks[project.id];
            return (
              <div key={project.id} className="mb-4">
                <div 
                  className="flex items-center justify-between p-1 rounded cursor-pointer hover:bg-gray-100"
                  onClick={() => toggleProjectExpansion(project.id)}
                >
                  <div className="flex items-center gap-1">
                    {expandedProjects[project.id] ? 
                      <ChevronDown className="w-4 h-4" /> : 
                      <ChevronRight className="w-4 h-4" />
                    }
                    <span className="text-sm font-medium">{project.name}</span>
                  </div>
                </div>
                
                {expandedProjects[project.id] && projectTasks && (
                  <div className="ml-5 mt-1 space-y-2">
                    {Object.entries(projectTasks).map(([columnId, columnTasks]) => (
                      <div key={columnId}>
                        <div 
                          className="flex items-center gap-1 p-1 rounded cursor-pointer hover:bg-gray-100"
                          onClick={() => toggleColumnExpansion(`${project.id}-${columnId}`)}
                        >
                          {expandedColumns[`${project.id}-${columnId}`] ? 
                            <ChevronDown className="w-4 h-4" /> : 
                            <ChevronRight className="w-4 h-4" />
                          }
                          <span className="text-xs font-medium text-gray-600">{columnId}</span>
                        </div>
                        
                        {expandedColumns[`${project.id}-${columnId}`] && (
                          <div className="ml-5 space-y-1">
                            {columnTasks.map(task => (
                              <div
                                key={task.id}
                                onClick={() => setSelectedTask(task)}
                                className={`p-2 rounded cursor-pointer ${
                                  selectedTask?.id === task.id ? 'bg-blue-100' : 'hover:bg-gray-100'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <Checkbox
                                    checked={task.completed}
                                    onCheckedChange={() => handleToggleTaskCompletion(task)}
                                  />
                                  <span className={`text-sm ${task.completed ? 'line-through text-gray-500' : ''}`}>
                                    {task.title}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        <div className="p-2 border-t border-gray-200">
          <Button 
            onClick={() => setIsAddingTask(true)}
            className="w-full flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Task
          </Button>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900">Task List</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                Settings
              </Button>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {selectedTask ? (
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {selectedTask.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <Circle className="w-5 h-5 text-gray-400" />
                      )}
                      {selectedTask.title}
                    </CardTitle>
                    <div className="flex items-center gap-2 mt-2">
                      {selectedTask.priority !== 'none' && (
                        <Badge 
                          variant="outline"
                          className={
                            selectedTask.priority === 'urgent' ? 'border-red-200 text-red-800' :
                            selectedTask.priority === 'high' ? 'border-orange-200 text-orange-800' :
                            selectedTask.priority === 'medium' ? 'border-yellow-200 text-yellow-800' :
                            selectedTask.priority === 'low' ? 'border-blue-200 text-blue-800' : ''
                          }
                        >
                          {selectedTask.priority}
                        </Badge>
                      )}
                      {selectedTask.dueDate && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(selectedTask.dueDate).toLocaleDateString()}
                        </Badge>
                      )}
                      {selectedTask.duration && (
                        <Badge variant="outline" className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {selectedTask.duration}m
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setIsTaskModalOpen(true)}>
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => deleteTask(selectedTask.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {selectedTask.description && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Description</h4>
                      <p className="text-sm text-gray-600">{selectedTask.description}</p>
                    </div>
                  )}
                  
                  {selectedTask.subtasks && selectedTask.subtasks.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Subtasks</h4>
                      <div className="space-y-2">
                        {selectedTask.subtasks.map(subtask => (
                          <div key={subtask.id} className="flex items-center gap-2">
                            <Checkbox
                              checked={subtask.completed}
                              onCheckedChange={() => handleToggleSubtask(selectedTask.id, subtask.id)}
                            />
                            <span className={subtask.completed ? 'line-through text-gray-500' : ''}>
                              {subtask.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {selectedTask.checklists && selectedTask.checklists.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Checklists</h4>
                      <div className="space-y-3">
                        {selectedTask.checklists.map(checklist => (
                          <div key={checklist.id}>
                            <h5 className="text-sm font-medium mb-1">{checklist.title}</h5>
                            <div className="space-y-1 ml-2">
                              {checklist.items.map(item => (
                                <div key={item.id} className="flex items-center gap-2">
                                  <SquareCheck 
                                    className={`w-4 h-4 cursor-pointer ${item.completed ? 'text-blue-600' : 'text-gray-300'}`}
                                    onClick={() => handleToggleChecklistItem(selectedTask.id, checklist.id, item.id)}
                                  />
                                  <span className={item.completed ? 'line-through text-gray-500' : ''}>
                                    {item.text}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {selectedTask.labels && selectedTask.labels.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Tags</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedTask.labels.map((label: Label) => (
                          <Badge 
                            key={label.id} 
                            className="cursor-pointer"
                            style={{ backgroundColor: label.color }}
                            onClick={() => handleDeleteTag(selectedTask.id, label.id)}
                          >
                            {label.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {selectedTask.attachments && selectedTask.attachments.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Attachments</h4>
                      <div className="space-y-2">
                        {selectedTask.attachments.map(attachment => (
                          <div key={attachment.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                            <Paperclip className="w-4 h-4 text-gray-500" />
                            <span className="text-sm">{attachment.fileName}</span>
                            <Download className="w-4 h-4 text-gray-500 ml-auto cursor-pointer" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div className="pt-4 border-t">
                    <h4 className="text-sm font-medium mb-2">Add Tag</h4>
                    <div className="flex gap-2">
                      <Input
                        value={newTagName}
                        onChange={e => setNewTagName(e.target.value)}
                        placeholder="Tag name"
                        className="text-sm"
                      />
                      <Select value={newTagColor} onValueChange={setNewTagColor}>
                        <SelectTrigger className="w-16">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(LABEL_COLORS).map(([colorName, colorValue]) => (
                            <SelectItem key={colorName} value={colorName}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: colorValue }}
                                />
                                {colorName}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={handleAddTagToTask}>
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <div className="mx-auto bg-gray-100 rounded-full w-16 h-16 flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium mb-1">No task selected</h3>
                <p className="text-sm">Select a task from the sidebar to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Add Task Modal */}
      {isAddingTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-md">
            <div className="p-5 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Add New Task</h3>
                <button 
                  onClick={() => setIsAddingTask(false)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Title</label>
                <Input
                  value={newTask.title}
                  onChange={(e) => setNewTask({...newTask, title: e.target.value})}
                  placeholder="Enter task title"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <Input
                  value={newTask.description}
                  onChange={(e) => setNewTask({...newTask, description: e.target.value})}
                  placeholder="Enter description"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <Select value={newTask.priority} onValueChange={(value) => setNewTask({...newTask, priority: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                  <Input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({...newTask, dueDate: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duration (minutes)</label>
                  <Input
                    type="number"
                    value={newTask.duration}
                    onChange={(e) => setNewTask({...newTask, duration: Number(e.target.value)})}
                    min="0"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
                  <Select 
                    value={newTask.projectId?.toString() || ''} 
                    onValueChange={(value) => setNewTask({
                      ...newTask, 
                      projectId: value ? Number(value) : null
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">No Project</SelectItem>
                      {projects.map(project => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          {project.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            <div className="p-5 border-t border-gray-200 flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setIsAddingTask(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddTask}
                disabled={!newTask.title.trim()}
              >
                Add Task
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;