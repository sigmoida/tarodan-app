/** @format */

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import {
	PlusIcon,
	ChatBubbleLeftRightIcon,
	ShoppingCartIcon,
	ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import NotificationBell from '@/components/notifications/NotificationBell';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { withChunkErrorLogging } from '@/lib/dynamicWithLogging';
import { useTranslation } from '@/i18n/LanguageContext';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Container } from './Container';
import HeaderSearch from './header/HeaderSearch';
import AccountMenu from './header/AccountMenu';
import CategoryNav from './header/CategoryNav';
import { useHeaderData } from './header/useHeaderData';

const AuthRequiredModal = dynamic(
	withChunkErrorLogging(
		() => import('@/components/AuthRequiredModal'),
		'AuthRequiredModal',
	),
	{ ssr: false },
);

// NOT: '/collections' burada DEĞİL — kategori çubuğu (Tüm İlanlar/İndirimler/
// Koleksiyonlar...) public koleksiyonlar sayfasında da görünmeli, yoksa kullanıcı
// koleksiyonlara girince navigasyon kayboluyor. (/profile/collections '/profile'
// ile zaten gizli kalır.)
const HIDDEN_CATEGORY_PATHS = [
	'/profile',
	'/login',
	'/register',
	'/checkout',
	'/settings',
	'/messages',
	'/guvenli-takas',
	'/orders',
	'/favorites',
	'/trades',
	'/offers',
	'/seller',
	'/support',
	'/forgot-password',
	'/reset-password',
	'/verify-email',
];

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
 * Owns the top-ads marquee state: fetches active header ads for the current
 * device, records one impression per ad, tracks image-load failures, and
 * derives whether ads should be shown at all (ad-free membership avantajı
 * admin'in tier ayarından gelir, hardcode DEĞİL).
 */
function useTopAds() {
	const { isAuthenticated, user } = useAuthStore();
	const [topAds, setTopAds] = useState<TopAd[]>([]);
	const recordedImpressions = useRef<Set<string>>(new Set());
	const [adImageError, setAdImageError] = useState<Set<string>>(new Set());
	const [isMobile, setIsMobile] = useState(false);
	// Reklamsız (ad-free) avantajı admin'in tier ayarından gelir (hardcode DEĞİL).
	const [isAdFree, setIsAdFree] = useState(false);

	// Reklam yalnız üyeliğinde "reklamsız" avantajı OLMAYANLARA gösterilir.
	// isAdFree değeri admin'in tier ayarından (/membership/me/limits) gelir;
	// tier ADINI hardcode etmek admin'in reklam-kapatma değişikliğini yok
	// sayıyordu (bug: reklam kapatılsa bile kullanıcı reklam görüyordu).
	const shouldShowAd = isAuthenticated ? !isAdFree : true;

	// Gerçek isAdFree'yi üyelik limitlerinden çek (hardcoded tier adı yerine).
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

	// Detect mobile/desktop for responsive ads
	useEffect(() => {
		const checkMobile = () => {
			setIsMobile(window.innerWidth < 768);
		};
		checkMobile();
		window.addEventListener('resize', checkMobile);
		return () => window.removeEventListener('resize', checkMobile);
	}, []);

	// Fetch active top ads (public API, no auth) - with device type
	useEffect(() => {
		if (!shouldShowAd) return;
		const deviceType = isMobile ? 'mobile' : 'desktop';
		api
			.get<TopAd[]>('/ads/active', {
				params: { position: 'header', device: deviceType },
			})
			.then((res) => {
				const list = Array.isArray(res.data) ? res.data : [];
				setTopAds(list);
				setAdImageError(new Set());
			})
			.catch((err) => {
				if (process.env.NODE_ENV === 'development')
					console.error('Failed to fetch ads:', err);
				setTopAds([]);
			});
	}, [shouldShowAd, isMobile]);

	// Record impression once per ad when bar is shown
	useEffect(() => {
		if (topAds.length === 0) return;
		topAds.forEach((ad) => {
			if (recordedImpressions.current.has(ad.id)) return;
			recordedImpressions.current.add(ad.id);
			api.post(`/ads/${ad.id}/impression`).catch(() => {});
		});
	}, [topAds]);

	const handleAdClick = (ad: { id: string; linkUrl: string | null }) => {
		api.post(`/ads/${ad.id}/click`).catch(() => {});
		if (ad.linkUrl) window.open(ad.linkUrl, '_blank', 'noopener,noreferrer');
	};

	const handleAdImageError = (adId: string) => {
		setAdImageError((prev) => new Set(prev).add(adId));
	};

	return {
		shouldShowAd,
		topAds,
		isMobile,
		adImageError,
		handleAdClick,
		handleAdImageError,
	};
}

/**
 * Slim top bar image marquee (50px desktop / 40px mobile). Renders active
 * header ads for non ad-free users. The external ad creatives stay raw `<img>`
 * (not next/image) since they are third-party creative URLs.
 */
function TopAdsBar() {
	const {
		shouldShowAd,
		topAds,
		isMobile,
		adImageError,
		handleAdClick,
		handleAdImageError,
	} = useTopAds();

	if (!shouldShowAd || topAds.length === 0) return null;

	return (
		<div
			className='w-full relative flex items-center overflow-hidden border-b border-border-strong bg-heading'
			style={{
				height: isMobile ? 40 : 50,
				maxHeight: 60,
			}}
			role='region'
			aria-label='Reklam alanı'>
			{/* Marquee: bir set reklam + viewport boşluğu + tekrar aynı set → aynı anda tek logo görünür */}
			<div className='ad-marquee-track flex flex-nowrap items-center flex-shrink-0 gap-8 h-full pr-8'>
				{topAds.map((ad, index) => (
					<Button
						variant='secondary'
						key={`a-${ad.id}-${index}`}
						type='button'
						onClick={() => handleAdClick(ad)}
						className='flex items-center justify-center h-full flex-shrink-0 hover:opacity-90 transition-opacity'
						style={{ height: isMobile ? 40 : 50 }}
						aria-label={ad.altText || ad.title}>
						{ad.imageUrl && !adImageError.has(ad.id) ? (
							<img
								src={ad.imageUrl}
								alt={ad.altText || ad.title}
								loading='lazy'
								decoding='async'
								className='h-full w-auto object-contain max-w-[280px] sm:max-w-[400px]'
								style={{ maxHeight: isMobile ? 40 : 50 }}
								onError={() => handleAdImageError(ad.id)}
							/>
						) : (
							<span className='text-primary-400 text-xs font-medium px-4 whitespace-nowrap'>
								{ad.title}
							</span>
						)}
					</Button>
				))}
				{/* İki set arasında en az viewport genişliği boşluk → ikinci logo ekranda çıkana kadar birinci kayar */}
				<div
					className='flex-shrink-0 h-full'
					style={{ minWidth: '100vw' }}
					aria-hidden
				/>
				{topAds.map((ad, index) => (
					<Button
						variant='secondary'
						key={`b-${ad.id}-${index}`}
						type='button'
						onClick={() => handleAdClick(ad)}
						className='flex items-center justify-center h-full flex-shrink-0 hover:opacity-90 transition-opacity'
						style={{ height: isMobile ? 40 : 50 }}
						aria-label={ad.altText || ad.title}>
						{ad.imageUrl && !adImageError.has(ad.id) ? (
							<img
								src={ad.imageUrl}
								alt={ad.altText || ad.title}
								loading='lazy'
								decoding='async'
								className='h-full w-auto object-contain max-w-[280px] sm:max-w-[400px]'
								style={{ maxHeight: isMobile ? 40 : 50 }}
								onError={() => handleAdImageError(ad.id)}
							/>
						) : (
							<span className='text-primary-400 text-xs font-medium px-4 whitespace-nowrap'>
								{ad.title}
							</span>
						)}
					</Button>
				))}
			</div>
			{/* Sponsorlu badge - sol üst */}
			<span
				className='absolute left-2 top-1/2 -translate-y-1/2 z-10 text-[9px] text-muted opacity-60 select-none pointer-events-none'
				aria-hidden>
				Sponsorlu
			</span>
		</div>
	);
}

/**
 * The whole storefront header as one unit: the top-ads marquee (scrolls away),
 * then the sticky header block holding the main bar (logo + search + action
 * cluster + account menu) and, directly beneath it, the category bar — both
 * wrapped in the shared `Container`. No framer-motion, no scroll-hide: the
 * header block stays pinned with `sticky top-0`.
 */
export default function Header() {
	const { t } = useTranslation();
	const pathname = usePathname();
	const headerData = useHeaderData();
	const {
		showAuthUI,
		user,
		logout,
		unreadMessageCount,
		unreadNotificationsCount,
		pendingOffersCount,
		pendingTradesCount,
		cartCount,
		wishlistCount,
	} = headerData;

	const [showAuthModal, setShowAuthModal] = useState(false);
	const [showTradesAuthModal, setShowTradesAuthModal] = useState(false);

	const showCategoryBar = !HIDDEN_CATEGORY_PATHS.some((p) =>
		pathname.startsWith(p),
	);

	return (
		<>
			{/* Slim Top Bar - Image Marquee (50px / 40px mobile) */}
			<TopAdsBar />

			{/* Sticky header block: main bar + category bar together, always visible */}
			<div className='sticky top-0 z-50'>
				{/* Main bar */}
				<div className='bg-primary-500 border-b border-primary-600 shadow-sm'>
					<Container className='px-4'>
						<div className='flex items-center gap-4 h-14 lg:h-16 max-h-14 lg:max-h-16 min-h-0'>
							{/* Logo */}
							<Link
								href='/'
								className='flex-shrink-0 flex items-center hover:opacity-90 transition-opacity h-8'>
								<Image
									src='/tarodan-logo-transparent.png'
									alt='Tarodan Logo'
									width={120}
									height={38}
									className='object-contain max-h-8 w-auto'
									priority
								/>
							</Link>

							{/* Arama - ortada */}
							<HeaderSearch />

							{/* Right - İlan Ver + Menü + Hesap dropdown */}
							<div className='flex items-center gap-1 flex-shrink-0 ml-auto'>
								{showAuthUI && (
									<>
										{/* İlan Ver */}
										<ButtonLink
											href='/listings/new'
											variant='ghost'>
											<PlusIcon className='w-4 h-4' />
											<span className='hidden sm:inline'>
												{t('nav.newListing')}
											</span>
										</ButtonLink>

										{/* Mesajlar - bildirim zilinin solunda hızlı erişim */}
										<Button
											variant='nav'
											size='icon'
											asChild
											aria-label={t('nav.messages')}
											title={t('nav.messages')}
											className='relative h-9 w-9 rounded-md'>
											<Link href='/messages'>
												<ChatBubbleLeftRightIcon className='w-6 h-6' />
												{unreadMessageCount > 0 && (
													<span className='absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-danger-500 text-inverted text-[10px] font-semibold rounded-full'>
														{unreadMessageCount > 99
															? '99+'
															: unreadMessageCount}
													</span>
												)}
											</Link>
										</Button>

										{/* Notification Bell */}
										<NotificationBell />
									</>
								)}

								{/* Sepet - en sağda, Giriş Yap'ın sağında ikon + yazı */}
								<Button
									variant='nav'
									size='icon'
									asChild
									aria-label={t('nav.cart')}
									title={t('nav.cart')}
									className='relative h-9 w-9 rounded-md'>
									<Link href='/cart'>
										<ShoppingCartIcon className='w-5 h-5' />
										{cartCount > 0 && (
											<span className='absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-surface-elevated text-primary-500 text-xs rounded-full flex items-center justify-center font-semibold'>
												{cartCount > 9 ? '9+' : cartCount}
											</span>
										)}
									</Link>
								</Button>

								<AccountMenu
									showAuthUI={showAuthUI}
									user={user}
									logout={logout}
									unreadMessageCount={unreadMessageCount}
									unreadNotificationsCount={unreadNotificationsCount}
									pendingOffersCount={pendingOffersCount}
									pendingTradesCount={pendingTradesCount}
									wishlistCount={wishlistCount}
									setShowTradesAuthModal={setShowTradesAuthModal}
								/>
							</div>
						</div>
					</Container>
				</div>

				{/* Category bar - directly under the main bar, same header unit */}
				{showCategoryBar && (
					<div className='bg-primary-500 border-b border-primary-600 relative z-40'>
						<Container className='px-4'>
							<CategoryNav />
						</Container>
					</div>
				)}
			</div>

			{/* Auth modals must be outside the sticky block to escape its stacking context */}
			<AuthRequiredModal
				isOpen={showAuthModal}
				onClose={() => setShowAuthModal(false)}
				title={t('nav.loginToCreateListing')}
				message={t('nav.loginToCreateListingMsg')}
				icon={<PlusIcon className='w-10 h-10 text-primary-500' />}
				redirectPath='/listings/new'
			/>

			<AuthRequiredModal
				isOpen={showTradesAuthModal}
				onClose={() => setShowTradesAuthModal(false)}
				title={t('nav.loginForTrades')}
				message={t('trade.tradeRequiresLogin')}
				icon={<ArrowsRightLeftIcon className='w-10 h-10 text-primary-500' />}
				redirectPath='/trades'
			/>
		</>
	);
}
