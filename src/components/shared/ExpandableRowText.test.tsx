import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExpandableRowText from './ExpandableRowText';
import AutoGrowTextarea from './AutoGrowTextarea';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('expanded row text', () => {
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
    vi.restoreAllMocks();
  });

  it('collapses multiline display without editing or changing the original value', () => {
    const text = 'First line\nSecond line\nThird line';
    const edit = vi.fn();
    act(() => root.render(<ExpandableRowText text={text} onClick={edit} />));
    const toggle = container.querySelector('button')!;
    expect(toggle.getAttribute('aria-label')).toBe('Hide extra lines');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-label')).toBe('Show full text');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.row-text-value')?.textContent).toBe(text);
    expect(edit).not.toHaveBeenCalled();
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    act(() => (container.querySelector('.row-text-value') as HTMLElement).click());
    expect(edit).toHaveBeenCalledOnce();
  });

  it('can start in the single-line view for rows with trailing controls', () => {
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(80);
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(120);
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(360);
    const text = 's'.repeat(300);
    act(() => root.render(<ExpandableRowText text={text} defaultCollapsed />));
    const toggle = container.querySelector('button')!;
    expect(container.querySelector('.expandable-row-text')?.getAttribute('data-collapsed')).toBe('true');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Show full text');
    act(() => toggle.click());
    expect(container.querySelector('.expandable-row-text')?.getAttribute('data-collapsed')).toBe('false');
  });

  it('keeps one-line text free of an unnecessary collapse control', () => {
    act(() => root.render(<ExpandableRowText text="Short task" />));
    expect(container.querySelector('button')).toBeNull();
  });

  it('offers collapse for a long unbroken value that wraps to multiple lines', () => {
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(80);
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(120);
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(360);
    const text = 's'.repeat(300);
    act(() => root.render(<ExpandableRowText text={text} />));
    expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
    act(() => container.querySelector('button')!.click());
    expect(container.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('.row-text-value')?.textContent).toBe(text);
  });

  it('includes textarea borders so the last line is not clipped', () => {
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(64);
    act(() => root.render(<AutoGrowTextarea value="First\nSecond" readOnly style={{ border: '1px solid black' }} />));
    expect(container.querySelector('textarea')?.style.height).toBe('66px');
  });

  it('scrolls editing text when its configured height limit is reached', () => {
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(200);
    act(() => root.render(<AutoGrowTextarea value="Long text" readOnly maxHeight={96} style={{ border: '1px solid black' }} />));
    expect(container.querySelector('textarea')?.style.height).toBe('96px');
    expect(container.querySelector('textarea')?.style.overflowY).toBe('auto');
  });
});
