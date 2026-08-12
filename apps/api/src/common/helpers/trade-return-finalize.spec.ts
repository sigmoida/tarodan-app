/** @format */

import {
  allReturnLegsDelivered,
  allReturnLegsResolved,
} from "./trade-return-finalize";

const NOW = new Date("2026-08-12T12:00:00Z");

describe("trade return finalize condition", () => {
  it("closes a single-leg return once that leg is delivered (force-cancel-stuck path)", () => {
    expect(allReturnLegsDelivered([{ deliveredAt: NOW }])).toBe(true);
  });

  it("does not close a two-leg return while one leg is still in transit (warehouse reject path)", () => {
    expect(
      allReturnLegsDelivered([{ deliveredAt: NOW }, { deliveredAt: null }]),
    ).toBe(false);
  });

  it("closes a two-leg return when both legs are delivered", () => {
    expect(
      allReturnLegsDelivered([{ deliveredAt: NOW }, { deliveredAt: NOW }]),
    ).toBe(true);
  });

  it("never closes on an empty leg list", () => {
    expect(allReturnLegsDelivered([])).toBe(false);
    expect(allReturnLegsResolved([])).toBe(false);
  });

  it("markReturnLost counts a lost leg as resolved, including the single-leg case", () => {
    expect(allReturnLegsResolved([{ deliveredAt: null, lostAt: NOW }])).toBe(
      true,
    );
    expect(
      allReturnLegsResolved([
        { deliveredAt: NOW, lostAt: null },
        { deliveredAt: null, lostAt: NOW },
      ]),
    ).toBe(true);
    expect(
      allReturnLegsResolved([
        { deliveredAt: NOW, lostAt: null },
        { deliveredAt: null, lostAt: null },
      ]),
    ).toBe(false);
  });
});
