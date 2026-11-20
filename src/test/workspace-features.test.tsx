import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GALLERY_TEMPLATES } from '../../shared/defaultTemplates';
import { APP_PAGES } from '@/lib/appPages';
import { SHORTCUT_ACTIONS, DEFAULT_SHORTCUTS, SHORTCUT_DOM_EVENTS } from '@/lib/shortcuts';
import {
  startPlannerItemDrag,
  getActiveDraggedPlannerItem,
  endPlannerItemDrag,
} from '@/lib/plannerDrag';
import { buildActiveAlerts } from '@/lib/notifications';
import ProjectConversation from '@/components/ProjectConversation';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 101, name: 'Alice Owner', email: 'alice@example.com', subscriptionTier: 'pro' },
  }),
}));

vi.mock('@/context/BoardContext', () => ({
  useBoardContext: () => ({
    board: {
      columns: [{ id: 'todo', title: 'To Do', color: 'blue', order: 0 }],
      tasks: [
        {
          id: 'task-overdue-1',
          title: 'Overdue Task Alpha',
          description: 'Review sprint blockers',
          priority: 'high',
          labels: [],
          checklists: [],
          subtasks: [],
          dueDate: '2020-01-01',
          dueTime: '09:00',
          columnId: 'todo',
          order: 0,
          projectId: 12,
          projectName: 'Core Platform',
          assignedToUserId: 101,
          assignedToUserName: 'Alice Owner',
          assignedToUsers: [{ id: 101, name: 'Alice Owner' }],
          comments: [
            {
              id: 'c-other',
              text: 'Please check edge case',
              createdAt: '2026-01-01T10:00:00.000Z',
              authorId: 202,
              authorName: 'Bob Teammate',
            },
            {
              id: 'c-mine',
              text: 'Fixed in latest draft',
              createdAt: '2026-01-01T11:00:00.000Z',
              authorId: 101,
              authorName: 'Alice Owner',
            },
          ],
          createdAt: '2026-01-01T09:00:00.000Z',
          updatedAt: '2026-01-01T09:00:00.000Z',
        },
      ],
    },
    updateTask: vi.fn(),
  }),
}));

vi.mock('@/context/NotesContext', () => ({
  useNotesContext: () => ({
    board: {
      columns: [{ id: 'notes-col', title: 'Notes', color: 'yellow', order: 0 }],
      tasks: [
        {
          id: 'note-1',
          title: 'Architecture Decisions',
          description: 'Schema choices and auth flow',
          priority: 'medium',
          labels: [],
          checklists: [],
          subtasks: [],
          columnId: 'notes-col',
          order: 0,
          createdAt: '2026-01-02T09:00:00.000Z',
          updatedAt: '2026-01-02T09:00:00.000Z',
        },
      ],
    },
    updateTask: vi.fn(),
  }),
}));

import { AssignedBadge } from '@/components/shared/AssignedBadge';
import TaskSideViewPanel from '@/components/shared/TaskSideViewPanel';
import NotificationBell from '@/components/NotificationBell';
import GlobalSearchModal from '@/components/GlobalSearchModal';

let container: HTMLDivElement;
let root: Root;

const LocationProbe: React.FC<{ onChange: (path: string) => void }> = ({ onChange }) => {
  const loc = useLocation();
  React.useEffect(() => {
    onChange(`${loc.pathname}${loc.search}`);
  }, [loc, onChange]);
  return null;
};

describe('workspace improvements regression suite', () => {
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = vi.fn();
    }
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    endPlannerItemDrag();
    vi.restoreAllMocks();
  });

  it('enriches all default templates with detailed content, labels, checklists, and subtasks', () => {
    expect(DEFAULT_GALLERY_TEMPLATES.length).toBeGreaterThanOrEqual(10);
    for (const tmpl of DEFAULT_GALLERY_TEMPLATES) {
      expect(tmpl.description.length).toBeGreaterThanOrEqual(200);
      expect(tmpl.labels.length).toBeGreaterThanOrEqual(2);
      expect(tmpl.checklists.length).toBeGreaterThanOrEqual(1);
      expect(tmpl.checklists.reduce((s, cl) => s + cl.items.length, 0)).toBeGreaterThanOrEqual(3);
      if (tmpl.kind === 'task') {
        expect(tmpl.subtasks.length).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('excludes Calendar, Collaboration, and Templates from split-screen picker options', () => {
    const splitPaths = APP_PAGES.filter(p => p.inSplitPicker).map(p => p.path);
    expect(splitPaths).not.toContain('/calendar');
    expect(splitPaths).not.toContain('/collaboration');
    expect(splitPaths).not.toContain('/templates');
  });

  it('registers Global Search shortcut and DOM event cleanly', () => {
    expect(SHORTCUT_ACTIONS.some(a => a.id === 'global-search')).toBe(true);
    expect(DEFAULT_SHORTCUTS.some(s => s.action === 'global-search' && s.keys === 'Ctrl+K')).toBe(true);
    expect(SHORTCUT_DOM_EVENTS['global-search']).toBe('shortcut:global-search');
  });

  it('captures and drops both OS files and cross-pane tasks/notes in ProjectConversation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [] }),
    } as any);

    await act(async () => {
      root.render(
        <ProjectConversation
          projectId={1}
          projectName="Test Proj"
          tasks={[{ id: 't1', title: 'Build API', done: false }]}
          notes={[{ id: 'n1', title: 'Meeting Summary' }]}
          mode="inline"
          onModeChange={() => {}}
        />,
      );
    });

    // Simulate OS file drop onto Project Chat
    const dropTarget = container.firstElementChild as HTMLElement;
    const droppedFile = new File(['hello world'], 'spec.txt', { type: 'text/plain' });
    await act(async () => {
      dropTarget.dispatchEvent(
        Object.assign(new Event('drop', { bubbles: true, cancelable: true }), {
          dataTransfer: {
            files: [droppedFile],
            types: ['Files'],
            getData: () => '',
          },
        }),
      );
    });
    expect(container.textContent).toContain('spec.txt');

    // Simulate dragging a note across split panes via plannerDrag helper
    startPlannerItemDrag(
      {
        target: document.createElement('div'),
        dataTransfer: { setData: vi.fn(), effectAllowed: '' },
      } as any,
      { type: 'note', id: 'n1', title: 'Meeting Summary' },
    );
    expect(getActiveDraggedPlannerItem()?.id).toBe('n1');

    await act(async () => {
      dropTarget.dispatchEvent(
        Object.assign(new Event('drop', { bubbles: true, cancelable: true }), {
          dataTransfer: {
            files: [],
            types: ['application/x-planner-item'],
            getData: () => '',
          },
        }),
      );
    });
    expect(container.textContent).toContain('Meeting Summary');
  });

  it('renders AssignedBadge next to assignees and highlights self assignments', async () => {
    await act(async () => {
      root.render(
        <AssignedBadge
          task={{
            assignedToUserId: 101,
            assignedToUserName: 'Alice Owner',
            assignedToUsers: [{ id: 101, name: 'Alice Owner' }],
          }}
        />,
      );
    });
    expect(container.textContent).toContain('You');
  });

  it('overhauls TaskSideViewPanel: hide button only, templates above comments, member assignment, and comment authorship protection', async () => {
    const onUpdateTask = vi.fn();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      // Members come from the projects list (there is no single-project GET route).
      if (url.endsWith('/api/projects')) {
        return {
          ok: true,
          json: async () => ({
            projects: [{
              id: 12,
              members: [
                { id: 101, name: 'Alice Owner', email: 'alice@example.com', role: 'owner' },
                { id: 202, name: 'Bob Teammate', email: 'bob@example.com', role: 'edit' },
              ],
            }],
          }),
        } as any;
      }
      return { ok: true, json: async () => ({ templates: [] }) } as any;
    });

    await act(async () => {
      root.render(
        <MemoryRouter>
          <TaskSideViewPanel
            kind="task"
            task={{
              id: 't-1',
              title: 'Ship Release',
              description: 'Verify edge cases',
              priority: 'high',
              labels: [],
              checklists: [],
              subtasks: [],
              columnId: 'todo',
              order: 0,
              projectId: 12,
              assignedToUserIds: [101],
              assignedToUsers: [{ id: 101, name: 'Alice Owner' }],
              comments: [
                {
                  id: 'c-other',
                  text: 'From Bob',
                  createdAt: '2026-01-01T10:00:00.000Z',
                  authorId: 202,
                  authorName: 'Bob Teammate',
                },
                {
                  id: 'c-mine',
                  text: 'From Alice',
                  createdAt: '2026-01-01T11:00:00.000Z',
                  authorId: 101,
                  authorName: 'Alice Owner',
                },
              ],
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            }}
            open={true}
            onHide={vi.fn()}
            onUpdateTask={onUpdateTask}
            activityEntries={[]}
          />
        </MemoryRouter>,
      );
    });

    // Only Hide side view button, no Close X button
    expect(container.querySelector('button[aria-label="Hide side view"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Close side panel"]')).toBeNull();

    // Templates section appears BEFORE Comments section
    const html = container.innerHTML;
    expect(html.indexOf('Templates (0)')).toBeGreaterThan(-1);
    expect(html.indexOf('Comments (2)')).toBeGreaterThan(html.indexOf('Templates (0)'));

    // Both author names displayed cleanly; only Alice's comment shows Edit/Delete buttons
    expect(container.textContent).toContain('Bob Teammate');
    expect(container.textContent).toContain('Alice Owner');
    expect(container.querySelectorAll('button[title="Edit comment"]').length).toBe(1);
    expect(container.querySelectorAll('button[title="Delete comment"]').length).toBe(1);

    // Click Bob Teammate to assign them alongside Alice
    const bobBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent?.includes('Bob Teammate'));
    expect(bobBtn).toBeDefined();
    await act(async () => {
      bobBtn!.click();
    });
    expect(onUpdateTask).toHaveBeenCalledWith(
      't-1',
      expect.objectContaining({
        assignedToUserIds: [101, 202],
      }),
    );
  });

  it('builds overdue notifications with taskId and lets users click or dismiss them', async () => {
    const alerts = buildActiveAlerts(
      [
        {
          id: 'task-overdue-1',
          title: 'Overdue Task Alpha',
          description: '',
          priority: 'high',
          labels: [],
          checklists: [],
          subtasks: [],
          dueDate: '2020-01-01',
          dueTime: '09:00',
          columnId: 'todo',
          order: 0,
          createdAt: '2020-01-01T00:00:00.000Z',
          updatedAt: '2020-01-01T00:00:00.000Z',
        },
      ],
      { normalEnabled: true, smartEnabled: false },
    );
    expect(alerts[0].taskId).toBe('task-overdue-1');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        pendings: [],
        notifications: [
          {
            id: 55,
            type: 'normal_alert',
            title: 'Overdue Task',
            message: 'Task "Overdue Task Alpha" is overdue',
            data: JSON.stringify({ taskId: 'task-overdue-1', itemKind: 'task' }),
            read: false,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    } as any);

    let lastPath = '';
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <LocationProbe onChange={p => { lastPath = p; }} />
          <NotificationBell />
        </MemoryRouter>,
      );
    });

    const bellBtn = container.querySelector('button[aria-label*="notifications"]') as HTMLButtonElement;
    expect(bellBtn).not.toBeNull();
    await act(async () => {
      bellBtn.click();
    });

    expect(container.textContent).toContain('Overdue Task Alpha');
    const overdueRow = Array.from(container.querySelectorAll('[role="button"]')).find(el =>
      el.textContent?.includes('Overdue Task Alpha'),
    ) as HTMLElement;
    expect(overdueRow).toBeDefined();

    // Dismiss the overdue notification via X button
    const dismissBtn = overdueRow.querySelector('button[aria-label="Dismiss notification"]') as HTMLButtonElement;
    await act(async () => {
      dismissBtn.click();
    });
    expect(
      Array.from(container.querySelectorAll('[role="button"]')).some(el =>
        el.textContent?.includes('Overdue Task Alpha'),
      ),
    ).toBe(false);

    // Click the remaining Update row with linked taskId -> navigates straight to /tasks?open=task-overdue-1
    const updateRow = Array.from(container.querySelectorAll('p')).find(p =>
      p.textContent?.includes('Overdue Task'),
    );
    await act(async () => {
      updateRow!.closest('div[class*="cursor-pointer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(lastPath).toBe('/tasks?open=task-overdue-1');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('opens GlobalSearchModal on shortcut event and navigates on Enter', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ projects: [{ id: 9, name: 'Apollo Rocket' }], templates: [], milestones: [] }),
    } as any);

    let lastPath = '';
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/']}>
          <LocationProbe onChange={p => { lastPath = p; }} />
          <GlobalSearchModal />
        </MemoryRouter>,
      );
    });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('shortcut:global-search'));
    });

    expect(container.querySelector('[role="dialog"][aria-label="Global Search"]')).not.toBeNull();
    const searchInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(searchInput, 'Apollo Rocket');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const matchBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Apollo Rocket'),
    );
    expect(matchBtn).toBeDefined();
    await act(async () => {
      matchBtn!.click();
    });
    expect(lastPath).toBe('/projects?project=9');
  });
});
