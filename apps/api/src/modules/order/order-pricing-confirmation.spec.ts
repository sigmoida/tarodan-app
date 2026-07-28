import { OrderPricingService } from "./order-pricing.service";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CheckoutDto, DirectBuyDto, GuestCheckoutDto } from "./dto";

describe("OrderPricingService checkout confirmation", () => {
  const items = [{ productId: "product-1", unitPrice: 100, quantity: 1 }];

  function makeService() {
    return new OrderPricingService({} as any, {} as any, {} as any, {} as any);
  }

  it("rejects order creation when the client omits the quoted pricing hash", () => {
    expect(() =>
      makeService().assertPricingUnchanged(undefined, items),
    ).toThrow();
  });

  it("accepts the exact hash from the current quote", () => {
    const service = makeService();
    const hash = service.computePricingHash(items);

    expect(() => service.assertPricingUnchanged(hash, items)).not.toThrow();
  });

  it("rejects a stale quote hash", () => {
    expect(() =>
      makeService().assertPricingUnchanged("stale-hash", items),
    ).toThrow();
  });

  it.each([
    ["direct buy", DirectBuyDto],
    ["batch checkout", CheckoutDto],
    ["guest buy", GuestCheckoutDto],
  ])(
    "requires the quoted pricing hash in %s request validation",
    async (_name, dto) => {
      const instance = plainToInstance(dto as any, {
        expectedShippingTariffVersion: 1,
      });
      const errors = await validate(instance as object);

      expect(
        errors.some((error) => error.property === "expectedPricingHash"),
      ).toBe(true);
    },
  );
});
