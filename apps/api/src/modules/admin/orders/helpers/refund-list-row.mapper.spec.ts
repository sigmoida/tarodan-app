import { Prisma } from "@prisma/client";
import {
  mapRefundRequestRow,
  mapTradeRefundRows,
  ratePercent,
  refundRequestMoneyStatus,
  tradeRefundRowId,
  tradeSideMoneyStatus,
  tradeWarehouseDecision,
} from "./refund-list-row.mapper";
import type {
  RefundRowAttempt,
  RefundRowInvoice,
  RefundRowPayload,
  TradeRefundPayload,
} from "./refund-list-select";

const D = (n: number | string) => new Prisma.Decimal(n);
const at = (iso: string) => new Date(iso);

const party = (id: string) => ({
  id,
  displayName: `name-${id}`,
  email: `${id}@x.com`,
  adminCode: `B-${id}`,
});

function request(overrides: Partial<RefundRowPayload> = {}): RefundRowPayload {
  return {
    id: "rr1",
    refundNumber: "RFD-AAA",
    createdAt: at("2026-10-10T09:00:00.000Z"),
    updatedAt: at("2026-10-10T09:00:00.000Z"),
    status: "return_in_transit",
    reason: "damaged",
    resolvedReason: null,
    description: "kutu ezik",
    policyCode: "seller_fault_return",
    amount: D("1060.00"),
    refundQuantity: 1,
    refundedAt: null,
    decidedAt: null,
    returnTrackingNumber: "RFD-AAA",
    returnProviderTrackingId: "SUR-9",
    returnStatus: "in_transit",
    financialComponents: [
      {
        componentCode: "product",
        treatment: "buyer_refund",
        netAmount: D(1000),
        grossAmount: D(1000),
      },
      {
        componentCode: "buyer_commission",
        treatment: "buyer_refund",
        netAmount: D(20),
        grossAmount: D(24),
      },
      {
        componentCode: "seller_commission",
        treatment: "seller_refund",
        netAmount: D(80),
        grossAmount: D(96),
      },
      {
        componentCode: "return_shipping",
        treatment: "seller_charge",
        netAmount: D(50),
        grossAmount: D(60),
      },
      {
        componentCode: "outbound_shipping",
        treatment: "buyer_charge",
        netAmount: D(25),
        grossAmount: D(30),
      },
    ],
    order: {
      id: "o1",
      orderNumber: "ORD-AAA",
      createdAt: at("2026-10-01T09:00:00.000Z"),
      origin: "direct_sale",
      isTest: false,
      quantity: 2,
      unitPrice: D(1000),
      subtotal: D(2000),
      shippingAddress: null,
      financialSnapshot: null,
      sellerCommissionAmount: D(160),
      buyerCommissionAmount: D(40),
      buyer: party("b1"),
      seller: party("s1"),
      product: {
        id: "p1",
        title: "Model araba",
        productCode: "U010001",
        price: D(1000),
      },
      checkoutGroup: { groupNumber: "GRP-AAA" },
      shipment: { trackingNumber: "PKG-AAA", providerTrackingId: "SUR-1" },
      offer: null,
    },
    ...overrides,
  } as RefundRowPayload;
}

const attempt = (
  status: RefundRowAttempt["status"],
  id = "att1",
): RefundRowAttempt =>
  ({
    id,
    idempotencyKey: "refund-request:rr1",
    status,
    amount: D(1060),
    createdAt: at("2026-10-11T09:00:00.000Z"),
    finalizedAt: null,
  }) as RefundRowAttempt;

const invoice: RefundRowInvoice = {
  id: "inv-r1",
  sourceId: "inv-1:att1",
  invoiceNumber: "TRD2026000000009",
  status: "sent",
  createdAt: at("2026-10-12T09:00:00.000Z"),
} as RefundRowInvoice;

describe("ratePercent", () => {
  it("is amount / base in percent with two decimals", () => {
    expect(ratePercent(D(200), D(2000))).toBe(10);
    expect(ratePercent(D(1), D(3))).toBe(33.33);
  });

  it("is null without a base", () => {
    expect(ratePercent(D(5), D(0))).toBeNull();
  });
});

describe("mapRefundRequestRow — direct sale", () => {
  const row = mapRefundRequestRow(request(), {
    attempt: null,
    returnInvoice: null,
  });

  it("carries the request, order and parties", () => {
    expect(row).toMatchObject({
      id: "rr1",
      refundNo: "RFD-AAA",
      createdAt: "2026-10-10T09:00:00.000Z",
      kind: "return",
      origin: "direct",
      isTest: false,
      order: {
        id: "o1",
        orderNumber: "ORD-AAA",
        groupNumber: "GRP-AAA",
        // Taşıyıcının kodu, yoksa bizim koli referansımız.
        packageTrackingNo: "SUR-1",
      },
      buyer: { id: "b1", name: "name-b1", code: "B-b1" },
      seller: { id: "s1", name: "name-s1", code: "B-s1" },
      product: {
        id: "p1",
        productCode: "U010001",
        quantity: 2,
        refundQuantity: 1,
      },
      status: "return_in_transit",
      completedAt: null,
      trade: null,
      warehouse: null,
    });
  });

  it("reads commission from the order and the refunded commission from the components", () => {
    expect(row.money).toEqual({
      unitPrice: 1000,
      // Satış komisyonu 160 + 40 = 200 → 200 / 2000.
      commissionRate: 10,
      commissionAmount: 200,
      // İade edilen satış komisyonu (KDV hariç) 20 + 80 = 100 → 100 / (1000 × 1).
      refundableCommissionRate: 10,
      refundableCommissionAmount: 100,
      listingCommissionAmount: null,
      offerCommissionAmount: null,
      priceDifference: null,
      // buyer_charge / seller_charge brüt toplamları.
      buyerDeduction: 30,
      sellerDeduction: 60,
      refundAmount: 1060,
      status: "pending",
      refundedAt: null,
    });
  });

  it("shows the return parcel with the carrier code", () => {
    expect(row.returnShipment).toEqual({
      trackingNo: "SUR-9",
      status: "in_transit",
    });
    expect(row.reason).toEqual({
      code: "damaged",
      label: null,
      note: "kutu ezik",
    });
  });

  it("prefers the reviewed reason over the buyer's claim", () => {
    const reviewed = mapRefundRequestRow(
      request({ resolvedReason: "buyer_damaged" }),
      { attempt: null, returnInvoice: null },
    );
    expect(reviewed.reason.code).toBe("buyer_damaged");
  });

  it("links the return invoice cut for the request's attempt", () => {
    const refunded = mapRefundRequestRow(
      request({
        status: "refunded",
        refundedAt: at("2026-10-12T08:00:00.000Z"),
      }),
      { attempt: attempt("finalized"), returnInvoice: invoice },
    );
    expect(refunded.returnInvoice).toEqual({
      id: "inv-r1",
      number: "TRD2026000000009",
      status: "sent",
    });
    expect(refunded.money.status).toBe("refunded");
    expect(refunded.money.refundedAt).toBe("2026-10-12T08:00:00.000Z");
    expect(refunded.completedAt).toBe("2026-10-12T08:00:00.000Z");
  });
});

describe("mapRefundRequestRow — pre-shipment cancellation", () => {
  it("has no return leg and reads as a cancellation", () => {
    const row = mapRefundRequestRow(
      request({
        policyCode: "buyer_cancellation",
        status: "approved",
        returnTrackingNumber: null,
        returnProviderTrackingId: null,
        returnStatus: null,
      }),
      { attempt: attempt("manual_review"), returnInvoice: null },
    );
    expect(row.kind).toBe("cancellation");
    expect(row.returnShipment).toBeNull();
    expect(row.money.status).toBe("refunding");
  });
});

describe("mapRefundRequestRow — offer", () => {
  it("compares the listing-price commission with the offer-price commission", () => {
    const base = request();
    const row = mapRefundRequestRow(
      request({
        order: {
          ...base.order,
          origin: "offer",
          quantity: 1,
          unitPrice: D(800),
          subtotal: D(800),
          sellerCommissionAmount: D(64),
          buyerCommissionAmount: D(16),
          // Kabul anında ilan fiyatı donmuş.
          financialSnapshot: { offer: { listingUnitPrice: 1000, amount: 800 } },
          offer: { amount: D(800) },
          checkoutGroup: null,
        },
      }),
      { attempt: null, returnInvoice: null },
    );
    expect(row.origin).toBe("offer");
    expect(row.order.groupNumber).toBeNull();
    expect(row.money).toMatchObject({
      unitPrice: 800,
      commissionRate: 10,
      commissionAmount: 80,
      offerCommissionAmount: 80,
      // Teklifin etkin oranı (%10) ilan fiyatına: 1000 × 80 / 800.
      listingCommissionAmount: 100,
      priceDifference: 200,
    });
  });
});

describe("refundRequestMoneyStatus", () => {
  it.each([
    ["refunded stamp wins", "return_delivered", true, "submitting", "refunded"],
    ["attempt in flight", "return_delivered", false, "submitting", "refunding"],
    ["attempt failed", "approved", false, "failed", "failed"],
    ["rejected request", "rejected", false, null, "none"],
    ["closed request", "cancelled", false, null, "none"],
    ["open request without attempt", "approved", false, null, "pending"],
  ] as const)("%s", (_l, status, refunded, attemptStatus, expected) => {
    expect(
      refundRequestMoneyStatus(
        { status, refundedAt: refunded ? new Date() : null },
        attemptStatus,
      ),
    ).toBe(expected);
  });
});

// ── Takas ────────────────────────────────────────────────────────────────────

type CashPaymentRow = TradeRefundPayload["cashPayments"][number];

function cashPayment(
  id: string,
  payerId: string,
  overrides: Partial<CashPaymentRow> = {},
): CashPaymentRow {
  return {
    id,
    payerId,
    recipientId: null,
    amount: D(0),
    tradeFeeAmount: D(35),
    shippingAmount: D(60),
    commission: D(0),
    commissionTaxAmount: D(0),
    totalAmount: D(95),
    status: "completed",
    refundedAt: null,
    releasedAt: null,
    fullRefundEntitled: false,
    payment: { id: `pay-${id}`, status: "completed", provider: "paytr" },
    ...overrides,
  };
}

function trade(overrides: Partial<TradeRefundPayload> = {}): TradeRefundPayload {
  return {
    id: "t1",
    tradeNumber: "TKS-AAA",
    status: "returning",
    createdAt: at("2026-10-01T09:00:00.000Z"),
    updatedAt: at("2026-10-09T09:00:00.000Z"),
    cancelledAt: null,
    cancelReason: "Ürün açıklamaya uymuyor",
    adminCancelReasonCode: null,
    refundFailureReason: null,
    firstWarehouseArrivalAt: at("2026-10-05T09:00:00.000Z"),
    isTest: false,
    initiatorId: "u-ini",
    receiverId: "u-rec",
    initiator: party("u-ini"),
    receiver: party("u-rec"),
    items: [
      {
        side: "initiator",
        quantity: 1,
        valueAtTrade: D(500),
        product: { id: "p-ini", title: "Kamyon", productCode: "U1" },
      },
      {
        side: "receiver",
        quantity: 2,
        valueAtTrade: D(300),
        product: { id: "p-rec", title: "Otobüs", productCode: "U2" },
      },
    ],
    cashPayments: [
      // Başlatan farkı (100) da ödedi; fark devam ettirene gidecekti.
      cashPayment("cp-ini", "u-ini", {
        amount: D(100),
        recipientId: "u-rec",
        totalAmount: D(195),
        status: "refunded",
        refundedAt: at("2026-10-08T09:00:00.000Z"),
        fullRefundEntitled: true,
        payment: { id: "pay-cp-ini", status: "refunded", provider: "paytr" },
      }),
      // Devam ettirenin ürünü elendi: kusurlu → bedel + kargo düşülür.
      cashPayment("cp-rec", "u-rec"),
    ],
    shipments: [
      {
        leg: "to_warehouse",
        shipperId: "u-ini",
        recipientUserId: null,
        trackingNumber: "TKS-AAA-WH-INI",
        providerTrackingId: "SUR-INI",
        status: "delivered",
        shippedAt: at("2026-10-03T09:00:00.000Z"),
        deliveredAt: at("2026-10-05T09:00:00.000Z"),
        createdAt: at("2026-10-02T09:00:00.000Z"),
      },
      {
        leg: "to_warehouse",
        shipperId: "u-rec",
        recipientUserId: null,
        trackingNumber: "TKS-AAA-WH-REC",
        providerTrackingId: null,
        status: "delivered",
        shippedAt: at("2026-10-03T09:00:00.000Z"),
        deliveredAt: at("2026-10-05T09:00:00.000Z"),
        createdAt: at("2026-10-02T09:00:00.000Z"),
      },
      {
        leg: "return",
        shipperId: "admin",
        recipientUserId: "u-ini",
        trackingNumber: "TKS-AAA-RET-INI",
        providerTrackingId: "SUR-RET-INI",
        status: "in_transit",
        shippedAt: at("2026-10-07T10:00:00.000Z"),
        deliveredAt: null,
        createdAt: at("2026-10-07T09:00:00.000Z"),
      },
      {
        leg: "return",
        shipperId: "admin",
        recipientUserId: "u-rec",
        trackingNumber: "TKS-AAA-RET-REC",
        providerTrackingId: null,
        status: "label_created",
        shippedAt: null,
        deliveredAt: null,
        createdAt: at("2026-10-07T09:00:00.000Z"),
      },
    ],
    refundAttempts: [
      {
        id: "att-ini",
        paymentId: "pay-cp-ini",
        status: "finalized",
        amount: D(195),
        createdAt: at("2026-10-07T11:00:00.000Z"),
        finalizedAt: at("2026-10-08T09:00:00.000Z"),
      },
    ],
    dispute: null,
    ...overrides,
  } as TradeRefundPayload;
}

describe("mapTradeRefundRows", () => {
  const returnInvoice = {
    ...invoice,
    id: "inv-trade",
    sourceId: "inv-fee-ini",
  } as RefundRowInvoice;
  const rows = mapTradeRefundRows(trade(), {
    returnInvoiceByCashPayment: new Map([["cp-ini", returnInvoice]]),
  });
  const [initiator, responder] = rows;

  it("is TWO rows, one per side, pointing at each other", () => {
    expect(rows).toHaveLength(2);
    expect(initiator.trade).toEqual({
      tradeId: "t1",
      tradeNumber: "TKS-AAA",
      role: "initiator",
      counterpartRefundId: tradeRefundRowId("t1", "responder"),
    });
    expect(responder.trade).toEqual({
      tradeId: "t1",
      tradeNumber: "TKS-AAA",
      role: "responder",
      counterpartRefundId: tradeRefundRowId("t1", "initiator"),
    });
    expect(initiator.id).toBe("t1:initiator");
    expect(responder.id).toBe("t1:responder");
    expect(initiator.refundNo).toBe("TKS-AAA-INI");
    expect(responder.refundNo).toBe("TKS-AAA-REC");
  });

  it("each row's buyer is its side, seller the counterpart", () => {
    expect(initiator.buyer.id).toBe("u-ini");
    expect(initiator.seller.id).toBe("u-rec");
    expect(responder.buyer.id).toBe("u-rec");
    expect(responder.seller.id).toBe("u-ini");
  });

  it("each row carries its own items, legs and the shared trade fields", () => {
    expect(initiator.product).toEqual({
      id: "p-ini",
      title: "Kamyon",
      productCode: "U1",
      quantity: 1,
      refundQuantity: 1,
    });
    expect(responder.product.quantity).toBe(2);
    expect(responder.money.unitPrice).toBe(600);
    expect(initiator.order).toEqual({
      id: "t1",
      orderNumber: "TKS-AAA",
      createdAt: "2026-10-01T09:00:00.000Z",
      groupNumber: null,
      packageTrackingNo: "SUR-INI",
    });
    expect(responder.order.packageTrackingNo).toBe("TKS-AAA-WH-REC");
    expect(initiator.kind).toBe("return");
    expect(initiator.origin).toBe("trade");
    expect(initiator.status).toBe("returning");
    // Açık takas: iade anı depo reddi (iade bacaklarının açılışı).
    expect(initiator.createdAt).toBe("2026-10-07T09:00:00.000Z");
  });

  it("reads the warehouse journey per side", () => {
    expect(initiator.warehouse).toEqual({
      arrivalStatus: "delivered",
      decision: "rejected",
      outboundAt: "2026-10-07T10:00:00.000Z",
      outboundLabelUrl: null,
      returnToCustomersStatus: "in_transit",
    });
    expect(initiator.returnShipment).toEqual({
      trackingNo: "SUR-RET-INI",
      status: "in_transit",
    });
    expect(responder.warehouse?.outboundAt).toBeNull();
    expect(responder.returnShipment).toEqual({
      trackingNo: "TKS-AAA-RET-REC",
      status: "label_created",
    });
  });

  it("the faultless side got everything back, fee included", () => {
    expect(initiator.money).toMatchObject({
      commissionRate: null,
      commissionAmount: 35,
      refundableCommissionAmount: 35,
      // Fark bu taraftan çıktı.
      priceDifference: 100,
      refundAmount: 195,
      buyerDeduction: 0,
      sellerDeduction: 0,
      status: "refunded",
      refundedAt: "2026-10-08T09:00:00.000Z",
    });
    expect(initiator.returnInvoice).toEqual({
      id: "inv-trade",
      number: "TRD2026000000009",
      status: "sent",
    });
  });

  it("the faulty side waits for the balance after fee and used shipping", () => {
    expect(responder.money).toMatchObject({
      commissionAmount: 35,
      refundableCommissionAmount: 0,
      // Fark bu tarafa ödenecekti.
      priceDifference: -100,
      // 95 − 35 bedel − 60 kargo (kargoya verildi) = 0 → iade edilecek bakiye yok.
      refundAmount: 0,
      buyerDeduction: 95,
      status: "none",
      refundedAt: null,
    });
    expect(responder.returnInvoice).toBeNull();
  });

  it("a pre-shipment cancellation refunds the full balance and is a cancellation", () => {
    const [ini] = mapTradeRefundRows(
      trade({
        status: "cancelled",
        cancelledAt: at("2026-10-02T12:00:00.000Z"),
        firstWarehouseArrivalAt: null,
        shipments: [],
        refundAttempts: [],
        cashPayments: [cashPayment("cp-ini", "u-ini")],
      }),
      { returnInvoiceByCashPayment: new Map() },
    );
    expect(ini.kind).toBe("cancellation");
    expect(ini.createdAt).toBe("2026-10-02T12:00:00.000Z");
    expect(ini.completedAt).toBe("2026-10-02T12:00:00.000Z");
    // Kargolanmadı: bedel düşülür, kargo iade edilir → 95 − 35 = 60.
    expect(ini.money).toMatchObject({
      refundAmount: 60,
      buyerDeduction: 35,
      status: "pending",
    });
  });

  it("a failure marker shows the pending side as failed", () => {
    const [ini] = mapTradeRefundRows(
      trade({
        status: "cancelled",
        cancelledAt: at("2026-10-02T12:00:00.000Z"),
        firstWarehouseArrivalAt: null,
        shipments: [],
        refundAttempts: [],
        refundFailureReason: "paytr down",
        cashPayments: [cashPayment("cp-ini", "u-ini")],
      }),
      { returnInvoiceByCashPayment: new Map() },
    );
    expect(ini.money.status).toBe("failed");
  });

  it("a side that never paid has no money row", () => {
    const [, rec] = mapTradeRefundRows(
      trade({ cashPayments: [cashPayment("cp-ini", "u-ini")] }),
      { returnInvoiceByCashPayment: new Map() },
    );
    expect(rec.money).toMatchObject({
      commissionAmount: null,
      refundableCommissionAmount: null,
      refundAmount: 0,
      buyerDeduction: 0,
      status: "none",
    });
  });
});

describe("tradeSideMoneyStatus", () => {
  const base = {
    charged: true,
    refundedAt: null,
    attemptStatus: null,
    refundFailed: false,
    expected: 60,
  } as const;

  it.each([
    ["not charged", { ...base, charged: false }, "none"],
    ["refunded", { ...base, refundedAt: new Date() }, "refunded"],
    ["attempt in flight", { ...base, attemptStatus: "submitting" }, "refunding"],
    ["attempt failed", { ...base, attemptStatus: "failed" }, "failed"],
    ["failure marker", { ...base, refundFailed: true }, "failed"],
    ["nothing refundable", { ...base, expected: 0 }, "none"],
    ["pending", base, "pending"],
  ] as const)("%s", (_l, side, expected) => {
    expect(tradeSideMoneyStatus(side)).toBe(expected);
  });
});

describe("tradeWarehouseDecision", () => {
  const leg = (name: string) =>
    ({ leg: name }) as TradeRefundPayload["shipments"][number];

  it.each([
    ["returning", [], "rejected"],
    ["cancelled", [leg("return")], "rejected"],
    ["completed", [leg("from_warehouse")], "approved"],
    ["admin_reviewing", [], "pending"],
    ["cancelled", [], null],
  ] as const)("%s → %s", (status, shipments, expected) => {
    expect(
      tradeWarehouseDecision({
        status,
        shipments: [...shipments],
      } as Pick<TradeRefundPayload, "status" | "shipments">),
    ).toBe(expected);
  });
});
