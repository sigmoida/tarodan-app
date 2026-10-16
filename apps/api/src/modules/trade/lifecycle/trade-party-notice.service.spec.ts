import { TradePartyNoticeService } from "./trade-party-notice.service";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import { OUTBOX_TRADE_PARTY_NOTICE } from "../../outbox/outbox.types";
import { NotificationType } from "../../notification/dto";

/**
 * Takas taraf duyuruları outbox üzerinden gider (CLAUDE.md §10): olayın tx'inde
 * alıcı × olay başına bir satır, commit sonrası anlık yol; handler kayıtlıdır ki
 * süreç ölürse drainer tamamlasın.
 */
describe("TradePartyNoticeService", () => {
  const make = () => {
    const outbox = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      runInline: jest.fn(
        async (_db: unknown, _key: string, work: () => Promise<unknown>) => ({
          ran: true,
          result: await work(),
        }),
      ),
    };
    const registry = new OutboxHandlerRegistry();
    const notificationService = {
      createInAppNotification: jest.fn().mockResolvedValue(true),
      notifyTradeCompleted: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TradePartyNoticeService(
      {} as never,
      outbox as never,
      registry,
      notificationService as never,
    );
    service.onModuleInit();
    return { service, outbox, registry, notificationService };
  };

  it("olayın tx'inde alıcı × olay başına dedupe anahtarlı satır yazar", async () => {
    const { service, outbox } = make();
    const tx = {} as never;

    await service.enqueue(tx, [
      { tradeId: "t1", userId: "u2", kind: "cancelled" },
    ]);

    expect(outbox.enqueue).toHaveBeenCalledWith(tx, {
      type: OUTBOX_TRADE_PARTY_NOTICE,
      payload: { tradeId: "t1", userId: "u2", kind: "cancelled" },
      dedupeKey: "trade.party_notice:cancelled:t1:u2",
    });
  });

  it("handler kayıtlı: drainer aynı gönderimi yapar (kayıt yazılmazsa push yok)", async () => {
    const { registry, notificationService } = make();
    const handler = registry.get(OUTBOX_TRADE_PARTY_NOTICE);

    await handler?.(
      { tradeId: "t1", userId: "u1", kind: "dispute_opened" },
      {} as never,
    );

    expect(notificationService.createInAppNotification).toHaveBeenCalledWith(
      "u1",
      NotificationType.TRADE_DISPUTE_OPENED,
      { tradeId: "t1" },
      { pushRequiresRecord: true },
    );
  });

  it("tamamlanma: zil + push + e-posta akışı", async () => {
    const { service, notificationService } = make();

    await service.flush([{ tradeId: "t1", userId: "u1", kind: "completed" }]);

    expect(notificationService.notifyTradeCompleted).toHaveBeenCalledWith(
      "u1",
      "t1",
    );
  });

  it("anlık yol hatası çağıranı bozmaz (satır drainer'a kalır)", async () => {
    const { service, outbox } = make();
    outbox.runInline.mockRejectedValueOnce(new Error("db"));

    await expect(
      service.flush([
        { tradeId: "t1", userId: "u1", kind: "dispute_resolved" },
      ]),
    ).resolves.toBeUndefined();
  });
});
