export interface SharedTag {
  id: number;
  name: string;
  color: string;
}

export async function fetchTags(): Promise<SharedTag[]> {
  const res = await fetch('/api/tags', { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch tags');
  const data = await res.json();
  return data.tags || [];
}

export async function createTag(data: { name: string; color?: string }): Promise<SharedTag> {
  const res = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create tag');
  return res.json();
}

export async function updateTag(id: number, data: { name?: string; color?: string }): Promise<SharedTag> {
  const res = await fetch(`/api/tags/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update tag');
  return res.json();
}

export async function deleteTag(id: number): Promise<void> {
  const res = await fetch(`/api/tags/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete tag');
}
