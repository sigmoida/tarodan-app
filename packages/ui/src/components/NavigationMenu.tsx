/** @format */

'use client';

import * as React from 'react';
import * as NavigationMenuPrimitive from '@radix-ui/react-navigation-menu';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/utils';

/**
 * Radix-based navigation menu — accessible hover/focus/keyboard mega-menu with a
 * built-in animated viewport. Wraps the primitive with our design tokens so apps
 * compose `NavigationMenu > List > Item > (Trigger + Content | Link)` instead of
 * hand-rolling portal + hover-timeout + scroll-close state.
 */
export const NavigationMenu = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Root> & {
    /** Render the animated viewport (default true). */
    viewport?: boolean;
  }
>(({ className, children, viewport = true, ...props }, ref) => (
  <NavigationMenuPrimitive.Root
    ref={ref}
    className={cn('relative z-10 flex max-w-max flex-1 items-center', className)}
    {...props}
  >
    {children}
    {viewport && <NavigationMenuViewport />}
  </NavigationMenuPrimitive.Root>
));
NavigationMenu.displayName = 'NavigationMenu';

export const NavigationMenuList = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.List>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.List
    ref={ref}
    className={cn('group flex flex-1 list-none items-center gap-0.5', className)}
    {...props}
  />
));
NavigationMenuList.displayName = 'NavigationMenuList';

export const NavigationMenuItem = NavigationMenuPrimitive.Item;

export const navigationMenuTriggerStyle = cva(
  'group inline-flex w-max items-center justify-center gap-1 whitespace-nowrap rounded px-3 py-2 text-sm font-medium outline-none transition-colors disabled:pointer-events-none disabled:opacity-50',
);

const ChevronDown = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 20 20"
    fill="currentColor"
    aria-hidden
    className={className}
  >
    <path
      fillRule="evenodd"
      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
      clipRule="evenodd"
    />
  </svg>
);

export const NavigationMenuTrigger = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <NavigationMenuPrimitive.Trigger
    ref={ref}
    className={cn(navigationMenuTriggerStyle(), className)}
    {...props}
  >
    {children}
    <ChevronDown className="relative h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
  </NavigationMenuPrimitive.Trigger>
));
NavigationMenuTrigger.displayName = 'NavigationMenuTrigger';

export const NavigationMenuContent = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Content>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.Content
    ref={ref}
    className={cn(
      'left-0 top-0 w-full',
      'data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out',
      'data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out',
      'data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52',
      'data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52',
      'md:absolute md:w-auto',
      className,
    )}
    {...props}
  />
));
NavigationMenuContent.displayName = 'NavigationMenuContent';

export const NavigationMenuLink = NavigationMenuPrimitive.Link;

export const NavigationMenuViewport = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <div className="absolute left-0 top-full flex w-full justify-center">
    <NavigationMenuPrimitive.Viewport
      ref={ref}
      className={cn(
        'origin-top relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-lg border border-border bg-surface-elevated text-body shadow-elevated',
        'data-[state=open]:animate-in data-[state=closed]:animate-out',
        'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90',
        'md:w-[var(--radix-navigation-menu-viewport-width)]',
        className,
      )}
      {...props}
    />
  </div>
));
NavigationMenuViewport.displayName = 'NavigationMenuViewport';

export const NavigationMenuIndicator = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Indicator>,
  React.ComponentPropsWithoutRef<typeof NavigationMenuPrimitive.Indicator>
>(({ className, ...props }, ref) => (
  <NavigationMenuPrimitive.Indicator
    ref={ref}
    className={cn(
      'top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden',
      'data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in',
      className,
    )}
    {...props}
  >
    <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-border" />
  </NavigationMenuPrimitive.Indicator>
));
NavigationMenuIndicator.displayName = 'NavigationMenuIndicator';
