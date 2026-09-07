import {
  PAYOUT_TRANS_ID_PATTERN,
  generatePayoutTransId,
  generatePayoutTransIdCode,
  isValidPayoutTransId,
} from "./payout-trans-id";
import { REFERENCE_PREFIX } from "./code-prefixes";

/**
 * PayTR Platform Transfer `trans_id`: yalnız harf/rakam, ≤60. Tireli `PYT-…`
 * üretimde reddedildi; payout referansı bu yüzden tiresizdir.
 */
describe("payout-trans-id", () => {
  it("produces a hyphen-free PYT reference PayTR accepts", () => {
    for (let i = 0; i < 50; i++) {
      const code = generatePayoutTransIdCode();
      expect(code).toMatch(/^PYT[23456789ABCDEFGHJKMNPQRSTVWXYZ]{10}$/);
      expect(code.startsWith(REFERENCE_PREFIX.payoutTransfer)).toBe(true);
      expect(isValidPayoutTransId(code)).toBe(true);
    }
  });

  it("rejects the legacy hyphenated shape and anything non-alphanumeric", () => {
    for (const bad of [
      "PYT-K7X9M2QF3N",
      "",
      "pyt k7x9",
      "PYT_1",
      "A".repeat(61),
    ]) {
      expect(isValidPayoutTransId(bad)).toBe(false);
    }
    expect(PAYOUT_TRANS_ID_PATTERN.test("A".repeat(60))).toBe(true);
  });

  it("retries on collision and keeps the hyphen-free shape", async () => {
    const seen = new Set<string>();
    let calls = 0;
    const exists = async (code: string) => {
      calls++;
      // İlk üretimi "çakışmış" say; ikinciyi kabul et.
      if (calls === 1) {
        seen.add(code);
        return true;
      }
      return false;
    };
    const code = await generatePayoutTransId(exists);
    expect(calls).toBe(2);
    expect(seen.has(code)).toBe(false);
    expect(isValidPayoutTransId(code)).toBe(true);
  });
});
