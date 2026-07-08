/** @format */

'use client';

import type { ComponentType, ReactNode, SVGProps } from 'react';

type Tone = 'danger' | 'warning' | 'primary' | 'success';

const TONE: Record<Tone, string> = {
	danger: 'bg-danger-100 text-danger-600',
	warning: 'bg-warning-100 text-warning-600',
	primary: 'bg-primary-100 text-primary-600',
	success: 'bg-success-100 text-success-600',
};

/**
 * The single light, centered status-screen frame for the standalone pages
 * (banned / business-pending / business-rejected / maintenance). One clean card
 * on `bg-surface`: a toned icon circle, a title, an optional description and a
 * slot for extra content + actions.
 */
export default function StatusScreen({
	icon: Icon,
	tone = 'primary',
	title,
	description,
	children,
}: {
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	tone?: Tone;
	title: ReactNode;
	description?: ReactNode;
	children?: ReactNode;
}) {
	return (
		<main className='flex min-h-screen items-center justify-center bg-surface px-4 py-12'>
			<div className='w-full max-w-md rounded-2xl border border-border bg-surface-elevated p-8 text-center shadow-sm'>
				<div
					className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full ${TONE[tone]}`}>
					<Icon className='h-8 w-8' />
				</div>
				<h1 className='text-2xl font-bold text-heading mb-2'>{title}</h1>
				{description && <p className='text-muted text-sm mb-6'>{description}</p>}
				{children}
			</div>
		</main>
	);
}
