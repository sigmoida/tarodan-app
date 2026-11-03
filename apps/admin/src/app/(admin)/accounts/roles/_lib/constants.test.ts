import { describe, expect, it } from "vitest";
import type { useTranslations } from "next-intl";
import { getPermissionGroups } from "./constants";

type T = ReturnType<typeof useTranslations<never>>;
const t = ((key: string) => key) as T;

describe("getPermissionGroups", () => {
  it("lists the seller trust lab in the System group so the matrix can grant and revoke it", () => {
    const system = getPermissionGroups(t).find((g) => g.id === "system");
    const entry = system?.permissions.find((p) => p.key === "seller_trust_lab");

    expect(entry).toBeDefined();
    expect(entry?.pages).toEqual(["/system/seller-trust-lab"]);
    expect(entry?.label).toBe("admin.roles.permissions.sellerTrustLab.label");
  });

  it("lists every permission key once", () => {
    const keys = getPermissionGroups(t).flatMap((g) =>
      g.permissions.map((p) => p.key),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
