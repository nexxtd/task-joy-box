import { Router, Response } from 'express';
import { db } from '../db.js';
import { users, workspaces, transactions, coupons, couponGroups, couponRedemptions, systemSettings, tasks, goals, boards, habits, notes, tags, labels, taskAttachments, deepFocusSessions, whiteboards, whiteboardItems, aiRequests, checklists, supportTickets, ticketMessages, boardSnapshots, dashboardWidgetUsage, userSettings, milestones, pendingUserChanges, userNotifications } from '../../shared/schema.js';
import { eq, sql, desc, and, inArray, count } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { invalidateSettingCache, getSettingNumber } from '../lib/settings.js';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// Apply admin protection to all routes in this file
router.use(requireAuth);
router.use(requireAdmin);

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

async function deleteTicketContent(ticketId: number) {
  try {
    const msgs = await db.select({ attachmentUrl: ticketMessages.attachmentUrl }).from(ticketMessages).where(eq(ticketMessages.ticketId, ticketId));
    for (const m of msgs as any[]) {
      if (m.attachmentUrl) {
        const fileName = path.basename(m.attachmentUrl);
        const candidates = [
          path.join(process.cwd(), 'uploads', 'tickets', fileName),
          path.join('/tmp', 'uploads', 'tickets', fileName),
          path.join(process.cwd(), 'uploads', fileName),
          path.join('/tmp', 'uploads', fileName),
        ];
        for (const p of candidates) {
          try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
        }
      }
    }
    await db.delete(ticketMessages).where(eq(ticketMessages.ticketId, ticketId));
  } catch (e) {
    console.error('Failed to delete ticket content', e);
  }
}

// Dashboard Statistics
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    // Total Users
    const [userCount] = await db.select({ count: sql<number>`count(*)` }).from(users);

    // Total Earnings
    const [earnings] = await db.select({
      total: sql<number>`sum(amount)`
    }).from(transactions).where(eq(transactions.status, 'completed'));

    // Earnings this month
    const [monthEarnings] = await db.select({
      total: sql<number>`sum(amount)`
    }).from(transactions).where(and(eq(transactions.status, 'completed'), sql`created_at >= date_trunc('month', NOW())`));

    // Active Subscriptions
    const [activeSubs] = await db.select({
      count: sql<number>`count(*)`
    }).from(users).where(eq(users.subscriptionStatus, 'active'));

    // Coupon Usage
    const [couponUses] = await db.select({
      total: sql<number>`sum(used_count)`
    }).from(coupons);

    // New users this week / month
    const [newWeek] = await db.select({ count: sql<number>`count(*)` }).from(users).where(sql`created_at >= NOW() - INTERVAL '7 days'`);
    const [newMonth] = await db.select({ count: sql<number>`count(*)` }).from(users).where(sql`created_at >= date_trunc('month', NOW())`);

    // Active users in the last 7 days
    const [active7d] = await db.select({ count: sql<number>`count(*)` }).from(users).where(sql`last_active_at >= NOW() - INTERVAL '7 days'`);

    // Ticket stats
    const [openTickets] = await db.select({ count: sql<number>`count(*)` }).from(supportTickets).where(sql`status != 'closed'`);
    const [totalTickets] = await db.select({ count: sql<number>`count(*)` }).from(supportTickets);
    const [unreadMessages] = await db.select({ count: sql<number>`count(*)` }).from(ticketMessages).where(and(eq(ticketMessages.senderType, 'user'), eq(ticketMessages.readByStaff, false)));

    // Coupons created
    const [couponsCreated] = await db.select({ count: sql<number>`count(*)` }).from(coupons);

    // Recent Transactions (with user names)
    const recentTransactions = await db.select({
      id: transactions.id,
      userId: transactions.userId,
      amount: transactions.amount,
      currency: transactions.currency,
      status: transactions.status,
      provider: transactions.provider,
      createdAt: transactions.createdAt,
      userName: users.name,
      userEmail: users.email,
      plan: users.subscriptionTier,
    })
      .from(transactions)
      .leftJoin(users, eq(transactions.userId, users.id))
      .orderBy(desc(transactions.createdAt))
      .limit(8);

    // Recent registrations
    const recentRegistrations = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      tier: users.subscriptionTier,
      createdAt: users.createdAt,
    }).from(users).orderBy(desc(users.createdAt)).limit(6);

    // Top coupons by usage
    const topCoupons = await db.select({
      id: coupons.id,
      code: coupons.code,
      discountType: coupons.discountType,
      discountValue: coupons.discountValue,
      usedCount: coupons.usedCount,
      maxUses: coupons.maxUses,
    }).from(coupons).orderBy(desc(coupons.usedCount)).limit(5);

    res.json({
      summary: {
        totalUsers: userCount.count,
        totalEarnings: (earnings?.total || 0) / 100, // Assuming cents to dollars
        activeSubscriptions: activeSubs.count,
        totalCouponsUsed: couponUses?.total || 0,
        revenueThisMonth: (monthEarnings?.total || 0) / 100,
        newUsersThisWeek: newWeek.count,
        newUsersThisMonth: newMonth.count,
        activeUsers7d: active7d.count,
        openTickets: openTickets.count,
        totalTickets: totalTickets.count,
        unreadMessages: unreadMessages.count,
        couponsCreated: couponsCreated.count,
      },
      recentTransactions,
      recentRegistrations,
      topCoupons,
    });
  } catch (error) {
    console.error('Failed to fetch admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Coupon Management
router.get('/coupons', async (req: AuthRequest, res: Response) => {
  try {
    const allCoupons = await db.select().from(coupons).orderBy(coupons.sortOrder, desc(coupons.createdAt));
    res.json(allCoupons);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch coupons' });
  }
});

router.post('/coupons', async (req: AuthRequest, res: Response) => {
  try {
    const { code, discountType, discountValue, maxUses, restrictedToEmail, restrictedToPlan, startDate, expiresAt, oneTimePerUser, groupId } = req.body;

    const [newCoupon] = await db.insert(coupons).values({
      code: code.toUpperCase(),
      discountType,
      discountValue,
      maxUses: maxUses || null,
      restrictedToEmail: restrictedToEmail || null,
      restrictedToPlan: restrictedToPlan || null,
      startDate: startDate || null,
      expiresAt: expiresAt || null,
      oneTimePerUser: oneTimePerUser || false,
      active: true,
      groupId: groupId || null,
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

// NOTE: /coupons/reorder and /coupons/layout MUST be registered before /coupons/:id

// Apply a full layout (groups + coupons in a single flat ordered list).
// Each item: { type: 'group', id } | { type: 'coupon', id, groupId }
// Coupon sortOrder is assigned by list position; groups sort by their position among groups.
router.patch('/coupons/layout', async (req: AuthRequest, res: Response) => {
  try {
    const { layout } = req.body;
    if (!Array.isArray(layout)) {
      return res.status(400).json({ error: 'layout must be an array' });
    }

    let couponOrder = 0;
    let groupOrder = 0;
    for (const item of layout) {
      if (item?.type === 'group') {
        await db.update(couponGroups).set({ sortOrder: groupOrder++ }).where(eq(couponGroups.id, item.id));
      } else if (item?.type === 'coupon') {
        await db.update(coupons).set({ sortOrder: couponOrder++, groupId: item.groupId || null }).where(eq(coupons.id, item.id));
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to apply coupon layout:', error);
    res.status(500).json({ error: 'Failed to apply coupon layout' });
  }
});

router.patch('/coupons/reorder', async (req: AuthRequest, res: Response) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ error: 'orderedIds must be an array' });
    }

    for (let i = 0; i < orderedIds.length; i++) {
      await db.update(coupons).set({ sortOrder: i }).where(eq(coupons.id, orderedIds[i]));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to reorder coupons:', error);
    res.status(500).json({ error: 'Failed to reorder coupons' });
  }
});

router.patch('/coupons/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { code, discountType, discountValue, maxUses, restrictedToEmail, restrictedToPlan, startDate, expiresAt, oneTimePerUser, active, groupId } = req.body;
    const couponId = parseInt(req.params.id);

    const updateData: any = {
      discountType,
      discountValue,
      maxUses: maxUses || null,
      restrictedToEmail: restrictedToEmail || null,
      restrictedToPlan: restrictedToPlan || null,
      startDate: startDate || null,
      expiresAt: expiresAt || null,
      oneTimePerUser: oneTimePerUser || false,
      active: active !== undefined ? active : undefined,
    };
    if (code) updateData.code = code.toUpperCase();
    if (groupId !== undefined) updateData.groupId = groupId || null;

    await db.update(coupons).set(updateData).where(eq(coupons.id, couponId));

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update coupon:', error);
    res.status(500).json({ error: 'Failed to update coupon' });
  }
});

// Coupon Groups
router.get('/coupon-groups', async (req: AuthRequest, res: Response) => {
  try {
    const groups = await db.select().from(couponGroups).orderBy(couponGroups.sortOrder, desc(couponGroups.createdAt));
    res.json(groups);
  } catch (error) {
    console.error('Failed to fetch coupon groups:', error);
    res.status(500).json({ error: 'Failed to fetch coupon groups' });
  }
});

router.post('/coupon-groups', async (req: AuthRequest, res: Response) => {
  try {
    const { name, color, icon } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Group name required' });

    const [group] = await db.insert(couponGroups).values({
      name: name.trim(),
      color: color || 'hsl(var(--muted-foreground))',
      icon: icon || null,
    }).returning();

    res.json(group);
  } catch (error) {
    console.error('Failed to create coupon group:', error);
    res.status(500).json({ error: 'Failed to create coupon group' });
  }
});

router.patch('/coupon-groups/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, color, icon } = req.body;
    const groupId = parseInt(req.params.id);

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon || null;

    await db.update(couponGroups).set(updateData).where(eq(couponGroups.id, groupId));
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to update coupon group:', error);
    res.status(500).json({ error: 'Failed to update coupon group' });
  }
});

router.delete('/coupon-groups/:id', async (req: AuthRequest, res: Response) => {
  try {
    const groupId = parseInt(req.params.id);
    await db.update(coupons).set({ groupId: null }).where(eq(coupons.groupId, groupId));
    await db.delete(couponGroups).where(eq(couponGroups.id, groupId));
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete coupon group:', error);
    res.status(500).json({ error: 'Failed to delete coupon group' });
  }
});

// System Settings (Feature Flags & Prices) — every key here is consumed by the
// app: maintenance_mode gates the whole UI, prices feed /api/payment/pricing,
// feature_*_tier gate AI/workspaces/whiteboards/deep-focus, signup_open and
// min_password_length/trial_days/default_language/session_timeout_hours affect
// auth, free_tier_*_limit cap creation, max_attachment_mb limits uploads and
// support_contact_email is shown on the Support page.
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

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Setting key is required' });
    }

    // Check if setting exists
    const existing = await db.select().from(systemSettings).where(eq(systemSettings.key, key)).limit(1);

    if (existing.length > 0) {
      await db.update(systemSettings)
        .set({ value, updatedAt: sql`NOW()` })
        .where(eq(systemSettings.key, key));
    } else {
      await db.insert(systemSettings).values({ key, value, description: null });
    }

    invalidateSettingCache();

    res.json({ success: true, key, value });
  } catch (error) {
    console.error('Failed to update setting:', error);
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
      location: users.location,
      createdAt: users.createdAt,
      lastActiveAt: users.lastActiveAt,
      avatarUrl: users.avatarUrl,
    }).from(users).orderBy(desc(users.createdAt)).limit(200);

    const usersWithLanguage = await Promise.all(allUsers.map(async u => {
      const [settings] = await db.select({ language: userSettings.language })
        .from(userSettings).where(eq(userSettings.userId, u.id)).limit(1);
      return { ...u, language: settings?.language || 'en' };
    }));

    res.json(usersWithLanguage);
  } catch (error) {
    console.error('Failed to fetch users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// General user profile update (name, email, tier, status, location, language)
router.patch('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const { name, email, tier, status, location, language, password } = req.body;

    if (!name && email === undefined && tier === undefined && status === undefined && location === undefined && language === undefined && password === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const userExists = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!userExists.length) return res.status(404).json({ error: 'User not found' });

    if (email !== undefined) {
      const duplicate = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.email, email), sql`id != ${userId}`)).limit(1);
      if (duplicate.length) return res.status(400).json({ error: 'Email already in use' });
    }

    if (tier !== undefined && !['free', 'pro', 'premium'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }
    if (status !== undefined && !['active', 'inactive', 'trialing'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (password !== undefined && (typeof password !== 'string' || password.length < 6)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (email !== undefined) updateData.email = email.trim();
    if (password !== undefined) updateData.passwordHash = await bcrypt.hash(password, 12);
    if (tier !== undefined) {
      updateData.subscriptionTier = tier;
      updateData.subscriptionStatus = tier === 'free' && status === undefined ? 'inactive' : (status || (tier === 'free' ? 'inactive' : 'active'));
    }
    if (status !== undefined) updateData.subscriptionStatus = status;
    if (location !== undefined) updateData.location = location || null;

    await db.update(users).set(updateData).where(eq(users.id, userId));

    if (language !== undefined) {
      const existing = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
      if (existing.length > 0) {
        await db.update(userSettings).set({ language }).where(eq(userSettings.userId, userId));
      } else {
        await db.insert(userSettings).values({ userId, language });
      }
    }

    const [updated] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    res.json(updated);
  } catch (error) {
    console.error('Failed to update user:', error);
    res.status(500).json({ error: 'Failed to update user' });
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

router.post('/users/:id/request-change', async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    const adminId = req.userId!;
    const { changeType, payload } = req.body;
    if (!changeType || !payload) return res.status(400).json({ error: 'changeType and payload required' });
    if (!['email', 'password', 'subscription', 'tier', 'general'].includes(changeType)) {
      return res.status(400).json({ error: 'Invalid changeType' });
    }
    const userExists = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
    if (!userExists.length) return res.status(404).json({ error: 'User not found' });

    if (payload.email) {
      const dup = await db.select({ id: users.id }).from(users).where(and(eq(users.email, payload.email), sql`id != ${userId}`)).limit(1);
      if (dup.length) return res.status(400).json({ error: 'Email already in use' });
    }
    if (payload.password && (typeof payload.password !== 'string' || payload.password.length < 6)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [pending] = await db.insert(pendingUserChanges).values({
      userId,
      adminId,
      changeType,
      payload: JSON.stringify(payload),
      status: 'pending',
      expiresAt: expiresAt.toISOString() as any,
    } as any).returning();

    const titleMap: Record<string, string> = {
      email: 'Confirm email change',
      password: 'Confirm password change',
      subscription: 'Confirm subscription change',
      tier: 'Confirm plan change',
      general: 'Confirm account change',
    };
    const msgMap: Record<string, string> = {
      email: `Admin wants to change your email to "${payload.email}". Approve or deny. Auto-approves in 24h if no action.`,
      password: `Admin wants to change your password. Approve or deny. Auto-approves in 24h if no action.`,
      subscription: `Admin wants to change your subscription to "${payload.tier || payload.status}". Approve or deny. Auto-approves in 24h.`,
      tier: `Admin wants to change your plan to "${payload.tier}". Approve or deny. Auto-approves in 24h.`,
      general: `Admin requested changes to your account. Approve or deny. Auto-approves in 24h.`,
    };

    await db.insert(userNotifications).values({
      userId,
      type: 'pending_change',
      title: titleMap[changeType] || 'Confirm account change',
      message: msgMap[changeType] || 'Admin requested a change to your account.',
      data: JSON.stringify({ pendingId: (pending as any).id, changeType, payload }),
      read: false,
    } as any);

    res.json({ success: true, pendingId: (pending as any).id, expiresAt });
  } catch (error) {
    console.error('Failed to create pending change', error);
    res.status(500).json({ error: 'Failed to create request' });
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
      .set({ readByStaff: true })
      .where(and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.senderType, 'user')));

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
    if (!ticket.length) {
      if (file) fs.unlink(file.path, () => {});
      return res.status(404).json({ error: 'Not found' });
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

    await db.insert(ticketMessages).values({
      ticketId,
      senderId: req.userId!,
      senderType: 'staff',
      message: message || (file ? `[Attachment] ${file.originalname}` : ''),
      readByUser: false,
      readByStaff: true,
      attachmentUrl,
      attachmentName,
      attachmentType,
      attachmentSize,
    });

    if (!ticket[0].staffReplied) {
      await db.update(supportTickets)
        .set({ staffReplied: true, updatedAt: sql`NOW()` })
        .where(eq(supportTickets.id, ticketId));
    } else {
      await db.update(supportTickets)
        .set({ updatedAt: sql`NOW()` })
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

    const updateData: any = { status, updatedAt: sql`NOW()` };
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
      .set({ status: 'closed', closedAt: new Date().toISOString(), updatedAt: sql`NOW()` })
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

    const [userSettingsRow] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);

    const userBoards = await db.select({ id: boards.id }).from(boards).where(eq(boards.userId, userId));
    const boardIds = userBoards.map(b => b.id);

    const taskRows = boardIds.length > 0
      ? await db.select().from(tasks).where(inArray(tasks.boardId, boardIds))
      : [];

    const goalRows = await db.select().from(goals).where(eq(goals.userId, userId));
    const habitRows = await db.select().from(habits).where(eq(habits.userId, userId));
    const noteRows = await db.select().from(notes).where(eq(notes.userId, userId));
    const noteTagRows = await db.select().from(tags).where(eq(tags.userId, userId));
    const focusRows = await db.select().from(deepFocusSessions).where(eq(deepFocusSessions.userId, userId));
    const whiteboardRows = await db.select().from(whiteboards).where(eq(whiteboards.userId, userId));
    const aiRows = await db.select().from(aiRequests).where(eq(aiRequests.userId, userId));
    const milestoneRows = await db.select({ id: milestones.id }).from(milestones)
      .where(inArray(milestones.projectId, userBoards.map(b => b.id)));
    const ticketRows = await db.select().from(supportTickets).where(eq(supportTickets.userId, userId));
    const redemptions = await db.select({ couponId: couponRedemptions.couponId }).from(couponRedemptions).where(eq(couponRedemptions.userId, userId));
    const userTransactions = await db.select().from(transactions).where(eq(transactions.userId, userId));
    const widgetUsage = await db.select().from(dashboardWidgetUsage).where(eq(dashboardWidgetUsage.userId, userId));

    const whiteboardIds = whiteboardRows.map(w => w.id);
    const wbItemRows = whiteboardIds.length > 0
      ? await db.select({ type: whiteboardItems.type }).from(whiteboardItems).where(inArray(whiteboardItems.whiteboardId, whiteboardIds))
      : [];

    const taskIds = taskRows.map(t => t.id);
    const checklistRows = taskIds.length > 0
      ? await db.select({ id: checklists.id, checklistItems: sql<number>`(SELECT count(*) FROM checklist_items ci WHERE ci.checklist_id = checklists.id)` }).from(checklists).where(inArray(checklists.taskId, taskIds))
      : [];
    const attachmentRows = taskIds.length > 0
      ? await db.select({ id: taskAttachments.id }).from(taskAttachments).where(inArray(taskAttachments.taskId, taskIds))
      : [];
    const labelRows = taskIds.length > 0
      ? await db.select({ id: labels.id }).from(labels).where(inArray(labels.taskId, taskIds))
      : [];

    const completedGoals = goalRows.filter(g => g.completed).length;
    const totalHabitCompletions = habitRows.reduce((sum, h) => {
      try { return sum + (JSON.parse(h.completedDays as string) as any[]).length; } catch { return sum; }
    }, 0);
    const maxStreak = habitRows.reduce((max, h) => Math.max(max, h.streak || 0), 0);
    const pinnedNotes = noteRows.filter(n => n.pinned).length;

    const wbCounts: Record<string, number> = {};
    wbItemRows.forEach(item => { wbCounts[item.type] = (wbCounts[item.type] || 0) + 1; });

    // Granular task content from the latest board snapshot (subtasks, checklists, images, attachments)
    const [snapshotRow] = await db.select().from(boardSnapshots).where(eq(boardSnapshots.userId, userId)).orderBy(desc(boardSnapshots.updatedAt)).limit(1);
    let snapshotCounts = { subtasks: 0, checklistLists: 0, checklistItems: 0, images: 0, attachments: 0, labels: 0 };
    if (snapshotRow) {
      try {
        const board = JSON.parse(snapshotRow.snapshot);
        const tasksArr = Array.isArray(board?.tasks) ? board.tasks : [];
        tasksArr.forEach((t: any) => {
          if (Array.isArray(t.subtasks)) snapshotCounts.subtasks += t.subtasks.length;
          if (Array.isArray(t.checklists)) {
            snapshotCounts.checklistLists += t.checklists.length;
            t.checklists.forEach((cl: any) => {
              if (Array.isArray(cl.items)) snapshotCounts.checklistItems += cl.items.length;
            });
          }
          if (Array.isArray(t.images)) snapshotCounts.images += t.images.length;
          if (Array.isArray(t.attachments)) snapshotCounts.attachments += t.attachments.length;
          if (Array.isArray(t.labels)) snapshotCounts.labels += t.labels.length;
        });
      } catch { /* snapshot parse failed - leave defaults */ }
    }

    const totalFocusMinutes = focusRows.reduce((sum, f) => sum + (f.durationMinutes || 0), 0);
    const completedFocus = focusRows.filter(f => f.completed).length;
    const checklistItemCount = checklistRows.reduce((sum, c) => sum + (Number(c.checklistItems) || 0), 0);
    const totalSpentCents = userTransactions.filter(t => t.status === 'completed').reduce((sum, t) => sum + (t.amount || 0), 0);
    const openUserTickets = ticketRows.filter(t => t.status !== 'closed').length;

    const widgetUsageMap: Record<string, number> = {};
    widgetUsage.forEach(w => { widgetUsageMap[w.widgetType] = w.count; });

    res.json({
      user: {
        id: userRow.id,
        name: userRow.name,
        email: userRow.email,
        tier: userRow.subscriptionTier,
        status: userRow.subscriptionStatus,
        location: userRow.location,
        language: userSettingsRow?.language || 'en',
        avatarUrl: userRow.avatarUrl,
        createdAt: userRow.createdAt,
        lastActiveAt: userRow.lastActiveAt,
        subscriptionEndsAt: userRow.subscriptionEndsAt,
      },
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
          subtasks: snapshotCounts.subtasks,
          checklists: snapshotCounts.checklistLists,
          checklistItems: snapshotCounts.checklistItems,
          images: snapshotCounts.images,
          attachments: snapshotCounts.attachments,
          labels: snapshotCounts.labels,
          deepFocusSessions: focusRows.length,
        },
        projects: {
          boards: boardIds.length,
          milestones: milestoneRows.length,
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
          attachments: attachmentRows.length,
        },
        whiteboard: {
          whiteboardsCreated: whiteboardRows.length,
          items: wbCounts,
        },
        ai: {
          totalMessages: aiRows.length,
        },
        focus: {
          sessions: focusRows.length,
          totalMinutes: totalFocusMinutes,
          completed: completedFocus,
        },
        dashboard: {
          widgets: widgetUsageMap,
        },
        engagement: {
          tickets: ticketRows.length,
          openTickets: openUserTickets,
          couponsRedeemed: redemptions.length,
          transactions: userTransactions.length,
          totalSpent: totalSpentCents / 100,
        },
      },
    });
  } catch (error) {
    console.error('Failed to fetch full user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

export default router;
