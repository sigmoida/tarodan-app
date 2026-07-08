export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  parent?: { id: string; name: string };
  children: Category[];
  isActive: boolean;
  productCount: number;
  collectionCount: number;
  createdAt: string;
}
