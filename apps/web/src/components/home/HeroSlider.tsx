/** @format */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useTranslation } from '@/i18n/LanguageContext';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Button } from '@tarodan/ui';
import { HERO_SLIDES } from './heroSlides';

const AUTOPLAY_MS = 10000;
const SWIPE_THRESHOLD = 50;

export default function HeroSlider() {
	const { locale } = useTranslation();
	const slides = HERO_SLIDES[locale === 'en' ? 'en' : 'tr'];
	const count = slides.length;

	const [current, setCurrent] = useState(0);
	const goTo = useCallback((i: number) => setCurrent((i + count) % count), [count]);

	// Auto-advance.
	useEffect(() => {
		const id = setInterval(() => setCurrent((p) => (p + 1) % count), AUTOPLAY_MS);
		return () => clearInterval(id);
	}, [count]);

	// Lightweight swipe: compare start/end X against a threshold.
	const swipeStartX = useRef<number | null>(null);
	const onTouchStart = (e: React.TouchEvent) => {
		swipeStartX.current = e.touches[0].clientX;
	};
	const onTouchEnd = (e: React.TouchEvent) => {
		if (swipeStartX.current === null) return;
		const dx = e.changedTouches[0].clientX - swipeStartX.current;
		if (Math.abs(dx) > SWIPE_THRESHOLD) setCurrent((p) => (p + (dx < 0 ? 1 : -1) + count) % count);
		swipeStartX.current = null;
	};

	return (
		<section className='relative overflow-hidden bg-surface'>
			{/* Track: all slides in a row, shifted by translateX (dynamic → inline). */}
			<div
				className='flex touch-pan-y transition-transform duration-500 ease-premium'
				style={{ transform: `translateX(-${current * 100}%)` }}
				onTouchStart={onTouchStart}
				onTouchEnd={onTouchEnd}>
				{slides.map((slide, i) => (
					<div key={i} className='w-full flex-shrink-0'>
						<div className='max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24 lg:py-32'>
							<div className='grid md:grid-cols-2 gap-12 items-center'>
								{/* Text */}
								<div className={slide.imageRight ? '' : 'md:order-2'}>
									<h1 className='text-3xl md:text-4xl lg:text-[3.25rem] font-bold text-heading font-display leading-[1.1] tracking-tight mb-6 whitespace-pre-line'>
										{slide.title}
									</h1>
									<p className='text-base md:text-lg text-muted mb-6 max-w-lg leading-relaxed'>
										{slide.subtitle}
									</p>
									<div className='flex flex-col sm:flex-row gap-3'>
										<ButtonLink variant='primary' href={slide.cta1.href}>
											{slide.cta1.label}
										</ButtonLink>
										<ButtonLink variant='secondary' href={slide.cta2.href}>
											{slide.cta2.label}
										</ButtonLink>
									</div>
								</div>
								{/* Image */}
								<div
									className={`relative hidden md:block aspect-[4/3] w-full max-w-3xl overflow-hidden rounded border border-border bg-surface-elevated ${
										slide.imageRight ? '' : 'md:order-1'
									}`}>
									<Image
										src={slide.image}
										alt={
											locale === 'tr'
												? 'Diecast model araç koleksiyonu'
												: 'Diecast model car collection'
										}
										fill
										sizes='(max-width: 768px) 0px, (max-width: 1024px) 400px, 512px'
										className='object-cover object-center'
										priority={i === 0}
										quality={90}
										unoptimized={slide.image.startsWith('http')}
									/>
								</div>
							</div>
						</div>
					</div>
				))}
			</div>

			{/* Slide indicators */}
			<div className='absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10'>
				{slides.map((_, index) => (
					<Button
						variant='secondary'
						key={index}
						onClick={() => goTo(index)}
						className={`h-2 rounded-full transition-all duration-300 ease-premium ${
							index === current ? 'bg-primary-500 w-8' : 'bg-border-strong w-2 hover:bg-subtle'
						}`}
						aria-label={`Go to slide ${index + 1}`}
					/>
				))}
			</div>
		</section>
	);
}
