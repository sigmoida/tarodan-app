/** @format */

export interface RefundOrderRef {
	id: string;
	orderNumber: string | null;
	product?: { title?: string | null; images?: string[] } | null;
}

export interface RefundRequest {
	id: string;
	refundNumber: string;
	status: string;
	reason: string;
	description?: string | null;
	amount: number | string;
	requesterId?: string;
	sellerResponse?: string | null;
	evidencePhotoUrls?: string[];
	returnTrackingNumber?: string | null;
	returnProvider?: string | null;
	refundedAt?: string | null;
	createdAt: string;
	order: RefundOrderRef;
}
