import React from 'react';
import { cn } from '../lib/utils';

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Selected state — swaps to `activeClassName` (or a primary tint by default). */
  active?: boolean;
  /** Classes applied when active — e.g. a domain color. Defaults to a primary tint. */
  activeClassName?: string;
}

/**
 * A small toggleable pill — for filter chips, tag selectors, segmented filters.
 * `active` switches to `activeClassName`; inactive is a muted outline with hover.
 */
export function Chip({
  active = false,
  activeClassName,
  className,
  type = 'button',
  ...props
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={active}
      className={cn(
        'rounded-full border px-2 py-1 text-xs transition-colors',
        active
          ? (activeClassName ?? 'border-primary-200 bg-primary-500/10 text-primary-600')
          : 'border-border text-muted hover:bg-surface-alt',
        className,
      )}
      {...props}
    />
  );
}
