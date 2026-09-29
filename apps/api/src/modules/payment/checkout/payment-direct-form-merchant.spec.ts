import { GoneException, NotFoundException } from "@nestjs/common";
import { PaytrMerchant, SavedCardStatus } from "@prisma/client";
import {
  PaymentInitiationService,
  shouldStoreCard,
} from "./payment-initiation.service";

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
    const svc = new PaymentInitiationService(
      prisma as never,
      { get: (k: string) => env[k] } as never,
      { resolve } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { record: jest.fn() } as never,
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
    return { build, resolve, createDirectPaymentForm, prisma };
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

describe("shouldStoreCard", () => {
  it("defaults to storing on the membership merchant only", () => {
    expect(shouldStoreCard(undefined, PaytrMerchant.membership)).toBe(true);
    expect(shouldStoreCard(undefined, PaytrMerchant.marketplace)).toBe(false);
    expect(shouldStoreCard(false, PaytrMerchant.membership)).toBe(false);
    expect(shouldStoreCard(true, PaytrMerchant.marketplace)).toBe(true);
  });
});
