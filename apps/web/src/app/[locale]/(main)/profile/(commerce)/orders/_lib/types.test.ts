/** @format */

import { describe, expect, it } from "vitest";
import {
  isDigitalPackage,
  isGroupCancellable,
  isOrderCancellable,
  type Order,
  type ServerOrderGroup,
  type ServerPackageView,
} from "./types";

/**
 * The list-level order rules that read the digital-order signals. Two names
 * share the word `kind`: a group view's own `kind` ("group" | "package" |
 * "synthetic") says how the orders are grouped, an order's `kind` says what
 * it sells. Only the order's decides, so a listing cart stays cancellable and
 * keeps its parcel whatever its group kind, also when the API sends no
 * per-order `kind`. The guest track page passes only status and shipment
 * (the guest track response carries no kind), so it keeps the listing rules.
 */

const listing = (overrides: Partial<Order> = {}): Order => ({
  id: "o1",
  orderNumber: "ORD-1",
  status: "paid",
  createdAt: "2026-10-20T09:00:00.000Z",
  isBuyer: true,
  ...overrides,
});

const pkg = (orders: Order[]): ServerPackageView => ({
  id: "pkg1",
  packageNumber: "PKG-1",
  sellerId: "s1",
  seller: null,
  shippingCost: 50,
  cargo: null,
  orders,
});

const group = (
  kind: ServerOrderGroup["kind"],
  orders: Order[],
): ServerOrderGroup => ({
  kind,
  id: "g1",
  groupNumber: "GRP-1",
  totalAmount: 1100,
  status: "paid",
  createdAt: "2026-10-20T09:00:00.000Z",
  viewerRole: "buyer",
  payment: null,
  packages: [pkg(orders)],
  orders,
});

const GROUP_KINDS: Array<ServerOrderGroup["kind"]> = [
  "group",
  "package",
  "synthetic",
];

describe.each(GROUP_KINDS)("a listing cart in a %s view", (groupKind) => {
  it("is group cancellable with or without a per-order kind", () => {
    expect(isGroupCancellable(group(groupKind, [listing()]))).toBe(true);
    expect(
      isGroupCancellable(
        group(groupKind, [
          listing({ kind: "listing" }),
          listing({ id: "o2", kind: "listing" }),
        ]),
      ),
    ).toBe(true);
  });

  it("keeps its parcel", () => {
    const view = group(groupKind, [listing()]);
    expect(isDigitalPackage(view.packages[0])).toBe(false);
  });
});

describe("isDigitalPackage", () => {
  it("is true only when every order in the package is digital", () => {
    expect(isDigitalPackage(pkg([listing({ kind: "boost" })]))).toBe(true);
    expect(
      isDigitalPackage(
        pkg([
          listing({ kind: "membership" }),
          listing({ id: "o2", origin: "platform_service" }),
        ]),
      ),
    ).toBe(true);
  });

  it("keeps the parcel of a package that holds any listing order", () => {
    expect(
      isDigitalPackage(
        pkg([listing({ kind: "boost" }), listing({ id: "o2" })]),
      ),
    ).toBe(false);
    expect(isDigitalPackage(pkg([listing({ kind: "listing" })]))).toBe(false);
  });

  it("is false for an empty package", () => {
    expect(isDigitalPackage(pkg([]))).toBe(false);
  });
});

describe("isOrderCancellable", () => {
  it("lets a listing line be cancelled before handover", () => {
    for (const status of ["pending_payment", "paid", "preparing"]) {
      expect(isOrderCancellable(listing({ status, kind: "listing" }))).toBe(
        true,
      );
    }
    expect(
      isOrderCancellable(
        listing({
          status: "preparing",
          shipment: { trackingNumber: null, status: "label_created" },
        }),
      ),
    ).toBe(true);
  });

  it("lets `kind: listing` win over a stale isMembership", () => {
    expect(
      isOrderCancellable(listing({ kind: "listing", isMembership: true })),
    ).toBe(true);
  });

  it("treats a kind it does not know yet as digital", () => {
    expect(
      isOrderCancellable({ status: "paid", isBuyer: true, kind: "gift_card" }),
    ).toBe(false);
  });

  describe("with the guest track shape (status and shipment only)", () => {
    const guest = (
      status: string,
      shipment: { status: string; shippedAt?: string | null } | null,
    ) => isOrderCancellable({ status, shipment });

    it("is cancellable before handover", () => {
      expect(guest("pending_payment", null)).toBe(true);
      expect(guest("paid", null)).toBe(true);
      expect(guest("preparing", { status: "pending" })).toBe(true);
      expect(guest("preparing", { status: "label_created" })).toBe(true);
    });

    it("is not cancellable once handed to the carrier or closed", () => {
      expect(
        guest("preparing", {
          status: "label_created",
          shippedAt: "2026-10-21T09:00:00.000Z",
        }),
      ).toBe(false);
      expect(guest("preparing", { status: "in_transit" })).toBe(false);
      expect(guest("shipped", { status: "in_transit" })).toBe(false);
      expect(guest("delivered", { status: "delivered" })).toBe(false);
      expect(guest("cancelled", null)).toBe(false);
    });
  });
});
