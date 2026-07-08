import React from 'react';
import { cn } from '../lib/utils';

const CheckMark = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
    <path
      d="M3.5 8.5l3 3 6-7"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export interface CheckToggleProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean;
  /** Partial state (some-but-not-all selected) — renders a dash. Ignored when `checked`. */
  indeterminate?: boolean;
  size?: 'sm' | 'md';
}

/**
 * A square, filled checkbox toggle for grids/matrices (multi-select cells where a
 * native checkbox is too plain). Tri-state: checked (filled + check), indeterminate
 * (dash), or empty. Not the native form Checkbox — this is a bespoke cell control.
 */
export function CheckToggle({
  checked = false,
  indeterminate = false,
  size = 'md',
  className,
  type = 'button',
  ...props
}: CheckToggleProps) {
  const partial = !checked && indeterminate;
  return (
    <button
      type={type}
      role="checkbox"
      aria-checked={partial ? 'mixed' : checked}
      className={cn(
        'flex items-center justify-center rounded border-2 transition-all',
        size === 'sm' ? 'h-5 w-5' : 'h-6 w-6 hover:scale-110',
        checked && 'border-primary-600 bg-primary-600 text-inverted',
        checked && size === 'md' && 'shadow-sm',
        partial && 'border-primary-400 bg-primary-200',
        !checked && !partial && 'border-border bg-surface hover:border-primary-400',
        !checked && !partial && size === 'md' && 'hover:bg-primary-50',
        className,
      )}
      {...props}
    >
      {checked && <CheckMark className={size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5'} />}
      {partial && <span className="block h-0.5 w-2 rounded bg-primary-600" />}
    </button>
  );
}
