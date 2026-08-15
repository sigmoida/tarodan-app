/** @format */

import type { ComponentType, SVGProps } from "react";
import {
  ChartBarIcon,
  CubeIcon,
  RectangleStackIcon,
} from "@heroicons/react/24/outline";
import type { Translate } from "@/types/i18n";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

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

export type BusinessTab = "overview" | "products" | "collections";

export const BUSINESS_TABS = (
  t: Translate,
): {
  value: BusinessTab;
  label: string;
  icon: Icon;
}[] => [
  {
    value: "overview",
    label: t("page.business.types.genelBakis"),
    icon: ChartBarIcon,
  },
  {
    value: "products",
    label: t("page.business.types.urunler"),
    icon: CubeIcon,
  },
  {
    value: "collections",
    label: t("page.business.types.koleksiyonlar"),
    icon: RectangleStackIcon,
  },
];
