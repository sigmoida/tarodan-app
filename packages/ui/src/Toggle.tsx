import React from 'react';
import { cn } from './utils';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const sizeConfig = {
  sm: { track: 'w-8 h-4', thumb: 'h-3 w-3', translate: 'translate-x-4' },
  md: { track: 'w-11 h-6', thumb: 'h-5 w-5', translate: 'translate-x-5' },
  lg: { track: 'w-14 h-7', thumb: 'h-6 w-6', translate: 'translate-x-7' },
};

export const Toggle = React.forwardRef<HTMLButtonElement, ToggleProps>(
  ({ checked, onChange, disabled = false, size = 'md', label, className }, ref) => {
    const s = sizeConfig[size];

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative inline-flex shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
          s.track,
          checked ? 'bg-primary-600' : 'bg-gray-300',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
            s.thumb,
            checked ? s.translate : 'translate-x-0',
          )}
        />
      </button>
    );
  }
);

Toggle.displayName = 'Toggle';
