export type Priority = 'urgent' | 'high' | 'medium' | 'low' | 'none';
export type TaskStatus = 'to_do' | 'in_progress' | 'review' | 'completed';
export type LabelColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';
export type ViewType = 'board' | 'list' | 'whiteboard' | 'calendar';

export interface Label {
  id: string;
  name: string;
  color: LabelColor;
}

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Subtask extends ChecklistItem {
  durationMinutes?: number;
  children?: Subtask[];
}

export interface Checklist {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export interface Attachment {
  id: string;
  taskId: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  fileUrl: string;
  createdAt: string;
}

export interface TaskComment {
  id: string;
  text: string;
  createdAt: string;
}

export interface TaskActivity {
  id: string;
  text: string;
  createdAt: string;
}

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
  startDate?: string;
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
  images?: Attachment[];
  comments?: TaskComment[];
  activityLog?: TaskActivity[];
  assignedToUserId?: number | null;
  assignedToUserName?: string;
}

export interface Column {
  id: string;
  title: string;
  order: number;
  color: string;
  icon?: string;
  projectId?: number | null;
}

export interface Board {
  id: string;
  title: string;
  columns: Column[];
  tasks: Task[];
}

export interface TaskTemplate {
  id: number;
  userId: number;
  name: string;
  title: string;
  description: string;
  priority: Priority;
  duration: number;
  startDate?: string;
  startTime?: string;
  dueDate?: string;
  dueTime?: string;
  projectId?: number | null;
  columnId?: string;
  labels: Label[];
  subtasks: Array<{ text: string; durationMinutes: number }>;
  checklists: Checklist[];
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_LABELS: Label[] = [];

export const PRIORITY_CONFIG: Record<Exclude<Priority, 'none'>, { label: string; className: string }> = {
  urgent: { label: 'Urgent', className: 'bg-priority-urgent' },
  high: { label: 'High', className: 'bg-priority-high' },
  medium: { label: 'Medium', className: 'bg-priority-medium' },
  low: { label: 'Low', className: 'bg-priority-low' },
};

export const LABEL_COLORS: Record<LabelColor, string> = {
  red: 'bg-label-red',
  orange: 'bg-label-orange',
  yellow: 'bg-label-yellow',
  green: 'bg-label-green',
  blue: 'bg-label-blue',
  purple: 'bg-label-purple',
  pink: 'bg-label-pink',
};

// Aliases for Notes and Goals Kanban Boards
export type Note = Task;
export type Goal = Task;
export type NoteStatus = TaskStatus;
export type GoalStatus = TaskStatus;
export type NoteTemplate = TaskTemplate;
export type GoalTemplate = TaskTemplate;
export type NoteActivity = TaskActivity;
export type GoalActivity = TaskActivity;
