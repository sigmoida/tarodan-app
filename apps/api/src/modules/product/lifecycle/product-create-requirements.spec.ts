import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ProductCondition } from "@prisma/client";
import { CreateProductDto } from "../dto";

const VALID_PRODUCT = {
  title: "Hot Wheels Porsche 911",
  description: "Kutusunda, temiz durumda koleksiyonluk model araç.",
  price: 1000,
  categoryId: "11111111-1111-4111-8111-111111111111",
  condition: ProductCondition.new,
  brandId: "22222222-2222-4222-8222-222222222222",
  carModelId: "33333333-3333-4333-8333-333333333333",
  modelCode: "HKG72",
  color: "Kırmızı",
  scale: "1:64",
  material: "diecast",
  manufacturerId: "44444444-4444-4444-8444-444444444444",
  isBoxed: true,
  shippingDesi: 2,
  images: [
    { cardKey: "card-1.webp", detailKey: "detail-1.webp" },
    { cardKey: "card-2.webp", detailKey: "detail-2.webp" },
    { cardKey: "card-3.webp", detailKey: "detail-3.webp" },
  ],
};

async function validationErrors(input: Record<string, unknown>) {
  return validate(plainToInstance(CreateProductDto, input)).then((errors) =>
    errors.map((error) => error.property),
  );
}

describe("CreateProductDto required listing fields", () => {
  it.each([
    "description",
    "brandId",
    "color",
    "scale",
    "material",
    "manufacturerId",
    "isBoxed",
  ])("rejects a new listing without %s", async (field) => {
    const input = { ...VALID_PRODUCT };
    delete (input as Record<string, unknown>)[field];

    await expect(validationErrors(input)).resolves.toContain(field);
  });

  it("accepts a new listing without car model and model code", async () => {
    const input = { ...VALID_PRODUCT };
    delete (input as Record<string, unknown>).carModelId;
    delete (input as Record<string, unknown>).modelCode;

    await expect(validationErrors(input)).resolves.not.toEqual(
      expect.arrayContaining(["carModelId", "modelCode"]),
    );
  });

  it("accepts description boundaries of 30 and 330 characters", async () => {
    await expect(
      validationErrors({ ...VALID_PRODUCT, description: "a".repeat(30) }),
    ).resolves.not.toContain("description");
    await expect(
      validationErrors({ ...VALID_PRODUCT, description: "a".repeat(330) }),
    ).resolves.not.toContain("description");
  });

  it("rejects descriptions shorter than 30 or longer than 330 characters", async () => {
    await expect(
      validationErrors({ ...VALID_PRODUCT, description: "a".repeat(29) }),
    ).resolves.toContain("description");
    await expect(
      validationErrors({ ...VALID_PRODUCT, description: "a".repeat(331) }),
    ).resolves.toContain("description");
  });

  it.each(["title", "description", "color", "scale", "material"])(
    "rejects whitespace-only %s",
    async (field) => {
      await expect(
        validationErrors({ ...VALID_PRODUCT, [field]: " ".repeat(30) }),
      ).resolves.toContain(field);
    },
  );

  it("requires at least three product images", async () => {
    await expect(
      validationErrors({
        ...VALID_PRODUCT,
        images: VALID_PRODUCT.images.slice(0, 2),
      }),
    ).resolves.toContain("images");
    await expect(validationErrors(VALID_PRODUCT)).resolves.not.toContain(
      "images",
    );
  });

  it("keeps release year optional", async () => {
    await expect(validationErrors(VALID_PRODUCT)).resolves.toHaveLength(0);
  });
});
