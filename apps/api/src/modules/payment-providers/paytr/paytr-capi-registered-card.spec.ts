import { Logger } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { PayTRService, PayTRBuyer } from "./paytr.service";
import { PayTRCredentials } from "./paytr-credentials.service";
import { PayTRReportService } from "./paytr-report.service";
import { PayTRTransferService } from "./paytr-transfer.service";

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
    const answer = (body: Record<string, unknown>) =>
      fetchSpy.mockResolvedValue({ text: async () => JSON.stringify(body) });

    it("hits /odeme/api/bin-detail with hash = bin + merchant_id + merchant_salt", async () => {
      answer({
        status: "success",
        bank: "Yapı Kredi",
        bankCode: "0067",
        schema: "VISA",
        cardType: "credit",
        brand: "world",
        businessCard: "n",
        allow_non3d: "Y",
      });

      const r = await service.lookupBin("454671xxxx");

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://www.paytr.com/odeme/api/bin-detail",
        expect.objectContaining({ method: "POST" }),
      );
      const body = bodyOf();
      expect(body.get("bin_number")).toBe("454671");
      expect(body.get("merchant_id")).toBe(MID);
      const expected = crypto
        .createHmac("sha256", KEY)
        .update("454671" + MID + SALT)
        .digest("base64");
      expect(body.get("paytr_token")).toBe(expected);

      expect(r).toEqual({
        ok: true,
        outcome: "success",
        bank: "Yapı Kredi",
        bankCode: "0067",
        schema: "VISA",
        cardType: "credit",
        brand: "world",
        cardFamily: "world",
        businessCard: false,
        allowNon3d: true,
      });
    });

    it.each([
      ["4546711234567890", "45467112"],
      ["4546 7112", "45467112"],
      ["4546711", "454671"],
    ])("sends 8 digits when it has them, else 6 (%p)", async (input, sent) => {
      answer({ status: "success", brand: "none" });
      await service.lookupBin(input);
      expect(bodyOf().get("bin_number")).toBe(sent);
    });

    it("reports brand 'none' without a card family (no PayTR installments)", async () => {
      answer({ status: "success", brand: "none", businessCard: "y" });
      const r = await service.lookupBin("45467112");
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.brand).toBe("none");
      expect(r.cardFamily).toBeUndefined();
      expect(r.businessCard).toBe(true);
    });

    it("leaves unknown flag values undefined instead of guessing", async () => {
      answer({ status: "success", brand: "Bonus", businessCard: "?" });
      const r = await service.lookupBin("45467112");
      if (!r.ok) throw new Error("expected success");
      expect(r.cardFamily).toBe("bonus");
      expect(r.businessCard).toBeUndefined();
      expect(r.allowNon3d).toBeUndefined();
    });

    it("tells an undefined BIN (failed, cacheable) from a query error", async () => {
      answer({ status: "failed" });
      expect(await service.lookupBin("45467112")).toEqual({
        ok: false,
        outcome: "failed",
        errMsg: "BIN not defined",
      });

      answer({ status: "error", err_msg: "paytr_token gecersiz" });
      expect(await service.lookupBin("45467112")).toEqual({
        ok: false,
        outcome: "error",
        errMsg: "paytr_token gecersiz",
      });
    });

    it("returns an error outcome on a network failure or a non-JSON answer", async () => {
      fetchSpy.mockRejectedValueOnce(new Error("timeout"));
      expect(await service.lookupBin("45467112")).toMatchObject({
        ok: false,
        outcome: "error",
      });

      fetchSpy.mockResolvedValueOnce({ text: async () => "<html>" });
      expect(await service.lookupBin("45467112")).toMatchObject({
        ok: false,
        outcome: "error",
      });
    });

    it("never logs the BIN when the lookup fails", async () => {
      const warn = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      const error = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);
      fetchSpy.mockRejectedValueOnce(new Error("timeout"));

      await service.lookupBin("4546711234567890");

      const logged = [...warn.mock.calls, ...error.mock.calls]
        .map((call) => String(call[0]))
        .join("\n");
      expect(logged).toContain("timeout");
      expect(logged).not.toContain("454671");
      warn.mockRestore();
      error.mockRestore();
    });

    it("aborts after the caller's timeout (3 s in the buyer's path), else the global one", async () => {
      const timeout = jest.spyOn(AbortSignal, "timeout");
      answer({ status: "success", brand: "none" });
      await service.lookupBin("45467112", { timeoutMs: 3000 });
      expect(timeout).toHaveBeenLastCalledWith(3000);
      await service.lookupBin("45467112");
      expect(timeout.mock.calls.at(-1)?.[0]).not.toBe(3000);
      timeout.mockRestore();
    });

    it("reports a timeout as an `error` outcome (not cacheable)", async () => {
      const warn = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      fetchSpy.mockRejectedValueOnce(
        new DOMException(
          "The operation was aborted due to timeout",
          "TimeoutError",
        ),
      );
      expect(
        await service.lookupBin("45467112", { timeoutMs: 3000 }),
      ).toMatchObject({
        ok: false,
        outcome: "error",
      });
      warn.mockRestore();
    });

    it("refuses fewer than 6 digits without calling PayTR", async () => {
      const r = await service.lookupBin("45467");
      expect(r).toMatchObject({ ok: false, outcome: "error" });
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("getInstallmentRates", () => {
    const answer = (body: Record<string, unknown>) =>
      fetchSpy.mockResolvedValue({ text: async () => JSON.stringify(body) });

    it("hits /odeme/taksit-oranlari with hash = merchant_id + request_id + merchant_salt", async () => {
      answer({
        status: "success",
        request_id: "req1",
        max_inst_non_bus: "9",
        oranlar: { axess: { taksit_2: "2.83" } },
      });

      const r = await service.getInstallmentRates("req1", {
        singleRatio: true,
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://www.paytr.com/odeme/taksit-oranlari",
        expect.objectContaining({ method: "POST" }),
      );
      const body = bodyOf();
      expect(body.get("request_id")).toBe("req1");
      expect(body.get("single_ratio")).toBe("1");
      expect(body.has("abroad_ratio")).toBe(false);
      const expected = crypto
        .createHmac("sha256", KEY)
        .update(MID + "req1" + SALT)
        .digest("base64");
      expect(body.get("paytr_token")).toBe(expected);

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.maxInstallmentNonBusiness).toBe(9);
    });

    // Regression: the parser read `data.rates`, which PayTR never sends, so
    // the table was always undefined. The documented field is `oranlar`.
    it("reads the rates from oranlar, keeps the raw answer and ignores rates", async () => {
      const raw = {
        status: "success",
        request_id: "req2",
        max_inst_non_bus: 12,
        oranlar: {
          axess: { taksit_2: "2.83", taksit_3: "3,95" },
          world: { "2": "2.90" },
        },
        rates: { bonus: { taksit_2: "9.99" } },
      };
      answer(raw);

      const r = await service.getInstallmentRates("req2");

      expect(r).toEqual({
        ok: true,
        requestId: "req2",
        maxInstallmentNonBusiness: 12,
        rates: {
          axess: { "2": "2.83", "3": "3.95" },
          world: { "2": "2.90" },
        },
        ignored: [],
        raw,
      });
    });

    it("does not read a single rate until its field is known (an echoed flag is not a 1% rate)", async () => {
      answer({
        status: "success",
        request_id: "req8",
        max_inst_non_bus: 12,
        single_ratio: "1",
        oranlar: { world: { "2": "5.5" } },
      });
      const r = await service.getInstallmentRates("req8", {
        singleRatio: true,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.singleRatePct).toBeUndefined();
      expect(r.raw.single_ratio).toBe("1");
    });

    it("never throws on unknown keys inside oranlar", async () => {
      answer({
        status: "success",
        request_id: "req3",
        oranlar: { axess: { taksit_2: "2.8", foo: { bar: 1 } }, troy: [] },
      });

      const r = await service.getInstallmentRates("req3");

      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.rates).toEqual({ axess: { "2": "2.8" } });
      expect(r.ignored).toEqual(["oranlar.axess.foo", "oranlar.troy"]);
      expect(r.maxInstallmentNonBusiness).toBeUndefined();
    });

    it("fails closed when the echoed request_id differs", async () => {
      answer({
        status: "success",
        request_id: "someone-else",
        oranlar: { axess: { taksit_2: "2.8" } },
      });
      const r = await service.getInstallmentRates("req4");
      expect(r).toEqual({ ok: false, errMsg: "request_id mismatch" });
    });

    it("returns err_msg on a failed answer", async () => {
      answer({
        status: "failed",
        err_msg: "Zorunlu alan degeri gecersiz veya gonderilmedi:",
      });
      const r = await service.getInstallmentRates("req5");
      expect(r).toEqual({
        ok: false,
        errMsg: "Zorunlu alan degeri gecersiz veya gonderilmedi:",
      });
    });

    it("returns ok false on a network error", async () => {
      fetchSpy.mockRejectedValue(new Error("socket hang up"));
      const r = await service.getInstallmentRates("req6");
      expect(r).toEqual({ ok: false, errMsg: "socket hang up" });
    });

    it("accepts a request_id of exactly 32 characters", async () => {
      const id = "r".repeat(32);
      answer({ status: "success", request_id: id, oranlar: {} });
      const r = await service.getInstallmentRates(id);
      expect(r.ok).toBe(true);
      expect(bodyOf().get("request_id")).toBe(id);
    });

    it("reads a case-variant Success status like success", async () => {
      answer({
        status: "Success",
        request_id: "req7",
        oranlar: { axess: { taksit_2: "2.8" } },
      });
      const r = await service.getInstallmentRates("req7");
      expect(r.ok).toBe(true);
    });

    it.each([[""], ["x".repeat(33)], ["   "]])(
      "refuses a request_id that is empty or longer than 32 (%p) without calling PayTR",
      async (id) => {
        const r = await service.getInstallmentRates(id);
        expect(r.ok).toBe(false);
        expect(fetchSpy).not.toHaveBeenCalled();
      },
    );
  });
});
