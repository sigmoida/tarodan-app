import { PaymentStatus, TradeStatus } from "@prisma/client";
import {
  buildTradeCashPaymentRows,
  isTradeFullyPaid,
} from "../helpers/trade-payment-rows.helper";
import { TRADE_PRICING_V2 } from "../helpers/trade.constants";

/**
 * TAKAS KABULÜ (v2) — kabul iki ödeme satırı yazar, süreç iki ödemeyle başlar.
 *
 * v1'de kabul yalnız nakit farkı varsa ödeme satırı açıyordu ve farksız takas
 * doğrudan kargoya geçiyordu; platform hiçbir bedel almıyor, dört kargo
 * bacağını üstleniyordu. v2'de HER İKİ taraf öder → kabulde iki satır yazılır ve
 * takas `awaiting_payment`ta bekler.
 *
 * Tutarlar kabul anında SNAPSHOT'lanır: kural ya da tarife sonradan değişse bile
 * kabul edilmiş takasın fiyatı sabittir (siparişteki komisyon snapshot'ıyla aynı
 * ilke).
 */

const quote = {
  tradeId: "trade-1",
  commissionRuleSet: { id: "set-1", version: 1 },
  ruleMatches: [],
  initiator: {
    userId: "user-a",
    side: "initiator" as const,
    serviceFee: 35,
    shipping: 60,
    cashDifference: 0,
    total: 95,
    feeLines: [],
  },
  receiver: {
    userId: "user-b",
    side: "receiver" as const,
    serviceFee: 40,
    shipping: 60,
    cashDifference: 200,
    total: 300,
    feeLines: [],
  },
};

describe("buildTradeCashPaymentRows", () => {
  it("her iki taraf için birer ödeme satırı üretir", () => {
    const rows = buildTradeCashPaymentRows("trade-1", quote);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.payerId)).toEqual(["user-a", "user-b"]);
    expect(rows.every((r) => r.tradeId === "trade-1")).toBe(true);
    expect(rows.every((r) => r.status === PaymentStatus.pending)).toBe(true);
  });

  it("kalemleri snapshot'lar: ücret, kargo, fark ve tahsil edilecek toplam", () => {
    const [initiator, receiver] = buildTradeCashPaymentRows("trade-1", quote);

    expect(initiator).toMatchObject({
      tradeFeeAmount: 35,
      shippingAmount: 60,
      amount: 0,
      totalAmount: 95,
    });
    expect(receiver).toMatchObject({
      tradeFeeAmount: 40,
      shippingAmount: 60,
      amount: 200,
      totalAmount: 300,
    });
  });

  it("farkın alıcısını YALNIZ fark taşıyan satıra yazar", () => {
    const [initiator, receiver] = buildTradeCashPaymentRows("trade-1", quote);

    // Farkı receiver ödüyor → parayı initiator alacak.
    expect(receiver.recipientId).toBe("user-a");
    // Ücret + kargo platformda kalır; alıcısı yoktur.
    expect(initiator.recipientId).toBeNull();
  });

  it("v2 sabit ücreti tradeFeeAmount'ta tutar; legacy yüzde alanları sıfırdır", () => {
    const rows = buildTradeCashPaymentRows("trade-1", quote);

    expect(rows.every((r) => r.commission === 0)).toBe(true);
    expect(rows.every((r) => r.commissionTaxAmount === 0)).toBe(true);
  });

  it("kafa kafaya takasta da iki satır yazar (ikisi de öder)", () => {
    const evenSwap = {
      ...quote,
      receiver: { ...quote.receiver, cashDifference: 0, total: 100 },
    };

    const rows = buildTradeCashPaymentRows("trade-1", evenSwap);

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => Number(r.totalAmount) > 0)).toBe(true);
    expect(rows.every((r) => r.recipientId === null)).toBe(true);
  });
});

describe("isTradeFullyPaid", () => {
  it("iki ödeme de tamamlanınca true döner", () => {
    expect(
      isTradeFullyPaid([
        { status: PaymentStatus.completed },
        { status: PaymentStatus.completed },
      ]),
    ).toBe(true);
  });

  it("tek taraf ödediyse FALSE — süreç başlamaz", () => {
    expect(
      isTradeFullyPaid([
        { status: PaymentStatus.completed },
        { status: PaymentStatus.pending },
      ]),
    ).toBe(false);
  });

  it("hiç satır yoksa false (ödeme beklenen takas ödenmiş sayılmaz)", () => {
    expect(isTradeFullyPaid([])).toBe(false);
  });

  it("başarısız ödeme tamamlanmış saymaz", () => {
    expect(
      isTradeFullyPaid([
        { status: PaymentStatus.completed },
        { status: PaymentStatus.failed },
      ]),
    ).toBe(false);
  });
});

describe("takas kabul durumu (v2)", () => {
  it("v2 takas kabulde HER ZAMAN awaiting_payment'a gider", () => {
    // v1'de fark yoksa doğrudan shipping_to_warehouse'a geçiliyordu; v2'de
    // iki taraf da ödeyeceği için kafa kafaya takas da ödeme bekler.
    const nextStatus = TRADE_PRICING_V2 ? TradeStatus.awaiting_payment : null;
    expect(nextStatus).toBe(TradeStatus.awaiting_payment);
  });
});

describe("takas hizmet bedeli kampanyası (İ25)", () => {
  it("indirim satıra İNDİRİMLİ bedel + indirim tutarı + kampanya kimliği olarak yazılır", () => {
    // Yalnız initiator'a 20 TL indirim.
    const discounts = new Map([
      ["user-a", { discountId: "camp-1", amount: 20 }],
    ]);
    const [initiator, receiver] = buildTradeCashPaymentRows(
      "trade-1",
      quote,
      discounts,
    );

    expect(initiator).toMatchObject({
      tradeFeeAmount: 15,
      tradeFeeDiscountAmount: 20,
      tradeFeeCampaignId: "camp-1",
      totalAmount: 75,
    });
    // Karşı taraf indirimsiz: alanlar nötr kalır.
    expect(receiver).toMatchObject({
      tradeFeeAmount: 40,
      tradeFeeDiscountAmount: 0,
      tradeFeeCampaignId: null,
      totalAmount: 300,
    });
  });

  it("indirim bedeli aşamaz: bedelden büyük indirim bedele kırpılır", () => {
    const discounts = new Map([
      ["user-a", { discountId: "camp-1", amount: 500 }],
    ]);
    const [initiator] = buildTradeCashPaymentRows("trade-1", quote, discounts);

    expect(initiator.tradeFeeAmount).toBe(0);
    expect(initiator.tradeFeeDiscountAmount).toBe(35);
    // Kargo ve fark dokunulmaz: toplam yalnız bedel kadar iner.
    expect(initiator.totalAmount).toBe(60);
  });

  it("kampanyasız kabulde alanlar nötr (0 / null) yazılır", () => {
    const rows = buildTradeCashPaymentRows("trade-1", quote);
    for (const row of rows) {
      expect(row.tradeFeeDiscountAmount).toBe(0);
      expect(row.tradeFeeCampaignId).toBeNull();
    }
  });
});
