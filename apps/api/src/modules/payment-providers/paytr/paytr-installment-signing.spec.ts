import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { PayTRService, PayTRBuyer } from "./paytr.service";
import { PayTRCredentials } from "./paytr-credentials.service";
import { PayTRReportService } from "./paytr-report.service";
import { PayTRTransferService } from "./paytr-transfer.service";

/**
 * Pins how the installment fields are signed and sent today, before the
 * installment work (hub plan 2026-11-03, task A1) changes the provider layer.
 *
 * - Direct API 1. Adim (https://dev.paytr.com/direkt-api/direkt-api-1-adim):
 *   `installment_count` is required, "0" is a single payment, 2-12 are
 *   installments, and it is part of the token:
 *   merchant_id + user_ip + merchant_oid + email + payment_amount +
 *   payment_type + installment_count + currency + test_mode + non_3d (+ salt).
 * - Every live payment is a single payment: no caller passes an installment
 *   count, so the form must keep `installment_count = "0"` and the same token.
 * - Recurring renewals (non-3D, membership store) are never installments.
 */
describe("PayTRService installment signing (single payment pins)", () => {
  const MID = "merchant_id_1";
  const KEY = "merchant_key_xx";
  const SALT = "merchant_salt_yy";
  let service: PayTRService;
  let fetchSpy: jest.SpyInstance;

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
  const basket = [{ name: "Model car", price: 1234.5, quantity: 1 }];

  const tokenOf = (parts: {
    oid: string;
    amount: string;
    installment: string;
    non3d: "0" | "1";
  }) =>
    crypto
      .createHmac("sha256", KEY)
      .update(
        MID +
          buyer.ip +
          parts.oid +
          buyer.email +
          parts.amount +
          "card" +
          parts.installment +
          "TL" +
          "1" + // PAYTR_TEST_MODE=true in this harness
          parts.non3d +
          SALT,
      )
      .digest("base64");

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
              if (key === "PAYTR_TEST_MODE") return "true";
              if (key === "FRONTEND_URL") return "https://app.test";
              return undefined;
            }),
          },
        },
      ],
    }).compile();
    service = module.get(PayTRService);
    fetchSpy = jest.spyOn(
      global,
      "fetch" as never,
    ) as unknown as jest.SpyInstance;
  });

  afterEach(() => fetchSpy.mockRestore());

  const formFields = async (
    options?: Parameters<PayTRService["createDirectPaymentForm"]>[4],
  ) => {
    const result = await service.createDirectPaymentForm(
      "ORDSINGLE1",
      1234.5,
      buyer,
      basket,
      options,
    );
    return Object.fromEntries(
      result.fields.map(({ name, value }) => [name, value]),
    );
  };

  describe("createDirectPaymentForm, single payment (every live payment today)", () => {
    it("sends installment_count 0, no card_type, and signs the single payment", async () => {
      const fields = await formFields();

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(fields.installment_count).toBe("0");
      expect(fields.payment_amount).toBe("1234.50");
      expect(fields.non_3d).toBe("0");
      expect(fields).not.toHaveProperty("card_type");
      expect(fields.paytr_token).toBe(
        tokenOf({
          oid: "ORDSINGLE1",
          amount: "1234.50",
          installment: "0",
          non3d: "0",
        }),
      );
    });

    it.each([0, 1])(
      "maps installmentCount %p to a single payment (installment_count 0)",
      async (installmentCount) => {
        const fields = await formFields({ installmentCount });
        expect(fields.installment_count).toBe("0");
        expect(fields.paytr_token).toBe(
          tokenOf({
            oid: "ORDSINGLE1",
            amount: "1234.50",
            installment: "0",
            non3d: "0",
          }),
        );
      },
    );

    it("keeps a saved-card payment single, with no card_type", async () => {
      const fields = await formFields({
        savedCard: { utoken: "UT1", ctoken: "CT1", requireCvv: false },
      });
      expect(fields.installment_count).toBe("0");
      expect(fields).not.toHaveProperty("card_type");
      expect(fields.paytr_token).toBe(
        tokenOf({
          oid: "ORDSINGLE1",
          amount: "1234.50",
          installment: "0",
          non3d: "0",
        }),
      );
    });

    // The whole form, names, order and values, of the three live shapes.
    // Written to pass unchanged on `development` before the installment
    // work: any new or reordered field on a single payment fails here.
    const singlePaymentHead = () => [
      ["merchant_id", MID],
      ["user_ip", buyer.ip],
      ["merchant_oid", "ORDSINGLE1"],
      ["email", buyer.email],
      ["payment_amount", "1234.50"],
      ["payment_type", "card"],
      ["installment_count", "0"],
      ["currency", "TL"],
      ["test_mode", "1"],
      ["non_3d", "0"],
      [
        "paytr_token",
        tokenOf({
          oid: "ORDSINGLE1",
          amount: "1234.50",
          installment: "0",
          non3d: "0",
        }),
      ],
      ["merchant_ok_url", "https://app.test/payment/success"],
      ["merchant_fail_url", "https://app.test/payment/fail"],
      ["user_name", "Ada Lovelace"],
      ["user_address", buyer.address],
      ["user_phone", buyer.phone],
      ["user_basket", JSON.stringify([["Model car", "1234.50", 1]])],
      ["debug_on", "1"],
      ["client_lang", "tr"],
    ];

    it.each([
      ["a new card", undefined, []],
      [
        "a new card that is stored",
        { storeCard: true, utoken: "UT0" },
        [
          ["store_card", "1"],
          ["utoken", "UT0"],
        ],
      ],
      [
        "a saved card",
        { savedCard: { utoken: "UT1", ctoken: "CT1", requireCvv: true } },
        [
          ["utoken", "UT1"],
          ["ctoken", "CT1"],
          ["require_cvv", "1"],
        ],
      ],
    ] as const)(
      "sends exactly the pre-installment form for %s",
      async (_label, options, tail) => {
        const result = await service.createDirectPaymentForm(
          "ORDSINGLE1",
          1234.5,
          buyer,
          basket,
          options as Parameters<PayTRService["createDirectPaymentForm"]>[4],
        );
        expect(result.fields.map(({ name, value }) => [name, value])).toEqual([
          ...singlePaymentHead(),
          ...tail,
        ]);
      },
    );
  });

  describe("createDirectPaymentForm, installments (no caller yet)", () => {
    it("signs the lowest installment count, 2", async () => {
      const fields = await formFields({ installmentCount: 2 });
      expect(fields.installment_count).toBe("2");
      expect(fields.paytr_token).toBe(
        tokenOf({
          oid: "ORDSINGLE1",
          amount: "1234.50",
          installment: "2",
          non3d: "0",
        }),
      );
    });

    it("signs installment_count and sends card_type outside the token", async () => {
      const fields = await formFields({
        installmentCount: 6,
        cardType: "world",
      });

      expect(fields.installment_count).toBe("6");
      expect(fields.card_type).toBe("world");
      // card_type is not in the Direct API hash (1. Adim samples).
      expect(fields.paytr_token).toBe(
        tokenOf({
          oid: "ORDSINGLE1",
          amount: "1234.50",
          installment: "6",
          non3d: "0",
        }),
      );
    });

    it("sends card_type with a saved card too (Kayitli karttan odeme)", async () => {
      const fields = await formFields({
        installmentCount: 3,
        cardType: "saglamkart",
        savedCard: { utoken: "UT1", ctoken: "CT1", requireCvv: true },
      });
      expect(fields.installment_count).toBe("3");
      expect(fields.card_type).toBe("saglamkart");
      expect(fields.ctoken).toBe("CT1");
    });

    it("allows installments without card_type", async () => {
      const fields = await formFields({ installmentCount: 12 });
      expect(fields.installment_count).toBe("12");
      expect(fields).not.toHaveProperty("card_type");
    });

    it.each([0, 1, undefined])(
      "never sends card_type on a single payment (installmentCount %p)",
      async (installmentCount) => {
        const fields = await formFields({
          installmentCount,
          cardType: "axess",
        });
        expect(fields.installment_count).toBe("0");
        expect(fields).not.toHaveProperty("card_type");
        expect(fields.paytr_token).toBe(
          tokenOf({
            oid: "ORDSINGLE1",
            amount: "1234.50",
            installment: "0",
            non3d: "0",
          }),
        );
      },
    );

    it.each([13, 2.5, -1, Number.NaN])(
      "refuses to sign installmentCount %p",
      async (installmentCount) => {
        await expect(formFields({ installmentCount })).rejects.toThrow(
          /installment_count/,
        );
      },
    );

    it("refuses a card_type outside PayTR's families (BIN brand 'none')", async () => {
      await expect(
        formFields({
          installmentCount: 3,
          cardType: "none" as never,
        }),
      ).rejects.toThrow(/card_type/);
    });
  });

  describe("chargeRecurring (membership renewals)", () => {
    it("always sends and signs installment_count 0, with no card_type", async () => {
      fetchSpy.mockResolvedValue({
        text: async () => JSON.stringify({ status: "success" }),
      });

      const r = await service.chargeRecurring({
        utoken: "UT1",
        ctoken: "CT1",
        amount: 249.9,
        merchantOid: "MEMRENEW1",
        buyer,
        basketItems: [{ name: "Membership", price: 249.9, quantity: 1 }],
      });

      expect(r.status).toBe("success");
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const body = new URLSearchParams(
        (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
      );
      expect(body.get("installment_count")).toBe("0");
      expect(body.get("recurring_payment")).toBe("1");
      expect(body.get("non_3d")).toBe("1");
      expect(body.has("card_type")).toBe(false);
      expect(body.get("paytr_token")).toBe(
        tokenOf({
          oid: "MEMRENEW1",
          amount: "249.90",
          installment: "0",
          non3d: "1",
        }),
      );
    });
  });
});
