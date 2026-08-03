import { ShippingPackageTierCode } from "@prisma/client";
import {
  calculatePackageDesi,
  outboundPackageShipping,
  resolvePackageTier,
  shippingAmountForDesi,
  ShippingPackageTiersNotConfiguredError,
} from "./shipping-tariff.helper";
import { buildStandardGonderiPayload } from "../surat-cargo/surat-address.util";

/**
 * Kargo fiyatı artık desi satırlarından değil, satıcının ilanda seçtiği PAKET
 * BOYUTUNDAN çözülür. Desi yalnız iç muhasebe birimi olarak kalır: paket desisi
 * satırların toplamıdır (Σ desi × adet) ve toplam hangi kademe aralığına düşerse
 * o kademenin tutarı uygulanır. Son kademe üst sınırsız olduğundan eksik fiyat
 * satırı diye bir durum yoktur.
 */
describe("package-tier shipping pricing", () => {
  const tierTariff = {
    freeShippingEnabled: false,
    freeShippingThreshold: 0,
    packageTiers: [
      {
        code: ShippingPackageTierCode.small,
        minDesi: 0,
        maxDesi: 2,
        amount: 100,
      },
      {
        code: ShippingPackageTierCode.medium,
        minDesi: 2,
        maxDesi: 5,
        amount: 130,
      },
      {
        code: ShippingPackageTierCode.large,
        minDesi: 5,
        maxDesi: null,
        amount: 160,
      },
    ],
  };

  it("tek kalemde seçilen kademenin tutarını uygular", () => {
    // Küçük paketin temsilci desisi 2 → 100 TL.
    expect(outboundPackageShipping(tierTariff, 500, 2).toNumber()).toBe(100);
    expect(outboundPackageShipping(tierTariff, 500, 5).toNumber()).toBe(130);
    expect(outboundPackageShipping(tierTariff, 500, 10).toNumber()).toBe(160);
  });

  it("çok kalemli paket toplam desiyle bir üst kademeye çıkar", () => {
    // 2 küçük ürün → 4 desi → Orta 130; 3 küçük → 6 desi → Büyük 160.
    expect(outboundPackageShipping(tierTariff, 500, 4).toNumber()).toBe(130);
    expect(outboundPackageShipping(tierTariff, 500, 6).toNumber()).toBe(160);
  });

  it("son kademe üst sınırsızdır: hiçbir desi fiyatsız kalmaz", () => {
    // 2 büyük ürün → 20 desi; kademe fiyatı düz uygulanır (katlanmaz).
    expect(outboundPackageShipping(tierTariff, 500, 20).toNumber()).toBe(160);
    expect(outboundPackageShipping(tierTariff, 500, 4000).toNumber()).toBe(160);
  });

  it("en küçük kademenin altındaki desi ilk kademeyle ücretlenir", () => {
    expect(outboundPackageShipping(tierTariff, 500, 1).toNumber()).toBe(100);
    expect(outboundPackageShipping(tierTariff, 500, 0).toNumber()).toBe(100);
  });

  it("kademe aralıkları yarı-açıktır: sınır değeri alttaki kademeye düşer", () => {
    expect(resolvePackageTier(tierTariff, 2).code).toBe(
      ShippingPackageTierCode.small,
    );
    expect(resolvePackageTier(tierTariff, 3).code).toBe(
      ShippingPackageTierCode.medium,
    );
    expect(resolvePackageTier(tierTariff, 5).code).toBe(
      ShippingPackageTierCode.medium,
    );
    expect(resolvePackageTier(tierTariff, 6).code).toBe(
      ShippingPackageTierCode.large,
    );
  });

  it("kademe sırası tanım sırasından bağımsızdır", () => {
    const shuffled = {
      ...tierTariff,
      packageTiers: [
        tierTariff.packageTiers[2],
        tierTariff.packageTiers[0],
        tierTariff.packageTiers[1],
      ],
    };
    expect(outboundPackageShipping(shuffled, 500, 4).toNumber()).toBe(130);
    expect(outboundPackageShipping(shuffled, 500, 1).toNumber()).toBe(100);
  });

  it("ücretsiz kargo eşiği kademenin ÜSTÜNDEDİR", () => {
    const freeTariff = {
      ...tierTariff,
      freeShippingEnabled: true,
      freeShippingThreshold: 500,
    };
    expect(outboundPackageShipping(freeTariff, 500, 10).toNumber()).toBe(0);
    // Eşiğin altında kademe fiyatı geçerli.
    expect(outboundPackageShipping(freeTariff, 499, 10).toNumber()).toBe(160);
  });

  it("kademesiz tarife yapılandırma hatasıdır ve fail-closed davranır", () => {
    expect(() =>
      shippingAmountForDesi(
        {
          freeShippingEnabled: false,
          freeShippingThreshold: 0,
          packageTiers: [],
        },
        1,
      ),
    ).toThrow(ShippingPackageTiersNotConfiguredError);
  });

  it("sums product desi multiplied by quantity for one seller package", () => {
    expect(
      calculatePackageDesi([
        { shippingDesi: 2, quantity: 2 },
        { shippingDesi: 1, quantity: 1 },
      ]),
    ).toBe(5);
  });

  it("writes the snapshotted package desi into the Surat payload", () => {
    const payload = buildStandardGonderiPayload({
      recipientName: "Test Buyer",
      address: "Test Address",
      city: "Istanbul",
      district: "Kadikoy",
      phone: "5551112233",
      ref: "ORDER-1",
      desi: 3,
    });

    expect(payload.BirimDesi).toBe(3);
  });
});
