export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  country?: string | null;
}

export interface CarModel {
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
