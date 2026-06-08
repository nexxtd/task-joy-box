import { Router, Response } from 'express';
import { db } from '../db';
import { users, workspaces, transactions, coupons, systemSettings, tasks, goals, boards, habits, notes, noteTags, taskAttachments, deepFocusSessions, whiteboards, whiteboardItems, aiRequests, checklists, supportTickets, ticketMessages } from '../../shared/schema';
import { eq, sql, desc, and, inArray, count } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';

const router = Router();

// Apply admin protection to all routes in this file
router.use(requireAuth);
router.use(requireAdmin);

// Dashboard Statistics
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    // Total Users
    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);
    
    // Total Earnings
    const [earnings] = await db.select({ 
      total: sql<number>`sum(amount)` 
    }).from(transactions).where(eq(transactions.status, 'completed'));
    
    // Active Subscriptions
    const [activeSubs] = await db.select({ 
      count: sql<number>`count(*)` 
    }).from(users).where(eq(users.subscriptionStatus, 'active'));

    // Coupon Usage
    const [couponUses] = await db.select({ 
      total: sql<number>`sum(used_count)` 
    }).from(coupons);

    // Recent Transactions
    const recentTransactions = await db.select()
      .from(transactions)
      .orderBy(desc(transactions.createdAt))
      .limit(5);

    res.json({
      summary: {
        totalUsers: userCount.count,
        totalEarnings: (earnings?.total || 0) / 100, // Assuming cents to dollars
        activeSubscriptions: activeSubs.count,
        totalCouponsUsed: couponUses?.total || 0
      },
      recentTransactions
    });
  } catch (error) {
    console.error('Failed to fetch admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Coupon Management
router.get('/coupons', async (req: AuthRequest, res: Response) => {
  try {
    const allCoupons = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
    res.json(allCoupons);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch coupons' });
  }
});

router.post('/coupons', async (req: AuthRequest, res: Response) => {
  try {
    const { code, discountType, discountValue, maxUses, restrictedToEmail, expiresAt } = req.body;
    
    const [newCoupon] = await db.insert(coupons).values({
      code: code.toUpperCase(),
      discountType,
      discountValue,
      maxUses: maxUses || null,
      restrictedToEmail: restrictedToEmail || null,
      expiresAt: expiresAt || null,
      active: true
    }).returning();
    
    res.json(newCoupon);
  } catch (error) {
    console.error('Failed to create coupon:', error);
    res.status(500).json({ error: 'Failed to create coupon. Code might already exist.' });
  }
});

router.delete('/coupons/:id', async (req: AuthRequest, res: Response) => {
  try {
    await db.delete(coupons).where(eq(coupons.id, parseInt(req.params.id)));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
});

// System Settings (Feature Flags & Prices)
router.get('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const settings = await db.select().from(systemSettings);
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch system settings' });
  }
});

router.patch('/settings', async (req: AuthRequest, res: Response) => {
  try {
    const { key, value } = req.body;
    
    // Check if setting exists
    const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);
    
    if (existing.length > 0) {
      await db.update(systemSettings)
        .set({ value, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))` })
        .where(eq(systemSettings.key, key));
    } else {
      await db.insert(systemSettings).values({ key, value });
    }
    
    res.json({ success: true, key, value });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// User Management (Briefly for the dashboard list)
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const allUsers = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      tier: users.subscriptionTier,
      status: users.subscriptionStatus,
      createdAt: users.createdAt
    }).from(users).orderBy(desc(users.createdAt)).limit(50);
    
    res.json(allUsers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.patch('/users/:id/tier', async (req: AuthRequest, res: Response) => {
  try {
    const { tier } = req.body;
    if (!['free', 'pro', 'premium'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }
    
    await db.update(users)
      .set({ subscriptionTier: tier, subscriptionStatus: tier === 'free' ? 'inactive' : 'active' })
      .where(eq(users.id, parseInt(req.params.id)));
    
    res.json({ success: true, tier });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update user tier' });
  }
});

// Fetch tasks for a specific user (admin view)
router.get('/users/:id/tasks', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const userBoards = await db.select({ id: boards.id }).from(boards).where(eq(boards.userId, userId));
    const boardIds = userBoards.map(b => b.id);
    if (boardIds.length === 0) return res.json([]);
    const userTasks = await db.select().from(tasks).where(inArray(tasks.boardId, boardIds)).orderBy(desc(tasks.createdAt));
    res.json(userTasks);
  } catch (error) {
    console.error('Failed to fetch user tasks:', error);
    res.status(500).json({ error: 'Failed to fetch user tasks' });
  }
});

// Fetch goals for a specific user (admin view)
router.get('/users/:id/goals', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const userGoals = await db.select().from(goals).where(eq(goals.userId, userId)).orderBy(desc(goals.updatedAt));
    res.json(userGoals);
  } catch (error) {
    console.error('Failed to fetch user goals:', error);
    res.status(500).json({ error: 'Failed to fetch user goals' });
  }
});

// ---- TICKET MANAGEMENT ----

router.get('/tickets', async (req: AuthRequest, res: Response) => {
  try {
    const allTickets = await db.select({
      id: supportTickets.id,
      type: supportTickets.type,
      subject: supportTickets.subject,
      status: supportTickets.status,
      staffReplied: supportTickets.staffReplied,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      closedAt: supportTickets.closedAt,
      userId: supportTickets.userId,
      userName: users.name,
      userEmail: users.email,
    })
      .from(supportTickets)
      .leftJoin(users, eq(supportTickets.userId, users.id))
      .orderBy(desc(supportTickets.updatedAt));

    const ticketsWithUnread = await Promise.all(allTickets.map(async t => {
      const [unread] = await db.select({ count: sql<number>`count(*)` })
        .from(ticketMessages)
        .where(and(eq(ticketMessages.ticketId, t.id), eq(ticketMessages.senderType, 'user'), eq(ticketMessages.readByStaff, false)));
      return { ...t, unreadCount: Number(unread.count) };
    }));

    res.json(ticketsWithUnread);
  } catch (error) {
    console.error('Failed to fetch tickets:', error);
    res.status(500).json({ error: 'Failed to fetch tickets' });
  }
});

router.get('/tickets/:id/messages', async (req: AuthRequest, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id);
    const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    if (!ticket.length) return res.status(404).json({ error: 'Not found' });

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
      .set({ readByStaff: true })
      .where(and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.senderType, 'user')));

    res.json({ ticket: ticket[0], messages });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

router.post('/tickets/:id/messages', async (req: AuthRequest, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { message } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

    const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    if (!ticket.length) return res.status(404).json({ error: 'Not found' });

    await db.insert(ticketMessages).values({
      ticketId,
      senderId: req.userId!,
      senderType: 'staff',
      message: message.trim(),
      readByUser: false,
      readByStaff: true,
    });

    if (!ticket[0].staffReplied) {
      await db.update(supportTickets)
        .set({ staffReplied: true, updatedAt: new Date().toISOString() })
        .where(eq(supportTickets.id, ticketId));
    } else {
      await db.update(supportTickets)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(supportTickets.id, ticketId));
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

router.patch('/tickets/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id);
    const { status } = req.body;
    
    if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const updateData: any = { status, updatedAt: new Date().toISOString() };
    if (status === 'closed') {
      updateData.closedAt = new Date().toISOString();
    }
    
    await db.update(supportTickets)
      .set(updateData)
      .where(eq(supportTickets.id, ticketId));
    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update ticket status' });
  }
});

router.patch('/tickets/:id/close', async (req: AuthRequest, res: Response) => {
  try {
    const ticketId = parseInt(req.params.id);
    await db.update(supportTickets)
      .set({ status: 'closed', closedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(supportTickets.id, ticketId));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to close ticket' });
  }
});

// ---- ENHANCED USER DETAILS ----

router.get('/users/:id/full-details', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);

    const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!userRow) return res.status(404).json({ error: 'User not found' });

    const userBoards = await db.select({ id: boards.id }).from(boards).where(eq(boards.userId, userId));
    const boardIds = userBoards.map(b => b.id);

    const taskRows = boardIds.length > 0
      ? await db.select().from(tasks).where(inArray(tasks.boardId, boardIds))
      : [];

    const goalRows = await db.select().from(goals).where(eq(goals.userId, userId));
    const habitRows = await db.select().from(habits).where(eq(habits.userId, userId));
    const noteRows = await db.select().from(notes).where(eq(notes.userId, userId));
    const noteTagRows = await db.select().from(noteTags).where(eq(noteTags.userId, userId));
    const focusRows = await db.select().from(deepFocusSessions).where(eq(deepFocusSessions.userId, userId));
    const whiteboardRows = await db.select().from(whiteboards).where(eq(whiteboards.userId, userId));
    const aiRows = await db.select().from(aiRequests).where(eq(aiRequests.userId, userId));

    const whiteboardIds = whiteboardRows.map(w => w.id);
    const wbItemRows = whiteboardIds.length > 0
      ? await db.select({ type: whiteboardItems.type }).from(whiteboardItems).where(inArray(whiteboardItems.whiteboardId, whiteboardIds))
      : [];

    const taskIds = taskRows.map(t => t.id);
    const checklistRows = taskIds.length > 0
      ? await db.select({ id: checklists.id }).from(checklists).where(inArray(checklists.taskId, taskIds))
      : [];
    const attachmentRows = taskIds.length > 0
      ? await db.select({ id: taskAttachments.id }).from(taskAttachments).where(inArray(taskAttachments.taskId, taskIds))
      : [];

    const completedGoals = goalRows.filter(g => g.completed).length;
    const totalHabitCompletions = habitRows.reduce((sum, h) => {
      try { return sum + (JSON.parse(h.completedDays as string) as any[]).length; } catch { return sum; }
    }, 0);
    const maxStreak = habitRows.reduce((max, h) => Math.max(max, h.streak || 0), 0);
    const pinnedNotes = noteRows.filter(n => n.pinned).length;

    const wbCounts: Record<string, number> = {};
    wbItemRows.forEach(item => { wbCounts[item.type] = (wbCounts[item.type] || 0) + 1; });

    res.json({
      user: { id: userRow.id, name: userRow.name, email: userRow.email, tier: userRow.subscriptionTier, createdAt: userRow.createdAt },
      stats: {
        tasks: taskRows.length,
        completedTasks: taskRows.filter(t => t.completed).length,
        goals: goalRows.length,
        completedGoals,
        habits: habitRows.length,
        notes: noteRows.length,
      },
      featureUsage: {
        tasks: {
          total: taskRows.length,
          completed: taskRows.filter(t => t.completed).length,
          checklists: checklistRows.length,
          attachments: attachmentRows.length,
          deepFocusSessions: focusRows.length,
        },
        projects: {
          boards: boardIds.length,
          whiteboards: whiteboardRows.length,
        },
        goals: {
          total: goalRows.length,
          completed: completedGoals,
        },
        habits: {
          total: habitRows.length,
          totalCompletions: totalHabitCompletions,
          highestStreak: maxStreak,
        },
        notes: {
          total: noteRows.length,
          tags: noteTagRows.length,
          pinned: pinnedNotes,
          attachments: 0,
        },
        whiteboard: {
          whiteboardsCreated: whiteboardRows.length,
          items: wbCounts,
        },
        ai: {
          totalMessages: aiRows.length,
        },
      },
    });
  } catch (error) {
    console.error('Failed to fetch full user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

export default router;
