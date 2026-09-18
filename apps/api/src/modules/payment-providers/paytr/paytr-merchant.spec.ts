import * as crypto from "crypto";
import { PaytrMerchant } from "@prisma/client";
import type { ConfigService } from "@nestjs/config";
import {
  PAYMENT_PURPOSE_MERCHANT,
  paytrMerchantCapabilities,
  paytrMerchantConfig,
} from "../../../config/paytr";
import { PayTRCredentials } from "./paytr-credentials.service";
import { PayTRReportService } from "./paytr-report.service";
import { PayTRTransferService } from "./paytr-transfer.service";
import { PayTRService } from "./paytr.service";

/**
 * İki PayTR mağazası: pazaryeri (PAYTR_MERCHANT_*) ve üyelik
 * (PAYTR_MEMBERSHIP_MERCHANT_*). Her çağrı bağlı olduğu mağazanın kimliği ve
 * anahtarıyla imzalanmalı; bir mağazanın anahtarıyla atılmış bildirim hash'i
 * diğer mağazada geçmemeli.
 */
const ENV: Record<string, string> = {
  API_URL: "https://api.example.test",
  PAYTR_MERCHANT_ID: "111111",
  PAYTR_MERCHANT_KEY: "market-key",
  PAYTR_MERCHANT_SALT: "market-salt",
  PAYTR_TEST_MODE: "false",
  PAYTR_MEMBERSHIP_MERCHANT_ID: "222222",
  PAYTR_MEMBERSHIP_MERCHANT_KEY: "member-key",
  PAYTR_MEMBERSHIP_MERCHANT_SALT: "member-salt",
  PAYTR_MEMBERSHIP_TEST_MODE: "true",
};

const configWith = (env: Record<string, string | undefined>) =>
  ({
    get: (key: string, fallback?: string) => env[key] ?? fallback,
  }) as unknown as ConfigService;

const hmac = (key: string, data: string) =>
  crypto.createHmac("sha256", key).update(data).digest("base64");

describe("PayTR merchant profiles (config/paytr)", () => {
  it("reads the marketplace from the legacy PAYTR_* keys and the membership from PAYTR_MEMBERSHIP_*", () => {
    const config = configWith(ENV);
    const market = paytrMerchantConfig(config, PaytrMerchant.marketplace);
    const member = paytrMerchantConfig(config, PaytrMerchant.membership);
    expect(market).toMatchObject({
      merchantId: "111111",
      testMode: false,
      callbackUrl: "https://api.example.test/api/payments/callback/paytr",
    });
    expect(member).toMatchObject({
      merchantId: "222222",
      testMode: true,
      callbackUrl:
        "https://api.example.test/api/payments/callback/paytr/membership",
    });
  });

  it("an explicit callback URL env wins over the API_URL default", () => {
    const member = paytrMerchantConfig(
      configWith({
        ...ENV,
        PAYTR_MEMBERSHIP_CALLBACK_URL: "https://hook.example.test/m",
      }),
      PaytrMerchant.membership,
    );
    expect(member.callbackUrl).toBe("https://hook.example.test/m");
  });

  it("the marketplace never advertises recurring — PayTR granted it no non-3D", () => {
    const caps = paytrMerchantCapabilities(
      configWith({
        PAYTR_CARD_STORAGE_ENABLED: "true",
        PAYTR_RECURRING_ENABLED: "true",
      }),
      PaytrMerchant.marketplace,
    );
    expect(caps).toEqual({ cardStorage: true, recurring: false });
  });

  it("the membership merchant stores cards by default; recurring follows PAYTR_RECURRING_ENABLED", () => {
    expect(
      paytrMerchantCapabilities(configWith({}), PaytrMerchant.membership),
    ).toEqual({ cardStorage: true, recurring: false });
    expect(
      paytrMerchantCapabilities(
        configWith({ PAYTR_RECURRING_ENABLED: "true" }),
        PaytrMerchant.membership,
      ),
    ).toEqual({ cardStorage: true, recurring: true });
  });

  it("switching membership card storage off also switches recurring off", () => {
    expect(
      paytrMerchantCapabilities(
        configWith({
          PAYTR_RECURRING_ENABLED: "true",
          PAYTR_MEMBERSHIP_CARD_STORAGE_ENABLED: "false",
        }),
        PaytrMerchant.membership,
      ),
    ).toEqual({ cardStorage: false, recurring: false });
  });

  it("maps client purposes to merchants", () => {
    expect(PAYMENT_PURPOSE_MERCHANT.checkout).toBe(PaytrMerchant.marketplace);
    expect(PAYMENT_PURPOSE_MERCHANT.membership).toBe(PaytrMerchant.membership);
  });
});

describe("PaytrMerchantCredentials — signing per merchant", () => {
  const creds = new PayTRCredentials(configWith(ENV));
  const market = creds.forMerchant(PaytrMerchant.marketplace);
  const member = creds.forMerchant(PaytrMerchant.membership);

  it("defaults to the marketplace merchant", () => {
    expect(creds.forMerchant()).toBe(market);
  });

  it("signs with the merchant's own key and salt", () => {
    expect(market.signWithSalt("abc")).toBe(
      hmac("market-key", "abcmarket-salt"),
    );
    expect(member.signWithSalt("abc")).toBe(
      hmac("member-key", "abcmember-salt"),
    );
  });

  it("verifies a notification only with the merchant that signed it", () => {
    const body = {
      merchantOid: "MEM10001T123456",
      status: "success",
      totalAmount: "19900",
    };
    const hash = hmac(
      "member-key",
      `${body.merchantOid}member-salt${body.status}${body.totalAmount}`,
    );
    expect(member.verifyPaymentNotification({ ...body, hash })).toBe(true);
    expect(market.verifyPaymentNotification({ ...body, hash })).toBe(false);
    expect(member.verifyPaymentNotification({ ...body, hash: "short" })).toBe(
      false,
    );
  });

  it("an unconfigured merchant verifies nothing (empty-key HMAC is forgeable)", () => {
    const unconfigured = new PayTRCredentials(
      configWith({
        ...ENV,
        PAYTR_MEMBERSHIP_MERCHANT_ID: undefined,
        PAYTR_MEMBERSHIP_MERCHANT_KEY: undefined,
        PAYTR_MEMBERSHIP_MERCHANT_SALT: undefined,
      }),
    ).forMerchant(PaytrMerchant.membership);
    const body = { merchantOid: "ORD1", status: "success", totalAmount: "100" };
    const forged = hmac(
      "",
      `${body.merchantOid}${body.status}${body.totalAmount}`,
    );

    expect(
      unconfigured.verifyPaymentNotification({ ...body, hash: forged }),
    ).toBe(false);
    expect(unconfigured.verifyWithSalt("x", hmac("", "x"))).toBe(false);
  });

  it("recognises two profiles pointing at the same PayTR store", () => {
    const shared = new PayTRCredentials(
      configWith({
        ...ENV,
        PAYTR_MEMBERSHIP_MERCHANT_ID: "111111",
      }),
    );
    expect(
      shared
        .forMerchant(PaytrMerchant.membership)
        .sameStoreAs(shared.forMerchant(PaytrMerchant.marketplace)),
    ).toBe(true);
    expect(member.sameStoreAs(market)).toBe(false);
  });
});

describe("PayTRService bound to a merchant", () => {
  const config = configWith(ENV);
  const creds = new PayTRCredentials(config);
  const service = new PayTRService(
    creds,
    new PayTRReportService(creds),
    new PayTRTransferService(creds),
    config,
  );
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch" as never).mockResolvedValue({
      text: async () => JSON.stringify({ status: "failed", err_msg: "none" }),
      status: 200,
    } as never) as unknown as jest.SpyInstance;
  });
  afterEach(() => fetchSpy.mockRestore());

  const sentForm = () =>
    new URLSearchParams(String(fetchSpy.mock.calls[0][1].body));

  it("the injected root instance is the marketplace", () => {
    expect(service.merchant).toBe(PaytrMerchant.marketplace);
  });

  it("status inquiry on the membership instance is signed for the membership merchant", async () => {
    await service
      .forMerchant(PaytrMerchant.membership)
      .queryPaymentStatus("REN123");
    const form = sentForm();
    expect(form.get("merchant_id")).toBe("222222");
    expect(form.get("paytr_token")).toBe(
      hmac("member-key", "222222REN123member-salt"),
    );
  });

  it("refund on the marketplace instance stays on the marketplace merchant", async () => {
    await service
      .createRefund("ORD1", 10)
      .catch(
        () => undefined /* status failed → rejected, form is what matters */,
      );
    const form = sentForm();
    expect(form.get("merchant_id")).toBe("111111");
    expect(form.get("paytr_token")).toBe(
      hmac("market-key", "111111ORD110.00market-salt"),
    );
  });

  it("verifyCallback uses the bound merchant's key", () => {
    const body = {
      merchant_oid: "MEM1",
      status: "success" as const,
      total_amount: "100",
    };
    const hash = hmac("member-key", "MEM1member-saltsuccess100");
    expect(
      service
        .forMerchant(PaytrMerchant.membership)
        .verifyCallback({ ...body, hash }),
    ).toBe(true);
    expect(service.verifyCallback({ ...body, hash })).toBe(false);
  });

  it("the direct form of the membership instance carries the membership merchant id and test mode", async () => {
    const form = await service
      .forMerchant(PaytrMerchant.membership)
      .createDirectPaymentForm(
        "MEM1T1",
        199,
        {
          name: "A",
          surname: "B",
          email: "a@b.test",
          phone: "+905000000000",
          address: "x",
          city: "y",
          country: "TR",
          ip: "1.2.3.4",
        },
        [{ name: "Premium", price: 199, quantity: 1 }],
        { storeCard: true },
      );
    const fields = Object.fromEntries(
      form.fields.map((f) => [f.name, f.value]),
    );
    expect(fields.merchant_id).toBe("222222");
    expect(fields.test_mode).toBe("1");
    expect(fields.store_card).toBe("1");
    expect(fields.paytr_token).toBe(
      hmac(
        "member-key",
        "2222221.2.3.4MEM1T1a@b.test199.00card0TL10member-salt",
      ),
    );
  });

  it("platform transfers are refused on a non-marketplace instance", () => {
    expect(() =>
      service.forMerchant(PaytrMerchant.membership).createPlatformTransfer({
        merchantOid: "ORD1",
        transId: "PO1",
        submerchantAmount: 1,
        totalAmount: 1,
        transferName: "x",
        transferIban: "TR00",
      }),
    ).toThrow();
    expect(
      service
        .forMerchant(PaytrMerchant.membership)
        .verifyTransferCallback({ transIds: "x", hash: "y" }),
    ).toBe(false);
  });
});
