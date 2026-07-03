/** @format */

import React from 'react';
import { cn } from '../lib/utils';

export interface SliderProps
	extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
	/** Optional label rendered above the track. */
	label?: React.ReactNode;
	/** Value read-out rendered on the right of the label row. */
	valueLabel?: React.ReactNode;
	/** Helper text shown below the track. */
	helperText?: React.ReactNode;
}

/**
 * A range slider built on the native `input[type=range]`, styled with the
 * design-system accent. Use for bounded numeric settings (thresholds, ratios)
 * where a track reads better than a number field.
 */
export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
	({ label, valueLabel, helperText, className, ...props }, ref) => {
		const track = (
			<input
				ref={ref}
				type='range'
				className={cn('w-full accent-primary-500', className)}
				{...props}
			/>
		);

		if (!label && !valueLabel && !helperText) return track;

		return (
			<div className='space-y-2'>
				{(label || valueLabel) && (
					<div className='flex items-center justify-between gap-2'>
						{label && (
							<span className='text-sm font-medium text-heading'>{label}</span>
						)}
						{valueLabel && (
							<span className='font-semibold text-heading'>{valueLabel}</span>
						)}
					</div>
				)}
				{track}
				{helperText && <p className='text-sm text-muted'>{helperText}</p>}
			</div>
		);
	},
);

Slider.displayName = 'Slider';
