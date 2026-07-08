/** @format */

'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
	UserCircleIcon,
	ChatBubbleLeftRightIcon,
	HeartIcon,
	ShoppingBagIcon,
	TagIcon,
	ArrowRightOnRectangleIcon,
	ArrowsRightLeftIcon,
	CurrencyDollarIcon,
	ChevronDownIcon,
	BellIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import UserAvatar from '@/components/UserAvatar';
import { useTranslation } from '@/i18n/LanguageContext';
import type { HeaderData } from './_hooks/useHeaderData';

/**
 * Owns the account dropdown state: open/close, the container ref used for the
 * outside-click close, and the hover-leave grace timer so the panel doesn't
 * snap shut while the pointer travels between trigger and menu.
 */
function useAccountDropdown() {
	const [showAccountDropdown, setShowAccountDropdown] = useState(false);
	const accountDropdownRef = useRef<HTMLDivElement>(null);
	const accountDropdownLeaveTimer = useRef<ReturnType<
		typeof setTimeout
	> | null>(null);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				accountDropdownRef.current &&
				!accountDropdownRef.current.contains(e.target as Node)
			) {
				setShowAccountDropdown(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const handleMouseEnter = () => {
		if (accountDropdownLeaveTimer.current) {
			clearTimeout(accountDropdownLeaveTimer.current);
			accountDropdownLeaveTimer.current = null;
		}
		setShowAccountDropdown(true);
	};

	const handleMouseLeave = () => {
		accountDropdownLeaveTimer.current = setTimeout(
			() => setShowAccountDropdown(false),
			150,
		);
	};

	return {
		accountDropdownRef,
		showAccountDropdown,
		setShowAccountDropdown,
		handleMouseEnter,
		handleMouseLeave,
	};
}

interface AccountMenuProps {
	showAuthUI: boolean;
	user: HeaderData['user'];
	logout: HeaderData['logout'];
	unreadMessageCount: number;
	unreadNotificationsCount: number;
	pendingOffersCount: number;
	pendingTradesCount: number;
	wishlistCount: number;
	setShowTradesAuthModal: (open: boolean) => void;
}

const MENU_LINK_CLASS =
	'flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-primary-50 hover:text-primary-600';

/**
 * The account dropdown: trigger button + panel (authed profile menu or the
 * guest login/register panel).
 */
export default function AccountMenu({
	showAuthUI,
	user,
	logout,
	unreadMessageCount,
	unreadNotificationsCount,
	pendingOffersCount,
	wishlistCount,
}: AccountMenuProps) {
	const router = useRouter();
	const { t } = useTranslation();
	const {
		accountDropdownRef,
		showAccountDropdown,
		setShowAccountDropdown,
		handleMouseEnter,
		handleMouseLeave,
	} = useAccountDropdown();

	const membershipTier = user?.membershipTier || 'free';
	const close = () => setShowAccountDropdown(false);

	return (
		<div
			ref={accountDropdownRef}
			className='relative'
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}>
			<Button
				variant='nav'
				size='sm'
				onClick={() => setShowAccountDropdown(!showAccountDropdown)}
				aria-expanded={showAccountDropdown}>
				<UserCircleIcon className='w-5 h-5 mr-1' />
				<span className='hidden sm:inline'>
					{showAuthUI
						? user?.displayName || t('nav.account')
						: t('common.login')}
				</span>
				<ChevronDownIcon
					className={`w-4 h-4 transition-transform ${showAccountDropdown ? 'rotate-180' : ''}`}
				/>
			</Button>

			{showAccountDropdown && (
				<div className='absolute right-0 mt-1 w-56 bg-surface-elevated rounded-lg shadow-xl border border-border-subtle py-1 z-[100] overflow-y-auto max-h-[calc(100vh-8rem)]'>
					{showAuthUI ? (
						<>
							{/* İsim / e-posta alanı — profile linkli */}
							<Link
								href='/profile'
								onClick={close}
								className='block px-4 py-3 hover:bg-primary-50/50 transition-colors'>
								<div className='flex items-center gap-3'>
									<UserAvatar
										displayName={user?.displayName || user?.email}
										avatarUrl={user?.avatarUrl}
										size='sm'
										className='!w-10 !h-10 flex-shrink-0'
									/>
									<div className='min-w-0 flex-1'>
										<p className='text-sm font-semibold text-heading truncate'>
											{user?.displayName}
										</p>
										<p className='text-xs text-muted truncate'>{user?.email}</p>
										{membershipTier !== 'free' && (
											<span className='inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-warning-100 text-warning-700 rounded'>
												{membershipTier}
											</span>
										)}
									</div>
								</div>
							</Link>

							<div className='border-t border-border-subtle my-1' />

							{/* Profil / İlanlarım / Siparişlerim / Takaslarım / Tekliflerim */}
							<Link href='/profile' onClick={close} className={MENU_LINK_CLASS}>
								<UserCircleIcon className='w-5 h-5' />
								{t('profile.myProfile')}
							</Link>
							<Link
								href='/profile/listings'
								onClick={close}
								className={MENU_LINK_CLASS}>
								<ShoppingBagIcon className='w-5 h-5' />
								{t('nav.myListings')}
							</Link>
							<Link href='/profile/orders' onClick={close} className={MENU_LINK_CLASS}>
								<TagIcon className='w-5 h-5' />
								{t('order.myOrders')}
							</Link>
							<Link
								href='/profile/trades'
								onClick={close}
								className={MENU_LINK_CLASS}>
								<ArrowsRightLeftIcon className='w-5 h-5' />
								{t('trade.myTrades')}
							</Link>
							<Link href='/profile/offers' onClick={close} className={MENU_LINK_CLASS}>
								<CurrencyDollarIcon className='w-5 h-5' />
								{t('offer.myOffers')}
								{pendingOffersCount > 0 && (
									<span className='ml-auto text-xs text-danger-600'>
										{pendingOffersCount}
									</span>
								)}
							</Link>

							<div className='border-t border-border-subtle my-1' />

							{/* Mesajlar / Favoriler / Bildirimler */}
							<Link
								href='/profile/messages'
								onClick={close}
								className={MENU_LINK_CLASS}>
								<ChatBubbleLeftRightIcon className='w-5 h-5' />
								{t('nav.messages')}
								{unreadMessageCount > 0 && (
									<span className='ml-auto px-1.5 py-0.5 bg-danger-500 text-inverted text-xs rounded-full'>
										{unreadMessageCount > 9 ? '9+' : unreadMessageCount}
									</span>
								)}
							</Link>
							<Link
								href='/profile/favorites'
								onClick={close}
								className={MENU_LINK_CLASS}>
								<HeartIcon className='w-5 h-5' />
								{t('nav.favorites')}
								{wishlistCount > 0 && (
									<span className='ml-auto text-xs text-muted'>
										{wishlistCount}
									</span>
								)}
							</Link>
							<Link
								href='/profile/notifications'
								onClick={close}
								className={MENU_LINK_CLASS}>
								<BellIcon className='w-5 h-5' />
								{t('nav.notifications')}
								{unreadNotificationsCount > 0 && (
									<span className='ml-auto px-1.5 py-0.5 bg-danger-500 text-inverted text-xs rounded-full'>
										{unreadNotificationsCount > 99
											? '99+'
											: unreadNotificationsCount}
									</span>
								)}
							</Link>

							<div className='border-t border-border-subtle my-1' />

							{/* Çıkış Yap */}
							<Button
								variant='ghost'
								onClick={() => {
									logout();
									router.push('/');
									close();
								}}
								className='flex w-full items-center justify-start gap-3 rounded-none px-4 py-2.5 text-sm font-normal text-danger-600 hover:bg-danger-50 hover:text-danger-600'>
								<ArrowRightOnRectangleIcon className='w-5 h-5' />
								{t('common.logout')}
							</Button>
						</>
					) : (
						<div className='p-4 space-y-2'>
							<Button asChild className='w-full'>
								<Link href='/login' onClick={close}>
									{t('common.login')}
								</Link>
							</Button>
							<Button asChild variant='outline' className='w-full'>
								<Link href='/register' onClick={close}>
									{t('common.register')}
								</Link>
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
