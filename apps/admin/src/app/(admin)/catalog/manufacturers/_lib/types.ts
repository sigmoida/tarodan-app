import type { ListingCounts } from "../../_lib/listingCountColumns";

export interface Manufacturer extends ListingCounts {
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
