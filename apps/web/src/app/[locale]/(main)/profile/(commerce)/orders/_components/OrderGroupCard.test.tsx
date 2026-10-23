/** @format */

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Order, ServerOrderGroup } from "../_lib/types";

/**
 * The orders list card for digital orders (membership, boost). The API keeps
 * them out of `GET /orders/groups`, so this guard is defensive: should one
 * arrive, its title is not a link to a listing that does not exist (D4) and
 * it offers no reorder, review, refund, cancel or parcel tracking. A listing
 * card with the same data keeps every one of them.
 */

vi.mock("next-intl", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next-intl")>()),
  useTranslations: () => (key: string) => key,
  useLocale: () => "tr",
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/components/OptimizedImage", () => ({ default: () => null }));

import OrderGroupCard from "./OrderGroupCard";

type Signals = Pick<Order, "kind" | "origin" | "isMembership">;

const order = (signals: Signals, status: string): Order => ({
  id: "o1",
  orderNumber: "ORD-1",
  ...signals,
  status,
  createdAt: "2026-10-20T09:00:00.000Z",
  product: { id: "p1", title: "Model car" },
  seller: { id: "s1", displayName: "Seller" },
  shipment:
    status === "paid"
      ? undefined
      : {
          trackingNumber: "T1",
          cargoCode: "CARGO-1",
          provider: "surat",
          status: "delivered",
          shippedAt: "2026-10-21T09:00:00.000Z",
        },
  isBuyer: true,
  isSeller: false,
  hasProductRating: false,
  hasSellerRating: false,
  pricing: {
    subtotal: 1000,
    shippingAmount: 50,
    buyerFeeAmount: 50,
    sellerFeeAmount: 0,
    commissionAmount: 0,
    totalAmount: 1100,
    sellerNetAmount: 1000,
  },
});

const group = (o: Order): ServerOrderGroup => ({
  kind: "synthetic",
  id: o.id,
  groupNumber: "GRP-1",
  totalAmount: 1100,
  status: o.status,
  createdAt: o.createdAt,
  viewerRole: "buyer",
  payment: null,
  packages: [
    {
      id: "pkg1",
      packageNumber: "PKG-1",
      sellerId: "s1",
      seller: null,
      shippingCost: 50,
      cargo: {
        trackingNumber: "T1",
        cargoCode: "CARGO-1",
        provider: "surat",
        status: "delivered",
      },
      orders: [o],
    },
  ],
  orders: [o],
});

const card = (o: Order) =>
  renderToStaticMarkup(
    createElement(OrderGroupCard, {
      group: group(o),
      onCancelGroup: vi.fn(),
      actions: {
        role: "buyer",
        downloadingId: null,
        onInvoice: vi.fn(),
        onReorder: vi.fn(),
        onReview: vi.fn(),
      },
    }),
  );

const DELIVERED_MARKERS = {
  productLink: 'href="/listings/model-car-p1"',
  reorder: "order.reorder",
  review: "review.writeReview",
  refund: "order.requestRefund",
  parcel: "PKG-1",
  cargo: "CARGO-1",
  tracking: "order.trackOrder",
} as const;

describe("orders list card for a listing order (unchanged)", () => {
  it("links the title and offers reorder, review, refund and tracking", () => {
    const html = card(order({ kind: "listing" }, "delivered"));
    for (const marker of Object.values(DELIVERED_MARKERS)) {
      expect(html).toContain(marker);
    }
  });

  it("offers the group cancel while paid", () => {
    expect(card(order({ kind: "listing" }, "paid"))).toContain(
      "order.cancelShort",
    );
  });
});

describe.each<[string, Signals]>([
  ["boost", { kind: "boost" }],
  ["membership", { kind: "membership" }],
  ["no kind, origin platform_service", { origin: "platform_service" }],
  ["no kind, deprecated isMembership", { isMembership: true }],
])("orders list card for a digital order (%s)", (_, signals) => {
  it("shows the title as text and offers none of the goods actions", () => {
    const html = card(order(signals, "delivered"));
    expect(html).toContain("Model car");
    for (const [what, marker] of Object.entries(DELIVERED_MARKERS)) {
      expect(html, what).not.toContain(marker);
    }
  });

  it("offers no group cancel while paid", () => {
    expect(card(order(signals, "paid"))).not.toContain("order.cancelShort");
  });
});

/** The seller's tab: the same order seen by its seller. */
const sellerCard = (o: Order) =>
  renderToStaticMarkup(
    createElement(OrderGroupCard, {
      group: { ...group(o), viewerRole: "seller" },
      onCancelGroup: vi.fn(),
      actions: {
        role: "seller",
        downloadingId: null,
        onInvoice: vi.fn(),
        onReorder: vi.fn(),
        onReview: vi.fn(),
      },
    }),
  );

const asSeller = (o: Order): Order => ({
  ...o,
  isBuyer: false,
  isSeller: true,
});

describe("orders list card in the seller's tab", () => {
  it("offers the listing seller the invoice upload and the cargo code", () => {
    const preparing = asSeller(order({ kind: "listing" }, "preparing"));
    const html = sellerCard({ ...preparing, shipment: undefined });
    expect(html).toContain("order.invoice");
    expect(html).toContain("order.viewCargoCode");
    expect(html).toContain("order.netToYou");
  });

  it.each<[string, Signals]>([
    ["boost", { kind: "boost" }],
    ["membership", { kind: "membership" }],
    ["no kind, origin platform_service", { origin: "platform_service" }],
    ["no kind, deprecated isMembership", { isMembership: true }],
  ])(
    "offers the platform account neither for a digital order (%s)",
    (_, signals) => {
      const preparing = asSeller(order(signals, "preparing"));
      const html = sellerCard({ ...preparing, shipment: undefined });
      expect(html).not.toContain("order.invoice");
      expect(html).not.toContain("order.viewCargoCode");
    },
  );
});

describe("orders list card for a cart mixing a listing and a digital order", () => {
  // Not produced by checkout today (services have their own checkout); the
  // card must still gate per order, never per group.
  const mixed = (): ServerOrderGroup => {
    const physical = order({ kind: "listing" }, "delivered");
    const digital: Order = {
      ...order({ kind: "boost" }, "delivered"),
      id: "o2",
      orderNumber: "ORD-2",
      product: { id: "p2", title: "Boost" },
      shipment: undefined,
    };
    const base = group(physical);
    return {
      ...base,
      orders: [physical, digital],
      packages: [
        base.packages[0],
        {
          ...base.packages[0],
          id: "pkg2",
          packageNumber: "PKG-2",
          cargo: null,
          orders: [digital],
        },
      ],
    };
  };

  const render = () =>
    renderToStaticMarkup(
      createElement(OrderGroupCard, {
        group: mixed(),
        onCancelGroup: vi.fn(),
        actions: {
          role: "buyer",
          downloadingId: null,
          onInvoice: vi.fn(),
          onReorder: vi.fn(),
          onReview: vi.fn(),
        },
      }),
    );

  it("keeps every goods action and the parcel of the listing order", () => {
    const html = render();
    for (const [what, marker] of Object.entries(DELIVERED_MARKERS)) {
      expect(html, what).toContain(marker);
    }
  });

  it("gives the digital order no link and no parcel", () => {
    const html = render();
    expect(html).toContain("Boost");
    expect(html).not.toContain('href="/listings/p2"');
    expect(html).not.toContain("PKG-2");
  });
});
