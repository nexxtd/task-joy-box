export interface Task {
  id: string;
  title: string;
  description: string;
  status?: TaskStatus;
  priority: Priority;
  labels: Label[];
  checklists: Checklist[];
  subtasks: Subtask[];
  dueDate?: string;
  dueTime?: string;
  startTime?: string;
  duration?: number;
  sessionsNeeded?: number;
  subject?: string;
  projectId?: number | null;
  projectName?: string;
  color?: string;
  icon?: string;
  createdAt: string;
  updatedAt?: string;
  columnId: string;
  order: number;
  completed?: boolean;
  completedAt?: string;
  recurrencePattern?: 'daily' | 'weekly' | 'monthly' | null;
  nextOccurrence?: string | null;
  attachments?: Attachment[];
  comments?: TaskComment[];
  activityLog?: TaskActivity[];
  assignedTo?: {
    id: number;
    name: string;
    avatarUrl?: string;
  } | null;
}