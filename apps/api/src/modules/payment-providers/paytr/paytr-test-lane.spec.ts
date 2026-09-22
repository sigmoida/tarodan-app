import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { PayTRService, PayTRBuyer } from "./paytr.service";
import { PayTRCredentials } from "./paytr-credentials.service";
import { PayTRReportService } from "./paytr-report.service";
import { PayTRTransferService } from "./paytr-transfer.service";
import { PaytrMerchant } from "@prisma/client";

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

/**
 * Üyelik ayrı PayTR mağazasında alınır (ilk alım 3D form, yenileme non-3D
 * recurring). Test şeridi üyeliği İKİ mağazada da `test_mode=1` taşımalı ve
 * token o mağazanın anahtarıyla imzalanmalı — canlı üyelik mağazasında test
 * kartıyla gerçek-mod istek PayTR'de reddedilir, gerçek kartla test-mod ise
 * tahsilat yapmaz.
 */
describe("PayTRService — test lane on the membership merchant", () => {
  const MEMBER_ID = "member_mid_2";
  const MEMBER_KEY = "member_key_zz";
  const MEMBER_SALT = "member_salt_ww";
  let member: PayTRService;

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
    const env: Record<string, string> = {
      PAYTR_MERCHANT_ID: "market_mid_1",
      PAYTR_MERCHANT_KEY: "market_key",
      PAYTR_MERCHANT_SALT: "market_salt",
      PAYTR_TEST_MODE: "false",
      PAYTR_MEMBERSHIP_MERCHANT_ID: MEMBER_ID,
      PAYTR_MEMBERSHIP_MERCHANT_KEY: MEMBER_KEY,
      PAYTR_MEMBERSHIP_MERCHANT_SALT: MEMBER_SALT,
      PAYTR_MEMBERSHIP_TEST_MODE: "false",
      FRONTEND_URL: "https://app.test",
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayTRCredentials,
        PayTRReportService,
        PayTRTransferService,
        PayTRService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => env[key]) },
        },
      ],
    }).compile();
    member = module.get(PayTRService).forMerchant(PaytrMerchant.membership);
  });

  afterEach(() => jest.restoreAllMocks());

  const sign = (payload: string) =>
    crypto
      .createHmac("sha256", MEMBER_KEY)
      .update(payload + MEMBER_SALT)
      .digest("base64");

  it("opens the initial membership form in test mode, signed with the membership key", async () => {
    const result = await member.createDirectPaymentForm(
      "MEMLANE1",
      240,
      buyer,
      [{ name: "Üyelik", price: 240, quantity: 1 }],
      { testMode: true },
    );
    const fields = Object.fromEntries(
      result.fields.map(({ name, value }) => [name, value]),
    );
    expect(fields.merchant_id).toBe(MEMBER_ID);
    expect(fields.test_mode).toBe("1");
    expect(fields.paytr_token).toBe(
      sign(
        MEMBER_ID +
          buyer.ip +
          "MEMLANE1" +
          buyer.email +
          "240.00" +
          "card" +
          "0" +
          "TL" +
          "1" +
          "0",
      ),
    );
  });

  it.each([
    [true, "1"],
    [false, "0"],
  ] as const)(
    "sends the recurring renewal with test_mode matching the owner's lane (testMode=%s)",
    async (testMode, expected) => {
      const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue({
        text: async () => JSON.stringify({ status: "success" }),
      } as Response);

      const result = await member.chargeRecurring({
        utoken: "u1",
        ctoken: "c1",
        amount: 240,
        merchantOid: "MEMREN1",
        buyer,
        basketItems: [{ name: "Üyelik", price: 240, quantity: 1 }],
        testMode,
      });

      expect(result.status).toBe("success");
      const body = new URLSearchParams(
        String((fetchMock.mock.calls[0][1] as RequestInit).body),
      );
      expect(body.get("merchant_id")).toBe(MEMBER_ID);
      expect(body.get("test_mode")).toBe(expected);
      expect(body.get("non_3d")).toBe("1");
      expect(body.get("paytr_token")).toBe(
        sign(
          MEMBER_ID +
            buyer.ip +
            "MEMREN1" +
            buyer.email +
            "240.00" +
            "card" +
            "0" +
            "TL" +
            expected +
            "1",
        ),
      );
    },
  );
});
