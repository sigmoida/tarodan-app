/** @format */

export const TIER_NAMES: Record<string, string> = {
	basic: 'Temel Üyelik',
	premium: 'Premium Üyelik',
	business: 'İş Üyeliği',
};

export const TIER_FEATURES: Record<string, string[]> = {
	basic: [
		'50 ilan limiti',
		'6 resim/ilan',
		'Takas yapma',
		'Koleksiyonlar',
		'2 öne çıkan ilan',
	],
	premium: [
		'Sınırsız aktif ilan',
		'15 resim/ilan',
		'Takas yapma',
		'Sınırsız koleksiyon (Digital Garage)',
		'Reklamsız deneyim',
		'3 öne çıkan ilan',
	],
	business: [
		'1000 aktif ilan hakkı',
		'Takas yapma',
		'Sınırsız koleksiyon',
		'Reklamsız deneyim',
		'7/24 öncelikli destek',
		'Özel API erişimi',
	],
};

export const PAID_TIERS = ['basic', 'premium', 'business'] as const;

export interface TierInfo {
	name: string;
	price: number;
	basePrice: number;
	features: string[];
}
