import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { users } from '../../shared/schema.js';
import { eq } from 'drizzle-orm';

export interface AuthRequest extends Request {
  userId?: number;
  userEmail?: string;
}

const lastTouch = new Map<number, number>();
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function touchLastActive(userId: number) {
  const now = Date.now();
  if (now - (lastTouch.get(userId) || 0) < TOUCH_INTERVAL_MS) return;
  lastTouch.set(userId, now);
  void db.update(users).set({ lastActiveAt: new Date() as any }).where(eq(users.id, userId)).catch(() => {});
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  const token = req.cookies?.token || bearerToken;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('CRITICAL: JWT_SECRET is not configured');
    return res.status(500).json({ 
      error: 'Server configuration error' 
    });
  }

  try {
    const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as { userId: number; email: string };
    req.userId = payload.userId;
    req.userEmail = payload.email;
    touchLastActive(payload.userId);
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}