import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { PayTRService } from "./paytr.service";
import { PayTRCredentials } from "./paytr-credentials.service";

/**
 * PayTR rapor uçları (PSP mutabakat katmanının veri kaynakları):
 *  - İşlem dökümü  /rapor/islem-dokumu   hash = mid + start + end + salt
 *  - Ödeme özeti   /rapor/odeme-dokumu   hash = mid + start + end + salt
 *  - Ödeme detayı  /rapor/odeme-detayi/  hash = mid + date + salt
 * Tutarlar virgüllü gelebilir; islem_tarihi "GG.AA.YYYY" biçimindedir ve
 * ISO'ya (YYYY-MM-DD) normalize edilir. "failed" = kayıt yok → boş liste;
 * "error" → throw (cron loglayıp alarm üretsin).
 */
describe("PayTRService — rapor uçları", () => {
  const MID = "merchant_id_1";
  const KEY = "merchant_key_xx";
  const SALT = "merchant_salt_yy";
  let service: PayTRService;
  let fetchSpy: jest.SpyInstance;

  const hmac = (s: string) =>
    crypto.createHmac("sha256", KEY).update(s).digest("base64");

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayTRCredentials,
        PayTRService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "PAYTR_MERCHANT_ID") return MID;
              if (key === "PAYTR_MERCHANT_KEY") return KEY;
              if (key === "PAYTR_MERCHANT_SALT") return SALT;
              if (key === "PAYTR_TEST_MODE") return "true";
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

  describe("getTransactionStatement (islem-dokumu)", () => {
    const START = "2026-07-31 00:00:00";
    const END = "2026-07-31 23:59:59";

    it("posts to /rapor/islem-dokumu with hash mid+start+end+salt and parses S/I rows", async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({
            status: "success",
            data: [
              {
                islem_tipi: "S",
                islem_tutari: "100,00",
                kesinti_tutari: "2,35",
                kesinti_orani: "2.35",
                net_tutar: "97,65",
                islem_tarihi: "31.07.2026",
                para_birimi: "TL",
                taksit: "0",
                kart_marka: "WORLD",
                kart_no: "455359AAA6747",
                siparis_no: "ORD1",
                odeme_tipi: "KART",
              },
              {
                islem_tipi: "I",
                islem_tutari: "50.00",
                islem_tarihi: "31.07.2026",
                para_birimi: "TL",
                siparis_no: "ORD1",
              },
            ],
          }),
      });

      const rows = await service.getTransactionStatement({
        startDate: START,
        endDate: END,
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://www.paytr.com/rapor/islem-dokumu",
        expect.objectContaining({ method: "POST" }),
      );
      const body = bodyOf();
      expect(body.get("start_date")).toBe(START);
      expect(body.get("end_date")).toBe(END);
      expect(body.get("paytr_token")).toBe(hmac(MID + START + END + SALT));

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        type: "sale",
        merchantOid: "ORD1",
        amountTl: 100,
        feeTl: 2.35,
        netTl: 97.65,
        currency: "TL",
        transactionDate: "2026-07-31", // GG.AA.YYYY → ISO
        cardBrand: "WORLD",
        paymentType: "KART",
      });
      expect(rows[1]).toMatchObject({ type: "refund", amountTl: 50 });
      expect(rows[1].feeTl).toBeNull();
    });

    it("returns [] when PayTR says failed (tarih aralığında işlem yok)", async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({
            status: "failed",
            err_msg: "ilgili tarih araliginda islem bulunamadi",
          }),
      });

      await expect(
        service.getTransactionStatement({ startDate: START, endDate: END }),
      ).resolves.toEqual([]);
    });

    it("throws on error status (cron alarm üretsin)", async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({ status: "error", err_msg: "gecersiz token" }),
      });

      await expect(
        service.getTransactionStatement({ startDate: START, endDate: END }),
      ).rejects.toThrow(/gecersiz token/);
    });
  });

  describe("getSettlementSummary (odeme-ozeti)", () => {
    it("posts to /rapor/odeme-dokumu and parses realized + future_payments as projections", async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({
            status: "success",
            data: [
              {
                date_paid: "2026-07-30",
                currency: "TL",
                sales: "950.95",
                return: "12,64",
                net: "938.31",
                merchant_iban: "TR000000000000000000000001",
              },
            ],
            future_payments: [
              {
                date_paid: "2026-08-02",
                sale_amounts: "100.00",
                return_amounts: "0",
                net_amounts: "97.00",
              },
            ],
          }),
      });

      const rows = await service.getSettlementSummary({
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://www.paytr.com/rapor/odeme-dokumu",
        expect.objectContaining({ method: "POST" }),
      );
      expect(bodyOf().get("paytr_token")).toBe(
        hmac(MID + "2026-07-01" + "2026-07-31" + SALT),
      );

      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        datePaid: "2026-07-30",
        salesTl: 950.95,
        returnsTl: 12.64,
        netTl: 938.31,
        merchantIban: "TR000000000000000000000001",
        projection: false,
      });
      expect(rows[1]).toMatchObject({
        datePaid: "2026-08-02",
        netTl: 97,
        projection: true,
      });
    });

    it("returns [] when no settlement exists in range", async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({
            status: "failed",
            err_msg: "ilgili tarih araliginda odeme ozeti bulunamadi",
          }),
      });

      await expect(
        service.getSettlementSummary({
          startDate: "2026-07-01",
          endDate: "2026-07-31",
        }),
      ).resolves.toEqual([]);
    });
  });

  describe("getSettlementDetail (odeme-detayi)", () => {
    it("posts to /rapor/odeme-detayi/ with hash mid+date+salt and parses items", async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({
            status: "success",
            data: [
              { merchant_oid: "OID1", payment: "100,00", currency: "TL" },
              { merchant_oid: "OID2", payment: "38.31", currency: "TL" },
            ],
          }),
      });

      const rows = await service.getSettlementDetail({ date: "2026-07-30" });

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://www.paytr.com/rapor/odeme-detayi/",
        expect.objectContaining({ method: "POST" }),
      );
      expect(bodyOf().get("paytr_token")).toBe(hmac(MID + "2026-07-30" + SALT));
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ merchantOid: "OID1", amountTl: 100 });
      expect(rows[1]).toMatchObject({ merchantOid: "OID2", amountTl: 38.31 });
    });

    it("returns [] when the settlement day has no detail", async () => {
      fetchSpy.mockResolvedValue({
        text: async () =>
          JSON.stringify({
            status: "failed",
            err_msg: "ilgili tarihte odeme detayi bulunamadi",
          }),
      });

      await expect(
        service.getSettlementDetail({ date: "2026-07-30" }),
      ).resolves.toEqual([]);
    });
  });
});
