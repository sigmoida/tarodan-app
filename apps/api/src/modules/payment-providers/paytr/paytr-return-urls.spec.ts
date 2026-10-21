import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PayTRService, PayTRBuyer } from "./paytr.service";
import { PayTRCredentials } from "./paytr-credentials.service";
import { PayTRReportService } from "./paytr-report.service";
import { PayTRTransferService } from "./paytr-transfer.service";

/**
 * Both PayTR return URLs carry the same query. The fail URL used to be bare,
 * so the web fail page never knew the payment: it could not show the
 * purchase, release a still pending payment or tell a guest from a member.
 */
describe("PayTRService.createDirectPaymentForm — return URLs", () => {
  let service: PayTRService;

  const buyer: PayTRBuyer = {
    name: "Ada",
    surname: "Lovelace",
    email: "ada@example.com",
    phone: "5550001122",
    address: "Analytical Engine Sok. 1",
    city: "Istanbul",
    country: "Turkey",
    ip: "88.77.66.55",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayTRCredentials,
        PayTRReportService,
        PayTRTransferService,
        PayTRService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "PAYTR_MERCHANT_ID") return "merchant_id_1";
              if (key === "PAYTR_MERCHANT_KEY") return "merchant_key_xx";
              if (key === "PAYTR_MERCHANT_SALT") return "merchant_salt_yy";
              if (key === "PAYTR_TEST_MODE") return "true";
              if (key === "FRONTEND_URL") return "https://app.test";
              return undefined;
            }),
          },
        },
      ],
    }).compile();
    service = module.get(PayTRService);
  });

  const urlsFor = async (returnQueryParams?: string) => {
    const form = await service.createDirectPaymentForm(
      "ORD123",
      59,
      buyer,
      [{ name: "Item", price: 59, quantity: 1 }],
      returnQueryParams === undefined ? undefined : { returnQueryParams },
    );
    const fields = Object.fromEntries(
      form.fields.map(({ name, value }) => [name, value]),
    );
    return { ok: fields.merchant_ok_url, fail: fields.merchant_fail_url };
  };

  it.each([
    ["a member checkout", "paymentId=pay-1"],
    ["a guest checkout", "paymentId=pay-1&guest=true"],
    ["a membership purchase", "paymentId=pay-1&type=membership"],
    ["a boost purchase", "paymentId=pay-1&type=boost"],
  ])("%s: success and fail carry the same query", async (_label, query) => {
    await expect(urlsFor(query)).resolves.toEqual({
      ok: `https://app.test/payment/success?${query}`,
      fail: `https://app.test/payment/fail?${query}`,
    });
  });

  it("keeps both paths bare without a query", async () => {
    await expect(urlsFor()).resolves.toEqual({
      ok: "https://app.test/payment/success",
      fail: "https://app.test/payment/fail",
    });
  });
});
