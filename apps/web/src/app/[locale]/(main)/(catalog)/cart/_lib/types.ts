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
  isAvailable: boolean;
  stockWarning?: string;
  /** Satır adedi (stepper değeri). */
  quantity: number;
  /** Adet tavanı (stok ∧ sipariş-cap'i); yoksa üst sınır uygulanmaz. */
  maxQuantity?: number;
  /** Stepper adet değişimi (auth: backend, misafir: offline store). */
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  /** Ödemeye taşınacak mı — satın alınamaz satırlarda daima false. */
  isSelected: boolean;
  onSelectedChange: () => void;
}
