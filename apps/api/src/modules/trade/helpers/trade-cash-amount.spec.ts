import { BadRequestException } from "@nestjs/common";
import { assertTradeCashAmount, tradeCashTerms } from "./trade-cash-amount";

/**
 * Trade cash is a signed TL amount stored as its magnitude in a
 * `Decimal(10, 2)` column. A third decimal used to be rounded silently and an
 * overflow failed in the database as a 500; both are a 400 with a catalog key.
 */
describe("assertTradeCashAmount", () => {
  it.each([
    undefined,
    null,
    0,
    150,
    -150,
    59.99,
    -59.99,
    99_999_999.99,
    -99_999_999.99,
  ])("accepts %p", (value) => {
    expect(() => assertTradeCashAmount(value)).not.toThrow();
  });

  it.each([
    // A third decimal, also as float noise.
    59.999,
    -59.999,
    0.1 + 0.2,
    // Exponent forms: a 400, never a 500.
    1e-7,
    -1e-7,
    1e21,
    // Above the column on either side.
    100_000_000,
    -100_000_000,
    99_999_999.991,
  ])("refuses %p with server.trade.invalidCashAmount", (value) => {
    try {
      assertTradeCashAmount(value);
      throw new Error("expected a refusal");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        i18nKey: "server.trade.invalidCashAmount",
      });
    }
  });
});

describe("tradeCashTerms", () => {
  const payers = { positivePayerId: "proposer", negativePayerId: "other" };

  it.each([undefined, null, 0, -0])("stores no cash part for %p", (value) => {
    expect(tradeCashTerms(value, payers)).toEqual({
      cashAmount: null,
      cashPayerId: null,
    });
  });

  it("a positive amount is paid by the proposer", () => {
    expect(tradeCashTerms(150.5, payers)).toEqual({
      cashAmount: 150.5,
      cashPayerId: "proposer",
    });
  });

  it("a negative amount is paid by the other side, stored as its magnitude", () => {
    expect(tradeCashTerms(-150.5, payers)).toEqual({
      cashAmount: 150.5,
      cashPayerId: "other",
    });
  });
});
