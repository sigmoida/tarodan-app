/** @format */

'use client';

import type { ComponentType, SVGProps } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
	UserCircleIcon,
	ShoppingBagIcon,
	TagIcon,
	ArrowsRightLeftIcon,
	CurrencyDollarIcon,
	TicketIcon,
	BanknotesIcon,
	CreditCardIcon,
	ReceiptRefundIcon,
	RectangleStackIcon,
	HeartIcon,
	UserGroupIcon,
	BookmarkIcon,
	ChartBarIcon,
	ChartPieIcon,
	ChatBubbleLeftRightIcon,
	BellIcon,
	BuildingStorefrontIcon,
	ShieldCheckIcon,
	ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@tarodan/ui';
import UserAvatar from '@/components/UserAvatar';
import { useTranslation } from '@/i18n';
import { useProfile } from '../_context/ProfileContext';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

interface NavLink {
	icon: Icon;
	label: string;
	href: string;
	/** Live badge count; 0/undefined hides it. */
	badge?: number;
}

interface NavSection {
	/** Category header; omit for standalone (uncategorized) rows. */
	title?: string;
	links: NavLink[];
}

/**
 * The persistent left nav for `/profile/*`. Categorized to mirror the route-group
 * taxonomy under `profile/` (commerce · finance · collection · insights · messaging
 * · account); `Profil` and `Güvenlik` are standalone (uncategorized) rows. Live
 * active-state highlighting + the badges the profile overview already loads.
 */
export default function ProfileSidebar() {
	const { t } = useTranslation();
	const pathname = usePathname();
	const {
		profile,
		pendingCounts,
		wishlistCount,
		unreadMessagesCount,
		handleLogout,
	} = useProfile();

	const sections: NavSection[] = [
		{
			links: [{ icon: UserCircleIcon, label: t('profile.myProfile'), href: '/profile' }],
		},
		{
			title: 'Alışveriş',
			links: [
				{ icon: ShoppingBagIcon, label: t('nav.myListings'), href: '/profile/listings' },
				{ icon: TagIcon, label: t('order.myOrders'), href: '/profile/orders' },
				{
					icon: ArrowsRightLeftIcon,
					label: t('trade.myTrades'),
					href: '/profile/trades',
					badge: pendingCounts.trades,
				},
				{
					icon: CurrencyDollarIcon,
					label: t('offer.myOffers'),
					href: '/profile/offers',
					badge: pendingCounts.offers,
				},
				{ icon: TicketIcon, label: 'İndirimlerim', href: '/profile/discounts' },
			],
		},
		{
			title: 'Finans',
			links: [
				{ icon: BanknotesIcon, label: 'Ödemelerim', href: '/profile/payments' },
				{ icon: CreditCardIcon, label: 'Ödeme Yöntemleri', href: '/profile/payment-methods' },
				{ icon: ReceiptRefundIcon, label: 'İade Talepleri', href: '/profile/refund-requests' },
			],
		},
		{
			title: 'Koleksiyon',
			links: [
				{ icon: RectangleStackIcon, label: t('collection.myCollections'), href: '/profile/collections' },
				{ icon: HeartIcon, label: t('nav.favorites'), href: '/profile/favorites', badge: wishlistCount },
				{ icon: UserGroupIcon, label: 'Takip Ettiklerim', href: '/profile/following' },
				{ icon: BookmarkIcon, label: 'Kayıtlı Aramalar', href: '/profile/saved-searches' },
			],
		},
		{
			title: 'Analiz',
			links: [
				{ icon: ChartBarIcon, label: 'İstatistikler', href: '/profile/statistics' },
				{ icon: ChartPieIcon, label: 'Analitik', href: '/profile/analytics' },
			],
		},
		{
			title: 'İletişim',
			links: [
				{
					icon: ChatBubbleLeftRightIcon,
					label: t('nav.messages'),
					href: '/profile/messages',
					badge: unreadMessagesCount,
				},
				{ icon: BellIcon, label: t('nav.notifications'), href: '/profile/notifications' },
			],
		},
		{
			title: 'Hesap',
			links: [
				{ icon: BuildingStorefrontIcon, label: 'İşletme', href: '/profile/business' },
			],
		},
		{
			links: [{ icon: ShieldCheckIcon, label: 'Güvenlik', href: '/profile/security' }],
		},
	];

	const isActive = (href: string) =>
		href === '/profile'
			? pathname === '/profile'
			: pathname === href || pathname.startsWith(`${href}/`);

	const membershipTier = profile?.membership?.tier;

	return (
		<nav className='flex flex-col rounded-lg border border-border-subtle bg-surface-elevated overflow-hidden'>
			{/* Identity header */}
			<Link
				href='/profile'
				className='flex items-center gap-3 px-4 py-4 hover:bg-primary-50/50 transition-colors'>
				<UserAvatar
					displayName={profile?.displayName || profile?.email}
					avatarUrl={profile?.avatarUrl}
					size='sm'
					className='!w-11 !h-11 flex-shrink-0'
				/>
				<div className='min-w-0 flex-1'>
					<p className='text-sm font-semibold text-heading truncate'>
						{profile?.displayName || t('nav.account')}
					</p>
					<p className='text-xs text-muted truncate'>{profile?.email}</p>
					{membershipTier && membershipTier.type !== 'free' && (
						<span className='inline-block mt-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-warning-100 text-warning-700 rounded'>
							{membershipTier.name}
						</span>
					)}
				</div>
			</Link>

			<div className='border-t border-border-subtle' />

			<div className='py-2'>
				{sections.map((section, si) => (
					<div key={section.title ?? `section-${si}`} className='mb-1 last:mb-0'>
						{section.title && (
							<p className='px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-subtle'>
								{section.title}
							</p>
						)}
						<ul>
							{section.links.map(({ icon: LinkIcon, label, href, badge }) => {
								const active = isActive(href);
								return (
									<li key={href}>
										<Link
											href={href}
											aria-current={active ? 'page' : undefined}
											className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
												active
													? 'bg-primary-50 text-primary-600 font-medium'
													: 'text-body hover:bg-surface-alt hover:text-heading'
											}`}>
											<LinkIcon className='w-5 h-5 flex-shrink-0' />
											<span className='flex-1 truncate'>{label}</span>
											{badge != null && badge > 0 && (
												<span className='ml-auto min-w-[18px] px-1.5 py-0.5 bg-danger-500 text-inverted text-xs font-semibold rounded-full text-center'>
													{badge > 99 ? '99+' : badge}
												</span>
											)}
										</Link>
									</li>
								);
							})}
						</ul>
					</div>
				))}
			</div>

			<div className='border-t border-border-subtle' />

			<Button
				variant='ghost'
				onClick={handleLogout}
				className='flex w-full items-center justify-start gap-3 rounded-none px-4 py-2.5 text-sm font-normal text-danger-600 hover:bg-danger-50 hover:text-danger-600'>
				<ArrowRightOnRectangleIcon className='w-5 h-5 flex-shrink-0' />
				{t('common.logout')}
			</Button>
		</nav>
	);
}
