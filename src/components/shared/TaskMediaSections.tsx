import React, { useRef, useState } from 'react';
import { Paperclip, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { Attachment, Task } from '@/types/board';
import DraggableImageGrid from '@/components/shared/DraggableImageGrid';
import FreeAttachmentList from '@/components/shared/FreeAttachmentList';
import PremiumGate from '@/components/shared/PremiumGate';
import { getMediaLimit, isMaxPlan } from '@/lib/mediaLimits';
import { fileToDataUrl } from '@/lib/fileDataUrl';
const imageToDataUrl = fileToDataUrl;
import { readTaskSections, writeTaskSections } from '@/lib/taskSectionState';

interface TaskMediaSectionsProps {
  task: Task;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  tier: string | undefined;
  isPremium: boolean;
}

export const TaskMediaSections: React.FC<TaskMediaSectionsProps> = ({ task, onUpdateTask, tier, isPremium }) => {
  const mediaLimit = getMediaLimit(tier);
  const maxPlan = isMaxPlan(tier);
  const taskRef = useRef(task);
  taskRef.current = task;
  const [attachmentsCollapsed, setAttachmentsCollapsed] = useState(() => readTaskSections(task.id).attachments ?? false);
  const [imagesCollapsed, setImagesCollapsed] = useState(() => readTaskSections(task.id).images ?? false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [previewDisabled] = useState(false);

  React.useEffect(() => {
    const prev = readTaskSections(task.id);
    writeTaskSections(task.id, { ...prev, attachments: attachmentsCollapsed, images: imagesCollapsed });
  }, [task.id, attachmentsCollapsed, imagesCollapsed]);

  // Keep server attachments in sync without blocking render.
  // Only runs when the section is opened to avoid slow page loads.
  const syncedRef = useRef<string | null>(null);
  const syncAttachments = React.useCallback(async () => {
    if (syncedRef.current === task.id) return;
    if (String(task.id).startsWith('template-edit-')) return;
    syncedRef.current = task.id;
    try {
      const res = await fetch(`/api/attachments/${task.id}`, { credentials: 'include' });
      if (!res.ok) return;
      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) return;
      const cur = taskRef.current;
      const known = new Set([...(cur.images || []), ...(cur.attachments || [])].map(a => String(a.id)));
      const missing = rows.filter((r: any) => !known.has(String(r.id)));
      if (missing.length === 0) return;
      const missingImages = missing.filter((r: any) => (r.fileType || '').startsWith('image/'));
      const missingFiles = missing.filter((r: any) => !(r.fileType || '').startsWith('image/'));
      const updates: Partial<Task> = {};
      if (missingImages.length > 0) updates.images = [...(cur.images || []), ...missingImages];
      if (missingFiles.length > 0) updates.attachments = [...(cur.attachments || []), ...missingFiles];
      if (Object.keys(updates).length > 0) onUpdateTask(task.id, updates);
    } catch { /* offline - keep local state */ }
  }, [task.id, onUpdateTask]);

  React.useEffect(() => {
    if (!attachmentsCollapsed || !imagesCollapsed) {
      // Sync lazily in background without delaying first paint.
      const t = setTimeout(() => { syncAttachments(); }, 800);
      return () => clearTimeout(t);
    }
  }, [attachmentsCollapsed, imagesCollapsed, syncAttachments]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    if (picked.length === 0) return;
    const current = taskRef.current.attachments?.length || 0;
    const remaining = mediaLimit - current;
    if (remaining <= 0) { e.currentTarget.value = ''; return; }
    const files = picked.slice(0, remaining);
    setUploadingFiles(true);
    const uploaded: Attachment[] = [];
    try {
      for (const file of files) {
        let saved = false;
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch(`/api/attachments/${task.id}`, { method: 'POST', credentials: 'include', body: formData });
          if (res.ok) {
            uploaded.push(await res.json());
            saved = true;
          }
        } catch { /* fall through */ }
        if (!saved) {
          try {
            uploaded.push({ id: crypto.randomUUID(), taskId: task.id, fileName: file.name, fileType: file.type || 'application/octet-stream', fileSize: file.size, fileUrl: await fileToDataUrl(file), createdAt: new Date().toISOString() });
          } catch { /* skip unreadable */ }
        }
      }
      if (uploaded.length > 0) onUpdateTask(task.id, { attachments: [...(taskRef.current.attachments || []), ...uploaded] });
    } finally {
      setUploadingFiles(false);
      e.currentTarget.value = '';
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const picked = Array.from(e.target.files);
    e.currentTarget.value = '';
    if (picked.length === 0) return;
    const current = taskRef.current.images?.length || 0;
    const remaining = mediaLimit - current;
    if (remaining <= 0) return;
    const files = picked.slice(0, remaining);
    setUploadingImages(true);
    try {
      const newImages: Attachment[] = [];
      for (const file of files) {
        const isHeic = /\.heic$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';
        let saved = false;
        if (!isHeic) {
          try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch(`/api/attachments/${String(task.id)}`, { method: 'POST', credentials: 'include', body: formData });
            if (res.ok) {
              newImages.push(await res.json());
              saved = true;
            }
          } catch { /* fall through */ }
        }
        if (!saved) {
          try {
            const fileUrl = await imageToDataUrl(file);
            const fileType = /\.heic$/i.test(file.name) ? 'image/jpeg' : (file.type || 'image/*');
            newImages.push({ id: crypto.randomUUID(), taskId: String(task.id), fileName: file.name, fileType, fileSize: file.size, fileUrl, createdAt: new Date().toISOString() });
          } catch { /* skip */ }
        }
      }
      if (newImages.length > 0) onUpdateTask(task.id, { images: [...(taskRef.current.images || []), ...newImages] });
    } finally {
      setUploadingImages(false);
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    onUpdateTask(task.id, { attachments: (taskRef.current.attachments || []).filter(item => String(item.id) !== String(attachmentId)) });
    if (/^\d+$/.test(String(attachmentId))) {
      try { await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE', credentials: 'include' }); } catch {}
    }
  };

  const filesCount = task.attachments?.length || 0;
  const imagesCount = task.images?.length || 0;
  const filesLimitReached = filesCount >= mediaLimit;
  const imagesLimitReached = imagesCount >= mediaLimit;

  return (
    <>
      {/* Files Section */}
      <div className="rounded-2xl border border-border bg-muted/20">
        <button onClick={() => setAttachmentsCollapsed(prev => !prev)} className="w-full flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Files</h3>
            {filesCount > 0 && <span className="text-xs text-muted-foreground">({filesCount})</span>}
          </div>
          {attachmentsCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>
        {!attachmentsCollapsed && (
          <div className="border-t border-border/60 px-4 py-3 space-y-3">
            {!isPremium ? (
              <div className="border border-dashed border-border rounded-xl">
                <PremiumGate title="File Attachments" description="Attach files, images, and documents directly to your tasks." icon={<Paperclip className="w-6 h-6 text-primary" />} />
              </div>
            ) : (
              <>
                {filesLimitReached ? (
                  <p className="text-xs text-muted-foreground text-center py-2">{maxPlan ? `Limit reached (${mediaLimit} max)` : 'Limit reached — upgrade for more'}</p>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                    <div className="flex flex-col items-center justify-center py-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <Paperclip className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-foreground">{uploadingFiles ? 'Uploading...' : 'Click to upload or drag and drop'}</p>
                      <p className="text-xs text-muted-foreground mt-1">PDF, Images, Documents (max 10MB) · {filesCount}/{mediaLimit}</p>
                    </div>
                    <input type="file" multiple onChange={handleFileUpload} disabled={uploadingFiles} className="hidden" />
                  </label>
                )}
                {(task.attachments || []).length > 0 && (
                  <FreeAttachmentList attachments={task.attachments || []} onReorder={(newItems) => onUpdateTask(task.id, { attachments: newItems })} onDelete={deleteAttachment} taskId={task.id} taskTitle={task.title} />
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Images Section */}
      <div className="rounded-2xl border border-border bg-muted/20">
        <button onClick={() => setImagesCollapsed(prev => !prev)} className="w-full flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Images</h3>
            {imagesCount > 0 && <span className="text-xs text-muted-foreground">({imagesCount})</span>}
          </div>
          {imagesCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </button>
        {!imagesCollapsed && (
          <div className="border-t border-border/60 px-4 py-3 space-y-3">
            {!isPremium ? (
              <div className="border border-dashed border-border rounded-xl">
                <PremiumGate title="Image Attachments" description="Upload images directly to your tasks." icon={<ImageIcon className="w-6 h-6 text-primary" />} />
              </div>
            ) : (
              <>
                {imagesLimitReached ? (
                  <p className="text-xs text-muted-foreground text-center py-2">{maxPlan ? `Limit reached (${mediaLimit} max)` : 'Limit reached — upgrade for more'}</p>
                ) : (
                  <label className="flex flex-col items-center justify-center w-full min-h-[100px] border-2 border-dashed border-border rounded-xl bg-muted/20 hover:bg-muted/40 hover:border-primary/50 transition-all cursor-pointer">
                    <div className="flex flex-col items-center justify-center py-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                        <ImageIcon className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-sm font-medium text-foreground">{uploadingImages ? 'Uploading...' : 'Click to upload'}</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG, GIF (max 10MB) · {imagesCount}/{mediaLimit}</p>
                    </div>
                    <input type="file" multiple accept="image/*,.heic,.heif" onChange={handleImageUpload} disabled={uploadingImages || previewDisabled} className="hidden" />
                  </label>
                )}
                {task.images && task.images.length > 0 && (
                  <DraggableImageGrid
                    images={task.images}
                    onReorder={(newImages) => onUpdateTask(task.id, { images: newImages })}
                    onRemove={(id) => { onUpdateTask(task.id, { images: (taskRef.current.images || []).filter(x => String(x.id) !== String(id)) }); if (/^\d+$/.test(String(id))) { fetch(`/api/attachments/${id}`, { method: 'DELETE', credentials: 'include' }).catch(() => {}); } }}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default TaskMediaSections;
