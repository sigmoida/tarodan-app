import { BadRequestException } from "@nestjs/common";
import { OrderGuestCheckoutService } from "./order-guest-checkout.service";
import type { GuestCheckoutDto } from "../dto/guest-checkout.dto";

/**
 * Misafir ödeme teklif fiyatı kullanamaz. Eskiden yalnız "kabul edilmiş +
 * aynı ürün" bakılıyordu: siparişi olmayan eski bir kabul edilmiş teklifin
 * id'sini bilen herkes misafir olarak teklif fiyatından satın alabiliyordu.
 * Teklifi yalnız kayıtlı alıcı verir ve siparişi kabulde oluşur.
 */
describe("OrderGuestCheckoutService.guestCheckout — teklif", () => {
  it("offerId ile gelen misafir siparişini OTP/fiyat adımlarına girmeden 400 ile reddeder", async () => {
    const prisma = { $transaction: jest.fn() };
    const orderPricing = {
      resolveShippingTariffSnapshot: jest.fn(),
      resolveCommissionRuleSetSnapshot: jest.fn(),
    };
    const deps = Array.from({ length: 13 }, () => ({}) as never);
    deps[0] = prisma as never;
    deps[6] = orderPricing as never;
    const service = new (
      OrderGuestCheckoutService as unknown as new (
        ...args: never[]
      ) => OrderGuestCheckoutService
    )(...deps);

    await expect(
      service.guestCheckout({
        productId: "0b0f6c3e-8a2d-4c1b-9f51-3a7e2d9c4b10",
        offerId: "7d1e2f3a-4b5c-4d6e-8f70-1a2b3c4d5e6f",
      } as GuestCheckoutDto),
    ).rejects.toMatchObject({
      constructor: BadRequestException,
      response: { i18nKey: "server.order.invalidOffer" },
    });
    expect(orderPricing.resolveShippingTariffSnapshot).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
