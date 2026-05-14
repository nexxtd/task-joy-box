import { Router, Response } from 'express';
import { db } from '../db';
import { users, workspaces, transactions, coupons, systemSettings, tasks, goals, boards } from '../../shared/schema';
import { eq, sql, desc, and, inArray } from 'drizzle-orm';
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

export default router;
