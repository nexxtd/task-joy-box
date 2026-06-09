/**
 * Utility functions for admin-related operations
 */

export function isAdmin(email: string): boolean {
  if (!email) return false;
  
  const emailsStr = process.env.ADMIN_EMAILS || '';
  const adminEmails = emailsStr ? emailsStr.split(',').map(e => e.trim().toLowerCase()) : [];
  if (adminEmails.length === 0) return false;
  
  return adminEmails.includes(email.toLowerCase());
}