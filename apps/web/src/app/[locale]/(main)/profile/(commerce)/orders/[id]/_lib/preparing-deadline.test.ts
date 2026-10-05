import { describe, expect, it } from "vitest";
import { preparingDeadlineNoticeOf } from "./preparing-deadline";
import type { OrderDetail } from "./types";

/**
 * Kargoya verme son tarihi notu — tarih sunucudan gelir (uzatmada yeni tarih),
 * not yalnız parası alınmış, henüz yola çıkmamış siparişte görünür.
 */
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

describe("preparingDeadlineNoticeOf", () => {
  it("shows the server's deadline to the buyer", () => {
    expect(preparingDeadlineNoticeOf(order())).toEqual({
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
      ),
    ).toEqual({
      deadline: "2026-10-10T09:00:00.000Z",
      extended: true,
      audience: "seller",
    });
  });

  it("is hidden once the parcel is with the carrier or the order is closed", () => {
    expect(
      preparingDeadlineNoticeOf(
        order({
          shipment: {
            id: "s1",
            provider: "surat",
            trackingNumber: null,
            status: "in_transit",
          },
        }),
      ),
    ).toBeNull();
    expect(preparingDeadlineNoticeOf(order({ status: "shipped" }))).toBeNull();
    expect(
      preparingDeadlineNoticeOf(order({ status: "cancelled" })),
    ).toBeNull();
  });

  it("is hidden without a deadline, for memberships and for outsiders", () => {
    expect(
      preparingDeadlineNoticeOf(order({ preparingDeadline: null })),
    ).toBeNull();
    expect(
      preparingDeadlineNoticeOf(order({ orderNumber: "MEM-1" })),
    ).toBeNull();
    expect(
      preparingDeadlineNoticeOf(order({ isBuyer: false, isSeller: false })),
    ).toBeNull();
  });
});
