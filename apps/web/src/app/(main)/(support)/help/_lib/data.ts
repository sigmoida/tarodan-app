/** @format */

import type { ComponentType, SVGProps } from 'react';
import {
	QuestionMarkCircleIcon,
	ShoppingCartIcon,
	CurrencyDollarIcon,
	ArrowsRightLeftIcon,
	TruckIcon,
	ShieldCheckIcon,
	UserCircleIcon,
	CreditCardIcon,
	ChatBubbleLeftRightIcon,
	DocumentTextIcon,
} from '@heroicons/react/24/outline';

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface HelpCategory {
	title: string;
	description: string;
	icon: Icon;
	color: string;
	links: { href: string; label: string }[];
}

export interface QuickLink {
	href: string;
	label: string;
	icon: Icon;
}

export const HELP_CATEGORIES: HelpCategory[] = [
	{
		title: 'Başlangıç',
		description: "TARODAN'a yeni misiniz? Buradan başlayın.",
		icon: QuestionMarkCircleIcon,
		color: 'bg-info-500',
		links: [
			{ href: '/guides', label: 'Kullanım Kılavuzu' },
			{ href: '/faq', label: 'Sıkça Sorulan Sorular' },
			{ href: '/register', label: 'Üye Olun' },
		],
	},
	{
		title: 'Satın Alma',
		description: 'Ürün arama, sipariş verme ve ödeme işlemleri.',
		icon: ShoppingCartIcon,
		color: 'bg-success-500',
		links: [
			{ href: '/faq#buying', label: 'Nasıl Alışveriş Yapılır?' },
			{ href: '/faq#shipping', label: 'Kargo Bilgileri' },
			{ href: '/faq#buying', label: 'Ödeme Yöntemleri' },
		],
	},
	{
		title: 'Satış Yapma',
		description: 'İlan verme ve satış süreçleri hakkında.',
		icon: CurrencyDollarIcon,
		color: 'bg-warning-500',
		links: [
			{ href: '/guides#selling', label: 'İlan Verme Rehberi' },
			{ href: '/faq#selling', label: 'Komisyon Oranları' },
			{ href: '/membership', label: 'Üyelik Planları' },
		],
	},
	{
		title: 'Takas',
		description: 'Model araba takas işlemleri.',
		icon: ArrowsRightLeftIcon,
		color: 'bg-primary-500',
		links: [
			{ href: '/faq#trade', label: 'Takas Nasıl Çalışır?' },
			{ href: '/guides#trade', label: 'Takas Rehberi' },
			{ href: '/profile/trades', label: 'Takaslarım' },
		],
	},
	{
		title: 'Kargo ve Teslimat',
		description: 'Gönderim ve teslimat süreçleri.',
		icon: TruckIcon,
		color: 'bg-primary-500',
		links: [
			{ href: '/faq#shipping', label: 'Kargo Takibi' },
			{ href: '/faq#shipping', label: 'Teslimat Süreleri' },
			{ href: '/faq#shipping', label: 'Hasarlı Ürün' },
		],
	},
	{
		title: 'Güvenlik',
		description: 'Hesap güvenliği ve gizlilik.',
		icon: ShieldCheckIcon,
		color: 'bg-danger-500',
		links: [
			{ href: '/faq#account', label: 'Şifre İşlemleri' },
			{ href: '/privacy', label: 'Gizlilik Politikası' },
			{ href: '/profile/security', label: 'Güvenlik Ayarları' },
		],
	},
	{
		title: 'Hesap',
		description: 'Profil ve hesap yönetimi.',
		icon: UserCircleIcon,
		color: 'bg-info-500',
		links: [
			{ href: '/profile', label: 'Profil Düzenleme' },
			{ href: '/profile', label: 'Adres Yönetimi' },
			{ href: '/faq#account', label: 'Hesap Silme' },
		],
	},
	{
		title: 'Ödeme',
		description: 'Ödeme ve iade işlemleri.',
		icon: CreditCardIcon,
		color: 'bg-success-500',
		links: [
			{ href: '/faq#buying', label: 'Ödeme Yöntemleri' },
			{ href: '/profile/payments', label: 'Ödeme Geçmişi' },
			{ href: '/contact', label: 'İade Talebi' },
		],
	},
];

export const POPULAR_TOPICS: { q: string; href: string }[] = [
	{ q: 'İlk satışımı nasıl yaparım?', href: '/guides#selling' },
	{ q: '500 TL üzeri ücretsiz kargo nasıl çalışır?', href: '/faq#buying' },
	{ q: 'Takas teklifi nasıl gönderirim?', href: '/faq#trade' },
	{ q: 'Üyelik planları arasındaki farklar nelerdir?', href: '/membership' },
	{ q: 'Siparişimi nasıl takip ederim?', href: '/faq#shipping' },
	{ q: 'İade ve değişim politikası nedir?', href: '/terms' },
];

export const QUICK_LINKS: QuickLink[] = [
	{ href: '/faq', label: 'Sıkça Sorulan Sorular', icon: QuestionMarkCircleIcon },
	{ href: '/guides', label: 'Kullanım Kılavuzları', icon: DocumentTextIcon },
	{ href: '/contact', label: 'İletişim Formu', icon: ChatBubbleLeftRightIcon },
];

export const QUICK_LINKS_EN: QuickLink[] = [
	{ href: '/faq', label: 'Frequently Asked Questions', icon: QuestionMarkCircleIcon },
	{ href: '/guides', label: 'User Guides', icon: DocumentTextIcon },
	{ href: '/contact', label: 'Contact Form', icon: ChatBubbleLeftRightIcon },
];
