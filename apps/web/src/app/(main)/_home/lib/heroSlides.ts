/** @format */

export interface HeroSlide {
	/** Supports `\n` for a manual line break (rendered via `whitespace-pre-line`). */
	title: string;
	subtitle: string;
	cta1: { label: string; href: string };
	cta2: { label: string; href: string };
	image: string;
	/** true → image on the right, text on the left; false → the reverse. */
	imageRight: boolean;
}

/** Bilingual hero slides for the storefront landing slider. */
export const HERO_SLIDES: Record<'tr' | 'en', HeroSlide[]> = {
	tr: [
		{
			title: "Türkiye'nin En Büyük\nDiecast Pazaryeri",
			subtitle:
				'Diecast modelleri satın alın, satın ve takas edin. Dijital Garajınızı oluşturun ve koleksiyonunuzu sergileyin.',
			cta1: { label: 'Koleksiyonları Keşfet', href: '/collections' },
			cta2: { label: 'Pazaryerini İncele', href: '/listings' },
			image: '/photos/hero/hero-marketplace.png',
			imageRight: true,
		},
		{
			title: 'Premium Hot Wheels\nKoleksiyonları',
			subtitle:
				'Fast & Furious, Formula 1 ve daha fazlası. Nadir bulunan modelleri keşfedin.',
			cta1: { label: 'Hot Wheels Keşfet', href: '/listings?manufacturer=Hot Wheels' },
			cta2: { label: 'Tüm Markalar', href: '/listings' },
			image: '/photos/hero/hero-hot-wheels.png',
			imageRight: false,
		},
		{
			title: 'Güvenli Takas\nSistemi',
			subtitle:
				'Koleksiyonlarınızı diğer koleksiyonerlerle güvenle takas edin. Her iki taraf için korumalı sistem.',
			cta1: { label: 'Takasa Başla', href: '/profile/trades' },
			cta2: { label: 'Nasıl Çalışır?', href: '/guvenli-takas' },
			image: '/photos/hero/hero-trading.png',
			imageRight: true,
		},
	],
	en: [
		{
			title: "Turkey's Largest\nDiecast Marketplace",
			subtitle:
				'Buy, sell, and trade diecast models. Create your Digital Garage and showcase your collection.',
			cta1: { label: 'Explore Collections', href: '/collections' },
			cta2: { label: 'Browse Marketplace', href: '/listings' },
			image: '/photos/hero/hero-marketplace.png',
			imageRight: true,
		},
		{
			title: 'Premium Hot Wheels\nCollections',
			subtitle: 'Fast & Furious, Formula 1 and more. Discover rare models.',
			cta1: { label: 'Explore Hot Wheels', href: '/listings?manufacturer=Hot Wheels' },
			cta2: { label: 'All Brands', href: '/listings' },
			image: '/photos/hero/hero-hot-wheels.png',
			imageRight: false,
		},
		{
			title: 'Secure Trading\nSystem',
			subtitle:
				'Trade your collections with other collectors safely. Protected system for both parties.',
			cta1: { label: 'Start Trading', href: '/profile/trades' },
			cta2: { label: 'How It Works?', href: '/guvenli-takas' },
			image: '/photos/hero/hero-trading.png',
			imageRight: true,
		},
	],
};
