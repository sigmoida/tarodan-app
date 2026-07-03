'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tek satırlık, wrap'lanmayan metin. Hücre daralınca `…` ile kesilir. Tooltip
 * (native `title`) YALNIZCA metin gerçekten kesildiğinde (`scrollWidth >
 * clientWidth`) devreye girer — tam görünen metinde hover'da bir şey çıkmaz.
 * Sadece string children ölçülebildiği için tooltip metni onlar için basılır.
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
