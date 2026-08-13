/** @format */

export interface Listing {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  discountPercent?: number | null;
  status: string;
  /** Moderasyon reddi gerekçesi — yalnız rejected'ta dolu, kartta gösterilir. */
  rejectionReason?: string | null;
  isBoosted?: boolean;
  boostedUntil?: string | null;
  images?: Array<{ url: string } | string>;
  createdAt: string;
  viewCount?: number;
  rating?: { average: number | null; count: number };
  category?: { id: string; name: string; slug: string };
  /** Paket boyutu — komisyon/kargo net tahmini ilanın kendi kademesiyle yapılır. */
  shippingPackageTier?: string | null;
}

/** Estimated seller net — single source in the shared commission-preview hook. */
export type { EstimatedNet } from "../../_hooks/useCommissionPreviews";

const PLACEHOLDER = "https://placehold.co/200x200/f3f4f6/9ca3af?text=Ürün";

export const getListingImage = (listing: Listing): string => {
  const first = listing.images?.[0];
  if (!first) return PLACEHOLDER;
  return typeof first === "string"
    ? first
    : ((first as any).cardUrl ??
        (first as any).detailUrl ??
        (first as any).url ??
        PLACEHOLDER);
};

// Money formatting lives in one place — re-exported for local `formatTL` imports.
export { formatPrice as formatTL } from "@/lib/format";
