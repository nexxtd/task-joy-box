import { Router, Response } from 'express';
import { db } from '../db.js';
import { documents } from '../../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getSettingNumber } from '../lib/settings.js';
import { extractDocumentText } from '../lib/extract-doc-text.js';

const router = Router();

// Expanded list of word-processing MIME types
const ALLOWED_MIMES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/rtf',
  'text/rtf',
  'text/plain',
  'text/markdown',
  'text/x-markdown',
  'text/html',
  'application/xhtml+xml',
  'application/pdf',
  'application/epub+zip',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
];

const SUPPORTED_EXT_REGEX = /\.(docx?|odt|rtf|txt|md|html?|pdf|epub)$/i;

function isSupportedDoc(mimeType: string, fileName?: string): boolean {
  if (SUPPORTED_EXT_REGEX.test(fileName || '')) return true;
  if (ALLOWED_MIMES.includes(mimeType)) return true;
  return false;
}

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
    if (isSupportedDoc(file.mimetype, file.originalname)) {
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

// Create a new blank document
router.post('/new', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const title = (req.body?.title || 'Untitled document').trim().slice(0, 200);
    const initialContent = req.body?.content || '';
    const taskId = req.body?.taskId ? String(req.body.taskId) : null;
    const taskTitle = req.body?.taskTitle ? String(req.body.taskTitle).slice(0, 200) : null;

    const [doc] = await db.insert(documents).values({
      userId: req.userId!,
      taskId,
      taskTitle,
      title: title || 'Untitled document',
      content: initialContent,
      fileName: `${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'document'}.docx`,
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: 0,
      fileUrl: '',
    }).returning();

    res.json(doc);
  } catch (error) {
    console.error('Error creating blank document:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

// Upload a document file into the Document Editor. Filed under "My Documents"
// unless a taskId field is supplied (then it's grouped under that task).
router.post('/', requireAuth, (req: any, res: any, next: any) => {
  // If JSON request to create blank document without multipart upload
  if (req.headers['content-type']?.includes('application/json') || req.body?.createBlank) {
    return handleBlankCreate(req, res);
  }
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

async function handleBlankCreate(req: any, res: any) {
  try {
    const title = (req.body?.title || 'Untitled document').trim().slice(0, 200);
    const [doc] = await db.insert(documents).values({
      userId: req.userId!,
      taskId: req.body?.taskId ? String(req.body.taskId) : null,
      taskTitle: req.body?.taskTitle ? String(req.body.taskTitle).slice(0, 200) : null,
      title: title || 'Untitled document',
      content: req.body?.content || '',
      fileName: `${title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'document'}.docx`,
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileSize: 0,
      fileUrl: '',
    }).returning();
    res.json(doc);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create document' });
  }
}

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
    const baseTitle = originalName.replace(/\.(docx?|odt|rtf|txt|md|html?|pdf|epub)$/i, '') || 'Untitled document';
    const taskId = req.body.taskId ? String(req.body.taskId) : null;
    const taskTitle = req.body.taskTitle ? String(req.body.taskTitle).slice(0, 200) : null;
    const content = await extractDocumentText(req.file.path, req.file.mimetype, req.file.originalname);

    const [doc] = await db.insert(documents).values({
      userId: req.userId!,
      taskId,
      taskTitle,
      title: baseTitle,
      content,
      fileName: originalName,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      fileUrl: `/uploads/${req.file.filename}`,
    }).returning();

    res.json(doc);
  } catch (error: any) {
    console.error('Error uploading document:', error);
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
    if (!taskId || !fileName || !fileType || !fileUrl) {
      return res.status(400).json({ error: 'Missing document metadata' });
    }
    if (!isSupportedDoc(String(fileType), String(fileName))) {
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
      // If content is empty in existing document but file exists, try re-extracting
      if (!existing[0].content && existing[0].fileUrl) {
        const adoptedPath = resolveUploadPath(existing[0].fileUrl);
        if (fs.existsSync(adoptedPath)) {
          const freshContent = await extractDocumentText(adoptedPath, String(fileType), String(fileName));
          if (freshContent) {
            const [updated] = await db.update(documents)
              .set({ content: freshContent, updatedAt: new Date().toISOString() })
              .where(eq(documents.id, existing[0].id))
              .returning();
            return res.json(updated);
          }
        }
      }
      return res.json(existing[0]);
    }

    // Task attachment files live in the same uploads dir — pull their text
    // through too when the file is readable from this instance.
    const adoptedFilePath = resolveUploadPath(String(fileUrl));
    const content = fs.existsSync(adoptedFilePath)
      ? await extractDocumentText(adoptedFilePath, String(fileType), String(fileName))
      : '';

    const [doc] = await db.insert(documents).values({
      userId: req.userId!,
      taskId: String(taskId),
      taskTitle: taskTitle ? String(taskTitle).slice(0, 200) : null,
      title: sanitizeFilename(String(fileName)).replace(/\.(docx?|odt|rtf|txt|md|html?|pdf|epub)$/i, '') || 'Untitled document',
      content,
      fileName: sanitizeFilename(String(fileName)),
      fileType: String(fileType),
      fileSize: Number(fileSize || 0),
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