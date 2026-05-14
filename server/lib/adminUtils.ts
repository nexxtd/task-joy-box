/**
 * Utility functions for admin-related operations
 */

export function isAdmin(email: string): boolean {
  if (!email) {
    console.warn('isAdmin: No email provided to check');
    return false;
  }
  
  const emailsStr = process.env.ADMIN_EMAILS || '';
  const adminEmails = emailsStr ? emailsStr.split(',').map(e => e.trim().toLowerCase()) : [];
  if (adminEmails.length === 0) {
    console.warn('No admin emails configured in ADMIN_EMAILS environment variable');
    return false;
  }
  
  const isEmailAdmin = adminEmails.includes(email.toLowerCase());
  console.log(`isAdmin check: email=${email}, is admin=${isEmailAdmin}, admins configured=${adminEmails.join(',')}`);
  
  return isEmailAdmin;
}