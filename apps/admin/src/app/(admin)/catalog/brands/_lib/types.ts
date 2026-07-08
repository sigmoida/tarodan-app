export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  description?: string | null;
  website?: string | null;
  country?: string | null;
  foundedYear?: number | null;
  sortOrder?: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}
