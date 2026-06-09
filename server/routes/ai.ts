import 'dotenv/config';
import { Router, Response, Request } from 'express';
import OpenAI from 'openai';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { db } from '../db';
import { users, tasks, boards, columns, aiRequests } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';

const router = Router();

// Cache for storing similar requests to reduce API usage
const requestCache = new Map<string, { response: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache duration

let openRouter: OpenAI | null = null;

if (!process.env.OPENROUTER_API_KEY) {
  console.warn('WARNING: OPENROUTER_API_KEY is not set. AI features will be unavailable.');
} else {
  try {
    openRouter = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    console.log('OpenRouter service initialized successfully');
  } catch (e) {
    console.error('ERROR: Failed to initialize OpenRouter service:', e);
  }
}

function getOpenRouter(): OpenAI | null {
  if (openRouter) return openRouter;
  if (!process.env.OPENROUTER_API_KEY) {
    return null;
  }
  try {
    openRouter = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    return openRouter;
  } catch (e) {
    console.error('Failed to initialize OpenRouter:', e);
    return null;
  }
}

const AI_MODEL = process.env.AI_MODEL || 'openrouter/free';

// Helper function to create cache key based on request parameters
function createCacheKey(input: string, model: string): string {
  // Create a hash-like key from the input and model
  const inputHash = Array.from(input).reduce((acc, char) =>
    acc + char.charCodeAt(0), 0);
  return `${model}:${inputHash}:${Math.floor(input.length / 100)}`;
}

async function extractJsonFromResponse(text: string) {
  try {
    // Try to find JSON within code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    let jsonText = codeBlockMatch ? codeBlockMatch[1].trim() : text;

    // Find the actual JSON portion if it's mixed with other text
    const jsonStart = jsonText.indexOf('{');
    const jsonEnd = jsonText.lastIndexOf('}') + 1;

    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      jsonText = jsonText.substring(jsonStart, jsonEnd);
    }

    return JSON.parse(jsonText);
  } catch (parseError) {
    console.error('Failed to parse AI response:', parseError);
    console.error('Raw response:', text);
    throw new Error('Invalid JSON response from AI service');
  }
}

function sanitize(str: string): string {
  return str.trim().replace(/<[^>]*>/g, '').slice(0, 2000);
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function getAuthenticatedUser(req: AuthRequest, res: Response) {
  if (!req.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      subscriptionTier: users.subscriptionTier,
      subscriptionStatus: users.subscriptionStatus,
    })
    .from(users)
    .where(eq(users.id, req.userId))
    .limit(1);

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  return user;
}

async function requireProTier(req: AuthRequest, res: Response) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return null;

  if (user.subscriptionTier !== 'pro' && user.subscriptionTier !== 'premium' && user.subscriptionStatus !== 'active') {
    res.status(403).json({
      error: 'Pro subscription required',
      currentTier: user.subscriptionTier || 'free',
      currentStatus: user.subscriptionStatus || 'inactive',
      requiredTier: 'pro',
    });
    return null;
  }

  return user;
}

async function requirePremiumTier(req: AuthRequest, res: Response) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return null;

  if (user.subscriptionTier !== 'premium' && user.subscriptionStatus !== 'active') {
    res.status(403).json({
      error: 'Premium subscription required',
      currentTier: user.subscriptionTier || 'free',
      currentStatus: user.subscriptionStatus || 'inactive',
      requiredTier: 'premium',
    });
    return null;
  }

  return user;
}

// Add delay function
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Add AI request function with retry and caching
async function generateContentWithRetry(prompt: string, retries = 1, useFallback = true) {
  // Create cache key for this request
  const cacheKey = createCacheKey(prompt, AI_MODEL);
  const cached = requestCache.get(cacheKey);

  // Return cached response if available and not expired
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('Returning cached response');
    return cached.response;
  }

  const client = getOpenRouter();
  if (!client) {
    throw new Error('OpenRouter service is not available');
  }

  for (let i = 0; i <= retries; i++) {
    try {
      const completion = await client.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: AI_MODEL,
        temperature: 0.7,
        max_tokens: 500,
      });

      console.log('OpenRouter response:', JSON.stringify({ choices: completion.choices?.length, model: completion.model, id: completion.id }));

      const responseText = completion.choices?.[0]?.message?.content || '';

      // Cache the response
      requestCache.set(cacheKey, {
        response: responseText,
        timestamp: Date.now()
      });

      return responseText;
    } catch (error: any) {
      // Handle rate limit errors specifically
      if (error.status === 429) {
        // Reduced delay for faster retries in professional environment
        const delayMs = 3000; 

        console.log(`Rate limit exceeded, retrying in ${delayMs}ms... (Attempt ${i + 1}/${retries})`);
        await delay(delayMs);
        continue;
      }

      // If it's not a rate limit error, throw the error
      throw error;
    }
  }
}

// Enhanced route to get user data for AI
router.post('/get-user-data', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req, res);
    if (!user) return;

    const userTasks = await db.select()
      .from(tasks)
      .leftJoin(boards, eq(tasks.boardId, boards.id))
      .leftJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(boards.userId, user.id))
      .orderBy(desc(tasks.createdAt));

    // Fetch user's boards
    const userBoards = await db.select().from(boards).where(eq(boards.userId, user.id));

    // Format the data for the AI
    const userData = {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
      },
      boards: userBoards,
      tasks: userTasks.map((row: any) => ({
        id: row.tasks.id,
        title: row.tasks.title,
        description: row.tasks.description || '',
        priority: row.tasks.priority,
        dueDate: row.tasks.dueDate || null,
        createdAt: row.tasks.createdAt,
        updatedAt: row.tasks.updatedAt,
        columnId: row.tasks.columnId,
        boardId: row.tasks.boardId,
        order: row.tasks.order,
        columnName: row.columns?.title || 'Unknown',
        boardName: row.boards?.name || 'Unknown'
      })),
      taskCount: userTasks.length,
      completedCount: userTasks.filter((t: any) => t.tasks.columnId && t.columns?.title?.toLowerCase().includes('done')).length,
      pendingCount: userTasks.filter((t: any) => t.tasks.columnId && !t.columns?.title?.toLowerCase().includes('done')).length,
    };

    res.json(userData);
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

// New route to create a task
router.post('/create-task', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req, res);
    if (!user) return;

    const { title, description, priority, dueDate, boardId, columnId } = req.body;
    const parsedBoardId = parsePositiveInt(boardId);
    const parsedColumnId = parsePositiveInt(columnId);

    if (!title || !parsedBoardId || !parsedColumnId) {
      return res.status(400).json({ error: 'Title, boardId, and columnId are required' });
    }

    // Verify the user owns the board
    const userBoard = await db.select().from(boards).where(
      eq(boards.id, parsedBoardId)
    ).limit(1);

    if (!userBoard.length || userBoard[0].userId !== user.id) {
      return res.status(403).json({ error: 'Access denied to this board' });
    }

    // Get the next order value for the column
    const lastTask = await db.select({ order: tasks.order })
      .from(tasks)
      .where(eq(tasks.columnId, parsedColumnId))
      .orderBy(desc(tasks.order))
      .limit(1);

    const nextOrder = lastTask.length > 0 ? lastTask[0].order + 1 : 0;

    // Insert the new task
    const [newTask] = await db.insert(tasks).values({
      title,
      description: description || '',
      priority: priority || 'none',
      dueDate: dueDate || null,
      boardId: parsedBoardId,
      columnId: parsedColumnId,
      order: nextOrder,
    }).returning();

    res.json({ task: newTask, message: 'Task created successfully' });
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// New route to delete a task
router.post('/delete-task', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req, res);
    if (!user) return;

    const { taskId } = req.body;

    const parsedTaskId = parsePositiveInt(taskId);
    if (!parsedTaskId) {
      return res.status(400).json({ error: 'taskId is required' });
    }

    // Get the task and verify ownership
    const taskRows = await db.select()
      .from(tasks)
      .leftJoin(boards, eq(tasks.boardId, boards.id))
      .where(eq(tasks.id, parsedTaskId));

    if (!taskRows.length) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (taskRows[0]?.boards?.userId !== user.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Delete the task
    await db.delete(tasks).where(eq(tasks.id, parsedTaskId));

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

router.post('/suggest-schedule', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const client = getOpenRouter();
    if (!client) return res.status(503).json({ error: 'AI service is currently unavailable' });

    const { tasks: inputTasks, energyLevels } = req.body;
    const safeTasksStr = sanitize(JSON.stringify(inputTasks || []));
    const safeEnergy = sanitize(JSON.stringify(energyLevels || {}));

    // Get user's data for context
    const userDataResponse = await db.select()
      .from(tasks)
      .leftJoin(boards, eq(tasks.boardId, boards.id))
      .leftJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(boards.userId, req.userId!))
      .orderBy(desc(tasks.createdAt));

    const userData = {
      tasks: userDataResponse.map((row: any) => ({
        id: row.tasks.id,
        title: row.tasks.title,
        description: row.tasks.description || '',
        priority: row.tasks.priority,
        dueDate: row.tasks.dueDate || null,
        createdAt: row.tasks.createdAt,
        updatedAt: row.tasks.updatedAt,
        columnId: row.tasks.columnId,
        boardId: row.tasks.boardId,
        order: row.tasks.order,
        columnName: row.columns?.title || 'Unknown',
        boardName: row.boards?.name || 'Unknown'
      }))
    };

    const prompt = `You are a productivity AI assistant. Based on these tasks and energy levels, suggest an optimal daily schedule.

User's current tasks: ${JSON.stringify(userData.tasks.slice(0, 20))}  // Limit to first 20 tasks
Tasks to schedule (JSON): ${safeTasksStr}
Energy levels: ${safeEnergy}

Respond with a JSON object like:
{
  "schedule": [
    { "time": "9:00 AM", "task": "task title", "reason": "why this time" }
  ],
  "tips": ["tip1", "tip2"],
  "insight": "one sentence overview"
}
Only respond with valid JSON, no markdown.`;

    const responseText = await generateContentWithRetry(prompt);

    try {
      const data = await extractJsonFromResponse(responseText);
      res.json(data);
    } catch (parseError) {
      console.error('Failed to parse response for suggest-schedule');
      return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
    }
  } catch (e) {
    console.error('AI request failed for suggest-schedule');
    res.status(500).json({ error: 'AI request failed. Please try again.' });
  }
});

router.post('/analyze-tasks', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const client = getOpenRouter();
    if (!client) {
      return res.status(503).json({
        error: 'AI service is currently unavailable. Please set up your OPENROUTER_API_KEY.'
      });
    }

    const { tasks: inputTasks } = req.body;
    if (!Array.isArray(inputTasks)) {
      return res.status(400).json({ error: 'Tasks array is required' });
    }

    const safeTasksStr = sanitize(JSON.stringify(inputTasks || []));

    // Get user's data for context
    const userDataResponse = await db.select()
      .from(tasks)
      .leftJoin(boards, eq(tasks.boardId, boards.id))
      .leftJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(boards.userId, req.userId!))
      .orderBy(desc(tasks.createdAt));

    const userData = {
      tasks: userDataResponse.map((row: any) => ({
        id: row.tasks.id,
        title: row.tasks.title,
        description: row.tasks.description || '',
        priority: row.tasks.priority,
        dueDate: row.tasks.dueDate || null,
        createdAt: row.tasks.createdAt,
        updatedAt: row.tasks.updatedAt,
        columnId: row.tasks.columnId,
        boardId: row.tasks.boardId,
        order: row.tasks.order,
        columnName: row.columns?.title || 'Unknown',
        boardName: row.boards?.name || 'Unknown'
      }))
    };

    const prompt = `Analyze these tasks and provide productivity insights:

User's current tasks: ${JSON.stringify(userData.tasks.slice(0, 20))}  // Limit to first 20 tasks
Tasks: ${safeTasksStr}

Respond with JSON:
{
  "overallScore": 75,
  "insights": ["insight1", "insight2", "insight3"],
  "recommendations": ["rec1", "rec2"],
  "focusArea": "The most critical thing to focus on"
}
Only respond with valid JSON, no markdown.`;

    const responseText = await generateContentWithRetry(prompt);

    try {
      const data = await extractJsonFromResponse(responseText);
      res.json(data);
    } catch (parseError) {
      console.error('Failed to parse response for analyze-tasks:', parseError);
      return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
    }
  } catch (e) {
    console.error('AI request failed for analyze-tasks:', e);
    res.status(500).json({ error: 'AI request failed. Please try again.' });
  }
});

router.post('/generate-subtasks', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const client = getOpenRouter();
    if (!client) {
      return res.status(503).json({
        error: 'AI service is currently unavailable. Please set up your OPENROUTER_API_KEY.'
      });
    }

    const title = sanitize(req.body.title || '');
    const description = sanitize(req.body.description || '');
    if (!title) {
      return res.status(400).json({ error: 'Task title required' });
    }

    // Get user's data for context
    const userDataResponse = await db.select()
      .from(tasks)
      .leftJoin(boards, eq(tasks.boardId, boards.id))
      .leftJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(boards.userId, req.userId!))
      .orderBy(desc(tasks.createdAt));

    const userData = {
      tasks: userDataResponse.map((row: any) => ({
        id: row.tasks.id,
        title: row.tasks.title,
        description: row.tasks.description || '',
        priority: row.tasks.priority,
        dueDate: row.tasks.dueDate || null,
        createdAt: row.tasks.createdAt,
        updatedAt: row.tasks.updatedAt,
        columnId: row.tasks.columnId,
        boardId: row.tasks.boardId,
        order: row.tasks.order,
        columnName: row.columns?.title || 'Unknown',
        boardName: row.boards?.name || 'Unknown'
      }))
    };

    const prompt = `Break this task into clear, actionable subtasks:

User's current tasks: ${JSON.stringify(userData.tasks.slice(0, 20))}  // Limit to first 20 tasks
Title: ${title}
Description: ${description}

Respond with JSON:
{
  "subtasks": ["subtask1", "subtask2", "subtask3", "subtask4", "subtask5"],
  "estimatedHours": 3,
  "difficulty": "medium"
}
Only respond with valid JSON, no markdown.`;

    const responseText = await generateContentWithRetry(prompt);

    try {
      const data = await extractJsonFromResponse(responseText);
      res.json(data);
    } catch (parseError) {
      console.error('Failed to parse response for generate-subtasks:', parseError);
      return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
    }
  } catch (e) {
    console.error('AI request failed for generate-subtasks:', e);
    res.status(500).json({ error: 'AI request failed. Please try again.' });
  }
});

router.post('/daily-plan', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const client = getOpenRouter();
    if (!client) {
      return res.status(503).json({
        error: 'AI service is currently unavailable. Please set up your OPENROUTER_API_KEY.'
      });
    }

    const { tasks: inputTasks, date } = req.body;
    if (!Array.isArray(inputTasks)) {
      return res.status(400).json({ error: 'Tasks array is required' });
    }

    const safeTasksStr = sanitize(JSON.stringify(inputTasks || []));
    const safeDate = sanitize(date || new Date().toDateString());

    // Get user's data for context
    const userDataResponse = await db.select()
      .from(tasks)
      .leftJoin(boards, eq(tasks.boardId, boards.id))
      .leftJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(boards.userId, req.userId!))
      .orderBy(desc(tasks.createdAt));

    const userData = {
      tasks: userDataResponse.map((row: any) => ({
        id: row.tasks.id,
        title: row.tasks.title,
        description: row.tasks.description || '',
        priority: row.tasks.priority,
        dueDate: row.tasks.dueDate || null,
        createdAt: row.tasks.createdAt,
        updatedAt: row.tasks.updatedAt,
        columnId: row.tasks.columnId,
        boardId: row.tasks.boardId,
        order: row.tasks.order,
        columnName: row.columns?.title || 'Unknown',
        boardName: row.boards?.name || 'Unknown'
      }))
    };

    const prompt = `Create a motivating and practical daily plan for ${safeDate}:

User's current tasks: ${JSON.stringify(userData.tasks.slice(0, 20))}  // Limit to first 20 tasks
Tasks available: ${safeTasksStr}

Respond with JSON:
{
  "greeting": "motivating morning message",
  "plan": [
    { "period": "Morning (9-12)", "focus": "what to work on", "tasks": ["task1"] },
    { "period": "Afternoon (12-17)", "focus": "what to work on", "tasks": ["task2"] },
    { "period": "Evening (17-20)", "focus": "wrap up", "tasks": [] }
  ],
  "motivation": "encouraging quote or tip",
  "priorityAlert": "most urgent task to handle first or null"
}
Only respond with valid JSON, no markdown.`;

    const responseText = await generateContentWithRetry(prompt);

    try {
      const data = await extractJsonFromResponse(responseText);
      res.json(data);
    } catch (parseError) {
      console.error('Failed to parse response for daily-plan:', parseError);
      return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
    }
  } catch (e) {
    console.error('AI request failed for daily-plan:', e);
    res.status(500).json({ error: 'AI request failed. Please try again.' });
  }
});

router.post('/chat', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const client = getOpenRouter();
    if (!client) {
      return res.status(503).json({
        error: 'AI service is currently unavailable. Please set up your OPENROUTER_API_KEY in the .env file.'
      });
    }

    const { message, context } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get user's data for context
    const userDataResponse = await db.select()
      .from(tasks)
      .leftJoin(boards, eq(tasks.boardId, boards.id))
      .leftJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(boards.userId, req.userId!))
      .orderBy(desc(tasks.createdAt));

    const userData = {
      tasks: userDataResponse.map((row: any) => ({
        id: row.tasks.id,
        title: row.tasks.title,
        description: row.tasks.description || '',
        priority: row.tasks.priority,
        dueDate: row.tasks.dueDate || null,
        createdAt: row.tasks.createdAt,
        updatedAt: row.tasks.updatedAt,
        columnId: row.tasks.columnId,
        boardId: row.tasks.boardId,
        order: row.tasks.order,
        columnName: row.columns?.title || 'Unknown',
        boardName: row.boards?.name || 'Unknown'
      }))
    };

    const safeMessage = sanitize(message);
    const safeContext = context ? sanitize(JSON.stringify(context)) : '';

    const completion = await client.chat.completions.create({
      messages: [{
        role: 'system', content: `You are Joy, a helpful productivity assistant for a task management app called Task Joy Box.

When the user asks to CREATE a task, DELETE a task, MOVE a task, UPDATE a task priority, or perform other board actions, you MUST respond with a JSON action object AND a friendly message.

Respond in this exact format:
{"action": "create", "title": "Task Title", "description": "", "priority": "medium", "columnName": "To Do", "message": "Friendly confirmation"}
OR
{"action": "delete", "taskTitle": "Task Title", "message": "Friendly confirmation"}
OR
{"action": "move", "taskTitle": "Task Title", "targetColumnName": "Done", "message": "Friendly confirmation"}
OR
{"action": "update", "taskTitle": "Task Title", "priority": "high", "message": "Friendly confirmation"}
OR
{"action": "show_overdue", "message": "Looking for overdue tasks..."}
OR
{"action": "clear_completed", "message": "Checking completed tasks..."}
OR
{"action": "find_duplicates", "message": "Searching for duplicates..."}
OR
{"action": "summarize", "message": "Here is your board summary..."}
OR
{"action": "chat", "message": "Your friendly response without markdown bold/italics"}

Available column names from context: ${(context?.columns || []).map((c: any) => c.title).join(', ')}
Current tasks: ${JSON.stringify(userData.tasks.slice(0, 15))}

IMPORTANT: Do not use markdown formatting like **bold** or *italics*. Keep responses concise and friendly.` }, {
        role: 'user', content: safeMessage
      }],
      model: AI_MODEL,
      temperature: 0.6,
      max_tokens: 400,
    });

    console.log('OpenRouter chat response:', JSON.stringify({ choices: completion.choices?.length, model: completion.model, id: completion.id }));

    if (!completion.choices || completion.choices.length === 0) {
      console.error('Empty choices in response. Full response:', JSON.stringify(completion));
      return res.status(500).json({
        error: 'AI returned empty response',
        details: `Model "${AI_MODEL}" returned no choices. The model may not exist or is not available.`,
        hint: 'Check https://openrouter.ai/models for available models'
      });
    }

    const responseText = completion.choices[0].message?.content || '';

    let cleanedResponse = responseText;
    try {
      const parsed = JSON.parse(responseText);
      if (parsed && typeof parsed === 'object' && parsed.message) {
        cleanedResponse = parsed.message;
      }
    } catch { /* not JSON, use as-is */ }

    try {
      await db.insert(aiRequests).values({
        userId: req.userId!,
        prompt: safeMessage,
        response: cleanedResponse,
      });
    } catch (saveError) {
      console.error('Failed to save AI conversation:', saveError);
    }

    res.json({ response: cleanedResponse });
  } catch (e: any) {
    console.error('AI chat error:', e);
    const status = e?.status || e?.error?.status || 500;
    const errorMessage = e?.message || e?.error?.message || 'Unknown error';

    if (status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        details: 'Too many requests to the AI service. Please try again later.',
        helpUrl: 'https://openrouter.ai/docs'
      });
    }

    if (status === 401) {
      return res.status(500).json({
        error: 'AI chat request failed',
        details: 'Invalid or expired API key. Please check your OPENROUTER_API_KEY in the .env file.',
        hint: 'Get a new key at https://openrouter.ai/keys'
      });
    }

    if (status === 403) {
      return res.status(500).json({
        error: 'AI chat request failed',
        details: 'Access denied by the AI service provider.',
        hint: 'Your API key may not have access to the requested model.'
      });
    }

    if (status === 404) {
      return res.status(500).json({
        error: 'AI chat request failed',
        details: `AI model "${AI_MODEL}" is not available. Try a different model.`,
        hint: 'Check https://openrouter.ai/models for available models'
      });
    }

    if (status === 503) {
      return res.status(503).json({
        error: 'AI service temporarily unavailable',
        details: 'The AI service provider is currently unavailable. Please try again later.',
        hint: 'If this persists, check https://openrouter.ai/status'
      });
    }

    res.status(500).json({
      error: 'AI chat request failed',
      details: 'The AI service encountered an error. Please try again.',
    });
  }
});

// Get conversation history
router.get('/chat-history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const history = await db
      .select({
        id: aiRequests.id,
        prompt: aiRequests.prompt,
        response: aiRequests.response,
        createdAt: aiRequests.createdAt,
      })
      .from(aiRequests)
      .where(eq(aiRequests.userId, req.userId!))
      .orderBy(aiRequests.createdAt)
      .limit(limit)
      .offset(offset);

    res.json({ history });
  } catch (e) {
    console.error('Failed to fetch AI chat history:', e);
    res.status(500).json({ error: 'Failed to fetch chat history' });
  }
});

// Delete conversation history
router.delete('/chat-history', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db.delete(aiRequests).where(eq(aiRequests.userId, req.userId!));
    res.json({ message: 'Chat history cleared successfully' });
  } catch (e) {
    console.error('Failed to clear AI chat history:', e);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

router.post('/pro/weekly-schedule', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // if (!(await requireProTier(req, res))) return; // Removed Pro restriction

    const client = getOpenRouter();
    if (!client) {
      return res.status(503).json({
        error: 'AI service is currently unavailable. Please set up your OPENROUTER_API_KEY.'
      });
    }

    const { tasks: inputTasks, userPreferences, availability } = req.body;

    if (!inputTasks || !Array.isArray(inputTasks) || !userPreferences || !availability) {
      return res.status(400).json({ error: 'Tasks, user preferences, and availability are required' });
    }

    // Get user's data for context
    const userDataResponse = await db.select()
      .from(tasks)
      .leftJoin(boards, eq(tasks.boardId, boards.id))
      .leftJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(boards.userId, req.userId!))
      .orderBy(desc(tasks.createdAt));

    const userData = {
      tasks: userDataResponse.map((row: any) => ({
        id: row.tasks.id,
        title: row.tasks.title,
        description: row.tasks.description || '',
        priority: row.tasks.priority,
        dueDate: row.tasks.dueDate || null,
        createdAt: row.tasks.createdAt,
        updatedAt: row.tasks.updatedAt,
        columnId: row.tasks.columnId,
        boardId: row.tasks.boardId,
        order: row.tasks.order,
        columnName: row.columns?.title || 'Unknown',
        boardName: row.boards?.name || 'Unknown'
      }))
    };

    const prompt = `As an advanced AI scheduler, create a detailed weekly schedule based on tasks, user preferences, and availability.

User's current tasks: ${JSON.stringify(userData.tasks.slice(0, 30))}  // Limit to first 30 tasks
User preferences: ${JSON.stringify(userPreferences)}
User availability: ${JSON.stringify(availability)}
Tasks: ${JSON.stringify(inputTasks)}

Generate a comprehensive weekly schedule that considers:
- Task priorities and deadlines
- Estimated time requirements
- User's peak performance hours
- Workload balancing across the week
- Optimal break scheduling
- Task dependencies and relationships

Respond with a detailed JSON object like:
{
  "weeklySchedule": {
    "monday": [
      { "startTime": "9:00", "endTime": "10:30", "task": "task title", "taskId": "id", "category": "work/focus/break", "confidence": 0.9 }
    ],
    "tuesday": [...],
    "wednesday": [...],
    "thursday": [...],
    "friday": [...],
    "saturday": [...],
    "sunday": [...]
  },
  "insights": {
    "peakFocusWindows": ["9AM-11AM", "2PM-4PM"],
    "recommendedBreakTimes": ["11AM-11:15AM", "3PM-3:15PM"],
    "workloadBalance": {"monday": 7, "tuesday": 8, "wednesday": 6, "thursday": 8, "friday": 5},
    "predictedCompletion": 0.85
  },
  "optimizationTips": [
    "Reschedule low-priority tasks to Tuesday for better focus",
    "Combine similar tasks on Thursday afternoon",
    "Take an extra break on Wednesday to maintain performance"
  ]
}`;

    const completion = await client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: AI_MODEL,
      temperature: 0.6,
      max_tokens: 1500,
    });

    const responseText = completion.choices?.[0]?.message?.content || '';

    try {
      const data = await extractJsonFromResponse(responseText);
      res.json(data);
    } catch (parseError) {
      console.error('Failed to parse response for pro weekly schedule:', parseError);
      return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
    }
  } catch (e) {
    console.error('Pro weekly schedule AI request failed:', e);
    res.status(500).json({ error: 'AI request failed. Please try again.' });
  }
});

router.post('/pro/dynamic-reschedule', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!(await requireProTier(req, res))) return;

    const client = getOpenRouter();
    if (!client) {
      return res.status(503).json({
        error: 'AI service is currently unavailable. Please set up your OPENROUTER_API_KEY.'
      });
    }

    const { currentSchedule, changes, newTask } = req.body;

    if (!currentSchedule || !changes) {
      return res.status(400).json({ error: 'Current schedule and changes are required' });
    }

    // Get user's data for context
    const userDataResponse = await db.select()
      .from(tasks)
      .leftJoin(boards, eq(tasks.boardId, boards.id))
      .leftJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(boards.userId, req.userId!))
      .orderBy(desc(tasks.createdAt));

    const userData = {
      tasks: userDataResponse.map((row: any) => ({
        id: row.tasks.id,
        title: row.tasks.title,
        description: row.tasks.description || '',
        priority: row.tasks.priority,
        dueDate: row.tasks.dueDate || null,
        createdAt: row.tasks.createdAt,
        updatedAt: row.tasks.updatedAt,
        columnId: row.tasks.columnId,
        boardId: row.tasks.boardId,
        order: row.tasks.order,
        columnName: row.columns?.title || 'Unknown',
        boardName: row.boards?.name || 'Unknown'
      }))
    };

    const prompt = `As an AI scheduler, adapt the current schedule based on the changes provided.

User's current tasks: ${JSON.stringify(userData.tasks.slice(0, 30))}  // Limit to first 30 tasks
Current schedule: ${JSON.stringify(currentSchedule)}
Changes: ${JSON.stringify(changes)}
New task (optional): ${newTask ? JSON.stringify(newTask) : 'None'}

Analyze the impact of these changes and generate an optimized rescheduled version that:
- Minimizes disruption to high-priority tasks
- Balances workload appropriately
- Maintains peak focus window alignment
- Considers dependencies between tasks
- Preserves important commitments

Respond with a JSON object like:
{
  "updatedSchedule": {
    "monday": [...],
    "tuesday": [...],
    // ... rest of week
  },
  "changesMade": [
    {"task": "task title", "originalTime": "10:00", "newTime": "11:00", "reason": "Conflicts with new meeting"}
  ],
  "impactAssessment": {
    "disruptionLevel": 0.3,
    "affectedTasks": 2,
    "workloadChange": {"monday": 0.2, "tuesday": -0.1}
  }
}`;

    const completion = await client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: AI_MODEL,
      temperature: 0.6,
      max_tokens: 1200,
    });

    const responseText = completion.choices?.[0]?.message?.content || '';

    try {
      const data = await extractJsonFromResponse(responseText);
      res.json(data);
    } catch (parseError) {
      console.error('Failed to parse response for dynamic reschedule:', parseError);
      return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
    }
  } catch (e) {
    console.error('Dynamic reschedule AI request failed:', e);
    res.status(500).json({ error: 'AI request failed. Please try again.' });
  }
});

router.post('/pro/insights-analysis', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const client = getOpenRouter();
    if (!client) {
      return res.status(503).json({
        error: 'AI service is currently unavailable. Please set up your OPENROUTER_API_KEY.'
      });
    }

    let { tasksHistory, scheduleAdherence, productivityMetrics } = req.body;

    // Get user's data for context
    const userDataResponse = await db.select()
      .from(tasks)
      .leftJoin(boards, eq(tasks.boardId, boards.id))
      .leftJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(boards.userId, req.userId!))
      .orderBy(desc(tasks.createdAt));

    const allTasks = userDataResponse.map((row: any) => ({
      id: row.tasks.id,
      title: row.tasks.title,
      description: row.tasks.description || '',
      priority: row.tasks.priority,
      dueDate: row.tasks.dueDate || null,
      createdAt: row.tasks.createdAt,
      updatedAt: row.tasks.updatedAt,
      columnId: row.tasks.columnId,
      boardId: row.tasks.boardId,
      order: row.tasks.order,
      columnName: row.columns?.title || 'Unknown',
      boardName: row.boards?.name || 'Unknown'
    }));

    // If data is missing from frontend, calculate it from DB
    if (!tasksHistory || (Array.isArray(tasksHistory) && tasksHistory.length === 0)) {
      tasksHistory = allTasks.filter((t: any) => t.columnName.toLowerCase().includes('done')).slice(0, 50);
    }

    if (!productivityMetrics || Object.keys(productivityMetrics).length === 0) {
      const total = allTasks.length;
      const completed = allTasks.filter((t: any) => t.columnName.toLowerCase().includes('done')).length;
      const overdue = allTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < new Date() && !t.columnName.toLowerCase().includes('done')).length;
      
      productivityMetrics = {
        totalTasks: total,
        completedTasks: completed,
        overdueTasks: overdue,
        completionRate: total > 0 ? completed / total : 0
      };
    }

    if (!scheduleAdherence || Object.keys(scheduleAdherence).length === 0) {
      scheduleAdherence = {
        onTimeRate: 0.85, // estimate
        missedDeadlines: allTasks.filter((t: any) => t.dueDate && new Date(t.dueDate) < new Date() && !t.columnName.toLowerCase().includes('done')).length
      };
    }

    const prompt = `As an AI productivity analyst, generate detailed insights based on the user's REAL activity data.
    IMPORTANT: Provide specific, data-driven insights. Do not use generic advice.

User's current workspace state:
- Total Tasks: ${productivityMetrics.totalTasks}
- Completed: ${productivityMetrics.completedTasks}
- Overdue: ${productivityMetrics.overdueTasks}
- Completion Rate: ${Math.round(productivityMetrics.completionRate * 100)}%

Recent Task History (Samples): ${JSON.stringify(tasksHistory.slice(0, 10))}
Active Tasks (Samples): ${JSON.stringify(allTasks.filter((t: any) => !t.columnName.toLowerCase().includes('done')).slice(0, 10))}

Analyze the data and provide comprehensive insights covering:
- Weekly and monthly productivity trends
- Time tracking analysis based on task priorities
- Peak performance identification
- Areas for improvement
- Predictions for upcoming weeks
- Task completion patterns

Respond with a JSON object like:
{
  "weeklyInsights": {
    "productivityTrend": "improving/declining/stable",
    "bestPerformingDays": ["Tuesday", "Thursday"],
    "averageCompletionRate": 0.78,
    "timeWasted": 1.2
  },
  "monthlyOverview": {
    "completedTasks": 120,
    "missedDeadlines": 3,
    "efficiencyRating": 0.82,
    "improvementPercentage": 12
  },
  "timeTracking": {
    "totalScheduledHours": 40,
    "actualWorkedHours": 42,
    "focusTimePercentage": 0.65,
    "breakEffectiveness": 0.78
  },
  "predictions": {
    "nextWeekCapacity": 0.85,
    "deadlineRiskTasks": ["task_id_1", "task_id_3"],
    "estimatedCompletionRate": 0.80
  },
  "improvementSuggestions": [
    "Schedule deep work during Tuesday/Thursday mornings",
    "Reduce multitasking between creative and analytical tasks",
    "Take more frequent short breaks during afternoon hours"
  ]
}
Only respond with valid JSON, no markdown.`;

    const completion = await client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: AI_MODEL,
      temperature: 0.5,
      max_tokens: 1200,
    });

    const responseText = completion.choices?.[0]?.message?.content || '';

    try {
      const data = await extractJsonFromResponse(responseText);
      res.json(data);
    } catch (parseError) {
      console.error('Failed to parse response for insights analysis:', parseError);
      return res.status(500).json({ error: 'Failed to parse AI response.' });
    }
  } catch (e) {
    console.error('Insights analysis AI request failed:', e);
    res.status(500).json({ error: 'AI request failed. Please try again.' });
  }
});

router.post('/pro/task-bundling', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    // if (!(await requireProTier(req, res))) return; // Removed Pro restriction

    const client = getOpenRouter();
    if (!client) {
      return res.status(503).json({
        error: 'AI service is currently unavailable. Please set up your OPENROUTER_API_KEY.'
      });
    }

    const { tasks: inputTasks, contextSwitchingGoals } = req.body;

    if (!inputTasks || !Array.isArray(inputTasks)) {
      return res.status(400).json({ error: 'Tasks array is required' });
    }

    // Get user's data for context
    const userDataResponse = await db.select()
      .from(tasks)
      .leftJoin(boards, eq(tasks.boardId, boards.id))
      .leftJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(boards.userId, req.userId!))
      .orderBy(desc(tasks.createdAt));

    const userData = {
      tasks: userDataResponse.map((row: any) => ({
        id: row.tasks.id,
        title: row.tasks.title,
        description: row.tasks.description || '',
        priority: row.tasks.priority,
        dueDate: row.tasks.dueDate || null,
        createdAt: row.tasks.createdAt,
        updatedAt: row.tasks.updatedAt,
        columnId: row.tasks.columnId,
        boardId: row.tasks.boardId,
        order: row.tasks.order,
        columnName: row.columns?.title || 'Unknown',
        boardName: row.boards?.name || 'Unknown'
      }))
    };

    const prompt = `As an AI task organizer, group similar tasks to minimize context switching and improve focus.

User's current tasks: ${JSON.stringify(userData.tasks.slice(0, 30))}  // Limit to first 30 tasks
Tasks: ${JSON.stringify(inputTasks)}
Context switching reduction goals: ${contextSwitchingGoals || 'Maximize focus time'}

Analyze the tasks and create bundles that group similar activities together based on:
- Task type/category
- Required mental mode (analytical, creative, administrative)
- Tools/resources needed
- Energy level required
- Priority levels

Respond with a JSON object like:
{
  "taskBundles": [
    {
      "bundleId": "morning-focus-block",
      "bundleName": "Deep Work Session",
      "tasks": ["task_id_1", "task_id_3"],
      "estimatedTime": 120,
      "optimalTimeOfDay": "morning",
      "mentalMode": "analytical",
      "energyLevel": "high"
    }
  ],
  "bundlingRationale": "Grouped analytical tasks to maintain concentration",
  "expectedBenefits": {
    "timeSaved": 25,
    "contextSwitchesReduced": 5,
    "focusScoreImprovement": 0.3
  }
}`;

    const completion = await client.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: AI_MODEL,
      temperature: 0.6,
      max_tokens: 800,
    });

    const responseText = completion.choices?.[0]?.message?.content || '';

    try {
      const data = await extractJsonFromResponse(responseText);
      res.json(data);
    } catch (parseError) {
      console.error('Failed to parse response for task bundling:', parseError);
      return res.status(500).json({ error: 'Failed to parse AI response. Please try again.' });
    }
  } catch (e) {
    console.error('Task bundling AI request failed:', e);
    res.status(500).json({ error: 'AI request failed. Please try again.' });
  }
});

router.post('/task-builder', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await getAuthenticatedUser(req, res);
    if (!user) return;

    const client = getOpenRouter();
    if (!client) {
      return res.status(503).json({ error: 'AI service is currently unavailable. Please set OPENROUTER_API_KEY.' });
    }

    const { input, columns: boardColumns } = req.body;
    if (!input || typeof input !== 'string' || !input.trim()) {
      return res.status(400).json({ error: 'Input text is required' });
    }

    const safeInput = sanitize(input);
    const columnsContext = Array.isArray(boardColumns) && boardColumns.length > 0
      ? `Available groups: ${boardColumns.map((c: any) => c.title).join(', ')}.`
      : '';

    const today = new Date().toISOString().split('T')[0];

    const prompt = `You are a task management AI. The user describes a task, project, or goal in plain text. Extract all relevant information and return a fully structured task JSON.

Today's date: ${today}
${columnsContext}

User input:
"""
${safeInput}
"""

Return ONLY a valid JSON object with these exact fields:
{
  "title": "concise task title extracted or generated",
  "description": "summarized description from input",
  "priority": "urgent|high|medium|low|none (infer from urgency language)",
  "dueDate": "YYYY-MM-DD or null if no date mentioned",
  "dueTime": "HH:MM (24h) or null if no time mentioned",
  "duration": "estimated duration in minutes as integer or null",
  "group": "suggested group name from the available groups if relevant, or null",
  "status": "to_do",
  "subtasks": [
    { "text": "subtask description", "durationMinutes": 15 }
  ],
  "checklistItems": ["step1", "step2"]
}

Rules:
- subtasks: break down complex tasks. Each gets a realistic durationMinutes.
- checklistItems: for step-by-step actions or checklist-style items in the input.
- duration: sum of subtask durations if subtasks exist, otherwise estimate from scope.
- priority: "urgent" for ASAP/critical, "high" for important, "medium" default, "low" for minor.
- dueDate: only if explicitly mentioned. Parse relative dates like "tomorrow" using today's date.
- Return ONLY the JSON, no markdown, no explanation.`;

    const responseText = await generateContentWithRetry(prompt, 2);
    const taskData = await extractJsonFromResponse(responseText);

    res.json(taskData);
  } catch (error) {
    console.error('AI task builder failed:', error);
    res.status(500).json({ error: 'Failed to generate task. Please try again.' });
  }
});

router.post('/premium/ai-prioritize', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const user = await requirePremiumTier(req, res);
    if (!user) return;

    const { tasks: inputTasks } = req.body;
    if (!Array.isArray(inputTasks)) {
      return res.status(400).json({ error: 'Tasks array is required' });
    }

    const prompt = `You are a professional productivity coach. Prioritize these tasks based on their importance, deadlines, and titles. Return the tasks in the optimal order of execution.
    
    Tasks: ${JSON.stringify(inputTasks.map(t => ({ id: t.id, title: t.title, dueDate: t.dueDate, priority: t.priority })))}
    
    Respond ONLY with a JSON array of task IDs in the prioritized order.
    Example: ["id1", "id2", "id3"]`;

    const responseText = await generateContentWithRetry(prompt);
    const prioritizedIds = await extractJsonFromResponse(responseText);

    if (Array.isArray(prioritizedIds)) {
      res.json(prioritizedIds);
    } else {
      throw new Error('Invalid response from AI');
    }
  } catch (error) {
    console.error('AI prioritization failed:', error);
    res.status(500).json({ error: 'AI prioritization failed' });
  }
});

export default router;