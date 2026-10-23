/** @format */

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderDetail } from "./_lib/types";

/**
 * The order detail screen for digital orders (membership, boost): every
 * physical-goods section is gone, the product and the platform seller are
 * static text (D4), and the order number, title, price and paid total stay.
 * The service fee row stays data-driven (shown only when above zero, which a
 * digital order never is); only the shipping row is gated.
 * Each digital case reuses the listing order's data (shipment, address,
 * delivered status, open refund window, deadline) and changes only the
 * signals `isDigitalOrder` reads, so a pass proves the gate. The listing case
 * pins that a physical order renders every section as before.
 */

const hooks = vi.hoisted(() => ({ savedAddressesEnabled: [] as boolean[] }));

vi.mock("next-intl", async (importOriginal) => ({
  // `createTranslator` stays real: the status label reads the catalog.
  ...(await importOriginal<typeof import("next-intl")>()),
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    key === "common.dateLocale"
      ? "tr-TR"
      : values
        ? `${key}|${JSON.stringify(values)}`
        : key,
  useLocale: () => "tr",
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/components/OptimizedImage", () => ({ default: () => null }));
vi.mock("@/components/UserAvatar", () => ({ default: () => null }));
vi.mock("@/components/CityDistrictSelector", () => ({ default: () => null }));
vi.mock("@/components/ui", async () => {
  const { SellerChip } = await import("@/components/ui/SellerChip");
  return {
    SellerChip,
    SectionCard: ({
      title,
      children,
    }: {
      title?: string;
      children: ReactNode;
    }) => createElement("section", null, title, children),
    CopyButton: () => null,
    ButtonLink: ({ href, children }: { href: string; children: ReactNode }) =>
      createElement("a", { href }, children),
  };
});
vi.mock("@/hooks/useTimingPolicy", async () => {
  const { FALLBACK_TIMING_POLICY } = await import("@/lib/timing-policy");
  return {
    useTimingPolicy: () => FALLBACK_TIMING_POLICY,
    useTimingValues: () => ({}),
  };
});
vi.mock("@/lib/api", () => ({ ordersApi: {} }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined }),
}));
vi.mock("./_hooks/useOrderDetail", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false });
  return {
    useReactivateOrder: mutation,
    useUpdateOrderStatus: mutation,
    useConfirmDelivery: mutation,
    useDownloadElogoInvoice: mutation,
    useDownloadSellerInvoice: mutation,
    useUploadSellerInvoice: mutation,
    useSetAddressAndPay: mutation,
    useElogoInvoices: () => ({ data: [] }),
    // The API answers the buyer of any order; the section must not ask (or
    // show) it for a digital order, which passes no order here.
    useSellerInvoice: (_id: string, order: unknown) => ({
      data: order
        ? {
            invoice: null,
            canUpload: false,
            isSeller: false,
            isBuyer: true,
            sellerIssuesInvoice: false,
          }
        : undefined,
    }),
    useSavedAddresses: (enabled: boolean) => {
      hooks.savedAddressesEnabled.push(enabled);
      return { data: [], isSuccess: false, isError: false };
    },
  };
});

import OrderItemBlock from "./_sections/OrderItemBlock";
import PartyCard from "./_sections/PartyCard";
import PaymentSection from "./_sections/PaymentSection";
import ShippingAddressCard from "./_sections/ShippingAddressCard";
import ShippingInfoCard from "./_sections/ShippingInfoCard";

type Signals = Pick<OrderDetail, "kind" | "origin" | "isMembership">;

const DIGITAL: Array<[string, Signals]> = [
  ["boost", { kind: "boost" }],
  ["membership", { kind: "membership" }],
  ["no kind, origin platform_service", { origin: "platform_service" }],
  ["no kind, deprecated isMembership", { isMembership: true }],
];
const LISTING: Signals = { kind: "listing" };

/** A delivered order with every physical-goods signal present. */
const delivered = (signals: Signals, overrides: Partial<OrderDetail> = {}) =>
  ({
    id: "o1",
    orderNumber: "ORD-1",
    ...signals,
    status: "delivered",
    totalAmount: 1100,
    amount: 1100,
    commissionAmount: 0,
    shippingCost: 50,
    pricing: {
      subtotal: 1000,
      shippingAmount: 50,
      buyerFeeAmount: 50,
      sellerFeeAmount: 0,
      commissionAmount: 0,
      totalAmount: 1100,
      sellerNetAmount: 1000,
    },
    createdAt: "2026-10-20T09:00:00.000Z",
    updatedAt: "2026-10-22T09:00:00.000Z",
    deliveredAt: "2026-10-22T09:00:00.000Z",
    returnWindowEndsAt: "2099-01-01T00:00:00.000Z",
    escrowReleaseAt: "2099-01-05T00:00:00.000Z",
    product: { id: "p1", title: "Model car", status: "sold" },
    buyer: { id: "b1", displayName: "Buyer" },
    seller: { id: "s1", displayName: "Seller" },
    shippingAddress: {
      id: "a1",
      title: "Home",
      addressLine1: "Street 1",
      district: "Kadikoy",
      city: "Istanbul",
      postalCode: "34000",
    },
    shipment: {
      id: "sh1",
      provider: "surat",
      trackingNumber: "T1",
      cargoCode: "CARGO-1",
      status: "delivered",
      shippedAt: "2026-10-21T09:00:00.000Z",
    },
    isBuyer: true,
    isSeller: false,
    hasProductRating: false,
    payment: {
      id: "pay1",
      status: "completed",
      amount: 1100,
      provider: "card",
    },
    ...overrides,
  }) as OrderDetail;

/** A paid order not yet shipped, with a future ship-by deadline. */
const paid = (signals: Signals, overrides: Partial<OrderDetail> = {}) =>
  delivered(signals, {
    status: "paid",
    deliveredAt: null,
    returnWindowEndsAt: null,
    escrowReleaseAt: null,
    shipment: undefined,
    preparingDeadline: "2099-01-01T09:00:00.000Z",
    ...overrides,
  });

const handlers = {
  onReview: vi.fn(),
  onRequestRefund: vi.fn(),
  onCancelOrder: vi.fn(),
};

const block = (order: OrderDetail) =>
  renderToStaticMarkup(
    createElement(OrderItemBlock, {
      order,
      showHeading: true,
      allowLineCancel: true,
      handlers,
    }),
  );
const render = (node: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(node);

/** Markers of each physical-goods section (catalog keys under the mocked `t`). */
const DELIVERED_SECTIONS = {
  escrow: "order.payoutRelease",
  confirmDelivery: "order.confirmDeliveryTitle",
  review: "review.writeReview",
  refund: "order.requestRefundTitle",
  shippingRow: "checkout.shipping",
  sellerInvoice: "order.sellerInvoice",
  productLink: 'href="/listings/p1"',
} as const;
const PAID_SECTIONS = {
  preparingDeadline: "order.preparingDeadlineTitle",
  lineCancel: "order.cancelOrder",
} as const;

beforeEach(() => {
  hooks.savedAddressesEnabled = [];
});

describe("order detail for a listing order (unchanged)", () => {
  it("shows every physical-goods section once delivered", () => {
    const html = block(delivered(LISTING));
    for (const marker of Object.values(DELIVERED_SECTIONS)) {
      expect(html).toContain(marker);
    }
    expect(html).toContain("order.serviceFee");
  });

  it("shows the ship-by note and the line cancel while paid", () => {
    const html = block(paid(LISTING));
    for (const marker of Object.values(PAID_SECTIONS)) {
      expect(html).toContain(marker);
    }
  });

  it("shows the submitted review once rated", () => {
    expect(block(delivered(LISTING, { hasProductRating: true }))).toContain(
      "review.yourReview",
    );
  });

  it("shows the seller the prepare action and the payout summary", () => {
    const html = block(paid(LISTING, { isBuyer: false, isSeller: true }));
    expect(html).toContain("order.markAsPreparing");
    expect(html).toContain("order.sellerPayout");
  });

  it("shows the address, the shipping card, a linked seller and the payment form", () => {
    expect(
      render(createElement(ShippingAddressCard, { order: delivered(LISTING) })),
    ).toContain("address.deliveryAddress");
    expect(
      render(createElement(ShippingInfoCard, { order: delivered(LISTING) })),
    ).toContain("CARGO-1");
    expect(
      render(createElement(PartyCard, { order: delivered(LISTING) })),
    ).toContain('href="/seller/s1"');
    expect(
      render(
        createElement(PaymentSection, {
          order: paid(LISTING, { status: "pending_payment" }),
        }),
      ),
    ).toContain("payment.completeYourPayment");
    expect(hooks.savedAddressesEnabled).toEqual([true]);
  });
});

describe.each(DIGITAL)(
  "order detail for a digital order (%s)",
  (_, signals) => {
    it("hides every physical-goods section once completed or delivered", () => {
      for (const status of ["delivered", "completed"]) {
        const html = block(delivered(signals, { status }));
        for (const [section, marker] of Object.entries(DELIVERED_SECTIONS)) {
          expect(html, `${status}: ${section}`).not.toContain(marker);
        }
      }
    });

    it("hides the ship-by note and the line cancel while paid", () => {
      const html = block(paid(signals));
      for (const [section, marker] of Object.entries(PAID_SECTIONS)) {
        expect(html, section).not.toContain(marker);
      }
    });

    it("hides the submitted review", () => {
      expect(
        block(delivered(signals, { hasProductRating: true })),
      ).not.toContain("review.yourReview");
    });

    it("keeps the order number, the title as text, the price and the paid total", () => {
      const html = block(delivered(signals, { status: "completed" }));
      expect(html).toContain("#ORD-1");
      expect(html).toContain("Model car");
      expect(html).not.toContain("<a");
      expect(html).toContain("order.productAmount");
      expect(html).toContain("order.paidAmount");
    });

    it("shows the platform account no prepare action or seller payout", () => {
      const html = block(paid(signals, { isBuyer: false, isSeller: true }));
      expect(html).not.toContain("order.markAsPreparing");
      expect(html).not.toContain("order.cargoReference");
      expect(html).not.toContain("order.sellerPayout");
    });

    it("hides the address and the shipping card", () => {
      expect(
        render(
          createElement(ShippingAddressCard, { order: delivered(signals) }),
        ),
      ).toBe("");
      expect(
        render(createElement(ShippingInfoCard, { order: delivered(signals) })),
      ).toBe("");
    });

    it("shows the seller as static text with no profile link", () => {
      const html = render(
        createElement(PartyCard, { order: delivered(signals) }),
      );
      expect(html).toContain("Seller");
      expect(html).not.toContain("<a");
      expect(html).not.toContain("seller.viewProfile");
    });

    it("offers no address form and fetches no saved addresses while unpaid", () => {
      const html = render(
        createElement(PaymentSection, {
          order: paid(signals, { status: "pending_payment" }),
        }),
      );
      expect(html).toBe("");
      expect(hooks.savedAddressesEnabled).toEqual([false]);
    });
  },
);
