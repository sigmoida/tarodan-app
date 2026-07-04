"use client";

import { useState, useEffect } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import OptimizedImage, {
  getOptimizedImageUrl,
  isValidImageSrc,
} from "@/components/OptimizedImage";
import {
  ArrowRightIcon,
  HandThumbUpIcon,
  StarIcon,
  CheckBadgeIcon,
} from "@heroicons/react/24/solid";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  TagIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import { api, listingsApi, manufacturersApi } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import {
  getProductEffectivePrice,
  isProductOnSaleDisplay,
  getProductOriginalPriceForDisplay,
} from "@/lib/productPrice";
import { useAuthStore } from "@/stores/authStore";
import dynamic from "next/dynamic";
import { withChunkErrorLogging } from "@/lib/dynamicWithLogging";
import { useTranslation } from "@/i18n/LanguageContext";
import ProductLayoutSelector, {
  ProductLayout,
} from "@/components/ProductLayoutSelector";

import HeroSlider from "@/components/home/HeroSlider";
import TrustBadges from "@/components/home/TrustBadges";
import UserAvatar from "@/components/UserAvatar";

import {
  Button,
  ButtonLink,
  EmptyState,
  ProductBadge,
  ProductCard,
  SectionHeader,
  SkeletonCard,
} from "@/components/ui";

const AuthRequiredModal = dynamic(
  withChunkErrorLogging(
    () => import("@/components/AuthRequiredModal"),
    "AuthRequiredModal",
  ),
  { ssr: false },
);

interface Product {
  id: string;
  title: string;
  price: number;
  oldPrice?: number | null;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  discountPercent?: number | null;
  images?:
    | Array<{
        id?: string;
        url?: string;
        cardUrl?: string;
        detailUrl?: string;
        sortOrder?: number;
      }>
    | string[];
  brand?: string;
  scale?: string;
  isTradeEnabled?: boolean;
  trade_available?: boolean;
  isBoosted?: boolean;
  viewCount: number;
  likeCount: number;
  createdAt?: string;
  condition?: string;
  isPreorder?: boolean;
  isLimited?: boolean;
  editionNumber?: string;
  rating?: { average: number | null; count: number };
}

interface FeaturedCollector {
  id: string;
  name: string;
  description?: string;
  coverImageUrl?: string;
  viewCount: number;
  likeCount: number;
  itemCount: number;
  user: {
    id: string;
    displayName: string;
    avatarUrl?: string;
    bio?: string;
    isVerified?: boolean;
  };
  items: Array<{
    id: string;
    productId: string;
    productTitle: string;
    productPrice: number;
    productImage?: string;
  }>;
}

interface FeaturedBusiness {
  id: string;
  displayName: string;
  companyName?: string;
  avatarUrl?: string;
  bio?: string;
  isVerified: boolean;
  stats: {
    totalProducts: number;
    totalViews: number;
    totalLikes: number;
    totalSales: number;
    averageRating: number;
    totalRatings: number;
  };
  collections: Array<{
    id: string;
    name: string;
    viewCount: number;
    likeCount: number;
    coverImageUrl?: string;
    itemCount: number;
    previewItems: Array<{
      id: string;
      productTitle: string;
      productPrice: number;
      productImage?: string;
    }>;
  }>;
  products: Array<{
    id: string;
    title: string;
    price: number;
    viewCount: number;
    likeCount: number;
    image?: string;
  }>;
}

const BRANDS = [
  {
    name: "Hot Wheels",
    logoUrl: "/photos/logolar/2158430f294b152f30824d6bb1ac7bf9.jpg",
    desc: "Mattel",
    scale: "1:64",
  },
  {
    name: "Matchbox",
    logoUrl: "/photos/logolar/images.png",
    desc: "Mattel",
    scale: "1:64",
  },
  {
    name: "Tamiya",
    logoUrl: "/photos/logolar/tamiya-logo-png_seeklogo-324507.png",
    desc: "Japan",
    scale: "1:24",
  },
  {
    name: "AUTOart",
    logoUrl: "/photos/logolar/download.png",
    desc: "Premium",
    scale: "1:18",
  },
  {
    name: "Kyosho",
    logoUrl: "/photos/logolar/Kyosho_corp_logo.png",
    desc: "Japan",
    scale: "1:18",
  },
  {
    name: "Maisto",
    logoUrl: "/photos/logolar/maisto-logo.png",
    desc: "May Cheong",
    scale: "1:18",
  },
  {
    name: "Bburago",
    logoUrl: "/photos/logolar/Bburago_Logo.png",
    desc: "Italy",
    scale: "1:18",
  },
  {
    name: "Greenlight",
    logoUrl: "/photos/logolar/Greenlight_collectibles_logo.png",
    desc: "USA",
    scale: "1:64",
  },
  {
    name: "Minichamps",
    logoUrl: "/photos/logolar/minichamps_logo.png",
    desc: "Germany",
    scale: "1:43",
  },
  {
    name: "MINI GT",
    logoUrl: "/photos/logolar/mini-gt-logo-png_seeklogo-523421.png",
    desc: "TSM",
    scale: "1:64",
  },
  {
    name: "Tomica",
    logoUrl: "/photos/logolar/Tomica_brand_textlogo.png",
    desc: "Takara Tomy",
    scale: "1:64",
  },
  {
    name: "Majorette",
    logoUrl: "/photos/logolar/majorette-logo-png_seeklogo-492958.png",
    desc: "Simba",
    scale: "1:64",
  },
  {
    name: "GT Spirit",
    logoUrl: "/photos/logolar/GT-Spirit-Logo.webp",
    desc: "France",
    scale: "1:18",
  },
  {
    name: "CMC",
    logoUrl: "/photos/logolar/cmc_logo-640x320.jpg",
    desc: "Germany",
    scale: "1:18",
  },
  {
    name: "Norev",
    logoUrl: "/photos/logolar/5bc0b46797d85-thumbnail.jpg",
    desc: "France",
    scale: "1:18",
  },
  {
    name: "Schuco",
    logoUrl:
      "/photos/logolar/logo-bmw-schuco-modell-car-toy-diecast-toy-model-car-model-building-siku-toys-png-clipart.jpg",
    desc: "Germany",
    scale: "1:43",
  },
];

const DEMO_PRODUCT_IMAGES = [
  "https://placehold.co/400x400/fff3e0/e65100?text=Hot+Wheels+Skyline",
  "https://placehold.co/400x400/e3f2fd/1565c0?text=AUTOart+GT-R",
  "https://placehold.co/400x400/fce4ec/c62828?text=Ferrari+F40",
  "https://placehold.co/400x400/e8f5e9/2e7d32?text=Porsche+911",
  "https://placehold.co/400x400/f3e5f5/6a1b9a?text=Lamborghini+SV",
  "https://placehold.co/400x400/fff8e1/f57f17?text=McLaren+P1",
];

const DEMO_COLLECTIONS: FeaturedCollector[] = [
  {
    id: "demo-1",
    name: "JDM Legends Koleksiyonu",
    description:
      "Japon otomobil efsaneleri - Skyline, Supra, RX-7 ve daha fazlası",
    viewCount: 3250,
    likeCount: 187,
    itemCount: 24,
    user: { id: "demo-u1", displayName: "TunerKing34", isVerified: true },
    items: [
      {
        id: "d1",
        productId: "",
        productTitle: "Nissan Skyline GT-R R34",
        productPrice: 850,
        productImage: "https://placehold.co/200x200/e3f2fd/1565c0?text=R34",
      },
      {
        id: "d2",
        productId: "",
        productTitle: "Toyota Supra MK4",
        productPrice: 720,
        productImage: "https://placehold.co/200x200/fff3e0/e65100?text=Supra",
      },
      {
        id: "d3",
        productId: "",
        productTitle: "Mazda RX-7 FD",
        productPrice: 650,
        productImage: "https://placehold.co/200x200/fce4ec/c62828?text=RX-7",
      },
      {
        id: "d4",
        productId: "",
        productTitle: "Honda NSX",
        productPrice: 900,
        productImage: "https://placehold.co/200x200/e8f5e9/2e7d32?text=NSX",
      },
    ],
  },
  {
    id: "demo-2",
    name: "Ferrari Rosso Corsa",
    description: "Kırmızının 50 tonu - En özel Ferrari modelleri",
    viewCount: 4100,
    likeCount: 231,
    itemCount: 18,
    user: { id: "demo-u2", displayName: "ScuderiaCollector", isVerified: true },
    items: [
      {
        id: "d5",
        productId: "",
        productTitle: "Ferrari F40",
        productPrice: 1200,
        productImage: "https://placehold.co/200x200/fce4ec/c62828?text=F40",
      },
      {
        id: "d6",
        productId: "",
        productTitle: "Ferrari 250 GTO",
        productPrice: 2500,
        productImage: "https://placehold.co/200x200/ffebee/b71c1c?text=250+GTO",
      },
      {
        id: "d7",
        productId: "",
        productTitle: "Ferrari SF90",
        productPrice: 980,
        productImage: "https://placehold.co/200x200/fce4ec/d32f2f?text=SF90",
      },
      {
        id: "d8",
        productId: "",
        productTitle: "Ferrari Testarossa",
        productPrice: 850,
        productImage:
          "https://placehold.co/200x200/ffcdd2/c62828?text=Testarossa",
      },
    ],
  },
  {
    id: "demo-3",
    name: "German Engineering",
    description: "Porsche, BMW, Mercedes - Alman mühendisliğinin en iyileri",
    viewCount: 2870,
    likeCount: 156,
    itemCount: 32,
    user: { id: "demo-u3", displayName: "AutoBahnRacer", isVerified: false },
    items: [
      {
        id: "d9",
        productId: "",
        productTitle: "Porsche 911 GT3",
        productPrice: 780,
        productImage: "https://placehold.co/200x200/e8f5e9/2e7d32?text=911+GT3",
      },
      {
        id: "d10",
        productId: "",
        productTitle: "BMW M3 E30",
        productPrice: 650,
        productImage: "https://placehold.co/200x200/e3f2fd/1565c0?text=M3+E30",
      },
      {
        id: "d11",
        productId: "",
        productTitle: "Mercedes 300SL",
        productPrice: 1100,
        productImage: "https://placehold.co/200x200/f5f5f5/616161?text=300SL",
      },
      {
        id: "d12",
        productId: "",
        productTitle: "Audi Quattro",
        productPrice: 550,
        productImage: "https://placehold.co/200x200/fff8e1/f57f17?text=Quattro",
      },
    ],
  },
];

const DEMO_FEATURED_COLLECTOR: FeaturedCollector = {
  id: "demo-fc",
  name: "Ultimate Supercar Garage",
  description:
    "Dünyanın en nadir ve değerli süper otomobil modellerinin koleksiyonu. 1:18 ölçek premium modeller.",
  viewCount: 8750,
  likeCount: 542,
  itemCount: 45,
  user: {
    id: "demo-fcu",
    displayName: "SupercarHunter",
    avatarUrl: undefined,
    bio: "Premium diecast koleksiyoner",
    isVerified: true,
  },
  items: [
    {
      id: "dfc1",
      productId: "",
      productTitle: "Bugatti Chiron",
      productPrice: 1450,
      productImage: "https://placehold.co/200x200/e3f2fd/0d47a1?text=Chiron",
    },
    {
      id: "dfc2",
      productId: "",
      productTitle: "McLaren P1",
      productPrice: 1200,
      productImage: "https://placehold.co/200x200/fff8e1/f57f17?text=P1",
    },
    {
      id: "dfc3",
      productId: "",
      productTitle: "Pagani Huayra",
      productPrice: 1800,
      productImage: "https://placehold.co/200x200/f3e5f5/6a1b9a?text=Huayra",
    },
  ],
};

const DEMO_COMPANY: FeaturedBusiness = {
  id: "demo-biz",
  displayName: "DiecastTR Premium",
  companyName: "DiecastTR Premium Mağaza",
  bio: "Türkiye'nin lider diecast model otomobil mağazası. Orijinal ve lisanslı ürünler.",
  isVerified: true,
  stats: {
    totalProducts: 156,
    totalViews: 45200,
    totalLikes: 3200,
    totalSales: 890,
    averageRating: 4.8,
    totalRatings: 324,
  },
  collections: [],
  products: [
    {
      id: "dbp1",
      title: "AUTOart Nissan GT-R R35",
      price: 1350,
      viewCount: 2100,
      likeCount: 145,
      image: "https://placehold.co/200x200/e3f2fd/1565c0?text=GT-R+R35",
    },
    {
      id: "dbp2",
      title: "CMC Ferrari 250 GTO",
      price: 4500,
      viewCount: 3400,
      likeCount: 267,
      image: "https://placehold.co/200x200/fce4ec/c62828?text=250+GTO",
    },
    {
      id: "dbp3",
      title: "Kyosho Lamborghini Countach",
      price: 980,
      viewCount: 1800,
      likeCount: 98,
      image: "https://placehold.co/200x200/fff8e1/f57f17?text=Countach",
    },
    {
      id: "dbp4",
      title: "Minichamps Porsche 911 GT3",
      price: 1150,
      viewCount: 2500,
      likeCount: 176,
      image: "https://placehold.co/200x200/e8f5e9/2e7d32?text=911+GT3",
    },
    {
      id: "dbp5",
      title: "GT Spirit BMW M3 E30",
      price: 890,
      viewCount: 1950,
      likeCount: 132,
      image: "https://placehold.co/200x200/e3f2fd/0d47a1?text=M3+E30",
    },
  ],
};

export default function Home() {
  const { isAuthenticated } = useAuthStore();
  const { t, locale } = useTranslation();
  const [discountedProducts, setDiscountedProducts] = useState<Product[]>([]);
  const [isLoadingDiscounted, setIsLoadingDiscounted] = useState(false);
  const [tradeProducts, setTradeProducts] = useState<Product[]>([]);
  const [isLoadingTrade, setIsLoadingTrade] = useState(false);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [isLoadingFeatured, setIsLoadingFeatured] = useState(false);
  const [currentCollectionIndex, setCurrentCollectionIndex] = useState(0);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalConfig, setAuthModalConfig] = useState({
    title: t("auth.authRequired"),
    message: t("auth.authRequiredMessage"),
    icon: null as React.ReactNode | null,
    redirectPath: undefined as string | undefined,
  });
  const [productLayout, setProductLayout] = useState<ProductLayout>("grid-4");

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: apiCollections = [], isLoading: isLoadingCollections } =
    useQuery({
      queryKey: ["home", "topCollections", { limit: 20 }],
      queryFn: async () => {
        const response = await api.get<FeaturedCollector[]>(
          "/users/top-collections",
          { params: { limit: 20 } },
        );
        return Array.isArray(response.data) ? response.data : [];
      },
      meta: { page: "home", section: "topCollections" },
    });
  const topCollections =
    apiCollections.length > 0 ? apiCollections : DEMO_COLLECTIONS;

  const {
    data: apiFeaturedCollector = null,
    isLoading: isLoadingFeaturedCollector,
  } = useQuery({
    queryKey: ["home", "featuredCollector"],
    queryFn: async () => {
      const response = await api.get<FeaturedCollector | null>(
        "/users/featured-collector",
      );
      return response.data ?? null;
    },
    meta: { page: "home", section: "featuredCollector" },
  });
  const featuredCollector = apiFeaturedCollector;

  const {
    data: bestSellersData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingBestSellers,
  } = useInfiniteQuery({
    queryKey: ["home", "bestSellers", "popular"],
    queryFn: async ({ pageParam = 1 }) => {
      const response = await listingsApi.getPopular({
        limit: 20,
        page: pageParam,
      });
      const raw = response?.data;
      const products = Array.isArray(raw)
        ? raw
        : (raw?.data ?? raw?.products ?? []);
      return Array.isArray(products) ? products : [];
    },
    getNextPageParam: (_lastPage, allPages) =>
      _lastPage.length < 20 ? undefined : allPages.length + 1,
    initialPageParam: 1,
    refetchOnMount: "always",
    meta: { page: "home", section: "bestSellers" },
  });
  const bestSellers = bestSellersData?.pages.flatMap((p) => p) ?? [];

  const { data: apiCompanyOfWeek = null, isLoading: isLoadingCompany } =
    useQuery({
      queryKey: ["home", "featuredBusiness"],
      queryFn: async () => {
        const response = await api.get<FeaturedBusiness | null>(
          "/users/featured-business",
        );
        return response.data ?? null;
      },
      meta: { page: "home", section: "featuredBusiness" },
    });
  const companyOfWeek = apiCompanyOfWeek ?? DEMO_COMPANY;

  const { data: apiManufacturers = [] } = useQuery({
    queryKey: ["home", "manufacturers"],
    queryFn: async () => {
      const res = await manufacturersApi.findAll();
      const raw = res.data;
      const data = Array.isArray(raw) ? raw : (raw?.data ?? []);
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60 * 1000,
    refetchOnMount: "always",
    meta: { page: "home", section: "manufacturers" },
  });

  const apiNamesSet = new Set(
    (apiManufacturers as any[]).map((m: any) => m.name?.toLowerCase?.() || ""),
  );
  const fallbackBrands = BRANDS.filter(
    (b) => !apiNamesSet.has(b.name.toLowerCase()),
  );
  const marqueeItems = [
    ...(apiManufacturers as any[]).map((m: any) => {
      const fromBrands = BRANDS.find(
        (b) => b.name.toLowerCase() === (m.name || "").toLowerCase(),
      );
      return {
        name: m.name,
        logoUrl: m.logo || fromBrands?.logoUrl || "",
        desc: m.description ?? fromBrands?.desc ?? "",
      };
    }),
    ...fallbackBrands,
  ];
  const marqueeItemsToShow = marqueeItems.length > 0 ? marqueeItems : BRANDS;

  const featuredCollectorToShow: FeaturedCollector | null =
    featuredCollector ??
    (topCollections.length > 0 ? topCollections[0] : DEMO_FEATURED_COLLECTOR);

  useEffect(() => {
    fetchDiscountedProducts();
    fetchTradeProducts();
    fetchFeaturedProducts();
  }, []);

  const fetchFeaturedProducts = async () => {
    setIsLoadingFeatured(true);
    try {
      const response = await listingsApi.getAll({
        limit: 20,
        page: 1,
        boostedOnly: true,
        status: "active",
      });
      const raw = response?.data;
      const products = Array.isArray(raw)
        ? raw
        : (raw?.data ?? raw?.products ?? []);
      setFeaturedProducts(Array.isArray(products) ? products : []);
    } catch (error) {
      console.error("Failed to fetch featured products:", error);
    } finally {
      setIsLoadingFeatured(false);
    }
  };

  const fetchTradeProducts = async () => {
    setIsLoadingTrade(true);
    try {
      const response = await listingsApi.getAll({
        limit: 24,
        page: 1,
        tradeOnly: true,
        status: "active",
      });
      const raw = response?.data;
      const products = Array.isArray(raw)
        ? raw
        : (raw?.data ?? raw?.products ?? []);
      setTradeProducts(Array.isArray(products) ? products : []);
    } catch (error) {
      console.error("Failed to fetch trade showcase:", error);
    } finally {
      setIsLoadingTrade(false);
    }
  };

  const fetchDiscountedProducts = async () => {
    setIsLoadingDiscounted(true);
    try {
      const response = await listingsApi.getAll({
        limit: 24,
        page: 1,
        discountOnly: true,
        status: "active",
      });
      const raw = response?.data;
      const products = Array.isArray(raw)
        ? raw
        : (raw?.data ?? raw?.products ?? []);
      // Sadece gerçek indirimli ürünler: oldPrice > price (API bazen %0 veya yanlış fiyat dönebilir)
      const withRealDiscount = (Array.isArray(products) ? products : []).filter(
        (p: Product) => {
          const effective = getProductEffectivePrice(p);
          const original = getProductOriginalPriceForDisplay(p);
          return isProductOnSaleDisplay(p) && original > effective;
        },
      );
      setDiscountedProducts(withRealDiscount);
    } catch (error) {
      console.error("Failed to fetch discounted products:", error);
    } finally {
      setIsLoadingDiscounted(false);
    }
  };

  useEffect(() => {
    if (topCollections.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentCollectionIndex((prev) => (prev + 1) % topCollections.length);
    }, 10000);
    return () => clearInterval(interval);
  }, [topCollections.length]);

  const handleNextCollection = () => {
    if (topCollections.length > 0)
      setCurrentCollectionIndex((prev) => (prev + 1) % topCollections.length);
  };
  const handlePrevCollection = () => {
    if (topCollections.length > 0)
      setCurrentCollectionIndex(
        (prev) => (prev - 1 + topCollections.length) % topCollections.length,
      );
  };

  const getImageUrl = (
    image: any,
    index?: number,
    productTitle?: string,
  ): string => {
    const demoIdx =
      (index ?? Math.floor(Math.random() * DEMO_PRODUCT_IMAGES.length)) %
      DEMO_PRODUCT_IMAGES.length;
    const placeholder = DEMO_PRODUCT_IMAGES[demoIdx];
    return getOptimizedImageUrl(image, placeholder, productTitle, "card");
  };

  const getProductTag = (product: Product): string | null => {
    const daysSinceCreation = product.createdAt
      ? Math.floor(
          (new Date().getTime() - new Date(product.createdAt).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 100;
    if (daysSinceCreation < 7) return locale === "en" ? "New" : "Yeni";
    if (product.viewCount && product.viewCount > 1000)
      return locale === "en" ? "Rare" : "Nadir";
    return null;
  };

  const extractBrandFromTitle = (title: string): string => {
    for (const brand of BRANDS) {
      if (title.toLowerCase().includes(brand.name.toLowerCase()))
        return brand.name;
    }
    return locale === "en" ? "Brand" : "Marka";
  };

  const extractScaleFromTitle = (title: string): string => {
    const m = title.match(/\d+:\d+/);
    return m ? m[0] : "1:18";
  };

  const viewAllLabel = locale === "en" ? "View All" : "Tümünü gör";

  return (
    <div className="min-h-screen bg-surface">
      {/* ── Hero ── */}
      <HeroSlider />

      {/* ── Brands (Marquee) ── */}
      <section className="py-4">
        <div className="relative w-full overflow-hidden">
          <div className="brands-marquee-track flex flex-nowrap items-center gap-6 px-2 sm:px-3">
            {[...marqueeItemsToShow, ...marqueeItemsToShow].map((brand, i) => (
              <Link
                key={`${brand.name}-${i}`}
                href={`/listings?manufacturer=${encodeURIComponent(brand.name)}`}
                className="flex-shrink-0 group"
              >
                <div
                  className="w-24 h-14 sm:w-28 sm:h-16 bg-surface-elevated border border-border hover:border-primary-300 flex items-center justify-center p-2.5 transition-all hover:shadow-sm relative"
                  // position:relative inline — FOUC anında (CSS yüklenmeden) içteki
                  // next/image `fill` viewport'a şişmesin; .relative class'ı CSS
                  // gelene kadar uygulanmıyordu.
                  style={{ position: "relative", borderRadius: "4px" }}
                >
                  {brand.logoUrl ? (
                    <OptimizedImage
                      src={brand.logoUrl}
                      alt={brand.name}
                      fill
                      className="object-contain p-1"
                      sizes="(max-width: 640px) 96px, 112px"
                      unoptimized
                      fallbackSrc={`https://placehold.co/112x64/ffffff/9ca3af?text=${encodeURIComponent(brand.name)}`}
                      logContext={{ page: "home-marquee", brand: brand.name }}
                    />
                  ) : (
                    <span className="text-xs font-semibold text-muted group-hover:text-primary-600 transition-colors text-center leading-tight">
                      {brand.name}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Öne Çıkan Ürünler (boost'lu, yatay kayan şerit — Tümünü Gör YOK) ── */}
      {(isLoadingFeatured || featuredProducts.length > 0) && (
        <section className="py-3">
          <div className="px-3 sm:px-4 lg:px-6">
            <div
              className="bg-surface-elevated border border-border p-3 md:p-5"
              style={{ borderRadius: "4px" }}
            >
              <SectionHeader
                title={locale === "en" ? "Featured" : "Öne Çıkan Ürünler"}
                icon={<span className="text-lg leading-none">🚀</span>}
              />
              <div className="flex gap-3 overflow-x-auto pb-2 px-1 snap-x">
                {isLoadingFeatured ? (
                  [...Array(6)].map((_, i) => (
                    <div key={i} className="flex-shrink-0 w-40">
                      <SkeletonCard />
                    </div>
                  ))
                ) : (
                  featuredProducts.map((product, idx) => (
                    <Link
                      key={product.id}
                      href={`/listings/${product.id}`}
                      className="flex-shrink-0 w-40 block group snap-start"
                    >
                      <div
                        className="overflow-hidden border border-border hover:border-amber-400 hover:shadow-soft transition-all"
                        style={{ borderRadius: "4px" }}
                      >
                        <div className="relative aspect-[4/3] bg-surface-alt">
                          <OptimizedImage
                            src={getImageUrl(product.images?.[0], idx, product.title)}
                            alt={product.title}
                            fill
                            className="object-cover"
                            fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23f3f4f6' width='400' height='300'/%3E%3C/svg%3E"
                            logContext={{ productId: product.id, page: "home-featured" }}
                          />
                          <div className="absolute top-1.5 left-1.5">
                            <span
                              className="text-[10px] font-bold bg-amber-500 text-inverted px-1.5 py-0.5"
                              style={{ borderRadius: "2px" }}
                            >
                              {locale === "en" ? "Sponsored" : "Sponsorlu"}
                            </span>
                          </div>
                        </div>
                        <div className="p-1.5">
                          <h3 className="font-medium text-heading line-clamp-1 text-[11px] leading-tight mb-0.5">
                            {product.title}
                          </h3>
                          <p className="text-xs font-bold text-primary-600">
                            {getProductEffectivePrice(product).toLocaleString("tr-TR", {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}{" "}
                            ₺
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── On Sale ── */}
      <section className="py-3">
        <div className="px-3 sm:px-4 lg:px-6">
          <div
            className="bg-surface-elevated border border-border p-3 md:p-5"
            style={{ borderRadius: "4px" }}
          >
            <SectionHeader
              title={locale === "en" ? "On Sale" : "İndirimdekiler"}
              viewAllHref="/listings?discountOnly=true"
              viewAllLabel={viewAllLabel}
              icon={<TagIcon className="w-5 h-5 text-primary-500" />}
              badge={
                <ProductBadge variant="sale">
                  {locale === "en" ? "Deals" : "Fırsat"}
                </ProductBadge>
              }
            />
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
              {isLoadingDiscounted ? (
                [...Array(6)].map((_, i) => <SkeletonCard key={i} />)
              ) : discountedProducts.length === 0 ? (
                <div className="col-span-full">
                  <EmptyState
                    title={
                      locale === "en"
                        ? "No products on sale"
                        : "İndirimde ürün yok"
                    }
                    description={
                      locale === "en"
                        ? "Check back later!"
                        : "Daha sonra tekrar bakın!"
                    }
                    action={
                      <ButtonLink
                        variant="secondary"
                        size="sm"
                        href="/listings"
                      >
                        {viewAllLabel}
                      </ButtonLink>
                    }
                  />
                </div>
              ) : (
                discountedProducts.slice(0, 12).map((product, idx) => {
                  const discountPct =
                    product.discountPercent ??
                    (isProductOnSaleDisplay(product)
                      ? Math.round(
                          (1 -
                            getProductEffectivePrice(product) /
                              getProductOriginalPriceForDisplay(product)) *
                            100,
                        )
                      : 0);
                  return (
                    <Link
                      key={product.id}
                      href={`/listings/${product.id}`}
                      className={
                        idx < 6
                          ? "block group"
                          : idx < 8
                            ? "hidden sm:block group"
                            : "hidden lg:block group"
                      }
                    >
                      <div
                        className="overflow-hidden border border-border hover:border-primary-400 hover:shadow-soft transition-all"
                        style={{ borderRadius: "4px" }}
                      >
                        <div className="relative aspect-[4/3] bg-surface-alt">
                          <OptimizedImage
                            src={getImageUrl(
                              product.images?.[0],
                              idx,
                              product.title,
                            )}
                            alt={product.title}
                            fill
                            className="object-cover"
                            fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect fill='%23f3f4f6' width='400' height='300'/%3E%3Ctext fill='%239ca3af' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14'%3E%C3%9Cr%C3%BCn%3C/text%3E%3C/svg%3E"
                            logContext={{
                              productId: product.id,
                              page: "home-discounted",
                            }}
                          />
                          <div className="absolute top-1.5 left-1.5">
                            <span
                              className="text-[10px] font-bold bg-danger-500 text-inverted px-1.5 py-0.5"
                              style={{ borderRadius: "2px" }}
                            >
                              %{discountPct}
                            </span>
                          </div>
                        </div>
                        <div className="p-1.5">
                          <h3 className="font-medium text-heading line-clamp-1 text-[10px] leading-tight mb-0.5">
                            {product.title}
                          </h3>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isProductOnSaleDisplay(product) ? (
                                <>
                                  <span className="text-[10px] text-muted line-through">
                                    {getProductOriginalPriceForDisplay(
                                      product,
                                    ).toLocaleString("tr-TR", {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 0,
                                    })}{" "}
                                    ₺
                                  </span>
                                  <span className="text-xs font-bold text-primary-600">
                                    {getProductEffectivePrice(
                                      product,
                                    ).toLocaleString("tr-TR", {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 0,
                                    })}{" "}
                                    ₺
                                  </span>
                                </>
                              ) : (
                                <span className="text-xs font-bold text-primary-600">
                                  {getProductEffectivePrice(
                                    product,
                                  ).toLocaleString("tr-TR", {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0,
                                  })}{" "}
                                  ₺
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[9px] text-subtle">
                              <span className="flex items-center gap-0.5">
                                <svg
                                  className="w-2.5 h-2.5"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                  <path
                                    fillRule="evenodd"
                                    d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                {product.viewCount ?? 0}
                              </span>
                              <span className="flex items-center gap-0.5">
                                <svg
                                  className="w-2.5 h-2.5"
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path
                                    fillRule="evenodd"
                                    d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                                    clipRule="evenodd"
                                  />
                                </svg>
                                {product.likeCount ?? 0}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Takas Vitrini ── */}
      {(isLoadingTrade || tradeProducts.length > 0) && (
        <section className="py-3">
          <div className="px-3 sm:px-4 lg:px-6">
            <div
              className="bg-surface-elevated border border-border p-3 md:p-5"
              style={{ borderRadius: "4px" }}
            >
              <SectionHeader
                title={locale === "en" ? "Trade Showcase" : "Takas Vitrini"}
                viewAllHref="/takas"
                viewAllLabel={viewAllLabel}
                icon={<ArrowsRightLeftIcon className="w-5 h-5 text-success-500" />}
              />
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-2">
                {isLoadingTrade ? (
                  [...Array(6)].map((_, i) => <SkeletonCard key={i} />)
                ) : (
                  tradeProducts.slice(0, 12).map((product, idx) => (
                    <Link
                      key={product.id}
                      href={`/listings/${product.id}`}
                      className={
                        idx < 6
                          ? "block group"
                          : idx < 8
                            ? "hidden sm:block group"
                            : "hidden lg:block group"
                      }
                    >
                      <div
                        className="overflow-hidden border border-border hover:border-success-400 hover:shadow-soft transition-all"
                        style={{ borderRadius: "4px" }}
                      >
                        <div className="relative aspect-[4/3] bg-surface-alt">
                          <OptimizedImage
                            src={getImageUrl(
                              product.images?.[0],
                              idx,
                              product.title,
                            )}
                            alt={product.title}
                            fill
                            className="object-cover"
                            fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23f3f4f6' width='400' height='300'/%3E%3C/svg%3E"
                            logContext={{
                              productId: product.id,
                              page: "home-trade",
                            }}
                          />
                          {product.isBoosted && (
                            <div className="absolute top-1.5 left-1.5">
                              <span
                                className="text-[10px] font-bold bg-amber-500 text-inverted px-1.5 py-0.5"
                                style={{ borderRadius: "2px" }}
                              >
                                {locale === "en" ? "Sponsored" : "Sponsorlu"}
                              </span>
                            </div>
                          )}
                          <div className="absolute bottom-1.5 left-1.5">
                            <span
                              className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-success-500 text-inverted px-1.5 py-0.5"
                              style={{ borderRadius: "2px" }}
                            >
                              <ArrowsRightLeftIcon className="w-2.5 h-2.5" />
                              {locale === "en" ? "Trade" : "Takas"}
                            </span>
                          </div>
                        </div>
                        <div className="p-1.5">
                          <h3 className="font-medium text-heading line-clamp-1 text-[10px] leading-tight mb-0.5">
                            {product.title}
                          </h3>
                          <p className="text-xs font-bold text-primary-600">
                            {getProductEffectivePrice(product).toLocaleString(
                              "tr-TR",
                              {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              },
                            )}{" "}
                            ₺
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Popular Listings ── */}
      <section className="py-3 bg-primary-50">
        <div className="px-3 sm:px-4 lg:px-6">
          <div
            className="bg-primary-50 border border-primary-100 p-3 md:p-5"
            style={{ borderRadius: "4px" }}
          >
            <SectionHeader
              title={locale === "en" ? "Popular Listings" : "Popüler İlanlar"}
              viewAllHref="/listings?sortBy=view_count_desc"
              viewAllLabel={viewAllLabel}
            />
            <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-2">
              {isLoadingBestSellers ? (
                [...Array(8)].map((_, i) => <SkeletonCard key={i} />)
              ) : bestSellers.length === 0 ? (
                <div className="col-span-full">
                  <EmptyState
                    title={
                      locale === "en" ? "No listings yet" : "Henüz ilan yok"
                    }
                    description={
                      locale === "en" ? "Be the first!" : "İlk ilanı siz verin!"
                    }
                    action={
                      <ButtonLink
                        variant="secondary"
                        size="sm"
                        href="/listings/new"
                      >
                        {locale === "en" ? "Create Listing" : "İlan Oluştur"}
                      </ButtonLink>
                    }
                  />
                </div>
              ) : (
                bestSellers.slice(0, 24).map((product, idx) => (
                  <Link
                    key={product.id}
                    href={`/listings/${product.id}`}
                    className={
                      idx < 12
                        ? "block group"
                        : idx < 15
                          ? "hidden sm:block group"
                          : "hidden lg:block group"
                    }
                  >
                    <div
                      className="overflow-hidden border border-border hover:border-primary-400 hover:shadow-soft transition-all"
                      style={{ borderRadius: "4px" }}
                    >
                      <div className="relative aspect-[4/3] bg-surface-alt">
                        <OptimizedImage
                          src={getImageUrl(
                            product.images?.[0],
                            idx,
                            product.title,
                          )}
                          alt={product.title}
                          fill
                          className="object-cover"
                          fallbackSrc="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 400 300'%3E%3Crect fill='%23f3f4f6' width='400' height='300'/%3E%3Ctext fill='%239ca3af' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='14'%3E%C3%9Cr%C3%BCn%3C/text%3E%3C/svg%3E"
                          logContext={{
                            productId: product.id,
                            page: "home-bestSellers",
                          }}
                        />
                        {product.isBoosted ? (
                          <div className="absolute top-1.5 left-1.5">
                            <span
                              className="text-[10px] font-bold bg-amber-500 text-inverted px-1.5 py-0.5"
                              style={{ borderRadius: "2px" }}
                            >
                              {locale === "en" ? "Sponsored" : "Sponsorlu"}
                            </span>
                          </div>
                        ) : idx < 3 ? (
                          <div className="absolute top-1.5 left-1.5">
                            <span
                              className="text-[10px] font-bold bg-primary-500 text-inverted px-1.5 py-0.5"
                              style={{ borderRadius: "2px" }}
                            >
                              {locale === "en" ? "Popular" : "Popüler"}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div className="p-1.5">
                        <h3 className="font-medium text-heading line-clamp-1 text-[10px] leading-tight mb-0.5">
                          {product.title}
                        </h3>
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-primary-600">
                            {getProductEffectivePrice(product).toLocaleString(
                              "tr-TR",
                              {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 0,
                              },
                            )}{" "}
                            ₺
                          </p>
                          <div className="flex items-center gap-1.5 text-[9px] text-subtle">
                            <span className="flex items-center gap-0.5">
                              <svg
                                className="w-2.5 h-2.5"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                <path
                                  fillRule="evenodd"
                                  d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              {product.viewCount}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <svg
                                className="w-2.5 h-2.5"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                                  clipRule="evenodd"
                                />
                              </svg>
                              {product.likeCount}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Top Collections (compact carousel) ── */}
      {(topCollections.length > 0 ||
        isLoadingCollections) /* always shows via demo fallback */ && (
        <section className="py-3">
          <div className="px-3 sm:px-4 lg:px-6">
            <div
              className="bg-surface-elevated border border-border p-3 md:p-5"
              style={{ borderRadius: "4px" }}
            >
              <SectionHeader
                title={
                  locale === "en" ? "Top Collections" : "En İyi Koleksiyonlar"
                }
                viewAllHref="/collections"
                viewAllLabel={viewAllLabel}
              />
              <div className="relative">
                {isLoadingCollections ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {[...Array(4)].map((_, i) => (
                      <SkeletonCard key={i} />
                    ))}
                  </div>
                ) : (
                  <>
                    {topCollections.length > 1 && (
                      <>
                        <Button
                          variant="secondary"
                          onClick={handlePrevCollection}
                          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded bg-surface-elevated shadow-md flex items-center justify-center transition-all duration-300 hover:shadow-lg text-heading"
                          aria-label="Previous"
                        >
                          <ChevronLeftIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={handleNextCollection}
                          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded bg-surface-elevated shadow-md flex items-center justify-center transition-all duration-300 hover:shadow-lg text-heading"
                          aria-label="Next"
                        >
                          <ChevronRightIcon className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    <div className="overflow-hidden px-12">
                      <div
                        className="flex transition-transform duration-500 ease-premium gap-6"
                        style={{
                          transform: `translateX(calc(-${currentCollectionIndex * 100}% - ${currentCollectionIndex * 1.5}rem))`,
                        }}
                      >
                        {topCollections.map((collection) => (
                          <div
                            key={collection.id}
                            className="flex-shrink-0 w-full"
                          >
                            <div className="bg-surface-alt rounded p-5">
                              <div className="flex flex-col md:flex-row md:items-center gap-5">
                                <div className="flex items-center gap-4 md:w-1/3">
                                  <UserAvatar
                                    displayName={collection.user?.displayName}
                                    avatarUrl={collection.user?.avatarUrl}
                                    size="md"
                                  />
                                  <div className="min-w-0">
                                    <h3 className="text-sm font-bold text-heading flex items-center gap-1.5">
                                      {collection.user?.displayName ||
                                        (locale === "en"
                                          ? "Collector"
                                          : "Koleksiyoner")}
                                      {collection.user?.isVerified && (
                                        <CheckBadgeIcon className="w-4 h-4 text-success-500" />
                                      )}
                                    </h3>
                                    <p className="text-xs text-primary-600 font-medium truncate">
                                      {collection.name}
                                    </p>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-muted">
                                      <span>
                                        {collection.itemCount || 0}{" "}
                                        {locale === "en" ? "items" : "araç"}
                                      </span>
                                      <span>
                                        {collection.viewCount?.toLocaleString() ||
                                          0}{" "}
                                        {locale === "en" ? "views" : "görüntü"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex-1 grid grid-cols-4 sm:grid-cols-5 gap-2">
                                  {collection.items?.slice(0, 5).map((item) => (
                                    <Link
                                      key={item.id}
                                      href={
                                        item.productId
                                          ? `/listings/${item.productId}`
                                          : "#"
                                      }
                                      className="block"
                                    >
                                      <div className="relative aspect-square bg-surface-elevated rounded overflow-hidden border border-border-subtle">
                                        <OptimizedImage
                                          src={getImageUrl(item.productImage)}
                                          alt={item.productTitle}
                                          fill
                                          className="object-cover"
                                          fallbackSrc={`https://placehold.co/200x200/f5f5f7/9ca3af?text=+`}
                                          logContext={{
                                            itemId: item.id,
                                            page: "home-collection-item",
                                          }}
                                        />
                                      </div>
                                    </Link>
                                  ))}
                                </div>
                                <Link
                                  href={`/collections/${collection.id}`}
                                  className="flex-shrink-0 text-primary-500 font-medium hover:text-primary-600 flex items-center gap-1 text-sm"
                                >
                                  {locale === "en" ? "View" : "İncele"}{" "}
                                  <ArrowRightIcon className="w-3.5 h-3.5" />
                                </Link>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {topCollections.length > 1 && (
                      <div className="flex justify-center gap-2 mt-4">
                        {topCollections.map((_, index) => (
                          <Button
                            variant="secondary"
                            key={index}
                            onClick={() => setCurrentCollectionIndex(index)}
                            className={`h-1.5 rounded-sm transition-all duration-300 ease-premium ${index === currentCollectionIndex ? "bg-primary-500 w-6" : "bg-border-strong w-1.5"}`}
                            aria-label={`Go to collection ${index + 1}`}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Spotlights: Featured Collector + Company of the Week (side by side) ── */}
      {(featuredCollectorToShow ||
        companyOfWeek ||
        isLoadingFeaturedCollector ||
        isLoadingCompany) /* always shows via demo fallback */ && (
        <section className="py-3">
          <div className="px-3 sm:px-4 lg:px-6">
            <div className="grid gap-4 md:grid-cols-2">
              {isLoadingFeaturedCollector ? (
                <div
                  className="bg-surface-elevated border border-border p-4"
                  style={{ borderRadius: "4px" }}
                >
                  <div className="animate-pulse space-y-3">
                    <div className="h-5 bg-border-subtle rounded w-2/3" />
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 bg-border-subtle rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-border-subtle rounded w-1/2" />
                        <div className="h-3 bg-border-subtle rounded w-1/3" />
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {[...Array(5)].map((_, i) => (
                        <div
                          key={i}
                          className="aspect-square bg-border-subtle rounded"
                        />
                      ))}
                    </div>
                    <div className="h-9 bg-border-subtle rounded w-full" />
                  </div>
                </div>
              ) : featuredCollectorToShow ? (
                <div
                  className="bg-primary-50 border border-primary-100 p-5 flex flex-col"
                  style={{ borderRadius: "4px" }}
                >
                  <div className="flex justify-start mb-4">
                    <h2 className="text-xl font-extrabold text-heading tracking-tight flex items-center gap-2">
                      <div className="w-1 h-7 bg-primary-500 rounded-sm flex-shrink-0" />
                      {locale === "en"
                        ? "Collector of the Week"
                        : "Haftanın Koleksiyoneri"}
                    </h2>
                  </div>
                  <div className="flex items-start gap-4 mb-4">
                    <UserAvatar
                      displayName={featuredCollectorToShow.user?.displayName}
                      avatarUrl={featuredCollectorToShow.user?.avatarUrl}
                      size="lg"
                    />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-heading flex items-center gap-1.5 mb-0.5">
                        {featuredCollectorToShow.user?.displayName ||
                          (locale === "en" ? "Collector" : "Koleksiyoner")}
                        {featuredCollectorToShow.user?.isVerified && (
                          <CheckBadgeIcon className="w-4 h-4 text-success-500" />
                        )}
                      </h3>
                      <p className="text-xs text-primary-600 font-medium">
                        {featuredCollectorToShow.name}
                      </p>
                      <p className="text-xs text-muted mt-1 line-clamp-2">
                        {featuredCollectorToShow?.description ||
                          `${featuredCollectorToShow.itemCount || 0} ${locale === "en" ? "items" : "araç"}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mb-4 text-xs">
                    <span className="flex items-center gap-1 text-info-500 font-semibold">
                      <svg
                        className="w-3.5 h-3.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                        <path
                          fillRule="evenodd"
                          d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {featuredCollectorToShow.viewCount?.toLocaleString() || 0}
                    </span>
                    <span className="flex items-center gap-1 text-danger-500 font-semibold">
                      <HandThumbUpIcon className="w-3.5 h-3.5" />{" "}
                      {featuredCollectorToShow.likeCount?.toLocaleString() || 0}
                    </span>
                    <span className="text-muted">
                      {featuredCollectorToShow.itemCount || 0}{" "}
                      {locale === "en" ? "items" : "araç"}
                    </span>
                  </div>
                  {featuredCollectorToShow.items &&
                    featuredCollectorToShow.items.length > 0 && (
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-4">
                        {featuredCollectorToShow.items
                          .slice(0, 5)
                          .map((item) => (
                            <Link
                              key={item.id}
                              href={
                                item.productId
                                  ? `/listings/${item.productId}`
                                  : "#"
                              }
                              className="block"
                            >
                              <div className="relative aspect-square bg-surface-alt rounded overflow-hidden">
                                <OptimizedImage
                                  src={getImageUrl(item.productImage)}
                                  alt={item.productTitle}
                                  fill
                                  className="object-cover"
                                  fallbackSrc={`https://placehold.co/200x200/f5f5f7/9ca3af?text=+`}
                                  logContext={{
                                    itemId: item.id,
                                    page: "home-featured-collector-item",
                                  }}
                                />
                              </div>
                            </Link>
                          ))}
                      </div>
                    )}
                  <ButtonLink
                    href={`/collections/${featuredCollectorToShow.id}`}
                    className="mt-auto w-full text-center"
                  >
                    {locale === "en" ? "View Collection" : "Koleksiyonu incele"}
                  </ButtonLink>
                </div>
              ) : null}
              {isLoadingCompany ? (
                <div
                  className="bg-surface-elevated border border-border p-4"
                  style={{ borderRadius: "4px" }}
                >
                  <div className="animate-pulse space-y-3">
                    <div className="h-5 bg-border-subtle rounded w-2/3" />
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 bg-border-subtle rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-border-subtle rounded w-1/2" />
                        <div className="h-3 bg-border-subtle rounded w-1/3" />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[...Array(4)].map((_, i) => (
                        <div key={i} className="h-12 bg-border-subtle rounded" />
                      ))}
                    </div>
                    <div className="h-9 bg-border-subtle rounded w-full" />
                  </div>
                </div>
              ) : companyOfWeek ? (
                <div
                  className="bg-surface-elevated border border-border p-5 flex flex-col"
                  style={{ borderRadius: "4px" }}
                >
                  <div className="flex justify-start mb-4">
                    <h2 className="text-xl font-extrabold text-heading tracking-tight flex items-center gap-2">
                      <div className="w-1 h-7 bg-primary-500 rounded-sm flex-shrink-0" />
                      {locale === "en"
                        ? "Company of the Week"
                        : "Haftanın Şirketi"}
                      <ProductBadge variant="default">Business</ProductBadge>
                    </h2>
                  </div>
                  <div className="flex items-start gap-4 mb-4">
                    <UserAvatar
                      displayName={companyOfWeek.displayName}
                      avatarUrl={companyOfWeek.avatarUrl}
                      size="lg"
                      className="border-2 border-border-subtle"
                    />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-heading flex items-center gap-1.5 mb-0.5">
                        {companyOfWeek.displayName || companyOfWeek.companyName}
                        {companyOfWeek.isVerified && (
                          <CheckBadgeIcon className="w-4 h-4 text-success-500" />
                        )}
                      </h3>
                      <p className="text-xs text-muted line-clamp-2">
                        {companyOfWeek.bio ||
                          (locale === "en"
                            ? "Premium Diecast vehicle buying and selling"
                            : "Premium Diecast araçların alım ve satımı")}
                      </p>
                      {companyOfWeek.stats?.averageRating > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <StarIcon className="w-3.5 h-3.5 text-warning-400" />
                          <span className="text-xs font-semibold text-heading">
                            {companyOfWeek.stats.averageRating.toFixed(1)}
                          </span>
                          <span className="text-xs text-muted">
                            ({companyOfWeek.stats.totalRatings || 0})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    <div className="bg-surface-alt rounded p-2 text-center">
                      <p className="text-sm font-bold text-heading">
                        {companyOfWeek.stats?.totalProducts || 0}
                      </p>
                      <p className="text-[10px] text-muted">
                        {locale === "en" ? "Products" : "Ürün"}
                      </p>
                    </div>
                    <div className="bg-surface-alt rounded p-2 text-center">
                      <p className="text-sm font-bold text-heading">
                        {companyOfWeek.stats?.totalSales || 0}
                      </p>
                      <p className="text-[10px] text-muted">
                        {locale === "en" ? "Sales" : "Satış"}
                      </p>
                    </div>
                    <div className="bg-surface-alt rounded p-2 text-center">
                      <p className="text-sm font-bold text-heading">
                        {(
                          companyOfWeek.stats?.totalViews || 0
                        ).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted">
                        {locale === "en" ? "Views" : "Görüntü"}
                      </p>
                    </div>
                    <div className="bg-surface-alt rounded p-2 text-center">
                      <p className="text-sm font-bold text-heading">
                        {(
                          companyOfWeek.stats?.totalLikes || 0
                        ).toLocaleString()}
                      </p>
                      <p className="text-[10px] text-muted">
                        {locale === "en" ? "Likes" : "Beğeni"}
                      </p>
                    </div>
                  </div>
                  {companyOfWeek.products &&
                    companyOfWeek.products.length > 0 && (
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-4">
                        {companyOfWeek.products.slice(0, 5).map((product) => (
                          <Link
                            key={product.id}
                            href={`/listings/${product.id}`}
                            className="block"
                          >
                            <div className="relative aspect-square bg-surface-alt rounded overflow-hidden">
                              <OptimizedImage
                                src={
                                  product.image ||
                                  `https://placehold.co/200x200/f5f5f7/9ca3af?text=+`
                                }
                                alt={product.title}
                                fill
                                className="object-cover"
                                fallbackSrc={`https://placehold.co/200x200/f5f5f7/9ca3af?text=+`}
                                logContext={{
                                  productId: product.id,
                                  page: "home-company-product",
                                }}
                              />
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}
                  <ButtonLink
                    href={`/seller/${companyOfWeek.id}`}
                    className="mt-auto w-full text-center"
                  >
                    {locale === "en" ? "View Store" : "Mağazayı İncele"}
                  </ButtonLink>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      )}

      <TrustBadges />

      {/* Auth Required Modal */}
      <AuthRequiredModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title={authModalConfig.title}
        message={authModalConfig.message}
        icon={authModalConfig.icon}
        redirectPath={authModalConfig.redirectPath}
      />
    </div>
  );
}
