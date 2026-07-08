/** @format */

import { BRAND_GRADIENT, formatCardNumber, parseExp, type CardBrand } from '../_lib/card';
import { BrandEmblem, CardChip, ContactlessIcon } from './CardVisuals';

interface CardPreviewProps {
	holder: string;
	/** Raw digits. */
	number: string;
	/** Raw MMYY. */
	expiry: string;
	/** Raw CVV digits. */
	cvc: string;
	brand: CardBrand;
	/** When true, flips to the CVV back face. */
	flipped: boolean;
}

/** Live 3D credit-card preview; flips to the back when the CVV is focused. */
export default function CardPreview({ holder, number, expiry, cvc, brand, flipped }: CardPreviewProps) {
	const { month, year } = parseExp(expiry);
	return (
		<div className='relative mx-auto aspect-[1.586/1] w-full max-w-sm sm:mx-0' style={{ perspective: '1000px' }}>
			<div
				className='relative h-full w-full transition-transform duration-500'
				style={{
					transformStyle: 'preserve-3d',
					transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
				}}>
				{/* Front */}
				<div
					className={`absolute inset-0 overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-lg ${BRAND_GRADIENT[brand]}`}
					style={{ backfaceVisibility: 'hidden' }}>
					<div className='absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10' />
					<div className='absolute -left-6 -bottom-10 h-28 w-28 rounded-full bg-white/5' />
					<div className='flex items-start justify-between'>
						<CardChip />
						<div className='flex items-center gap-2'>
							<ContactlessIcon className='h-5 w-5 text-white/70' />
							<BrandEmblem brand={brand} />
						</div>
					</div>
					<div className='mt-5 font-mono text-lg tracking-[0.15em] tabular-nums drop-shadow-sm sm:text-xl'>
						{formatCardNumber(number, brand) || '•••• •••• •••• ••••'}
					</div>
					<div className='mt-4 flex items-end justify-between gap-3'>
						<div className='min-w-0'>
							<div className='text-[9px] uppercase tracking-widest text-white/60'>Kart Sahibi</div>
							<div className='truncate text-sm font-medium uppercase'>{holder || 'AD SOYAD'}</div>
						</div>
						<div className='text-right'>
							<div className='text-[9px] uppercase tracking-widest text-white/60'>Son Kul.</div>
							<div className='text-sm font-medium tabular-nums'>
								{(month || 'AA') + '/' + (year || 'YY')}
							</div>
						</div>
					</div>
				</div>

				{/* Back */}
				<div
					className={`absolute inset-0 overflow-hidden rounded-2xl bg-gradient-to-br text-white shadow-lg ${BRAND_GRADIENT[brand]}`}
					style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
					<div className='mt-5 h-10 w-full bg-black/70' />
					<div className='mt-4 px-5'>
						<div className='mb-1 text-right text-[9px] uppercase tracking-widest text-white/60'>CVV</div>
						<div className='flex h-9 items-center justify-end rounded bg-white/90 px-3 font-mono text-sm tracking-widest text-slate-900'>
							{cvc ? '•'.repeat(cvc.length) : '•••'}
						</div>
						<p className='mt-3 text-[10px] leading-snug text-white/55'>
							Kartınızın arkasındaki son 3 haneli güvenlik kodu.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
