import {
  calculatePackageDesi,
  outboundPackageShipping,
  ShippingDesiRateNotFoundError,
} from "./shipping-tariff.helper";
import { buildStandardGonderiPayload } from "../surat-cargo/surat-address.util";

describe("desi-based shipping pricing", () => {
  const desiTariff = {
    outboundPackageFee: 99,
    freeShippingEnabled: false,
    freeShippingThreshold: 0,
    rates: [
      { desi: 1, amount: 130 },
      { desi: 2, amount: 180 },
      { desi: 3, amount: 230 },
    ],
  };

  it("uses the admin-defined exact desi amount", () => {
    expect(outboundPackageShipping(desiTariff, 500, 2).toNumber()).toBe(180);
  });

  it("keeps the free-shipping threshold authoritative", () => {
    expect(
      outboundPackageShipping(
        {
          ...desiTariff,
          freeShippingEnabled: true,
          freeShippingThreshold: 500,
        },
        500,
        3,
      ).toNumber(),
    ).toBe(0);
  });

  /**
   * BLOCKER: birebir desi satırı yoksa TÜM sepet 503 ile ödenemez hale geliyordu.
   * Ürünler desi 1000'e kadar tanımlanabildiği ve paket desisi satırların toplamı
   * olduğu için (4 × desi-3 = 12) ulaşılabilir desi kümesi tarifede tanımlı
   * satırları kolayca aşıyor. Eksik satır artık checkout'u bloklamaz: taşıyıcı
   * standardına uygun şekilde bir üst dilime yuvarlanır, tablo üstü değerler ise
   * tarifenin kendi marjinal artışıyla ekstrapole edilir. Asla eksik ücretlenmez.
   */
  it("tablo üstü desi: en yüksek satır + marjinal artış ile ekstrapole edilir", () => {
    // Satırlar 1→130, 2→180, 3→230 (marjinal artış 50). desi 4 → 230 + 50 = 280
    expect(outboundPackageShipping(desiTariff, 500, 4).toNumber()).toBe(280);
    // desi 6 → 230 + 3*50 = 380
    expect(outboundPackageShipping(desiTariff, 500, 6).toNumber()).toBe(380);
  });

  it("ara boşlukta bir ÜST dilim uygulanır (eksik ücretlendirme olmaz)", () => {
    const gapped = {
      ...desiTariff,
      rates: [
        { desi: 1, amount: 130 },
        { desi: 2, amount: 180 },
        { desi: 5, amount: 300 },
      ],
    };
    // desi 3 ve 4 tanımsız → bir üst dilim olan 5 (300 TL) uygulanır.
    expect(outboundPackageShipping(gapped, 500, 3).toNumber()).toBe(300);
    expect(outboundPackageShipping(gapped, 500, 4).toNumber()).toBe(300);
  });

  it("en küçük satırın altındaki desi en küçük satırla ücretlenir", () => {
    const startsAtTwo = {
      ...desiTariff,
      rates: [
        { desi: 2, amount: 180 },
        { desi: 3, amount: 230 },
      ],
    };
    expect(outboundPackageShipping(startsAtTwo, 500, 1).toNumber()).toBe(180);
  });

  it("tek satırlı tarifede ekstrapolasyon o satırın desi-başı bedelini kullanır", () => {
    const single = { ...desiTariff, rates: [{ desi: 1, amount: 130 }] };
    // desi 3 → 130 + 2 * 130 = 390
    expect(outboundPackageShipping(single, 500, 3).toNumber()).toBe(390);
  });

  it("ücretsiz kargo eşiği ekstrapolasyondan önce gelir", () => {
    expect(
      outboundPackageShipping(
        {
          ...desiTariff,
          freeShippingEnabled: true,
          freeShippingThreshold: 500,
        },
        500,
        9,
      ).toNumber(),
    ).toBe(0);
  });

  it("fails closed when a legacy tariff has no desi rows", () => {
    expect(() =>
      outboundPackageShipping(
        {
          outboundPackageFee: 75,
          freeShippingEnabled: false,
          freeShippingThreshold: 0,
          rates: [],
        },
        500,
        1,
      ),
    ).toThrow(ShippingDesiRateNotFoundError);
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
