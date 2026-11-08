export interface ChatWindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChatViewport {
  width: number;
  height: number;
}

export type ChatResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export type ChatWindowAction = 'move' | ChatResizeDirection;

export const CHAT_WINDOW_GAP = 12;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 360;
const DEFAULT_SIZE = { w: 420, h: 600 };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function limits(viewport: ChatViewport) {
  const maxW = Math.max(1, Math.min(980, viewport.width - CHAT_WINDOW_GAP * 2));
  const maxH = Math.max(1, Math.min(920, viewport.height - CHAT_WINDOW_GAP * 2));
  return { maxW, maxH, minW: Math.min(MIN_WIDTH, maxW), minH: Math.min(MIN_HEIGHT, maxH) };
}

export function fitChatWindow(rect: Partial<ChatWindowRect> | null, viewport: ChatViewport): ChatWindowRect {
  const { minW, minH, maxW, maxH } = limits(viewport);
  const w = clamp(finiteOr(rect?.w, DEFAULT_SIZE.w), minW, maxW);
  const h = clamp(finiteOr(rect?.h, DEFAULT_SIZE.h), minH, maxH);
  return {
    w, h,
    x: clamp(finiteOr(rect?.x, viewport.width - w - CHAT_WINDOW_GAP), CHAT_WINDOW_GAP,
      Math.max(CHAT_WINDOW_GAP, viewport.width - w - CHAT_WINDOW_GAP)),
    y: clamp(finiteOr(rect?.y, viewport.height - h - CHAT_WINDOW_GAP), CHAT_WINDOW_GAP,
      Math.max(CHAT_WINDOW_GAP, viewport.height - h - CHAT_WINDOW_GAP)),
  };
}

/** North/west resizing keeps the opposite edge fixed, even at viewport limits. */
export function changeChatWindow(
  start: ChatWindowRect,
  action: ChatWindowAction,
  dx: number,
  dy: number,
  viewport: ChatViewport,
): ChatWindowRect {
  const rect = fitChatWindow(start, viewport);
  if (action === 'move') return fitChatWindow({ ...rect, x: rect.x + dx, y: rect.y + dy }, viewport);

  const { minW, minH, maxW, maxH } = limits(viewport);
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  let { x, y, w, h } = rect;
  if (action.includes('w')) {
    w = clamp(rect.w - dx, minW, Math.min(maxW, right - CHAT_WINDOW_GAP));
    x = right - w;
  } else if (action.includes('e')) {
    w = clamp(rect.w + dx, minW, Math.min(maxW, viewport.width - rect.x - CHAT_WINDOW_GAP));
  }
  if (action.includes('n')) {
    h = clamp(rect.h - dy, minH, Math.min(maxH, bottom - CHAT_WINDOW_GAP));
    y = bottom - h;
  } else if (action.includes('s')) {
    h = clamp(rect.h + dy, minH, Math.min(maxH, viewport.height - rect.y - CHAT_WINDOW_GAP));
  }
  return { x, y, w, h };
}
