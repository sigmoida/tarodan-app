import {
  buildPackageFeeDocuments,
  hasCompleteComponentBreakdown,
  type PackageFeeOrderRow,
} from "./package-fee-basis";

/**
 * Paketin kesinti kalemlerinden belge matrahları.
 *
 * Buradaki kural mali: bir alışverişte alıcıya ÜÇ, satıcıya ÜÇ belge kesilir ve
 * her belgenin matrahı TEK bir hizmetin bedelidir. Kalemleri tek belgede
 * toplamak (eski davranış) hangi hizmetin ne kadarının faturalandığını
 * belgeden okunamaz hale getiriyordu; kargo payı ise hiç faturalanmıyordu.
 */

const ledger = (over: Partial<PackageFeeOrderRow["ledger"]> = {}) => ({
  componentBreakdownComplete: true,
  buyerCommissionAmount: 0,
  buyerPlatformFeeAmount: 0,
  sellerCommissionAmount: 0,
  sellerPlatformFeeAmount: 0,
  refundedBuyerCommissionAmount: 0,
  refundedBuyerPlatformFeeAmount: 0,
  refundedSellerCommissionAmount: 0,
  refundedSellerPlatformFeeAmount: 0,
  ...over,
});

const order = (over: Partial<PackageFeeOrderRow> = {}): PackageFeeOrderRow => ({
  id: "o1",
  productName: "Ürün 1",
  buyerShippingAmount: 0,
  sellerShippingAmount: 0,
  refundedBuyerShippingAmount: 0,
  ledger: ledger(),
  ...over,
});

describe("buildPackageFeeDocuments", () => {
  it("tek siparişlik pakette taraf başına üç belge üretir", () => {
    const docs = buildPackageFeeDocuments(
      [
        order({
          buyerShippingAmount: 40,
          sellerShippingAmount: 10,
          ledger: ledger({
            buyerCommissionAmount: 5,
            buyerPlatformFeeAmount: 8,
            sellerCommissionAmount: 20,
            sellerPlatformFeeAmount: 12,
          }),
        }),
      ],
      20,
    );

    expect(docs.map((d) => d.type)).toEqual([
      "buyer_commission",
      "buyer_service_fee",
      "buyer_shipping",
      "seller_commission",
      "seller_platform_fee",
      "seller_shipping",
    ]);
    expect(docs.map((d) => d.net)).toEqual([5, 8, 40, 20, 12, 10]);
    // Tek satırlı belgede kalem adı hizmetin kendisidir.
    expect(docs[2].lines).toEqual([
      {
        name: "Kargo hizmet bedeli (alıcı payı)",
        quantity: 1,
        net: 40,
        unitPrice: 40,
        vatRate: 20,
      },
    ]);
  });

  it("bedeli doğmamış hizmet için belge üretmez", () => {
    const docs = buildPackageFeeDocuments(
      [order({ ledger: ledger({ sellerCommissionAmount: 20 }) })],
      20,
    );
    expect(docs.map((d) => d.type)).toEqual(["seller_commission"]);
  });

  it("çok siparişli pakette matrahı toplar ve kalemleri ürün ürün satırlar", () => {
    const docs = buildPackageFeeDocuments(
      [
        order({
          id: "o1",
          productName: "Ürün 1",
          ledger: ledger({ sellerCommissionAmount: 20 }),
        }),
        order({
          id: "o2",
          productName: "Ürün 2",
          ledger: ledger({ sellerCommissionAmount: 30.55 }),
        }),
      ],
      20,
    );

    const doc = docs.find((d) => d.type === "seller_commission")!;
    expect(doc.net).toBe(50.55);
    expect(doc.lines.map((l) => [l.name, l.net])).toEqual([
      ["Ürün 1", 20],
      ["Ürün 2", 30.55],
    ]);
  });

  it("kısmi iade matrahtan düşülür ama iade öncesi matrah korunur", () => {
    const docs = buildPackageFeeDocuments(
      [
        order({
          buyerShippingAmount: 40,
          refundedBuyerShippingAmount: 15,
          ledger: ledger({
            sellerCommissionAmount: 20,
            refundedSellerCommissionAmount: 8,
          }),
        }),
      ],
      20,
    );

    const commission = docs.find((d) => d.type === "seller_commission")!;
    expect(commission).toMatchObject({ base: 20, net: 12 });
    const shipping = docs.find((d) => d.type === "buyer_shipping")!;
    expect(shipping).toMatchObject({ base: 40, net: 25 });
  });

  it("tamamı iade edilmiş kalemi listede tutar — iade oranının paydası budur", () => {
    const docs = buildPackageFeeDocuments(
      [
        order({
          ledger: ledger({
            sellerCommissionAmount: 20,
            refundedSellerCommissionAmount: 20,
          }),
        }),
      ],
      20,
    );

    const doc = docs.find((d) => d.type === "seller_commission")!;
    expect(doc).toMatchObject({ base: 20, net: 0 });
    expect(doc.lines).toEqual([]);
  });

  it("KDV kapalıyken kalemler sıfır oranla kesilir", () => {
    const docs = buildPackageFeeDocuments(
      [order({ ledger: ledger({ sellerCommissionAmount: 20 }) })],
      0,
    );
    expect(docs[0].lines[0].vatRate).toBe(0);
  });
});

describe("hasCompleteComponentBreakdown", () => {
  it("tek bir defterde kırılım eksikse false — kalem bazlı belge kesilemez", () => {
    expect(
      hasCompleteComponentBreakdown([
        order({ id: "o1" }),
        order({
          id: "o2",
          ledger: ledger({ componentBreakdownComplete: false }),
        }),
      ]),
    ).toBe(false);
  });

  it("defteri olmayan sipariş de kırılımı eksik sayılır", () => {
    expect(hasCompleteComponentBreakdown([order({ ledger: null })])).toBe(
      false,
    );
  });

  it("hepsi tamsa true", () => {
    expect(
      hasCompleteComponentBreakdown([order({ id: "o1" }), order({ id: "o2" })]),
    ).toBe(true);
  });
});
