import React, { useState, useEffect, useRef } from 'react';
import { X, Play, Pause, RotateCcw, Volume2, VolumeX, Coffee, Brain, CheckSquare, Plus, Trash2, Edit2 } from 'lucide-react';
import { useBoardContext } from '@/context/BoardContext';
import { Task, ChecklistItem } from '@/types/board';

interface FocusSession {
  duration: number;
  completed: boolean;
  startTime: Date;
  endTime?: Date;
  taskId?: string;
}

interface DeepFocusModeProps {
  task?: Task;
}

const DeepFocusMode: React.FC<DeepFocusModeProps> = ({ task: propTask }) => {
  const { board, updateTask } = useBoardContext();
  const [isActive, setIsActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 minutes in seconds
  const [totalTime, setTotalTime] = useState(25 * 60);
  const [sessionType, setSessionType] = useState<'short' | 'medium' | 'long' | 'deep' | 'break'>('medium');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(propTask || null);
  const [customDuration, setCustomDuration] = useState(25);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [editingSubtaskId, setEditingSubtaskId] = useState<string | null>(null);
  const [editingSubtaskText, setEditingSubtaskText] = useState('');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const sessionDurations = {
    short: 20 * 60,
    medium: 30 * 60,
    long: 40 * 60,
    deep: 60 * 60,
    break: 5 * 60,
  };

  useEffect(() => {
    if (isActive && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            completeSession();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, timeLeft]);

  const completeSession = () => {
    setIsActive(false);
    if (soundEnabled) {
      playNotificationSound();
    }
    
    const newSession: FocusSession = {
      duration: totalTime,
      completed: true,
      startTime: new Date(Date.now() - (totalTime - timeLeft) * 1000),
      endTime: new Date(),
      taskId: selectedTask?.id,
    };
    
    setSessions(prev => {
      const updated = [...prev, newSession];
      // Persist to localStorage so Dashboard can read it
      try {
        localStorage.setItem('deepFocusSessions', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    showCompletionNotification();
  };

  const playNotificationSound = () => {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE');
    audio.play().catch(() => {});
  };

  const showCompletionNotification = () => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const taskName = selectedTask?.title || 'task';
      new Notification('Focus Session Complete!', {
        body: `Great job! You completed a ${sessionType} session on ${taskName}.`,
        icon: '/favicon.ico'
      });
    }
  };

  const startSession = () => {
    setIsActive(true);
    const duration = isCustomMode ? customDuration * 60 : sessionDurations[sessionType];
    setTimeLeft(duration);
    setTotalTime(duration);
  };

  const pauseSession = () => {
    setIsActive(false);
  };

  const resetSession = () => {
    setIsActive(false);
    const duration = isCustomMode ? customDuration * 60 : sessionDurations[sessionType];
    setTimeLeft(duration);
    setTotalTime(duration);
  };

  const switchSessionType = (type: 'short' | 'medium' | 'long' | 'deep' | 'break') => {
    setSessionType(type);
    setIsActive(false);
    setIsCustomMode(false);
    setTimeLeft(sessionDurations[type]);
    setTotalTime(sessionDurations[type]);
  };

  // Subtask management functions
  const addSubtask = () => {
    if (!selectedTask || !newSubtaskText.trim()) return;
    
    const newSubtask: ChecklistItem = {
      id: crypto.randomUUID(),
      text: newSubtaskText.trim(),
      completed: false
    };
    
    const updatedSubtasks = [...(selectedTask.subtasks || []), newSubtask];
    updateTask(selectedTask.id, { subtasks: updatedSubtasks });
    setNewSubtaskText('');
  };

  const toggleSubtask = (subtaskId: string) => {
    if (!selectedTask) return;
    
    const updatedSubtasks = selectedTask.subtasks.map(st => 
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );
    updateTask(selectedTask.id, { subtasks: updatedSubtasks });
  };

  const deleteSubtask = (subtaskId: string) => {
    if (!selectedTask) return;
    
    const updatedSubtasks = selectedTask.subtasks.filter(st => st.id !== subtaskId);
    updateTask(selectedTask.id, { subtasks: updatedSubtasks });
  };

  const startEditingSubtask = (subtask: ChecklistItem) => {
    setEditingSubtaskId(subtask.id);
    setEditingSubtaskText(subtask.text);
  };

  const saveEditingSubtask = () => {
    if (!selectedTask || !editingSubtaskId) return;
    
    const updatedSubtasks = selectedTask.subtasks.map(st => 
      st.id === editingSubtaskId ? { ...st, text: editingSubtaskText.trim() } : st
    );
    updateTask(selectedTask.id, { subtasks: updatedSubtasks });
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
  };

  const cancelEditingSubtask = () => {
    setEditingSubtaskId(null);
    setEditingSubtaskText('');
  };

  // Refresh selected task from board to get latest state
  useEffect(() => {
    if (selectedTask) {
      const updatedTask = board.tasks.find(t => t.id === selectedTask.id);
      if (updatedTask) {
        setSelectedTask(updatedTask);
      }
    }
  }, [board.tasks]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    return ((totalTime - timeLeft) / totalTime) * 100;
  };

  const getSessionStats = () => {
    const today = new Date().toDateString();
    const todaySessions = sessions.filter(s => 
      s.startTime.toDateString() === today && s.completed
    );
    
    const totalMinutes = todaySessions.reduce((acc, s) => acc + s.duration / 60, 0);
    const completedSessions = todaySessions.length;
    
    return { totalMinutes, completedSessions };
  };

  const { totalMinutes, completedSessions } = getSessionStats();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-lg">
      <div className="bg-card w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Deep Focus Mode</h2>
              <p className="text-xs text-muted-foreground">
                {selectedTask ? `Focusing on: ${selectedTask.title}` : 'Eliminate distractions and boost productivity'}
              </p>
            </div>
          </div>
          <button
            onClick={() => document.body.dispatchEvent(new CustomEvent('closeDeepFocus'))}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {/* Task Selection */}
          {!selectedTask && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-foreground mb-3">Select a Task to Focus On</h3>
              <div className="grid gap-2 max-h-48 overflow-y-auto">
                {board.tasks.map(task => {
                  const column = board.columns.find(c => c.id === task.columnId);
                  return (
                    <button
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className="p-3 bg-muted/50 hover:bg-muted rounded-lg text-left transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-foreground text-sm">{task.title}</div>
                          <div className="text-xs text-muted-foreground">{column?.title}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {task.subtasks && task.subtasks.length > 0 && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                              {task.subtasks.filter(st => st.completed).length}/{task.subtasks.length}
                            </span>
                          )}
                          <Plus className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Timer Display */}
          <div className="text-center mb-6">
            <div className="relative w-48 h-48 mx-auto mb-6">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-muted/20"
                />
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 88}`}
                  strokeDashoffset={`${2 * Math.PI * 88 * (1 - getProgressPercentage() / 100)}`}
                  className="text-primary transition-all duration-1000 ease-linear"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-4xl font-bold text-foreground tabular-nums">
                  {formatTime(timeLeft)}
                </div>
                <div className="text-xs text-muted-foreground capitalize mt-1">
                  {sessionType} Session
                </div>
              </div>
            </div>

            {/* Session Type Selector */}
            <div className="flex gap-2 mb-6 flex-wrap">
              {[
                { type: 'short' as const, label: '20 min', duration: '20 min' },
                { type: 'medium' as const, label: '30 min', duration: '30 min' },
                { type: 'long' as const, label: '40 min', duration: '40 min' },
                { type: 'deep' as const, label: '60 min', duration: '60 min' },
                { type: 'break' as const, label: 'Break', duration: '5 min' },
              ].map(({ type, label, duration }) => (
                <button
                  key={type}
                  onClick={() => switchSessionType(type)}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                    sessionType === type
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  <div>{label}</div>
                  <div className="opacity-70">{duration}</div>
                </button>
              ))}
            </div>

            {/* Custom Duration */}
            <div className="mb-6">
              <button
                onClick={() => setIsCustomMode(!isCustomMode)}
                className="text-sm text-primary hover:underline"
              >
                {isCustomMode ? 'Use preset' : 'Set custom duration'}
              </button>
              {isCustomMode && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={customDuration}
                    onChange={(e) => setCustomDuration(Math.max(1, Math.min(180, parseInt(e.target.value) || 25)))}
                    className="w-20 px-2 py-1 bg-muted border border-border rounded text-sm text-foreground"
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
              )}
            </div>
          </div>

          {/* Subtasks Section */}
          {selectedTask && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-primary" />
                  Subtasks
                </h3>
                <span className="text-xs text-muted-foreground">
                  {selectedTask.subtasks?.filter(st => st.completed).length || 0} / {selectedTask.subtasks?.length || 0} completed
                </span>
              </div>
              
              {/* Add new subtask */}
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={newSubtaskText}
                  onChange={(e) => setNewSubtaskText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addSubtask()}
                  placeholder="Add a subtask..."
                  className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground"
                />
                <button
                  onClick={addSubtask}
                  disabled={!newSubtaskText.trim()}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Subtasks list */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedTask.subtasks?.map(subtask => (
                  <div key={subtask.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                    <input
                      type="checkbox"
                      checked={subtask.completed}
                      onChange={() => toggleSubtask(subtask.id)}
                      className="w-4 h-4 rounded border-border accent-primary"
                    />
                    {editingSubtaskId === subtask.id ? (
                      <input
                        type="text"
                        value={editingSubtaskText}
                        onChange={(e) => setEditingSubtaskText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditingSubtask();
                          if (e.key === 'Escape') cancelEditingSubtask();
                        }}
                        onBlur={saveEditingSubtask}
                        className="flex-1 px-2 py-1 bg-background border border-border rounded text-sm"
                        autoFocus
                      />
                    ) : (
                      <span
                        className={`flex-1 text-sm ${
                          subtask.completed ? 'line-through text-muted-foreground' : 'text-foreground'
                        }`}
                      >
                        {subtask.text}
                      </span>
                    )}
                    <div className="flex items-center gap-1">
                      {!subtask.completed && (
                        <button
                          onClick={() => startEditingSubtask(subtask)}
                          className="p-1 text-muted-foreground hover:text-foreground"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteSubtask(subtask.id)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {(!selectedTask.subtasks || selectedTask.subtasks.length === 0) && (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No subtasks yet. Add one to get started!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Control Buttons */}
          <div className="flex gap-3 mb-6">
            {!isActive ? (
              <button
                onClick={startSession}
                className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4" />
                Start Session
              </button>
            ) : (
              <>
                <button
                  onClick={pauseSession}
                  className="flex-1 py-3 bg-muted text-muted-foreground rounded-xl font-medium hover:bg-muted/80 transition-all flex items-center justify-center gap-2"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </button>
                <button
                  onClick={resetSession}
                  className="p-3 bg-muted text-muted-foreground rounded-xl font-medium hover:bg-muted/80 transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Sound Toggle */}
          <div className="flex justify-center mb-6">
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className="flex items-center gap-2 px-4 py-2 bg-muted/50 text-muted-foreground rounded-lg hover:bg-muted transition-all"
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="text-sm">{soundEnabled ? 'Sound On' : 'Sound Off'}</span>
            </button>
          </div>

          {/* Today's Stats */}
          <div className="bg-muted/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Coffee className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Today's Progress</h3>
            </div>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-primary">{completedSessions}</div>
                <div className="text-xs text-muted-foreground">Sessions</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{Math.round(totalMinutes)}</div>
                <div className="text-xs text-muted-foreground">Minutes</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeepFocusMode;
