/** @format */

import type { ComponentType, SVGProps } from 'react';
import {
	UserCircleIcon,
	CogIcon,
	ShoppingBagIcon,
	HeartIcon,
	ChatBubbleLeftRightIcon,
	TagIcon,
	ArrowsRightLeftIcon,
	MapPinIcon,
	BanknotesIcon,
	ChartBarIcon,
	StarIcon,
	RectangleStackIcon,
	BellIcon,
	DocumentTextIcon,
	ShieldCheckIcon,
	CurrencyDollarIcon,
	SparklesIcon,
	ClockIcon,
} from '@heroicons/react/24/outline';
import type { PendingCounts } from './types';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
export type Translate = (key: string) => string;

/** The 4 quick-stat cards. `statKey` selects which live count to display. */
export type QuickStatKey = 'listings' | 'orders' | 'favorites' | 'messages';

export interface QuickAction {
	icon: Icon;
	label: string;
	href: string;
	color: string;
	statKey: QuickStatKey;
}

export function buildQuickActions(t: Translate): QuickAction[] {
	return [
		{
			icon: ShoppingBagIcon,
			label: t('nav.myListings'),
			href: '/profile/listings',
			color: 'text-primary-500',
			statKey: 'listings',
		},
		{
			icon: TagIcon,
			label: t('order.myOrders'),
			href: '/orders',
			color: 'text-info-500',
			statKey: 'orders',
		},
		{
			icon: HeartIcon,
			label: t('nav.favorites'),
			href: '/favorites',
			color: 'text-danger-500',
			statKey: 'favorites',
		},
		{
			icon: ChatBubbleLeftRightIcon,
			label: t('nav.messages'),
			href: '/messages',
			color: 'text-success-500',
			statKey: 'messages',
		},
	];
}

export interface MenuItem {
	icon: Icon;
	label: string;
	href: string;
	desc: string;
	badge?: number;
}

export interface MenuSection {
	title: string;
	items: MenuItem[];
}

export function buildMenuSections(
	t: Translate,
	pending: PendingCounts,
): MenuSection[] {
	return [
		{
			title: t('common.shopping'),
			items: [
				{
					icon: ShoppingBagIcon,
					label: t('nav.myListings'),
					href: '/profile/listings',
					desc: 'İlanlarınızı yönetin',
				},
				{
					icon: ChartBarIcon,
					label: t('sellerDashboard.title'),
					href: '/seller/dashboard',
					desc: t('sellerDashboard.subtitle'),
				},
				{
					icon: TagIcon,
					label: t('order.myOrders'),
					href: '/orders',
					desc: 'Sipariş geçmişiniz',
				},
				{
					icon: CurrencyDollarIcon,
					label: t('offer.myOffers'),
					href: '/offers',
					desc: 'Teklif yönetimi',
					badge: pending.offers,
				},
				{
					icon: HeartIcon,
					label: t('nav.favorites'),
					href: '/favorites',
					desc: 'Favori ürünleriniz',
				},
				{
					icon: ArrowsRightLeftIcon,
					label: t('trade.myTrades'),
					href: '/trades',
					desc: 'Takas teklifleriniz',
				},
				{
					icon: SparklesIcon,
					label: t('membership.title'),
					href: '/profile/membership',
					desc: 'Üyelik planınızı yönetin',
				},
			],
		},
		{
			title: t('nav.collections'),
			items: [
				{
					icon: RectangleStackIcon,
					label: t('collection.myCollections'),
					href: '/profile/collections',
					desc: 'Koleksiyonlarınız',
				},
				{
					icon: StarIcon,
					label: 'Beğenilen Koleksiyonlar',
					href: '/collections/liked',
					desc: 'Beğendiğiniz koleksiyonlar',
				},
			],
		},
		{
			title: t('profile.accountSettings'),
			items: [
				{
					icon: UserCircleIcon,
					label: t('profile.editProfile'),
					href: '/profile/edit',
					desc: 'Profil bilgilerinizi düzenleyin',
				},
				{
					icon: MapPinIcon,
					label: t('address.myAddresses'),
					href: '/profile/addresses',
					desc: 'Teslimat adresleriniz',
				},
				{
					icon: BanknotesIcon,
					label: 'Banka Hesabı / IBAN',
					href: '/profile/bank-account',
					desc: "Ödemeleriniz bu IBAN'a aktarılır",
				},
				{
					icon: ClockIcon,
					label: t('payment.history'),
					href: '/profile/payments',
					desc: 'Ödeme geçmişiniz',
				},
				{
					icon: BellIcon,
					label: t('nav.notifications'),
					href: '/notifications',
					desc: 'Bildirim ayarları',
				},
				{
					icon: ShieldCheckIcon,
					label: 'Güvenlik',
					href: '/profile/change-password',
					desc: 'Şifre ve güvenlik ayarları',
				},
			],
		},
		{
			title: t('common.more'),
			items: [
				{
					icon: ChartBarIcon,
					label: t('analytics.analytics'),
					href: '/profile/statistics',
					desc: 'Satış ve görüntüleme istatistikleri',
				},
				{
					icon: DocumentTextIcon,
					label: t('footer.support'),
					href: '/support',
					desc: 'Yardım ve destek',
				},
				{
					icon: CogIcon,
					label: t('nav.settings'),
					href: '/profile/settings',
					desc: 'Uygulama ayarları',
				},
			],
		},
	];
}
