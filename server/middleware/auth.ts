import 'dotenv/config';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  userId?: number;
  userEmail?: string;
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
    next();
  } catch (err) {
    res.clearCookie('token');
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}