/** @format */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@tarodan/ui';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/i18n/LanguageContext';
import { Container } from '../Container';

interface TopAd {
	id: string;
	title: string;
	imageUrl: string | null;
	linkUrl: string | null;
	content: string | null;
	altText: string | null;
	width: number | null;
	height: number | null;
	deviceType: string;
}

/**
 * Owns the top-ads state: fetches active header ads for the current device,
 * records one impression per ad, tracks image-load failures, and derives whether
 * ads should show at all (the ad-free perk comes from the admin tier setting via
 * `/membership/me/limits`, never a hardcoded tier name).
 */
function useTopAds() {
	const { isAuthenticated, user } = useAuthStore();
	const [topAds, setTopAds] = useState<TopAd[]>([]);
	const recordedImpressions = useRef<Set<string>>(new Set());
	const [adImageError, setAdImageError] = useState<Set<string>>(new Set());
	const [isMobile, setIsMobile] = useState(false);
	const [isAdFree, setIsAdFree] = useState(false);

	// Ads show to everyone except members whose tier grants the ad-free perk.
	const shouldShowAd = isAuthenticated ? !isAdFree : true;

	useEffect(() => {
		if (!isAuthenticated) {
			setIsAdFree(false);
			return;
		}
		let cancelled = false;
		api
			.get<{ isAdFree?: boolean }>('/membership/me/limits')
			.then((res) => {
				if (!cancelled) setIsAdFree(!!res.data?.isAdFree);
			})
			.catch(() => {
				if (!cancelled) setIsAdFree(false);
			});
		return () => {
			cancelled = true;
		};
	}, [isAuthenticated, user?.membershipTier]);

	useEffect(() => {
		const checkMobile = () => setIsMobile(window.innerWidth < 768);
		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	}, []);

	useEffect(() => {
		if (!shouldShowAd) return;
		const deviceType = isMobile ? 'mobile' : 'desktop';
		api
			.get<TopAd[]>('/ads/active', {
				params: { position: 'header', device: deviceType },
			})
			.then((res) => {
				setTopAds(Array.isArray(res.data) ? res.data : []);
				setAdImageError(new Set());
			})
			.catch((err) => {
				if (process.env.NODE_ENV === 'development')
					console.error('Failed to fetch ads:', err);
				setTopAds([]);
			});
	}, [shouldShowAd, isMobile]);

	// One impression per ad while the bar is shown.
	useEffect(() => {
		if (topAds.length === 0) return;
		topAds.forEach((ad) => {
			if (recordedImpressions.current.has(ad.id)) return;
			recordedImpressions.current.add(ad.id);
			api.post(`/ads/${ad.id}/impression`).catch(() => {});
		});
	}, [topAds]);

	const handleAdClick = (ad: TopAd) => {
		api.post(`/ads/${ad.id}/click`).catch(() => {});
		if (ad.linkUrl) window.open(ad.linkUrl, '_blank', 'noopener,noreferrer');
	};

	const handleAdImageError = (adId: string) =>
		setAdImageError((prev) => new Set(prev).add(adId));

	return { shouldShowAd, topAds, adImageError, handleAdClick, handleAdImageError };
}

/**
 * A slim, light sponsored strip above the header. Clean and on-theme: a muted
 * "Sponsorlu" label with the ad creative(s) centered next to it, aligned to the
 * shared Container. Third-party creatives stay raw `<img>` (external URLs, not
 * next/image).
 */
export default function TopAdsBar() {
	const { locale } = useTranslation();
	const { shouldShowAd, topAds, adImageError, handleAdClick, handleAdImageError } =
		useTopAds();

	if (!shouldShowAd || topAds.length === 0) return null;

	return (
		<div
			className='w-full border-b border-border bg-surface-alt'
			role='region'
			aria-label={locale === 'en' ? 'Sponsored' : 'Reklam alanı'}>
			<Container className='px-4'>
				<div className='flex h-9 items-center gap-3'>
					<span className='flex-shrink-0 text-[10px] font-medium uppercase tracking-wider text-subtle'>
						{locale === 'en' ? 'Sponsored' : 'Sponsorlu'}
					</span>
					<div className='flex flex-1 min-w-0 items-center justify-center gap-6 overflow-x-auto scrollbar-hide'>
						{topAds.map((ad) => (
							<Button
								variant='secondary'
								key={ad.id}
								type='button'
								onClick={() => handleAdClick(ad)}
								aria-label={ad.altText || ad.title}
								className='flex h-6 flex-shrink-0 items-center border-0 bg-transparent p-0 hover:bg-transparent hover:opacity-80'>
								{ad.imageUrl && !adImageError.has(ad.id) ? (
									// eslint-disable-next-line @next/next/no-img-element
									<img
										src={ad.imageUrl}
										alt={ad.altText || ad.title}
										loading='lazy'
										decoding='async'
										className='h-6 w-auto max-w-[200px] object-contain'
										onError={() => handleAdImageError(ad.id)}
									/>
								) : (
									<span className='whitespace-nowrap text-xs font-medium text-body'>
										{ad.title}
									</span>
								)}
							</Button>
						))}
					</div>
				</div>
			</Container>
		</div>
	);
}
