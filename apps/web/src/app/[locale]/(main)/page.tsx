import type { Metadata } from "next";
import { hasRealDiscount } from "@/lib/productPrice";
import { unwrapList } from "@/lib/unwrapList";
import { localizedCanonical, localizedPath } from "@/lib/seo";
import { getServerApiOrigin } from "@/lib/api/origin";
import type { Product } from "@/types/product";
import HomeContent from "./_home/_components/HomeContent";
import type {
  BrandMarqueeItem,
  FeaturedBusiness,
  FeaturedCollector,
  HomePageData,
} from "./_home/lib/types";

const API_BASE = getServerApiOrigin();

const TITLE = "Tarodan - Diecast Model Araba Pazarı";
const DESCRIPTION =
  "Diecast model araba koleksiyoncuları için güvenli alış, satış ve takas platformu. Öne çıkan ürünler, indirimler, takas vitrini ve popüler ilanları keşfedin.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: localizedCanonical(locale, "/"),
    openGraph: {
      title: TITLE,
      description: DESCRIPTION,
      type: "website",
      url: localizedPath(locale, "/"),
    },
    twitter: {
      card: "summary_large_image",
      title: TITLE,
      description: DESCRIPTION,
    },
  };
}

/**
 * Public server fetch for `/products`. The API may return an array or a wrapped
 * `{ data | products }` payload. ISR keeps the rendered rails fresh without
 * sending their fetching and transformation code to the browser.
 */
async function fetchProducts(
  params: Record<string, string | number | boolean>,
): Promise<Product[]> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const res = await fetch(`${API_BASE}/api/products?${qs}`, {
    // `products:list` tag lets the backend on-demand revalidate every rail when a
    // product/discount changes (see app/api/revalidate); revalidate is the fallback.
    next: { revalidate: 60, tags: ["products:list"] },
  });
  if (!res.ok) throw new Error(`products ${res.status}`);
  return unwrapList<Product>(await res.json());
}

/** Discounted rail: same real-discount filter the client applies. */
async function fetchDiscountedProducts(): Promise<Product[]> {
  const products = await fetchProducts({
    limit: 24,
    page: 1,
    discountOnly: true,
    status: "active",
  });
  return products.filter(hasRealDiscount);
}

interface Manufacturer {
  name: string;
  logo?: string | null;
  description?: string | null;
}

async function fetchManufacturers(): Promise<Manufacturer[]> {
  const res = await fetch(`${API_BASE}/api/manufacturers`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`manufacturers ${res.status}`);
  return unwrapList<Manufacturer>(await res.json());
}

async function fetchTopCollections(): Promise<FeaturedCollector[]> {
  const res = await fetch(`${API_BASE}/api/users/top-collections?limit=20`, {
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`top-collections ${res.status}`);
  return unwrapList<FeaturedCollector>(await res.json());
}

/** featured-collector / featured-business: mirror the client's `data ?? null`. */
async function fetchNullable<T>(path: string): Promise<T | null> {
  const res = await fetch(`${API_BASE}${path}`, { next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  const raw = await res.json();
  return (raw ?? null) as T | null;
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const [
    featured,
    trade,
    discounted,
    popular,
    manufacturers,
    featuredCollector,
    featuredBusiness,
    topCollections,
  ] = await Promise.allSettled([
    // Vitrin (home showcase): yalnızca "ana sayfada vitrinlensin" paketini alan
    // ürünler, en son satın alınan en başta olacak şekilde (LIFO — boostedAt DESC).
    fetchProducts({ limit: 20, page: 1, homeShowcase: true, status: "active" }),
    fetchProducts({ limit: 24, page: 1, tradeOnly: true, status: "active" }),
    fetchDiscountedProducts(),
    fetch(`${API_BASE}/api/products/popular?limit=20&page=1`, {
      next: { revalidate: 60 },
    }).then(async (res) => {
      if (!res.ok) throw new Error(`popular products ${res.status}`);
      return unwrapList<Product>(await res.json());
    }),
    fetchManufacturers(),
    fetchNullable<FeaturedCollector>("/api/users/featured-collector"),
    fetchNullable<FeaturedBusiness>("/api/users/featured-business"),
    fetchTopCollections(),
  ]);

  // Faz 1: marka şeridi tamamen API'den — logolar S3'ten mutlak URL olarak
  // gelir (manufacturer.logo key → getPublicAssetUrl). Statik fallback listesi
  // ve repo içi logo dosyaları kaldırıldı.
  const manufacturerItems = settledValue(manufacturers, []);
  const marqueeItems: BrandMarqueeItem[] = manufacturerItems.map((item) => ({
    name: item.name,
    logoUrl: item.logo || "",
    desc: item.description || "",
  }));

  const data: HomePageData = {
    featured: settledValue(featured, []),
    discounted: settledValue(discounted, []),
    trade: settledValue(trade, []),
    popular: settledValue(popular, []),
    topCollections: settledValue(topCollections, []),
    featuredCollector: settledValue(featuredCollector, null),
    featuredBusiness: settledValue(featuredBusiness, null),
    marqueeItems,
  };

  return <HomeContent data={data} locale={locale} />;
}
