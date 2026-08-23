import { tt } from './translations';

const TRANSLATABLE_PROPS = [
  'placeholder',
  'title',
  'alt',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'label',
] as const;

const SKIP_TYPES = new Set([
  'code', 'pre', 'kbd', 'script', 'style', 'svg', 'path', 'symbol', 'use', 'linearGradient', 'stop',
]);

const shouldSkip = (type: unknown, props: Record<string, unknown> | null | undefined): boolean => {
  if (!props) return true;
  if (props['data-no-i18n'] || props.noI18n) return true;
  if (typeof type === 'string' && SKIP_TYPES.has(type)) return true;
  return false;
};

const translateValue = (value: unknown): unknown => {
  if (typeof value === 'string') return tt(value);
  return value;
};

const translateChildren = (children: unknown): unknown => {
  if (typeof children === 'string') return tt(children);
  if (Array.isArray(children)) return children.map(translateChildren);
  return children;
};

export const translateNode = (type: unknown, props: any): any => {
  if (!props || shouldSkip(type, props)) return props;
  let changed = false;
  const next = { ...props };
  for (const key of TRANSLATABLE_PROPS) {
    if (typeof next[key] === 'string') {
      const translated = tt(next[key]);
      if (translated !== next[key]) {
        next[key] = translated;
        changed = true;
      }
    }
  }
  if (next.children != null) {
    const translated = translateChildren(next.children);
    if (translated !== next.children) {
      next.children = translated;
      changed = true;
    }
  }
  return changed ? next : props;
};
