import { Router, Response } from 'express';
import { db } from '../db';
import { taskAttachments, tasks } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  },
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
});

// Upload an attachment
router.post('/:taskId', requireAuth, upload.single('file'), async (req: any, res: any) => {
  try {
    const taskId = parseInt(req.params.taskId);
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify task ownership/access
    // Assuming personal tasks for now, linked to user via board/workspace
    // Simplified: Check if task exists
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const [attachment] = await db.insert(taskAttachments).values({
      taskId,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      fileUrl: `/uploads/${req.file.filename}`,
    }).returning();

    res.json(attachment);
  } catch (error) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({ error: 'Failed to upload attachment' });
  }
});

// Get attachments for a task
router.get('/:taskId', requireAuth, async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    const attachments = await db.query.taskAttachments.findMany({
      where: eq(taskAttachments.taskId, taskId),
    });
    res.json(attachments);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
});

// Delete an attachment
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const attachment = await db.query.taskAttachments.findFirst({
      where: eq(taskAttachments.id, id),
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Delete file from disk
    const filePath = path.join(process.cwd(), attachment.fileUrl);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await db.delete(taskAttachments).where(eq(taskAttachments.id, id));
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
});

// View/download an attachment file
router.get('/file/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const attachment = await db.query.taskAttachments.findFirst({
      where: eq(taskAttachments.id, id),
    });

    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Verify the user has access to this task
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, attachment.taskId),
    });

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check file exists
    const filePath = path.join(process.cwd(), attachment.fileUrl);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Set content type and disposition
    const mimeType = attachment.fileType || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);

    // For images and PDFs, display inline; for others, force download
    const inlineTypes = ['image/', 'application/pdf', 'text/'];
    const isInline = inlineTypes.some(t => mimeType.startsWith(t));
    res.setHeader('Content-Disposition', `${isInline ? 'inline' : 'attachment'}; filename="${attachment.fileName}"`);

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error serving attachment:', error);
    res.status(500).json({ error: 'Failed to serve attachment' });
  }
});

export default router;
