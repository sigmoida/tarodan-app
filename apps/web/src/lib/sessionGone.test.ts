import { describe, expect, it } from "vitest";
import { isSessionPreservedPath } from "./sessionGone";

describe("isSessionPreservedPath", () => {
  it.each([
    "/checkout",
    "/tr/checkout",
    "/cart",
    "/cart/payment",
    "/membership/checkout",
    "/payment/abc",
    "/en/payment/success",
    "/payment-options",
  ])("keeps the session on %s", (path) => {
    expect(isSessionPreservedPath(path)).toBe(true);
  });

  it.each([
    "/",
    "/profile/payments",
    "/profile/payment-methods",
    "/tr/profile/payments",
    "/listings/cartoon-figure",
    "/listings/payment-terminal-toy",
  ])("does not keep the session on %s", (path) => {
    expect(isSessionPreservedPath(path)).toBe(false);
  });
});
