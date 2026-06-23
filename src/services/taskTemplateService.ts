import type { TaskTemplate } from '@/types/board';

export async function fetchTemplates(): Promise<TaskTemplate[]> {
  const res = await fetch('/api/task-templates');
  if (!res.ok) throw new Error('Failed to fetch templates');
  const data = await res.json();
  return data.templates || [];
}

export async function createTemplate(data: { name: string; title: string; description: string; priority: string; duration: number; startDate?: string; startTime?: string; dueDate?: string; dueTime?: string; projectId?: number | null; columnId?: string; labels: any[]; subtasks: any[]; checklists: any[] }): Promise<TaskTemplate> {
  const res = await fetch('/api/task-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create template');
  return res.json();
}

export async function updateTemplate(id: number, data: Partial<{ name: string; title: string; description: string; priority: string; duration: number; startDate?: string; startTime?: string; dueDate?: string; dueTime?: string; projectId?: number | null; columnId?: string; labels: any[]; subtasks: any[]; checklists: any[] }>): Promise<TaskTemplate> {
  const res = await fetch(`/api/task-templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update template');
  return res.json();
}

export async function deleteTemplate(id: number): Promise<void> {
  const res = await fetch(`/api/task-templates/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete template');
}
