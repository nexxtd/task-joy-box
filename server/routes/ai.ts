import 'dotenv/config';
import { Router, Response, Request } from 'express';
import OpenAI from 'openai';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { db } from '../db';
import { users, tasks, boards, columns, aiRequests, notes, goals, habits, projects } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';
import { getCalendarEventsForAI } from './calendar';

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

const AI_MODEL = process.env.AI_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b:free';

// Helper function to create cache key based on request parameters
function createCacheKey(input: string, model: string): string {
  // Create a hash-like key from the input and model
  const inputHash = Array.from(input).reduce((acc, char) =>
    acc + char.charCodeAt(0), 0);
  return `${model}:${inputHash}:${Math.floor(input.length / 100)}`;
}

// Free AI models frequently truncate their JSON or leave trailing junk —
// repair the most common damage: drop trailing commas and close unclosed braces.
function repairJson(text: string): unknown {
  const start = text.indexOf('{');
  if (start === -1) return undefined;
  let candidate = text.slice(start).replace(/,\s*([}\]])/g, '$1');
  for (let i = 0; i < 12; i++) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Object.keys(parsed).length > 0) {
        return parsed;
      }
    } catch (parseError) {
      // keep closing braces
    }
    candidate += '}';
  }
  return undefined;
}

async function extractJsonFromResponse(text: string) {
  // Try to find JSON within code blocks first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  let jsonText = codeBlockMatch ? codeBlockMatch[1].trim() : text;

  // Find the actual JSON portion if it's mixed with other text
  const jsonStart = jsonText.indexOf('{');
  const jsonEnd = jsonText.lastIndexOf('}') + 1;

  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    jsonText = jsonText.substring(jsonStart, jsonEnd);
  }

  // Try the full slice first, then progressively drop trailing junk after each '}'.
  const candidates = [jsonText];
  for (let i = jsonText.lastIndexOf('}'); i > 0; i = jsonText.lastIndexOf('}', i - 1)) {
    candidates.push(jsonText.slice(0, i + 1));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (parseError) {
      // keep trying shorter slices
    }
  }

  // Repair pass: close unclosed braces and drop trailing commas.
  const repaired = repairJson(jsonText);
  if (repaired !== undefined) return repaired;

  console.error('Failed to parse AI response:', text);
  throw new Error('Invalid JSON response from AI service');
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

  if (user.subscriptionTier !== 'premium' && user.subscriptionTier !== 'pro' && user.subscriptionStatus !== 'active') {
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
async function generateContentWithRetry(prompt: string, retries = 1, useFallback = true, forceFresh = false) {
  // Create cache key for this request
  const cacheKey = createCacheKey(prompt, AI_MODEL);
  const cached = requestCache.get(cacheKey);

  // Return cached response if available and not expired
  if (!forceFresh && cached && Date.now() - cached.timestamp < CACHE_DURATION) {
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
        max_tokens: 4000,
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

    const today = new Date().toISOString().split('T')[0];
    const enrichedTasks = userData.tasks.map((t: any) => ({
      ...t,
      status: /done|completed|finish/i.test(t.columnName)
        ? 'done'
        : (t.dueDate && t.dueDate < today ? 'overdue' : 'open')
    }));

    const prompt = `Analyze ONLY the user's tasks and the projects (boards) they belong to. Never mention habits, goals, streaks, energy levels, or any other metric that is not a task or project.

Today's date: ${today}

For each task consider: its project, priority, due date, and status (done / overdue / open).

The score must be genuinely reasoned from the actual data (0-100). Name specific tasks and quantify how each helps or hurts the score — e.g. "X is overdue (was due DATE) and drags the score down about 6 points", "completing urgent task Y added about 5 points", "N low-priority tasks are still open, each worth about 2 points".

User's tasks (up to 30): ${JSON.stringify(enrichedTasks.slice(0, 30))}
Tasks currently visible to the user: ${safeTasksStr}

Respond with JSON:
{
  "overallScore": 78,
  "scoreRationale": "1-2 sentence explanation of how the score was derived, referencing actual tasks and their impact",
  "contributors": ["what is helping the score, naming specific tasks/projects when relevant"],
  "penalties": ["what is dragging the score down — name the specific overdue, low-priority or incomplete tasks and their point impact"],
  "insights": ["insight1", "insight2", "insight3"],
  "recommendations": ["rec1", "rec2"],
  "focusArea": "The most critical thing to focus on"
}
Only respond with valid JSON, no markdown. Keep all content strictly about tasks and projects.`;

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

function cleanReplyText(text: string): string {
  return text
    .replace(/```(?:json)?\s*[\s\S]*?```/g, '') // drop stray code fences
    .replace(/```/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/\*|_/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function defaultReplyFor(action: string): string {
  switch (action) {
    case 'create': return 'Done — creating that task now.';
    case 'delete': return 'Okay — looking for that task to remove.';
    case 'move': return 'Okay — moving that task now.';
    case 'update': return 'Okay — updating that task now.';
    case 'show_overdue': return 'Here are your overdue tasks.';
    case 'clear_completed': return 'Here are the completed tasks I can clear.';
    case 'find_duplicates': return 'Here are the duplicate tasks I found.';
    case 'summarize': return 'Here is your board summary.';
    default: return 'Let me rephrase that — what would you like to do?';
  }
}

function localChatFallback(
  message: string,
  context: { tasks?: any[]; columns?: any[] } | undefined,
  calendar?: { todayStr: string; tasksToday: any[]; eventsToday: any[] },
) {
  const m = message.toLowerCase();
  const tasks = context?.tasks || [];
  const columns = context?.columns || [];
  const firstColumn = columns[0];
  const quotedTitle = message.match(/["“]([^"”]+)["”]/);
  const quoted = quotedTitle ? quotedTitle[1] : null;

  if (/\bcalendar\b/.test(m) && /(today|tonight|what|show|list|have|on|schedule|events?)/.test(m)) {
    if (calendar) {
      const parts: string[] = [];
      const { tasksToday, eventsToday, todayStr } = calendar;
      if (tasksToday.length === 0 && eventsToday.length === 0) {
        parts.push(`Nothing is scheduled for today (${todayStr}).`);
      }
      if (tasksToday.length > 0) {
        parts.push(`Tasks due today: ${tasksToday.map((t: any) => `"${t.title}"${t.dueTime ? ` at ${t.dueTime}` : ''}`).join(', ')}.`);
      }
      if (eventsToday.length > 0) {
        parts.push(`Calendar events today: ${eventsToday.map((ev: any) => `"${ev.title}"${ev.startTime ? ` at ${ev.startTime}` : ''}`).join(', ')}.`);
      }
      return { action: 'chat', message: parts.join(' ') + ' (The AI service is busy — this is a live snapshot of your calendar.)' };
    }
    return { action: 'chat', message: 'I can see your calendar, but the AI service is busy right now. Try again in a few seconds.' };
  }

  if (/\boverdue\b/.test(m)) {
    const today = calendar?.todayStr || new Date().toISOString().slice(0, 10);
    const overdueTasks = tasks.filter((t: any) => {
      const col = columns.find((c: any) => c.id === t.columnId);
      if (/done|completed|finish/i.test(col?.title || '')) return false;
      return t.dueDate && String(t.dueDate) < today;
    });
    const count = overdueTasks.length;
    const names = overdueTasks.slice(0, 5).map((t: any) => `"${t.title}"`).join(', ');
    return {
      action: 'show_overdue',
      data: { taskTitles: overdueTasks.slice(0, 10).map((t: any) => t.title) },
      message: count === 0
        ? 'You have no overdue tasks — everything is on track.'
        : `You have ${count} overdue task${count === 1 ? '' : 's'}${count > 0 ? `: ${names}` : ''}${count > 5 ? ` and ${count - 5} more` : ''}.`,
    };
  }
  if (/\bduplicates?\b/.test(m) && /(find|remove|delete|check)/.test(m)) return { action: 'find_duplicates' };
  if (/(clear|delete|remove).*\b(completed|done|finished)\b/.test(m)) return { action: 'clear_completed' };
  if (/\b(summary|summarize|overview|how many)\b/.test(m)) return { action: 'summarize' };

  if (/(create|add|make|new)\b.*\btask\b/.test(m)) {
    const inlineTitle = message
      .replace(/^(please\s+)?(create|add|make|new)\s+(a|an\s+)?task\s*(called|named|titled)?\s*["']?[-:：]?\s*/i, '')
      .replace(/[.!?]+$/, '')
      .trim();
    return {
      action: 'create',
      data: {
        title: quoted || (inlineTitle.length >= 2 && inlineTitle.length <= 80 ? inlineTitle : 'New task'),
        description: '',
        priority: m.includes('urgent') ? 'urgent' : m.includes('high') ? 'high' : m.includes('low') ? 'low' : 'medium',
        columnName: firstColumn?.title || null,
      },
      message: 'Creating that task for you now.',
    };
  }

  if (/\b(delete|remove)\b.*\btask\b/.test(m)) {
    const inlineTask = message
      .replace(/^(please\s+)?(delete|remove)\b.*\btask\b\s*/i, '')
      .replace(/[.!?]+$/, '')
      .trim()
      .split(' ')
      .slice(0, 6)
      .join(' ');
    return {
      action: 'delete',
      data: { taskTitle: quoted || inlineTask || 'that task' },
      message: 'Looking for that task to remove.',
    };
  }

  if (/\bmove\b.*\bto\b/.test(m)) {
    const target = (m.match(/\bto\s+([a-z][a-z ]{1,30})/) || [])[1]?.trim();
    return {
      action: 'move',
      data: { taskTitle: quoted || 'task', targetColumnName: target || null },
      message: 'Moving that task now.',
    };
  }

  if (/\b(priority|prioriti[sz]e)\b/.test(m)) {
    return { action: 'update', data: {}, message: 'Updating that task priority now.' };
  }

  if (/^(hey|hi|hello|yo|hiya|good\s+(morning|afternoon|evening))\b/.test(m)) {
    return {
      action: 'chat',
      message: `Hey! I'm Planora, but the AI service is temporarily unreachable — this is an automated reply. I can still show overdue tasks, summarize your board, or find duplicates offline. Otherwise, try again in a few seconds.`,
    };
  }

  const openCount = tasks.filter((t: any) => {
    const col = columns.find((c: any) => c.id === t.columnId);
    return !t.completed && !/done|completed|finish/i.test(col?.title || '');
  }).length;
  return {
    action: 'chat',
    message: `I can't reach the AI service right now, so this is an automated snapshot instead: ${tasks.length} tasks on your board (${openCount} open, ${tasks.length - openCount} completed) across ${columns.length} columns. Try again in a few seconds.`,
  };
}

router.post('/chat', requireAuth, async (req: AuthRequest, res: Response) => {
  const { message, context } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  let userData: { tasks: any[] } = { tasks: [] };
  try {
    const userDataResponse = await db
      .select({
        tasks: {
          id: tasks.id,
          boardId: tasks.boardId,
          columnId: tasks.columnId,
          title: tasks.title,
          description: tasks.description,
          priority: tasks.priority,
          dueDate: tasks.dueDate,
          dueTime: tasks.dueTime,
          completed: tasks.completed,
          completedAt: tasks.completedAt,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          order: tasks.order,
        },
        boards: { id: boards.id, name: boards.name, userId: boards.userId },
        columns: { id: columns.id, title: columns.title },
      })
      .from(tasks)
      .leftJoin(boards, eq(tasks.boardId, boards.id))
      .leftJoin(columns, eq(tasks.columnId, columns.id))
      .where(eq(boards.userId, req.userId!))
      .orderBy(desc(tasks.createdAt));

    userData = {
      tasks: userDataResponse.map((row: any) => ({
        id: row.tasks.id,
        title: row.tasks.title,
        description: row.tasks.description || '',
        priority: row.tasks.priority,
        dueDate: row.tasks.dueDate || null,
        dueTime: row.tasks.dueTime || null,
        completed: Boolean(row.tasks.completed),
        completedAt: row.tasks.completedAt || null,
        createdAt: row.tasks.createdAt,
        updatedAt: row.tasks.updatedAt,
        columnId: row.tasks.columnId,
        boardId: row.tasks.boardId,
        order: row.tasks.order,
        columnName: row.columns?.title || 'Unknown',
        boardName: row.boards?.name || 'Unknown'
      }))
    };
  } catch (dbErr: any) {
    console.error('AI chat context query failed:', dbErr?.message || dbErr);
    userData = { tasks: [] };
  }

  const localDateKey = (d: Date) => {
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().split('T')[0];
  };
  const todayStr = localDateKey(new Date());
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 7);
  const maxDateStr = localDateKey(maxDate);

  // Pull the rest of the user's data — goals, habits, notes, projects — plus a
  // computed insights snapshot so the assistant can answer about anything.
  let extraData: { goals: any[]; habits: any[]; notes: any[]; projects: any[] } = { goals: [], habits: [], notes: [], projects: [] };
  try {
    const [goalRows, habitRows, noteRows, projectRows] = await Promise.all([
      db.select().from(goals).where(eq(goals.userId, req.userId!)),
      db.select().from(habits).where(eq(habits.userId, req.userId!)),
      db.select().from(notes).where(eq(notes.userId, req.userId!)),
      db.select().from(projects).where(eq(projects.ownerId, req.userId!)),
    ]);
    extraData = { goals: goalRows, habits: habitRows, notes: noteRows, projects: projectRows };
  } catch (extraErr) {
    console.error('AI chat extra context query failed:', extraErr);
  }

  const doneTasks = userData.tasks.filter((t: any) => t.completed);
  const openCount = userData.tasks.length - doneTasks.length;
  const overdueCount = userData.tasks.filter((t: any) => t.dueDate && t.dueDate < todayStr && !t.completed).length;
  const completionPct = userData.tasks.length > 0 ? Math.round((doneTasks.length / userData.tasks.length) * 100) : 0;
  const userDataLines: string[] = [];
  if (extraData.goals.length > 0) {
    userDataLines.push(`Goals (${extraData.goals.length}): ${extraData.goals.map((g: any) => `"${g.title}" ${g.progress}/${g.target} ${g.unit}${g.completed ? ' (completed)' : ''}`).join('; ')}`);
  } else {
    userDataLines.push('Goals: none');
  }
  if (extraData.habits.length > 0) {
    userDataLines.push(`Habits (${extraData.habits.length}): ${extraData.habits.map((h: any) => `"${h.title}" streak ${h.streak} day(s)`).join('; ')}`);
  } else {
    userDataLines.push('Habits: none');
  }
  if (extraData.notes.length > 0) {
    userDataLines.push(`Notes (${extraData.notes.length}): ${extraData.notes.slice(0, 10).map((n: any) => `"${n.title}"`).join(', ')}`);
  }
  if (extraData.projects.length > 0) {
    userDataLines.push(`Projects (${extraData.projects.length}): ${extraData.projects.filter((p: any) => !p.archived).map((p: any) => `"${p.name}"`).join(', ')}`);
  }
  userDataLines.push(`Insights: ${userData.tasks.length} tasks total (${openCount} open, ${doneTasks.length} completed, ${overdueCount} overdue), completion rate ${completionPct}%.`);

  // Build a compact calendar snapshot: tasks with due dates (with times) plus
  // connected Google Calendar events, for today and the next 7 days.
  let calendarData: { connected: boolean; events: Array<{ title: string; startDate: string | null; endDate: string | null; startTime: string | null; endTime: string | null; allDay: boolean }> } = { connected: false, events: [] };
  try {
    calendarData = await getCalendarEventsForAI(req.userId!);
  } catch (calErr) {
    console.error('AI calendar context fetch failed:', calErr);
  }
  const todayTasks = userData.tasks.filter((t: any) => t.dueDate === todayStr);
  const upcomingTasks = userData.tasks.filter((t: any) => t.dueDate && t.dueDate > todayStr && t.dueDate <= maxDateStr);
  const todayEvents = calendarData.events.filter(ev => ev.startDate === todayStr);
  const upcomingEvents = calendarData.events.filter(ev => ev.startDate && ev.startDate > todayStr && ev.startDate <= maxDateStr);
  const fmtTime = (t: string | null) => (t ? ` at ${t}` : '');
  const calendarLines: string[] = [`Today's date: ${todayStr}`];
  if (todayTasks.length === 0 && todayEvents.length === 0) {
    calendarLines.push('Calendar today: nothing scheduled.');
  } else {
    if (todayTasks.length > 0) {
      calendarLines.push(`Tasks due today: ${todayTasks.map((t: any) => `"${t.title}"${fmtTime(t.dueTime)}${t.priority && t.priority !== 'none' ? ` (${t.priority})` : ''}`).join('; ')}`);
    }
    if (todayEvents.length > 0) {
      calendarLines.push(`Google Calendar events today: ${todayEvents.map((ev: any) => `"${ev.title}"${ev.startTime ? ` ${ev.startTime}${ev.endTime ? `-${ev.endTime}` : ''}` : ' (all day)'}`).join('; ')}`);
    }
  }
  if (upcomingTasks.length > 0) {
    calendarLines.push(`Tasks due in the next 7 days: ${upcomingTasks.map((t: any) => `"${t.title}" on ${t.dueDate}${fmtTime(t.dueTime)}`).join('; ')}`);
  }
  if (upcomingEvents.length > 0) {
    calendarLines.push(`Google Calendar events in the next 7 days: ${upcomingEvents.map((ev: any) => `"${ev.title}" on ${ev.startDate}${ev.startTime ? ` ${ev.startTime}` : ''}`).join('; ')}`);
  }

  const safeMessage = sanitize(message);

  const systemPrompt = `You are Planora, a helpful task-management assistant.
The user's message may ask you to CREATE, DELETE, MOVE, UPDATE a task, or answer a question.
If the user asks for a board action, you MUST reply with ONLY a JSON object like:
{"action": "create", "title": "Task Title", "description": "", "priority": "medium", "columnName": "To Do", "message": "Short friendly confirmation"}
{"action": "delete", "taskTitle": "Task Title", "message": "..."}
{"action": "move", "taskTitle": "Task Title", "targetColumnName": "Done", "message": "..."}
{"action": "update", "taskTitle": "Task Title", "priority": "high", "message": "..."}
{"action": "show_overdue", "message": "..."}
{"action": "clear_completed", "message": "..."}
{"action": "find_duplicates", "message": "..."}
{"action": "summarize", "message": "..."}
{"action": "chat", "message": "your helpful reply"}
Available columns: ${(context?.columns || []).map((c: any) => c.title).join(', ') || 'none'}
Current tasks: ${JSON.stringify(userData.tasks.slice(0, 15))}
User data snapshot (goals, habits, notes, projects, insights):
${userDataLines.join('\n')}
Calendar context:
${calendarLines.join('\n')}
Rules:
- For ordinary questions or conversation, respond with {"action": "chat", "message": "your answer"}.
- Only use an action key when you actually must perform that board action based on the user's request.
- Never invent tasks that don't exist. If a task name is unclear, use action "chat" and ask the user to confirm.
- You HAVE full access to ALL the user's data: tasks, columns, goals, habits, notes, projects, insights, and their calendar (tasks with due dates plus connected Google Calendar events). When asked about any of these — the calendar, today's schedule, goal progress, habit streaks, notes, productivity insights — answer directly from the data above. Never claim you lack access to the user's data or that they must show it to you; it is already provided.
- Keep messages concise, friendly, without markdown bold/italics.
- Reply with ONLY the JSON object, no code fences, no extra text.`.trim();

  let responseText = '';
  let aiOk = false;
  try {
    const client = getOpenRouter();
    if (client) {
      try {
        let completion: any;
        for (let attempt = 0; attempt <= 2; attempt++) {
          try {
            completion = await client.chat.completions.create({
              model: AI_MODEL,
              temperature: 0.6,
              max_tokens: 1600,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: safeMessage }
              ],
            });
            break;
          } catch (err: any) {
            const status = err?.status || err?.error?.status;
            if (attempt < 2 && (status === 429 || (status >= 500 && status <= 599))) {
              await delay(2500 * (attempt + 1));
              continue;
            }
            throw err;
          }
        }

        if (!completion?.choices?.length) {
          console.error('AI chat: empty choices response');
        } else {
          responseText = completion.choices[0].message?.content || '';
          aiOk = Boolean(responseText.trim());
        }
      } catch (e: any) {
        console.error('AI chat upstream request failed:', e?.message || e);
      }
    } else {
      console.warn('OpenRouter not configured — using local chat fallback.');
    }
  } catch (e: any) {
    console.error('AI chat init failed:', e?.message || e);
  }

  let action = 'chat';
  let actionData: any = null;
  let reply = '';
  let parsed: any = null;

  if (aiOk) {
    try {
      parsed = await extractJsonFromResponse(responseText);
    } catch {
      parsed = null;
    }
    if (parsed && typeof parsed === 'object') {
      const knownActions = ['create', 'delete', 'move', 'update', 'show_overdue', 'clear_completed', 'find_duplicates', 'summarize'];
      if (typeof parsed.action === 'string' && knownActions.includes(parsed.action)) {
        action = parsed.action;
        actionData = parsed;
      } else {
        action = 'chat';
      }
      reply = cleanReplyText(String(parsed.message ?? parsed.reply ?? parsed.answer ?? parsed.text ?? ''));
    }
    if (!reply) {
      reply = cleanReplyText(responseText);
    }
  }

  if (!reply) {
    if (aiOk && parsed) {
      reply = defaultReplyFor(action);
    } else {
      const fallback = localChatFallback(message, context, { todayStr, tasksToday: todayTasks, eventsToday: todayEvents });
      action = fallback.action;
      actionData = fallback.action === 'chat' ? null : fallback.data || null;
      reply = fallback.message || defaultReplyFor(fallback.action);
      console.warn('AI chat unavailable or empty — used local fallback:', action);
    }
  }

  try {
    await db.insert(aiRequests).values({
      userId: req.userId!,
      prompt: safeMessage,
      response: reply,
    });
  } catch (saveError) {
    console.error('Failed to save AI conversation:', saveError);
  }

  const automated = !aiOk;

  if (action === 'chat') {
    res.json({ action: 'chat', reply, automated });
  } else {
    res.json({ action, reply, data: actionData || {}, automated });
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

    const { input, columns: boardColumns, tags: availableTags } = req.body;
    if (!input || typeof input !== 'string' || !input.trim()) {
      return res.status(400).json({ error: 'Input text is required' });
    }

    const safeInput = sanitize(input);
    const columnsContext = Array.isArray(boardColumns) && boardColumns.length > 0
      ? `Available groups: ${boardColumns.map((c: any) => c.title).join(', ')}.`
      : '';
    const tagsContext = Array.isArray(availableTags) && availableTags.length > 0
      ? `Available tags (choose from these exact names): ${availableTags.join(', ')}.`
      : '';

    const today = new Date().toISOString().split('T')[0];

    const prompt = `You are a task management AI. The user describes a task, project, or goal in plain text. Extract all relevant information and return a fully structured task JSON.

Today's date: ${today}
${columnsContext}
${tagsContext}

User input:
"""
${safeInput}
"""

Return ONLY a valid JSON object with these exact fields:
{
  "title": "concise task title extracted or generated from user input",
  "description": "empty string unless the user's input contains a detailed description separate from the title — never repeat the user's prompt here",
  "priority": "urgent|high|medium|low|none (infer from urgency language)",
  "startDate": "YYYY-MM-DD or null if no start date mentioned",
  "startTime": "HH:MM (24h) or null if no start time mentioned",
  "dueDate": "YYYY-MM-DD or null if no date mentioned",
  "dueTime": "HH:MM (24h) or null if no time mentioned",
  "duration": "estimated duration in minutes as integer or null",
  "group": "suggested group name from the available groups if relevant, or null",
  "status": "to_do",
  "subtasks": [
    { "text": "subtask description", "durationMinutes": 15 }
  ],
  "checklistItems": ["step1", "step2"],
  "tags": ["tag_name_1", "tag_name_2"]
}

Rules:
- title: the actual task name, extracted from the user's input (e.g. if user says "work task high priority", title should be "Work task", NOT the whole prompt)
- description: leave empty ("") unless the user provided a separate detailed description beyond the title/the task name itself. NEVER copy the entire user prompt into description.
- tags: pick from the available tags list if any match the task's context. Use exact names from the list. Empty array if none match.
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

// AI dashboard widgets - powers the AI Productivity Score, AI Task Prioritizer,
// AI Bottleneck Detector and AI Weekly Summary widgets on the dashboard.
// Analysis is available on all tiers; the AI widgets themselves remain Pro-gated client-side.
router.post('/pro/dashboard-widgets', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const client = getOpenRouter();
    if (!client) {
      return res.status(503).json({
        error: 'AI service is currently unavailable. Please set up your OPENROUTER_API_KEY.'
      });
    }

    const { tasks } = req.body;
    const safeTasks: any[] = (Array.isArray(tasks) ? tasks : []).slice(0, 120).map((t: any) => ({
      id: String(t?.id ?? ''),
      title: String(t?.title ?? '').slice(0, 120),
      priority: t?.priority || 'none',
      status: t?.status || 'to_do',
      completed: Boolean(t?.completed),
      dueDate: t?.dueDate || null,
      dueTime: t?.dueTime || null,
      duration: Math.max(0, Number(t?.duration) || 0),
      projectName: t?.projectName ? String(t.projectName).slice(0, 60) : null,
      createdAt: t?.createdAt || null,
      completedAt: t?.completedAt || null,
      updatedAt: t?.updatedAt || null,
    }));

    const validIds = new Set(safeTasks.map((t: any) => t.id).filter(Boolean));
    const isDone = (t: any) => t.completed || /done|completed|finish/i.test(String(t.status || ''));
    const active = safeTasks.filter((t: any) => !isDone(t));
    const completed = safeTasks.filter((t: any) => isDone(t));
    const overdue = active.filter((t: any) => {
      if (!t.dueDate) return false;
      const due = t.dueTime ? new Date(`${t.dueDate}T${t.dueTime}`) : new Date(`${t.dueDate}T23:59:59`);
      return !Number.isNaN(due.getTime()) && due.getTime() < Date.now();
    });
    const todayStr = new Date().toISOString().slice(0, 10);

    if (safeTasks.length === 0) {
      return res.json({
        productivityScore: {
          score: 0,
          summary: 'You have no tasks yet. Add your first task to get an AI productivity score.',
          focusAreas: [],
        },
        nextTasks: [],
        bottlenecks: [],
        weeklySummary: 'No task activity to recap yet. Add and complete a few tasks and your AI weekly summary will appear here.',
      });
    }

    const prompt = `You are an AI productivity analyst powering live dashboard widgets. Today's date is ${todayStr}.

Analyze ONLY the user's real data below and produce specific, data-grounded output. Never invent tasks, projects, or numbers that are not present in the data.

WORKSPACE SNAPSHOT:
- Total tasks: ${safeTasks.length}
- Active: ${active.length}
- Completed: ${completed.length}
- Overdue: ${overdue.length}
- Completion rate: ${safeTasks.length > 0 ? Math.round((completed.length / safeTasks.length) * 100) : 0}%

Overdue task titles: ${overdue.slice(0, 8).map((t: any) => t.title).join(' | ') || 'none'}

ACTIVE TASKS (${active.length}):
${active.slice(0, 60).map((t: any) => `- ${t.id} | "${t.title}" | priority=${t.priority} | due=${t.dueDate || 'none'}${t.dueTime ? ' ' + t.dueTime : ''} | est=${t.duration}min | project=${t.projectName || 'none'}`).join('\n') || '(none)'}

COMPLETED TASKS (recent, ${completed.length}):
${completed.slice(0, 20).map((t: any) => `- ${t.id} | "${t.title}" | completedAt=${t.completedAt || 'unknown'}`).join('\n') || '(none)'}

TASKS MISSING KEY INFO:
- Tasks without a due date: ${active.filter((t: any) => !t.dueDate).length}
- Tasks with priority 'none': ${active.filter((t: any) => t.priority === 'none').length}

Respond with ONLY valid JSON (no markdown, no code fences) shaped exactly like:
{
  "productivityScore": {
    "score": 0-100 integer,
    "summary": "one or two short sentences about this user's productivity",
    "focusAreas": ["2-4 short focus areas"]
  },
  "nextTasks": [
    { "id": "a task id from ACTIVE TASKS", "reason": "one sentence on why this should be done next (deadline/priority/effort)" }
  ],
  "bottlenecks": [
    { "id": "a task id from the data", "reason": "why this task may be stalling", "suggestion": "one concrete next step the user should take to unblock it" }
  ],
  "weeklySummary": "2-3 natural-language sentences recapping the week and what to do better next week"
}
All task ids must come verbatim from the data provided. If there are no active tasks, leave nextTasks as an empty array.`;

    let responseText = await generateContentWithRetry(prompt);
    let parsed: any;
    let parseFailed = false;
    try {
      parsed = await extractJsonFromResponse(responseText);
    } catch (parseError) {
      // The model sometimes emits malformed JSON — retry once with a fresh (uncached) generation.
      parseFailed = true;
      console.warn('Dashboard widgets: first AI response unreadable, retrying once.');
    }
    if (parseFailed) {
      try {
        responseText = await generateContentWithRetry(prompt, 1, true, true);
        parsed = await extractJsonFromResponse(responseText);
      } catch (parseError2) {
        // Last resort: ask the model to repair its own output into valid JSON.
        try {
          console.warn('Dashboard widgets: second AI response unreadable, attempting repair pass.');
          const repairPrompt = `The text below was supposed to be a JSON object, but it is malformed. Output ONLY the corrected valid JSON object with EXACTLY this shape: {"productivityScore":{"score":0-100,"summary":"one or two short sentences","focusAreas":["2-4 short focus areas"]},"nextTasks":[{"id":"a task id","reason":"one sentence"}],"bottlenecks":[{"id":"a task id","reason":"one sentence","suggestion":"one concrete next step"}],"weeklySummary":"2-3 sentences"}. If the text contains no usable data, output {"productivityScore":{"score":0,"summary":"Not enough data for analysis","focusAreas":[]},"nextTasks":[],"bottlenecks":[],"weeklySummary":"Not enough data for analysis"}.\n\nMALFORMED TEXT:\n${responseText.slice(0, 4000)}`;
          const fixed = await generateContentWithRetry(repairPrompt, 1, true, true);
          parsed = await extractJsonFromResponse(fixed);
        } catch (parseError3) {
          parsed = null;
        }
      }
    }
    if (!parsed) {
      return res.status(500).json({ error: 'The AI returned an unreadable response. Please try again.' });
    }

    const clampInt = (v: any, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
    const scoreObj = parsed?.productivityScore && typeof parsed.productivityScore === 'object' ? parsed.productivityScore : {};
    const focusAreas = (Array.isArray(scoreObj.focusAreas) ? scoreObj.focusAreas : [])
      .map((f: any) => String(f ?? '').slice(0, 90))
      .filter(Boolean)
      .slice(0, 4);
    const nextTasks = (Array.isArray(parsed?.nextTasks) ? parsed.nextTasks : [])
      .map((t: any) => ({ id: String(t?.id ?? ''), reason: String(t?.reason ?? '').slice(0, 200) }))
      .filter((t: any) => t.id && validIds.has(t.id))
      .slice(0, 6);
    const bottlenecks = (Array.isArray(parsed?.bottlenecks) ? parsed.bottlenecks : [])
      .map((t: any) => ({ id: String(t?.id ?? ''), reason: String(t?.reason ?? '').slice(0, 240), suggestion: String(t?.suggestion ?? '').slice(0, 240) }))
      .filter((t: any) => t.id && validIds.has(t.id))
      .slice(0, 5);

    res.json({
      productivityScore: {
        score: clampInt(scoreObj.score, 0, 100),
        summary: String(scoreObj.summary ?? '').slice(0, 320),
        focusAreas,
      },
      nextTasks,
      bottlenecks,
      weeklySummary: String(parsed?.weeklySummary ?? '').slice(0, 600),
    });
  } catch (e) {
    console.error('Dashboard widgets AI request failed:', e);
    res.status(500).json({ error: 'AI request failed. Please try again.' });
  }
});

export default router;