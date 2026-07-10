export interface ProductStats {
  id: string;
  title: string;
  viewCount: number;
  likeCount: number;
  price: number;
  image?: string;
}

export interface CollectionStats {
  id: string;
  name: string;
  viewCount: number;
  likeCount: number;
  coverImage?: string;
  itemCount: number;
}

export interface BusinessStats {
  overview: {
    totalProducts: number;
    activeProducts: number;
    totalViews: number;
    totalLikes: number;
    totalSales: number;
    totalRevenue: number;
    totalCollections: number;
    collectionViews: number;
    collectionLikes: number;
  };
  weekly: {
    views: number;
    likes: number;
  };
  topProducts: {
    byViews: ProductStats[];
    byLikes: ProductStats[];
  };
  topCollections: CollectionStats[];
  company: {
    name: string;
    displayName: string;
    avatarUrl?: string;
    isVerified: boolean;
  };
}

export type TabType = 'overview' | 'products' | 'collections';
