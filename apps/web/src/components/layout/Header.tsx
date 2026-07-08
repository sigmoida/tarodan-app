/** @format */

'use client';

import { useState } from 'react';
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
import { withChunkErrorLogging } from '@/lib/withChunkErrorLogging';
import { useTranslation } from '@/i18n/LanguageContext';
import { Container } from './Container';
import HeaderSearch from './header/HeaderSearch';
import AccountMenu from './header/AccountMenu';
import CategoryNav from './header/CategoryNav';
import TopAdsBar from './header/TopAdsBar';
import { useHeaderData } from './header/_hooks/useHeaderData';
import { shouldShowCategoryBar } from './header/_lib/categoryBar';

const AuthRequiredModal = dynamic(
	withChunkErrorLogging(
		() => import('@/components/AuthRequiredModal'),
		'AuthRequiredModal',
	),
	{ ssr: false },
);

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

	const showCategoryBar = shouldShowCategoryBar(pathname);

	return (
		<>
			{/* Slim Top Bar - Image Marquee (50px / 40px mobile) */}
			<TopAdsBar />

			{/* Sticky header block: main bar + category bar together, always visible */}
			<div className='sticky top-0 z-50'>
				{/* Main bar */}
				<div className='bg-primary-500 border-b border-primary-600 shadow-sm'>
					<Container>
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
										<Button
											variant='nav'
											asChild
											className='gap-1.5'>
											<Link href='/listings/new'>
												<PlusIcon className='w-4 h-4' />
												<span className='hidden sm:inline'>
													{t('nav.newListing')}
												</span>
											</Link>
										</Button>

										{/* Mesajlar - bildirim zilinin solunda hızlı erişim */}
										<Button
											variant='nav'
											size='icon'
											asChild
											aria-label={t('nav.messages')}
											title={t('nav.messages')}
											className='relative h-9 w-9 rounded-md'>
											<Link href='/profile/messages'>
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
					<div className='bg-surface border-b border-primary-200 relative z-40'>
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
				redirectPath='/profile/trades'
			/>
		</>
	);
}
