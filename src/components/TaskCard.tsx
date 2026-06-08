import React, { useState, useEffect } from 'react';
import { Task, LABEL_COLORS, PRIORITY_CONFIG } from '@/types/board';
import { Calendar, CheckSquare, AlertTriangle, Brain, CheckCircle2, User, ChevronDown, X } from 'lucide-react';
import { useDeepFocus } from '@/hooks/useDeepFocus';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isDragging?: boolean;
  onToggleComplete?: (e: React.MouseEvent) => void;
  canEdit?: boolean;
  onAssignUser?: (taskId: string, userId: number | null) => void;
  assignableUsers?: { id: number; name: string; avatarUrl?: string }[];
}

const TaskCard: React.FC<TaskCardProps> = ({ 
  task, 
  onClick, 
  isDragging, 
  onToggleComplete, 
  canEdit = true,
  onAssignUser,
  assignableUsers = []
}) => {
  const { open: openDeepFocus } = useDeepFocus();
  const totalItems = task.checklists.reduce((s, c) => s + c.items.length, 0);
  const doneItems = task.checklists.reduce((s, c) => s + c.items.filter(i => i.completed).length, 0);
  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && !task.completed;

  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  
  const assignedUser = task.assignedTo;

  const handleDeepFocusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openDeepFocus(task);
  };

  const handleAssignmentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit || !onAssignUser) return;
    
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDropdownPosition({ top: rect.bottom + 5, left: rect.left });
    setShowAssignDropdown(!showAssignDropdown);
  };

  const assignToUser = (userId: number | null) => {
    if (onAssignUser) {
      onAssignUser(task.id, userId);
    }
    setShowAssignDropdown(false);
  };

  return (
    <div
      onClick={onClick}
      className={`group rounded-lg bg-task p-3 cursor-pointer border border-transparent hover:border-border transition-all duration-150 hover:bg-task-hover ${isDragging ? 'task-dragging' : ''} ${task.completed ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2 mb-2">
        {/* Completion checkbox - only show if onToggleComplete is provided and user can edit */}
        {onToggleComplete && (
          <button
            onClick={onToggleComplete}
            className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
              task.completed 
                ? 'bg-green-500 border-green-500 text-white' 
                : 'border-muted-foreground/30 hover:border-primary'
            }`}
            disabled={!canEdit}
          >
            {task.completed && <CheckCircle2 className="w-3.5 h-3.5" />}
          </button>
        )}
        {task.color && (
          <div className="w-2.5 h-2.5 rounded-full shadow-sm flex-shrink-0" style={{ backgroundColor: task.color }} />
        )}
        <p className={`text-sm font-bold text-foreground leading-snug truncate flex-1 ${task.completed ? 'line-through text-muted-foreground' : ''}`}>{task.title}</p>
        <button
          onClick={handleDeepFocusClick}
          className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-primary/10 rounded text-muted-foreground hover:text-primary"
          title="Start Deep Focus"
          disabled={!canEdit}  // Disable if user can't edit
        >
          <Brain className="w-3.5 h-3.5" />
        </button>
        {task.icon && <span className="text-xs opacity-70">{task.icon}</span>}
      </div>

      {(task.subject || task.labels.length > 0) && (
        <div className="flex flex-wrap gap-1 mb-2">
          {task.subject && (
            <span className="bg-primary/10 text-primary text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
              {task.subject}
            </span>
          )}
          {task.labels.map(label => (
            <span key={label.id} className={`${LABEL_COLORS[label.color]} text-[10px] font-semibold px-2 py-0.5 rounded-full text-primary-foreground`}>
              {label.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {task.priority !== 'none' && (
          <span className={`${PRIORITY_CONFIG[task.priority].className} text-[10px] font-bold px-1.5 py-0.5 rounded text-primary-foreground flex items-center gap-1`}>
            {task.priority === 'urgent' && <AlertTriangle className="w-3 h-3" />}
            {PRIORITY_CONFIG[task.priority].label}
          </span>
        )}
        {task.dueDate && (
          <span className={`flex items-center gap-1 text-[11px] ${isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
            <Calendar className="w-3 h-3" />
            {new Date(task.dueDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
            {task.dueTime && <span className="ml-0.5">{task.dueTime}</span>}
          </span>
        )}
        {totalItems > 0 && (
          <span className={`flex items-center gap-1 text-[11px] ${doneItems === totalItems ? 'text-label-green' : 'text-muted-foreground'}`}>
            <CheckSquare className="w-3 h-3" />
            {doneItems}/{totalItems}
          </span>
        )}
        
        {/* Assignment dropdown - only show if user can edit and onAssignUser is provided */}
        {canEdit && onAssignUser && (
          <div className="relative ml-auto">
            <button
              onClick={handleAssignmentClick}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted rounded px-1.5 py-0.5 transition-all"
              disabled={!canEdit}
            >
              <User className="w-3 h-3" />
              {assignedUser ? assignedUser.name : 'Assign'}
              <ChevronDown className={`w-3 h-3 transition-transform ${showAssignDropdown ? 'rotate-180' : ''}`} />
            </button>
            
            {showAssignDropdown && (
              <div 
                className="absolute z-10 mt-1 w-48 bg-popover border border-border rounded-lg shadow-lg p-2"
                style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2 px-2">
                  <span className="text-xs font-bold text-muted-foreground uppercase">Assign to</span>
                  <button 
                    onClick={() => setShowAssignDropdown(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                
                <div className="space-y-1 max-h-60 overflow-y-auto">
                  <button
                    onClick={() => assignToUser(null)}
                    className={`w-full text-left text-xs p-2 rounded flex items-center gap-2 ${
                      !assignedUser ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                      <X className="w-3 h-3" />
                    </div>
                    <span>Unassign</span>
                  </button>
                  
                  {assignableUsers.map(user => (
                    <button
                      key={user.id}
                      onClick={() => assignToUser(user.id)}
                      className={`w-full text-left text-xs p-2 rounded flex items-center gap-2 ${
                        assignedUser?.id === user.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                      }`}
                    >
                      {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.name} className="w-6 h-6 rounded-full" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span>{user.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Show assigned user when not in edit mode */}
        {(!canEdit || !onAssignUser) && assignedUser && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <User className="w-3 h-3" />
            <span>{assignedUser.name}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskCard;