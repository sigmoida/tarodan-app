/** @format */

import type { BadgeVariant } from '@tarodan/ui';

/**
 * Single source of truth for refund-request labels shared by the list and the
 * detail page (previously each kept its own copy). Bilingual because the
 * marketplace switches locale; the shared `@tarodan/shared` config is TR-only.
 */

export interface Bilingual {
	tr: string;
	en: string;
}

export interface RefundStatusMeta extends Bilingual {
	variant: BadgeVariant;
}

/** RefundRequestStatus → Badge variant + bilingual label. */
export const refundStatusMeta: Record<string, RefundStatusMeta> = {
	pending_review: { tr: 'İnceleniyor', en: 'Under Review', variant: 'warning' },
	approved: { tr: 'Onaylandı', en: 'Approved', variant: 'info' },
	wait_for_delivery: { tr: 'Teslim Bekleniyor', en: 'Awaiting Delivery', variant: 'info' },
	return_shipment_open: { tr: 'İade Kargosu Hazır', en: 'Return Label Ready', variant: 'info' },
	return_in_transit: { tr: 'İade Yolda', en: 'Return In Transit', variant: 'info' },
	return_delivered: { tr: 'Satıcıya Ulaştı', en: 'Reached Seller', variant: 'info' },
	refunded: { tr: 'İade Tamamlandı', en: 'Refunded', variant: 'success' },
	rejected: { tr: 'Reddedildi', en: 'Rejected', variant: 'danger' },
	disputed: { tr: 'İtiraz / İnceleme', en: 'Under Dispute', variant: 'warning' },
	cancelled: { tr: 'İptal Edildi', en: 'Cancelled', variant: 'secondary' },
};

export function statusMetaOf(status: string): RefundStatusMeta {
	return refundStatusMeta[status] ?? { tr: status, en: status, variant: 'secondary' };
}

/** RefundReason → bilingual label. */
export const refundReasonLabel: Record<string, Bilingual> = {
	changed_mind: { tr: 'Vazgeçtim / Fikrim değişti', en: 'Changed my mind' },
	damaged: { tr: 'Hasarlı geldi', en: 'Damaged' },
	wrong_item: { tr: 'Yanlış ürün geldi', en: 'Wrong item' },
	not_as_described: { tr: 'Açıklamayla uyuşmuyor', en: 'Not as described' },
	missing_parts: { tr: 'Eksik parça', en: 'Missing parts' },
	counterfeit: { tr: 'Sahte ürün', en: 'Counterfeit' },
	lost_in_transit: { tr: 'Kargoda kayboldu', en: 'Lost in transit' },
	other: { tr: 'Diğer', en: 'Other' },
};

export function reasonLabelOf(reason: string): Bilingual {
	return refundReasonLabel[reason] ?? { tr: reason, en: reason };
}

/**
 * Lifecycle phases for the status stepper — aligned with admin's automatic flow
 * (no human "review/approval" step; a request goes straight to the return phase).
 */
export const REFUND_LIFECYCLE: Bilingual[] = [
	{ tr: 'Talep alındı', en: 'Request received' },
	{ tr: 'İade kargosu', en: 'Return shipment' },
	{ tr: 'Ürün yolda', en: 'In transit' },
	{ tr: 'Ürün satıcıda', en: 'At seller' },
	{ tr: 'Para iade edildi', en: 'Refunded' },
];

/** RefundRequestStatus → active phase index (into REFUND_LIFECYCLE). */
export const refundStatusPhase: Record<string, number> = {
	pending_review: 0,
	approved: 1,
	wait_for_delivery: 1,
	return_shipment_open: 1,
	return_in_transit: 2,
	return_delivered: 3,
	refunded: 4,
};

/** Off-flow (terminal) states — shown as a red end-cap in the stepper. */
export const refundTerminalStatuses = new Set(['rejected', 'cancelled']);
