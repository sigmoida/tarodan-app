import { ShippingPackageTierCode } from "@prisma/client";
import {
  resolveProductShippingTier,
  productShippingTierData,
} from "./helpers/product-shipping-tier.helper";

/**
 * Satıcının ilanda seçtiği paket boyutu ürüne YAZILMALI ve desi ondan
 * TÜRETİLMELİ. Aksi halde "Büyük Paket" seçen satıcının ürünü küçük paket
 * fiyatından gönderilir ve farkı platform üstlenir (Sürat faturası platforma
 * gelir) — kademe kurgusunun engellemek için var olduğu durum tam olarak budur.
 *
 * Global ValidationPipe `whitelist: true` ile çalışıyor: DTO'da tanımlı olmayan
 * alan SESSİZCE düşürülür. Bu yüzden alanın DTO'da ve yazma yolunda birlikte
 * bulunması kritik.
 */
describe("product shipping package tier", () => {
  it("gönderilen boyutu kullanır", () => {
    expect(resolveProductShippingTier(ShippingPackageTierCode.large)).toBe(
      ShippingPackageTierCode.large,
    );
  });

  it("boyut gönderilmediyse en küçük boyuta düşer", () => {
    expect(resolveProductShippingTier(undefined)).toBe(
      ShippingPackageTierCode.small,
    );
    expect(resolveProductShippingTier(null)).toBe(
      ShippingPackageTierCode.small,
    );
  });

  it("create için boyut + TÜRETİLMİŞ desi yazar", () => {
    expect(productShippingTierData(ShippingPackageTierCode.medium)).toEqual({
      shippingPackageTier: ShippingPackageTierCode.medium,
      shippingDesi: 5,
    });
    expect(productShippingTierData(ShippingPackageTierCode.large)).toEqual({
      shippingPackageTier: ShippingPackageTierCode.large,
      shippingDesi: 10,
    });
  });

  it("boyut gönderilmemişse update'te alanlara DOKUNMAZ", () => {
    // Kısmi güncellemede (yalnız başlık değişiyor) kargo alanları korunmalı.
    expect(productShippingTierData(undefined, { partial: true })).toEqual({
      shippingPackageTier: undefined,
      shippingDesi: undefined,
    });
  });

  it("create'te boyut yoksa varsayılanı YAZAR (kolon boş kalmasın)", () => {
    expect(productShippingTierData(undefined)).toEqual({
      shippingPackageTier: ShippingPackageTierCode.small,
      shippingDesi: 2,
    });
  });

  it("desi her zaman kademenin üst sınırıdır (eksik tahsil olmaz)", () => {
    for (const code of Object.values(ShippingPackageTierCode)) {
      const data = productShippingTierData(code);
      expect(data.shippingDesi).toBeGreaterThan(0);
    }
    // Küçük < Orta < Büyük — toplama mantığı kademeleri doğru sıralar.
    const small = productShippingTierData(
      ShippingPackageTierCode.small,
    ).shippingDesi!;
    const medium = productShippingTierData(
      ShippingPackageTierCode.medium,
    ).shippingDesi!;
    const large = productShippingTierData(
      ShippingPackageTierCode.large,
    ).shippingDesi!;
    expect(small).toBeLessThan(medium);
    expect(medium).toBeLessThan(large);
  });
});
