import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { PayTRCredentials } from "../../payment-providers/paytr/paytr-credentials.service";
import { PayTRReportService } from "../../payment-providers/paytr/paytr-report.service";
import { PayTRService } from "../../payment-providers/paytr/paytr.service";
import { PayTRTransferService } from "../../payment-providers/paytr/paytr-transfer.service";
import {
  paytrTaksitOranlariStagingBody,
  PAYTR_STAGING_FAMILIES,
  PAYTR_STAGING_FAMILY_RATES,
} from "../../../../test/fixtures/paytr-taksit-oranlari-staging";
import { INSTALLMENT_FEE_VAT_RATE_PCT } from "./installment-config";
import {
  evaluateInstallmentOffer,
  type InstallmentRateSource,
} from "./installment-eligibility";
import { InstallmentRatesService } from "./installment-rates.service";

/**
 * Hub plan S0: the staging `taksit-oranlari` answer, through the real PayTR
 * parser into the real rate service, is a complete snapshot, gets stored,
 * and prices. Only the HTTP call and the database are faked.
 */
describe("Installment rates: PayTR staging capture end to end (S0)", () => {
  let paytr: PayTRService;
  let fetchSpy: jest.SpyInstance;
  let warn: jest.SpyInstance;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
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
    paytr = module.get(PayTRService);
    // PayTR echoes the request_id it was sent.
    fetchSpy = jest.spyOn(global, "fetch" as never).mockImplementation((async (
      _url: string,
      init: { body: string },
    ) => {
      const sent = new URLSearchParams(init.body).get("request_id") ?? "";
      const text = paytrTaksitOranlariStagingBody(sent);
      return { text: async () => text };
    }) as never) as unknown as jest.SpyInstance;
    warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    jest.restoreAllMocks();
  });

  function ratesService() {
    let stored: InstallmentRateSource | null = null;
    const prisma = {
      installmentRateSnapshot: {
        findFirst: jest.fn(async () => stored),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          stored = {
            id: data.id as string,
            fetchedAt: data.fetchedAt as Date,
            singleRatePct: data.singleRatePct as Prisma.Decimal,
            maxInstallmentNonBusiness: data.maxInstallmentNonBusiness as number,
            rates: data.rates as Prisma.JsonValue,
          };
          return stored;
        }),
      },
    };
    const cache = {
      claimKey: jest.fn(async () => "claimed"),
      del: jest.fn(async () => undefined),
    };
    const providers = { resolve: jest.fn(() => paytr) };
    const settings = { read: jest.fn(async () => ({ enabled: true })) };
    const service = new InstallmentRatesService(
      prisma as never,
      cache as never,
      providers as never,
      settings as never,
    );
    return { service, prisma };
  }

  it("judges the snapshot complete and stores r1 = 3.46 with all nine families", async () => {
    const { service, prisma } = ratesService();

    expect(await service.refresh()).toBe("stored");

    expect(prisma.installmentRateSnapshot.create).toHaveBeenCalledTimes(1);
    const data = prisma.installmentRateSnapshot.create.mock.calls[0][0].data;
    expect(data.paytrMerchant).toBe("marketplace");
    expect(data.maxInstallmentNonBusiness).toBe(12);
    expect(data.singleRatePct).toBeInstanceOf(Prisma.Decimal);
    expect(String(data.singleRatePct)).toBe("3.46");
    const rates = data.rates as Record<string, unknown>;
    expect(Object.keys(rates).sort()).toEqual(
      [...PAYTR_STAGING_FAMILIES].sort(),
    );
    for (const family of PAYTR_STAGING_FAMILIES) {
      expect(rates[family]).toEqual(PAYTR_STAGING_FAMILY_RATES);
    }
    expect(rates).not.toHaveProperty("tumu");
    // The raw answer is stored as received, `tumu` included.
    expect((data.raw as { oranlar: { tumu: unknown } }).oranlar.tumu).toEqual({
      tek_cekim: 3.46,
    });
    // Neither "entries not understood" nor "incomplete" was logged.
    expect(warn).not.toHaveBeenCalled();
  });

  it("prices the stored snapshot: counts 2-12 offered, buyer pays all by default", async () => {
    const { service } = ratesService();
    const snapshot = await service.freshSnapshot();
    expect(snapshot).not.toBeNull();
    if (!snapshot) return;

    const result = evaluateInstallmentOffer({
      baseAmount: new Prisma.Decimal("1000.00"),
      snapshot,
      family: "world",
      segment: "free",
      rules: [],
      now: new Date(),
      feeVatRatePct: INSTALLMENT_FEE_VAT_RATE_PCT,
      slices: null,
    });

    expect(result.offeredByPaytr).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(result.unpriceable).toEqual([]);
    const byCount = new Map(
      result.offers.map((offer) => [offer.price.count, offer]),
    );
    // T = 1000, r1 = 3.46 %, k = 1/6:
    // n = 3,  rn = 9.47 %: C_raw = 1000 * 4.7924 / 4.4318 = 1081.3665..,
    //                      per installment ceil(360.4555..) = 360.46.
    // n = 12, rn = 27.8 %: C_raw = 1000 * 4.7924 / 3.3320 = 1438.2953..,
    //                      per installment ceil(119.8579..) = 119.86.
    const three = byCount.get(3);
    expect(three?.installmentRatePct.toString()).toBe("9.47");
    expect(three?.price.chargedAmount.toFixed(2)).toBe("1081.38");
    expect(three?.price.feeAmount.toFixed(2)).toBe("81.38");
    expect(three?.price.monthlyAmount.toFixed(2)).toBe("360.46");
    expect(three?.price.platformCostAmount.toFixed(2)).toBe("0.00");
    const twelve = byCount.get(12);
    expect(twelve?.installmentRatePct.toString()).toBe("27.8");
    expect(twelve?.price.chargedAmount.toFixed(2)).toBe("1438.32");
    expect(twelve?.price.feeAmount.toFixed(2)).toBe("438.32");
    expect(twelve?.price.monthlyAmount.toFixed(2)).toBe("119.86");
    expect(twelve?.price.platformCostAmount.toFixed(2)).toBe("0.00");
  });
});
