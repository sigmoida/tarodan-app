/** @format */

import type { ComponentType, SVGProps } from 'react';
import {
	TruckIcon,
	ArrowsRightLeftIcon,
	CheckCircleIcon,
	ChatBubbleLeftRightIcon,
} from '@heroicons/react/24/outline';

export type Lang = 'tr' | 'en';
type Icon = ComponentType<SVGProps<SVGSVGElement>>;

export interface TradeStep {
	icon: Icon;
	title: string;
	description: string;
}

export interface TradeGuarantee {
	title: string;
	description: string;
}

export interface TradeFaq {
	q: string;
	a: string;
}

export const STEPS: Record<Lang, TradeStep[]> = {
	tr: [
		{
			icon: ChatBubbleLeftRightIcon,
			title: 'Takas Teklifi Gönderin',
			description:
				'İlgilendiğiniz bir ürüne takas teklifi gönderin. Karşı tarafa hangi ürünlerinizi teklif ettiğinizi belirtin.',
		},
		{
			icon: ArrowsRightLeftIcon,
			title: 'Karşılıklı Onay',
			description:
				'Her iki taraf da takası onayladığında süreç başlar. Mesajlaşarak detayları netleştirin.',
		},
		{
			icon: TruckIcon,
			title: 'Güvenli Kargo',
			description:
				'Ürünlerinizi anlaşmalı kargo ile gönderin. Kargo takip numarası sistem üzerinden paylaşılır.',
		},
		{
			icon: CheckCircleIcon,
			title: 'Takas Tamamlandı',
			description:
				'Her iki taraf da ürünü teslim aldığında takas tamamlanır. Karşılıklı değerlendirme yapılır.',
		},
	],
	en: [
		{
			icon: ChatBubbleLeftRightIcon,
			title: 'Send a Trade Offer',
			description:
				'Send a trade offer for a product you are interested in. Specify which of your products you are offering.',
		},
		{
			icon: ArrowsRightLeftIcon,
			title: 'Mutual Approval',
			description:
				'The process begins when both parties approve the trade. Discuss details via messaging.',
		},
		{
			icon: TruckIcon,
			title: 'Secure Shipping',
			description:
				'Ship your products via contracted courier. Tracking numbers are shared through the system.',
		},
		{
			icon: CheckCircleIcon,
			title: 'Trade Completed',
			description:
				'The trade is completed when both parties receive their items. Mutual reviews are exchanged.',
		},
	],
};

export const GUARANTEES: Record<Lang, TradeGuarantee[]> = {
	tr: [
		{
			title: 'Doğrulanmış Üyeler',
			description: 'Takas yapabilmek için e-posta doğrulaması zorunludur.',
		},
		{
			title: 'Kargo Takibi',
			description: 'Tüm kargolar sistem üzerinden takip edilir.',
		},
		{
			title: 'Anlaşmazlık Çözümü',
			description: 'Sorun yaşandığında destek ekibimiz devreye girer.',
		},
		{
			title: 'Değerlendirme Sistemi',
			description:
				'Her takas sonrası puanlama ile güvenilir kullanıcılar ön plana çıkar.',
		},
	],
	en: [
		{
			title: 'Verified Members',
			description: 'Email verification is required to make trades.',
		},
		{
			title: 'Shipment Tracking',
			description: 'All shipments are tracked through the system.',
		},
		{
			title: 'Dispute Resolution',
			description: 'Our support team steps in when issues arise.',
		},
		{
			title: 'Rating System',
			description: 'Post-trade ratings highlight reliable users.',
		},
	],
};

export const FAQ: Record<Lang, TradeFaq[]> = {
	tr: [
		{
			q: 'Takas ücretsiz mi?',
			a: 'Evet, takas işlemi için herhangi bir komisyon alınmaz. Sadece kargo ücretini siz karşılarsınız.',
		},
		{
			q: 'Takas teklifi nasıl gönderilir?',
			a: 'İlgilendiğiniz ürünün sayfasında "Takas Teklifi Gönder" butonuna tıklayarak kendi ürünlerinizden birini seçin.',
		},
		{
			q: 'Karşı taraf teklifi reddederse ne olur?',
			a: 'Hiçbir yükümlülüğünüz olmaz. Farklı bir teklif gönderebilir veya farklı ürünler arayabilirsiniz.',
		},
		{
			q: 'Sorun yaşarsam ne yapmalıyım?',
			a: 'Destek ekibimizle iletişime geçin. Anlaşmazlık çözüm sürecimiz her iki tarafı da koruma altına alır.',
		},
	],
	en: [
		{
			q: 'Is trading free?',
			a: 'Yes, there is no commission for trade transactions. You only pay for shipping.',
		},
		{
			q: 'How do I send a trade offer?',
			a: 'Click "Send Trade Offer" on the product page you are interested in and select one of your products.',
		},
		{
			q: 'What if the other party rejects the offer?',
			a: 'You have no obligation. You can send a different offer or browse other products.',
		},
		{
			q: 'What should I do if there is a problem?',
			a: 'Contact our support team. Our dispute resolution process protects both parties.',
		},
	],
};
