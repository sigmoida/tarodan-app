import React from 'react';
import { cn } from '../lib/utils';

export interface DisclosureButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Open state — the chevron points down when open, right when closed. */
  open: boolean;
}

/**
 * A disclosure header: a chevron (right when closed, rotates to down when open)
 * followed by its label/content. For collapsible sections, accordions, and group
 * headers. The caller owns the open state and styles the label via `className`.
 */
export function DisclosureButton({
  open,
  className,
  children,
  type = 'button',
  ...props
}: DisclosureButtonProps) {
  return (
    <button
      type={type}
      aria-expanded={open}
      className={cn('flex w-full items-center gap-2 text-left', className)}
      {...props}
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        className={cn('h-3.5 w-3.5 shrink-0 text-muted transition-transform', open && 'rotate-90')}
      >
        <path
          d="M6 4l4 4-4 4"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {children}
    </button>
  );
}
