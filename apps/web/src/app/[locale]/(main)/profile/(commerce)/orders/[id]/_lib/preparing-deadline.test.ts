import { describe, expect, it } from "vitest";
import { preparingDeadlineNoticeOf } from "./preparing-deadline";
import type { OrderDetail } from "./types";

/**
 * Kargoya verme son tarihi notu — tarih sunucudan gelir (uzatmada yeni tarih),
 * not yalnız parası alınmış, koli taşıyıcıya devredilmemiş ve son tarihi
 * geçmemiş siparişte görünür: sunucunun yapmayacağı bir iptali vaat etmez.
 */
const NOW = new Date("2026-10-08T09:00:00.000Z");

const order = (overrides: Partial<OrderDetail> = {}) =>
  ({
    id: "o1",
    orderNumber: "ORD-1",
    status: "preparing",
    isBuyer: true,
    isSeller: false,
    preparingDeadline: "2026-10-10T09:00:00.000Z",
    preparingExtendedAt: null,
    ...overrides,
  }) as OrderDetail;

const shipment = (
  status: string,
  shippedAt: string | null = null,
): OrderDetail["shipment"] => ({
  id: "s1",
  provider: "surat",
  trackingNumber: null,
  status,
  shippedAt,
});

describe("preparingDeadlineNoticeOf", () => {
  it("shows the server's deadline to the buyer", () => {
    expect(preparingDeadlineNoticeOf(order(), NOW)).toEqual({
      deadline: "2026-10-10T09:00:00.000Z",
      extended: false,
      audience: "buyer",
    });
  });

  it("marks the one-time extension and picks the seller's copy for the seller", () => {
    expect(
      preparingDeadlineNoticeOf(
        order({
          isBuyer: false,
          isSeller: true,
          preparingExtendedAt: "2026-10-07T09:00:00.000Z",
        }),
        NOW,
      ),
    ).toEqual({
      deadline: "2026-10-10T09:00:00.000Z",
      extended: true,
      audience: "seller",
    });
  });

  it("keeps showing while the label exists but the parcel is not handed over", () => {
    expect(
      preparingDeadlineNoticeOf(
        order({ shipment: shipment("label_created") }),
        NOW,
      ),
    ).not.toBeNull();
  });

  it("is hidden once the parcel is with the carrier — same rule as the server sweep", () => {
    // Hareket eden durum.
    expect(
      preparingDeadlineNoticeOf(
        order({ shipment: shipment("in_transit") }),
        NOW,
      ),
    ).toBeNull();
    // SEAM-B1: durum hâlâ `pending` ama `shippedAt` mührü var → tarama iptal
    // etmez; "otomatik iptal edilir" denmemeli.
    expect(
      preparingDeadlineNoticeOf(
        order({ shipment: shipment("pending", "2026-10-08T08:00:00.000Z") }),
        NOW,
      ),
    ).toBeNull();
  });

  it("is hidden once the deadline has passed (the next sweep decides)", () => {
    expect(
      preparingDeadlineNoticeOf(
        order({ preparingDeadline: "2026-10-08T08:59:00.000Z" }),
        NOW,
      ),
    ).toBeNull();
    expect(
      preparingDeadlineNoticeOf(
        order({ preparingDeadline: NOW.toISOString() }),
        NOW,
      ),
    ).toBeNull();
  });

  it("is hidden for closed orders, without a deadline, for memberships and outsiders", () => {
    expect(
      preparingDeadlineNoticeOf(order({ status: "shipped" }), NOW),
    ).toBeNull();
    expect(
      preparingDeadlineNoticeOf(order({ status: "cancelled" }), NOW),
    ).toBeNull();
    expect(
      preparingDeadlineNoticeOf(order({ preparingDeadline: null }), NOW),
    ).toBeNull();
    expect(
      preparingDeadlineNoticeOf(order({ orderNumber: "MEM-1" }), NOW),
    ).toBeNull();
    expect(
      preparingDeadlineNoticeOf(
        order({ isBuyer: false, isSeller: false }),
        NOW,
      ),
    ).toBeNull();
  });
});
