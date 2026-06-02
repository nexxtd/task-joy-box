import { Router, Response } from 'express';
import { db } from '../db';
import { supportTickets, ticketMessages, users } from '../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/check', async (req: AuthRequest, res: Response) => {
  try {
    const openTicket = await db.select({ id: supportTickets.id })
      .from(supportTickets)
      .where(and(eq(supportTickets.userId, req.userId!), eq(supportTickets.status, 'open')))
      .limit(1);
    res.json({ hasOpenTicket: openTicket.length > 0 });
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
      .where(and(eq(supportTickets.userId, req.userId!), eq(supportTickets.status, 'open')))
      .limit(1);
    if (openTickets.length > 0) {
      return res.status(409).json({ error: 'You already have an open ticket' });
    }
    const [ticket] = await db.insert(supportTickets).values({
      userId: req.userId!,
      type,
      subject,
      status: 'open',
      staffReplied: false,
    }).returning();
    await db.insert(ticketMessages).values({
      ticketId: ticket.id,
      senderId: req.userId!,
      senderType: 'user',
      message,
      readByUser: true,
      readByStaff: false,
    });
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
      .where(and(eq(supportTickets.userId, req.userId!), eq(supportTickets.staffReplied, true)))
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

router.post('/tickets/:id/messages', async (req: AuthRequest, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required' });
    const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    if (!ticket.length || ticket[0].userId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (ticket[0].status === 'closed' && !ticket[0].staffReplied) {
      return res.status(400).json({ error: 'Cannot reply to a closed ticket' });
    }
    if (ticket[0].status === 'closed' && ticket[0].staffReplied) {
      await db.update(supportTickets).set({ status: 'open', updatedAt: new Date().toISOString() }).where(eq(supportTickets.id, ticketId));
    }
    const [msg] = await db.insert(ticketMessages).values({
      ticketId,
      senderId: req.userId!,
      senderType: 'user',
      message: message.trim(),
      readByUser: true,
      readByStaff: false,
    }).returning();
    await db.update(supportTickets).set({ updatedAt: new Date().toISOString() }).where(eq(supportTickets.id, ticketId));
    res.json({ success: true, message: msg });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
