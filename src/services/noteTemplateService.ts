export interface NoteTemplate {
  id: number;
  userId: number;
  name: string;
  title: string;
  content: string;
  color: string;
  projectId?: number | null;
  columnId?: string | null;
  tags: { id: number; name: string; color: string }[];
}

export async function fetchNoteTemplates(): Promise<NoteTemplate[]> {
  const res = await fetch('/api/note-templates');
  if (!res.ok) throw new Error('Failed to fetch note templates');
  const data = await res.json();
  return data.templates || [];
}

export async function createNoteTemplate(data: {
  name: string; title: string; content: string; color: string;
  projectId?: number | null; columnId?: string | null; tags: { id: number; name: string; color: string }[];
}): Promise<NoteTemplate> {
  const res = await fetch('/api/note-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create note template');
  return res.json();
}

export async function updateNoteTemplate(id: number, data: Partial<{
  name: string; title: string; content: string; color: string;
  projectId?: number | null; columnId?: string | null; tags: { id: number; name: string; color: string }[];
}>): Promise<NoteTemplate> {
  const res = await fetch(`/api/note-templates/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update note template');
  return res.json();
}

export async function deleteNoteTemplate(id: number): Promise<void> {
  const res = await fetch(`/api/note-templates/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete note template');
}
