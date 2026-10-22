import { isNumber } from "class-validator";
import { isTlAmount } from "./tl-amount";

/**
 * A TL amount in a JSON body: a finite number of at least 0 with at most two
 * decimals (whole kuruş), decided on the shortest decimal form JS writes for
 * it. It exists because class-validator's `maxDecimalPlaces` throws on a
 * number JS writes in exponent form, which the global pipe turns into a 500.
 */
describe("isTlAmount", () => {
  it("shows the problem it solves: maxDecimalPlaces throws on 1e-7", () => {
    expect(() => isNumber(1e-7, { maxDecimalPlaces: 2 })).toThrow(TypeError);
  });

  it.each([0, 1, 59.9, 59.99, 150, 12345678.91])("accepts %p", (value) => {
    expect(isTlAmount(value)).toBe(true);
  });

  it.each([
    // A third decimal, also when it is float noise of a sum.
    59.999,
    59.899999,
    0.1 + 0.2,
    // Exponent forms: refused, never a 500.
    1e-7,
    1e21,
    // Below zero.
    -1,
    -0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("refuses the number %p", (value) => {
    expect(isTlAmount(value)).toBe(false);
  });

  it.each(["59.9", "", true, null, undefined, [59.9], { amount: 59.9 }])(
    "refuses the non-number %p",
    (value) => {
      expect(isTlAmount(value)).toBe(false);
    },
  );
});
