import { describe, expect, it } from "vitest";
import { invoiceProcessHref, readInvoiceProcess } from "./invoice-process";

/**
 * The invoice list links each process reference to its detail page. The API
 * only knows ids; which route an id belongs to is decided here, once.
 */
describe("invoiceProcessHref", () => {
  it.each([
    ["order", "o-1", "/operations/orders/o-1"],
    ["offer", "offer-1", "/operations/offers/offer-1"],
    ["trade", "trade-1", "/operations/trades/trade-1"],
    ["refund_request", "rr-1", "/operations/refund-requests/rr-1"],
    ["boost", "boost-1", "/marketing/boost-purchases/boost-1"],
    ["membership", "user-1", "/accounts/users/user-1"],
  ] as const)("%s → %s", (kind, targetId, href) => {
    expect(invoiceProcessHref({ kind, label: null, targetId })).toBe(href);
  });
});

describe("readInvoiceProcess", () => {
  it("keeps well-formed refs in order", () => {
    const process = {
      kind: "refund_request",
      refs: [
        { kind: "refund_request", label: "RFD-AAA", targetId: "rr-1" },
        { kind: "offer", label: "ORD-AAA", targetId: "offer-1" },
      ],
    };

    expect(readInvoiceProcess(process)).toEqual(process);
  });

  it("returns null for a missing or empty process", () => {
    expect(readInvoiceProcess(null)).toBeNull();
    expect(readInvoiceProcess(undefined)).toBeNull();
    expect(readInvoiceProcess({ kind: "order", refs: [] })).toBeNull();
  });

  it("drops refs it cannot link rather than pointing at a wrong page", () => {
    expect(
      readInvoiceProcess({
        kind: "future",
        refs: [
          { kind: "future", label: "XYZ-1", targetId: "x" },
          { kind: "order", label: "ORD-1", targetId: "" },
          { kind: "membership", label: null, targetId: "user-1" },
        ],
      }),
    ).toEqual({
      kind: "membership",
      refs: [{ kind: "membership", label: null, targetId: "user-1" }],
    });
  });
});
