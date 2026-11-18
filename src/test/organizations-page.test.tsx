import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, name: 'Olive Owner', email: 'olive@example.com', subscriptionTier: 'pro' } }),
}));
vi.mock('@/context/LanguageContext', () => ({
  useLanguage: () => ({ t: (s: string) => s, language: 'en', setLanguage: () => {} }),
}));

import Organizations from '@/pages/Organizations';

const org = {
  id: 7, name: 'Maple School', type: 'school', ownerId: 1, maxSeats: 20, currentSeats: 3,
  tier: 'pro', status: 'active', joinCode: 'ABC123', createdAt: '2026-01-01T00:00:00.000Z',
};
const members = [
  { id: 1, name: 'Olive Owner', email: 'olive@example.com', role: 'owner', joinedAt: '2026-01-01', lastActiveAt: null, isOwner: true, isAdmin: true, assignments: [], groups: [], subGroups: [] },
  { id: 2, name: 'Sam Student', email: 'sam@example.com', role: 'member', joinedAt: '2026-01-02', lastActiveAt: '2026-11-01T10:00:00.000Z', assignments: [{ groupId: 10, subGroupId: 11 }], groups: ['Year 7'], subGroups: ['7A'] },
  { id: 3, name: 'Una Unassigned', email: 'una@example.com', role: 'member', joinedAt: '2026-01-03', assignments: [] },
];
const groups = [
  {
    id: 10, name: 'Year 7', color: 'blue', icon: 'users', joinCode: 'G7CODE', codeActive: true, codeUses: 1,
    memberCount: 1, directMemberCount: 0, memberIds: [2], directMemberIds: [], adminIds: [],
    subGroups: [{ id: 11, parentId: 10, name: '7A', color: 'green', icon: 'users', joinCode: 'S7A', codeActive: true, codeUses: 1, memberCount: 1, memberIds: [2], adminIds: [] }],
  },
];

function mockFetch(detailOverride?: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = (body: unknown, status = 200) =>
      ({ ok: status < 400, status, json: async () => body } as Response);
    if (url === '/api/organizations') {
      return json({ organizations: [{ ...org, role: 'owner', isOwner: true, isAdmin: true }], joinedOrganizations: [] });
    }
    if (url.startsWith('/api/organizations/7')) {
      if (url === '/api/organizations/7') {
        return json(detailOverride ?? {
          organization: org, members, groups, unassignedMembers: [members[2]],
          userRole: 'owner', isOwner: true, isAdmin: true, isGroupAdmin: false,
          managedGroupIds: [], adminGroupIds: [], settings: {},
        });
      }
      return json({});
    }
    return json({});
  });
}

describe('Organizations page', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  const flush = async () => {
    for (let i = 0; i < 6; i++) await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  };

  it('loads an owned organization and every tab renders without crashing', async () => {
    vi.stubGlobal('fetch', mockFetch());
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/organizations']}><Organizations /></MemoryRouter>);
    });
    await flush();
    expect(container.textContent).toContain('Maple School');
    expect(container.textContent).toContain('Sam Student');

    for (const label of ['Groups', 'Both', 'Settings', 'Users']) {
      const tab = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.trim() === label);
      expect(tab, `tab ${label}`).toBeTruthy();
      await act(async () => { tab!.click(); });
      await flush();
      expect(container.textContent).toContain('Maple School');
    }
  });

  it('shows a retryable error instead of a blank page when details fail', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/organizations') {
        return { ok: true, status: 200, json: async () => ({ organizations: [{ ...org, role: 'owner', isOwner: true, isAdmin: true }], joinedOrganizations: [] }) } as Response;
      }
      return { ok: false, status: 500, json: async () => ({ error: 'Failed to get organization details' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/organizations?id=7']}><Organizations /></MemoryRouter>);
    });
    await flush();
    expect(container.textContent).toContain('Unable to load organization');
    expect(container.textContent).toContain('Retry');
  });
});
