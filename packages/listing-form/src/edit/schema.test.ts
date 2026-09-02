import { describe, expect, it } from "vitest";
import { buildEditListingSchema, emptyEditValues } from "./schema";

/** Düzenleme şeması + zorunlu genel özel gruplar (getter üzerinden). */
describe("buildEditListingSchema", () => {
  const filled = {
    ...emptyEditValues,
    title: "Hot Wheels Porsche 911",
    description: "Kutusunda, temiz durumda koleksiyonluk model araç.",
    categoryId: "category-1",
    condition: "new",
    brandId: "brand-1",
    colors: ["red"],
    scale: "1:64",
    material: "diecast",
    manufacturerId: "manufacturer-1",
    isBoxed: "boxed" as const,
    quantity: "1",
    price: "1000",
  };

  it("zorunlu genel grup eksikse ilgili alana hata bağlar", () => {
    const schema = buildEditListingSchema(() => ["nadirlik-bulunabilirlik"]);
    const result = schema.safeParse(filled);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path)).toEqual([
        ["customAttributes", "nadirlik-bulunabilirlik"],
      ]);
    }
  });

  it("seçim varsa geçer; zorunlu grup yoksa da geçer", () => {
    expect(
      buildEditListingSchema(() => ["nadirlik-bulunabilirlik"]).safeParse({
        ...filled,
        customAttributes: { "nadirlik-bulunabilirlik": ["nadir"] },
      }).success,
    ).toBe(true);
    expect(buildEditListingSchema(() => []).safeParse(filled).success).toBe(
      true,
    );
  });
});
