import { TaskTemplate } from '@/types/board';
import { Attachment } from '@/types/board';

export interface NoteTemplate extends TaskTemplate {}

export type TemplatePayload = { name: string; title: string; description: string; content?: string; priority: string; duration: number; startDate?: string; startTime?: string; dueDate?: string; dueTime?: string; projectId?: number | null; columnId?: string; labels: any[]; tags?: any[]; subtasks: any[]; checklists: any[]; images?: Attachment[]; attachments?: Attachment[]; color?: string };

export async function fetchNoteTemplates(): Promise<TaskTemplate[]> {
  const res = await fetch('/api/note-templates', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch note templates');
  const data = await res.json();
  return (data.templates || []).map((t: any) => ({
    ...t,
    description: t.description || t.content || '',
    content: t.content || t.description || '',
    labels: t.labels || t.tags || [],
    tags: t.tags || t.labels || [],
    subtasks: t.subtasks || [],
    checklists: t.checklists || [],
    images: t.images || [],
    attachments: t.attachments || [],
    priority: t.priority || 'medium',
    duration: t.duration || 0,
  }));
}

export async function createNoteTemplate(data: TemplatePayload): Promise<TaskTemplate> {
  const payload = {
    ...data,
    content: (data as any).content || data.description || '',
    description: data.description || (data as any).content || '',
    tags: (data as any).tags || data.labels || [],
    labels: data.labels || (data as any).tags || [],
  };
  const res = await fetch('/api/note-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create note template');
  const t = await res.json();
  return {
    ...t,
    description: t.description || t.content || '',
    content: t.content || t.description || '',
    labels: t.labels || t.tags || [],
    tags: t.tags || t.labels || [],
  } as TaskTemplate;
}

export async function updateNoteTemplate(id: number, data: Partial<TemplatePayload>): Promise<TaskTemplate> {
  const payload: any = { ...data };
  if (data.description !== undefined || (data as any).content !== undefined) {
    payload.content = (data as any).content ?? data.description;
    payload.description = data.description ?? (data as any).content;
  }
  if ((data as any).tags !== undefined || data.labels !== undefined) {
    payload.tags = (data as any).tags ?? data.labels;
    payload.labels = data.labels ?? (data as any).tags;
  }
  const res = await fetch(`/api/note-templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update note template');
  const t = await res.json();
  return {
    ...t,
    description: t.description || t.content || '',
    content: t.content || t.description || '',
    labels: t.labels || t.tags || [],
    tags: t.tags || t.labels || [],
  } as TaskTemplate;
}

export async function deleteNoteTemplate(id: number): Promise<void> {
  const res = await fetch(`/api/note-templates/${id}`, { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error('Failed to delete note template');
}
