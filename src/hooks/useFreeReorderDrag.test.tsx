import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useFreeReorderDrag } from './useFreeReorderDrag';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function ReorderList() {
  const [items, setItems] = useState([{ id: 'first' }, { id: 'second' }]);
  const { displayItems, dragId, ghostPos, onPointerDown, setItemRef } = useFreeReorderDrag({ items, onReorder: setItems });
  return <div data-drag-id={dragId ?? ''} data-ghost-x={ghostPos?.x ?? ''} data-ghost-y={ghostPos?.y ?? ''}>{displayItems.map(item => (
    <div key={item.id} data-item={item.id} ref={node => setItemRef(item.id, node)}>
      <button onPointerDown={event => onPointerDown(event, item.id)}>Move {item.id}</button>
    </div>
  ))}</div>;
}

describe('useFreeReorderDrag', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('commits a draft item move when the pointer is released before the next frame', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = this.dataset.item === 'second' ? 50 : 0;
      return { x: 0, y: top, left: 0, top, right: 200, bottom: top + 40, width: 200, height: 40, toJSON: () => ({}) };
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() => root.render(<ReorderList />));
      const firstHandle = container.querySelector('button')!;
      act(() => {
        firstHandle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20, button: 0 }));
      });
      expect(container.firstElementChild?.getAttribute('data-drag-id')).toBe('first');
      act(() => {
        window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 20, clientY: 85 }));
      });
      expect([...container.querySelectorAll('[data-item]')].map(node => (node as HTMLElement).dataset.item)).toEqual(['second', 'first']);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it('keeps the drag ghost anchored where the item was grabbed', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = this.dataset.item === 'second' ? 50 : 0;
      return { x: 0, y: top, left: 0, top, right: 200, bottom: top + 40, width: 200, height: 40, toJSON: () => ({}) };
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() => root.render(<ReorderList />));
      act(() => {
        container.querySelector('button')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 15, button: 0 }));
      });
      const host = container.firstElementChild!;
      // Grabbed 20px in from the left edge, so the ghost's left edge sits at
      // x=0 (not x=-80, which would center the item under the cursor).
      expect(host.getAttribute('data-ghost-x')).toBe('0');
      expect(host.getAttribute('data-ghost-y')).toBe('0');
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it('still reorders items side by side in an image grid', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const left = this.dataset.item === 'second' ? 120 : 0;
      return { x: left, y: 0, left, top: 0, right: left + 100, bottom: 100, width: 100, height: 100, toJSON: () => ({}) };
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      act(() => root.render(<ReorderList />));
      act(() => {
        container.querySelector('button')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 20, button: 0 }));
      });
      act(() => {
        window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 190, clientY: 20 }));
      });
      expect([...container.querySelectorAll('[data-item]')].map(node => (node as HTMLElement).dataset.item)).toEqual(['second', 'first']);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
