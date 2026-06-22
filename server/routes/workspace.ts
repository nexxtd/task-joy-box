import { Router, Request, Response } from 'express';
import { db } from '../db';
import { users, workspaces, workspaceMembers, groups, groupMembers, type InsertWorkspace, type InsertWorkspaceMember, type UpdateWorkspace } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../middleware/auth';
import paypalSdk from 'paypal-rest-sdk';
import crypto from 'crypto';
import { encrypt, decrypt } from '../lib/encryption';

const router = Router();

// Configure PayPal
const paypalConfigured = Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
if (paypalConfigured) {
  (paypalSdk as any).default ?? (paypalSdk as any).configure({
    mode: process.env.PAYPAL_MODE || 'sandbox', // Sandbox for testing, live for production
    client_id: process.env.PAYPAL_CLIENT_ID || '',
    client_secret: process.env.PAYPAL_CLIENT_SECRET || '',
  });
}

// Get user's workspace
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // Find workspace where user is either owner or member
    const wsMembership = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, req.userId!))
      .leftJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId));

    if (wsMembership.length === 0) {
      return res.status(200).json({ workspace: null });
    }

    const wsData = wsMembership[0].workspaces;
    const membership = wsMembership[0].workspace_members;
    
    // Get all members of the workspace
    if (!wsData) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, wsData.id));

    // Get all groups in the workspace
    const workspaceGroups = await db
      .select({
        id: groups.id,
        name: groups.name,
      })
      .from(groups)
      .where(eq(groups.workspaceId, wsData.id));

    // For each group, get the members
    const groupsWithMembers = await Promise.all(
      workspaceGroups.map(async (group) => {
        const groupUsers = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
          })
          .from(groupMembers)
          .innerJoin(users, eq(users.id, groupMembers.userId))
          .where(eq(groupMembers.groupId, group.id));

        return {
          ...group,
          members: groupUsers,
        };
      })
    );

    res.json({
      workspace: {
        id: wsData.id,
        name: wsData.name,
        ownerId: wsData.ownerId,
        inviteCode: wsData.inviteCode,
        type: wsData.type,
        seatTier: wsData.seatTier,
        seatCount: wsData.seatCount,
        billingStatus: wsData.billingStatus,
        maxGroups: wsData.maxGroups,
        members: members.map((m: any) => ({
          id: m.id,
          name: m.name || m.email.split('@')[0],
          email: m.email,
          role: m.role as 'owner' | 'member',
        })),
        teams: groupsWithMembers, // Changed from "groups" to "teams" in the response
      }
    });
  } catch (error) {
    console.error('Get workspace error:', error);
    res.status(500).json({ error: 'Failed to get workspace' });
  }
});

// Create a new workspace
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { name, type } = req.body;

    if (!name || name.length < 3) {
      return res.status(400).json({ error: 'Workspace name must be at least 3 characters' });
    }

    // Validate workspace type - only family and organization allowed
    const validTypes = ['family', 'organization'];
    if (type && !validTypes.includes(type)) {
      return res.status(400).json({ error: 'Invalid workspace type. Must be family or organization' });
    }

    // Check if user already has a workspace
    const existingWs = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, req.userId!));

    if (existingWs.length > 0) {
      return res.status(400).json({ error: 'You already own a workspace' });
    }

    // Check user's subscription tier - Premium or higher required for workspaces
    const userResult = await db
      .select({ subscriptionTier: users.subscriptionTier, subscriptionStatus: users.subscriptionStatus })
      .from(users)
      .where(eq(users.id, req.userId!));

    if (userResult.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userTier = userResult[0].subscriptionTier?.toLowerCase() || 'free';
    const userStatus = userResult[0].subscriptionStatus;

    // Require Premium or higher for workspace creation
    if (userTier === 'free' || (userTier !== 'premium' && userTier !== 'pro')) {
      return res.status(402).json({
        error: 'UPGRADE_REQUIRED',
        message: 'Premium or higher subscription required to create workspaces',
        requiredTier: 'premium',
        currentTier: userTier,
      });
    }

    // Check if subscription is active
    if (userStatus !== 'active') {
      return res.status(402).json({
        error: 'SUBSCRIPTION_INACTIVE',
        message: 'Your subscription is not active. Please renew to create workspaces.',
      });
    }

    // Determine max groups based on type
    let maxGroups = 3; // Default for family plan
    if (type === 'organization') {
      maxGroups = 5; // Default for organization
    }

    // Generate a unique invite code
    const inviteCode = crypto.randomBytes(20).toString('hex');

    // Create workspace
    const [newWs] = await db
      .insert(workspaces)
      .values({
        name,
        ownerId: req.userId!,
        inviteCode,
        type: type || 'family', // Default to family
        maxGroups,
      } as InsertWorkspace)
      .returning();

    // Add creator as owner member
    await db.insert(workspaceMembers).values({
      workspaceId: newWs.id,
      userId: req.userId!,
      role: 'owner',
    } as InsertWorkspaceMember);

    // Get all members of the workspace
    const members = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, newWs.id));

    res.json({
      workspace: {
        id: newWs.id,
        name: newWs.name,
        ownerId: newWs.ownerId,
        inviteCode: newWs.inviteCode,
        type: newWs.type,
        seatTier: newWs.seatTier,
        seatCount: newWs.seatCount,
        billingStatus: newWs.billingStatus,
        maxGroups: newWs.maxGroups,
        members: members.map((m: any) => ({
          id: m.id,
          name: m.name || m.email.split('@')[0],
          email: m.email,
          role: m.role as 'owner' | 'member',
        })),
        teams: [], // Changed from "groups" to "teams" in the response
      }
    });
  } catch (error) {
    console.error('Create workspace error:', error);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// Invite a member to workspace
router.post('/invite', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { email, workspaceId } = req.body;

    if (!email || !workspaceId) {
      return res.status(400).json({ error: 'Email and workspaceId are required' });
    }

    // Verify that the requesting user is part of the workspace
    const memberships = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, req.userId!),
          eq(workspaceMembers.workspaceId, workspaceId)
        )
      );

    if (memberships.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this workspace' });
    }

    // Enforce seat limit first
    const currentMembers = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId));

    const wsResult = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId));

    if (wsResult.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    const ws = wsResult[0];
    const allowedSeats = ws.billingStatus === 'active' ? ws.seatCount : 3; // Allow 3 free seats

    if (currentMembers.length >= allowedSeats) {
      return res.status(402).json({
        error: 'SEAT_LIMIT_REACHED',
        message: 'Add more seats to invite teammates.',
        currentSeats: ws.seatCount,
        usedSeats: currentMembers.length,
      });
    }

    // Check if user with this email already exists
    const targetUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email));

    if (targetUser.length > 0) {
      const targetUserId = targetUser[0].id;

      // Check if user is already a member
      const existingMember = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, targetUserId)
          )
        );

      if (existingMember.length > 0) {
        return res.status(400).json({ error: 'User is already a member of this workspace' });
      }

      // Add existing user as member
      await db.insert(workspaceMembers).values({
        workspaceId: workspaceId,
        userId: targetUserId,
        role: 'member',
      } as InsertWorkspaceMember);

      return res.json({ 
        message: 'Member invited successfully', 
        user: { id: targetUser[0].id, name: targetUser[0].name, email: targetUser[0].email }
      });
    }

    // For non-existing users, store a pending invitation
    // In a real app, you'd send an email here
    // For now, we'll create a temporary invite record or just return a message

    // Generate a pending invite token
    const inviteToken = crypto.randomBytes(32).toString('hex');

    // TODO: Store pending invite in database and send email
    // For now, return a message that user needs to register first
    res.status(202).json({
      message: 'Invitation prepared for ' + email,
      pending: true,
      note: 'User will be added to workspace when they register with this email',
      inviteToken
    });
  } catch (error) {
    console.error('Invite member to workspace error:', error);
    res.status(500).json({ error: 'Failed to invite member to workspace' });
  }
});

// Create a group within a workspace
router.post('/workspace/:workspaceId/group', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { name } = req.body;

    if (!name || name.length < 2) {
      return res.status(400).json({ error: 'Group name must be at least 2 characters' });
    }

    // Verify that the requesting user is part of the workspace
    const memberships = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, req.userId!),
          eq(workspaceMembers.workspaceId, parseInt(workspaceId))
        )
      );

    if (memberships.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this workspace' });
    }

    // Check if user is the owner (only owner can create groups)
    if (memberships[0].role !== 'owner') {
      return res.status(403).json({ error: 'Only workspace owner can create groups' });
    }

    // Check if workspace exists and get max groups
    const wsResult = await db
      .select({ maxGroups: workspaces.maxGroups })
      .from(workspaces)
      .where(eq(workspaces.id, parseInt(workspaceId)));

    if (wsResult.length === 0) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    // Check if max groups limit is reached
    const currentGroups = await db
      .select()
      .from(groups)
      .where(eq(groups.workspaceId, parseInt(workspaceId)));

    if (currentGroups.length >= wsResult[0].maxGroups) {
      return res.status(400).json({ error: `Maximum number of groups (${wsResult[0].maxGroups}) reached for this workspace` });
    }

    // Create the group
    const [newGroup] = await db
      .insert(groups)
      .values({
        name,
        workspaceId: parseInt(workspaceId),
      })
      .returning();

    res.json({ group: newGroup });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Add a member to a group
router.post('/workspace/:workspaceId/group/:groupId/add-member', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, groupId } = req.params;
    const { userId } = req.body;

    // Verify that the requesting user is part of the workspace
    const memberships = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, req.userId!),
          eq(workspaceMembers.workspaceId, parseInt(workspaceId))
        )
      );

    if (memberships.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this workspace' });
    }

    // Check if user is the owner (only owner can add members to groups)
    if (memberships[0].role !== 'owner') {
      return res.status(403).json({ error: 'Only workspace owner can add members to groups' });
    }

    // Verify that the user exists in the workspace
    const workspaceMember = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, parseInt(workspaceId)),
          eq(workspaceMembers.userId, userId)
        )
      );

    if (workspaceMember.length === 0) {
      return res.status(404).json({ error: 'User is not a member of this workspace' });
    }

    // Check if the group belongs to the workspace
    const group = await db
      .select()
      .from(groups)
      .where(
        and(
          eq(groups.id, parseInt(groupId)),
          eq(groups.workspaceId, parseInt(workspaceId))
        )
      );

    if (group.length === 0) {
      return res.status(404).json({ error: 'Group does not belong to this workspace' });
    }

    // Check if user is already in this group
    const existingGroupMember = await db
      .select()
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, parseInt(groupId)),
          eq(groupMembers.userId, userId)
        )
      );

    if (existingGroupMember.length > 0) {
      return res.status(400).json({ error: 'User is already a member of this group' });
    }

    // Add user to the group
    await db.insert(groupMembers).values({
      groupId: parseInt(groupId),
      userId: userId,
    });

    res.json({ message: 'Member added to group successfully' });
  } catch (error) {
    console.error('Add member to group error:', error);
    res.status(500).json({ error: 'Failed to add member to group' });
  }
});

// Remove a member from a group
router.delete('/workspace/:workspaceId/group/:groupId/remove-member/:userId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId, groupId, userId } = req.params;

    // Verify that the requesting user is part of the workspace
    const memberships = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, req.userId!),
          eq(workspaceMembers.workspaceId, parseInt(workspaceId))
        )
      );

    if (memberships.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this workspace' });
    }

    // Check if user is the owner (only owner can remove members from groups)
    if (memberships[0].role !== 'owner') {
      return res.status(403).json({ error: 'Only workspace owner can remove members from groups' });
    }

    // Check if the group belongs to the workspace
    const group = await db
      .select()
      .from(groups)
      .where(
        and(
          eq(groups.id, parseInt(groupId)),
          eq(groups.workspaceId, parseInt(workspaceId))
        )
      );

    if (group.length === 0) {
      return res.status(404).json({ error: 'Group does not belong to this workspace' });
    }

    // Remove user from the group
    await db.delete(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, parseInt(groupId)),
          eq(groupMembers.userId, parseInt(userId))
        )
      );

    res.json({ message: 'Member removed from group successfully' });
  } catch (error) {
    console.error('Remove member from group error:', error);
    res.status(500).json({ error: 'Failed to remove member from group' });
  }
});

// Create a PayPal checkout session for workspace seats
router.post('/workspace/:workspaceId/billing/checkout', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { tier, seats } = req.body;

    if (!['premium', 'pro'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier selected' });
    }

    if (typeof seats !== 'number' || seats < 1) {
      return res.status(400).json({ error: 'Invalid number of seats' });
    }

    // Verify workspace ownership
    const ws = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, parseInt(workspaceId)), eq(workspaces.ownerId, req.userId!)));

    if (ws.length === 0) {
      return res.status(403).json({ error: 'Not authorized to manage this workspace' });
    }

    const workspace = ws[0];
    const pricePerSeat = tier === 'premium' ? 3 : 8; // $3/user/mo for premium, $8/user/mo for pro
    const totalPrice = pricePerSeat * seats;

    if (!paypalConfigured) {
      return res.status(503).json({ error: 'PayPal is not configured on this server' });
    }

    const paypal = (paypalSdk as any).default ?? (paypalSdk as any);
    
    const paymentData = {
      intent: 'sale',
      payer: { payment_method: 'paypal' },
      redirect_urls: {
        return_url: `${process.env.FRONTEND_URL || 'http://localhost:5000'}/api/workspace/execute-payment`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:5000'}/collaboration?workspace_payment=cancelled`,
      },
      transactions: [{
        item_list: {
          items: [{
            name: `${tier.charAt(0).toUpperCase() + tier.slice(1)} Plan Seats`,
            sku: `workspace_${tier}_seats`,
            price: pricePerSeat.toFixed(2),
            currency: 'USD',
            quantity: seats,
          }]
        },
        amount: { currency: 'USD', total: totalPrice.toFixed(2) },
        description: `${seats} seats for ${workspace.name}`,
      }]
    };

    paypal.payment.create(paymentData, (error: any, payment: any) => {
      if (error) {
        console.error('PayPal payment creation error:', error);
        return res.status(500).json({ error: 'Failed to create PayPal payment' });
      }
      const approvalUrl = payment.links.find((l: any) => l.rel === 'approval_url')?.href;
      res.json({ approvalUrl, paymentId: payment.id });
    });
  } catch (error) {
    console.error('Error creating workspace checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Execute PayPal payment for workspace
router.get('/execute-payment', requireAuth, async (req: AuthRequest, res: Response) => {
  if (!paypalConfigured) {
    return res.status(503).json({ error: 'PayPal is not configured' });
  }

  const { paymentId, PayerID } = req.query;

  if (!paymentId || !PayerID) {
    return res.status(400).json({ error: 'Missing payment parameters' });
  }

  const paypal = (paypalSdk as any).default ?? (paypalSdk as any);
  
  paypal.payment.execute(paymentId as string, { payer_id: PayerID as string }, async (error: any, payment: any) => {
    if (error) {
      console.error('PayPal workspace payment execution error:', error);
      res.status(500).json({ error: 'Failed to execute PayPal payment' });
    } else {
      try {
        // Extract tier and seats from the payment object
        const sku = payment.transactions[0].item_list?.items[0]?.sku;
        const tierMatch = sku?.match(/workspace_(.*)_seats/);
        const tier = tierMatch ? tierMatch[1] : 'pro';
        const seats = payment.transactions[0].item_list?.items[0]?.quantity || 1;
        
        // Extract workspace details from payment
        const workspaceName = payment.transactions[0].description?.match(/(.*) seats for (.*)/)?.[2] || 'Unknown';
        
        // Find the workspace by name and owner
        const [workspace] = await db
          .select()
          .from(workspaces)
          .where(and(
            eq(workspaces.name, workspaceName),
            eq(workspaces.ownerId, req.userId!)
          ));

        if (workspace) {
          // Update workspace status in the database
          await db.update(workspaces)
            .set({ 
              seatTier: tier,
              seatCount: seats,
              billingStatus: 'active' 
            } as UpdateWorkspace)
            .where(eq(workspaces.id, workspace.id));
        }

        res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5000'}/collaboration?workspace_payment=success`);
      } catch (dbError) {
        console.error('Database update error:', dbError);
        res.status(500).json({ error: 'Failed to update workspace status' });
      }
    }
  });
});


// Export the router
export default router;