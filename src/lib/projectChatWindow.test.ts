import { describe, expect, it } from 'vitest';
import { changeChatWindow, fitChatWindow } from './projectChatWindow';

const viewport = { width: 1200, height: 800 };
const start = { x: 500, y: 200, w: 420, h: 500 };

describe('floating project chat geometry', () => {
  it('resizes from the top left while keeping the bottom-right corner fixed', () => {
    const next = changeChatWindow(start, 'nw', -100, -50, viewport);
    expect(next).toEqual({ x: 400, y: 150, w: 520, h: 550 });
    expect(next.x + next.w).toBe(start.x + start.w);
    expect(next.y + next.h).toBe(start.y + start.h);
  });

  it('stops north-west growth at the viewport without moving the anchored corner', () => {
    const next = changeChatWindow(start, 'nw', -1000, -1000, viewport);
    expect(next.x).toBe(12);
    expect(next.y).toBe(12);
    expect(next.x + next.w).toBe(920);
    expect(next.y + next.h).toBe(700);
  });

  it('keeps the minimum size and the opposite corner when shrinking', () => {
    const next = changeChatWindow(start, 'nw', 1000, 1000, viewport);
    expect(next).toEqual({ x: 600, y: 340, w: 320, h: 360 });
  });

  it('moves the window without resizing it and keeps every edge reachable', () => {
    expect(changeChatWindow(start, 'move', 50, 40, viewport)).toEqual({ x: 550, y: 240, w: 420, h: 500 });
    expect(changeChatWindow(start, 'move', 10000, 10000, viewport)).toEqual({ x: 768, y: 288, w: 420, h: 500 });
    expect(changeChatWindow(start, 'move', -10000, -10000, viewport)).toEqual({ x: 12, y: 12, w: 420, h: 500 });
  });

  it('bounds south-east growth by the current origin rather than shifting the window', () => {
    expect(changeChatWindow(start, 'se', 10000, 10000, viewport)).toEqual({ x: 500, y: 200, w: 688, h: 588 });
  });

  it('shrinks below normal minima when the viewport itself is smaller', () => {
    expect(fitChatWindow(start, { width: 300, height: 250 })).toEqual({ x: 12, y: 12, w: 276, h: 226 });
  });

  it('ignores invalid persisted coordinates and dimensions', () => {
    expect(fitChatWindow({ x: Number.NaN, y: Infinity, w: Infinity, h: -10 }, viewport))
      .toEqual({ x: 768, y: 428, w: 420, h: 360 });
  });
});
