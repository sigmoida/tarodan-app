/** @format */

import { orderStatusConfig } from '@tarodan/ui';

export interface OrderDetail {
	id: string;
	orderNumber: string;
	isMembership?: boolean;
	status: string;
	/** 'iptal' (kargo öncesi) | 'iade' (kargo sonrası). 'iptal' ise UI "İade" yerine "İptal" gösterir. */
	cancellationType?: string | null;
	totalAmount: number;
	amount: number;
	commissionAmount: number;
	shippingCost?: number;
	buyerFeeAmount?: number;
	sellerFeeAmount?: number;
	pricing?: {
		subtotal: number;
		shippingAmount: number;
		buyerFeeAmount: number;
		sellerFeeAmount: number;
		commissionAmount: number;
		taxAmount?: number;
		withholdingTaxAmount?: number;
		totalAmount: number;
		sellerNetAmount: number;
	};
	createdAt: string;
	updatedAt: string;
	deliveredAt?: string | null;
	product: {
		id: string;
		title: string;
		imageUrl?: string;
		status: string;
	} | null;
	items?: Array<{
		id: string;
		product: {
			id: string;
			title: string;
			imageUrl?: string;
		};
		quantity: number;
		price: number;
	}>;
	buyer: {
		id: string;
		displayName: string;
		isVerified?: boolean;
		avatarUrl?: string;
	};
	seller: {
		id: string;
		displayName: string;
		isVerified?: boolean;
		avatarUrl?: string;
	};
	shippingAddress?: {
		id: string;
		title: string;
		addressLine1: string;
		addressLine2?: string;
		district: string;
		city: string;
		postalCode: string;
	};
	shipment?: {
		id: string;
		provider: string;
		trackingNumber: string | null;
		status: string;
		cost?: number;
	};
	activeRefundRequest?: {
		id: string;
		refundNumber: string;
		status: string;
		reason?: string;
		returnTrackingNumber?: string | null;
		returnProvider?: string | null;
		returnStatus?: string | null;
		createdAt: string;
		refundedAt?: string | null;
	} | null;
	cancelledAt?: string | null;
	cancelReason?: string | null;
	cancelCategory?: string | null;
	canReactivate?: boolean;
	isBuyer: boolean;
	isSeller: boolean;
	hasProductRating?: boolean;
	hasSellerRating?: boolean;
	offerId?: string;
	payment?: {
		id: string;
		status: string;
		amount: number;
		provider: string;
		failureReason?: string | null;
	};
}

/** Kurumsal satıcının yüklediği fatura durumu (yükleme yetkisi + yüklenmiş fatura). */
export interface SellerInvoiceStatus {
	invoice: { id: string; fileName: string; uploadedAt: string } | null;
	canUpload: boolean;
	isSeller: boolean;
	isBuyer: boolean;
}

/** eLogo e-Arşiv (gerçek yasal fatura). */
export interface ElogoInvoice {
	id: string;
	invoiceNumber: string;
	label?: string;
}

const orderStatusEnLabels: Record<string, string> = {
	pending_payment: 'Awaiting Payment',
	paid: 'Paid',
	preparing: 'Preparing',
	shipped: 'Shipped',
	delivered: 'Delivered',
	completed: 'Completed',
	cancelled: 'Cancelled',
	refund_requested: 'Refund Requested',
	refunded: 'Refunded',
};

export const getOrderStatusLabel = (status: string, locale: string): string =>
	locale === 'en'
		? orderStatusEnLabels[status] || status
		: orderStatusConfig[status]?.label || status;

// İptal kartında gösterilecek kullanıcı dostu açıklama. Backend stabil bir
// cancelCategory döner; bilinmeyen/serbest-metin sebepler ham haliyle gösterilir.
export function getCancelMessage(
	category: string | null | undefined,
	isBuyer: boolean,
	rawReason: string | null | undefined,
	locale: string,
): string | null {
	const en = locale === 'en';
	switch (category) {
		case 'buyer_cancelled':
			return isBuyer
				? en
					? 'You cancelled this order.'
					: 'Bu siparişi iptal ettiniz.'
				: en
					? 'The buyer cancelled this order.'
					: 'Alıcı bu siparişi iptal etti.';
		case 'payment_timeout':
			return en
				? "This order was automatically cancelled because payment wasn't completed within 24 hours."
				: 'Ödeme 24 saat içinde tamamlanmadığı için sipariş otomatik iptal edildi.';
		case 'seller_no_ship':
			// İade durumu cümlesi BİLEREK yok: aşağıdaki ayrı iade bloğu (refunded →
			// "iade edilmiştir", completed → "aktarılacaktır") tek kaynak. Burada da
			// "iade edilecektir" dersek ikisi yan yana çıkıp çelişiyordu.
			return en
				? "The seller didn't ship within the allowed time, so the order was cancelled."
				: 'Satıcı siparişi süresinde kargoya vermediği için iptal edildi.';
		case 'stockout':
			return en
				? 'This order was cancelled because the product is out of stock.'
				: 'Ürün stoğu tükendiği için bu sipariş iptal edildi.';
		case 'trade_reserved':
			return en
				? 'This order was cancelled because the product was reserved for a trade.'
				: 'Ürün bir takas işlemi için ayrıldığından bu sipariş iptal edildi.';
		case 'bulk_replaced':
			return en
				? 'This order was merged into a new combined order.'
				: 'Bu sipariş yeni bir toplu sipariş ile birleştirildi.';
		case 'admin_buyer_favor':
			return en
				? 'This order was cancelled in your favor by our support team.'
				: 'Bu sipariş sizin lehinize destek ekibimiz tarafından iptal edildi.';
		case 'admin':
			return en
				? 'This order was cancelled by our support team.'
				: 'Bu sipariş destek ekibimiz tarafından iptal edildi.';
		default:
			// other / bilinmeyen: admin'in yazdığı serbest metni ham haliyle göster
			return rawReason && rawReason.trim() ? rawReason : null;
	}
}

// Üyelik/dijital siparişler (sanal ürün + platform satıcısı, "MEM-" sipariş no) fiziksel
// ürün gibi davranmaz: yorum/iade/teslimat adresi/kargo aksiyonları gösterilmez.
export const isMembershipOrder = (o: OrderDetail): boolean =>
	o.isMembership ?? o.orderNumber?.startsWith('MEM-') ?? false;

export const REVIEWABLE_STATUSES = ['completed', 'delivered'];

export const canReview = (o: OrderDetail): boolean =>
	o.isBuyer &&
	!isMembershipOrder(o) &&
	REVIEWABLE_STATUSES.includes(o.status) &&
	(o.hasProductRating === false || o.hasSellerRating === false);

// Kargo öncesi = iptal (anında geri ödeme), kargo sonrası = iade akışı.
// shipment yoksa veya yalnızca pending ise henüz kargolanmamış sayılır.
export const hasShipped = (o: OrderDetail): boolean => {
	const shippedStatuses = [
		'shipped',
		'delivered',
		'awaiting_buyer_confirmation',
		'completed',
	];
	if (shippedStatuses.includes(o.status)) return true;
	const s = o.shipment?.status;
	return !!s && s !== 'pending' && s !== 'cancelled' && s !== 'failed';
};

// Satıcıya escrow ödeme tarihi: teslim + 14 gün iade penceresi + 1 gün grace.
export const computePayoutDate = (o: OrderDetail): Date | null => {
	if (!o.deliveredAt) return null;
	const d = new Date(o.deliveredAt);
	if (Number.isNaN(d.getTime())) return null;
	d.setDate(d.getDate() + 15);
	return d;
};

// 14 GÜNDEN SONRA İADE YOK: teslimden 14 günden fazla geçtiyse iade penceresi
// kapalıdır (backend de reddeder). Teslim edilmemişse pencere henüz başlamadı.
export const isPastRefundWindow = (o: OrderDetail): boolean => {
	if (!o.deliveredAt) return false;
	const d = new Date(o.deliveredAt);
	if (Number.isNaN(d.getTime())) return false;
	const ageDays = (Date.now() - d.getTime()) / (1000 * 3600 * 24);
	return ageDays > 14;
};

export const inferRefundPhase = (
	o: OrderDetail,
): 'preparing' | 'in_cooling_off' | 'past_cooling_off' => {
	const shipmentStatus = o.shipment?.status;
	if (
		(o.status === 'paid' || o.status === 'preparing') &&
		(!shipmentStatus || shipmentStatus === 'pending')
	) {
		return 'preparing';
	}
	if (isPastRefundWindow(o)) return 'past_cooling_off';
	return 'in_cooling_off';
};

/** Sipariş tutarı: totalAmount → amount → 0. */
export const orderAmountOf = (o: OrderDetail): number =>
	Number(o.totalAmount) || Number(o.amount) || 0;

/** Birincil ürün bilgisi (tekil ürün veya ilk kalem). */
export const getProductInfo = (o: OrderDetail) =>
	o.product || o.items?.[0]?.product;
