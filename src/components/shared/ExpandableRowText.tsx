import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import './ExpandableRowText.css';

interface ExpandableRowTextProps {
  text: string;
  onClick?: React.MouseEventHandler<HTMLSpanElement>;
  className?: string;
  textClassName?: string;
  /** Start in the single-line view. Useful for list rows with trailing controls. */
  defaultCollapsed?: boolean;
  /**
   * When set, the expanded/collapsed choice is remembered in localStorage
   * under this key, so a row stays collapsed after closing and reopening the
   * page. Use a stable, unique key (for example `task-123-subtask-abc`).
   */
  persistKey?: string;
}

const STORAGE_PREFIX = 'expandable-row-collapsed:';

function readPersistedCollapsed(key: string | undefined): boolean | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
  } catch {}
  return null;
}

function writePersistedCollapsed(key: string | undefined, value: boolean) {
  if (!key) return;
  try { localStorage.setItem(STORAGE_PREFIX + key, String(value)); } catch {}
}

/** Readable row text with a local one-line view; collapsing never changes its value. */
export default function ExpandableRowText({
  text, onClick, className = '', textClassName = '', defaultCollapsed = false, persistKey,
}: ExpandableRowTextProps) {
  const [collapsed, setCollapsed] = useState(() => readPersistedCollapsed(persistKey) ?? defaultCollapsed);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const textId = useId();
  const lastPersistKey = useRef(persistKey);

  // If the same component instance is reused for a different row, load that
  // row's saved choice instead of keeping the previous row's state.
  useEffect(() => {
    if (lastPersistKey.current === persistKey) return;
    lastPersistKey.current = persistKey;
    setCollapsed(readPersistedCollapsed(persistKey) ?? defaultCollapsed);
  }, [persistKey, defaultCollapsed]);

  const measure = useCallback(() => {
    const element = textRef.current;
    if (!element) return;
    const style = getComputedStyle(element);
    const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 14) * 1.5;
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    setOverflows(text.includes('\n') || (collapsed
      ? element.scrollWidth > element.clientWidth + 1
      : element.scrollHeight - padding > lineHeight + 1));
  }, [text, collapsed]);

  useLayoutEffect(() => {
    measure();
    const element = textRef.current;
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (element) observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  return (
    <div className={`expandable-row-text min-w-0 flex-1 ${className}`} data-collapsed={collapsed}>
      <span
        id={textId}
        ref={textRef}
        onClick={onClick}
        title={collapsed ? text : undefined}
        className={`row-text-value ${onClick ? 'cursor-text' : ''} ${textClassName}`}
      >
        {text}
      </span>
      {overflows && (
        <button
          type="button"
          className="row-text-collapse rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          aria-label={collapsed ? 'Show full text' : 'Hide extra lines'}
          title={collapsed ? 'Show full text' : 'Hide extra lines'}
          aria-controls={textId}
          aria-expanded={!collapsed}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation();
            setCollapsed(value => {
              const next = !value;
              writePersistedCollapsed(persistKey, next);
              return next;
            });
          }}
        >
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
