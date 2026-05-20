import express from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { whiteboards, whiteboardItems, whiteboardConnections } from '../../shared/schema';
import { useAuth } from '../middleware/auth';

const router = express.Router();

// Get all whiteboards for the authenticated user
router.get('/', useAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    
    const userWhiteboards = await db
      .select()
      .from(whiteboards)
      .where(eq(whiteboards.userId, userId));
      
    res.json(userWhiteboards);
  } catch (error) {
    console.error('Error fetching whiteboards:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific whiteboard by ID
router.get('/:id', useAuth, async (req, res) => {
  try {
    const whiteboardId = parseInt(req.params.id, 10);
    const userId = req.user!.id;
    
    const whiteboard = await db.query.whiteboards.findFirst({
      where: (wb) => eq(wb.id, whiteboardId),
      // We'll fetch items and connections separately to avoid complex joins
    });
    
    if (!whiteboard) {
      return res.status(404).json({ error: 'Whiteboard not found' });
    }
    
    if (whiteboard.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Fetch items and connections for this whiteboard
    const items = await db
      .select()
      .from(whiteboardItems)
      .where(eq(whiteboardItems.whiteboardId, whiteboardId));
      
    const connections = await db
      .select()
      .from(whiteboardConnections)
      .where(eq(whiteboardConnections.whiteboardId, whiteboardId));
    
    res.json({
      ...whiteboard,
      items,
      connections
    });
  } catch (error) {
    console.error('Error fetching whiteboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new whiteboard
router.post('/', useAuth, async (req, res) => {
  try {
    const { name, description, items = [], connections = [] } = req.body;
    const userId = req.user!.id;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // Start a transaction to ensure data consistency
    const result = await db.transaction(async (tx) => {
      // Create the whiteboard
      const [newWhiteboard] = await tx
        .insert(whiteboards)
        .values({
          name,
          description: description || '',
          userId
        })
        .returning();
      
      if (!newWhiteboard) {
        throw new Error('Failed to create whiteboard');
      }
      
      // Create items if provided
      if (items && items.length > 0) {
        const itemsToInsert = items.map(item => ({
          whiteboardId: newWhiteboard.id,
          type: item.type,
          x: Math.round(item.x),
          y: Math.round(item.y),
          width: item.width ? Math.round(item.width) : undefined,
          height: item.height ? Math.round(item.height) : undefined,
          content: item.content,
          color: item.color,
          title: item.title,
          tasks: item.tasks ? JSON.stringify(item.tasks) : undefined,
          imageUrl: item.imageUrl,
          fileUrl: item.fileUrl
        }));
        
        await tx.insert(whiteboardItems).values(itemsToInsert);
      }
      
      // Create connections if provided
      if (connections && connections.length > 0) {
        const connectionsToInsert = connections.map(conn => ({
          whiteboardId: newWhiteboard.id,
          sourceItemId: conn.sourceId,
          targetItemId: conn.targetId,
          connectionType: conn.type
        }));
        
        await tx.insert(whiteboardConnections).values(connectionsToInsert);
      }
      
      return newWhiteboard;
    });
    
    res.status(201).json(result);
  } catch (error) {
    console.error('Error creating whiteboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update an existing whiteboard
router.put('/:id', useAuth, async (req, res) => {
  try {
    const whiteboardId = parseInt(req.params.id, 10);
    const { name, description, items = [], connections = [] } = req.body;
    const userId = req.user!.id;
    
    // Verify the whiteboard belongs to the user
    const existingWhiteboard = await db.query.whiteboards.findFirst({
      where: (wb) => eq(wb.id, whiteboardId)
    });
    
    if (!existingWhiteboard) {
      return res.status(404).json({ error: 'Whiteboard not found' });
    }
    
    if (existingWhiteboard.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Update the whiteboard
    const [updatedWhiteboard] = await db
      .update(whiteboards)
      .set({
        name,
        description: description || '',
        updatedAt: new Date().toISOString()
      })
      .where(eq(whiteboards.id, whiteboardId))
      .returning();
      
    if (!updatedWhiteboard) {
      return res.status(500).json({ error: 'Failed to update whiteboard' });
    }
    
    // Perform updates in a transaction
    await db.transaction(async (tx) => {
      // Clear existing items and connections
      await tx
        .delete(whiteboardItems)
        .where(eq(whiteboardItems.whiteboardId, whiteboardId));
        
      await tx
        .delete(whiteboardConnections)
        .where(eq(whiteboardConnections.whiteboardId, whiteboardId));
      
      // Insert updated items
      if (items && items.length > 0) {
        const itemsToInsert = items.map(item => ({
          whiteboardId,
          type: item.type,
          x: Math.round(item.x),
          y: Math.round(item.y),
          width: item.width ? Math.round(item.width) : undefined,
          height: item.height ? Math.round(item.height) : undefined,
          content: item.content,
          color: item.color,
          title: item.title,
          tasks: item.tasks ? JSON.stringify(item.tasks) : undefined,
          imageUrl: item.imageUrl,
          fileUrl: item.fileUrl
        }));
        
        await tx.insert(whiteboardItems).values(itemsToInsert);
      }
      
      // Insert updated connections
      if (connections && connections.length > 0) {
        const connectionsToInsert = connections.map(conn => ({
          whiteboardId,
          sourceItemId: conn.sourceId,
          targetItemId: conn.targetId,
          connectionType: conn.type
        }));
        
        await tx.insert(whiteboardConnections).values(connectionsToInsert);
      }
    });
    
    res.json(updatedWhiteboard);
  } catch (error) {
    console.error('Error updating whiteboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a whiteboard
router.delete('/:id', useAuth, async (req, res) => {
  try {
    const whiteboardId = parseInt(req.params.id, 10);
    const userId = req.user!.id;
    
    // Verify the whiteboard belongs to the user
    const existingWhiteboard = await db.query.whiteboards.findFirst({
      where: (wb) => eq(wb.id, whiteboardId)
    });
    
    if (!existingWhiteboard) {
      return res.status(404).json({ error: 'Whiteboard not found' });
    }
    
    if (existingWhiteboard.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Delete the whiteboard (and its items/connections via foreign key constraints)
    await db
      .delete(whiteboards)
      .where(eq(whiteboards.id, whiteboardId));
    
    res.status(204).send(); // No content
  } catch (error) {
    console.error('Error deleting whiteboard:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;