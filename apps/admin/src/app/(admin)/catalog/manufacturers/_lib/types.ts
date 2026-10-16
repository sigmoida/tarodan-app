export interface Manufacturer {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  description?: string;
  website?: string;
  country?: string;
  foundedYear?: number | null;
  isActive: boolean;
  /** Müşterinin görebildiği ilan sayısı (public sayımla aynı kural). */
  listingCount: number;
  createdAt: string;
  updatedAt: string;
}
