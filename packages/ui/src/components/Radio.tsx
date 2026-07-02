import React from 'react';
import { cn } from '../lib/utils';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  /** Optional label rendered to the right of the radio */
  label?: React.ReactNode;
  /** Size variant */
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, label, size = 'md', id, ...props }, ref) => {
    const rId = id || (typeof label === 'string' ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    const input = (
      <input
        ref={ref}
        type="radio"
        id={rId}
        className={cn(
          'shrink-0 cursor-pointer border-border text-primary-600',
          'focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
          'disabled:cursor-not-allowed disabled:opacity-50',
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );

    if (!label) return input;

    return (
      <label
        htmlFor={rId}
        className="inline-flex cursor-pointer items-center gap-2 text-sm text-body"
      >
        {input}
        <span>{label}</span>
      </label>
    );
  },
);

Radio.displayName = 'Radio';

// ==========================================================================
// RadioGroup — convenience wrapper for groups of radios
// ==========================================================================

export interface RadioGroupOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  name: string;
  value?: string;
  onChange?: (value: string) => void;
  options: RadioGroupOption[];
  orientation?: 'vertical' | 'horizontal';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  value,
  onChange,
  options,
  orientation = 'vertical',
  size = 'md',
  className,
}) => {
  return (
    <div
      role="radiogroup"
      className={cn(
        orientation === 'vertical' ? 'flex flex-col gap-2' : 'flex flex-wrap gap-4',
        className,
      )}
    >
      {options.map((opt) => (
        <Radio
          key={opt.value}
          name={name}
          value={opt.value}
          checked={value === opt.value}
          onChange={() => onChange?.(opt.value)}
          disabled={opt.disabled}
          label={opt.label}
          size={size}
        />
      ))}
    </div>
  );
};
