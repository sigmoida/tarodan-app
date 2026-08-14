import * as crypto from "crypto";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { PayTRService } from "./paytr.service";
import { PayTRCredentials } from "./paytr-credentials.service";

/**
 * 2. aşama (platform transfer sonucu) callback hash doğrulaması.
 * Doküman: hash = base64(HMAC-SHA256(trans_ids + merchant_salt, merchant_key))
 * ve trans_ids HAM string olarak hash'lenir — parse/re-serialize edilmez.
 */
describe("PayTRService.verifyTransferCallback", () => {
  const MERCHANT_KEY = "merchant_key_xx";
  const MERCHANT_SALT = "merchant_salt_yy";
  let service: PayTRService;

  const hashOf = (transIds: string) =>
    crypto
      .createHmac("sha256", MERCHANT_KEY)
      .update(transIds + MERCHANT_SALT)
      .digest("base64");

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayTRCredentials,
        PayTRService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === "PAYTR_MERCHANT_ID") return "merchant_id_1";
              if (key === "PAYTR_MERCHANT_KEY") return MERCHANT_KEY;
              if (key === "PAYTR_MERCHANT_SALT") return MERCHANT_SALT;
              if (key === "PAYTR_TEST_MODE") return "true";
              return undefined;
            }),
          },
        },
      ],
    }).compile();
    service = module.get(PayTRService);
  });

  it("accepts a hash computed over the RAW trans_ids string", () => {
    const transIds = '["dcbbe0b9fd25154d73c","dc8c509efc6450d30"]';
    expect(
      service.verifyTransferCallback({ transIds, hash: hashOf(transIds) }),
    ).toBe(true);
  });

  it("rejects a hash computed for different trans_ids", () => {
    const transIds = '["trans-a"]';
    expect(
      service.verifyTransferCallback({
        transIds,
        hash: hashOf('["trans-b"]'),
      }),
    ).toBe(false);
  });

  it("rejects a wrong-length hash without throwing (timingSafeEqual guard)", () => {
    expect(
      service.verifyTransferCallback({ transIds: '["x"]', hash: "kisa" }),
    ).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(
      service.verifyTransferCallback({ transIds: "", hash: hashOf("") }),
    ).toBe(false);
    expect(
      service.verifyTransferCallback({
        transIds: '["x"]',
        hash: undefined as unknown as string,
      }),
    ).toBe(false);
  });
});
