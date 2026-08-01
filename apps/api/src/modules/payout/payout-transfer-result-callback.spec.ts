import { PayoutStatus } from "@prisma/client";
import { PayoutService } from "./payout.service";

/**
 * PayTR platform transferi 2. aşama (transfer sonucu callback) entegrasyonu.
 *
 * Bayrak (PAYTR_TRANSFER_CALLBACK_ENABLED=true) açıkken:
 *  - Aşama-1 "success" yanıtı payout'u TAMAMLAMAZ; processing'te bırakır ve
 *    submittedAt/submittedAmount yazar (callback'te mail+ledger bu tutarı kullanır).
 *  - completed + yan etkiler (mail, IBAN doğrulama, ledger) yalnız callback'te.
 * Bayrak kapalıyken eski davranış sürer (senkron success = completed) —
 * PayTR panelinde bildirim URL'i tanımlanmadan deploy güvenli olsun diye.
 */

const VALID_IBAN = "TR330006100519786457841326";

function makePayout(overrides: Record<string, unknown> = {}) {
  return {
    id: "payout-1",
    sellerId: "seller-1",
    merchantOid: "ORDER1",
    transId: "TRANSFER1",
    amount: 100,
    netAmount: 90,
    transferIban: VALID_IBAN,
    transferName: "Seller",
    status: PayoutStatus.pending,
    paymentHold: null,
    tradeCashPayment: null,
    submittedAt: null,
    submittedAmount: null,
    ...overrides,
  };
}

function makePrisma(payout: any, account: any) {
  const state: { status: PayoutStatus; data: Record<string, unknown> } = {
    status: payout.status,
    data: {},
  };
  const apply = (data: Record<string, unknown>) => {
    if (data.status) state.status = data.status as PayoutStatus;
    Object.assign(state.data, data);
  };
  return {
    state,
    payoutTransfer: {
      findMany: jest.fn().mockResolvedValue([payout]),
      findUnique: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(
            where.transId === payout.transId || where.id === payout.id
              ? { ...payout, ...state.data, status: state.status }
              : null,
          ),
        ),
      updateMany: jest.fn().mockImplementation(({ where, data }: any) => {
        if (where.status && where.status !== state.status) {
          return Promise.resolve({ count: 0 });
        }
        apply(data);
        return Promise.resolve({ count: 1 });
      }),
      update: jest.fn().mockImplementation(({ data }: any) => {
        apply(data);
        return Promise.resolve({});
      }),
    },
    sellerBankAccount: {
      findUnique: jest.fn().mockResolvedValue(account),
      update: jest.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ displayName: "Satıcı" }),
    },
  };
}

function makeService(opts: {
  prisma: any;
  flagEnabled?: boolean;
  transferResult?: { status: string; err_msg?: string };
  verifyTransferCallback?: jest.Mock;
}) {
  const createPlatformTransfer = jest
    .fn()
    .mockResolvedValue(opts.transferResult ?? { status: "success" });
  const verifyTransferCallback =
    opts.verifyTransferCallback ?? jest.fn().mockReturnValue(true);
  const notification = { sendTemplateEmailToUser: jest.fn() };
  const ledger = { record: jest.fn() };
  const service = new PayoutService(
    opts.prisma,
    {
      resolve: () => ({ createPlatformTransfer, verifyTransferCallback }),
    } as any,
    {
      get: jest.fn((key: string) =>
        key === "PAYTR_TRANSFER_CALLBACK_ENABLED" && opts.flagEnabled
          ? "true"
          : undefined,
      ),
    } as any,
    notification as any,
    ledger as any,
  );
  return {
    service,
    createPlatformTransfer,
    verifyTransferCallback,
    notification,
    ledger,
  };
}

const activeAccount = {
  userId: "seller-1",
  iban: VALID_IBAN,
  accountHolder: "Seller",
  ibanChangedAt: null,
  isVerified: false,
};

describe("PayoutService stage-1 with transfer-result callback flag", () => {
  it("flag ON: success leaves the payout processing and records submittedAt/submittedAmount", async () => {
    const prisma = makePrisma(makePayout(), activeAccount);
    const { service, notification, ledger } = makeService({
      prisma,
      flagEnabled: true,
    });

    const result = await service.processPendingPayouts();

    expect(prisma.state.status).toBe(PayoutStatus.processing);
    expect(prisma.state.data.submittedAt).toBeInstanceOf(Date);
    expect(Number(prisma.state.data.submittedAmount)).toBe(90);
    // "Para gitti" yan etkileri callback'e kadar TETİKLENMEZ.
    expect(notification.sendTemplateEmailToUser).not.toHaveBeenCalled();
    expect(ledger.record).not.toHaveBeenCalled();
    // Kabul edilen talimat "failed" DEĞİLDİR.
    expect(result.failed).toBe(0);
  });

  it("flag OFF: legacy behavior — success completes immediately with side effects", async () => {
    const prisma = makePrisma(makePayout(), activeAccount);
    const { service, notification, ledger } = makeService({
      prisma,
      flagEnabled: false,
    });

    const result = await service.processPendingPayouts();

    expect(prisma.state.status).toBe(PayoutStatus.completed);
    expect(result.processed).toBe(1);
    expect(notification.sendTemplateEmailToUser).toHaveBeenCalledTimes(1);
    expect(ledger.record).toHaveBeenCalledTimes(1);
  });
});

describe("PayoutService.handleTransferResultCallback", () => {
  const submitted = () =>
    makePayout({
      status: PayoutStatus.processing,
      submittedAt: new Date("2026-08-01T10:00:00Z"),
      submittedAmount: 88, // netAmount'tan (90) BİLEREK farklı — hangisinin kullanıldığını ayırt eder
    });

  it("completes a submitted payout and fires side effects with the SUBMITTED amount", async () => {
    const prisma = makePrisma(submitted(), activeAccount);
    const { service, notification, ledger } = makeService({
      prisma,
      flagEnabled: true,
    });

    const response = await service.handleTransferResultCallback(
      '["TRANSFER1"]',
      "hash",
    );

    expect(response).toBe("OK");
    expect(prisma.state.status).toBe(PayoutStatus.completed);
    expect(prisma.state.data.processedAt).toBeInstanceOf(Date);
    expect(notification.sendTemplateEmailToUser).toHaveBeenCalledTimes(1);
    expect(notification.sendTemplateEmailToUser).toHaveBeenCalledWith(
      "seller-1",
      "payout-released-seller",
      expect.objectContaining({ payoutAmount: 88 }),
    );
    expect(ledger.record).toHaveBeenCalledTimes(1);
    const entries = ledger.record.mock.calls[0][1].entries;
    expect(entries.every((e: any) => e.amount === 88)).toBe(true);
    // Başarılı transfer → IBAN otomatik doğrulanır.
    expect(prisma.sellerBankAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isVerified: true }),
      }),
    );
  });

  it("is idempotent: a replayed callback fires side effects only once", async () => {
    const prisma = makePrisma(submitted(), activeAccount);
    const { service, notification, ledger } = makeService({
      prisma,
      flagEnabled: true,
    });

    await service.handleTransferResultCallback('["TRANSFER1"]', "hash");
    const second = await service.handleTransferResultCallback(
      '["TRANSFER1"]',
      "hash",
    );

    expect(second).toBe("OK");
    expect(notification.sendTemplateEmailToUser).toHaveBeenCalledTimes(1);
    expect(ledger.record).toHaveBeenCalledTimes(1);
  });

  it("invalid hash: changes nothing and still replies OK (PayTR tekrar denemesin)", async () => {
    const prisma = makePrisma(submitted(), activeAccount);
    const { service, notification } = makeService({
      prisma,
      flagEnabled: true,
      verifyTransferCallback: jest.fn().mockReturnValue(false),
    });

    const response = await service.handleTransferResultCallback(
      '["TRANSFER1"]',
      "sahte-hash",
    );

    expect(response).toBe("OK");
    expect(prisma.state.status).toBe(PayoutStatus.processing);
    expect(prisma.payoutTransfer.updateMany).not.toHaveBeenCalled();
    expect(notification.sendTemplateEmailToUser).not.toHaveBeenCalled();
  });

  it("unknown trans_id: skipped without throwing, still OK", async () => {
    const prisma = makePrisma(submitted(), activeAccount);
    const { service, notification } = makeService({
      prisma,
      flagEnabled: true,
    });

    const response = await service.handleTransferResultCallback(
      '["TANINMAYAN"]',
      "hash",
    );

    expect(response).toBe("OK");
    expect(prisma.state.status).toBe(PayoutStatus.processing);
    expect(notification.sendTemplateEmailToUser).not.toHaveBeenCalled();
  });

  it("malformed trans_ids JSON: no crash, still OK", async () => {
    const prisma = makePrisma(submitted(), activeAccount);
    const { service } = makeService({ prisma, flagEnabled: true });

    const response = await service.handleTransferResultCallback(
      "bozuk-json",
      "hash",
    );

    expect(response).toBe("OK");
    expect(prisma.state.status).toBe(PayoutStatus.processing);
  });
});

describe("PayoutService.checkReturnedTransfers with callback flow", () => {
  it("marks a still-processing (callback bekleyen) transfer as returned", async () => {
    // Aşama-1 sonrası processing'te bekleyen transfer bankadan geri döner;
    // callback hiç gelmez. Geri-dönen sorgusu artık processing'i de yakalamalı,
    // yoksa payout sonsuza dek processing'te kalır.
    const prisma = makePrisma(
      makePayout({
        status: PayoutStatus.processing,
        submittedAt: new Date("2026-08-01T10:00:00Z"),
        submittedAmount: 88,
      }),
      // Doğrulanmış hesap: geri dönüş doğrulamayı GERİ ALMALI (false yazmalı).
      { ...activeAccount, isVerified: true },
    );
    const getReturnedTransfers = jest.fn().mockResolvedValue({
      status: "success",
      data: [{ trans_id: "TRANSFER1", reason: "iban kapalı" }],
    });
    const service = new PayoutService(
      prisma as any,
      { resolve: () => ({ getReturnedTransfers }) } as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
      { sendTemplateEmailToUser: jest.fn() } as any,
    );

    const updated = await service.checkReturnedTransfers();

    expect(updated).toBe(1);
    expect(prisma.state.status).toBe(PayoutStatus.returned);
    // Geri dönen transfer → IBAN doğrulaması geri alınır.
    expect(prisma.sellerBankAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isVerified: false }),
      }),
    );
  });
});

describe("PayoutService.detectStuckProcessingPayouts with callback flow", () => {
  it("does not treat a submitted payout awaiting its callback as a zombie", async () => {
    const prisma = makePrisma(makePayout(), activeAccount);
    prisma.payoutTransfer.findMany = jest.fn().mockResolvedValue([]);
    const service = new PayoutService(
      prisma as any,
      { resolve: () => ({}) } as any,
      { get: jest.fn().mockReturnValue(undefined) } as any,
      { sendTemplateEmailToUser: jest.fn() } as any,
    );

    await service.detectStuckProcessingPayouts();

    // Zombi sorgusu yalnız PayTR'ye HİÇ iletilmemiş (submittedAt=null)
    // processing kayıtlarını hedeflemeli.
    const zombieWhere = prisma.payoutTransfer.findMany.mock.calls[0][0].where;
    expect(zombieWhere.status).toBe(PayoutStatus.processing);
    expect(zombieWhere.submittedAt).toBeNull();
  });
});
