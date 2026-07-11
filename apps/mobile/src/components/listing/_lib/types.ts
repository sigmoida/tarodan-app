// ---------------------------------------------------------------------------
// ListingForm — route-local DTO / prop types
// ---------------------------------------------------------------------------
export interface Category {
  id: string;
  name: string;
  slug: string;
  children?: Category[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
}

export interface CarModel {
  id: string;
  name: string;
  slug: string;
  brand?: { slug: string };
}

export interface Manufacturer {
  id: string;
  name: string;
  slug: string;
}

export interface MaterialOption {
  slug: string;
  label: string;
}

export interface ListingLimits {
  currentCount: number;
  maxListings: number;
  canCreateListing: boolean;
  isPremium: boolean;
  membershipTier: string;
  remainingListings: number;
}

export interface CommissionPreview {
  sellerFeeAmount: number;
  sellerNetAmount: number;
}

export type AttrGroup = {
  slug: string;
  name: string;
  manufacturerSlug: string | null;
  isRequired: boolean;
  attributes: Array<{ slug: string; label: string; color?: string | null }>;
};

export interface ListingFormProps {
  /** create → POST /products, edit → PATCH /products/:id */
  mode: 'create' | 'edit';
  /** Required when mode === 'edit'. */
  productId?: string;
}
