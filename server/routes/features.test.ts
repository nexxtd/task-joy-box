import express from 'express';
import cookieParser from 'cookie-parser';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, Server } from 'http';
import jwt from 'jsonwebtoken';

const state = vi.hoisted(() => {
  const taskTemplatesRows = [
    {
      id: 1,
      userId: 10,
      name: 'User A Public Task',
      title: 'Public Task Title',
      description: 'Public desc',
      priority: 'medium',
      duration: 30,
      labels: '[]',
      subtasks: '[]',
      checklists: '[]',
      images: '[]',
      attachments: '[]',
      templateTags: '["Work"]',
      isPublic: true,
      shareCode: 'TASK-PUB1',
      updatedAt: '2026-11-17T00:00:00.000Z',
    },
    {
      id: 2,
      userId: 10,
      name: 'User A Secret Private Task',
      title: 'Private Task Title',
      description: 'Private desc',
      priority: 'high',
      duration: 45,
      labels: '[]',
      subtasks: '[]',
      checklists: '[]',
      images: '[]',
      attachments: '[]',
      templateTags: '["Personal"]',
      isPublic: false,
      shareCode: null,
      updatedAt: '2026-11-17T00:00:00.000Z',
    },
  ];
  const noteTemplatesRows = [
    {
      id: 11,
      userId: 10,
      name: 'Public Note Spec',
      title: 'Public Note',
      content: 'Public body',
      description: 'Public body',
      color: 'hsl(var(--card))',
      priority: 'medium',
      duration: 20,
      tags: '[]',
      labels: '[]',
      subtasks: '[]',
      checklists: '[]',
      images: '[]',
      attachments: '[]',
      templateTags: '["Study"]',
      isPublic: true,
      shareCode: 'NOTE-PUB1',
      updatedAt: '2026-11-17T00:00:00.000Z',
    },
    {
      id: 12,
      userId: 10,
      name: 'Private Diary Note',
      title: 'Private Note',
      content: 'Top secret diary',
      description: 'Top secret diary',
      color: 'hsl(var(--card))',
      priority: 'low',
      duration: 15,
      tags: '[]',
      labels: '[]',
      subtasks: '[]',
      checklists: '[]',
      images: '[]',
      attachments: '[]',
      templateTags: '["Personal"]',
      isPublic: false,
      shareCode: null,
      updatedAt: '2026-11-17T00:00:00.000Z',
    },
  ];
  return { taskTemplatesRows, noteTemplatesRows, deletedAllUserId: null as number | null };
});

vi.mock('../db.js', () => ({
  db: {
    select: (fields?: any) => {
      const makeChain = (rows: any[]) => ({
        from: () => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: async () => rows.filter(r => {
                const tmpl = r.template ?? r;
                return tmpl.isPublic === true;
              }),
            }),
          }),
          where: () => {
            const arr: any = Promise.resolve(rows);
            arr.orderBy = async () => rows;
            arr.limit = async () => rows;
            return arr;
          },
        }),
      });
      if (fields && fields.template) {
        return {
          from: (tbl: any) => {
            const tableName = tbl?.[Symbol.for('drizzle:Name')] || tbl?.name || '';
            const list = tableName === 'note_templates'
              ? state.noteTemplatesRows
              : state.taskTemplatesRows;
            return {
              leftJoin: () => ({
                where: (cond: any) => ({
                  orderBy: async () => {
                    const hasIsPublicTrue = (node: any, seen = new Set<any>()): boolean => {
                      if (!node || typeof node !== 'object' || seen.has(node)) return false;
                      seen.add(node);
                      const chunks = Array.isArray(node.queryChunks) ? node.queryChunks : [];
                      if (chunks.some((c: any) => c?.name === 'is_public') && chunks.some((c: any) => c?.value === true)) {
                        return true;
                      }
                      return chunks.some((c: any) => hasIsPublicTrue(c, seen));
                    };
                    const rows = hasIsPublicTrue(cond) ? list.filter(t => t.isPublic === true) : list;
                    return rows.map(t => ({ template: t, authorName: 'Alice', authorEmail: 'alice@example.com' }));
                  },
                }),
              }),
            };
          },
        };
      }
      return makeChain([]);
    },
    update: () => ({
      set: () => ({
        where: async () => [],
      }),
    }),
    delete: () => ({
      where: async () => {
        state.deletedAllUserId = 20;
        return [];
      },
    }),
  },
}));

vi.mock('../lib/tier.js', () => ({
  SERVER_PLAN_LIMITS: {
    projects: { free: 2, premium: 10, pro: Infinity },
    taskTemplates: { free: 10, premium: 50, pro: Infinity },
    noteTemplates: { free: 10, premium: 50, pro: Infinity },
  },
}));

vi.mock('../lib/orgLifecycle.js', () => ({
  resolveEffectiveUserPlan: async () => ({ tier: 'pro' }),
}));

import taskTemplatesRouter from './taskTemplates.js';
import noteTemplatesRouter from './noteTemplates.js';
import notificationsRouter from './notifications.js';
import integrationsRouter from './integrations.js';

let server: Server;
let baseUrl = '';
let user2Token = '';

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-jwt-secret-123456';
  process.env.CLICKUP_CLIENT_ID = 'CU_TEST_CLIENT_ID';
  process.env.CLICKUP_CLIENT_SECRET = 'CU_TEST_SECRET';
  process.env.TRELLO_CLIENT_ID = 'TRELLO_TEST_CLIENT_ID';
  process.env.TRELLO_CLIENT_SECRET = 'TRELLO_TEST_SECRET';

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/task-templates', taskTemplatesRouter);
  app.use('/api/note-templates', noteTemplatesRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/integrations', integrationsRouter);

  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const addr: any = server.address();
  baseUrl = `http://127.0.0.1:${addr.port}`;
  user2Token = jwt.sign({ userId: 20, email: 'userb@example.com' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
});

describe('backend routes: integrations, template privacy, and notifications dismiss', () => {
  it('excludes private templates from /public task and note template endpoints', async () => {
    const taskRes = await fetch(`${baseUrl}/api/task-templates/public`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    expect(taskRes.status).toBe(200);
    const taskBody: any = await taskRes.json();
    expect(taskBody.templates.some((t: any) => t.name.includes('User A Public Task'))).toBe(true);
    expect(taskBody.templates.some((t: any) => t.name.includes('Secret Private'))).toBe(false);
    expect(taskBody.templates.every((t: any) => t.isPublic === true)).toBe(true);

    const noteRes = await fetch(`${baseUrl}/api/note-templates/public`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    expect(noteRes.status).toBe(200);
    const noteBody: any = await noteRes.json();
    expect(noteBody.templates.some((t: any) => t.name.includes('Public Note Spec'))).toBe(true);
    expect(noteBody.templates.some((t: any) => t.name.includes('Private Diary'))).toBe(false);
    expect(noteBody.templates.every((t: any) => t.isPublic === true)).toBe(true);
  });

  it('builds Trello OAuth URL without invalid audience param and preserves caller origin', async () => {
    const trelloRes = await fetch(`${baseUrl}/api/integrations/trello/auth?origin=${encodeURIComponent('http://localhost:5000')}`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    expect(trelloRes.status).toBe(200);
    const trelloData: any = await trelloRes.json();
    const trelloUrl = new URL(trelloData.authUrl);
    expect(trelloUrl.origin).toBe('https://auth.atlassian.com');
    expect(trelloUrl.searchParams.has('audience')).toBe(false);
    expect(trelloUrl.searchParams.get('redirect_uri')).toBe('http://localhost:5000/api/integrations/trello/callback');

    const cuRes = await fetch(`${baseUrl}/api/integrations/clickup/auth?origin=${encodeURIComponent('http://localhost:5000')}`, {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    expect(cuRes.status).toBe(200);
    const cuData: any = await cuRes.json();
    const cuUrl = new URL(cuData.authUrl);
    expect(cuUrl.origin).toBe('https://app.clickup.com');
    expect(cuUrl.searchParams.get('redirect_uri')).toBe('http://localhost:5000/api/integrations/clickup/callback');
  });

  it('clears all notifications via DELETE /api/notifications', async () => {
    const res = await fetch(`${baseUrl}/api/notifications`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    expect(res.status).toBe(200);
    expect(state.deletedAllUserId).toBe(20);
  });
});
