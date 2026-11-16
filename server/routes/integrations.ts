import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { db } from '../db.js';
import { connectedAccounts, boardSnapshots, projects, projectMembers, tasks, columns, boards } from '../../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import crypto from 'crypto';

const router = Router();

// ClickUp API base URL
const CLICKUP_API = 'https://api.clickup.com/api/v2';

// Helper: Make authenticated request to ClickUp API
async function clickupFetch(endpoint: string, token: string, options: RequestInit = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${CLICKUP_API}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: token.trim(),
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`ClickUp API error (${res.status}): ${errBody || res.statusText}`);
  }
  return res.json();
}

// 1. Connect ClickUp Account (Verifies token and saves connection)
router.post('/clickup/connect', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'ClickUp API Token is required. You can generate one in ClickUp Settings -> Apps -> API Token.' });
    }

    const cleanToken = token.trim();

    // Verify token with ClickUp User API
    const userData = await clickupFetch('/user', cleanToken);
    const clickupUser = userData?.user || {};

    // Get Teams / Workspaces
    const teamsData = await clickupFetch('/team', cleanToken);
    const teams = teamsData?.teams || [];

    // Save or update in connectedAccounts
    const existing = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.userId, req.userId!), eq(connectedAccounts.provider, 'clickup')))
      .limit(1);

    const metadata = JSON.stringify({
      username: clickupUser.username || '',
      email: clickupUser.email || '',
      profilePicture: clickupUser.profilePicture || '',
      teams: teams.map((t: any) => ({ id: t.id, name: t.name })),
    });

    if (existing.length > 0) {
      await db
        .update(connectedAccounts)
        .set({
          accountName: clickupUser.username || 'ClickUp User',
          accountEmail: clickupUser.email || '',
          accessToken: cleanToken,
          metadata,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(connectedAccounts.id, existing[0].id));
    } else {
      await db.insert(connectedAccounts).values({
        userId: req.userId!,
        provider: 'clickup',
        accountName: clickupUser.username || 'ClickUp User',
        accountEmail: clickupUser.email || '',
        accessToken: cleanToken,
        metadata,
      });
    }

    res.json({
      success: true,
      user: {
        id: clickupUser.id,
        username: clickupUser.username,
        email: clickupUser.email,
        profilePicture: clickupUser.profilePicture,
      },
      teams: teams.map((t: any) => ({ id: t.id, name: t.name })),
    });
  } catch (error: any) {
    console.error('ClickUp connection failed:', error?.message || error);
    res.status(400).json({
      error: error?.message?.includes('401')
        ? 'Invalid ClickUp API Token. Please check your token in ClickUp Settings -> Apps -> API Token and try again.'
        : `Failed to connect ClickUp: ${error?.message || 'Unknown error'}`,
    });
  }
});


// ---------------------------------------------------------------------------
// One-click sign-in (OAuth) — users never handle API keys.
// Env: CLICKUP_CLIENT_ID, CLICKUP_CLIENT_SECRET, TRELLO_API_KEY (+ FRONTEND_URL / BACKEND_URL)
// ---------------------------------------------------------------------------
const OAUTH_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET || 'planora-integrations';
const frontendBase = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

function signOAuthState(data: object): string {
  const payload = JSON.stringify(data);
  const signature = crypto.createHmac('sha256', OAUTH_SECRET).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload: data, signature })).toString('base64url');
}

function verifyOAuthState(state: string): any {
  try {
    const { payload, signature } = JSON.parse(Buffer.from(state, 'base64url').toString());
    const expected = crypto.createHmac('sha256', OAUTH_SECRET).update(JSON.stringify(payload)).digest('hex');
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    if (!payload?.userId || Date.now() - Number(payload.ts) > 15 * 60 * 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function backendBase(req: AuthRequest): string {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol;
  return `${proto}://${req.get('host')}`;
}

async function saveConnection(userId: number, provider: string, data: { accountName: string; accountEmail: string; accessToken: string; metadata: object }) {
  const existing = await db
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, userId), eq(connectedAccounts.provider, provider)))
    .limit(1);
  const values = { ...data, metadata: JSON.stringify(data.metadata) };
  if (existing.length > 0) {
    await db.update(connectedAccounts).set({ ...values, updatedAt: new Date().toISOString() }).where(eq(connectedAccounts.id, existing[0].id));
  } else {
    await db.insert(connectedAccounts).values({ userId, provider, ...values });
  }
}

// ClickUp: start sign-in
router.get('/clickup/auth', requireAuth, (req: AuthRequest, res: Response) => {
  const clientId = process.env.CLICKUP_CLIENT_ID;
  if (!clientId || !process.env.CLICKUP_CLIENT_SECRET) {
    return res.status(503).json({ error: 'ClickUp sign-in is not configured on the server yet (CLICKUP_CLIENT_ID / CLICKUP_CLIENT_SECRET).' });
  }
  const redirectUri = `${backendBase(req)}/api/integrations/clickup/callback`;
  const state = signOAuthState({ userId: req.userId, ts: Date.now() });
  const authUrl = `https://app.clickup.com/api?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  res.json({ authUrl });
});

// ClickUp: OAuth callback — exchange code, save, import everything, return to Settings
router.get('/clickup/callback', async (req: AuthRequest, res: Response) => {
  const back = (q: string) => res.redirect(`${frontendBase()}/settings?tab=account&${q}`);
  const { code, state, error } = req.query as Record<string, string>;
  if (error || !code) return back(`integrationError=clickup_${encodeURIComponent(error || 'denied')}`);
  const st = verifyOAuthState(state || '');
  if (!st) return back('integrationError=clickup_expired');
  try {
    const tokenRes = await fetch(
      `${CLICKUP_API}/oauth/token?client_id=${encodeURIComponent(process.env.CLICKUP_CLIENT_ID || '')}&client_secret=${encodeURIComponent(process.env.CLICKUP_CLIENT_SECRET || '')}&code=${encodeURIComponent(code)}`,
      { method: 'POST' },
    );
    const tokenData: any = await tokenRes.json().catch(() => ({}));
    const accessToken = tokenData?.access_token;
    if (!tokenRes.ok || !accessToken) throw new Error(tokenData?.err || 'Token exchange failed');

    const userData = await clickupFetch('/user', accessToken);
    const teamsData = await clickupFetch('/team', accessToken);
    const u = userData?.user || {};
    const teams = (teamsData?.teams || []).map((t: any) => ({ id: t.id, name: t.name }));
    await saveConnection(st.userId, 'clickup', {
      accountName: u.username || 'ClickUp User',
      accountEmail: u.email || '',
      accessToken,
      metadata: { username: u.username || '', email: u.email || '', profilePicture: u.profilePicture || '', teams, auth: 'oauth' },
    });

    let imported = 0;
    for (const team of teams) {
      try {
        const r: any = await runClickUpImport(st.userId, accessToken, [], String(team.id));
        imported += Number(r?.imported?.tasks || 0);
      } catch (e) {
        console.warn('ClickUp auto-import failed for team', team.id, (e as any)?.message || e);
      }
    }
    back(`connected=clickup&imported=${imported}`);
  } catch (e: any) {
    console.error('ClickUp OAuth callback failed:', e?.message || e);
    back('integrationError=clickup_failed');
  }
});

// ---- Trello ----
const TRELLO_API = 'https://api.trello.com/1';
async function trelloFetch(path: string, token: string) {
  const key = process.env.TRELLO_API_KEY || '';
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch(`${TRELLO_API}${path}${sep}key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`);
  if (!r.ok) throw new Error(`Trello API error (${r.status}): ${await r.text().catch(() => r.statusText)}`);
  return r.json();
}

// Trello: start sign-in. Trello returns the token in the URL fragment of return_url;
// the Settings page picks it up and POSTs it to /trello/connect.
router.get('/trello/auth', requireAuth, (req: AuthRequest, res: Response) => {
  const key = process.env.TRELLO_API_KEY;
  if (!key) return res.status(503).json({ error: 'Trello sign-in is not configured on the server yet (TRELLO_API_KEY).' });
  const returnUrl = `${frontendBase()}/settings?tab=account&trelloCallback=1`;
  const authUrl = `https://trello.com/1/authorize?expiration=never&name=${encodeURIComponent('Planora')}&scope=read&response_type=token&callback_method=fragment&key=${encodeURIComponent(key)}&return_url=${encodeURIComponent(returnUrl)}`;
  res.json({ authUrl });
});

async function runTrelloImport(userId: number, token: string) {
  const boardsList: any[] = await trelloFetch('/members/me/boards?filter=open&fields=name,desc', token);
  const [snapshotRow] = await db.select().from(boardSnapshots).where(eq(boardSnapshots.userId, userId)).orderBy(desc(boardSnapshots.updatedAt)).limit(1);
  let currentBoard: any = { columns: [], tasks: [] };
  if (snapshotRow?.snapshot) { try { currentBoard = JSON.parse(snapshotRow.snapshot); } catch {} }
  if (!Array.isArray(currentBoard.columns) || currentBoard.columns.length === 0) {
    currentBoard.columns = [
      { id: 'to_do', title: 'To Do', color: 'label-purple' },
      { id: 'in_progress', title: 'In Progress', color: 'label-blue' },
      { id: 'done', title: 'Done', color: 'label-green' },
    ];
  }
  if (!Array.isArray(currentBoard.tasks)) currentBoard.tasks = [];
  const existing = new Set(currentBoard.tasks.map((t: any) => String(t.title || '').toLowerCase().trim()));
  const importedTasks: any[] = [];
  let checklistsCount = 0;
  const projectNames: string[] = [];

  for (const b of boardsList) {
    let projectId: number | null = null;
    const projectName = String(b.name || 'Trello board').slice(0, 80);
    try {
      const [proj] = await db.insert(projects).values({
        name: projectName,
        description: `Imported from Trello${b.desc ? ` — ${String(b.desc).slice(0, 200)}` : ''}`,
        color: '#0079bf',
        ownerId: userId,
        inviteCode: crypto.randomBytes(16).toString('hex'),
      }).returning();
      await db.insert(projectMembers).values({ projectId: proj.id, userId, role: 'owner' });
      projectId = proj.id;
      projectNames.push(projectName);
    } catch (err) {
      console.warn('Could not create project for Trello board:', err);
    }

    let lists: any[] = [];
    let cards: any[] = [];
    try {
      lists = await trelloFetch(`/boards/${b.id}/lists?filter=all&fields=name,closed`, token);
      cards = await trelloFetch(`/boards/${b.id}/cards?filter=all&checklists=all&fields=name,desc,due,dueComplete,closed,idList,labels,dateLastActivity`, token);
    } catch (err) {
      console.error('Failed to fetch Trello board', b.id, err);
      continue;
    }
    const listName = new Map(lists.map((l: any) => [l.id, String(l.name || '')]));

    for (const c of cards) {
      const title = String(c.name || '').trim();
      if (!title || existing.has(title.toLowerCase())) continue;
      const ln = listName.get(c.idList) || '';
      const done = Boolean(c.dueComplete) || /done|complete|finished|closed/i.test(ln);
      const doing = !done && /progress|doing|working|review/i.test(ln);
      const columnId = done ? 'done' : doing ? 'in_progress' : 'to_do';
      let dueDate: string | undefined;
      let dueTime: string | undefined;
      if (c.due) {
        const d = new Date(c.due);
        if (!Number.isNaN(d.getTime())) {
          dueDate = d.toISOString().slice(0, 10);
          dueTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }
      }
      const checklists = (Array.isArray(c.checklists) ? c.checklists : []).map((cl: any) => {
        checklistsCount += 1;
        return {
          id: `checklist-${cl.id}`,
          title: String(cl.name || 'Checklist'),
          items: (cl.checkItems || []).map((ci: any) => ({ id: `item-${ci.id}`, text: String(ci.name || ''), completed: ci.state === 'complete' })),
        };
      });
      importedTasks.push({
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        description: String(c.desc || '').trim(),
        priority: 'none',
        status: columnId,
        completed: done,
        completedAt: done ? new Date().toISOString() : undefined,
        dueDate,
        dueTime,
        duration: 30,
        columnId,
        order: currentBoard.tasks.length + importedTasks.length + 1,
        projectId,
        projectName,
        labels: (c.labels || []).filter((l: any) => l.name).map((l: any) => ({ id: `tag-${l.name}`, name: String(l.name), color: l.color || '#6366f1' })),
        subtasks: [],
        checklists,
        createdAt: new Date().toISOString(),
        updatedAt: c.dateLastActivity || new Date().toISOString(),
      });
      existing.add(title.toLowerCase());
    }
  }

  if (importedTasks.length > 0) {
    currentBoard.tasks = [...currentBoard.tasks, ...importedTasks];
    await db.delete(boardSnapshots).where(eq(boardSnapshots.userId, userId));
    await db.insert(boardSnapshots).values({ userId, snapshot: JSON.stringify(currentBoard) });
  }
  return { tasks: importedTasks.length, checklists: checklistsCount, projects: projectNames.length, projectNames };
}

router.post('/trello/connect', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (!/^[A-Za-z0-9]{32,128}$/.test(token)) return res.status(400).json({ error: 'Trello sign-in did not return a valid authorization.' });
    const me: any = await trelloFetch('/members/me?fields=username,fullName,email,avatarUrl', token);
    await saveConnection(req.userId!, 'trello', {
      accountName: me.fullName || me.username || 'Trello User',
      accountEmail: me.email || '',
      accessToken: token,
      metadata: { username: me.username || '', avatarUrl: me.avatarUrl || '' },
    });
    const imported = await runTrelloImport(req.userId!, token);
    res.json({ success: true, imported, message: `Imported ${imported.tasks} cards from ${imported.projects} Trello boards.` });
  } catch (e: any) {
    console.error('Trello connect failed:', e?.message || e);
    res.status(400).json({ error: 'Could not connect Trello. Please try again.' });
  }
});

router.post('/trello/import', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [conn] = await db.select().from(connectedAccounts)
      .where(and(eq(connectedAccounts.userId, req.userId!), eq(connectedAccounts.provider, 'trello'))).limit(1);
    if (!conn) return res.status(401).json({ error: 'Trello is not connected.' });
    const imported = await runTrelloImport(req.userId!, conn.accessToken);
    res.json({ success: true, imported, message: imported.tasks ? `Imported ${imported.tasks} new cards.` : 'Everything from Trello is already imported.' });
  } catch (e: any) {
    console.error('Trello import failed:', e?.message || e);
    res.status(500).json({ error: 'Failed to import from Trello' });
  }
});

router.get('/trello/status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [conn] = await db.select().from(connectedAccounts)
      .where(and(eq(connectedAccounts.userId, req.userId!), eq(connectedAccounts.provider, 'trello'))).limit(1);
    if (!conn) return res.json({ connected: false, configured: !!process.env.TRELLO_API_KEY });
    res.json({ connected: true, configured: true, accountName: conn.accountName, accountEmail: conn.accountEmail, connectedAt: conn.createdAt });
  } catch {
    res.json({ connected: false });
  }
});

router.post('/trello/disconnect', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db.delete(connectedAccounts).where(and(eq(connectedAccounts.userId, req.userId!), eq(connectedAccounts.provider, 'trello')));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

// 2. Check ClickUp Connection Status
router.get('/clickup/status', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [conn] = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.userId, req.userId!), eq(connectedAccounts.provider, 'clickup')))
      .limit(1);

    if (!conn) {
      return res.json({ connected: false, configured: !!(process.env.CLICKUP_CLIENT_ID && process.env.CLICKUP_CLIENT_SECRET) });
    }

    let meta: any = {};
    try {
      meta = JSON.parse(conn.metadata || '{}');
    } catch {}

    res.json({
      connected: true,
      accountName: conn.accountName,
      accountEmail: conn.accountEmail,
      user: {
        username: conn.accountName,
        email: conn.accountEmail,
        profilePicture: meta.profilePicture,
      },
      teams: meta.teams || [],
      connectedAt: conn.createdAt,
    });
  } catch (error) {
    console.error('Failed to get ClickUp status:', error);
    res.status(500).json({ connected: false });
  }
});

// 3. Disconnect ClickUp Account
router.post('/clickup/disconnect', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    await db
      .delete(connectedAccounts)
      .where(and(eq(connectedAccounts.userId, req.userId!), eq(connectedAccounts.provider, 'clickup')));
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to disconnect ClickUp:', error);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

// 4. Get ClickUp Hierarchy (Workspaces -> Spaces -> Folders -> Lists)
router.get('/clickup/hierarchy', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [conn] = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.userId, req.userId!), eq(connectedAccounts.provider, 'clickup')))
      .limit(1);

    if (!conn) {
      return res.status(401).json({ error: 'ClickUp is not connected. Please connect your account first.' });
    }

    const token = conn.accessToken;
    let teamId = String(req.query.teamId || '');

    if (!teamId) {
      const teamsData = await clickupFetch('/team', token);
      teamId = String(teamsData?.teams?.[0]?.id || '');
    }

    if (!teamId) {
      return res.json({ spaces: [] });
    }

    // Get Spaces
    const spacesData = await clickupFetch(`/team/${teamId}/space?archived=false`, token);
    const spaces = spacesData?.spaces || [];

    // For each space, fetch lists and folders
    const hierarchy = await Promise.all(
      spaces.map(async (sp: any) => {
        try {
          const [folderlessLists, foldersData] = await Promise.all([
            clickupFetch(`/space/${sp.id}/list?archived=false`, token).catch(() => ({ lists: [] })),
            clickupFetch(`/space/${sp.id}/folder?archived=false`, token).catch(() => ({ folders: [] })),
          ]);

          const folders = await Promise.all(
            (foldersData?.folders || []).map(async (fol: any) => {
              const fLists = await clickupFetch(`/folder/${fol.id}/list?archived=false`, token).catch(() => ({ lists: [] }));
              return {
                id: fol.id,
                name: fol.name,
                lists: (fLists?.lists || []).map((l: any) => ({
                  id: l.id,
                  name: l.name,
                  taskCount: l.task_count ?? 0,
                })),
              };
            })
          );

          return {
            id: sp.id,
            name: sp.name,
            color: sp.color,
            lists: (folderlessLists?.lists || []).map((l: any) => ({
              id: l.id,
              name: l.name,
              taskCount: l.task_count ?? 0,
            })),
            folders,
          };
        } catch {
          return { id: sp.id, name: sp.name, lists: [], folders: [] };
        }
      })
    );

    res.json({ teamId, spaces: hierarchy });
  } catch (error: any) {
    console.error('Failed to get ClickUp hierarchy:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch ClickUp hierarchy' });
  }
});

// 5. Import / Copy Everything Over from ClickUp
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Import ClickUp lists (all lists in the workspace when listIds is empty) into the user's board. */
async function runClickUpImport(userId: number, token: string, listIds: string[] = [], teamIdIn?: string) {
    const requestedListIds: string[] = listIds;
  const teamId = teamIdIn || '';

  let targetLists: Array<{ id: string; name: string; spaceName: string }> = [];

  if (requestedListIds.length > 0) {
    // Fetch details for specified lists
    for (const lid of requestedListIds) {
      try {
        const lData = await clickupFetch(`/list/${lid}`, token);
        if (lData?.id) {
          targetLists.push({
            id: lData.id,
            name: lData.name || 'Untitled List',
            spaceName: lData.space?.name || 'ClickUp Space',
          });
        }
      } catch {}
    }
  } else {
    // Auto-discover all lists in team
    const teamsData = await clickupFetch('/team', token);
    const activeTeamId = teamId || teamsData?.teams?.[0]?.id;
    if (activeTeamId) {
      const spacesData = await clickupFetch(`/team/${activeTeamId}/space?archived=false`, token);
      const spaces = spacesData?.spaces || [];
      for (const sp of spaces) {
        try {
          const fLists = await clickupFetch(`/space/${sp.id}/list?archived=false`, token).catch(() => ({ lists: [] }));
          for (const l of fLists?.lists || []) {
            targetLists.push({ id: l.id, name: l.name, spaceName: sp.name });
          }
          const foldersData = await clickupFetch(`/space/${sp.id}/folder?archived=false`, token).catch(() => ({ folders: [] }));
          for (const fol of foldersData?.folders || []) {
            const folLists = await clickupFetch(`/folder/${fol.id}/list?archived=false`, token).catch(() => ({ lists: [] }));
            for (const l of folLists?.lists || []) {
              targetLists.push({ id: l.id, name: l.name, spaceName: `${sp.name} / ${fol.name}` });
            }
          }
        } catch {}
      }
    }
  }

  if (targetLists.length === 0) {
    throw new HttpError(400, 'No ClickUp lists found to import. Please select at least one list.');
  }

  // Load existing board snapshot
  const [snapshotRow] = await db
    .select()
    .from(boardSnapshots)
    .where(eq(boardSnapshots.userId, userId))
    .orderBy(desc(boardSnapshots.updatedAt))
    .limit(1);

  let currentBoard: any = { columns: [], tasks: [] };
  if (snapshotRow?.snapshot) {
    try {
      currentBoard = JSON.parse(snapshotRow.snapshot);
    } catch {}
  }

  if (!Array.isArray(currentBoard.columns) || currentBoard.columns.length === 0) {
    currentBoard.columns = [
      { id: 'to_do', title: 'To Do', color: 'label-purple' },
      { id: 'in_progress', title: 'In Progress', color: 'label-blue' },
      { id: 'done', title: 'Done', color: 'label-green' },
    ];
  }
  if (!Array.isArray(currentBoard.tasks)) {
    currentBoard.tasks = [];
  }

  const existingTaskTitles = new Set(currentBoard.tasks.map((t: any) => String(t.title || '').toLowerCase().trim()));
  const importedTasks: any[] = [];
  let subtasksCount = 0;
  let checklistsCount = 0;
  const createdProjectNames: string[] = [];

  // Process each ClickUp list
  for (const list of targetLists) {
    // 1. Create or match Planora Project
    const projectName = `${list.spaceName}: ${list.name}`.slice(0, 80);
    let projectId: number | null = null;

    try {
      const inviteCode = crypto.randomBytes(16).toString('hex');
      const [proj] = await db
        .insert(projects)
        .values({
          name: projectName,
          description: `Imported from ClickUp (${list.name})`,
          color: '#7b68ee',
          ownerId: userId,
          inviteCode,
        })
        .returning();

      await db.insert(projectMembers).values({
        projectId: proj.id,
        userId: userId,
        role: 'owner',
      });
      projectId = proj.id;
      createdProjectNames.push(projectName);
    } catch (err) {
      console.warn('Could not create project record, assigning to general board:', err);
    }

    // 2. Fetch tasks from ClickUp
    let clickupTasks: any[] = [];
    try {
      const tasksData = await clickupFetch(`/list/${list.id}/task?archived=false&subtasks=true&include_closed=true`, token);
      clickupTasks = tasksData?.tasks || [];
    } catch (err) {
      console.error(`Failed to fetch tasks for list ${list.id}:`, err);
      continue;
    }

    for (const ct of clickupTasks) {
      const title = String(ct.name || '').trim();
      if (!title) continue;

      // Skip exact duplicate if requested
      const cleanTitleLower = title.toLowerCase();
      if (existingTaskTitles.has(cleanTitleLower)) {
        // Task already exists, skip duplicate
        continue;
      }

      // Priority resolution
      const cp = ct.priority?.priority;
      const priority = cp === 1 ? 'urgent' : cp === 2 ? 'high' : cp === 3 ? 'medium' : cp === 4 ? 'low' : 'none';

      // Status & Completion resolution
      const isClosed = Boolean(ct.status?.type === 'closed' || /closed|complete|done/i.test(ct.status?.status || ''));
      const isInProgress = /progress|doing|working/i.test(ct.status?.status || '');
      const columnId = isClosed ? 'done' : isInProgress ? 'in_progress' : 'to_do';

      // Due date & time resolution
      let dueDate: string | undefined = undefined;
      let dueTime: string | undefined = undefined;
      if (ct.due_date) {
        const d = new Date(Number(ct.due_date));
        if (!Number.isNaN(d.getTime())) {
          dueDate = d.toISOString().slice(0, 10);
          if (d.getHours() !== 0 || d.getMinutes() !== 0) {
            dueTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          }
        }
      }

      // Subtasks resolution
      const rawSubtasks = Array.isArray(ct.subtasks) ? ct.subtasks : [];
      const taskSubtasks = rawSubtasks.map((st: any) => {
        subtasksCount += 1;
        const stClosed = Boolean(st.status?.type === 'closed' || /closed|complete|done/i.test(st.status?.status || ''));
        return {
          id: `subtask-${st.id || Math.random().toString(36).slice(2, 9)}`,
          text: String(st.name || '').trim(),
          completed: stClosed,
        };
      });

      // Checklists resolution
      const rawChecklists = Array.isArray(ct.checklists) ? ct.checklists : [];
      const taskChecklists = rawChecklists.map((cl: any) => {
        checklistsCount += 1;
        const items = Array.isArray(cl.items) ? cl.items : [];
        return {
          id: `checklist-${cl.id || Math.random().toString(36).slice(2, 9)}`,
          title: String(cl.name || 'Checklist').trim(),
          items: items.map((ci: any) => ({
            id: `item-${ci.id || Math.random().toString(36).slice(2, 9)}`,
            text: String(ci.name || '').trim(),
            completed: Boolean(ci.resolved),
          })),
        };
      });

      // Labels / tags resolution
      const rawTags = Array.isArray(ct.tags) ? ct.tags : [];
      const taskLabels = rawTags.map((tag: any) => ({
        id: `tag-${tag.name}`,
        name: String(tag.name),
        color: tag.tag_bg || '#6366f1',
      }));

      const newTaskObj = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title,
        description: String(ct.text_content || ct.description || '').trim(),
        priority,
        status: isClosed ? 'done' : isInProgress ? 'in_progress' : 'to_do',
        completed: isClosed,
        completedAt: isClosed ? new Date().toISOString() : undefined,
        dueDate,
        dueTime,
        duration: ct.time_estimate ? Math.round(Number(ct.time_estimate) / 60000) : 30,
        columnId,
        order: currentBoard.tasks.length + importedTasks.length + 1,
        projectId,
        projectName,
        labels: taskLabels,
        subtasks: taskSubtasks,
        checklists: taskChecklists,
        createdAt: ct.date_created ? new Date(Number(ct.date_created)).toISOString() : new Date().toISOString(),
        updatedAt: ct.date_updated ? new Date(Number(ct.date_updated)).toISOString() : new Date().toISOString(),
      };

      importedTasks.push(newTaskObj);
      existingTaskTitles.add(cleanTitleLower);
    }
  }

  if (importedTasks.length === 0) {
    return {
      success: true,
      message: 'All tasks from the selected ClickUp lists are already imported.',
      imported: { tasks: 0, subtasks: 0, checklists: 0, projects: createdProjectNames.length },
    };
  }

  // Merge into board snapshot and persist
  currentBoard.tasks = [...currentBoard.tasks, ...importedTasks];
  await db.delete(boardSnapshots).where(eq(boardSnapshots.userId, userId));
  await db.insert(boardSnapshots).values({
    userId: userId,
    snapshot: JSON.stringify(currentBoard),
  });

  return {
    success: true,
    message: `Successfully imported ${importedTasks.length} tasks, ${subtasksCount} subtasks, and ${checklistsCount} checklists across ${createdProjectNames.length} projects.`,
    imported: {
      tasks: importedTasks.length,
      subtasks: subtasksCount,
      checklists: checklistsCount,
      projects: createdProjectNames.length,
      projectNames: createdProjectNames,
    },
  };
}

router.post('/clickup/import', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const [conn] = await db
      .select()
      .from(connectedAccounts)
      .where(and(eq(connectedAccounts.userId, req.userId!), eq(connectedAccounts.provider, 'clickup')))
      .limit(1);
    const token = req.body.token ? String(req.body.token).trim() : conn?.accessToken;
    if (!token) {
      return res.status(401).json({ error: 'ClickUp is not connected. Please connect your account first.' });
    }
    const listIds: string[] = Array.isArray(req.body.listIds) ? req.body.listIds.map(String) : [];
    const result = await runClickUpImport(req.userId!, token, listIds, req.body.teamId ? String(req.body.teamId) : '');
    res.json(result);
  } catch (error: any) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error('ClickUp import error:', error);
    res.status(500).json({ error: error?.message || 'Failed to import ClickUp tasks' });
  }
});

// 6. Generic File Import (JSON or CSV export from ClickUp, Asana, Trello, Todoist)
router.post('/import-file', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { items, projectName } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No task items provided to import.' });
    }

    const [snapshotRow] = await db
      .select()
      .from(boardSnapshots)
      .where(eq(boardSnapshots.userId, req.userId!))
      .orderBy(desc(boardSnapshots.updatedAt))
      .limit(1);

    let currentBoard: any = { columns: [], tasks: [] };
    if (snapshotRow?.snapshot) {
      try {
        currentBoard = JSON.parse(snapshotRow.snapshot);
      } catch {}
    }

    if (!Array.isArray(currentBoard.columns) || currentBoard.columns.length === 0) {
      currentBoard.columns = [
        { id: 'to_do', title: 'To Do', color: 'label-purple' },
        { id: 'in_progress', title: 'In Progress', color: 'label-blue' },
        { id: 'done', title: 'Done', color: 'label-green' },
      ];
    }
    if (!Array.isArray(currentBoard.tasks)) {
      currentBoard.tasks = [];
    }

    let createdProjectId: number | null = null;
    if (projectName && String(projectName).trim().length >= 2) {
      try {
        const inviteCode = crypto.randomBytes(16).toString('hex');
        const [proj] = await db
          .insert(projects)
          .values({
            name: String(projectName).trim(),
            description: 'Imported from external file',
            color: '#3b82f6',
            ownerId: req.userId!,
            inviteCode,
          })
          .returning();
        await db.insert(projectMembers).values({ projectId: proj.id, userId: req.userId!, role: 'owner' });
        createdProjectId = proj.id;
      } catch {}
    }

    const newTasks = items.map((raw: any, index: number) => {
      const isDone = Boolean(raw.completed || /done|completed|closed/i.test(String(raw.status || '')));
      return {
        id: `task-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
        title: String(raw.title || raw.name || 'Untitled Task').trim(),
        description: String(raw.description || '').trim(),
        priority: raw.priority || 'none',
        status: isDone ? 'done' : 'to_do',
        completed: isDone,
        dueDate: raw.dueDate || raw.due_date || undefined,
        columnId: isDone ? 'done' : 'to_do',
        order: currentBoard.tasks.length + index + 1,
        projectId: createdProjectId,
        projectName: projectName || undefined,
        subtasks: Array.isArray(raw.subtasks) ? raw.subtasks : [],
        checklists: Array.isArray(raw.checklists) ? raw.checklists : [],
        labels: Array.isArray(raw.labels) ? raw.labels : [],
        createdAt: new Date().toISOString(),
      };
    });

    currentBoard.tasks = [...currentBoard.tasks, ...newTasks];
    await db.delete(boardSnapshots).where(eq(boardSnapshots.userId, req.userId!));
    await db.insert(boardSnapshots).values({
      userId: req.userId!,
      snapshot: JSON.stringify(currentBoard),
    });

    res.json({
      success: true,
      count: newTasks.length,
      projectId: createdProjectId,
      message: `Successfully imported ${newTasks.length} tasks into your workspace.`,
    });
  } catch (error: any) {
    console.error('File import error:', error);
    res.status(500).json({ error: error?.message || 'Failed to import file' });
  }
});

export default router;

