import { tradeSideBillableDesi } from "./trade-shipment-desi.helper";

/**
 * Bu hesap taşıyıcıya bildirilen desiyi belirler, yani faturayı. Asıl risk
 * yanlış TARAFI toplamak: depoya girişte taraf kendi ürününü yollar, depodan
 * çıkışta karşı tarafın ürününü alır — aynı kullanıcı, farklı koli, farklı desi.
 */
const items = [
  { side: "initiator", quantity: 1, product: { shippingDesi: 5 } },
  { side: "initiator", quantity: 2, product: { shippingDesi: 2 } },
  { side: "receiver", quantity: 1, product: { shippingDesi: 10 } },
];

describe("tradeSideBillableDesi", () => {
  it("sums only the requested side's products, times quantity", () => {
    expect(tradeSideBillableDesi(items, "initiator")).toBe(9); // 5 + 2×2
    expect(tradeSideBillableDesi(items, "receiver")).toBe(10);
  });

  it("falls back to 1 when the side has no resolvable product", () => {
    // Eski davranış: desi bilinmiyor diye takas kargosunu bloke etme.
    expect(tradeSideBillableDesi([], "initiator")).toBe(1);
    expect(
      tradeSideBillableDesi(
        [{ side: "initiator", quantity: 1, product: null }],
        "initiator",
      ),
    ).toBe(1);
  });

  it("never reports less than one desi", () => {
    expect(
      tradeSideBillableDesi(
        [{ side: "receiver", quantity: 1, product: { shippingDesi: 0 } }],
        "receiver",
      ),
    ).toBe(1);
  });
});
