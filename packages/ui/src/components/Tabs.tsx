/** @format */

'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '../lib/utils';

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.List>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
	<TabsPrimitive.List
		ref={ref}
		className={cn(
			'inline-flex items-center justify-start gap-2 rounded-lg bg-surface-elevated p-2 text-muted border-border border',
			className,
		)}
		{...props}
	/>
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Trigger>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
	<TabsPrimitive.Trigger
		ref={ref}
		className={cn(
			'inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
			'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600',
			'disabled:pointer-events-none disabled:opacity-50',
			'data-[state=active]:bg-surface-elevated data-[state=active]:text-heading data-[state=active]:shadow-sm data-[state=inactive]:bg-surface-alt',
			className,
		)}
		{...props}
	/>
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
	React.ElementRef<typeof TabsPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
	<TabsPrimitive.Content
		ref={ref}
		className={cn(
			'mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 rounded-md',
			className,
		)}
		{...props}
	/>
));
TabsContent.displayName = 'TabsContent';
