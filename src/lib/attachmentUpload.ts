import type { Attachment } from '@/types/board';
import { fileToDataUrl } from '@/lib/fileDataUrl';

const isHeicFile = (file: File): boolean =>
  /\.heic$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';

/**
 * Upload multiple files or images concurrently to `/api/attachments/:taskId`,
 * falling back to local data-URL encoding if offline or unsupported (e.g. HEIC).
 */
export async function uploadTaskMediaBatch(
  taskId: string | number,
  files: File[],
  options: { kind: 'file' | 'image'; skipServerForHeic?: boolean } = { kind: 'file' }
): Promise<Attachment[]> {
  if (files.length === 0) return [];
  const taskIdStr = String(taskId);
  const results = await Promise.all(
    files.map(async (file): Promise<Attachment | null> => {
      const heic = isHeicFile(file);
      if (!(options.kind === 'image' && options.skipServerForHeic && heic)) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch(`/api/attachments/${taskIdStr}`, {
            method: 'POST',
            credentials: 'include',
            body: formData,
          });
          if (res.ok) {
            return (await res.json()) as Attachment;
          }
        } catch {
          // fall through to local data-URL fallback
        }
      }
      try {
        const fileUrl = await fileToDataUrl(file);
        const fileType =
          options.kind === 'image'
            ? heic
              ? 'image/jpeg'
              : file.type || 'image/*'
            : file.type || 'application/octet-stream';
        return {
          id: crypto.randomUUID(),
          taskId: taskIdStr,
          fileName: file.name,
          fileType,
          fileSize: file.size,
          fileUrl,
          createdAt: new Date().toISOString(),
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter((item): item is Attachment => Boolean(item));
}

/**
 * Convert a batch of draft image files to Attachment objects in parallel.
 */
export async function convertDraftImagesBatch(
  files: File[],
  options: { maxFileSizeBytes?: number; onOversize?: (file: File) => void; taskId?: string } = {}
): Promise<Attachment[]> {
  const valid = files.filter((file) => {
    if (options.maxFileSizeBytes && file.size > options.maxFileSizeBytes) {
      options.onOversize?.(file);
      return false;
    }
    return true;
  });
  if (valid.length === 0) return [];
  const results = await Promise.all(
    valid.map(async (file): Promise<Attachment | null> => {
      try {
        const fileUrl = await fileToDataUrl(file);
        const fileType = /\.heic$/i.test(file.name) ? 'image/jpeg' : file.type || 'image/*';
        return {
          id: crypto.randomUUID(),
          taskId: options.taskId ?? 'new',
          fileName: file.name,
          fileType,
          fileSize: file.size,
          fileUrl,
          createdAt: new Date().toISOString(),
        };
      } catch {
        return null;
      }
    })
  );
  return results.filter((item): item is Attachment => Boolean(item));
}

