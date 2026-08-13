import type { PublicIdentity } from "./user";

export enum ProductStatus {
  DRAFT = "DRAFT",
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  SOLD = "SOLD",
  RESERVED = "RESERVED",
  INACTIVE = "INACTIVE",
  REJECTED = "REJECTED",
}

export enum ProductCondition {
  NEW = "NEW",
  LIKE_NEW = "LIKE_NEW",
  GOOD = "GOOD",
  FAIR = "FAIR",
  POOR = "POOR",
}

export interface Product {
  id: string;
  sellerId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  condition: ProductCondition;
  status: ProductStatus;
  images: string[];
  isTradeEnabled: boolean;
  tradePreferences?: string;
  quantity: number;
  brand?: string;
  model?: string;
  tags: string[];
  viewCount: number;
  favoriteCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductWithSeller extends Product {
  seller: PublicIdentity & {
    rating?: number;
    ratingCount: number;
  };
  category: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  children?: Category[];
  productCount: number;
}

export interface CreateProductDto {
  name: string;
  description: string;
  price: number;
  categoryId: string;
  condition: ProductCondition;
  images: string[];
  isTradeEnabled?: boolean;
  tradePreferences?: string;
  quantity?: number;
  brand?: string;
  model?: string;
  tags?: string[];
}

export type UpdateProductDto = Partial<CreateProductDto>;

export interface ProductQueryDto {
  page?: number;
  limit?: number;
  categoryId?: string;
  categorySlug?: string;
  sellerId?: string;
  status?: ProductStatus;
  condition?: ProductCondition;
  minPrice?: number;
  maxPrice?: number;
  isTradeEnabled?: boolean;
  search?: string;
  sortBy?: "price" | "createdAt" | "viewCount" | "favoriteCount";
  sortOrder?: "asc" | "desc";
}

export interface PaginatedProducts {
  data: ProductWithSeller[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
