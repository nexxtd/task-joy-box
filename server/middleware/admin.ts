import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  const adminEmailsEnv = process.env.ADMIN_EMAILS;
  
  if (!adminEmailsEnv) {
    console.error('ERROR: ADMIN_EMAILS environment variable is not set!');
    console.error('Please set ADMIN_EMAILS in your .env file with comma-separated email addresses');
    return res.status(500).json({ 
      error: 'Server configuration error: ADMIN_EMAILS not set',
      message: 'Contact the administrator to configure admin access properly' 
    });
  }
  
  const adminEmails = adminEmailsEnv.split(',').map(e => e.trim().toLowerCase());
  
  console.log('Admin middleware check:', {
    userEmail: req.userEmail,
    adminEmails,
    isAdmin: req.userEmail && adminEmails.includes(req.userEmail.toLowerCase())
  });
  
  if (!req.userEmail || !adminEmails.includes(req.userEmail.toLowerCase())) {
    console.warn(`Unauthorized admin access attempt from: ${req.userEmail || 'unknown'}. Admin emails configured:`, adminEmails);
    return res.status(403).json({ error: 'Access denied: Admin privileges required' });
  }
  
  next();
}