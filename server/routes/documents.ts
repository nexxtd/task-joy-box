import { Router, Response } from 'express';
import { db } from '../db.js';
import { documents } from '../../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getSettingNumber } from '../lib/settings.js';

const router = Router();

// Word documents and PDFs are the only file types the Document Editor supports.
const ALLOWED_MIMES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
];

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

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('FILE_NOT_COMPATIBLE'));
    }
  },
});

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

function resolveUploadPath(fileUrl: string): string {
  const base = process.env.VERCEL === '1'
    ? path.join('/tmp', 'uploads')
    : path.join(process.cwd(), 'uploads');
  return path.join(base, path.basename(fileUrl));
}

// List the user's documents (grouped client-side by taskId/taskTitle).
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const rows = await db.select().from(documents)
      .where(eq(documents.userId, req.userId!))
      .orderBy(desc(documents.updatedAt));
    res.json(rows);
  } catch (error) {
    console.error('Error fetching documents');
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

// Upload a Word/PDF file into the Document Editor. Filed under "My Documents"
// unless a taskId field is supplied (then it's grouped under that task).
router.post('/', requireAuth, (req: any, res: any, next: any) => {
  upload.single('file')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'FILE_TOO_LARGE', message: 'Document exceeds the size limit' });
      }
      if (err.message === 'FILE_NOT_COMPATIBLE') {
        return res.status(415).json({ error: 'FILE_NOT_COMPATIBLE' });
      }
      return next(err);
    }
    handleUpload(req, res);
  });
});

async function handleUpload(req: any, res: any) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const maxMb = await getSettingNumber('max_attachment_mb', 25);
    if (req.file.size > Math.max(1, maxMb) * 1024 * 1024) {
      fs.unlink(req.file.path, () => {});
      return res.status(413).json({
        error: 'FILE_TOO_LARGE',
        message: `Document exceeds the ${maxMb} MB limit`,
        limitMb: maxMb,
      });
    }

    const originalName = sanitizeFilename(req.file.originalname);
    const baseTitle = originalName.replace(/\.(docx?|pdf)$/i, '') || 'Untitled document';
    const taskId = req.body.taskId ? String(req.body.taskId) : null;
    const taskTitle = req.body.taskTitle ? String(req.body.taskTitle).slice(0, 200) : null;

    const [doc] = await db.insert(documents).values({
      userId: req.userId!,
      taskId,
      taskTitle,
      title: baseTitle,
      content: '',
      fileName: originalName,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      fileUrl: `/uploads/${req.file.filename}`,
    }).returning();

    res.json(doc);
  } catch (error: any) {
    console.error('Error uploading document');
    const msg = error?.message === 'FILE_NOT_COMPATIBLE'
      ? 'FILE_NOT_COMPATIBLE'
      : 'Failed to upload document';
    const code = msg === 'FILE_NOT_COMPATIBLE' ? 415 : 500;
    res.status(code).json({ error: msg });
  }
}

// Adopt an existing task attachment into the Document Editor without copying
// the file (used when clicking a file on a task page to open it in the editor).
router.post('/adopt', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { taskId, taskTitle, fileName, fileType, fileSize, fileUrl } = req.body || {};
    if (!taskId || !fileName || !fileType || !fileSize || !fileUrl) {
      return res.status(400).json({ error: 'Missing document metadata' });
    }
    if (!ALLOWED_MIMES.includes(fileType)) {
      return res.status(415).json({ error: 'FILE_NOT_COMPATIBLE' });
    }

    // Idempotent: if a document already exists for this task + filename, return it.
    const existing = await db.select().from(documents)
      .where(and(
        eq(documents.userId, req.userId!),
        eq(documents.taskId, String(taskId)),
        eq(documents.fileName, sanitizeFilename(String(fileName))),
      )).limit(1);

    if (existing.length > 0) {
      return res.json(existing[0]);
    }

    const [doc] = await db.insert(documents).values({
      userId: req.userId!,
      taskId: String(taskId),
      taskTitle: taskTitle ? String(taskTitle).slice(0, 200) : null,
      title: sanitizeFilename(String(fileName)).replace(/\.(docx?|pdf)$/i, '') || 'Untitled document',
      content: '',
      fileName: sanitizeFilename(String(fileName)),
      fileType: String(fileType),
      fileSize: Number(fileSize),
      fileUrl: String(fileUrl),
    }).returning();

    res.json(doc);
  } catch (error) {
    console.error('Error adopting document:', error);
    res.status(500).json({ error: 'Failed to adopt document' });
  }
});

// Update title and/or rich-text content. Auto-save from the editor hits this.
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, id),
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (doc.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const values: { title?: string; content?: string } = {};
    if (typeof req.body.title === 'string') {
      values.title = req.body.title.trim().slice(0, 200) || 'Untitled document';
    }
    if (typeof req.body.content === 'string') {
      values.content = req.body.content;
    }
    if (Object.keys(values).length === 0) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const [updated] = await db.update(documents).set({
      ...values,
      updatedAt: new Date().toISOString(),
    }).where(eq(documents.id, id)).returning();

    res.json(updated);
  } catch (error) {
    console.error('Error updating document');
    res.status(500).json({ error: 'Failed to update document' });
  }
});

router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, id),
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (doc.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // /uploads/* paths resolve inside the uploads dir on both platforms.
    if (!doc.fileUrl.startsWith('/uploads/')) {
      await db.delete(documents).where(eq(documents.id, id));
      return res.json({ success: true });
    }

    // Adopted documents share the file with a task attachment — only unlink
    // files that this document owns (uploaded directly into the editor).
    const filePath = resolveUploadPath(doc.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await db.delete(documents).where(eq(documents.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document');
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// Stream the original uploaded file (download via the list/download button).
router.get('/file/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const doc = await db.query.documents.findFirst({
      where: eq(documents.id, id),
    });

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (doc.userId !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = resolveUploadPath(doc.fileUrl);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Type', doc.fileType || 'application/octet-stream');
    const safeFileName = sanitizeFilename(doc.fileName);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error serving document file');
    res.status(500).json({ error: 'Failed to serve document file' });
  }
});

export default router;