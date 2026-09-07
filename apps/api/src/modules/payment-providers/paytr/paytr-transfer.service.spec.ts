import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import * as crypto from "crypto";
import { PayTRCredentials } from "./paytr-credentials.service";
import { PayTRTransferService } from "./paytr-transfer.service";

/**
 * Aşama-1: Platform Transfer talimatı (dev.paytr.com/platform-transfer-talebi/
 * transfer-talimatinin-verilmesi). Doküman:
 *   hash = merchant_id + merchant_oid + trans_id + submerchant_amount +
 *          total_amount + transfer_name + transfer_iban + merchant_salt
 *   token = base64(HMAC-SHA256(hash, merchant_key)); tutarlar kuruş (×100);
 *   trans_id alfanümerik ≤60; merchant_oid alfanümerik ≤64.
 * Bu test yoktu; tireli trans_id bu yüzden üretimde yakalandı.
 */
describe("PayTRTransferService.createPlatformTransfer", () => {
  const MID = "merchant_id_1";
  const KEY = "merchant_key_xx";
  const SALT = "merchant_salt_yy";
  let service: PayTRTransferService;
  let fetchSpy: jest.SpyInstance;

  const hmac = (s: string) =>
    crypto.createHmac("sha256", KEY).update(s).digest("base64");

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayTRCredentials,
        PayTRTransferService,
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
    service = module.get(PayTRTransferService);
    fetchSpy = jest.spyOn(
      global,
      "fetch" as never,
    ) as unknown as jest.SpyInstance;
  });

  afterEach(() => fetchSpy.mockRestore());

  const bodyOf = (): URLSearchParams =>
    new URLSearchParams(fetchSpy.mock.calls[0][1].body as string);

  const params = {
    merchantOid: "ORD-K7X9M2QF3N",
    transId: "PYTK7X9M2QF3N",
    submerchantAmount: 92.5,
    totalAmount: 100,
    transferName: "Ayşe Yılmaz",
    transferIban: "TR330006100519786457841326",
  };

  it("posts the documented fields with kuruş amounts and the documented token", async () => {
    fetchSpy.mockResolvedValue({
      text: async () =>
        JSON.stringify({
          status: "success",
          merchant_amount: "5",
          submerchant_amount: "92.5",
          trans_id: params.transId,
          reference: "12SF45",
        }),
    });

    const result = await service.createPlatformTransfer(params);

    expect(result.status).toBe("success");
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://www.paytr.com/odeme/platform/transfer",
    );
    const body = bodyOf();
    // merchant_oid tiresiz gider (PayTR alfanümerik), trans_id zaten tiresiz.
    expect(body.get("merchant_id")).toBe(MID);
    expect(body.get("merchant_oid")).toBe("ORDK7X9M2QF3N");
    expect(body.get("trans_id")).toBe("PYTK7X9M2QF3N");
    expect(body.get("trans_id")).toMatch(/^[A-Z0-9]{1,60}$/);
    expect(body.get("submerchant_amount")).toBe("9250");
    expect(body.get("total_amount")).toBe("10000");
    expect(body.get("transfer_name")).toBe(params.transferName);
    expect(body.get("transfer_iban")).toBe(params.transferIban);
    expect(body.get("paytr_token")).toBe(
      hmac(
        MID +
          "ORDK7X9M2QF3N" +
          "PYTK7X9M2QF3N" +
          "9250" +
          "10000" +
          params.transferName +
          params.transferIban +
          SALT,
      ),
    );
    expect([...body.keys()].sort()).toEqual(
      [
        "merchant_id",
        "merchant_oid",
        "trans_id",
        "submerchant_amount",
        "total_amount",
        "transfer_name",
        "transfer_iban",
        "paytr_token",
      ].sort(),
    );
  });

  it("returns PayTR's error payload untouched so the caller can retry/fail", async () => {
    fetchSpy.mockResolvedValue({
      text: async () =>
        JSON.stringify({
          status: "error",
          err_no: "010",
          err_msg: "toplam transfer tutarı kalan tutardan fazla olamaz",
        }),
    });
    const result = await service.createPlatformTransfer(params);
    expect(result).toEqual({
      status: "error",
      err_no: "010",
      err_msg: "toplam transfer tutarı kalan tutardan fazla olamaz",
    });
  });

  it("refuses a hyphenated trans_id before touching the network", async () => {
    let thrown: BadRequestException | undefined;
    try {
      await service.createPlatformTransfer({
        ...params,
        transId: "PYT-K7X9M2QF3N",
      });
    } catch (e) {
      thrown = e as BadRequestException;
    }
    expect(thrown).toBeInstanceOf(BadRequestException);
    // Hata gövdesi i18n payload'ıdır; sebep parametresinde alan adı geçer.
    expect(thrown!.getResponse()).toEqual({
      i18nKey: "server.payment.paytrPlatformTransferFailed",
      i18nParams: { reason: expect.stringContaining("trans_id") },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
