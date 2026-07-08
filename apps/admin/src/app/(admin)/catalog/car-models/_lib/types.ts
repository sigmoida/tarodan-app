export interface Brand {
  id: string;
  name: string;
  slug?: string;
}

export interface CarModel {
  id: string;
  name: string;
  slug: string;
  brandId: string;
  yearStart?: number | null;
  yearEnd?: number | null;
  isActive: boolean;
  brand?: { id: string; name: string };
}
