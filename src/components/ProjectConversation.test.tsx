import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectConversation, { type ConversationMode } from './ProjectConversation';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const storedRect = { x: 500, y: 200, w: 420, h: 500 };
const props = { projectId: 1, projectName: 'Layout review', currentUserId: 1, tasks: [], notes: [] };
const key = 'project_chat_window_v1';
let root: Root;
let container: HTMLDivElement;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

function button(label: string) {
  const result = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(result).not.toBeNull();
  return result!;
}

function rect() {
  const window = document.querySelector<HTMLElement>('[role="dialog"]');
  expect(window).not.toBeNull();
  return { x: parseFloat(window!.style.left), y: parseFloat(window!.style.top),
    w: parseFloat(window!.style.width), h: parseFloat(window!.style.height) };
}

function pointer(target: EventTarget, type: string, x: number, y: number) {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
}

function DockableConversation() {
  const [mode, setMode] = useState<ConversationMode>('floating');
  return <ProjectConversation {...props} mode={mode} onModeChange={setMode} />;
}

describe('project chat window controls', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ messages: [] }) })));
    vi.stubGlobal('innerWidth', 1200);
    vi.stubGlobal('innerHeight', 800);
    HTMLElement.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(storedRect));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.userSelect = '';
    if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    else delete HTMLElement.prototype.scrollIntoView;
    vi.unstubAllGlobals();
  });

  it('places the move handle directly after the top-left resize handle and portals the window', async () => {
    await act(async () => root.render(<ProjectConversation {...props} mode="floating" />));
    expect(button('Resize chat from top left').nextElementSibling).toBe(button('Move chat window'));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('uses the top-left resize handle to move the top/left edges instead of the bottom/right edges', async () => {
    await act(async () => root.render(<ProjectConversation {...props} mode="floating" />));
    act(() => {
      pointer(button('Resize chat from top left'), 'pointerdown', 512, 212);
      pointer(window, 'pointermove', 412, 162);
      pointer(window, 'pointerup', 412, 162);
    });
    expect(rect()).toEqual({ x: 400, y: 150, w: 520, h: 550 });
  });

  it('moves from the separate handle and applies final pointer-up coordinates', async () => {
    await act(async () => root.render(<ProjectConversation {...props} mode="floating" />));
    act(() => {
      pointer(button('Move chat window'), 'pointerdown', 550, 220);
      pointer(window, 'pointerup', 600, 260);
    });
    expect(rect()).toEqual({ x: 550, y: 240, w: 420, h: 500 });
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(rect());
  });

  it('supports keyboard movement and top-left resizing', async () => {
    await act(async () => root.render(<ProjectConversation {...props} mode="floating" />));
    act(() => {
      button('Move chat window').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      button('Resize chat from top left').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    });
    expect(rect()).toEqual({ x: 490, y: 160, w: 420, h: 540 });
  });

  it('preserves the existing dock/float action and restores the floating rectangle', async () => {
    await act(async () => root.render(<DockableConversation />));
    act(() => {
      pointer(button('Move chat window'), 'pointerdown', 550, 220);
      pointer(window, 'pointerup', 600, 260);
    });
    const floating = rect();
    await act(async () => button('Dock the chat to the side').click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(container.querySelector('aside')).not.toBeNull();
    await act(async () => button('Float the chat window').click());
    expect(rect()).toEqual(floating);
  });

  it('ends pointer cancellation and restores the previous text-selection setting', async () => {
    await act(async () => root.render(<ProjectConversation {...props} mode="floating" />));
    document.body.style.userSelect = 'text';
    act(() => {
      pointer(button('Move chat window'), 'pointerdown', 550, 220);
      pointer(window, 'pointermove', 600, 260);
      pointer(window, 'pointercancel', 600, 260);
    });
    const cancelled = rect();
    expect(document.body.style.userSelect).toBe('text');
    act(() => pointer(window, 'pointermove', 1000, 600));
    expect(rect()).toEqual(cancelled);
  });

  it('keeps the floating window inside a newly smaller viewport', async () => {
    await act(async () => root.render(<ProjectConversation {...props} mode="floating" />));
    act(() => {
      vi.stubGlobal('innerWidth', 375);
      vi.stubGlobal('innerHeight', 300);
      window.dispatchEvent(new Event('resize'));
    });
    expect(rect()).toEqual({ x: 12, y: 12, w: 351, h: 276 });
  });
});
