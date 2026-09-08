import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { PayTRService, PayTRBuyer } from "./paytr.service";
import { PayTRCredentials } from "./paytr-credentials.service";
import { PayTRReportService } from "./paytr-report.service";
import { PayTRTransferService } from "./paytr-transfer.service";

/**
 * Test şeridi: canlı merchant (PAYTR_TEST_MODE=false) üzerinde tek bir ödeme
 * `test_mode=1` ile açılabilmeli; bayrak Direkt API token hash'inin parçası
 * olduğundan PayTR bunu gerçek-mod istekten ayırt eder ve tahsilat yapmaz.
 */
describe("PayTRService — per-payment test mode (test lane)", () => {
  const MID = "merchant_id_1";
  const KEY = "merchant_key_xx";
  const SALT = "merchant_salt_yy";
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
              if (key === "PAYTR_MERCHANT_ID") return MID;
              if (key === "PAYTR_MERCHANT_KEY") return KEY;
              if (key === "PAYTR_MERCHANT_SALT") return SALT;
              if (key === "PAYTR_TEST_MODE") return "false";
              if (key === "FRONTEND_URL") return "https://app.test";
              return undefined;
            }),
          },
        },
      ],
    }).compile();
    service = module.get(PayTRService);
  });

  const fieldsOf = async (options?: { testMode?: boolean }) => {
    const result = await service.createDirectPaymentForm(
      "ORDLANE1",
      100,
      buyer,
      [{ name: "Ürün", price: 100, quantity: 1 }],
      options,
    );
    return Object.fromEntries(
      result.fields.map(({ name, value }) => [name, value]),
    );
  };

  const tokenFor = (testMode: "0" | "1") =>
    crypto
      .createHmac("sha256", KEY)
      .update(
        MID +
          buyer.ip +
          "ORDLANE1" +
          buyer.email +
          "100.00" +
          "card" +
          "0" +
          "TL" +
          testMode +
          "0" +
          SALT,
      )
      .digest("base64");

  it("defaults to the environment mode (live merchant → test_mode=0)", async () => {
    const fields = await fieldsOf();
    expect(fields.test_mode).toBe("0");
    expect(fields.paytr_token).toBe(tokenFor("0"));
  });

  it("opens a test-lane payment with test_mode=1 and signs it accordingly", async () => {
    const fields = await fieldsOf({ testMode: true });
    expect(fields.test_mode).toBe("1");
    expect(fields.debug_on).toBe("1");
    expect(fields.paytr_token).toBe(tokenFor("1"));
  });

  it("an explicit false keeps the live mode even if the env were test", async () => {
    const fields = await fieldsOf({ testMode: false });
    expect(fields.test_mode).toBe("0");
  });
});
