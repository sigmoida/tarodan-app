import { PayoutStatus } from "@prisma/client";
import {
  OUTBOX_NETSIS_ACCOUNTING_SYNC,
  netsisAccountingSyncEvent,
} from "../outbox/outbox.types";
import { PayoutService } from "./payout.service";

/**
 * Netsis muhasebe aynası: payout TAMAMLANDIĞINDA (para satıcıya ulaştı) tek
 * bir outbox olayı yazılır. Olay yalnız iş kaydı açar; yazılamazsa payout
 * bozulmaz (senkron cron'unun süpürmesi kaynağı yine bulur). Para akışının
 * kendisi değişmez — bu spec yalnız "olay yayıldı mı"yı sabitler.
 */
describe("PayoutService — Netsis muhasebe olayı", () => {
  const payout = {
    id: "payout-1",
    sellerId: "seller-1",
    transId: "TRANSFER1",
    transferIban: "TR330006100519786457841326",
    status: PayoutStatus.processing,
    netAmount: 90,
    submittedAmount: 88,
  };

  const build = (opts: { claimCount?: number; outbox?: unknown } = {}) => {
    const prisma = {
      payoutTransfer: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ ...payout, paymentHoldId: null, paymentHold: null }),
        updateMany: jest
          .fn()
          .mockResolvedValue({ count: opts.claimCount ?? 1 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ displayName: "S" }) },
    };
    const outbox =
      opts.outbox === undefined
        ? { enqueue: jest.fn().mockResolvedValue(undefined) }
        : opts.outbox;
    const service = new PayoutService(
      prisma as never,
      {
        resolve: () => ({ verifyTransferCallback: () => true }),
      } as never,
      { get: jest.fn() } as never,
      { sendTemplateEmailToUser: jest.fn() } as never,
      { record: jest.fn() } as never,
      outbox as never,
    );
    return { service, prisma, outbox };
  };

  it("tamamlanan payout için olay, gönderilen tutarla ve kaynak id'siyle yazılır", async () => {
    const { service, prisma, outbox } = build();
    await service.handleTransferResultCallback('["TRANSFER1"]', "hash");
    const enqueue = (outbox as { enqueue: jest.Mock }).enqueue;
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      prisma,
      netsisAccountingSyncEvent("payout_transfer", "payout-1"),
    );
    expect(enqueue.mock.calls[0][1].type).toBe(OUTBOX_NETSIS_ACCOUNTING_SYNC);
  });

  it("tekrarlanan callback (claim kaybedildi) ikinci olay yazmaz", async () => {
    const { service, outbox } = build({ claimCount: 0 });
    await service.handleTransferResultCallback('["TRANSFER1"]', "hash");
    expect((outbox as { enqueue: jest.Mock }).enqueue).not.toHaveBeenCalled();
  });

  it("olay yazılamazsa payout yine OK döner (para akışı bozulmaz)", async () => {
    const { service } = build({
      outbox: { enqueue: jest.fn().mockRejectedValue(new Error("db")) },
    });
    await expect(
      service.handleTransferResultCallback('["TRANSFER1"]', "hash"),
    ).resolves.toBe("OK");
  });

  it("outbox yoksa (dar kurulum) sessizce geçer", async () => {
    const { service } = build({ outbox: null });
    await expect(
      service.handleTransferResultCallback('["TRANSFER1"]', "hash"),
    ).resolves.toBe("OK");
  });
});
