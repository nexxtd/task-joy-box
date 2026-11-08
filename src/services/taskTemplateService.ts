import type { Attachment, TaskTemplate } from '@/types/board';

export type TemplatePayload = { name: string; title: string; description: string; priority: string; duration: number; startDate?: string; startTime?: string; dueDate?: string; dueTime?: string; projectId?: number | null; columnId?: string; labels: any[]; subtasks: any[]; checklists: any[]; images?: Attachment[]; attachments?: Attachment[]; isPublic?: boolean };

export async function fetchTemplates(): Promise<TaskTemplate[]> {
  const res = await fetch('/api/task-templates', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch templates');
  const data = await res.json();
  return data.templates || [];
}

export async function createTemplate(data: TemplatePayload): Promise<TaskTemplate> {
  const res = await fetch('/api/task-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create template');
  return res.json();
}

export async function updateTemplate(id: number, data: Partial<TemplatePayload>): Promise<TaskTemplate> {
  const res = await fetch(`/api/task-templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update template');
  return res.json();
}

/** Fetch a public template by its share code (task templates only). */
export async function fetchTemplateByCode(code: string): Promise<TaskTemplate> {
  const res = await fetch(`/api/task-templates/code/${encodeURIComponent(code.trim())}`, { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'No task template found for that code');
  return data;
}

export async function deleteTemplate(id: number): Promise<void> {
  const res = await fetch(`/api/task-templates/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error('Failed to delete template');
}
