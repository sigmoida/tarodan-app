/** @format */

import { BRAND_LABEL, type CardBrand } from '../_lib/card';

/** Card brand pill (pure CSS, no external logo deps). */
export function BrandBadge({ brand, className = '' }: { brand: CardBrand; className?: string }) {
	if (brand === 'unknown') return null;
	const styles: Record<Exclude<CardBrand, 'unknown'>, string> = {
		visa: 'bg-white text-[#1a1f71]',
		mastercard: 'bg-white text-[#eb001b]',
		amex: 'bg-white text-[#2e77bc]',
		troy: 'bg-white text-[#00a0d2]',
	};
	return (
		<span
			className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide shadow-sm ${styles[brand]} ${className}`}>
			{BRAND_LABEL[brand]}
		</span>
	);
}

/** Mastercard interlocking rings. */
export function MastercardMark() {
	return (
		<span className='relative inline-flex h-6 w-10 items-center'>
			<span className='absolute left-0 h-6 w-6 rounded-full bg-[#eb001b]' />
			<span className='absolute left-4 h-6 w-6 rounded-full bg-[#f79e1b] mix-blend-screen' />
		</span>
	);
}

/** EMV chip. */
export function CardChip() {
	return (
		<div className='relative h-7 w-10 rounded-md bg-gradient-to-br from-yellow-200 via-amber-300 to-yellow-500 shadow-inner ring-1 ring-yellow-600/30'>
			<div className='absolute inset-1 grid grid-cols-3 gap-px opacity-50'>
				{Array.from({ length: 6 }).map((_, i) => (
					<span key={i} className='border border-yellow-700/40' />
				))}
			</div>
		</div>
	);
}

/** Contactless waves. */
export function ContactlessIcon({ className = '' }: { className?: string }) {
	return (
		<svg viewBox='0 0 24 24' fill='none' className={className} aria-hidden='true'>
			<path d='M8.5 7.5a6 6 0 0 1 0 9' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' />
			<path d='M11.5 5.5a9.5 9.5 0 0 1 0 13' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' />
			<path d='M14.5 3.5a13 13 0 0 1 0 17' stroke='currentColor' strokeWidth='1.6' strokeLinecap='round' />
		</svg>
	);
}

/** Brand emblem used inline (mastercard rings vs a pill). */
export function BrandEmblem({ brand }: { brand: CardBrand }) {
	return brand === 'mastercard' ? <MastercardMark /> : <BrandBadge brand={brand} />;
}
