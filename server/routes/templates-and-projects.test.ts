import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response, Router } from 'express';

const {
  selectQueue,
  updateQueue,
  insertQueue,
  deleteQueue,
  insertedPayloads,
  mockResolveEffectiveUserPlan,
} = vi.hoisted(() => ({
  selectQueue: [] as any[],
  updateQueue: [] as any[],
  insertQueue: [] as any[],
  deleteQueue: [] as any[],
  insertedPayloads: [] as any[],
  mockResolveEffectiveUserPlan: vi.fn(),
}));

function makeQueryChain(queue: any[], captureInserts = false) {
  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    set: () => chain,
    values: (payload: any) => {
      if (captureInserts) insertedPayloads.push(payload);
      return chain;
    },
    returning: () => chain,
    then: (onFulfilled: (value: any) => any, onRejected?: (reason: any) => any) => {
      const next = queue.length > 0 ? queue.shift() : [];
      return Promise.resolve(next).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

vi.mock('../db.js', () => ({
  pool: { query: vi.fn() },
  db: {
    select: () => makeQueryChain(selectQueue),
    update: () => makeQueryChain(updateQueue),
    insert: () => makeQueryChain(insertQueue, true),
    delete: () => makeQueryChain(deleteQueue),
  },
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: (req: any, _res: any, next: NextFunction) => {
    if (!req.userId) req.userId = Number(req.headers['x-test-user-id'] || 1);
    next();
  },
}));

vi.mock('../lib/orgLifecycle.js', () => ({
  DAY_MS: 86_400_000,
  resolveEffectiveUserPlan: (...args: any[]) => mockResolveEffectiveUserPlan(...args),
}));

vi.mock('../lib/settings.js', () => ({
  getSettingNumber: async (_key: string, fallback: number) => fallback,
}));

import taskTemplatesRouter from './taskTemplates';
import noteTemplatesRouter from './noteTemplates';
import projectsRouter from './projects';
import { DEFAULT_TEMPLATE_TAGS, sanitizeTemplateTags } from '../../shared/defaultTemplates';

function invokeRouter(
  router: Router,
  opts: {
    method: string;
    url: string;
    userId?: number;
    body?: any;
  },
): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let statusCode = 200;

    const req = {
      method: opts.method.toUpperCase(),
      url: opts.url,
      originalUrl: opts.url,
      headers: opts.userId ? { 'x-test-user-id': String(opts.userId) } : {},
      body: opts.body ?? {},
      query: {},
      params: {},
      userId: opts.userId ?? 1,
      protocol: 'http',
      get: (header: string) => (header.toLowerCase() === 'host' ? 'localhost' : ''),
    } as unknown as Request;

    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(payload: any) {
        settled = true;
        resolve({ status: statusCode, json: payload });
        return this;
      },
      send(payload: any) {
        settled = true;
        resolve({ status: statusCode, json: payload });
        return this;
      },
    } as unknown as Response;

    router(req, res, (err?: any) => {
      if (err) reject(err);
      else if (!settled) resolve({ status: statusCode, json: undefined });
    });
  });
}

beforeEach(() => {
  selectQueue.length = 0;
  updateQueue.length = 0;
  insertQueue.length = 0;
  deleteQueue.length = 0;
  insertedPayloads.length = 0;
  mockResolveEffectiveUserPlan.mockReset();
  mockResolveEffectiveUserPlan.mockResolvedValue({ tier: 'pro' });
});

describe('templates default tags & public gallery', () => {
  it('filters templateTags strictly to curated default tags (no custom tags)', () => {
    expect(DEFAULT_TEMPLATE_TAGS).toContain('Work');
    expect(DEFAULT_TEMPLATE_TAGS).toContain('School');
    expect(sanitizeTemplateTags(['Work', 'MyCustomTag', 'School', 'Work', 'RandomTag'])).toEqual([
      'Work',
      'School',
    ]);
  });

  it('lists public task & note templates with authorName and sanitized templateTags', async () => {
    selectQueue.push([
      {
        template: {
          id: 9,
          userId: 2,
          name: 'Homework Plan',
          title: 'Math Worksheet',
          description: 'Complete odd problems',
          priority: 'high',
          duration: 30,
          labels: '[]',
          subtasks: '[]',
          checklists: '[]',
          images: '[]',
          attachments: '[]',
          templateTags: JSON.stringify(['School', 'Study', 'InvalidCustom']),
          isPublic: true,
          shareCode: 'TASK-ABC123',
        },
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
      },
    ]);

    const taskPublic = await invokeRouter(taskTemplatesRouter, {
      method: 'GET',
      url: '/public',
      userId: 1,
    });
    expect(taskPublic.status).toBe(200);
    expect(taskPublic.json.templates).toHaveLength(1);
    expect(taskPublic.json.templates[0].authorName).toBe('Alice');
    expect(taskPublic.json.templates[0].kind).toBe('task');
    expect(taskPublic.json.templates[0].templateTags).toEqual(['School', 'Study']);

    selectQueue.push([
      {
        template: {
          id: 4,
          userId: 3,
          name: 'Sprint Notes',
          title: 'Retrospective',
          content: 'What went well',
          description: 'What went well',
          tags: '[]',
          labels: '[]',
          subtasks: '[]',
          checklists: '[]',
          images: '[]',
          attachments: '[]',
          templateTags: JSON.stringify(['Work', 'Meetings']),
          isPublic: true,
          shareCode: 'NOTE-XYZ999',
        },
        authorName: null,
        authorEmail: 'bob@example.com',
      },
    ]);

    const notePublic = await invokeRouter(noteTemplatesRouter, {
      method: 'GET',
      url: '/public',
      userId: 1,
    });
    expect(notePublic.status).toBe(200);
    expect(notePublic.json.templates[0].authorName).toBe('bob');
    expect(notePublic.json.templates[0].kind).toBe('note');
    expect(notePublic.json.templates[0].templateTags).toEqual(['Work', 'Meetings']);
  });
});

describe('project apply-item endpoint', () => {
  it('blocks non-members from applying items to project users', async () => {
    selectQueue.push([]); // projectMembers lookup returns empty
    const res = await invokeRouter(projectsRouter, {
      method: 'POST',
      url: '/42/apply-item',
      userId: 99,
      body: { targetUserIds: [2], kind: 'task', item: { title: 'Test' } },
    });
    expect(res.status).toBe(403);
  });

  it('clones project task into selected members boards and notifies them', async () => {
    selectQueue.push(
      [{ projectId: 42, userId: 1, role: 'owner' }], // requester membership
      [{ id: 42, name: 'Apollo Launch' }], // project
      [{ userId: 2 }], // valid recipient members
      [{ id: 1, name: 'Orel', email: 'orel@example.com' }], // sender info
      [{ snapshot: JSON.stringify({ id: 'b', title: 'My Tasks', columns: [], tasks: [] }) }], // recipient snapshot
    );

    const res = await invokeRouter(projectsRouter, {
      method: 'POST',
      url: '/42/apply-item',
      userId: 1,
      body: {
        kind: 'task',
        targetUserIds: [2],
        item: { title: 'Prepare Demo', description: 'Slides + script', priority: 'high' },
      },
    });

    expect(res.status).toBe(200);
    expect(res.json.appliedCount).toBe(1);
    expect(insertedPayloads.some(p => p.type === 'project_item_applied' && p.userId === 2)).toBe(true);
    const snapshotInsert = insertedPayloads.find(p => p.userId === 2 && typeof p.snapshot === 'string');
    expect(snapshotInsert).toBeTruthy();
    const parsedBoard = JSON.parse(snapshotInsert.snapshot);
    expect(parsedBoard.tasks[0].title).toBe('Prepare Demo');
    expect(parsedBoard.tasks[0].projectId).toBe(42);
  });
});

