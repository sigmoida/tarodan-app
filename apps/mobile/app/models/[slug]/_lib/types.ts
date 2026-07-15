export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  country?: string | null;
}

export interface CarModelDetail {
  id: string;
  name: string;
  slug: string;
  image?: string | null;
  description?: string | null;
  yearStart?: number | null;
  yearEnd?: number | null;
  brand: Brand;
  productCount?: number;
}

export interface Product {
  id: string;
  title: string;
  price: number;
  originalPrice?: number;
  salePrice?: number;
  images?: Array<{ url: string } | string>;
  condition?: string;
  seller?: { displayName?: string };
}
