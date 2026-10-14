import { describe, expect, it } from "vitest";
import { isPasswordValid } from "@tarodan/types";
import { newPasswordSchema } from "./passwordSchema";

const schema = newPasswordSchema((key) => key);

const ACCEPT = ["Abcdefg1", "Tarodan2026.", "Şifre123!", "Abc 1234!",
  "ĞÜŞİÖÇ12ab",
  "ğüşiöç12AB",
  "ŞİFREçok1",
];
const REJECT = ["abcdefg1", "ABCDEFG1", "Abcdefgh", "Ab1"];

describe("newPasswordSchema — API ile aynı kural", () => {
  it.each(ACCEPT)("kabul eder: %s", (pw) => {
    expect(schema.safeParse(pw).success).toBe(true);
    expect(isPasswordValid(pw)).toBe(true);
  });

  it.each(REJECT)("reddeder: %s", (pw) => {
    expect(schema.safeParse(pw).success).toBe(false);
    expect(isPasswordValid(pw)).toBe(false);
  });

  it("üst sınırı aşan şifreyi reddeder", () => {
    const long = "Aa1" + "x".repeat(70);
    expect(schema.safeParse(long).success).toBe(false);
    expect(isPasswordValid(long)).toBe(false);
  });
});
