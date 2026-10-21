/** @format */

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatDateTime } from "@/lib/format";
import { paymentReturnRoutes, type PaymentKind } from "../_lib/paymentKind";

const h = vi.hoisted(() => ({
  success: {} as Record<string, unknown>,
  fail: {} as Record<string, unknown>,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}|${JSON.stringify(values)}` : key,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/components/ui", () => ({
  SectionCard: ({ title, children }: { title?: string; children: ReactNode }) =>
    createElement("section", null, title, children),
  ButtonLink: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement("a", { href }, children),
}));
vi.mock("@/components/AuthLoadingScreen", () => ({ default: () => null }));
vi.mock("../success/_hooks/usePaymentSuccess", () => ({
  usePaymentSuccess: () => h.success,
}));
vi.mock("../fail/_hooks/usePaymentFail", () => ({
  usePaymentFail: () => h.fail,
}));

import PaymentSuccessClient from "../success/_components/PaymentSuccessClient";
import PaymentFailClient from "../fail/_components/PaymentFailClient";

const ENDS_AT = "2026-10-28T12:00:00.000Z";
const BOOST = {
  id: "boost-1",
  productId: "listing-1",
  productTitle: "Ferrari",
  endsAt: ENDS_AT,
};

/** Static markup with the entities the assertions care about decoded. */
const decode = (html: string) =>
  html.replace(/&quot;/g, '"').replace(/&amp;/g, "&");

const routes = (kind: PaymentKind, guest = false) =>
  paymentReturnRoutes(kind, {
    paymentId: "p1",
    guest,
    boostProductId: kind === "boost" ? "listing-1" : null,
  });

function success(overrides: Record<string, unknown>) {
  h.success = {
    phase: "ready",
    isCompleted: true,
    payment: { id: "p1", amount: 59, status: "completed" },
    kind: "boost",
    boost: BOOST,
    routes: routes("boost"),
    isAuthenticated: true,
    orderIdFromUrl: null,
    locale: "tr",
    ...overrides,
  };
  return decode(renderToStaticMarkup(createElement(PaymentSuccessClient)));
}

function fail(overrides: Record<string, unknown>) {
  h.fail = {
    phase: "ready",
    payment: { id: "p1", amount: 59, status: "failed" },
    isGuestCheckout: false,
    kind: "boost",
    routes: routes("boost"),
    cancelled: false,
    ...overrides,
  };
  return decode(renderToStaticMarkup(createElement(PaymentFailClient)));
}

const hrefs = (html: string) =>
  [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

beforeEach(() => {
  h.success = {};
  h.fail = {};
});

describe("payment success view", () => {
  it("boost started: names the listing and the end, links My listings and My boosts", () => {
    const html = success({});

    expect(html).toContain("payment.boost.success.title");
    expect(html).toContain(
      `payment.boost.success.description|${JSON.stringify({ listing: "Ferrari", date: formatDateTime(ENDS_AT) })}`,
    );
    expect(hrefs(html)).toEqual(["/profile/listings", "/profile/boosts"]);
    // Delivery and the "invoice under Orders" line are for goods only.
    expect(html).not.toContain("payment.estimatedDelivery");
    expect(html).not.toContain("payment.invoiceByEmail");
    expect(html).not.toContain("/profile/orders");
  });

  it("boost not yet active: the pending view with the same links", () => {
    const html = success({
      isCompleted: false,
      payment: { id: "p1", amount: 59, status: "pending" },
      boost: { ...BOOST, endsAt: null },
    });

    expect(html).toContain("payment.confirmingTitle");
    expect(html).toContain("payment.boost.success.pending");
    expect(html).not.toContain("payment.boost.success.title");
    expect(hrefs(html)).toEqual(["/profile/listings", "/profile/boosts"]);
  });

  it("boost paid but its end not known yet: still pending", () => {
    const html = success({ boost: { ...BOOST, endsAt: null } });
    expect(html).toContain("payment.boost.success.pending");
  });

  it("checkout: the order success view is unchanged", () => {
    const html = success({
      kind: "checkout",
      boost: null,
      routes: routes("checkout"),
      payment: {
        id: "p1",
        amount: 120,
        status: "completed",
        orderId: "o1",
        createdAt: "2026-10-21T10:00:00.000Z",
      },
    });

    expect(html).toContain("payment.completedTitle");
    expect(html).toContain("payment.estimatedDelivery");
    expect(html).toContain("payment.invoiceByEmail");
    expect(hrefs(html)).toEqual(["/listings", "/profile/orders/o1"]);
  });
});

describe("payment fail view", () => {
  it("boost failed: its own copy, the decline reasons, My boosts and a retry into the dialog", () => {
    const html = fail({});

    expect(html).toContain("payment.boost.fail.title");
    expect(html).toContain("payment.boost.fail.description");
    expect(html).toContain("payment.failureReasonsTitle");
    expect(hrefs(html)).toEqual([
      "/support",
      "/profile/boosts",
      "/profile/listings?boost=listing-1",
    ]);
    expect(html).not.toContain("/profile/orders");
  });

  it("boost cancelled by the buyer: the cancelled title, no description, no decline reasons", () => {
    const html = fail({ cancelled: true });

    expect(html).toContain("payment.boost.cancelled");
    expect(html).not.toContain("payment.boost.fail.title");
    expect(html).not.toContain("payment.boost.fail.description");
    expect(html).not.toContain("payment.failureReasonsTitle");
    expect(hrefs(html)).toEqual([
      "/support",
      "/profile/boosts",
      "/profile/listings?boost=listing-1",
    ]);
  });

  it("checkout: the generic failure with the orders links (no regression)", () => {
    const html = fail({ kind: "checkout", routes: routes("checkout") });

    expect(html).toContain("payment.paymentFailed");
    expect(html).toContain("payment.backToMyOrders");
    expect(html).toContain("common.tryAgain");
    expect(hrefs(html)).toEqual([
      "/support",
      "/profile/orders",
      "/profile/orders",
    ]);
  });

  it("checkout guest: one way back to the listings (no regression)", () => {
    const html = fail({
      kind: "checkout",
      isGuestCheckout: true,
      routes: routes("checkout", true),
    });

    expect(html).toContain("seller.backToListings");
    expect(hrefs(html)).toEqual(["/support", "/listings"]);
  });

  it("membership: back to the membership page instead of orders", () => {
    const html = fail({ kind: "membership", routes: routes("membership") });

    expect(html).toContain("payment.paymentFailed");
    expect(html).toContain("page.payment.paymentpageclient.uyelikSayfasinaDon");
    expect(hrefs(html)).toEqual(["/support", "/membership", "/membership"]);
  });
});
