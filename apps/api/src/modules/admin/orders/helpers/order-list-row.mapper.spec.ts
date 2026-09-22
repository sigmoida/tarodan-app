import { Prisma } from "@prisma/client";
import {
  mapCartRow,
  mapOfferRow,
  type RowMapContext,
} from "./order-list-row.mapper";
import type { ListInvoice, ListLine, ListOffer } from "./order-list-select";

const NOW = new Date("2026-09-17T12:00:00.000Z");
const D = (n: number) => new Prisma.Decimal(n);

const party = (
  id: string,
  extra: Partial<{ displayName: string; email: string }> = {},
) => ({
  id,
  displayName: `name-${id}`,
  email: `${id}@x.com`,
  adminCode: `K-${id}`,
  ...extra,
});

const product = (id: string, price = 1200) => ({
  id,
  title: `title-${id}`,
  productCode: `U-${id}`,
  modelCode: `MC-${id}`,
  price: D(price),
  brand: { name: "Hot Wheels" },
  images: [{ cardKey: `img/${id}` }],
});

function line(overrides: Partial<ListLine> = {}): ListLine {
  return {
    id: "o1",
    orderNumber: "ORD-1",
    origin: "direct_sale",
    status: "paid",
    cancellationType: null,
    cancelledBy: null,
    quantity: 2,
    unitPrice: D(50),
    subtotal: D(100),
    totalAmount: D(130),
    preparingDeadline: null,
    deliveredAt: null,
    createdAt: NOW,
    checkoutGroupId: "g1",
    packageId: "p1",
    shippingAddress: null,
    financialSnapshot: null,
    sellerCommissionAmount: D(10),
    buyerCommissionAmount: D(2),
    sellerPlatformFeeAmount: D(3),
    buyerServiceFeeAmount: D(4),
    buyer: party("b1"),
    seller: party("s1"),
    product: product("pr1"),
    package: { packageNumber: "PKG-1" },
    shipment: null,
    offer: null,
    refundRequests: [],
    ...overrides,
  } as ListLine;
}

function invoice(overrides: Partial<ListInvoice>): ListInvoice {
  return {
    id: "inv",
    type: "seller_commission",
    status: "sent",
    sourceId: "p1",
    invoiceNumber: "TRD1",
    ettn: "E1",
    pdfUrl: null,
    ...overrides,
  } as ListInvoice;
}

const ctx = (invoices: ListInvoice[] = []): RowMapContext => ({
  now: NOW,
  imageUrl: (key) => (key ? `https://cdn/${key}` : null),
  invoicesBySource: invoices.reduce((map, inv) => {
    map.set(inv.sourceId, [...(map.get(inv.sourceId) ?? []), inv]);
    return map;
  }, new Map<string, ListInvoice[]>()),
});

describe("mapCartRow", () => {
  it("stacks a multi-seller cart per package, each with its own shipment", () => {
    const row = mapCartRow(
      { kind: "group", id: "g1", number: "GRP-1", createdAt: NOW },
      [
        line({
          shipment: {
            provider: "surat",
            status: "in_transit",
            trackingNumber: "INT-1",
            providerTrackingId: "SUR-1",
            shippedAt: NOW,
          },
        }),
        line({ id: "o2", orderNumber: "ORD-2", product: product("pr2") }),
        line({
          id: "o3",
          orderNumber: "ORD-3",
          packageId: "p2",
          package: { packageNumber: "PKG-2" },
          seller: party("s2"),
        }),
      ],
      ctx(),
    );

    expect(row.kind).toBe("group");
    expect(row.number).toBe("GRP-1");
    expect(row.detailOrderId).toBe("o1");
    expect(row.packages.map((p) => p.packageNumber)).toEqual([
      "PKG-1",
      "PKG-2",
    ]);
    expect(row.packages[0].lines.map((l) => l.orderNumber)).toEqual([
      "ORD-1",
      "ORD-2",
    ]);
    expect(row.packages[0].shipment).toEqual({
      provider: "surat",
      trackingNumber: "SUR-1",
      status: "in_transit",
      shippedAt: NOW.toISOString(),
    });
    expect(row.packages[1].shipment).toBeNull();
    expect(row.packages[1].seller.code).toBe("K-s2");
  });

  it("maps line product codes, brand, image and quantity pricing", () => {
    const row = mapCartRow(
      { kind: "group", id: "g1", number: "GRP-1", createdAt: NOW },
      [line({ unitPrice: null, subtotal: D(90), quantity: 3 })],
      ctx(),
    );
    expect(row.packages[0].lines[0]).toEqual(
      expect.objectContaining({
        quantity: 3,
        // unitPrice missing on an old row → subtotal / quantity
        unitPrice: 30,
        subtotal: 90,
        product: {
          id: "pr1",
          title: "title-pr1",
          productCode: "U-pr1",
          modelCode: "MC-pr1",
          brandName: "Hot Wheels",
          imageUrl: "https://cdn/img/pr1",
        },
      }),
    );
  });

  it("sums totals and splits sales commission from platform fees", () => {
    const row = mapCartRow(
      { kind: "group", id: "g1", number: "GRP-1", createdAt: NOW },
      [line(), line({ id: "o2" })],
      ctx(),
    );
    expect(row.totalAmount).toBe(260);
    expect(row.subtotal).toBe(200);
    expect(row.fees).toEqual({ salesCommission: 24, platformFee: 14 });
  });

  it("attaches invoices keyed by package and by legacy order id, once each", () => {
    const row = mapCartRow(
      { kind: "group", id: "g1", number: "GRP-1", createdAt: NOW },
      [line()],
      ctx([
        invoice({ id: "i1", sourceId: "p1" }),
        invoice({
          id: "i2",
          sourceId: "o1",
          type: "commission",
          invoiceNumber: null,
          ettn: null,
          status: "pending",
        }),
      ]),
    );
    expect(row.packages[0].invoices).toEqual([
      {
        id: "i1",
        type: "seller_commission",
        status: "sent",
        invoiceNumber: "TRD1",
        hasPdf: true,
      },
      {
        id: "i2",
        type: "commission",
        status: "pending",
        invoiceNumber: null,
        hasPdf: false,
      },
    ]);
  });

  it("shows the real guest buyer instead of the shared system account", () => {
    const row = mapCartRow(
      { kind: "group", id: "g1", number: "GRP-1", createdAt: NOW },
      [
        line({
          buyer: party("guest", {
            email: "guest@tarodan.system",
            displayName: "GUEST_SYSTEM",
          }),
          shippingAddress: { guestName: "Ayşe", guestEmail: "a@x.com" },
        }),
      ],
      ctx(),
    );
    expect(row.buyer).toEqual({
      id: "guest",
      displayName: "Ayşe",
      email: "a@x.com",
      code: null,
      isGuest: true,
    });
  });

  it("flags an open refund on the line", () => {
    const row = mapCartRow(
      { kind: "group", id: "g1", number: "GRP-1", createdAt: NOW },
      [line({ refundRequests: [{ id: "r1" }] })],
      ctx(),
    );
    expect(row.packages[0].lines[0].hasActiveRefund).toBe(true);
  });

  it("carries who cancelled the line, and null while nobody did", () => {
    const row = mapCartRow(
      { kind: "group", id: "g1", number: "GRP-1", createdAt: NOW },
      [
        line({ id: "o1", status: "cancelled", cancelledBy: "seller" }),
        line({ id: "o2" }),
      ],
      ctx(),
    );
    const lines = row.packages[0].lines;
    expect(lines.find((l) => l.orderId === "o1")?.cancelledBy).toBe("seller");
    expect(lines.find((l) => l.orderId === "o2")?.cancelledBy).toBeNull();
  });

  it("an offer order carries its offer and the frozen price difference", () => {
    const row = mapCartRow(
      { kind: "order", id: "o1", number: "ORD-1", createdAt: NOW },
      [
        line({
          origin: "offer",
          checkoutGroupId: null,
          financialSnapshot: { offer: { listingUnitPrice: 1500 } },
          offer: {
            id: "of1",
            status: "accepted",
            amount: D(1000),
            expiresAt: NOW,
            createdAt: NOW,
          },
        }),
      ],
      ctx(),
    );
    expect(row.offer).toEqual(
      expect.objectContaining({
        id: "of1",
        amount: 1000,
        listingPrice: 1500,
        listingPriceApproximate: false,
        priceDifference: 500,
        seller: expect.objectContaining({ id: "s1" }),
        product: expect.objectContaining({ id: "pr1" }),
      }),
    );
  });

  it("an offer order without the snapshot falls back to today's price, marked approximate", () => {
    const row = mapCartRow(
      { kind: "order", id: "o1", number: "ORD-1", createdAt: NOW },
      [
        line({
          origin: "offer",
          product: product("pr1", 900),
          offer: {
            id: "of1",
            status: "accepted",
            amount: D(1000),
            expiresAt: NOW,
            createdAt: NOW,
          },
        }),
      ],
      ctx(),
    );
    expect(row.offer).toEqual(
      expect.objectContaining({
        listingPrice: 900,
        listingPriceApproximate: true,
        priceDifference: -100,
      }),
    );
  });
});

describe("mapOfferRow", () => {
  function offer(overrides: Partial<ListOffer> = {}): ListOffer {
    return {
      id: "of1",
      status: "pending",
      amount: D(1000),
      expiresAt: new Date("2026-09-16T00:00:00.000Z"),
      createdAt: new Date("2026-09-15T00:00:00.000Z"),
      buyer: party("b1"),
      seller: party("s1"),
      product: product("pr1", 1250),
      order: null,
      ...overrides,
    } as ListOffer;
  }

  it("a not-yet-ordered offer is its own row, compared with the live listing price", () => {
    const row = mapOfferRow(offer(), ctx());
    expect(row).toEqual(
      expect.objectContaining({
        kind: "offer",
        id: "of1",
        number: null,
        origin: "offer",
        detailOrderId: null,
        totalAmount: 1000,
        packages: [],
        fees: { salesCommission: 0, platformFee: 0 },
      }),
    );
    expect(row.offer).toEqual(
      expect.objectContaining({
        // lapsed pending reads as expired, like the offer screens
        status: "expired",
        listingPrice: 1250,
        listingPriceApproximate: false,
        priceDifference: 250,
      }),
    );
  });

  it("an ordered offer becomes the order row with the offer attached", () => {
    // An offer's order carries no nested `offer`: the offer is the parent row.
    const orderLine: Partial<ListLine> = line({
      id: "o9",
      orderNumber: "ORD-9",
      origin: "offer",
      checkoutGroupId: null,
      status: "shipped",
    });
    delete orderLine.offer;
    const row = mapOfferRow(
      offer({
        status: "accepted",
        order: orderLine as NonNullable<ListOffer["order"]>,
      }),
      ctx(),
    );
    expect(row.kind).toBe("order");
    expect(row.number).toBe("ORD-9");
    expect(row.detailOrderId).toBe("o9");
    expect(row.offer?.id).toBe("of1");
    expect(row.packages[0].lines[0].status).toBe("shipped");
  });
});
