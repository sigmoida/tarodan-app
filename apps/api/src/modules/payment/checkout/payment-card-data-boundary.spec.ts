import { PATH_METADATA } from "@nestjs/common/constants";
import { getMetadataStorage } from "class-validator";
import { PaymentController } from "../payment.controller";
import { DirectPaymentDto } from "../dto";

describe("PaymentController card data boundary", () => {
  it("exposes form preparation instead of the legacy card proxy", () => {
    const prototype = PaymentController.prototype as unknown as Record<
      string,
      object
    >;
    const routes = Object.getOwnPropertyNames(prototype)
      .filter((name) => name !== "constructor")
      .map((name) => Reflect.getMetadata(PATH_METADATA, prototype[name]))
      .filter(Boolean);

    expect(routes).toContain("direct-form");
    expect(routes).not.toContain("process-direct");
  });

  it("does not declare PAN, expiry or CVV on the API DTO", () => {
    const properties = getMetadataStorage()
      .getTargetValidationMetadatas(DirectPaymentDto, "", false, false)
      .map((metadata) => metadata.propertyName);

    expect(properties).not.toEqual(
      expect.arrayContaining([
        "card",
        "cardNumber",
        "cvc",
        "cvv",
        "expireMonth",
        "expireYear",
      ]),
    );
  });

  it("rejects raw card fields before invoking the payment service", async () => {
    const paymentService = {
      prepareDirectPayment: jest.fn(),
    };
    const controller = new PaymentController(
      paymentService as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      controller.prepareDirectForm(
        { orderId: "f5e5e66d-c646-4b14-8ae7-85aa6de9be35" },
        {
          body: {
            card: {
              cardNumber: "4355084355084358",
              cvc: "000",
            },
          },
        } as never,
      ),
    ).rejects.toMatchObject({
      response: { i18nKey: "server.payment.cardDataNotAccepted" },
    });
    expect(paymentService.prepareDirectPayment).not.toHaveBeenCalled();
  });
});
