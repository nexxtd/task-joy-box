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
}

export interface Column {
  id: string;
  title: string;
  order: number;
  color: string;
  icon?: string;
}

export interface Board {
  id: string;
  title: string;
  columns: Column[];
  tasks: Task[];
}

export const DEFAULT_LABELS: Label[] = [
  { id: 'l1', name: 'Bug', color: 'red' },
  { id: 'l2', name: 'Feature', color: 'blue' },
  { id: 'l3', name: 'Urgent', color: 'orange' },
  { id: 'l4', name: 'Design', color: 'purple' },
  { id: 'l5', name: 'Documentation', color: 'green' },
  { id: 'l6', name: 'Enhancement', color: 'yellow' },
  { id: 'l7', name: 'Question', color: 'pink' },
];

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
