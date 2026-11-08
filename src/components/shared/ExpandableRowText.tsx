import React, { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import './ExpandableRowText.css';

interface ExpandableRowTextProps {
  text: string;
  onClick?: React.MouseEventHandler<HTMLSpanElement>;
  className?: string;
  textClassName?: string;
}

/** Readable row text with a local one-line view; collapsing never changes its value. */
export default function ExpandableRowText({
  text, onClick, className = '', textClassName = '',
}: ExpandableRowTextProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef<HTMLSpanElement>(null);
  const textId = useId();

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
            setCollapsed(value => !value);
          }}
        >
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}
