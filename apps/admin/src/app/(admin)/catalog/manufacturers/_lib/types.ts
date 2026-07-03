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
  createdAt: string;
  updatedAt: string;
}
