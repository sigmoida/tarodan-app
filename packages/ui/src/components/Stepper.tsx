/** @format */

'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Shared horizontal stepper for multi-step flows (checkout wizard, refund status
 * lifecycle, …). Completed steps get ✓, the current one is highlighted, upcoming
 * ones are dimmed, and a step flagged `error` shows a red ✕ (terminal states).
 *
 * Steps become clickable buttons when `onStepClick` is provided — by default only
 * steps up to `current` (i.e. going back); pass `canClickStep` to change that. Pair
 * with the `useStepper` hook to bind next/back to your Continue/Back buttons.
 */

export interface StepperStep {
	label: string;
	/** Override the circle content (number/check/✕ by default). */
	icon?: React.ReactNode;
	/** Terminal error step — renders a red ✕ (e.g. rejected/cancelled). */
	error?: boolean;
}

export interface StepperProps {
	steps: Array<StepperStep | string>;
	/** Active step index (0-based). */
	current: number;
	/** When set, steps render as buttons and call this with the clicked index. */
	onStepClick?: (index: number) => void;
	/** Gate which steps are clickable. Default: any step ≤ `current` (go back). */
	canClickStep?: (index: number) => boolean;
	className?: string;
}

type StepTone = 'done' | 'active' | 'upcoming' | 'error';

const CheckIcon = () => (
	<svg viewBox='0 0 20 20' fill='currentColor' aria-hidden className='h-4 w-4'>
		<path
			fillRule='evenodd'
			d='M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.3 3.3 6.8-6.8a1 1 0 011.4 0z'
			clipRule='evenodd'
		/>
	</svg>
);

const XIcon = () => (
	<svg viewBox='0 0 20 20' fill='currentColor' aria-hidden className='h-4 w-4'>
		<path
			fillRule='evenodd'
			d='M4.3 4.3a1 1 0 011.4 0L10 8.6l4.3-4.3a1 1 0 111.4 1.4L11.4 10l4.3 4.3a1 1 0 01-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 01-1.4-1.4L8.6 10 4.3 5.7a1 1 0 010-1.4z'
			clipRule='evenodd'
		/>
	</svg>
);

function StepMark({
	label,
	tone,
	icon,
	onClick,
}: {
	label: string;
	tone: StepTone;
	icon: React.ReactNode;
	onClick?: () => void;
}) {
	const body = (
		<>
			<span
				className={cn(
					'flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold',
					tone === 'done' && 'bg-primary-600 text-inverted',
					tone === 'active' &&
						'bg-primary-100 text-primary-700 ring-2 ring-primary-500',
					tone === 'upcoming' && 'bg-surface-alt text-muted',
					tone === 'error' &&
						'bg-danger-100 text-danger-700 ring-2 ring-danger-400',
				)}>
				{icon}
			</span>
			<span
				className={cn(
					'text-xs font-medium leading-tight',
					tone === 'active' && 'text-heading',
					tone === 'error' && 'text-danger-700',
					(tone === 'done' || tone === 'upcoming') && 'text-muted',
				)}>
				{label}
			</span>
		</>
	);

	const base = 'flex w-24 flex-col items-center gap-1.5 text-center';
	if (onClick) {
		return (
			<button
				type='button'
				onClick={onClick}
				className={cn(
					base,
					'cursor-pointer rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-primary-400',
				)}>
				{body}
			</button>
		);
	}
	return <div className={base}>{body}</div>;
}

function Connector({ done }: { done: boolean }) {
	return (
		<div className={cn('mt-4 h-0.5 flex-1', done ? 'bg-primary-600' : 'bg-border')} />
	);
}

export function Stepper({
	steps,
	current,
	onStepClick,
	canClickStep,
	className,
}: StepperProps) {
	const items = steps.map((s) => (typeof s === 'string' ? { label: s } : s));

	return (
		<div className={cn('overflow-x-auto', className)}>
			<ol className='flex min-w-max items-start'>
				{items.map((step, i) => {
					const isLast = i === items.length - 1;
					const done = i < current;
					const active = i === current;
					const tone: StepTone = step.error
						? 'error'
						: done
							? 'done'
							: active
								? 'active'
								: 'upcoming';
					const clickable =
						!!onStepClick && (canClickStep ? canClickStep(i) : i <= current);
					const icon =
						step.icon ??
						(tone === 'error' ? (
							<XIcon />
						) : tone === 'done' ? (
							<CheckIcon />
						) : (
							i + 1
						));
					return (
						<li
							key={`${step.label}-${i}`}
							className={cn('flex items-start', !isLast && 'flex-1')}>
							<StepMark
								label={step.label}
								tone={tone}
								icon={icon}
								onClick={clickable ? () => onStepClick!(i) : undefined}
							/>
							{!isLast && <Connector done={done} />}
						</li>
					);
				})}
			</ol>
		</div>
	);
}

Stepper.displayName = 'Stepper';

/**
 * Step-index state with next/back/goTo helpers — bind directly to Continue/Back
 * buttons. Indices are clamped to `[0, stepCount - 1]`.
 */
export function useStepper(stepCount: number, initial = 0) {
	const [current, setCurrent] = React.useState(initial);
	const goTo = React.useCallback(
		(i: number) => setCurrent(Math.min(stepCount - 1, Math.max(0, i))),
		[stepCount],
	);
	const next = React.useCallback(
		() => setCurrent((c) => Math.min(stepCount - 1, c + 1)),
		[stepCount],
	);
	const back = React.useCallback(
		() => setCurrent((c) => Math.max(0, c - 1)),
		[],
	);
	return {
		current,
		goTo,
		next,
		back,
		isFirst: current === 0,
		isLast: current === stepCount - 1,
	};
}
