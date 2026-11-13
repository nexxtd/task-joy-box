import { Router, Response } from 'express';
import { db } from '../db.js';
import { taskAttachments, tasks, boards, columns } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getSettingNumber } from '../lib/settings.js';
import { SERVER_PLAN_LIMITS } from '../lib/tier.js';
import { resolveEffectiveUserPlan } from '../lib/orgLifecycle.js';

const router = Router();

const ALLOWED_MIMES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'text/plain', 'text/csv', 'text/markdown', 'text/x-markdown', 'text/html', 'application/xhtml+xml',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text', 'application/rtf', 'text/rtf', 'application/epub+zip',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'application/x-zip-compressed', 'application/octet-stream',
];

const SUPPORTED_ATTACHMENT_EXT = /\.(jpe?g|png|gif|webp|svg|pdf|csv|txt|md|html?|docx?|odt|rtf|epub|xlsx?|zip)$/i;

const storage = multer.memoryStorage();

// multer needs a static limit at load time; use a generous sandbag here and
// enforce the configured max_attachment_mb setting inside the route handler.
const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype) || SUPPORTED_ATTACHMENT_EXT.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  },
});

// Attachments are scoped to the owning user. task_attachments.user_id is set
// on upload; legacy rows with NULL fall back to a task -> board ownership check.
async function taskBelongsToUser(taskIdText: string, userId: number): Promise<boolean> {
  const numericId = parseInt(taskIdText, 10);
  if (!Number.isFinite(numericId)) return true; // snapshot-based task id, no DB row to check
  const [task] = await db.select({ boardId: tasks.boardId }).from(tasks).where(eq(tasks.id, numericId)).limit(1);
  if (!task) return true; // snapshot task, ownership enforced via attachment.user_id
  const [board] = await db.select({ userId: boards.userId }).from(boards).where(eq(boards.id, task.boardId)).limit(1);
  return board?.userId === userId;
}

async function canAccessAttachment(attachment: typeof taskAttachments.$inferSelect, userId: number): Promise<boolean> {
  if ((attachment as any).userId != null) return (attachment as any).userId === userId;
  return taskBelongsToUser(attachment.taskId, userId);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

router.post('/:taskId', requireAuth, upload.single('file'), async (req: any, res: any) => {
  try {
    const taskId = String(req.params.taskId);
    const userId = (req as any).userId as number;
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (!(await taskBelongsToUser(taskId, userId))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const plan = await resolveEffectiveUserPlan(userId);
    if (plan.tier === 'free') {
      return res.status(403).json({
        error: 'UPGRADE_REQUIRED',
        message: 'Uploading files and images requires a Premium or Pro plan.',
      });
    }

    const tierMaxBytes = SERVER_PLAN_LIMITS.taskMedia.maxFileSizeBytes[plan.tier];
    const configuredMb = await getSettingNumber('max_attachment_mb', 25);
    const effectiveMaxBytes = Math.min(tierMaxBytes, Math.max(1, configuredMb) * 1024 * 1024);
    if (req.file.size > effectiveMaxBytes) {
      const limitMb = Math.round((effectiveMaxBytes / (1024 * 1024)) * 10) / 10;
      return res.status(413).json({
        error: 'FILE_TOO_LARGE',
        message: `Attachment exceeds the ${limitMb} MB limit for your ${plan.tier} plan`,
        limitMb,
      });
    }

    const maxPerKind = SERVER_PLAN_LIMITS.taskMedia.maxPerTask[plan.tier];
    if (Number.isFinite(maxPerKind)) {
      const isImage = req.file.mimetype.startsWith('image/');
      const existing = await db
        .select({ id: taskAttachments.id, fileType: taskAttachments.fileType, userId: taskAttachments.userId })
        .from(taskAttachments)
        .where(and(eq(taskAttachments.taskId, taskId), eq(taskAttachments.archived, false)));
      const ownedExisting = existing.filter((a) => a.userId == null || a.userId === userId);
      const sameKindCount = ownedExisting.filter((a) => String(a.fileType || '').startsWith('image/') === isImage).length;
      if (sameKindCount >= maxPerKind) {
        return res.status(403).json({
          error: 'LIMIT_REACHED',
          message: `Limit reached (${maxPerKind} ${isImage ? 'images' : 'files'} per item on ${plan.tier} plan).`,
          limit: maxPerKind,
        });
      }
    }

    // Persist bytes in Postgres (file_data) so images survive restarts.
    // Disk in uploads/ is ephemeral on Render/Vercel and caused white
    // images after refresh. Write disk backup asynchronously so upload response is fast.
    const fileData = req.file.buffer.toString('base64');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(req.file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    const storedFileName = uniqueSuffix + ext;
    const uploadDir = process.env.VERCEL === '1'
      ? path.join('/tmp', 'uploads')
      : path.join(process.cwd(), 'uploads');
    void fs.promises.mkdir(uploadDir, { recursive: true })
      .then(() => fs.promises.writeFile(path.join(uploadDir, storedFileName), req.file.buffer))
      .catch(() => {});

    let attachment: typeof taskAttachments.$inferSelect;
    try {
      [attachment] = await db.insert(taskAttachments).values({
        userId,
        taskId,
        fileName: sanitizeFilename(req.file.originalname),
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        fileUrl: `/uploads/${storedFileName}`,
        fileData,
      } as any).returning();
    } catch (e: any) {
      // Column file_data may not exist yet (migration pending) — retry
      // without it so uploads keep working; images then fall back to disk.
      if (e?.message && /file_data|column/i.test(e.message)) {
        [attachment] = await db.insert(taskAttachments).values({
          userId,
          taskId,
          fileName: sanitizeFilename(req.file.originalname),
          fileType: req.file.mimetype,
          fileSize: req.file.size,
          fileUrl: `/uploads/${storedFileName}`,
        }).returning();
      } else {
        throw e;
      }
    }

    res.json(attachment);
  } catch (error) {
    console.error('Error uploading attachment');
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
});

router.get('/:taskId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = String(req.params.taskId);
    const userId = req.userId!;
    if (!(await taskBelongsToUser(taskId, userId))) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const plan = await resolveEffectiveUserPlan(userId);
    const rows = await db
      .select({
        id: taskAttachments.id,
        userId: taskAttachments.userId,
        taskId: taskAttachments.taskId,
        fileName: taskAttachments.fileName,
        fileType: taskAttachments.fileType,
        fileSize: taskAttachments.fileSize,
        fileUrl: taskAttachments.fileUrl,
        archived: taskAttachments.archived,
        archivedAt: taskAttachments.archivedAt,
        createdAt: taskAttachments.createdAt,
      })
      .from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId));
    res.json(
      rows
        .filter((a) => a.userId == null || a.userId === userId)
        .map((a) => ({ ...a, locked: Boolean(a.archived || plan.tier === 'free') }))
    );
  } catch (error) {
    console.error('Error fetching attachments');
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

function resolveAttachmentPath(fileUrl: string): string {
  const base = process.env.VERCEL === '1' ? path.join('/tmp', 'uploads') : path.join(process.cwd(), 'uploads');
  return path.join(base, path.basename(fileUrl));
}

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [attachment] = await db.select().from(taskAttachments).where(eq(taskAttachments.id, id)).limit(1);

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    if (!(await canAccessAttachment(attachment, req.userId!))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = resolveAttachmentPath(attachment.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await db.delete(taskAttachments).where(eq(taskAttachments.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting attachment');
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

router.get('/file/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const [attachment] = await db.select().from(taskAttachments).where(eq(taskAttachments.id, id)).limit(1);

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }
    if (!(await canAccessAttachment(attachment, req.userId!))) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = resolveAttachmentPath(attachment.fileUrl);
    // DB copy (file_data) is the source of truth — survives restarts and
    // ephemeral disks. Fall back to disk for legacy rows.
    const storedData = (attachment as any).fileData as string | null | undefined;
    const mimeType = attachment.fileType || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);

    const safeFileName = sanitizeFilename(attachment.fileName);
    const inlineTypes = ['image/', 'application/pdf', 'text/'];
    const isInline = inlineTypes.some(t => mimeType.startsWith(t));
    res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename="${safeFileName}"`);

    if (storedData) {
      try {
        const buf = Buffer.from(storedData, 'base64');
        res.setHeader('Content-Length', buf.length);
        res.setHeader('Cache-Control', 'private, max-age=604800');
        return res.end(buf);
      } catch { /* fall through to disk */ }
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error serving attachment');
    res.status(500).json({ error: 'Failed to serve attachment' });
  }
});

export default router;
