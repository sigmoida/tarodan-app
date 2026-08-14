import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import { vatDefaultSchema, vatOverrideSchema } from "./schema";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as T;

describe("vatDefaultSchema — rate range", () => {
  const schema = vatDefaultSchema(t);

  it.each(["0", "100", "17.5"])("accepts a rate of %s", (rate) => {
    expect(schema.safeParse({ rate }).success).toBe(true);
  });

  it.each(["-1", "101", "abc"])(
    "rejects an out-of-range rate of %s",
    (rate) => {
      expect(schema.safeParse({ rate }).success).toBe(false);
    },
  );

  it("rejects an empty or whitespace-only rate as required", () => {
    expect(schema.safeParse({ rate: "" }).success).toBe(false);
    expect(schema.safeParse({ rate: "   " }).success).toBe(false);
  });
});

describe("vatOverrideSchema — also requires categoryId", () => {
  const schema = vatOverrideSchema(t);

  it("accepts a valid categoryId + rate", () => {
    expect(schema.safeParse({ categoryId: "cat-1", rate: "18" }).success).toBe(
      true,
    );
  });

  it("rejects an empty categoryId", () => {
    expect(schema.safeParse({ categoryId: "", rate: "18" }).success).toBe(
      false,
    );
  });

  it("still enforces the rate range", () => {
    expect(schema.safeParse({ categoryId: "cat-1", rate: "150" }).success).toBe(
      false,
    );
  });
});
