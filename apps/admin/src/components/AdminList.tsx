/** @format */

'use client';

import { type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { MagnifyingGlassIcon, ChevronLeftIcon } from '@heroicons/react/24/outline';
import { Input } from '@tarodan/ui';

/**
 * Shared components that unify the "action areas" of admin list pages:
 * PageHeader (title + primary action), FilterToolbar (search + filters),
 * BulkActionBar (X-selected + bulk action), ActionButtons/ActionIconButton (row actions).
 */

export function PageHeader({
	title,
	badge,
	description,
	backHref,
	backLabel = 'Geri',
	children,
}: {
	title: ReactNode;
	/** Rendered next to the title (e.g. a count/status pill). */
	badge?: ReactNode;
	description?: ReactNode;
	/** When set, a back chevron links here before the title (detail pages). */
	backHref?: string;
	backLabel?: string;
	children?: ReactNode;
}) {
	return (
		<div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
			<div className='flex min-w-0 items-start gap-2'>
				{backHref && (
					<Link
						href={backHref}
						aria-label={backLabel}
						title={backLabel}
						// h-8 = text-2xl line box → items-center aligns the chevron to the title's vertical center
						className='-ml-1 flex h-8 items-center rounded-lg px-1 text-muted transition-colors hover:bg-surface-alt hover:text-heading'>
						<ChevronLeftIcon className='h-7 w-7' />
					</Link>
				)}
				<div className='min-w-0 space-y-0.5'>
					<div className='flex flex-wrap items-center gap-3'>
						<h1 className='text-2xl font-bold text-heading'>{title}</h1>
						{badge}
					</div>
					{description != null && (
						<p className='mt-1 text-muted text-sm'>{description}</p>
					)}
				</div>
			</div>
			{children && (
				<div className='flex flex-wrap items-center gap-2'>{children}</div>
			)}
		</div>
	);
}

export function FilterToolbar({
	search,
	onSearchChange,
	onSearchSubmit,
	searchPlaceholder = 'Ara...',
	children,
}: {
	search: string;
	onSearchChange: (v: string) => void;
	onSearchSubmit?: () => void;
	searchPlaceholder?: string;
	/** Filter controls on the right (Selects, etc.). */
	children?: ReactNode;
}) {
	return (
		<div className='flex flex-col gap-3 sm:flex-row'>
			<div className='relative flex-1'>
				<MagnifyingGlassIcon className='pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-subtle' />
				<Input
					value={search}
					onChange={(e) => onSearchChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') onSearchSubmit?.();
					}}
					placeholder={searchPlaceholder}
					className='pl-10'
				/>
			</div>
			{children}
		</div>
	);
}

export function BulkActionBar({
	count,
	children,
	onClear,
}: {
	count: number;
	children: ReactNode;
	onClear?: () => void;
}) {
	if (count <= 0) return null;
	return (
		<div className='flex flex-wrap items-center gap-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-2'>
			<span className='text-sm font-medium text-body'>{count} seçili</span>
			<div className='flex flex-wrap items-center gap-2'>{children}</div>
			{onClear && (
				<button
					type='button'
					onClick={onClear}
					className='ml-auto text-sm text-muted hover:text-body'>
					Seçimi temizle
				</button>
			)}
		</div>
	);
}

type ActionVariant = 'default' | 'danger' | 'success' | 'primary';

const actionColor: Record<ActionVariant, string> = {
	default: 'text-muted hover:bg-surface-alt',
	danger: 'text-danger-600 hover:bg-danger-500/10',
	success: 'text-success-700 hover:bg-success-500/10',
	primary: 'text-primary-600 hover:bg-primary-500/10',
};

/** Icon button for a row action (View/Edit/Delete/Approve...). Renders a Link if href is given. */
export function ActionIconButton({
	icon: Icon,
	onClick,
	title,
	href,
	variant = 'default',
	disabled,
}: {
	icon: ComponentType<{ className?: string }>;
	onClick?: () => void;
	title: string;
	href?: string;
	variant?: ActionVariant;
	disabled?: boolean;
}) {
	const cls = `inline-flex rounded-lg p-2 transition-colors ${actionColor[variant]} disabled:cursor-not-allowed disabled:opacity-50`;
	if (href) {
		return (
			<Link
				href={href}
				className={cls}
				title={title}
				aria-label={title}>
				<Icon className='h-5 w-5' />
			</Link>
		);
	}
	return (
		<button
			type='button'
			onClick={onClick}
			title={title}
			aria-label={title}
			disabled={disabled}
			className={cls}>
			<Icon className='h-5 w-5' />
		</button>
	);
}

/** Wrapper that groups row action buttons. */
export function ActionButtons({ children }: { children: ReactNode }) {
	return <div className='flex items-center gap-1'>{children}</div>;
}
