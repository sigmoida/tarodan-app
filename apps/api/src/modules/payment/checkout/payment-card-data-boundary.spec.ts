import { PATH_METADATA } from "@nestjs/common/constants";
import { plainToInstance } from "class-transformer";
import { getMetadataStorage, validate } from "class-validator";
import { PaymentController } from "../payment.controller";
import { DirectPaymentDto, InstallmentOptionsDto } from "../dto";

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

  describe("installment options (BIN only)", () => {
    const errorsOf = async (body: Record<string, unknown>) =>
      (await validate(plainToInstance(InstallmentOptionsDto, body))).map(
        (error) => error.property,
      );

    it.each(["45467112", "454671", "4546711"])(
      "accepts a BIN of 6 to 8 digits (%p)",
      async (bin) => {
        expect(await errorsOf({ bin, amount: 1000 })).toEqual([]);
      },
    );

    it.each([
      "454671123",
      "4546711234567890",
      "45467",
      "4546 7112",
      "4546711a",
    ])(
      "rejects anything but 6 to 8 digits (%p): never more than a BIN",
      async (bin) => {
        expect(await errorsOf({ bin, amount: 1000 })).toEqual(["bin"]);
      },
    );

    it("does not declare PAN, expiry or CVV on the options DTO", () => {
      const properties = getMetadataStorage()
        .getTargetValidationMetadatas(InstallmentOptionsDto, "", false, false)
        .map((metadata) => metadata.propertyName);
      expect([...new Set(properties)].sort()).toEqual([
        "amount",
        "bin",
        "paymentId",
        "savedCardId",
      ]);
    });

    it("rejects raw card fields before pricing anything", async () => {
      const installmentOptions = { getOptions: jest.fn() };
      const controller = new PaymentController(
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        installmentOptions as never,
      );
      await expect(
        controller.getInstallmentOptions({ bin: "45467112", amount: 1000 }, {
          body: {
            bin: "45467112",
            amount: 1000,
            cardNumber: "4355084355084358",
          },
        } as never),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.payment.cardDataNotAccepted" },
      });
      expect(installmentOptions.getOptions).not.toHaveBeenCalled();
    });
  });
});
