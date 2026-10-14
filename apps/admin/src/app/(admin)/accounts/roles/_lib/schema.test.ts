import { describe, expect, it } from "vitest";
import { staffSchema } from "./schema";

/** Anahtarı döndürür: hangi kuralın konuştuğu testte görünür. */
const t = ((key: string) => key) as unknown as Parameters<typeof staffSchema>[0];

const base = { email: "staff@tarodan.com", role: "moderator" as const };

describe("staffSchema — shared password policy", () => {
  const schema = staffSchema(t);

  it("accepts an empty password (API generates a temporary one)", () => {
    expect(schema.safeParse({ ...base, password: "" }).success).toBe(true);
    expect(schema.safeParse(base).success).toBe(true);
  });

  it("accepts a password that satisfies the policy", () => {
    expect(schema.safeParse({ ...base, password: "Tarodan2026" }).success).toBe(
      true,
    );
  });

  it.each(["abc123", "abcdefg1", "ABCDEFG1", "Abcdefgh"])(
    "rejects %s with the shared policy message",
    (password) => {
      const result = schema.safeParse({ ...base, password });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].path).toEqual(["password"]);
      expect(result.error?.issues[0].message).toMatch(/^validation\.password/);
    },
  );
});
