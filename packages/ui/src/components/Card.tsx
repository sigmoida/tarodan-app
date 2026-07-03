/** @format */

import React from 'react';
import { cn } from '../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: 'default' | 'bordered' | 'elevated';
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
	({ className, variant = 'default', children, ...props }, ref) => {
		return (
			<div
				ref={ref}
				className={cn(
					'rounded-lg bg-surface-elevated',
					{
						'shadow-sm': variant === 'default',
						'border border-border': variant === 'bordered',
						'shadow-lg': variant === 'elevated',
					},
					className,
				)}
				{...props}>
				{children}
			</div>
		);
	},
);

Card.displayName = 'Card';

export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
	({ className, ...props }, ref) => (
		<div
			ref={ref}
			className={cn('flex flex-col space-y-1.5 p-6', className)}
			{...props}
		/>
	),
);

CardHeader.displayName = 'CardHeader';

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {}

export const CardTitle = React.forwardRef<HTMLHeadingElement, CardTitleProps>(
	({ className, ...props }, ref) => (
		<h3
			ref={ref}
			className={cn(
				'truncate text-lg font-semibold leading-none tracking-tight',
				className,
			)}
			{...props}
		/>
	),
);

CardTitle.displayName = 'CardTitle';

export interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const CardDescription = React.forwardRef<
	HTMLParagraphElement,
	CardDescriptionProps
>(({ className, ...props }, ref) => (
	<p
		ref={ref}
		className={cn('text-sm text-muted', className)}
		{...props}
	/>
));

CardDescription.displayName = 'CardDescription';

export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
	({ className, ...props }, ref) => (
		<div
			ref={ref}
			className={cn('p-6 pt-0', className)}
			{...props}
		/>
	),
);

CardContent.displayName = 'CardContent';

export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
	({ className, ...props }, ref) => (
		<div
			ref={ref}
			className={cn('flex items-center p-6 pt-0', className)}
			{...props}
		/>
	),
);

CardFooter.displayName = 'CardFooter';
