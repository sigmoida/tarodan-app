/** @format */

import React, { useState } from 'react';
import { cn } from '../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
	/** Optional label. If provided, renders wrapper with label above. */
	label?: string;
	/** Error message shown below. */
	error?: string;
	/** Helper text shown below (hidden when error present). */
	helperText?: string;
	/** When true, render only the bare input (no wrapper div/label).
	 *  Useful for drop-in replacement of inline <input className="..." />. */
	bare?: boolean;
	/** Size variant */
	inputSize?: 'sm' | 'md' | 'lg';
	/** Node rendered inside the input at the left (icon or text). */
	leftAdornment?: React.ReactNode;
	/** Node rendered inside the input at the right (icon or text). */
	rightAdornment?: React.ReactNode;
	/** type="password" alanlarında otomatik göster/gizle (göz) butonunu KAPAT. */
	hidePasswordToggle?: boolean;
}

const sizeClasses = {
	sm: 'h-8 text-sm',
	md: 'h-10 text-sm',
	lg: 'h-12 text-base',
};

const sizePaddingX = {
	sm: 'px-2.5',
	md: 'px-3',
	lg: 'px-4',
};

const sizePaddingY = {
	sm: 'py-1.5',
	md: 'py-2',
	lg: 'py-2.5',
};

const inputClasses = (error?: string, inputSize: 'sm' | 'md' | 'lg' = 'md') =>
	cn(
		'flex w-full rounded-lg border bg-surface-elevated transition-colors text-body',
		sizeClasses[inputSize],
		sizePaddingX[inputSize],
		sizePaddingY[inputSize],
		'placeholder:text-subtle',
		'focus:outline-none focus:ring-2 focus:ring-offset-0',
		error
			? 'border-danger-500 focus:border-danger-500 focus:ring-danger-500'
			: 'border-border focus:border-primary-500 focus:ring-primary-500',
		'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface',
	);

/** Şifreyi göster (göz) ikonu */
function EyeIcon() {
	return (
		<svg
			width='20'
			height='20'
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			aria-hidden='true'>
			<path d='M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z' />
			<circle
				cx='12'
				cy='12'
				r='3'
			/>
		</svg>
	);
}

/** Şifreyi gizle (göz-çizgili) ikonu */
function EyeOffIcon() {
	return (
		<svg
			width='20'
			height='20'
			viewBox='0 0 24 24'
			fill='none'
			stroke='currentColor'
			strokeWidth='2'
			strokeLinecap='round'
			strokeLinejoin='round'
			aria-hidden='true'>
			<path d='M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24' />
			<line
				x1='1'
				y1='1'
				x2='23'
				y2='23'
			/>
		</svg>
	);
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
	(
		{
			className,
			label,
			error,
			helperText,
			bare,
			inputSize = 'md',
			leftAdornment,
			rightAdornment,
			hidePasswordToggle,
			type,
			id,
			...props
		},
		ref,
	) => {
		const inputId =
			id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

		// type="password" → dahili göster/gizle. Her şifre alanı otomatik kazanır;
		// istenmeyen yerde hidePasswordToggle ile kapatılır.
		const [showPassword, setShowPassword] = useState(false);
		const isPassword = type === 'password';
		const enableToggle = isPassword && !hidePasswordToggle;
		const effectiveType = enableToggle && showPassword ? 'text' : type;

		const passwordToggle = enableToggle ? (
			<button
				type='button'
				tabIndex={-1}
				onClick={() => !props.disabled && setShowPassword((v) => !v)}
				aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
				className='flex items-center text-subtle hover:text-body transition-colors disabled:cursor-not-allowed'
				disabled={props.disabled}>
				{showPassword ? <EyeOffIcon /> : <EyeIcon />}
			</button>
		) : null;

		// Hem özel rightAdornment hem göz butonu olabilir → ikisini de göster.
		const effectiveRight =
			passwordToggle && rightAdornment ? (
				<span className='flex items-center gap-2'>
					{rightAdornment}
					{passwordToggle}
				</span>
			) : (
				(passwordToggle ?? rightAdornment)
			);

		const hasAdornment = Boolean(leftAdornment || effectiveRight);

		const renderControl = () => {
			if (!hasAdornment) {
				return (
					<input
						type={effectiveType}
						id={inputId}
						className={cn(inputClasses(error, inputSize), className)}
						ref={ref}
						{...props}
					/>
				);
			}
			// With adornment: input loses side padding; wrapper carries border.
			return (
				<div
					className={cn(
						'flex w-full items-center rounded-lg border bg-surface-elevated transition-colors',
						sizeClasses[inputSize],
						'focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-0',
						error
							? 'border-danger-500 focus-within:border-danger-500 focus-within:ring-danger-500'
							: 'border-border focus-within:border-primary-500 focus-within:ring-primary-500',
						props.disabled && 'cursor-not-allowed opacity-50 bg-surface',
						className,
					)}>
					{leftAdornment && (
						<span
							className={cn(
								'flex items-center pl-3 text-subtle',
								sizePaddingY[inputSize],
							)}>
							{leftAdornment}
						</span>
					)}
					<input
						type={effectiveType}
						id={inputId}
						className={cn(
							'flex w-full bg-transparent text-body outline-none placeholder:text-subtle disabled:cursor-not-allowed',
							sizePaddingX[inputSize],
							sizePaddingY[inputSize],
							leftAdornment ? 'pl-2' : '',
							effectiveRight ? 'pr-2' : '',
						)}
						ref={ref}
						{...props}
					/>
					{effectiveRight && (
						<span
							className={cn(
								'flex items-center pr-3 text-subtle',
								sizePaddingY[inputSize],
							)}>
							{effectiveRight}
						</span>
					)}
				</div>
			);
		};

		if (bare || (!label && !error && !helperText)) {
			return renderControl();
		}

		return (
			<div className='w-full'>
				{label && (
					<label
						htmlFor={inputId}
						className='mb-1.5 block text-sm font-medium text-body'>
						{label}
					</label>
				)}
				{renderControl()}
				{(error || helperText) && (
					<p
						className={cn(
							'mt-1 text-sm',
							error ? 'text-danger-600' : 'text-muted',
						)}>
						{error || helperText}
					</p>
				)}
			</div>
		);
	},
);

Input.displayName = 'Input';
