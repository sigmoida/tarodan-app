export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  parent?: { id: string; name: string };
  children: Pick<Category, "id" | "name" | "slug">[];
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  activeProducts: number;
  passiveProducts: number;
  pendingProducts: number;
  collectionCount: number;
  createdAt: string;
}
