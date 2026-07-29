import {
  decodeBase32,
  encodeBase32,
  generateTotpCode,
  verifyTotpCode,
} from "./totp.util";

describe("RFC 6238 TOTP utilities", () => {
  const rfcSecret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

  it("round-trips RFC 4648 base32 without padding", () => {
    const input = Buffer.from("12345678901234567890", "ascii");

    expect(encodeBase32(input)).toBe(rfcSecret);
    expect(decodeBase32(rfcSecret)).toEqual(input);
  });

  it("matches the RFC 6238 SHA-1 vector at unix time 59", () => {
    expect(generateTotpCode(rfcSecret, 1, 8)).toBe("94287082");
  });

  it("accepts only current or adjacent six-digit windows", () => {
    const now = 1_700_000_000_000;
    const current = generateTotpCode(rfcSecret, Math.floor(now / 1000 / 30));
    const adjacent = generateTotpCode(
      rfcSecret,
      Math.floor(now / 1000 / 30) + 1,
    );
    const expired = generateTotpCode(
      rfcSecret,
      Math.floor(now / 1000 / 30) + 2,
    );

    expect(verifyTotpCode(rfcSecret, current, now)).toBe(true);
    expect(verifyTotpCode(rfcSecret, adjacent, now)).toBe(true);
    expect(verifyTotpCode(rfcSecret, expired, now)).toBe(false);
    expect(verifyTotpCode(rfcSecret, "12345", now)).toBe(false);
  });
});
