import React, { useState } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import TaskDetailModal from '@/components/TaskDetailModal';
import { Task, PRIORITY_CONFIG, Priority } from '@/types/board';
import { Plus, Search, Filter, CheckSquare, Trash2, ArrowRight, ArrowDownAz, Sparkles, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

const Tasks: React.FC = () => {
  const { board, addTask, reorderTasks } = useBoardContext();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('none');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskSubject, setNewTaskSubject] = useState('');
  const [newTaskColor, setNewTaskColor] = useState('');
  const [newTaskIcon, setNewTaskIcon] = useState('');
  const [newTaskSubtasks, setNewTaskSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const { user } = useAuth();
  const [autoSort, setAutoSort] = useState(false);
  const [prioritizing, setPrioritizing] = useState(false);
  const isPremium = user?.subscriptionTier === 'premium';
  const isPro = user?.subscriptionTier === 'pro' || isPremium;

  const filteredTasks = board.tasks
    .filter(t => t.title && t.title.toLowerCase().includes(search.toLowerCase()))
    .filter(t => filterPriority === 'all' || t.priority === filterPriority)
    .sort((a, b) => {
      if (autoSort && isPro) {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      }
      const order = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      const priorityA = a.priority || 'none';
      const priorityB = b.priority || 'none';
      const diff = (order[priorityA as keyof typeof order] || 4) - (order[priorityB as keyof typeof order] || 4);
      if (diff !== 0) return diff;
      return (a.order || 0) - (b.order || 0);
    });

  const handleAiPrioritize = async () => {
    if (!isPremium || prioritizing) return;
    setPrioritizing(true);
    try {
      const res = await fetch('/api/ai/premium/ai-prioritize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tasks: board.tasks }),
      });
      if (res.ok) {
        const orderedIds = await res.json();
        reorderTasks(orderedIds);
      }
    } catch (err) {
      console.error('AI Prioritize error:', err);
    } finally {
      setPrioritizing(false);
    }
  };

  const handleAddSubtask = () => {
    if (newSubtask.trim()) {
      setNewTaskSubtasks([...newTaskSubtasks, newSubtask.trim()]);
      setNewSubtask('');
    }
  };

  const removeSubtask = (index: number) => {
    setNewTaskSubtasks(newTaskSubtasks.filter((_, i) => i !== index));
  };

  const handleAddTask = async () => {
    if (newTaskTitle.trim()) {
      const firstCol = board.columns[0];
      if (firstCol) {
        const taskId = crypto.randomUUID();
        addTask(firstCol.id, newTaskTitle.trim(), {
          id: taskId,
          description: newTaskDesc.trim(),
          priority: newTaskPriority,
          dueDate: newTaskDueDate || undefined,
          subject: newTaskSubject.trim() || undefined,
          color: newTaskColor || undefined,
          icon: newTaskIcon || undefined,
          checklists: newTaskSubtasks.length > 0 ? [{
            id: crypto.randomUUID(),
            title: 'Subtasks',
            items: newTaskSubtasks.map(s => ({ id: crypto.randomUUID(), text: s, completed: false }))
          }] : []
        });

        // Handle file uploads
        if (newFiles.length > 0) {
          for (const file of newFiles) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('taskId', taskId);
            try {
              await fetch('/api/attachments/upload', {
                method: 'POST',
                body: formData,
                credentials: 'include'
              });
            } catch (err) {
              console.error('Failed to upload file:', file.name, err);
            }
          }
        }
      }
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskPriority('none');
      setNewTaskDueDate('');
      setNewTaskSubject('');
      setNewTaskColor('');
      setNewTaskIcon('');
      setNewTaskSubtasks([]);
      setNewFiles([]);
      setAddingTask(false);
    }
  };

  const currentTask = selectedTask ? board.tasks.find(t => t.id === selectedTask.id) : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="px-6 py-4 border-b border-border flex items-center justify-between bg-card/30 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">All Tasks</h1>
            <p className="text-xs text-muted-foreground">{filteredTasks.length} tasks matching filters</p>
          </div>
        </div>
        <button
          onClick={() => setAddingTask(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-all duration-200 hover:scale-105 shadow-lg shadow-primary/20"
        >
          <Plus className="w-4.5 h-4.5" />
          New Task
        </button>
      </header>

      {/* Filters */}
      <div className="px-6 py-4 border-b border-border flex items-center gap-4 bg-card/10">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search tasks by title..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-muted/50 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
        <div className="flex items-center gap-1.5 p-1 bg-muted/50 rounded-xl border border-border">
          {['all', 'urgent', 'high', 'medium', 'low'].map(p => (
            <button
              key={p}
              onClick={() => setFilterPriority(p)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-200 font-medium ${
                filterPriority === p
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {p === 'all' ? 'All' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => isPro && setAutoSort(!autoSort)}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border transition-all ${
              autoSort && isPro
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-muted/50 border-border text-muted-foreground hover:text-foreground'
            } ${!isPro && 'opacity-50 cursor-not-allowed'}`}
            title={!isPro ? "Pro feature: Auto sort by due date" : ""}
          >
            <ArrowDownAz className="w-3.5 h-3.5" />
            Sort by Due Date
          </button>
          <button
            onClick={handleAiPrioritize}
            disabled={prioritizing || !isPremium}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl border bg-primary/5 border-primary/20 text-primary hover:bg-primary/10 transition-all ${
              (!isPremium || prioritizing) && 'opacity-50 cursor-not-allowed'
            }`}
            title={!isPremium ? "Premium feature: AI Prioritization" : ""}
          >
            {prioritizing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {prioritizing ? 'Prioritizing...' : 'AI Prioritize'}
          </button>
        </div>
      </div>

      {/* Add task inline */}
      {addingTask && (
        <div className="px-6 py-6 border-b border-border bg-card/20 animate-in slide-in-from-top duration-300">
          <div className="max-w-4xl mx-auto bg-card border-2 border-primary/20 rounded-2xl shadow-2xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Plus className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Create New Task</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Title</label>
                  <input
                    autoFocus
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    placeholder="What needs to be done?"
                    className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Description</label>
                  <textarea
                    value={newTaskDesc}
                    onChange={e => setNewTaskDesc(e.target.value)}
                    placeholder="Add more details..."
                    className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none"
                    rows={3}
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Subtasks</label>
                  <div className="space-y-1.5 mb-3">
                    {newTaskSubtasks.map((st, i) => (
                      <div key={i} className="flex items-center gap-2 bg-muted/30 px-3 py-2 rounded-xl border border-border/50 group">
                        <span className="flex-1 text-[11px] text-foreground font-medium">{st}</span>
                        <button onClick={() => removeSubtask(i)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newSubtask}
                      onChange={e => setNewSubtask(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
                      placeholder="Add a step..."
                      className="flex-1 bg-muted/30 border border-border rounded-xl px-4 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    <button 
                      onClick={handleAddSubtask}
                      className="p-2.5 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all shadow-sm"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Priority</label>
                    <select
                      value={newTaskPriority}
                      onChange={e => setNewTaskPriority(e.target.value as any)}
                      className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                    >
                      <option value="none">None</option>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Due Date</label>
                    <input
                      type="date"
                      value={newTaskDueDate}
                      onChange={e => setNewTaskDueDate(e.target.value)}
                      className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Subject</label>
                  <input
                    type="text"
                    value={newTaskSubject}
                    onChange={e => setNewTaskSubject(e.target.value)}
                    placeholder="e.g. Science, Project A"
                    className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Color</label>
                    <div className="flex items-center gap-3 bg-muted/30 border border-border rounded-xl px-4 py-2.5">
                      <input
                        type="color"
                        value={newTaskColor}
                        onChange={e => setNewTaskColor(e.target.value)}
                        className="w-8 h-8 rounded-lg bg-transparent border-0 p-0 cursor-pointer"
                      />
                      <span className="text-xs text-muted-foreground font-medium uppercase">{newTaskColor || '#000000'}</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Icon Name</label>
                    <input
                      type="text"
                      value={newTaskIcon}
                      onChange={e => setNewTaskIcon(e.target.value)}
                      placeholder="e.g. coffee"
                      className="w-full bg-muted/30 border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase ml-1">Attachments</label>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {newFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/20 text-[10px] font-medium text-primary uppercase">
                        {f.name}
                        <button onClick={() => setNewFiles(newFiles.filter((_, idx) => idx !== i))} className="hover:text-destructive">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <label 
                    className={`flex items-center gap-2 w-max px-4 py-2 border rounded-xl text-xs font-bold transition-all ${
                      isPremium 
                        ? 'bg-muted/50 border-border text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer' 
                        : 'bg-primary/5 border-primary/20 text-primary opacity-80 cursor-pointer'
                    }`}
                    onClick={() => !isPremium && (window.location.href = '/pricing')}
                  >
                    {isPremium ? <Plus className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5 fill-current" />}
                    {isPremium ? 'Add File' : 'Post Files (Premium)'}
                    {isPremium && (
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={e => {
                          if (e.target.files) {
                            setNewFiles([...newFiles, ...Array.from(e.target.files)]);
                          }
                        }}
                      />
                    )}
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-5 border-t border-border mt-2">
              <button 
                onClick={() => setAddingTask(false)} 
                className="px-6 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-all"
              >
                Discard
              </button>
              <button 
                onClick={handleAddTask} 
                disabled={!newTaskTitle.trim()}
                className="px-10 py-2.5 bg-primary text-primary-foreground text-sm font-bold rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 active:scale-95"
              >
                Create Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-2 max-w-4xl">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-16 animate-fade-in">
              <CheckSquare className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No tasks found</p>
            </div>
          ) : (
            filteredTasks.map((task, i) => {
              const col = board.columns.find(c => c.id === task.columnId);
              const config = task.priority !== 'none' ? PRIORITY_CONFIG[task.priority] : null;
              const checkTotal = task.checklists.reduce((s, cl) => s + cl.items.length, 0);
              const checkDone = task.checklists.reduce((s, cl) => s + cl.items.filter(i => i.completed).length, 0);

              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  className="flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 cursor-pointer group animate-fade-in"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {config && (
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${config.className} text-primary-foreground`}>
                          {config.label}
                        </span>
                      )}
                      <span className="text-sm font-medium text-foreground truncate">{task.title}</span>
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{task.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      {task.labels.map(l => (
                        <span key={l.id} className={`text-[9px] px-1.5 py-0.5 rounded bg-label-${l.color} text-primary-foreground font-medium`}>
                          {l.name}
                        </span>
                      ))}
                      {checkTotal > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          ☑ {checkDone}/{checkTotal}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {col && (
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: col.color, color: 'hsl(var(--primary-foreground))' }}
                      >
                        {col.title}
                      </span>
                    )}
                    {task.dueDate && (
                      <span className={`text-[10px] ${task.dueDate < new Date().toISOString().split('T')[0] ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {task.dueDate}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {currentTask && (
        <TaskDetailModal task={currentTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  );
};

export default Tasks;
