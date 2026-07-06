/** @format */

export type NavDropdown = 'categories' | 'scales';

export interface NavBarItem {
	label: string;
	href?: string;
	dropdown?: NavDropdown;
}

export const CATEGORY_BAR_ITEMS: Record<'tr' | 'en', NavBarItem[]> = {
	tr: [
		{ label: 'Tüm İlanlar', href: '/listings' },
		{ label: 'Yeni Gelenler', href: '/listings?sortBy=created_desc' },
		{ label: 'Çok Satanlar', href: '/listings?sortBy=view_count_desc' },
		{ label: 'İndirimler', href: '/listings?discountOnly=true' },
		{ label: 'Koleksiyonlar', href: '/collections' },
		{ label: 'Üreticiler', href: '/manufacturers' },
		{ label: 'Kategoriler', dropdown: 'categories' },
		{ label: 'Ölçek', dropdown: 'scales' },
	],
	en: [
		{ label: 'All Listings', href: '/listings' },
		{ label: 'New Arrivals', href: '/listings?sortBy=created_desc' },
		{ label: 'Best Sellers', href: '/listings?sortBy=view_count_desc' },
		{ label: 'On Sale', href: '/listings?discountOnly=true' },
		{ label: 'Collections', href: '/collections' },
		{ label: 'Manufacturers', href: '/manufacturers' },
		{ label: 'Categories', dropdown: 'categories' },
		{ label: 'Scale', dropdown: 'scales' },
	],
};

export const SCALE_FALLBACK = ['1:18', '1:24', '1:43', '1:64', '1:87'];

export interface ManufacturerRef {
	id: string;
	name: string;
}

interface ManufacturerGroup {
	range: string;
	items: ManufacturerRef[];
}

const RANGES: Array<{ range: string; min: string; max: string }> = [
	{ range: 'A-E', min: 'A', max: 'E' },
	{ range: 'F-M', min: 'F', max: 'M' },
	{ range: 'N-S', min: 'N', max: 'S' },
	{ range: 'T-Z', min: 'T', max: 'Z' },
];

/** Bucket manufacturers into alphabetical ranges, sorted, dropping empties. */
export function groupManufacturers(
	manufacturers: ManufacturerRef[],
): ManufacturerGroup[] {
	const groups: ManufacturerGroup[] = RANGES.map((r) => ({
		range: r.range,
		items: [],
	}));

	for (const mfr of manufacturers) {
		const first = mfr.name.charAt(0).toUpperCase();
		const idx = RANGES.findIndex((r) => first >= r.min && first <= r.max);
		if (idx >= 0) groups[idx].items.push({ id: mfr.id, name: mfr.name });
	}

	return groups
		.map((g) => ({
			range: g.range,
			items: g.items.sort((a, b) => a.name.localeCompare(b.name)),
		}))
		.filter((g) => g.items.length > 0);
}
