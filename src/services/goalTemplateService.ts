import type { Attachment, TaskTemplate } from '@/types/board';
export type TemplatePayload = { name: string; title: string; description: string; priority: string; duration: number; startDate?: string; startTime?: string; dueDate?: string; dueTime?: string; projectId?: number | null; columnId?: string; labels: any[]; subtasks: any[]; checklists: any[]; images?: Attachment[]; attachments?: Attachment[] };
export async function fetchGoalTemplates(): Promise<TaskTemplate[]> {
  const res = await fetch('/api/goal-templates', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch templates');
  const data = await res.json();
  return data.templates || [];
}
export async function createGoalTemplate(data: TemplatePayload): Promise<TaskTemplate> {
  const res = await fetch('/api/goal-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to create template');
  return res.json();
}
export async function updateGoalTemplate(id: number, data: Partial<TemplatePayload>): Promise<TaskTemplate> {
  const res = await fetch(`/api/goal-templates/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(data) });
  if (!res.ok) throw new Error('Failed to update template');
  return res.json();
}
export async function deleteGoalTemplate(id: number): Promise<void> {
  const res = await fetch(`/api/goal-templates/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error('Failed to delete template');
}
