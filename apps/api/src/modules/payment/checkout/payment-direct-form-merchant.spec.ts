import { GoneException, Logger, NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { PaytrMerchant, SavedCardStatus } from "@prisma/client";
import {
  PaymentInitiationService,
  resolveStoreCard,
  shouldStoreCard,
} from "./payment-initiation.service";
import { PaymentProviderRegistry } from "../../payment-providers/payment-provider.registry";
import { PayTRCredentials } from "../../payment-providers/paytr/paytr-credentials.service";
import { PayTRReportService } from "../../payment-providers/paytr/paytr-report.service";
import { PayTRTransferService } from "../../payment-providers/paytr/paytr-transfer.service";
import { PayTRService } from "../../payment-providers/paytr/paytr.service";

/**
 * Direct form mağaza kapsamı: form, kart kasası ve yetenekler ödemenin
 * mağazasınındır. Üyelik ödemesi üyelik mağazasında imzalanır, kartı orada
 * saklar (varsayılan) ve yalnız o mağazanın kayıtlı kartını kullanabilir.
 */
describe("PaymentInitiationService.buildDirectPaymentForm — merchant scope", () => {
  const buyer = {
    name: "A",
    surname: "B",
    email: "a@b.test",
    phone: "+905000000000",
    address: "x",
    city: "y",
    country: "TR",
    ip: "85.1.2.3",
  };

  function setup(opts: {
    merchant: PaytrMerchant;
    env?: Record<string, string>;
    savedCard?: Record<string, unknown> | null;
    /** Gerçek PayTR sağlayıcısı (imzalı form alanlarını doğrulamak için). */
    registry?: PaymentProviderRegistry;
  }) {
    const createDirectPaymentForm = jest.fn().mockResolvedValue({
      action: "https://www.paytr.com/odeme",
      method: "POST",
      fields: [],
      requireCvv: false,
    });
    const resolve = jest.fn(() => ({ createDirectPaymentForm }));
    const prisma = {
      savedCard: {
        findFirst: jest.fn().mockResolvedValue(opts.savedCard ?? null),
      },
    };
    const env = opts.env ?? {};
    const events = { record: jest.fn() };
    const svc = new PaymentInitiationService(
      prisma as never,
      { get: (k: string) => env[k] } as never,
      opts.registry ?? ({ resolve } as never),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      events as never,
      { ensureForPayment: jest.fn().mockResolvedValue(null) } as never, // distanceSalesConsent
    );
    const ctx = {
      payment: {
        id: "pay-1",
        provider: "paytr",
        paytrMerchant: opts.merchant,
      },
      buyer,
      basketItems: [],
      merchantOid: "MEM1T1",
      amount: 199,
      successQueryParams: "paymentId=pay-1&type=membership",
    };
    const build = (dto: Record<string, unknown>, userId: string | null) =>
      (
        svc as unknown as {
          buildDirectPaymentForm: (
            d: unknown,
            c: unknown,
            u: string | null,
          ) => Promise<unknown>;
        }
      ).buildDirectPaymentForm(dto, ctx, userId);
    return { build, resolve, createDirectPaymentForm, prisma, events };
  }

  it("signs a membership form on the membership merchant and stores the card by default", async () => {
    const { build, resolve, createDirectPaymentForm, prisma } = setup({
      merchant: PaytrMerchant.membership,
    });
    await build({ orderId: "o-1" }, "user-1");
    expect(resolve).toHaveBeenCalledWith("paytr", PaytrMerchant.membership);
    expect(createDirectPaymentForm.mock.calls[0][4]).toMatchObject({
      storeCard: true,
    });
    expect(prisma.savedCard.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paytrMerchant: PaytrMerchant.membership,
        }),
      }),
    );
  });

  it("honours an explicit opt-out on a membership payment", async () => {
    const { build, createDirectPaymentForm } = setup({
      merchant: PaytrMerchant.membership,
    });
    await build({ orderId: "o-1", saveCard: false }, "user-1");
    expect(createDirectPaymentForm.mock.calls[0][4]).toMatchObject({
      storeCard: false,
    });
  });

  it("keeps marketplace card storage behind PAYTR_CARD_STORAGE_ENABLED", async () => {
    const off = setup({ merchant: PaytrMerchant.marketplace });
    await off.build({ orderId: "o-1", saveCard: true }, "user-1");
    expect(off.createDirectPaymentForm.mock.calls[0][4]).toMatchObject({
      storeCard: false,
    });

    const on = setup({
      merchant: PaytrMerchant.marketplace,
      env: { PAYTR_CARD_STORAGE_ENABLED: "true" },
    });
    await on.build({ orderId: "o-1", saveCard: true }, "user-1");
    expect(on.resolve).toHaveBeenCalledWith("paytr", PaytrMerchant.marketplace);
    expect(on.createDirectPaymentForm.mock.calls[0][4]).toMatchObject({
      storeCard: true,
    });
  });

  it("only finds a saved card that lives on the payment's merchant", async () => {
    const { build, prisma } = setup({
      merchant: PaytrMerchant.membership,
      savedCard: null,
    });
    await expect(
      build({ orderId: "o-1", savedCardId: "card-1" }, "user-1"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.savedCard.findFirst).toHaveBeenCalledWith({
      where: {
        id: "card-1",
        userId: "user-1",
        paytrMerchant: PaytrMerchant.membership,
        status: SavedCardStatus.active,
      },
    });
  });

  it("refuses a saved card when the merchant has no card storage", async () => {
    const { build } = setup({
      merchant: PaytrMerchant.membership,
      env: { PAYTR_MEMBERSHIP_CARD_STORAGE_ENABLED: "false" },
    });
    await expect(
      build({ orderId: "o-1", savedCardId: "card-1" }, "user-1"),
    ).rejects.toBeInstanceOf(GoneException);
  });
});

/**
 * "Kartımı kaydet": giriş yapmış kullanıcının saveCard isteği imzalı forma
 * `store_card=1` olarak gider; istendiği halde eklenmiyorsa nedeni günlüğe ve
 * `direct_payment` sağlayıcı olayına yazılır (eskiden sessizce düşüyordu).
 */
describe("PaymentInitiationService.buildDirectPaymentForm — store_card", () => {
  const ENV: Record<string, string> = {
    PAYTR_MERCHANT_ID: "111111",
    PAYTR_MERCHANT_KEY: "market-key",
    PAYTR_MERCHANT_SALT: "market-salt",
    PAYTR_MEMBERSHIP_MERCHANT_ID: "222222",
    PAYTR_MEMBERSHIP_MERCHANT_KEY: "member-key",
    PAYTR_MEMBERSHIP_MERCHANT_SALT: "member-salt",
    PAYTR_CARD_STORAGE_ENABLED: "true",
  };

  function realRegistry(env: Record<string, string>) {
    const config = {
      get: (key: string, fallback?: string) => env[key] ?? fallback,
    } as unknown as ConfigService;
    const creds = new PayTRCredentials(config);
    return new PaymentProviderRegistry(
      new PayTRService(
        creds,
        new PayTRReportService(creds),
        new PayTRTransferService(creds),
        config,
      ),
    );
  }

  function build(opts: {
    env: Record<string, string>;
    dto: Record<string, unknown>;
    userId: string | null;
  }) {
    const prisma = {
      savedCard: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const events = { record: jest.fn() };
    const svc = new PaymentInitiationService(
      prisma as never,
      { get: (k: string) => opts.env[k] } as never,
      realRegistry(opts.env),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      events as never,
      { ensureForPayment: jest.fn().mockResolvedValue(null) } as never,
    );
    const ctx = {
      payment: {
        id: "pay-1",
        provider: "paytr",
        paytrMerchant: PaytrMerchant.marketplace,
      },
      buyer: {
        name: "A",
        surname: "B",
        email: "a@b.test",
        phone: "+905000000000",
        address: "x",
        city: "y",
        country: "TR",
        ip: "85.1.2.3",
      },
      basketItems: [
        { id: "p-1", name: "Model", category: "x", price: 150, quantity: 1 },
      ],
      merchantOid: "ORD1T1",
      amount: 150,
      successQueryParams: "paymentId=pay-1",
    };
    const run = (
      svc as unknown as {
        buildDirectPaymentForm: (
          d: unknown,
          c: unknown,
          u: string | null,
        ) => Promise<{ fields: Array<{ name: string; value: string }> }>;
      }
    ).buildDirectPaymentForm(opts.dto, ctx, opts.userId);
    return { run, events };
  }

  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("valid user + saveCard → signed form carries store_card=1, no skip reason", async () => {
    const { run, events } = build({
      env: ENV,
      dto: { orderId: "o-1", saveCard: true },
      userId: "user-1",
    });
    const form = await run;
    const fields = Object.fromEntries(
      form.fields.map((f) => [f.name, f.value]),
    );
    expect(fields.store_card).toBe("1");
    expect(events.record.mock.calls[0][0].raw).toEqual({
      formPrepared: true,
      storeCard: true,
    });
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("store_card skipped"),
    );
  });

  it("guest + saveCard → no store_card, reason 'guest' logged and recorded", async () => {
    const { run, events } = build({
      env: ENV,
      dto: { orderId: "o-1", saveCard: true },
      userId: null,
    });
    const form = await run;
    expect(form.fields.map((f) => f.name)).not.toContain("store_card");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("store_card skipped payment=pay-1"),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("reason=guest"));
    expect(events.record.mock.calls[0][0].raw).toMatchObject({
      storeCard: false,
      storeCardSkippedReason: "guest",
    });
  });

  it("card storage disabled on the merchant → reason 'card_storage_disabled'", async () => {
    const { PAYTR_CARD_STORAGE_ENABLED: _off, ...env } = ENV;
    const { run, events } = build({
      env,
      dto: { orderId: "o-1", saveCard: true },
      userId: "user-1",
    });
    const form = await run;
    expect(form.fields.map((f) => f.name)).not.toContain("store_card");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("reason=card_storage_disabled"),
    );
    expect(events.record.mock.calls[0][0].raw).toMatchObject({
      storeCardSkippedReason: "card_storage_disabled",
    });
  });

  it("saveCard not requested → no skip log, raw unchanged", async () => {
    const { run, events } = build({
      env: ENV,
      dto: { orderId: "o-1", saveCard: false },
      userId: null,
    });
    await run;
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining("store_card skipped"),
    );
    expect(events.record.mock.calls[0][0].raw).toEqual({
      formPrepared: true,
      storeCard: false,
    });
  });
});

describe("resolveStoreCard", () => {
  const base = {
    merchant: PaytrMerchant.marketplace,
    userId: "user-1" as string | null,
    cardStorageEnabled: true,
  };
  it("matches the previous storeCard rule and names the skip reason", () => {
    expect(resolveStoreCard({ ...base, saveCard: true })).toEqual({
      storeCard: true,
      skippedReason: null,
    });
    expect(resolveStoreCard({ ...base, saveCard: undefined })).toEqual({
      storeCard: false,
      skippedReason: null,
    });
    expect(resolveStoreCard({ ...base, saveCard: true, userId: null })).toEqual(
      { storeCard: false, skippedReason: "guest" },
    );
    expect(
      resolveStoreCard({ ...base, saveCard: true, cardStorageEnabled: false }),
    ).toEqual({ storeCard: false, skippedReason: "card_storage_disabled" });
    // Üyelik mağazası varsayılan olarak saklar → kullanıcısızsa neden "guest".
    expect(
      resolveStoreCard({
        ...base,
        merchant: PaytrMerchant.membership,
        saveCard: undefined,
        userId: null,
      }),
    ).toEqual({ storeCard: false, skippedReason: "guest" });
  });
});

describe("shouldStoreCard", () => {
  it("defaults to storing on the membership merchant only", () => {
    expect(shouldStoreCard(undefined, PaytrMerchant.membership)).toBe(true);
    expect(shouldStoreCard(undefined, PaytrMerchant.marketplace)).toBe(false);
    expect(shouldStoreCard(false, PaytrMerchant.membership)).toBe(false);
    expect(shouldStoreCard(true, PaytrMerchant.marketplace)).toBe(true);
  });
});
