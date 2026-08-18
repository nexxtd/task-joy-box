import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const adminEmailsEnv = process.env.ADMIN_EMAILS;
  
  if (!adminEmailsEnv) {
    console.error('CRITICAL: ADMIN_EMAILS not configured');
    return res.status(500).json({ 
      error: 'Server configuration error' 
    });
  }
  
  const adminEmails = adminEmailsEnv.split(',').map(e => e.trim().toLowerCase());
  
  if (!req.userEmail || !adminEmails.includes(req.userEmail.toLowerCase())) {
    return res.status(403).json({ error: 'Access denied: Admin privileges required' });
  }
  
  next();
}