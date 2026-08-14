import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { PayTRService, PayTRBuyer } from "./paytr.service";

/**
 * PayTR Direkt API doküman uyumu:
 *  - Kayıtlı karttan ödeme (Payment By Registered Card): /odeme, recurring_payment
 *    GÖNDERİLMEZ, require_cvv zorunlu, hash Direkt API ile birebir aynı.
 *  - BIN sorgulama: /odeme/api/bin-detail, hash = bin_number + merchant_id + merchant_salt.
 *  - Taksit oranları: /odeme/taksit-oranlari, hash = merchant_id + request_id + merchant_salt.
 */
describe("PayTRService — CAPI registered-card / BIN / installment (doc parity)", () => {
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
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

  const bodyOf = (): URLSearchParams =>
    new URLSearchParams(fetchSpy.mock.calls[0][1].body as string);

  describe("createDirectPaymentForm", () => {
    it("returns a signed PayTR form without receiving or emitting raw card data", async () => {
      const result = await service.createDirectPaymentForm(
        "ORDDIRECT123",
        149.9,
        buyer,
        [{ name: "Ürün", price: 149.9, quantity: 1 }],
        { storeCard: true, utoken: "UT1" },
      );
      const fields = Object.fromEntries(
        result.fields.map(({ name, value }) => [name, value]),
      );

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.action).toBe("https://www.paytr.com/odeme");
      expect(result.method).toBe("POST");
      expect(fields).toMatchObject({
        merchant_oid: "ORDDIRECT123",
        payment_amount: "149.90",
        non_3d: "0",
        store_card: "1",
        utoken: "UT1",
      });
      expect(fields).not.toHaveProperty("card_number");
      expect(fields).not.toHaveProperty("cc_owner");
      expect(fields).not.toHaveProperty("expiry_month");
      expect(fields).not.toHaveProperty("expiry_year");
      expect(fields).not.toHaveProperty("cvv");
      // PayTR, Unix epoch request_exp_date değerini genel "paytr_token
      // geçersiz" hatasıyla reddediyor; alan yoksa 30 dakikalık varsayılanı kullanır.
      expect(fields).not.toHaveProperty("request_exp_date");

      const hashStr =
        MID +
        buyer.ip +
        "ORDDIRECT123" +
        buyer.email +
        "149.90" +
        "card" +
        "0" +
        "TL" +
        "1" +
        "0";
      const expected = crypto
        .createHmac("sha256", KEY)
        .update(hashStr + SALT)
        .digest("base64");
      expect(fields.paytr_token).toBe(expected);
    });

    it("adds only the owning saved-card tokens and CVV requirement", async () => {
      const result = await service.createDirectPaymentForm(
        "ORDDIRECT124",
        10,
        buyer,
        [{ name: "Ürün", price: 10, quantity: 1 }],
        {
          savedCard: {
            utoken: "UT1",
            ctoken: "CT1",
            requireCvv: true,
          },
        },
      );
      const fields = Object.fromEntries(
        result.fields.map(({ name, value }) => [name, value]),
      );

      expect(result.requireCvv).toBe(true);
      expect(fields).toMatchObject({
        utoken: "UT1",
        ctoken: "CT1",
        require_cvv: "1",
        non_3d: "0",
      });
      expect(fields).not.toHaveProperty("recurring_payment");
      expect(fields).not.toHaveProperty("cvv");
    });
  });

  describe("lookupBin", () => {
    it("hits /odeme/api/bin-detail with hash = bin + merchant_id + merchant_salt", async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({
            status: "success",
            bank: "Yapı Kredi",
            bankCode: 67,
            schema: "VISA",
            cardType: "credit",
            brand: "world",
            businessCard: "n",
            allow_non3d: "Y",
          }),
      });

      const r = await service.lookupBin("454671xxxx");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://www.paytr.com/odeme/api/bin-detail",
        expect.objectContaining({ method: "POST" }),
      );
      const body = bodyOf();
      expect(body.get("bin_number")).toBe("454671");
      const expected = crypto
        .createHmac("sha256", KEY)
        .update("454671" + MID + SALT)
        .digest("base64");
      expect(body.get("paytr_token")).toBe(expected);

      expect(r.ok).toBe(true);
      expect(r.bank).toBe("Yapı Kredi");
      expect(r.schema).toBe("VISA");
      expect(r.cardType).toBe("credit");
      expect(r.businessCard).toBe(false);
      expect(r.allowNon3d).toBe(true);
    });
  });

  describe("getInstallmentRates", () => {
    it("hits /odeme/taksit-oranlari with hash = merchant_id + request_id + merchant_salt", async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({
            status: "success",
            request_id: "req-1",
            max_inst_non_bus: "9",
            rates: { axess: [] },
          }),
      });

      const r = await service.getInstallmentRates("req-1");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://www.paytr.com/odeme/taksit-oranlari",
        expect.objectContaining({ method: "POST" }),
      );
      const body = bodyOf();
      expect(body.get("request_id")).toBe("req-1");
      const expected = crypto
        .createHmac("sha256", KEY)
        .update(MID + "req-1" + SALT)
        .digest("base64");
      expect(body.get("paytr_token")).toBe(expected);

      expect(r.ok).toBe(true);
      expect(r.maxInstallment).toBe(9);
    });
  });
});
