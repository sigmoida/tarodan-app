/** @format */

/**
 * The SINGLE fetch source for the manufacturers route. The server page (SSR
 * seed) and the client queries unwrap the same raw responses through the same
 * helpers, so the seeded first paint matches the client refetch and hydration
 * doesn't flash. Server fetchers hit the API absolutely; client fetchers reuse
 * the axios `*Api` wrappers.
 */

import { manufacturersApi, listingsApi } from "@/lib/api";
import { getServerApiOrigin } from "@/lib/api/origin";
import { countryToFlag } from "./countryFlag";
import { BRANDS_DATA } from "./brands-data";
import type {
  ManufacturerApi,
  ManufacturerCard,
  ManufacturerDetail,
} from "./types";

export const API_BASE = getServerApiOrigin();

/** Unwrap a raw `/manufacturers` response into a plain array. */
export function unwrapManufacturers(raw: any): ManufacturerApi[] {
  if (Array.isArray(raw)) return raw;
  return raw?.data ?? [];
}

/** Unwrap a raw `/products` response into a plain array. */
export function unwrapProducts(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  return raw?.data ?? raw?.products ?? [];
}

/**
 * Merge API manufacturers with the static fallback table (by slug or name) into
 * the shape the list card renders. Live product counts come from the API
 * (`_count.products`); logo / country / founding year fall back to the table.
 */
export function mergeManufacturers(
  rawList: ManufacturerApi[],
): ManufacturerCard[] {
  return rawList.map((m) => {
    const fromData = BRANDS_DATA.find(
      (b) =>
        b.slug === m.slug ||
        b.name.toLowerCase() === (m.name || "").toLowerCase(),
    );
    return {
      id: m.id,
      name: m.name,
      slug: m.slug,
      logoUrl: m.logo || fromData?.logoUrl || "",
      country: m.country || fromData?.country || "",
      countryFlag:
        countryToFlag(m.country || "") || fromData?.countryFlag || "🌐",
      founded: m.foundedYear || fromData?.founded || 0,
      description: m.description || "",
      website: m.website || "",
      productCount: m._count?.products ?? 0,
    };
  });
}

// ---- Manufacturers list ----

export async function fetchManufacturersServer(): Promise<ManufacturerApi[]> {
  try {
    const res = await fetch(`${API_BASE}/api/manufacturers`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    return unwrapManufacturers(await res.json());
  } catch {
    return [];
  }
}

export async function fetchManufacturersClient(): Promise<ManufacturerApi[]> {
  const res = await manufacturersApi.findAll();
  return unwrapManufacturers(res.data);
}

// ---- Single manufacturer (detail) ----

export async function fetchManufacturerBySlugServer(
  slug: string,
): Promise<ManufacturerDetail | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/manufacturers/slug/${encodeURIComponent(slug)}`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return null;
    const raw = await res.json();
    return (raw?.data ?? raw) as ManufacturerDetail;
  } catch {
    return null;
  }
}

export async function fetchManufacturerBySlugClient(
  slug: string,
): Promise<ManufacturerDetail> {
  const res = await manufacturersApi.findBySlug(slug);
  return res.data as ManufacturerDetail;
}

// ---- Manufacturer listings ----

export async function fetchManufacturerProductsServer(
  manufacturerId: string,
): Promise<any[]> {
  try {
    const res = await fetch(
      `${API_BASE}/api/products?manufacturerId=${encodeURIComponent(manufacturerId)}&limit=50`,
      { next: { revalidate: 60 } },
    );
    if (!res.ok) return [];
    return unwrapProducts(await res.json());
  } catch {
    return [];
  }
}

export async function fetchManufacturerProductsClient(
  manufacturerId: string,
): Promise<any[]> {
  const res = await listingsApi.getAll({ manufacturerId, limit: 50 });
  return unwrapProducts(res.data);
}

/** The 4-item active-listing teaser shown inside an accordion card. */
export async function fetchManufacturerPreviewClient(
  manufacturerId: string,
): Promise<any[]> {
  const res = await listingsApi.getAll({
    manufacturerId,
    limit: 4,
    status: "active",
  });
  return unwrapProducts(res.data);
}
