import { z } from "zod";
import { describe, expect, it } from "vitest";
import { baseListingFields } from "./schema";

describe("listing form catalog details", () => {
  const schema = z.object(
    baseListingFields({
      required: "required",
      validPrice: "invalid price",
      setSize: "invalid set size",
      photo: "photo required",
      descriptionLength: "invalid description",
    }),
  );

  const validValues = {
    title: "Hot Wheels Porsche 911",
    description: "Kutusunda, temiz durumda koleksiyonluk model araç.",
    categoryId: "category-1",
    condition: "new",
    brandId: "brand-1",
    carModelId: "",
    modelCode: "",
    color: "Kırmızı",
    scale: "1:64",
    material: "diecast",
    manufacturerId: "manufacturer-1",
    isBoxed: "boxed" as const,
    year: "",
    isTradeEnabled: false,
    isSet: false,
    bundleSize: "",
    quantity: "1",
    shippingPackageTier: "small" as const,
    price: "1000",
  };

  it("accepts an empty catalog model and manufacturer model code", () => {
    expect(schema.safeParse(validValues).success).toBe(true);
  });

  it("still limits the optional model code to 100 characters", () => {
    const result = schema.safeParse({
      ...validValues,
      modelCode: "A".repeat(101),
    });

    expect(result.success).toBe(false);
  });
});
