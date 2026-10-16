import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { TradeLifecycleService } from "./trade-lifecycle.service";
import { userBlockServiceStub } from "../../user-block/user-block.testing";

/**
 * S9a — Apple 1.2: takas mesajı ve karşı tarafa görünen red/iptal gerekçesi
 * mesajlaşmayla AYNI içerik filtresinden geçer. Filtre işlem AÇILMADAN
 * çalışır: reddedilen metin takası değiştirmez.
 *
 * P1 inceleme: red/iptal'de tarama yetki ve durum kontrolünden SONRA gelir —
 * zaten iptal edilmiş takas AI beklemeden idempotent başarı döner, yetkisiz
 * ya da uygun olmayan durumda doğru hata gelir.
 */
describe("TradeLifecycleService — takas metinleri içerik filtresi", () => {
  const trade = (extra: Record<string, unknown> = {}) => ({
    id: "t1",
    initiatorId: "u2",
    receiverId: "u1",
    status: "pending",
    firstWarehouseArrivalAt: null,
    ...extra,
  });

  const build = (
    screen: jest.Mock | null,
    current: Record<string, unknown> | null = trade(),
  ) => {
    const prisma = {
      trade: { findUnique: jest.fn().mockResolvedValue(current) },
      // İşleme ulaşıldığını görmek için durdurulur.
      $transaction: jest.fn().mockRejectedValue(new Error("tx-reached")),
    };
    const tradeQuery = {
      getTradeById: jest.fn().mockResolvedValue({ id: "t1" }),
    };
    const service = new TradeLifecycleService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      tradeQuery as any,
      {} as any,
      userBlockServiceStub() as any,
      undefined,
      undefined,
      screen ? ({ screenUnqueuedText: screen } as any) : undefined,
    );
    return { service, prisma, tradeQuery };
  };

  const rejecting = () =>
    jest.fn().mockRejectedValue(new BadRequestException({ i18nKey: "x" }));
  const passing = () => jest.fn(async (text: unknown) => text);

  describe("rejectTrade", () => {
    it("uygunsuz gerekçe → 400, takas değişmez", async () => {
      const screen = rejecting();
      const { service, prisma } = build(screen);

      await expect(
        service.rejectTrade("t1", "u1", { reason: "küfür" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(screen).toHaveBeenCalledWith("küfür", {
        entityType: "trade",
        entityId: "t1",
        userId: "u1",
        field: "trade_reject_reason",
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("alıcı olmayan → 403, tarama yapılmaz", async () => {
      const screen = passing();
      const { service } = build(screen);

      await expect(
        service.rejectTrade("t1", "u2", { reason: "olmadı" }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(screen).not.toHaveBeenCalled();
    });

    it("reddedilemez durum → 400 durum hatası, tarama yapılmaz", async () => {
      const screen = passing();
      const { service } = build(screen, trade({ status: "completed" }));

      await expect(
        service.rejectTrade("t1", "u1", { reason: "olmadı" }),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.trade.cannotRejectInStatus" },
      });
      expect(screen).not.toHaveBeenCalled();
    });

    it("olmayan takas → 404", async () => {
      const { service } = build(passing(), null);

      await expect(service.rejectTrade("t1", "u1", {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("boş gerekçe serbest: işleme ulaşır", async () => {
      const screen = passing();
      const { service } = build(screen);

      await expect(service.rejectTrade("t1", "u1", {})).rejects.toThrow(
        "tx-reached",
      );
    });
  });

  describe("cancelTrade", () => {
    it("zaten iptal edilmiş → idempotent başarı, tarama ve işlem yok", async () => {
      const screen = rejecting();
      const { service, prisma, tradeQuery } = build(
        screen,
        trade({ status: "cancelled" }),
      );

      await expect(
        service.cancelTrade("t1", "u1", { reason: "küfür içeren gerekçe" }),
      ).resolves.toEqual({ id: "t1" });
      expect(screen).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tradeQuery.getTradeById).toHaveBeenCalledWith("t1", "u1");
    });

    it("taraf olmayan → 403, tarama yapılmaz", async () => {
      const screen = passing();
      const { service } = build(screen);

      await expect(
        service.cancelTrade("t1", "stranger", { reason: "vazgeçtim" }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(screen).not.toHaveBeenCalled();
    });

    it("açık takasta uygunsuz gerekçe → 400, takas değişmez", async () => {
      const screen = rejecting();
      const { service, prisma } = build(screen);

      await expect(
        service.cancelTrade("t1", "u1", { reason: "küfür içeren gerekçe" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  it("filtre yoksa (dar kurulum) metin aynen geçer", async () => {
    const { service } = build(null);

    await expect(
      service.rejectTrade("t1", "u1", { reason: "olmadı" }),
    ).rejects.toThrow("tx-reached");
  });

  // Yeni takasta tarama takas YOKKEN yapılır: kayıt takas yazıldıktan sonra
  // takas kimliğiyle atılır (createTrade → recordFlag(trade.id)).
  describe("yeni takas mesajı (ertelenmiş tarama)", () => {
    it("ertelenmiş taramayı takas bağlamıyla çağırır", async () => {
      const recordFlag = jest.fn();
      const deferred = jest.fn().mockResolvedValue({ text: "m", recordFlag });
      const { service } = build(null);
      (service as any).contentFilter = {
        screenUnqueuedTextDeferred: deferred,
      };

      const screened = await (service as any).screenNewTradeMessage("m", "u1");

      expect(deferred).toHaveBeenCalledWith("m", {
        entityType: "trade",
        userId: "u1",
        field: "trade_message",
      });
      expect(screened.recordFlag).toBe(recordFlag);
    });

    it("filtre yoksa metin aynen döner, recordFlag no-op", async () => {
      const { service } = build(null);

      const screened = await (service as any).screenNewTradeMessage("m", "u1");

      expect(screened.text).toBe("m");
      await expect(screened.recordFlag("t9")).resolves.toBeUndefined();
    });
  });
});
