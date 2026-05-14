import { Router, Request, Response } from 'express';
import { db } from '../db';
import { users, organizations, organizationMembers, workspaces, type InsertOrganization, type InsertOrganizationMember } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Get user's organization
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Find organization where user is either owner or member
    const orgMembership = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, req.userId!))
      .leftJoin(organizations, eq(organizations.id, organizationMembers.organizationId));

    if (orgMembership.length === 0) {
      return res.status(200).json({ organization: null });
    }

    const orgData = orgMembership[0].organizations;

    if (!orgData) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const membership = orgMembership[0].organization_members;
    
    // Get all members of the organization
    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, orgData.id));

    res.json({
      organization: {
        id: orgData.id,
        name: orgData.name,
        type: orgData.type,
        ownerId: orgData.ownerId,
        maxSeats: orgData.maxSeats,
        currentSeats: orgData.currentSeats,
        tier: orgData.tier,
        status: orgData.status,
        members: members.map((m: any) => ({
          id: m.id,
          name: m.name || m.email.split('@')[0],
          email: m.email,
          role: m.role as 'Admin' | 'Member',
        }))
      }
    });
  } catch (error) {
    console.error('Get organization error:', error);
    res.status(500).json({ error: 'Failed to get organization' });
  }
});

// Create a new organization
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, maxSeats, tier } = req.body;

    if (!name || name.length < 3) {
      return res.status(400).json({ error: 'Organization name must be at least 3 characters' });
    }

    if (!['school', 'business', 'family'].includes(type)) {
      return res.status(400).json({ error: 'Invalid organization type. Must be school, business, or family' });
    }

    if (!maxSeats || maxSeats < 1) {
      return res.status(400).json({ error: 'Organization must have at least 1 seat' });
    }

    if (!['premium', 'pro'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid organization tier. Must be premium or pro' });
    }

    // Check if user already has an organization
    const existingOrg = await db
      .select()
      .from(organizations)
      .where(eq(organizations.ownerId, req.userId!));

    if (existingOrg.length > 0) {
      return res.status(400).json({ error: 'You already own an organization' });
    }

    // Create organization
    const [newOrg] = await db
      .insert(organizations)
      .values({
        name,
        type,
        ownerId: req.userId!,
        maxSeats: maxSeats,
        currentSeats: 1, // Owner counts as first seat
        tier: tier,
        status: 'pending', // Starts as pending until paid
      } as InsertOrganization)
      .returning();

    // Add creator as admin member
    await db.insert(organizationMembers).values({
      organizationId: newOrg.id,
      userId: req.userId!,
      role: 'admin',
    } as InsertOrganizationMember);

    // Get all members of the organization
    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, newOrg.id));

    res.json({
      organization: {
        id: newOrg.id,
        name: newOrg.name,
        type: newOrg.type,
        ownerId: newOrg.ownerId,
        maxSeats: newOrg.maxSeats,
        currentSeats: newOrg.currentSeats,
        tier: newOrg.tier,
        status: newOrg.status,
        members: members.map((m: any) => ({
          id: m.id,
          name: m.name || m.email.split('@')[0],
          email: m.email,
          role: m.role === 'admin' ? 'Admin' : 'Member',
        }))
      }
    });
  } catch (error) {
    console.error('Create organization error:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// Add a member to organization
router.post('/add-member', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;

    // Verify that the requesting user is an admin of an organization
    const memberships = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, req.userId!),
          eq(organizationMembers.role, 'admin')
        )
      );

    if (memberships.length === 0) {
      return res.status(403).json({ error: 'Only organization admins can add members' });
    }

    const orgId = memberships[0].organizationId;

    // Get organization to check seat availability
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId));

    if (org.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    if (org[0].currentSeats >= org[0].maxSeats) {
      return res.status(400).json({ error: `Organization has reached maximum seats (${org[0].maxSeats})` });
    }

    // Find user by email
    const targetUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (targetUser.length === 0) {
      return res.status(404).json({ error: 'User with this email does not exist' });
    }

    const targetUserId = targetUser[0].id;

    // Check if user is already a member
    const existingMember = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, targetUserId)
        )
      );

    if (existingMember.length > 0) {
      return res.status(400).json({ error: 'User is already a member of this organization' });
    }

    // Add user as member
    await db.insert(organizationMembers).values({
      organizationId: orgId,
      userId: targetUserId,
      role: 'member',
    } as InsertOrganizationMember);

    // Update current seat count
    await db
      .update(organizations)
      .set({ currentSeats: org[0].currentSeats + 1 } as any)
      .where(eq(organizations.id, orgId));

    res.json({ message: 'Member added successfully' });
  } catch (error) {
    console.error('Add member to organization error:', error);
    res.status(500).json({ error: 'Failed to add member to organization' });
  }
});

// Remove a member from organization
router.delete('/remove-member/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // Verify that the requesting user is an admin of an organization
    const memberships = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, req.userId!),
          eq(organizationMembers.role, 'admin')
        )
      );

    if (memberships.length === 0) {
      return res.status(403).json({ error: 'Only organization admins can remove members' });
    }

    const orgId = memberships[0].organizationId;

    // Check if the user to be removed is a member of the same organization
    const memberToRemove = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, parseInt(userId))
        )
      );

    if (memberToRemove.length === 0) {
      return res.status(404).json({ error: 'User is not a member of this organization' });
    }

    // Prevent removing the admin who owns the organization
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId));

    if (org.length > 0 && org[0].ownerId === parseInt(userId)) {
      return res.status(400).json({ error: 'Cannot remove the organization owner' });
    }

    // Remove the user from the organization
    await db
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, parseInt(userId))
        )
      );

    // Update current seat count
    await db
      .update(organizations)
      .set({ currentSeats: Math.max(1, org[0].currentSeats - 1) }) // Ensure at least 1 seat
      .where(eq(organizations.id, orgId));

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member from organization error:', error);
    res.status(500).json({ error: 'Failed to remove member from organization' });
  }
});

// Update organization seat count
router.put('/seats', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { maxSeats } = req.body;

    // Verify that the requesting user is the owner of an organization
    const orgs = await db
      .select()
      .from(organizations)
      .where(eq(organizations.ownerId, req.userId!));

    if (orgs.length === 0) {
      return res.status(403).json({ error: 'Only organization owners can update seat count' });
    }

    const orgId = orgs[0].id;

    if (maxSeats < orgs[0].currentSeats) {
      return res.status(400).json({ 
        error: `Cannot reduce seats below current usage (${orgs[0].currentSeats}). Remove members first.` 
      });
    }

    // Update max seat count
    await db
      .update(organizations)
      .set({ maxSeats: maxSeats } as any)
      .where(eq(organizations.id, orgId));

    res.json({ message: 'Seat count updated successfully' });
  } catch (error) {
    console.error('Update seat count error:', error);
    res.status(500).json({ error: 'Failed to update seat count' });
  }
});

export default router;