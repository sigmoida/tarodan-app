import { Prisma } from "@prisma/client";
import { holdRefundedAmountAfter } from "./hold-consumption";

/**
 * Worked example (PAYMENTS.md §5): product 1000 for two units, buyer shipping
 * 60, seller shipping 40 (+20% VAT = 48 gross), fees 80 + 100 → hold 860.
 */
describe("holdRefundedAmountAfter — one formula for hold consumption", () => {
  const consumed = (input: Parameters<typeof holdRefundedAmountAfter>[0]) =>
    holdRefundedAmountAfter(input).toNumber();

  it("takes this refund's slice by portion, on top of earlier slices", () => {
    expect(consumed({ amount: 860, refundedAmount: 0, portion: 0.5 })).toBe(
      430,
    );
    expect(consumed({ amount: 860, refundedAmount: 430, portion: 0.5 })).toBe(
      860,
    );
  });

  it("rounds the slice to the kurus, half up, in Decimal", () => {
    // 1000.01 × 1/3 = 333.3366… → 333.34
    expect(
      holdRefundedAmountAfter({
        amount: "1000.01",
        refundedAmount: null,
        portion: 1 / 3,
      }).toString(),
    ).toBe("333.34");
  });

  it("clamps the portion to [0, 1] and the result to [0, amount]", () => {
    expect(consumed({ amount: 860, refundedAmount: 0, portion: 2 })).toBe(860);
    expect(consumed({ amount: 860, refundedAmount: 0, portion: -1 })).toBe(0);
    expect(consumed({ amount: 860, refundedAmount: 900, portion: 0 })).toBe(
      860,
    );
  });

  describe("retained seller shipping share", () => {
    it("single full refund leaves the share (amount − retained consumed)", () => {
      expect(
        consumed({ amount: 860, refundedAmount: 0, portion: 1, retained: 48 }),
      ).toBe(812);
    });

    it("line-completing refund after a partial leaves the share too", () => {
      // 430 earlier + 382 now = 812; 48 stays for the non-faulty seller.
      expect(
        consumed({
          amount: 860,
          refundedAmount: 430,
          portion: 0.5,
          retained: 48,
        }),
      ).toBe(812);
    });

    it("gives back an earlier slice that reached past the cap (small hold)", () => {
      // Cheap item: hold 60, share 48. The first unit took 30; leaving 48
      // means only 12 may stay consumed.
      expect(
        consumed({
          amount: 60,
          refundedAmount: 30,
          portion: 0.5,
          retained: 48,
        }),
      ).toBe(12);
    });

    it("a share above the whole hold leaves the whole hold", () => {
      expect(
        consumed({ amount: 30, refundedAmount: 0, portion: 1, retained: 40 }),
      ).toBe(0);
      expect(
        consumed({
          amount: 30,
          refundedAmount: 15,
          portion: 0.5,
          retained: 40,
        }),
      ).toBe(0);
    });

    it("never consumes more than the portion would", () => {
      // A small amount-based refund stays below the cap: the share is moot.
      expect(
        consumed({
          amount: 800,
          refundedAmount: 0,
          portion: 0.05,
          retained: 100,
        }),
      ).toBe(40);
    });

    it("an earlier goodwill refund does not eat the share of a later full refund", () => {
      // 50 TL goodwill consumed 50; the full non-fault refund still leaves 48.
      expect(
        consumed({
          amount: 1000,
          refundedAmount: 50,
          portion: 1,
          retained: 48,
        }),
      ).toBe(952);
    });

    it.each([0, null, undefined])(
      "retained %s (seller at fault) consumes the hold in full",
      (retained) => {
        expect(
          consumed({
            amount: 860,
            refundedAmount: 430,
            portion: 0.5,
            retained,
          }),
        ).toBe(860);
      },
    );

    it("accepts Decimal inputs as Prisma returns them", () => {
      expect(
        holdRefundedAmountAfter({
          amount: new Prisma.Decimal("860.00"),
          refundedAmount: new Prisma.Decimal("430.00"),
          portion: 0.5,
          retained: 48,
        }).toString(),
      ).toBe("812");
    });
  });
});
