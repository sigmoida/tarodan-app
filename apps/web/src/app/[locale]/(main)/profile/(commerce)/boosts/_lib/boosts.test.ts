import { describe, expect, it } from "vitest";
import type { MyBoostRow } from "@tarodan/types";
import { boostDisplayStatus } from "@tarodan/shared";
import { groupBoosts, isStackedBehind, remainingParts } from "./boosts";
import { boostRow } from "./testRows";

describe("boostDisplayStatus", () => {
  it("reads a cancelled boost with money back as refunded", () => {
    expect(
      boostDisplayStatus(boostRow({ status: "cancelled", refundedAmount: 50 })),
    ).toBe("refunded");
    expect(boostDisplayStatus(boostRow({ status: "cancelled" }))).toBe(
      "cancelled",
    );
    expect(boostDisplayStatus(boostRow({ status: "expired" }))).toBe("expired");
    expect(boostDisplayStatus(boostRow({ status: "paused" }))).toBe("paused");
  });
});

describe("remainingParts", () => {
  const now = Date.parse("2026-10-22T00:00:00Z");
  it("splits days and hours and never goes negative", () => {
    expect(remainingParts("2026-10-24T05:30:00Z", now)).toEqual({
      days: 2,
      hours: 5,
    });
    expect(remainingParts("2026-10-22T03:00:00Z", now)).toEqual({
      days: 0,
      hours: 3,
    });
    expect(remainingParts("2026-10-20T00:00:00Z", now)).toEqual({
      days: 0,
      hours: 0,
    });
    expect(remainingParts(null, now)).toBeNull();
  });
});

describe("groupBoosts", () => {
  it("groups stacked boosts of one listing, oldest first, keeping the listing order", () => {
    const rows = [
      boostRow({
        id: "b2",
        startsAt: "2026-10-27T00:00:00Z",
        createdAt: "2026-10-21T00:00:00Z",
      }),
      boostRow({ id: "x1", productId: "p2" }),
      boostRow({ id: "b1" }),
    ];
    const groups = groupBoosts(rows);
    expect(groups.map((g) => g.productId)).toEqual(["p1", "p2"]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["b1", "b2"]);
  });

  it("is paused when any row is paused, reminder on when any row has it", () => {
    const [g] = groupBoosts([
      boostRow({ id: "b1", status: "paused", autoRenew: true }),
      boostRow({ id: "b2", status: "paused" }),
    ]);
    expect(g.paused).toBe(true);
    expect(g.reminderOn).toBe(true);
  });

  it("takes the gain of the oldest row that has a baseline", () => {
    const gain = { views: 4, likes: 1, clicks: 2 };
    const [g] = groupBoosts([
      boostRow({ id: "b1" }),
      boostRow({
        id: "b2",
        startsAt: "2026-10-27T00:00:00Z",
        metrics: { before: null, current: gain, gain, performanceScore: 1 },
      }),
    ]);
    expect(g.gain).toEqual(gain);
  });
});

describe("isStackedBehind", () => {
  const now = Date.parse("2026-10-22T00:00:00Z");
  it("is true for an active boost that starts later", () => {
    expect(
      isStackedBehind(boostRow({ startsAt: "2026-10-27T00:00:00Z" }), now),
    ).toBe(true);
    expect(isStackedBehind(boostRow(), now)).toBe(false);
    expect(
      isStackedBehind(
        boostRow({ status: "paused", startsAt: "2026-10-27T00:00:00Z" }),
        now,
      ),
    ).toBe(false);
  });
});
