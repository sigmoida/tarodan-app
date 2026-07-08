/** @format */

// Card brand detection + presentation helpers (no external logo deps).

/** Sentinel for the "pay with a new card" radio option. */
export const NEW_CARD = '__new__';

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'troy' | 'unknown';

export function detectBrand(num: string): CardBrand {
	const n = num.replace(/\D/g, '');
	if (/^4/.test(n)) return 'visa';
	if (/^(5[1-5]|22[2-9]|2[3-6]|27[01]|2720)/.test(n)) return 'mastercard';
	if (/^3[47]/.test(n)) return 'amex';
	if (/^9792/.test(n)) return 'troy';
	return 'unknown';
}

/** Map a saved card's textual brand label to a brand key. */
export function brandFromLabel(label?: string | null): CardBrand {
	const s = (label || '').toLowerCase();
	if (s.includes('visa')) return 'visa';
	if (s.includes('master')) return 'mastercard';
	if (s.includes('amex') || s.includes('express')) return 'amex';
	if (s.includes('troy')) return 'troy';
	return 'unknown';
}

export function formatCardNumber(num: string, brand: CardBrand): string {
	const n = num.replace(/\D/g, '');
	if (brand === 'amex') {
		return [n.slice(0, 4), n.slice(4, 10), n.slice(10, 15)].filter(Boolean).join(' ');
	}
	return (n.match(/.{1,4}/g) || []).join(' ');
}

/** Split a raw MMYY string into its display parts. */
export const parseExp = (raw: string) => ({
	month: raw.slice(0, 2),
	year: raw.slice(2, 4),
});

export const BRAND_LABEL: Record<CardBrand, string> = {
	visa: 'VISA',
	mastercard: 'Mastercard',
	amex: 'AMEX',
	troy: 'TROY',
	unknown: '',
};

export const BRAND_GRADIENT: Record<CardBrand, string> = {
	visa: 'from-[#1a1f71] via-[#243b8f] to-[#0b1b54]',
	mastercard: 'from-[#2b2b2f] via-[#3a2b25] to-[#101013]',
	amex: 'from-[#2e77bc] via-[#1f5e9e] to-[#103a6b]',
	troy: 'from-[#0090b8] via-[#00748f] to-[#00485a]',
	unknown: 'from-slate-700 via-slate-800 to-slate-900',
};
