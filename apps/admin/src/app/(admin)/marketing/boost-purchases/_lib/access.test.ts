import { describe, expect, it } from "vitest";
import { boostActionAccess } from "./access";
import { boostDetailActions } from "./actions";
import type { BoostPurchase } from "./types";

/** `usePermissions().can` for a role holding these keys (super admin: all). */
const holds =
  (...keys: string[]) =>
  (permission: string) =>
    keys.includes(permission);
const superAdmin = () => true;

describe("boostActionAccess", () => {
  it("lets a super admin manage and refund", () => {
    expect(boostActionAccess("super_admin", superAdmin)).toEqual({
      manage: true,
      refund: true,
    });
  });

  it("needs ads to manage and ads plus payments to refund", () => {
    expect(boostActionAccess("admin", holds("ads", "payments"))).toEqual({
      manage: true,
      refund: true,
    });
    expect(boostActionAccess("admin", holds("ads"))).toEqual({
      manage: true,
      refund: false,
    });
    expect(boostActionAccess("admin", holds("payments"))).toEqual({
      manage: false,
      refund: false,
    });
  });

  it("gives a moderator nothing, even with both permissions", () => {
    expect(boostActionAccess("moderator", holds("ads", "payments"))).toEqual({
      manage: false,
      refund: false,
    });
    expect(boostActionAccess(undefined, superAdmin)).toEqual({
      manage: false,
      refund: false,
    });
  });
});

type Facts = Pick<BoostPurchase, "status" | "source" | "refundableAmount">;
const paid = (over: Partial<Facts> = {}): Facts => ({
  status: "active",
  source: "purchase",
  refundableAmount: 59,
  ...over,
});
const grant = (over: Partial<Facts> = {}): Facts => ({
  status: "active",
  source: "admin_grant",
  refundableAmount: 0,
  ...over,
});
const FULL = { manage: true, refund: true };
const ADS_ONLY = { manage: true, refund: false };
const NONE = { manage: false, refund: false };

describe("boostDetailActions", () => {
  it("offers refund and stop on a paid boost the server calls refundable", () => {
    expect(boostDetailActions(paid(), FULL)).toMatchObject({
      refund: true,
      revoke: false,
      pause: true,
      extend: true,
    });
    expect(boostDetailActions(paid({ status: "paused" }), FULL)).toMatchObject({
      refund: true,
      resume: true,
      pause: false,
    });
  });

  it("hides the refund without payments, and every action without manage", () => {
    expect(boostDetailActions(paid(), ADS_ONLY).refund).toBe(false);
    expect(boostDetailActions(paid(), NONE)).toEqual({
      pause: false,
      resume: false,
      extend: false,
      refund: false,
      revoke: false,
    });
    expect(boostDetailActions(grant(), NONE).revoke).toBe(false);
  });

  it("never offers a refund when nothing is refundable (ended, stopped or unpaid)", () => {
    for (const status of ["expired", "cancelled", "pending"] as const) {
      expect(
        boostDetailActions(paid({ status, refundableAmount: 0 }), FULL).refund,
      ).toBe(false);
    }
    // A free grant is never refunded, whatever the amount says.
    expect(
      boostDetailActions(grant({ refundableAmount: 5 }), FULL).refund,
    ).toBe(false);
  });

  it("offers cancel grant only on a running or paused free grant", () => {
    expect(boostDetailActions(grant(), ADS_ONLY).revoke).toBe(true);
    expect(
      boostDetailActions(grant({ status: "paused" }), ADS_ONLY).revoke,
    ).toBe(true);
    expect(
      boostDetailActions(grant({ status: "cancelled" }), ADS_ONLY).revoke,
    ).toBe(false);
    expect(boostDetailActions(paid(), ADS_ONLY).revoke).toBe(false);
  });
});
