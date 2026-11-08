import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWidgetGrid, type GridWidget, type UseWidgetGridApi, type WidgetTier } from './useWidgetGrid';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Kind = 'active' | 'below';
const initial: GridWidget<Kind>[] = [
  { id: 'active', type: 'active', title: 'Active', col: 1, row: 1, w: 4, h: 4 },
  { id: 'below', type: 'below', title: 'Below', col: 1, row: 5, w: 4, h: 2 },
];
let api: UseWidgetGridApi<Kind>;
const definitions = initial.map(widget => ({ ...widget, desc: '', icon: () => null, accent: 'label-blue', tier: 'free' as const }));

function Harness({ storageKey = 'widget-geometry-test', tier = 'pro' }: { storageKey?: string; tier?: WidgetTier }) {
  api = useWidgetGrid({
    defs: definitions,
    storageKey, defaultLayout: () => initial.map(widget => ({ ...widget })), tier,
  });
  return <div ref={api.scrollElRef}><div ref={api.gridRef} data-grid>
    <button onPointerDown={event => api.startGesture(event, api.layout[0], 'resize')}>Resize</button>
    <button onPointerDown={event => api.startGesture(event, api.layout[0], 'move')}>Move</button>
    <button onPointerDown={api.onPanelItemPointerDown(definitions[0])}>Picker item</button>
  </div></div>;
}

describe('widget grid gesture commits', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      x: 100, y: 100, left: 100, top: 100, width: 1200, height: 1200, right: 1300, bottom: 1300, toJSON: () => ({}),
    }));
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  });
  afterEach(() => vi.restoreAllMocks());

  function render(storageKey = 'widget-geometry-test', tier: WidgetTier = 'pro') {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<Harness storageKey={storageKey} tier={tier} />));
    return {
      container,
      changeStorageKey: (nextKey: string) => act(() => root.render(<Harness storageKey={nextKey} tier={tier} />)),
      cleanup: () => { act(() => root.unmount()); container.remove(); },
    };
  }

  it('previews and commits the same compacted layout when a widget is made shorter', () => {
    const { container, cleanup } = render();
    try {
      act(() => container.querySelector('button')!.dispatchEvent(new MouseEvent('pointerdown', {
        bubbles: true, button: 0, clientX: 450, clientY: 590,
      })));
      act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 450, clientY: 334 })));
      expect(api.previewLayout?.find(widget => widget.id === 'active')?.h).toBe(2);
      expect(api.previewLayout?.find(widget => widget.id === 'below')?.row).toBe(3);
      const preview = api.previewLayout;
      act(() => window.dispatchEvent(new MouseEvent('pointerup')));
      expect(api.layout).toEqual(preview);
    } finally { cleanup(); }
  });

  it('cancels pointer cancellation instead of saving the partial movement', () => {
    const { container, cleanup } = render();
    try {
      const before = api.layout;
      act(() => container.querySelectorAll('button')[1].dispatchEvent(new MouseEvent('pointerdown', {
        bubbles: true, button: 0, clientX: 112, clientY: 120,
      })));
      act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 320, clientY: 248 })));
      expect(api.draft?.col).toBeGreaterThan(1);
      act(() => window.dispatchEvent(new MouseEvent('pointercancel')));
      expect(api.layout).toEqual(before);
      expect(api.draft).toBeNull();
    } finally { cleanup(); }
  });

  it('persists removal of every module and restores the intentionally empty board', () => {
    const first = render();
    try {
      act(() => initial.forEach(widget => api.removeWidget(widget.id)));
      expect(api.layout).toEqual([]);
      expect(JSON.parse(localStorage.getItem('widget-geometry-test')!)).toEqual([]);
    } finally { first.cleanup(); }
    const second = render();
    try { expect(api.layout).toEqual([]); } finally { second.cleanup(); }
  });

  it('does not overwrite stored layouts with the initial uninitialized empty state', () => {
    localStorage.setItem('widget-geometry-test', JSON.stringify(initial));
    const writes = vi.spyOn(Storage.prototype, 'setItem');
    const { cleanup } = render();
    try {
      const savedLayouts = writes.mock.calls.filter(([key]) => key === 'widget-geometry-test').map(([, value]) => JSON.parse(value));
      expect(savedLayouts.length).toBeGreaterThan(0);
      expect(savedLayouts.every(layout => layout.length === initial.length)).toBe(true);
    } finally { cleanup(); }
  });

  it('keeps separate storage keys intact when switching to an intentionally empty board', () => {
    localStorage.setItem('board-first', JSON.stringify([initial[0]]));
    localStorage.setItem('board-second', '[]');
    const { changeStorageKey, cleanup } = render('board-first');
    try {
      expect(api.layout.map(widget => widget.id)).toEqual(['active']);
      changeStorageKey('board-second');
      expect(api.layout).toEqual([]);
      expect(JSON.parse(localStorage.getItem('board-first')!).map((widget: GridWidget) => widget.id)).toEqual(['active']);
      expect(localStorage.getItem('board-second')).toBe('[]');
    } finally { cleanup(); }
  });

  it('adds to an empty board explicitly without duplicating the module on repeated activation', () => {
    localStorage.setItem('widget-geometry-test', '[]');
    const { cleanup } = render();
    try {
      act(() => { api.addWidget(definitions[0]); api.addWidget(definitions[0]); });
      expect(api.layout).toHaveLength(1);
      expect(api.layout[0].type).toBe('active');
      expect(JSON.parse(localStorage.getItem('widget-geometry-test')!)).toHaveLength(1);
    } finally { cleanup(); }
  });

  it('keeps tier checks when adding a module explicitly', () => {
    localStorage.setItem('widget-geometry-test', '[]');
    const { cleanup } = render('widget-geometry-test', 'free');
    try {
      act(() => api.addWidget({ ...definitions[0], tier: 'pro' }));
      expect(api.layout).toEqual([]);
    } finally { cleanup(); }
  });

  it('accepts a picker drag onto the mounted empty drop surface', () => {
    localStorage.setItem('widget-geometry-test', '[]');
    const { container, cleanup } = render();
    try {
      act(() => container.querySelectorAll('button')[2].dispatchEvent(new MouseEvent('pointerdown', {
        bubbles: true, button: 0, clientX: 112, clientY: 120,
      })));
      act(() => window.dispatchEvent(new MouseEvent('pointermove', { clientX: 220, clientY: 180 })));
      expect(api.previewLayout).toHaveLength(1);
      act(() => window.dispatchEvent(new MouseEvent('pointerup')));
      expect(api.layout).toHaveLength(1);
      expect(api.layout[0].type).toBe('active');
    } finally { cleanup(); }
  });
});
