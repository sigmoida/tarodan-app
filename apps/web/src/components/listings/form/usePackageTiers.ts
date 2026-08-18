/** @format */

"use client";

import { api } from "@/lib/api/client";
import { useWebList } from "@/hooks/useWebResource";

export type PackageTierCode = "small" | "medium" | "large";

export interface PackageTier {
  code: PackageTierCode;
  /** Satıcıya gösterilen ad ("Küçük Paket") — admin belirler. */
  label: string;
  sampleWidth: number | null;
  sampleHeight: number | null;
  sampleLength: number | null;
}

/**
 * Aktif tarifenin paket boyutları — ilan formundaki radyo kartları besler.
 *
 * Desi arayüze HİÇ girmez: satıcı boyut seçer, fiyat ve net kazanç sunucudan gelir.
 * Aktif tarife yoksa uç 503 verir ve form fiyat gösteremez (fail-closed).
 *
 * TUTAR bilerek buradan okunmaz. Bu uç public'tir; kategoriyi, fiyatı ve
 * satıcıyı bilmediği için yalnız TAM kargo bedelini verebilir — oysa satıcının
 * ödeyeceği pay komisyon kuralından, kademe kademe çıkar. Kart tutarları
 * `useCommissionPreview` üzerinden gelir; ikisi de tek karar fonksiyonundan
 * türediği için kartla özet kutusu ayrışamaz.
 */
export function usePackageTiers() {
  const query = useWebList<PackageTier[]>({
    resource: "shipping-package-tiers",
    fetcher: async () => {
      const res = await api.get("/shipping/package-tiers");
      return (res.data?.tiers ?? []) as PackageTier[];
    },
    query: { staleTime: 5 * 60 * 1000 },
  });

  return {
    tiers: query.data ?? [],
    tiersLoading: query.isLoading,
  };
}

/** "25 × 20 × 12 cm" — ölçü eksikse null (kart yalnız adı ve fiyatı gösterir). */
export function sampleDimensionsLabel(tier: PackageTier): string | null {
  const { sampleWidth, sampleHeight, sampleLength } = tier;
  if (sampleWidth == null || sampleHeight == null || sampleLength == null) {
    return null;
  }
  return `${sampleWidth} × ${sampleHeight} × ${sampleLength} cm`;
}
