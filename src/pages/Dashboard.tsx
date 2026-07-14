import React, { useState, useEffect } from 'react';
import { useBoardContext } from '@/context/BoardContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import EnergyTaskRecommendations from '@/components/EnergyTaskRecommendations';
import {
  CheckSquare, Target, Flame, Plus, ArrowRight,
  TrendingUp, Cloud, Bot, Calendar, X
} from 'lucide-react';
import { PRIORITY_CONFIG, Priority } from '@/types/board';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const Dashboard: React.FC = () => {
  const { board, addTask } = useBoardContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>('none');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskDueTime, setNewTaskDueTime] = useState('');
  const [newTaskColumn, setNewTaskColumn] = useState('');
  const [habitStreak, setHabitStreak] = useState(0);
  const [energySettings, setEnergySettings] = useState({
    energyMorning: 'medium' as 'low' | 'medium' | 'high',
    energyAfternoon: 'high' as 'low' | 'medium' | 'high',
    energyEvening: 'low' as 'low' | 'medium' | 'high',
  });

  // Load energy settings from localStorage or backend
  useEffect(() => {
    const fetchEnergySettings = async () => {
      try {
        // Try to get from localStorage first
        const morning = localStorage.getItem('energyMorning') || 'medium';
        const afternoon = localStorage.getItem('energyAfternoon') || 'high';
        const evening = localStorage.getItem('energyEvening') || 'low';
        
        setEnergySettings({
          energyMorning: morning as 'low' | 'medium' | 'high',
          energyAfternoon: afternoon as 'low' | 'medium' | 'high',
          energyEvening: evening as 'low' | 'medium' | 'high',
        });
      } catch (error) {
        console.error('Error loading energy settings:', error);
      }
    };

    fetchEnergySettings();
  }, []);

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const activeTasks = board.tasks.filter(t => {
    const col = board.columns.find(c => c.id === t.columnId);
    return col && col.title !== 'Completed' && !t.completed;
  });
  const completedTasks = board.tasks.filter(t => {
    const col = board.columns.find(c => c.id === t.columnId);
    return (col && col.title === 'Completed') || t.completed;
  });
  const completionRate = board.tasks.length > 0
    ? Math.round((completedTasks.length / board.tasks.length) * 100)
    : 0;

  const priorityTasks = activeTasks
    .filter(t => t.priority !== 'none')
    .sort((a, b) => {
      const order = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
      return order[a.priority] - order[b.priority];
    })
    .slice(0, 5);

  // Calculate weekly activity from actual completion timestamps
  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const weeklyData = (() => {
    const data = new Array(7).fill(0);
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeek = new Date(today);
    startOfWeek.setHours(0, 0, 0, 0);
    startOfWeek.setDate(today.getDate() + mondayOffset);

    for (const task of board.tasks) {
      const col = board.columns.find(c => c.id === task.columnId);
      const isCompleted = Boolean(task.completed || col?.title?.toLowerCase() === 'completed');
      if (!isCompleted) continue;

      const completionSource = task.completedAt ?? task.updatedAt;
      if (!completionSource) continue;
      const completedAt = new Date(completionSource);
      if (Number.isNaN(completedAt.getTime())) continue;

      const dayStart = new Date(completedAt);
      dayStart.setHours(0, 0, 0, 0);
      const dayIndex = Math.floor((dayStart.getTime() - startOfWeek.getTime()) / (24 * 60 * 60 * 1000));
      if (dayIndex >= 0 && dayIndex <= 6) {
        data[dayIndex] += 1;
      }
    }

    return data;
  })();
  
  const maxWeekly = Math.max(...weeklyData, 1);
  const peakDay = weeklyData.indexOf(Math.max(...weeklyData));

  // Fetch habit streak
  useEffect(() => {
    fetch('/api/habits', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((habits: any[]) => {
        const maxStreak = habits.reduce((max: number, h: any) => Math.max(max, h.streak || 0), 0);
        setHabitStreak(maxStreak);
      })
      .catch(() => {});
  }, []);

  const stats = [
    { label: 'Tasks Active', value: activeTasks.length, icon: CheckSquare, color: 'text-primary' },
    { label: 'Completion', value: `${completionRate}%`, icon: TrendingUp, color: 'text-label-green' },
    { label: 'Daily Streak', value: habitStreak, icon: Flame, color: 'text-label-orange' },
  ];

  const handleAddTask = () => {
    if (newTaskTitle.trim() && newTaskColumn) {
      addTask(newTaskColumn, newTaskTitle.trim(), {
        description: newTaskDescription,
        priority: newTaskPriority,
        dueDate: newTaskDueDate || undefined,
        dueTime: newTaskDueTime || undefined,
      });
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskPriority('none');
      setNewTaskDueDate('');
      setNewTaskDueTime('');
      setNewTaskColumn('');
      setShowAddTask(false);
    }
  };

  return (
    <>
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{dateStr}</p>
            <h1 className="text-xl font-bold text-foreground mt-0.5 animate-fade-in">
              {greeting}, {user?.name || 'there'}!
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              You have <span className="text-primary font-medium">{activeTasks.length} tasks</span> active. Let's make it productive!
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/projects')}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all duration-200 hover:scale-105"
            >
              <Calendar className="w-4 h-4" />
              View Schedule
            </button>
            <button
              onClick={() => setShowAddTask(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all duration-200 hover:scale-105"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="bg-card border border-border rounded-xl p-4 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 animate-fade-in group"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="flex items-center justify-between mb-3">
                <stat.icon className={`w-5 h-5 ${stat.color} transition-transform duration-200 group-hover:scale-110`} />
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Priority */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5 animate-fade-in" style={{ animationDelay: '200ms' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-foreground">Today's Priority</h2>
              <button
                onClick={() => navigate('/tasks')}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {priorityTasks.length === 0 ? (
              <div className="text-center py-8">
                <CheckSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No priority tasks. Add some to get started!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {priorityTasks.map((task, i) => {
                  const col = board.columns.find(c => c.id === task.columnId);
                  const config = task.priority !== 'none' ? PRIORITY_CONFIG[task.priority] : null;
                  return (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/60 transition-all duration-200 cursor-pointer group animate-fade-in"
                      style={{ animationDelay: `${300 + i * 80}ms` }}
                      onClick={() => navigate('/tasks')}
                    >
                      {config && (
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${config.className} text-primary-foreground`}>
                          {config.label}
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                        {task.description && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{task.description}</p>
                        )}
                      </div>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: col?.color, color: 'hsl(var(--primary-foreground))' }}
                      >
                        {col?.title}
                      </span>
                      {task.dueDate && (
                        <span className="text-[10px] text-muted-foreground">{task.dueDate}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Energy-Aware Recommendations */}
            <div className="animate-fade-in" style={{ animationDelay: '300ms' }}>
              <EnergyTaskRecommendations 
                tasks={board.tasks} 
                energySettings={energySettings} 
              />
            </div>

            {/* Weekly Activity */}
            <div className="bg-card border border-border rounded-xl p-5 animate-fade-in" style={{ animationDelay: '400ms' }}>
              <h2 className="text-sm font-semibold text-foreground mb-4">Weekly Activity</h2>
              <div className="flex items-end gap-2 h-24">
                {weekDays.map((day, i) => {
                  const height = weeklyData[i] > 0 ? Math.max(10, (weeklyData[i] / maxWeekly) * 80) : 6;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full relative">
                        <div
                          className={`w-full rounded-t-md transition-all duration-500 ${
                            i === peakDay ? 'bg-primary' : 'bg-muted hover:bg-primary/50'
                          }`}
                          style={{ height: `${height}px`, animationDelay: `${500 + i * 50}ms` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{day}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Top Goals */}
            <div className="bg-card border border-border rounded-xl p-5 animate-fade-in" style={{ animationDelay: '500ms' }}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-foreground">Top Goals</h2>
                <button
                  onClick={() => navigate('/goals')}
                  className="text-xs text-primary hover:underline"
                >
                  View all
                </button>
              </div>
              <div className="text-center py-4">
                <Target className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">No active goals</p>
                <button
                  onClick={() => navigate('/goals')}
                  className="text-xs text-primary hover:underline mt-2"
                >
                  Set a goal
                </button>
              </div>
            </div>

            {/* Account Status */}
            <div className="bg-card border border-border rounded-xl p-5 animate-fade-in" style={{ animationDelay: '600ms' }}>
              <h2 className="text-sm font-semibold text-foreground mb-3">Account Status</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-2">
                    <Cloud className="w-3.5 h-3.5" /> Cloud Sync
                  </span>
                  <span className="text-[10px] font-bold text-label-green bg-label-green/10 px-2 py-0.5 rounded-full uppercase">
                    Ready
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5" /> AI Agent
                  </span>
                  <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase">
                    Online
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Add Task Modal */}
    {showAddTask && (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4" onClick={() => setShowAddTask(false)}>
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" />
        <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Add New Task</h2>
            <button onClick={() => setShowAddTask(false)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Title</label>
              <input
                autoFocus
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTask()}
                placeholder="Task title..."
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Description</label>
              <textarea
                value={newTaskDescription}
                onChange={e => setNewTaskDescription(e.target.value)}
                placeholder="Task description..."
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                rows={3}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Column</label>
              <Select value={newTaskColumn} onValueChange={setNewTaskColumn}>
                <SelectTrigger className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring h-10">
                  <SelectValue placeholder="Select a column..." />
                </SelectTrigger>
                <SelectContent>
                  {board.columns.map(col => (
                    <SelectItem key={col.id} value={col.id}>{col.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Priority</label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setNewTaskPriority('none')}
                  className={`text-xs px-3 py-1.5 rounded-md border transition-all ${newTaskPriority === 'none' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                >
                  None
                </button>
                {(Object.entries(PRIORITY_CONFIG) as [Exclude<Priority, 'none'>, typeof PRIORITY_CONFIG[keyof typeof PRIORITY_CONFIG]][]).map(([key, cfg]) => (
                  <button
                    key={key}
                    onClick={() => setNewTaskPriority(key)}
                    className={`text-xs px-3 py-1.5 rounded-md transition-all ${newTaskPriority === key ? `${cfg.className} text-primary-foreground` : 'border border-border text-muted-foreground hover:text-foreground'}`}
                  >
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Due Date</label>
              <input
                type="date"
                value={newTaskDueDate}
                onChange={e => setNewTaskDueDate(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Due Time</label>
              <input
                type="time"
                value={newTaskDueTime}
                onChange={e => setNewTaskDueTime(e.target.value)}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
            <button
              onClick={() => setShowAddTask(false)}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddTask}
              disabled={!newTaskTitle.trim() || !newTaskColumn}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Task
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default Dashboard;
