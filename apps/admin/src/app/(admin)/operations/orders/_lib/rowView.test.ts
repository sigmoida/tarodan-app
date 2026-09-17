import { describe, expect, it } from "vitest";
import type {
  AdminOrderLine,
  AdminOrderListRow,
  AdminOrderPackage,
} from "@tarodan/types";
import {
  PACKAGE_HEADER_PX,
  PACKAGE_LINE_PX,
  feeRate,
  invoiceSearchHref,
  invoiceStatusSummary,
  packageBlockMinHeight,
  packageOrderStatuses,
  priceDiffTone,
  rowDetailHref,
  rowSingleLine,
} from "./rowView";

const line = (orderId: string) => ({ orderId }) as AdminOrderLine;
const pkg = (lines: AdminOrderLine[]) => ({ lines }) as AdminOrderPackage;
const row = (overrides: Partial<AdminOrderListRow>) =>
  ({
    kind: "group",
    id: "g1",
    detailOrderId: "o1",
    offer: null,
    packages: [],
    ...overrides,
  }) as AdminOrderListRow;

describe("rowDetailHref", () => {
  it("opens the order file for carts", () => {
    expect(rowDetailHref(row({}))).toBe("/operations/orders/o1");
  });

  it("opens the offer for an offer that has no order yet", () => {
    expect(
      rowDetailHref(
        row({
          kind: "offer",
          id: "of1",
          detailOrderId: null,
          offer: { id: "of1" } as AdminOrderListRow["offer"],
        }),
      ),
    ).toBe("/operations/offers/of1");
  });
});

describe("rowSingleLine", () => {
  it("returns the only line of a one-line cart", () => {
    expect(rowSingleLine(row({ packages: [pkg([line("o1")])] }))).toEqual(
      line("o1"),
    );
  });

  it("is null for multi-line carts and offers without an order", () => {
    expect(
      rowSingleLine(row({ packages: [pkg([line("o1")]), pkg([line("o2")])] })),
    ).toBeNull();
    expect(rowSingleLine(row({ packages: [] }))).toBeNull();
  });
});

describe("feeRate", () => {
  it("is the share of the subtotal with one decimal", () => {
    expect(feeRate(12.5, 100)).toBe(12.5);
    expect(feeRate(10, 30)).toBe(33.3);
  });

  it("is null without a subtotal", () => {
    expect(feeRate(10, 0)).toBeNull();
  });
});

describe("packageBlockMinHeight", () => {
  it("grows with the package's lines so every column stays aligned", () => {
    expect(packageBlockMinHeight(pkg([line("a"), line("b")]))).toBe(
      PACKAGE_HEADER_PX + 2 * PACKAGE_LINE_PX,
    );
    expect(packageBlockMinHeight(pkg([]))).toBe(
      PACKAGE_HEADER_PX + PACKAGE_LINE_PX,
    );
  });
});

describe("invoiceSearchHref", () => {
  it("searches the invoice list by the package reference body", () => {
    expect(invoiceSearchHref("PKG-K7X9M2QF3N")).toBe(
      "/finance/invoices?q=K7X9M2QF3N",
    );
    expect(invoiceSearchHref(null)).toBeNull();
  });
});

describe("invoiceStatusSummary", () => {
  it("counts documents per status", () => {
    expect(
      invoiceStatusSummary([
        { status: "sent" },
        { status: "pending" },
        { status: "sent" },
      ]),
    ).toEqual([
      { status: "sent", count: 2 },
      { status: "pending", count: 1 },
    ]);
  });
});

describe("packageOrderStatuses", () => {
  it("lists each distinct line status once", () => {
    const lines = [
      { status: "shipped" },
      { status: "shipped" },
      { status: "refund_requested" },
    ] as AdminOrderLine[];
    expect(packageOrderStatuses(pkg(lines))).toEqual([
      "shipped",
      "refund_requested",
    ]);
  });
});

describe("priceDiffTone", () => {
  it("colors a discount against the listing as positive", () => {
    expect(priceDiffTone(250)).toBe("positive");
    expect(priceDiffTone(-100)).toBe("negative");
    expect(priceDiffTone(0)).toBe("default");
    expect(priceDiffTone(null)).toBe("default");
  });
});
