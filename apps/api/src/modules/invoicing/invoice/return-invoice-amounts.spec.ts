import type { InvoiceLineItem } from "./invoice-lines";
import {
  returnInvoiceAmountsOf,
  type ReturnInvoiceAmountsInput,
} from "./return-invoice-amounts";

/**
 * The return a refund attempt owes a sent document: its share, capped by
 * what the document carries beyond what it should carry now.
 */
describe("returnInvoiceAmountsOf", () => {
  const input = (
    over: Partial<ReturnInvoiceAmountsInput>,
  ): ReturnInvoiceAmountsInput => ({
    issued: { total: 400, net: 333.33 },
    priorReturnTotals: [],
    targetTotal: null,
    share: null,
    componentLines: [],
    ...over,
  });

  it("returns nothing for a refund the document was already cut net of (240.00 cut after a 160.00 refund)", () => {
    expect(
      returnInvoiceAmountsOf(
        input({
          issued: { total: 240, net: 200 },
          targetTotal: 240,
          share: 160,
        }),
      ),
    ).toBeNull();
  });

  it("returns the share of a refund the document still carries (400.00 cut, 160.00 refunded)", () => {
    expect(
      returnInvoiceAmountsOf(input({ targetTotal: 240, share: 160 })),
    ).toEqual({
      total: 160,
      net: 133.33,
      lines: [],
      closesDocument: false,
      capped: false,
      wanted: 160,
    });
  });

  it("reverses two refunds once each, whichever handler runs first", () => {
    // 400.00 cut, then 160.00 and 100.00 refunded: the document ends at 140.00.
    const target = 140;
    const firstA = returnInvoiceAmountsOf(
      input({ targetTotal: target, share: 160 }),
    );
    const thenB = returnInvoiceAmountsOf(
      input({
        targetTotal: target,
        share: 100,
        priorReturnTotals: [firstA?.total ?? 0],
      }),
    );
    expect([firstA?.total, thenB?.total]).toEqual([160, 100]);

    const firstB = returnInvoiceAmountsOf(
      input({ targetTotal: target, share: 100 }),
    );
    const thenA = returnInvoiceAmountsOf(
      input({
        targetTotal: target,
        share: 160,
        priorReturnTotals: [firstB?.total ?? 0],
      }),
    );
    expect([firstB?.total, thenA?.total]).toEqual([100, 160]);
  });

  it("never takes the document below its target, even when the cut already excluded one refund", () => {
    // Cut at 240.00 net of A (160.00); B (100.00) finalized later. A's late
    // handler finds room for 100.00 only, B's finds none: 240 -> 140 in all.
    const lateA = returnInvoiceAmountsOf(
      input({ issued: { total: 240, net: 200 }, targetTotal: 140, share: 160 }),
    );
    expect(lateA).toMatchObject({ total: 100, capped: true, wanted: 160 });
    expect(
      returnInvoiceAmountsOf(
        input({
          issued: { total: 240, net: 200 },
          targetTotal: 140,
          share: 100,
          priorReturnTotals: [100],
        }),
      ),
    ).toBeNull();
  });

  it("finds nothing left on a replay", () => {
    expect(
      returnInvoiceAmountsOf(
        input({ targetTotal: 240, share: 160, priorReturnTotals: [160] }),
      ),
    ).toBeNull();
  });

  it("reverses everything outstanding down to the target on a full refund", () => {
    expect(
      returnInvoiceAmountsOf(
        input({ targetTotal: 0, share: null, priorReturnTotals: [160] }),
      ),
    ).toMatchObject({ total: 240, closesDocument: true, capped: false });
  });

  it("is bounded only by the outstanding amount when the type has no target", () => {
    expect(
      returnInvoiceAmountsOf(
        input({ targetTotal: null, share: 500, priorReturnTotals: [100] }),
      ),
    ).toMatchObject({ total: 300, closesDocument: true, capped: false });
  });

  it("scales the component lines and their VAT down to the room left", () => {
    const lines: InvoiceLineItem[] = [
      {
        name: "İade edilen ürün bedeli",
        quantity: 1,
        net: 100,
        unitPrice: 100,
        vatRate: 20,
        taxAmount: 20,
      },
      {
        name: "İade edilen gidiş kargosu",
        quantity: 1,
        net: 25,
        unitPrice: 25,
        vatRate: 20,
        taxAmount: 5,
      },
    ];
    const due = returnInvoiceAmountsOf(
      input({
        issued: { total: 240, net: 200 },
        targetTotal: 165,
        componentLines: lines,
      }),
    );

    expect(due).toMatchObject({ total: 75, net: 62.5, capped: true });
    expect(due?.lines.map((l) => [l.net, l.taxAmount])).toEqual([
      [50, 10],
      [12.5, 2.5],
    ]);
  });

  it("keeps the component lines whole when the room covers them", () => {
    const lines: InvoiceLineItem[] = [
      {
        name: "İade edilen alıcı komisyonu",
        quantity: 1,
        net: 10,
        unitPrice: 10,
        vatRate: 20,
        taxAmount: 2,
      },
    ];
    expect(
      returnInvoiceAmountsOf(
        input({
          issued: { total: 36, net: 30 },
          targetTotal: 24,
          componentLines: lines,
        }),
      ),
    ).toEqual({
      total: 12,
      net: 10,
      lines,
      closesDocument: false,
      capped: false,
      wanted: 12,
    });
  });
});
