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
    console.warn('No authentication token found in request');
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error('CRITICAL ERROR: JWT_SECRET is not configured!');
    console.error('Please set JWT_SECRET in your .env file');
    return res.status(500).json({ 
      error: 'Server configuration error: JWT_SECRET not set',
      message: 'Contact the administrator to configure authentication properly' 
    });
  }

  try {
    console.log('Verifying JWT token...');
    const payload = jwt.verify(token, jwtSecret) as { userId: number; email: string };
    console.log('JWT verified:', { userId: payload.userId, userEmail: payload.email });
    req.userId = payload.userId;
    req.userEmail = payload.email;
    next();
  } catch (err) {
    console.error('JWT verification error:', err);
    // Instead of just clearing the cookie, send a 401 which will cause the frontend to handle the logout
    res.clearCookie('token');
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}