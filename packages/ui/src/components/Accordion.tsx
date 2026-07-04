/** @format */

'use client';

import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { cn } from '../lib/utils';

/**
 * Radix-based accordion — accessible collapsible sections with animated content.
 * Compose `Accordion > AccordionItem > (AccordionTrigger + AccordionContent)`.
 * The trigger renders its own rotating chevron; `type="multiple"` lets several
 * sections stay open at once.
 */
export const Accordion = AccordionPrimitive.Root;

export const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item
    ref={ref}
    className={cn('border-b border-border-subtle last:border-b-0', className)}
    {...props}
  />
));
AccordionItem.displayName = 'AccordionItem';

const ChevronDown = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className={className}>
    <path
      fillRule="evenodd"
      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
      clipRule="evenodd"
    />
  </svg>
);

export const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'group flex flex-1 items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-heading outline-none transition-colors hover:bg-surface',
        'focus-visible:ring-2 focus-visible:ring-primary-400',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = 'AccordionTrigger';

export const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className={cn(
      'overflow-hidden text-sm',
      'data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up',
      className,
    )}
    {...props}
  >
    <div className="px-4 pb-4 pt-0">{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = 'AccordionContent';
