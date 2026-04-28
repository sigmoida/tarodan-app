import React from 'react';
import { Input, type InputProps } from './Input';

const MagnifyingGlassIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M21 21l-4.35-4.35M10 17a7 7 0 100-14 7 7 0 000 14z"
    />
  </svg>
);

const XMarkIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

export interface SearchInputProps extends Omit<InputProps, 'type' | 'leftAdornment' | 'rightAdornment'> {
  /** When true and `value` is truthy, shows a clear button. */
  clearable?: boolean;
  onClear?: () => void;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ clearable = true, onClear, value, ...props }, ref) => {
    const hasValue = typeof value === 'string' ? value.length > 0 : Boolean(value);
    return (
      <Input
        {...props}
        ref={ref}
        type="search"
        value={value}
        leftAdornment={<MagnifyingGlassIcon className="h-4 w-4" />}
        rightAdornment={
          clearable && hasValue && onClear ? (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear search"
              className="rounded p-0.5 hover:bg-surface-alt transition-colors"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          ) : undefined
        }
      />
    );
  },
);

SearchInput.displayName = 'SearchInput';
