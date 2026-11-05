import React, { forwardRef, useCallback, useLayoutEffect, useRef } from 'react';

export interface AutoGrowTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** The textarea stops growing at this pixel height and scrolls instead. */
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
      maxHeight = 200,
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
      const next = Math.max(minHeight ?? 0, Math.min(el.scrollHeight, maxHeight));
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
    }, [maxHeight, minHeight]);

    useLayoutEffect(() => {
      resize();
    }, [resize, value]);

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
        style={{ ...style, maxHeight }}
      />
    );
  },
);

AutoGrowTextarea.displayName = 'AutoGrowTextarea';

export default AutoGrowTextarea;
