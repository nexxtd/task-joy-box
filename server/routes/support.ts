import { Router, Response } from 'express';
import { db } from '../db.js';
import { supportTickets, ticketMessages, users } from '../../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getSettingNumber } from '../lib/settings.js';

const router = Router();
router.use(requireAuth);

const ALLOWED_TICKET_MIMES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'text/plain', 'text/csv', 'application/zip', 'application/x-zip-compressed',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/markdown',
];
const ALLOWED_TICKET_EXT = /\.(jpe?g|png|gif|webp|svg|pdf|txt|csv|md|zip|docx?)$/i;

const ticketStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = process.env.VERCEL === '1' ? path.join('/tmp', 'uploads', 'tickets') : path.join(process.cwd(), 'uploads', 'tickets');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '') || '';
    cb(null, unique + ext);
  },
});

const uploadTicket = multer({
  storage: ticketStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_TICKET_MIMES.includes(file.mimetype) || ALLOWED_TICKET_EXT.test(file.originalname)) cb(null, true);
    else cb(new Error('File type not allowed'));
  },
});

router.get('/check', async (req: AuthRequest, res: Response) => {
  try {
    const type = typeof req.query.type === 'string' ? req.query.type : undefined;
    if (type) {
      const open = await db.select({ id: supportTickets.id })
        .from(supportTickets)
        .where(and(eq(supportTickets.userId, req.userId!), eq(supportTickets.status, 'open'), eq(supportTickets.type, type)))
        .limit(1);
      res.json({ hasOpenTicket: open.length > 0, openTypes: open.length > 0 ? [type] : [] });
      return;
    }
    const openTickets = await db.select({ id: supportTickets.id, type: supportTickets.type })
      .from(supportTickets)
      .where(and(eq(supportTickets.userId, req.userId!), eq(supportTickets.status, 'open')));
    const openTypes = [...new Set(openTickets.map(t => t.type))];
    res.json({ hasOpenTicket: openTickets.length > 0, openTypes, openTickets });
  } catch (error) {
    res.status(500).json({ error: 'Failed to check ticket status' });
  }
});

router.post('/tickets', async (req: AuthRequest, res: Response) => {
  try {
    const { type, subject, message } = req.body;
    if (!type || !subject || !message) {
      return res.status(400).json({ error: 'Type, subject and message are required' });
    }
    const openTickets = await db.select({ id: supportTickets.id })
      .from(supportTickets)
      .where(and(eq(supportTickets.userId, req.userId!), eq(supportTickets.status, 'open'), eq(supportTickets.type, type)))
      .limit(1);
    if (openTickets.length > 0) {
      return res.status(409).json({ error: `You already have an open ${type} ticket. You can create tickets of other types while this one is open.` });
    }
    const [ticket] = await db.insert(supportTickets).values({
      userId: req.userId!,
      type,
      subject,
      status: 'open',
      staffReplied: false,
    }).returning();
    try {
      await db.insert(ticketMessages).values({
        ticketId: ticket.id,
        senderId: req.userId!,
        senderType: 'user',
        message,
        readByUser: true,
        readByStaff: false,
      });
    } catch (e) {
      console.error('Failed to insert user message for ticket', ticket.id, e);
    }
    try {
      const staffUser = await db.select({ id: users.id }).from(users).where(eq(users.email, 'support@system.local')).limit(1);
      const staffId = staffUser[0]?.id || req.userId!;
      await db.insert(ticketMessages).values({
        ticketId: ticket.id,
        senderId: staffId,
        senderType: 'staff',
        message: `Hi there! Thanks for reaching out — we've received your ${type} request "${subject}". Our team will review it and get back to you soon. You can reply here if you have more details.`,
        readByUser: false,
        readByStaff: true,
      });
    } catch (e) {
      console.error('Failed to insert auto-reply for ticket', ticket.id, e);
    }
    res.json({ success: true, ticket });
  } catch (error) {
    console.error('Failed to create ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

router.get('/tickets/my', async (req: AuthRequest, res: Response) => {
  try {
    const tickets = await db.select()
      .from(supportTickets)
      .where(eq(supportTickets.userId, req.userId!))
      .orderBy(desc(supportTickets.updatedAt));
    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.get('/tickets/:id/messages', async (req: AuthRequest, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id);
    const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    if (!ticket.length || ticket[0].userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const messages = await db.select({
      id: ticketMessages.id,
      ticketId: ticketMessages.ticketId,
      senderId: ticketMessages.senderId,
      senderType: ticketMessages.senderType,
      message: ticketMessages.message,
      readByUser: ticketMessages.readByUser,
      readByStaff: ticketMessages.readByStaff,
      createdAt: ticketMessages.createdAt,
      senderName: users.name,
      attachmentUrl: ticketMessages.attachmentUrl,
      attachmentName: ticketMessages.attachmentName,
      attachmentType: ticketMessages.attachmentType,
      attachmentSize: ticketMessages.attachmentSize,
    })
      .from(ticketMessages)
      .leftJoin(users, eq(ticketMessages.senderId, users.id))
      .where(eq(ticketMessages.ticketId, ticketId))
      .orderBy(ticketMessages.createdAt);
    await db.update(ticketMessages)
      .set({ readByUser: true })
      .where(and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.senderType, 'staff')));
    res.json({ ticket: ticket[0], messages });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post('/tickets/:id/messages', uploadTicket.single('file'), async (req: any, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id);
    const message = (req.body?.message || '').trim();
    const file = req.file as Express.Multer.File | undefined;
    if (!message && !file) return res.status(400).json({ error: 'Message or file is required' });
    const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    if (!ticket.length || ticket[0].userId !== req.userId) {
      if (file) fs.unlink(file.path, () => {});
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (ticket[0].status === 'closed' && !ticket[0].staffReplied) {
      if (file) fs.unlink(file.path, () => {});
      return res.status(400).json({ error: 'Cannot reply to a closed ticket' });
    }
    if (ticket[0].status === 'closed' && ticket[0].staffReplied) {
      await db.update(supportTickets).set({ status: 'open', updatedAt: new Date().toISOString() }).where(eq(supportTickets.id, ticketId));
    }
    if (file) {
      const maxMb = await getSettingNumber('max_attachment_mb', 25);
      if (file.size > maxMb * 1024 * 1024) {
        fs.unlink(file.path, () => {});
        return res.status(400).json({ error: `File too large. Max ${maxMb}MB` });
      }
    }
    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;
    let attachmentType: string | null = null;
    let attachmentSize: number | null = null;
    if (file) {
      attachmentUrl = `/uploads/tickets/${path.basename(file.path)}`;
      attachmentName = file.originalname;
      attachmentType = file.mimetype;
      attachmentSize = file.size;
    }
    const [msg] = await db.insert(ticketMessages).values({
      ticketId,
      senderId: req.userId!,
      senderType: 'user',
      message: message || (file ? `[Attachment] ${file.originalname}` : ''),
      readByUser: true,
      readByStaff: false,
      attachmentUrl,
      attachmentName,
      attachmentType,
      attachmentSize,
    }).returning();
    await db.update(supportTickets).set({ updatedAt: new Date().toISOString() }).where(eq(supportTickets.id, ticketId));
    res.json({ success: true, message: msg });
  } catch (error) {
    console.error('Failed to send message', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
