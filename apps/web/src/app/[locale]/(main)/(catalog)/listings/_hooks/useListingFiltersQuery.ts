"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import { listingsApi } from "@/lib/api";
import type { AttributeGroup } from "@tarodan/listing-form";

/**
 * Özel attribute grubu — genel özel (üreticisiz, her ilanda) ya da üreticiye
 * bağlı; `/products/attribute-groups` ile aynı şekil, ilan formu paketinin
 * tipi yeniden kullanılır. `/products/filters` üreticisiz çağrıda yalnız genel
 * grupları döner.
 */
export type CustomAttributeGroup = AttributeGroup;

/** `/products/filters` yanıtı — kenar çubuğunun beslendiği katalog metadatası. */
export interface FiltersData {
  scales?: string[];
  materials?: Array<{ slug: string; label: string }>;
  colors?: Array<{ slug: string; label: string; color?: string | null }>;
  brands?: Array<string | { id: string; name: string; slug: string }>;
  carModels?: Array<{
    id: string;
    name: string;
    slug: string;
    brandId: string;
  }>;
  customAttributes?: CustomAttributeGroup[];
}

/** Katalog metadatası oturum boyunca değişmez sayılır. */
const STALE = 60 * 60 * 1000;

/**
 * Filtre metadatası — TEK sorgu tanımı.
 *
 * Hem kenar çubuğu (seçenekleri listeler) hem de aktif filtre çipleri (seçilen
 * slug'ı etikete çevirir) buna bağlıdır. Aynı `queryKey` paylaşıldığı için iki
 * tüketici tek istek yapar; tanım iki yere kopyalansaydı biri `staleTime`
 * değiştirdiğinde diğeri sessizce ikinci bir istek atardı.
 */
export function useListingFiltersQuery() {
  return useQuery({
    queryKey: queryKeys.listings.filters(),
    queryFn: async () => (await listingsApi.getFilters()).data as FiltersData,
    staleTime: STALE,
  });
}
