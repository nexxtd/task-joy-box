import { Priority, TaskStatus, Label, Checklist } from './board';

export interface TaskTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  startDate?: string;
  startTime?: string;
  dueDate?: string;
  dueTime?: string;
  duration?: number;
  subject?: string;
  color?: string;
  icon?: string;
  recurrencePattern?: 'daily' | 'weekly' | 'monthly' | null;
  subtasks: Array<{ text: string; durationMinutes: number }>;
  checklists: Checklist[];
  labels: Label[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateDraftData {
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  startDate?: string;
  startTime?: string;
  dueDate?: string;
  dueTime?: string;
  duration?: number;
  subject?: string;
  color?: string;
  icon?: string;
  recurrencePattern?: 'daily' | 'weekly' | 'monthly' | null;
  subtasks: Array<{ text: string; durationMinutes: number }>;
  checklists: Checklist[];
  labels: Label[];
}
