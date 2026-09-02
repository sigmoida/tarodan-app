import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  baseListingFields,
  colorsRefine,
  customAttributesField,
  requiredAttributeGroupsRefine,
} from "./schema";

describe("listing form catalog details", () => {
  const messages = {
    required: "required",
    validPrice: "invalid price",
    setSize: "invalid set size",
    photo: "photo required",
    descriptionLength: "invalid description",
  };
  const schema = z
    .object(baseListingFields(messages))
    .superRefine(colorsRefine(messages.required));

  const validValues = {
    title: "Hot Wheels Porsche 911",
    description: "Kutusunda, temiz durumda koleksiyonluk model araç.",
    categoryId: "category-1",
    condition: "new",
    brandId: "brand-1",
    carModelId: "",
    modelCode: "",
    colors: ["red"],
    color: "",
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

  it("requires a color: catalog selection or the free-text fallback", () => {
    expect(
      schema.safeParse({ ...validValues, colors: [], color: "" }).success,
    ).toBe(false);
    // Katalog boş kurulumda serbest metin yeterlidir.
    expect(
      schema.safeParse({ ...validValues, colors: [], color: "Kırmızı" })
        .success,
    ).toBe(true);
  });

  it("caps the number of selected colors", () => {
    const result = schema.safeParse({
      ...validValues,
      colors: ["red", "blue", "black", "white"],
    });

    expect(result.success).toBe(false);
  });

  it("still limits the optional model code to 100 characters", () => {
    const result = schema.safeParse({
      ...validValues,
      modelCode: "A".repeat(101),
    });

    expect(result.success).toBe(false);
  });
});

describe("requiredAttributeGroupsRefine", () => {
  const requiredMsg = "required";
  let required: string[] = [];
  const schema = z
    .object({ customAttributes: customAttributesField })
    .superRefine(requiredAttributeGroupsRefine(() => required, requiredMsg));

  it("zorunlu grup seçilmemişse hatayı o grubun alanına bağlar", () => {
    required = ["nadirlik-bulunabilirlik"];
    const result = schema.safeParse({ customAttributes: {} });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: ["customAttributes", "nadirlik-bulunabilirlik"],
          message: requiredMsg,
        }),
      ]);
    }
  });

  it("boş dizi de eksik sayılır, seçim varsa geçer", () => {
    required = ["nadirlik-bulunabilirlik"];
    expect(
      schema.safeParse({
        customAttributes: { "nadirlik-bulunabilirlik": [] },
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        customAttributes: { "nadirlik-bulunabilirlik": ["nadir"] },
      }).success,
    ).toBe(true);
  });

  it("getter doğrulama anında okunur — liste sonradan gelse de geçerli", () => {
    required = [];
    expect(schema.safeParse({ customAttributes: {} }).success).toBe(true);
    required = ["kutu-durumu"];
    expect(schema.safeParse({ customAttributes: {} }).success).toBe(false);
  });
});
