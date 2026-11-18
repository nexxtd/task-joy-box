import React from 'react';
import { UserCheck, Users } from 'lucide-react';
import { Task, AssignedMemberRef } from '@/types/board';
import { useAuth } from '@/context/AuthContext';

export function getTaskAssignees(task: Partial<Task>): AssignedMemberRef[] {
  const byId = new Map<number, AssignedMemberRef>();
  if (Array.isArray(task.assignedToUsers)) {
    for (const u of task.assignedToUsers) {
      if (u && typeof u.id === 'number' && u.name) {
        byId.set(u.id, { id: u.id, name: u.name });
      }
    }
  }
  if (Array.isArray(task.assignedToUserIds)) {
    for (const uid of task.assignedToUserIds) {
      if (typeof uid === 'number' && !byId.has(uid)) {
        const name = uid === task.assignedToUserId && task.assignedToUserName
          ? task.assignedToUserName
          : `User #${uid}`;
        byId.set(uid, { id: uid, name });
      }
    }
  }
  if (typeof task.assignedToUserId === 'number' && !byId.has(task.assignedToUserId)) {
    byId.set(task.assignedToUserId, {
      id: task.assignedToUserId,
      name: task.assignedToUserName || `User #${task.assignedToUserId}`,
    });
  }
  return Array.from(byId.values());
}

interface AssignedBadgeProps {
  task: Partial<Task>;
  currentUserId?: number | null;
  compact?: boolean;
}

/** Displays a highlighted assignee indicator next to dropdown chevrons across Task & Note views. */
export const AssignedBadge: React.FC<AssignedBadgeProps> = ({
  task,
  currentUserId,
  compact = true,
}) => {
  const { user } = useAuth();
  const effectiveUserId = currentUserId !== undefined ? currentUserId : user?.id;
  const assignees = getTaskAssignees(task);
  if (assignees.length === 0) return null;

  const isMine = effectiveUserId != null && assignees.some(a => a.id === effectiveUserId);
  const labelText = assignees
    .map(a => (effectiveUserId != null && a.id === effectiveUserId ? `${a.name} (You)` : a.name))
    .join(', ');

  const initials = assignees.slice(0, 2).map(a => a.name.trim().slice(0, 1).toUpperCase()).join('');

  return (
    <span
      title={`Assigned to: ${labelText}`}
      aria-label={`Assigned to ${labelText}`}
      onClick={e => e.stopPropagation()}
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold flex-shrink-0 transition-all ${
        isMine
          ? 'bg-primary/15 border-primary/40 text-primary shadow-xs ring-1 ring-primary/20'
          : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400'
      }`}
    >
      {isMine ? <UserCheck className="w-3 h-3" /> : <Users className="w-3 h-3" />}
      {!compact || assignees.length === 1 ? (
        <span className="max-w-[64px] truncate">
          {isMine && assignees.length === 1
            ? 'You'
            : assignees.length === 1
              ? assignees[0].name.split(' ')[0]
              : `${initials} +${assignees.length - 1}`}
        </span>
      ) : (
        <span>{assignees.length}</span>
      )}
    </span>
  );
};
