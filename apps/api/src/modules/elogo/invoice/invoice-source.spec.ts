import { ElogoInvoiceType } from "@prisma/client";
import {
  invoiceSourceKindOf,
  invoiceTypesOfSourceKind,
  reversedInvoiceIdOf,
} from "./invoice-source";

/**
 * `sourceId` tipsizdir; hangi tabloyu gösterdiği yalnız bu eşlemeden okunur.
 * Yanlış dal hata vermez, sessizce boş kolon / boş döküm üretir — o yüzden her
 * tür tek tek kilitlenir.
 */
describe("invoiceSourceKindOf", () => {
  it.each([
    ["commission", "package_or_order"],
    ["service_fee", "package_or_order"],
    ["buyer_commission", "package_or_order"],
    ["buyer_service_fee", "package_or_order"],
    ["buyer_shipping", "package_or_order"],
    ["seller_commission", "package_or_order"],
    ["seller_platform_fee", "package_or_order"],
    ["seller_shipping", "package_or_order"],
    ["platform_sale", "package_or_order"],
    ["membership", "membership"],
    ["boost", "boost"],
    ["trade_commission", "trade_payment"],
    ["trade_service_fee", "trade_payment"],
    ["trade_shipping", "trade_payment"],
    ["penalty", "refund_request"],
    ["return_invoice", "reversed_invoice"],
  ] as const)("%s → %s", (type, kind) => {
    expect(invoiceSourceKindOf(type)).toBe(kind);
  });

  it("şemadaki her fatura türü eşlenmiştir", () => {
    for (const type of Object.values(ElogoInvoiceType)) {
      expect(invoiceSourceKindOf(type)).toEqual(expect.any(String));
    }
  });
});

describe("invoiceTypesOfSourceKind", () => {
  it("takas ödemesine anahtarlanan üç türü döner", () => {
    expect(invoiceTypesOfSourceKind("trade_payment").sort()).toEqual([
      "trade_commission",
      "trade_service_fee",
      "trade_shipping",
    ]);
  });

  it("her tür tam olarak bir aileye düşer", () => {
    const kinds = [
      "package_or_order",
      "trade_payment",
      "refund_request",
      "boost",
      "membership",
      "reversed_invoice",
    ] as const;
    const all = kinds.flatMap((kind) => invoiceTypesOfSourceKind(kind)).sort();
    expect(all).toEqual([...Object.values(ElogoInvoiceType)].sort());
  });
});

describe("reversedInvoiceIdOf", () => {
  it("tam iade anahtarını olduğu gibi döner", () => {
    expect(reversedInvoiceIdOf("inv-1")).toBe("inv-1");
  });

  it("kısmi iade anahtarından fatura id'sini ayırır", () => {
    expect(reversedInvoiceIdOf("inv-1:attempt-7")).toBe("inv-1");
  });
});
