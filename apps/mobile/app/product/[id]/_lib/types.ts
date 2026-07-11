// Ürün detay route'unun DTO tipleri.
// Backend şekli gevşek (dinamik alanlar) — kullanılan alanları opsiyonel yazıp
// index signature ile dinamik erişime izin veriyoruz. Sıkılaştırma Faz 4.

export interface ProductSeller {
  id?: string;
  displayName?: string;
  avatarUrl?: string;
  verified?: boolean;
  rating?: number;
  totalSales?: number;
  responseTime?: string;
  [key: string]: any;
}

export interface Product {
  id: string;
  title: string;
  price?: number;
  description?: string;
  condition?: string;
  status?: string | null;
  quantity?: number | null;
  availableQuantity?: number | null;
  maxQuantityPerOrder?: number | null;
  images?: any[];
  seller?: ProductSeller;
  category?: { name?: string } | string;
  year?: number | string;
  viewCount?: number;
  likeCount?: number;
  createdAt?: string;
  rating?: { average?: number; count?: number };
  [key: string]: any;
}

export interface ProductReview {
  id: string;
  score?: number;
  rating?: number;
  title?: string;
  review?: string;
  comment?: string;
  createdAt?: string;
  date?: string;
  user?: { displayName?: string };
  [key: string]: any;
}
