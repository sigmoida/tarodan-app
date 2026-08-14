import { ShippingPackageTierCode } from "@prisma/client";
import {
  SHIPPING_PACKAGE_TIER_DEFAULTS,
  SHIPPING_PACKAGE_TIER_ORDER,
  billableDesiForTier,
  tierCodeForDesi,
} from "./shipping-package-tier";

describe("shipping package tiers", () => {
  it("kademe aralıkları boşluksuz ve çakışmasızdır, son kademe sınırsızdır", () => {
    const tiers = SHIPPING_PACKAGE_TIER_DEFAULTS;
    expect(tiers).toHaveLength(3);
    expect(tiers[0].minDesi).toBe(0);
    for (let i = 1; i < tiers.length; i++) {
      // Bir kademenin başlangıcı öncekinin bitişine EŞİT olmalı (boşluk/çakışma yok).
      expect(tiers[i].minDesi).toBe(tiers[i - 1].maxDesi);
    }
    expect(tiers[tiers.length - 1].maxDesi).toBeNull();
  });

  it("temsilci desi kademenin üst sınırıdır (eksik tahsil olmaz)", () => {
    expect(billableDesiForTier(ShippingPackageTierCode.small)).toBe(2);
    expect(billableDesiForTier(ShippingPackageTierCode.medium)).toBe(5);
    // Son kademe sınırsız; temsilci değeri iş kararıdır (10 desi).
    expect(billableDesiForTier(ShippingPackageTierCode.large)).toBe(10);
  });

  it("desi → kademe eşlemesi yarı-açık aralıklarla çalışır", () => {
    expect(tierCodeForDesi(1)).toBe(ShippingPackageTierCode.small);
    expect(tierCodeForDesi(2)).toBe(ShippingPackageTierCode.small);
    expect(tierCodeForDesi(3)).toBe(ShippingPackageTierCode.medium);
    expect(tierCodeForDesi(5)).toBe(ShippingPackageTierCode.medium);
    expect(tierCodeForDesi(6)).toBe(ShippingPackageTierCode.large);
    // Üst sınırsız: hiçbir desi kademesiz kalmaz.
    expect(tierCodeForDesi(4000)).toBe(ShippingPackageTierCode.large);
  });

  it("çok kalemli paket bir üst kademeye çıkar", () => {
    const small = billableDesiForTier(ShippingPackageTierCode.small);
    expect(tierCodeForDesi(small)).toBe(ShippingPackageTierCode.small);
    expect(tierCodeForDesi(small * 2)).toBe(ShippingPackageTierCode.medium);
    expect(tierCodeForDesi(small * 3)).toBe(ShippingPackageTierCode.large);
  });

  it("kademe sırası enum değerlerinin tamamını kapsar", () => {
    expect(SHIPPING_PACKAGE_TIER_ORDER).toEqual(
      Object.values(ShippingPackageTierCode),
    );
    expect(SHIPPING_PACKAGE_TIER_DEFAULTS.map((tier) => tier.code)).toEqual(
      SHIPPING_PACKAGE_TIER_ORDER,
    );
  });
});
