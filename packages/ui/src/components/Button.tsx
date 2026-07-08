import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary-600 text-inverted hover:bg-primary-700 focus-visible:ring-primary-600',
        secondary: 'bg-surface-alt text-heading hover:bg-border-subtle focus-visible:ring-subtle',
        outline: 'border border-border bg-transparent hover:bg-surface focus-visible:ring-subtle',
        ghost: 'hover:bg-surface-alt hover:text-heading',
        danger: 'bg-danger-600 text-inverted hover:bg-danger-700 focus-visible:ring-danger-600',
        success: 'bg-success-600 text-inverted hover:bg-success-700 focus-visible:ring-success-600',
        warning: 'bg-warning-500 text-inverted hover:bg-warning-600 focus-visible:ring-warning-500',
        link: 'text-primary-600 underline-offset-4 hover:underline p-0 h-auto',
        nav: 'bg-transparent text-inverted/90 hover:text-inverted hover:bg-surface-elevated/10 focus-visible:ring-inverted/60 aria-expanded:bg-surface-elevated/10 aria-expanded:text-inverted data-[state=open]:bg-surface-elevated/10 data-[state=open]:text-inverted',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        xl: 'h-14 px-8 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export { buttonVariants };

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
  asChild?: boolean;
  /** Icon rendered before children. */
  leftIcon?: React.ReactNode;
  /** Icon rendered after children. */
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      isLoading,
      asChild = false,
      children,
      disabled,
      leftIcon,
      rightIcon,
      ...props
    },
    ref,
  ) => {
    const computedClassName = cn(buttonVariants({ variant, size, className }));

    // `asChild` uses Radix `<Slot>` which *requires* exactly one React element
    // child (it merges props onto that child). Mixing in leftIcon / rightIcon /
    // isLoading wrappers would hand Slot an array and blow up at runtime with
    // "React.Children.only expected to receive a single React element child."
    // Callers that need those slots should avoid `asChild`.
    if (asChild) {
      return (
        <Slot
          className={computedClassName}
          ref={ref as React.Ref<HTMLElement>}
          {...props}
        >
          {children}
        </Slot>
      );
    }

    return (
      <button
        className={computedClassName}
        ref={ref}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!isLoading && leftIcon && <span className="mr-2 inline-flex">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="ml-2 inline-flex">{rightIcon}</span>}
      </button>
    );
  },
);

Button.displayName = 'Button';
