export interface SharedTag {
  id: number;
  name: string;
  color: string;
}

let cached: { at: number; tags: SharedTag[] } | null = null;
let inflight: Promise<SharedTag[]> | null = null;

function invalidateTagCache() {
  cached = null;
}

export async function fetchTags(): Promise<SharedTag[]> {
  // Dedupe: BoardColumn mounts one instance per column and each calls
  // fetchTags — share a single in-flight request + short cache instead
  // of firing N identical requests on every Projects page load.
  const now = Date.now();
  if (cached && now - cached.at < 30000) return cached.tags;
  if (inflight) return inflight;
  inflight = (async () => {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch('/api/tags', { credentials: 'include', signal: ctrl.signal });
      if (!res.ok) throw new Error('Failed to fetch tags');
      const data = await res.json();
      cached = { at: Date.now(), tags: data.tags || [] };
      return cached.tags;
    } finally {
      clearTimeout(tid);
    }
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export async function createTag(data: { name: string; color?: string }): Promise<SharedTag> {
  const res = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create tag');
  invalidateTagCache();
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
  invalidateTagCache();
  return res.json();
}

export async function deleteTag(id: number): Promise<void> {
  const res = await fetch(`/api/tags/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Failed to delete tag');
  invalidateTagCache();
}
