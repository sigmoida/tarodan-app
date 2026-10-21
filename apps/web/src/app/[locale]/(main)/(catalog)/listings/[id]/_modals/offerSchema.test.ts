import { describe, expect, it } from "vitest";
import { offerSchema } from "./offerSchema";

const amountIssue = (
  schema: ReturnType<typeof offerSchema>,
  amount: string,
) => {
  const result = schema.safeParse({ amount });
  return result.success ? null : result.error.issues[0]?.message;
};

describe("offerSchema, platform floor", () => {
  // Listing 1000 TL: the percentage rule gives 500 TL; the platform floor is 600 TL.
  const withFloor = offerSchema(500, 1000, "tr", 600);

  it("refuses an offer below the floor with the i18n message", () => {
    expect(amountIssue(withFloor, "550")).toBe(
      "Teklif en az 600,00 TL olmalıdır.",
    );
  });

  it("accepts an offer at or above the floor", () => {
    expect(amountIssue(withFloor, "600")).toBeNull();
    expect(amountIssue(withFloor, "900")).toBeNull();
  });

  it("applies only the percentage rule without a floor", () => {
    const noFloor = offerSchema(500, 1000, "tr", null);
    expect(amountIssue(noFloor, "500")).toBeNull();
    expect(amountIssue(noFloor, "499")).toBe(
      "Teklif en az 500,00 TL olmalıdır.",
    );
  });
});

describe("offerSchema, amount text", () => {
  // Listing 2000 TL: offers from 1000 TL up to (not including) 2000 TL.
  const schema = offerSchema(1000, 2000, "tr", null);

  it.each(["1000", "1250,50", "1250.50", "1999,99"])("accepts %j", (raw) => {
    expect(amountIssue(schema, raw)).toBeNull();
  });

  it.each(["1.000", "1.250,50", "1,250.50", "12,345", "abc", "-1500"])(
    "refuses %j with the shared format copy",
    (raw) => {
      // parseFloat read "1.000" as 1 TL and "1.250,50" as 1.25 TL.
      expect(amountIssue(schema, raw)).toBe(
        "Tutar kabul edilmedi. Binlik ayracı kullanmayın; kuruş için virgül kullanın, örn. 1250,50",
      );
    },
  );

  it("asks for an amount when empty and for a valid one when zero", () => {
    expect(amountIssue(schema, "")).toBe("Bir tutar girin");
    expect(amountIssue(schema, "0")).toBe("Geçerli bir tutar girin");
  });

  it("refuses an amount at the listing price", () => {
    expect(amountIssue(schema, "2000")).toBe("Teklif fiyattan düşük olmalı");
  });

  it("holds each bound to the kurus", () => {
    // The 50% minimum is inclusive, the price is exclusive.
    expect(amountIssue(schema, "999,99")).toBe(
      "Teklif en az 1.000,00 TL olmalıdır.",
    );
    expect(amountIssue(schema, "1000,00")).toBeNull();
    expect(amountIssue(schema, "1999,99")).toBeNull();
    expect(amountIssue(schema, "2000,00")).toBe("Teklif fiyattan düşük olmalı");
    expect(amountIssue(schema, "2500")).toBe("Teklif fiyattan düşük olmalı");
  });

  it("reads separator-only text as no amount", () => {
    expect(amountIssue(schema, ",")).toBe("Geçerli bir tutar girin");
    expect(amountIssue(schema, "0,00")).toBe("Geçerli bir tutar girin");
  });
});

describe("offerSchema, rule order", () => {
  // One issue per field, in order: refused, empty, 50%, floor, below price.
  const schema = offerSchema(500, 1000, "tr", 600);
  const issues = (amount: string) => {
    const result = schema.safeParse({ amount });
    return result.success
      ? []
      : result.error.issues.map((issue) => issue.message);
  };

  it("names the 50% minimum before a higher platform floor", () => {
    expect(issues("400")).toEqual(["Teklif en az 500,00 TL olmalıdır."]);
  });

  it("refuses the format before any bound", () => {
    // "1.000" read by parseFloat was 1 TL: below every bound.
    expect(issues("1.000")).toEqual([
      "Tutar kabul edilmedi. Binlik ayracı kullanmayın; kuruş için virgül kullanın, örn. 1250,50",
    ]);
  });

  it("refuses at the price even when the floor passes", () => {
    expect(issues("1000")).toEqual(["Teklif fiyattan düşük olmalı"]);
  });
});
