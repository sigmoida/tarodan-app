/** @format */

/** Raw manufacturer row as returned by the API (`/manufacturers`). */
export interface ManufacturerApi {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  country?: string | null;
  description?: string | null;
  website?: string | null;
  foundedYear?: number | null;
  _count?: { products?: number };
}

/** A manufacturer merged with static fallback metadata, ready for the list card. */
export interface ManufacturerCard {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  country: string;
  countryFlag: string;
  founded: number;
  description: string;
  website: string;
  productCount: number;
}

/** A single manufacturer for the detail page (`/manufacturers/slug/:slug`). */
export interface ManufacturerDetail {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  description?: string;
  website?: string;
  country?: string;
  foundedYear?: number;
  productCount: number;
}
