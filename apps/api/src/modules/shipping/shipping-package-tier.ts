import { ShippingPackageTierCode } from "@prisma/client";

/**
 * Paket boyutu kademelerinin TEK kaynağı.
 *
 * Satıcı ilanda yalnız boyut seçer (Küçük/Orta/Büyük); desi arka planda kalır ve
 * yalnız admin görür. Kargo bedeli satıcı paketi başına BİR kez alınır ve paketin
 * desisi satırların toplamıdır (Σ desi × adet) — bu yüzden her kademenin toplanabilir
 * bir "temsilci desi"si olmalı. Temsilci = kademenin ÜST SINIRI: çok kalemli sepette
 * eksik tahsil edilmez (2 küçük ürün 4 desi → Orta kademeye çıkar).
 *
 * Son kademe ÜST SINIRSIZDIR: her desi bir kademeye düşer, dolayısıyla eksik
 * fiyat satırı diye bir durum kalmaz (eski desi tablosunun 503'ü ortadan kalkar).
 */
export interface ShippingPackageTierDefaults {
  code: ShippingPackageTierCode;
  label: string;
  minDesi: number;
  /** null = üst sınırsız. */
  maxDesi: number | null;
  /** Paket desisi toplanırken kullanılan temsilci desi. */
  billableDesi: number;
  sortOrder: number;
}

export const SHIPPING_PACKAGE_TIER_ORDER: ShippingPackageTierCode[] = [
  ShippingPackageTierCode.small,
  ShippingPackageTierCode.medium,
  ShippingPackageTierCode.large,
];

/**
 * Varsayılan kademe iskeleti (aralıklar + etiketler). Tutarlar admin tarafından
 * tarifede girilir; burada fiyat YOKTUR — fiyat iş verisidir, kodda sabitlenmez.
 */
export const SHIPPING_PACKAGE_TIER_DEFAULTS: ShippingPackageTierDefaults[] = [
  {
    code: ShippingPackageTierCode.small,
    label: "Küçük Paket",
    minDesi: 0,
    maxDesi: 2,
    billableDesi: 2,
    sortOrder: 0,
  },
  {
    code: ShippingPackageTierCode.medium,
    label: "Orta Paket",
    minDesi: 2,
    maxDesi: 5,
    billableDesi: 5,
    sortOrder: 1,
  },
  {
    code: ShippingPackageTierCode.large,
    label: "Büyük Paket",
    minDesi: 5,
    maxDesi: null,
    billableDesi: 10,
    sortOrder: 2,
  },
];

const DEFAULTS_BY_CODE = new Map(
  SHIPPING_PACKAGE_TIER_DEFAULTS.map((tier) => [tier.code, tier]),
);

/**
 * Bir kademenin temsilci desisi — ürünün `shippingDesi` alanı bundan TÜRETİLİR.
 * Böylece paket desisi toplama mantığı (calculatePackageDesi) hiç değişmez.
 */
export function billableDesiForTier(code: ShippingPackageTierCode): number {
  return DEFAULTS_BY_CODE.get(code)?.billableDesi ?? 1;
}

/**
 * Bir desi değerinin düştüğü kademe. Aralıklar yarı-açıktır: (minDesi, maxDesi].
 * Desi tam sayı olduğundan 2 → Küçük, 3–5 → Orta, 6+ → Büyük.
 */
export function tierCodeForDesi(desi: number): ShippingPackageTierCode {
  for (const tier of SHIPPING_PACKAGE_TIER_DEFAULTS) {
    if (tier.maxDesi == null || desi <= tier.maxDesi) return tier.code;
  }
  return ShippingPackageTierCode.large;
}
