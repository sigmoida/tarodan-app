import { describe, expect, it } from "vitest";
import { offerSchema } from "./offerSchema";

const amountIssue = (
  schema: ReturnType<typeof offerSchema>,
  amount: string,
) => {
  const result = schema.safeParse({ amount });
  return result.success ? null : result.error.issues[0]?.message;
};

describe("offerSchema — platform alt sınırı", () => {
  // İlan 1000 TL: yüzde kuralı 500 TL; platform tabanı 600 TL.
  const withFloor = offerSchema(500, 1000, "tr", 600);

  it("tabanın altındaki teklifi i18n iletisiyle reddeder", () => {
    expect(amountIssue(withFloor, "550")).toBe(
      "Teklif en az 600,00 TL olmalıdır.",
    );
  });

  it("tabana eşit ve üstü teklif geçer", () => {
    expect(amountIssue(withFloor, "600")).toBeNull();
    expect(amountIssue(withFloor, "900")).toBeNull();
  });

  it("taban yoksa yalnız eski kurallar işler", () => {
    const noFloor = offerSchema(500, 1000, "tr", null);
    expect(amountIssue(noFloor, "500")).toBeNull();
    expect(amountIssue(noFloor, "499")).toContain("Min:");
  });
});
