/** @format */

/**
 * A cart row normalized from either an authenticated cart item or a guest
 * (offline) item, so `CartItemCard` renders both from one shape.
 */
export interface CartLineItem {
	key: string;
	productId: string;
	image: string | null;
	title: string;
	sellerName: string;
	price: number;
	originalPrice?: number | null;
	onRemove: () => void;
}
