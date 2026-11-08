import React, { forwardRef, useCallback, useLayoutEffect, useRef } from 'react';

export interface AutoGrowTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Optional height limit for fields that need one. */
  maxHeight?: number;
  /** Optional minimum pixel height. */
  minHeight?: number;
}

/**
 * A textarea that grows vertically as its content wraps onto more lines.
 *
 * Long sub-task / checklist text used to be forced into a single-line input,
 * so the only way to read it was to scroll sideways. This keeps the whole
 * value visible by wrapping it and resizing the field upwards.
 */
const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(
  (
    {
      value,
      onChange,
      onInput,
      className = '',
      style,
      rows = 1,
      maxHeight,
      minHeight,
      ...props
    },
    forwardedRef,
  ) => {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);

    const setRef = useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        }
      },
      [forwardedRef],
    );

    const resize = useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      // Reset first so scrollHeight reflects the content at full height.
      el.style.height = 'auto';
      const computed = getComputedStyle(el);
      const borders = (parseFloat(computed.borderTopWidth) || 0) + (parseFloat(computed.borderBottomWidth) || 0);
      const contentHeight = el.scrollHeight + borders;
      const next = Math.max(minHeight ?? 0, maxHeight == null ? contentHeight : Math.min(contentHeight, maxHeight));
      el.style.height = `${next}px`;
      el.style.overflowY = maxHeight != null && contentHeight > maxHeight ? 'auto' : 'hidden';
    }, [maxHeight, minHeight]);

    useLayoutEffect(() => {
      resize();
    }, [resize, value]);

    useLayoutEffect(() => {
      const el = innerRef.current;
      if (!el || typeof ResizeObserver === 'undefined') return;
      let width = el.clientWidth;
      const observer = new ResizeObserver(() => {
        if (el.clientWidth !== width) {
          width = el.clientWidth;
          resize();
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, [resize]);

    return (
      <textarea
        {...props}
        ref={setRef}
        rows={rows}
        value={value}
        onChange={onChange}
        onInput={event => {
          resize();
          onInput?.(event);
        }}
        className={`resize-none overflow-x-hidden whitespace-pre-wrap break-words ${className}`}
        style={{ minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', overflowWrap: 'anywhere', ...style, ...(maxHeight == null ? {} : { maxHeight }) }}
      />
    );
  },
);

AutoGrowTextarea.displayName = 'AutoGrowTextarea';

export default AutoGrowTextarea;
