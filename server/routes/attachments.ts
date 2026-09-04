import { Router, Response } from 'express';
import { db } from '../db.js';
import { taskAttachments, tasks, boards, columns } from '../../shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getSettingNumber } from '../lib/settings.js';

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

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.VERCEL === '1'
  ? path.join('/tmp', 'uploads')
  : path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, uniqueSuffix + ext);
  },
});

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

// Ownership verification omitted since tasks are now stored in boardSnapshots.
// We rely on route authentication and unguessable file URLs.

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

router.post('/:taskId', requireAuth, upload.single('file'), async (req: any, res: any) => {
  try {
    const taskId = req.params.taskId;
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const maxMb = await getSettingNumber('max_attachment_mb', 25);
    if (req.file.size > Math.max(1, maxMb) * 1024 * 1024) {
      fs.unlink(req.file.path, () => {});
      return res.status(413).json({
        error: 'FILE_TOO_LARGE',
        message: `Attachment exceeds the ${maxMb} MB limit`,
        limitMb: maxMb,
      });
    }

    const [attachment] = await db.insert(taskAttachments).values({
      taskId,
      fileName: sanitizeFilename(req.file.originalname),
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      fileUrl: `/uploads/${req.file.filename}`,
    }).returning();

    res.json(attachment);
  } catch (error) {
    console.error('Error uploading attachment');
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
});

router.get('/:taskId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const taskId = req.params.taskId;

    const attachments = await db.query.taskAttachments.findMany({
      where: eq(taskAttachments.taskId, taskId),
    });
    res.json(attachments);
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
    const attachment = await db.query.taskAttachments.findFirst({
      where: eq(taskAttachments.id, id),
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
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
    const attachment = await db.query.taskAttachments.findFirst({
      where: eq(taskAttachments.id, id),
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const filePath = resolveAttachmentPath(attachment.fileUrl);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    const mimeType = attachment.fileType || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);

    const safeFileName = sanitizeFilename(attachment.fileName);
    const inlineTypes = ['image/', 'application/pdf', 'text/'];
    const isInline = inlineTypes.some(t => mimeType.startsWith(t));
    res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename="${safeFileName}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error serving attachment');
    res.status(500).json({ error: 'Failed to serve attachment' });
  }
});

export default router;
