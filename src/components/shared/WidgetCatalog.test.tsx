import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WidgetCatalog } from './WidgetCatalog';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Icon = () => <svg />;
const definitions = [
  { type: 'free-task', title: 'Task Activity', desc: 'Active tasks this week', tier: 'free' as const, accent: 'label-blue', icon: Icon },
  { type: 'paid-trend', title: 'Completion Trend', desc: 'Thirty days of completions', tier: 'premium' as const, accent: 'label-green', icon: Icon },
  { type: 'pro-summary', title: 'AI Summary', desc: 'A weekly recap of your work', tier: 'pro' as const, accent: 'label-purple', icon: Icon },
];

const cleanups: Array<() => void> = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); });

function renderCatalog(surface: 'dashboard' | 'insights' = 'dashboard') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const drag = vi.fn();
  const upgrade = vi.fn();
  const add = vi.fn();
  act(() => root.render(
    <WidgetCatalog
      definitions={definitions}
      surface={surface}
      closing={false}
      hasWidget={type => type === 'paid-trend'}
      canAccessTier={tier => tier === 'free'}
      onStartDrag={() => drag}
      onAdd={add}
      onClose={vi.fn()}
      onUpgrade={upgrade}
      onReset={vi.fn()}
    />,
  ));
  cleanups.push(() => { act(() => root.unmount()); container.remove(); });
  return { dialog: document.querySelector('[data-widget-catalog]')!, drag, upgrade, add };
}

function search(dialog: Element, text: string) {
  const input = dialog.querySelector('input')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('module catalog', () => {
  it('keeps every tier listed and marks placed paid modules without allowing duplicates', () => {
    const { dialog, drag, upgrade } = renderCatalog();
    expect(dialog.querySelectorAll('[data-widget-type]')).toHaveLength(3);
    const placed = dialog.querySelector('[data-widget-type="paid-trend"]')!;
    expect(placed.textContent).toContain('In dashboard');
    act(() => {
      placed.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      placed.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(drag).not.toHaveBeenCalled();
    expect(upgrade).not.toHaveBeenCalled();
  });

  it('preserves the upgrade action for unavailable modules', () => {
    const { dialog, upgrade, drag } = renderCatalog();
    const locked = dialog.querySelector('[data-widget-type="pro-summary"]')!;
    expect(locked.textContent).toContain('Upgrade');
    act(() => {
      locked.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      locked.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(upgrade).toHaveBeenCalledOnce();
    expect(drag).not.toHaveBeenCalled();
  });

  it('searches descriptions and tier names without omitting already placed results', () => {
    const { dialog } = renderCatalog();
    search(dialog, 'recap');
    expect([...dialog.querySelectorAll('[data-widget-type]')].map(element => element.getAttribute('data-widget-type'))).toEqual(['pro-summary']);
    search(dialog, '  PREMIUM  ');
    expect([...dialog.querySelectorAll('[data-widget-type]')].map(element => element.getAttribute('data-widget-type'))).toEqual(['paid-trend']);
    expect(dialog.textContent).toContain('In dashboard');
    search(dialog, 'no-such-module');
    expect(dialog.querySelector('[role="status"]')?.textContent).toContain('No modules match');
    const clear = [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Clear search')!;
    act(() => clear.click());
    expect(dialog.querySelectorAll('[data-widget-type]')).toHaveLength(3);
  });

  it('uses the Insights status and search label on the Insights page', () => {
    const { dialog } = renderCatalog('insights');
    expect(dialog.querySelector('[data-widget-type="paid-trend"]')?.textContent).toContain('In insights');
    expect(dialog.querySelector('input')?.getAttribute('aria-label')).toBe('Search insights modules');
  });

  it('offers Add only for available unplaced modules and does not start a drag', () => {
    const { dialog, add, drag } = renderCatalog();
    const button = dialog.querySelector('button[aria-label="Add Task Activity"]')!;
    expect(button).not.toBeNull();
    expect(dialog.querySelector('[data-widget-type="paid-trend"] button')).toBeNull();
    expect(dialog.querySelector('[data-widget-type="pro-summary"] button')).toBeNull();
    act(() => {
      button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(add).toHaveBeenCalledWith(definitions[0]);
    expect(drag).not.toHaveBeenCalled();
  });

  it('lets touch scrolling pass without starting a catalog drag', () => {
    const { dialog, drag } = renderCatalog();
    const card = dialog.querySelector('[data-widget-type="free-task"]')!;
    const event = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    act(() => card.dispatchEvent(event));
    expect(drag).not.toHaveBeenCalled();
  });
});
