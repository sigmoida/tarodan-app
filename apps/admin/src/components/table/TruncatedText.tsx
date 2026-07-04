'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Single-line, non-wrapping text. Clipped with `…` when the cell narrows. The
 * tooltip (native `title`) kicks in ONLY when the text is actually clipped
 * (`scrollWidth > clientWidth`) — fully visible text shows nothing on hover.
 * The tooltip text is only emitted for string children, since only they can be measured.
 */
export function TruncatedText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [truncated, setTruncated] = useState(false);
  const title = typeof children === 'string' ? children : undefined;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setTruncated(el.scrollWidth > el.clientWidth);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [children]);

  return (
    <span
      ref={ref}
      className={cn('block truncate', className)}
      title={truncated && title ? title : undefined}
    >
      {children}
    </span>
  );
}
