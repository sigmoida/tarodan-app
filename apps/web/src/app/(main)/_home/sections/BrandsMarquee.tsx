/** @format */

'use client';

import Link from 'next/link';
import OptimizedImage from '@/components/OptimizedImage';
import { useHome } from '../context/HomeDataContext';

export default function BrandsMarquee() {
	const { marqueeItemsToShow } = useHome();

	return (
		// Full-bleed: break out of the (main) content container to span the whole
		// viewport width, regardless of the max-w-screen-xl cap.
		<section className='py-4 mx-[calc(50%-50vw)] w-screen'>
			<div
				className='relative w-full overflow-hidden'
				style={{
					// Fade the marquee out at the left/right edges instead of hard-cutting
					// where it overflows the viewport.
					WebkitMaskImage:
						'linear-gradient(to right, transparent, #000 35%, #000 65%, transparent)',
					maskImage:
						'linear-gradient(to right, transparent, #000 35%, #000 65%, transparent)',
				}}>
				<div className='brands-marquee-track flex flex-nowrap items-center gap-6 px-2 sm:px-3'>
					{[...marqueeItemsToShow, ...marqueeItemsToShow].map((brand, i) => (
						<Link
							key={`${brand.name}-${i}`}
							href={`/listings?manufacturer=${encodeURIComponent(brand.name)}`}
							className='flex-shrink-0 group'>
							<div className='w-24 h-14 sm:w-28 sm:h-16 bg-surface-elevated border border-border hover:border-primary-300 flex items-center justify-center p-2.5 transition-all hover:shadow-sm relative rounded'>
								{brand.logoUrl ? (
									<OptimizedImage
										src={brand.logoUrl}
										alt={brand.name}
										fill
										className='object-contain p-1'
										sizes='(max-width: 640px) 96px, 112px'
										unoptimized
										fallbackSrc={`https://placehold.co/112x64/ffffff/9ca3af?text=${encodeURIComponent(brand.name)}`}
										logContext={{ page: 'home-marquee', brand: brand.name }}
									/>
								) : (
									<span className='text-xs font-semibold text-muted group-hover:text-primary-600 transition-colors text-center leading-tight'>
										{brand.name}
									</span>
								)}
							</div>
						</Link>
					))}
				</div>
			</div>
		</section>
	);
}
