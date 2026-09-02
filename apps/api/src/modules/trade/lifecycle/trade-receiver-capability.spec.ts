import { BadRequestException } from "@nestjs/common";
import { TradeLifecycleService } from "./trade-lifecycle.service";
import { userBlockServiceStub } from "../../user-block/user-block.testing";

/**
 * Takas teklifi, ALICI da takas yetkisine sahipse oluşturulmalı.
 *
 * Eskiden yalnız başlatan denetleniyordu; alıcının yetkisi ancak KABUL anında
 * bakılıyordu. Üyeliği biten satıcının ilanları `isTradeEnabled: true` kaldığı
 * için teklif oluşturulabiliyor, alıcı "üyeliğiniz uygun değil" hatası alıyor
 * ve teklif yanıt süresi (varsayılan 72 saat) dolana dek askıda kalıyordu.
 * Ücretsiz katmanda takas kapalı olduğundan bu, kenar durum değil en sık
 * yaşanacak akıştı.
 */
describe("TradeLifecycleService.createTrade — alıcı yetkisi kapısı", () => {
  const makeService = (opts: {
    initiatorCanTrade: boolean;
    receiverCanTrade: boolean;
  }) => {
    const canCreateTrade = jest.fn(async (userId: string) =>
      userId === "initiator-1"
        ? {
            allowed: opts.initiatorCanTrade,
            reason: opts.initiatorCanTrade ? undefined : "başlatan yetkisiz",
          }
        : { allowed: opts.receiverCanTrade },
    );
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: "receiver-1" }),
      },
      // Alıcı kapısı ürün sorgularından ÖNCE gelmeli: yetkisiz alıcıda bu
      // çağrıların hiç yapılmaması beklenir.
      product: { findMany: jest.fn().mockResolvedValue([]) },
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      trade: { create: jest.fn() },
    };
    // ctor: prisma, taxPolicy, membershipService, notification, payment,
    //       productLock, tradeShipment, tradeCommon, tradeQuery, tradeQuote
    const service = new TradeLifecycleService(
      prisma as any,
      {} as any,
      { canCreateTrade } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { quoteForTrade: jest.fn().mockResolvedValue(null) } as any,
      userBlockServiceStub() as any,
    );
    return { service, prisma, canCreateTrade };
  };

  const dto = {
    receiverId: "receiver-1",
    initiatorItems: [{ productId: "p-init" }],
    receiverItems: [{ productId: "p-recv" }],
  } as any;

  it("alıcının takas yetkisi yoksa teklif OLUŞTURULMAZ", async () => {
    const { service, prisma } = makeService({
      initiatorCanTrade: true,
      receiverCanTrade: false,
    });

    await expect(
      service.createTrade("initiator-1", dto),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Ürün uygunluk sorgusuna hiç geçilmemeli, takas hiç yazılmamalı.
    expect(prisma.trade.create).not.toHaveBeenCalled();
  });

  it("alıcı yetkisi kontrol EDİLİR (başlatan yetkili olsa bile)", async () => {
    const { service, canCreateTrade } = makeService({
      initiatorCanTrade: true,
      receiverCanTrade: false,
    });

    await service.createTrade("initiator-1", dto).catch(() => undefined);

    expect(canCreateTrade).toHaveBeenCalledWith("initiator-1");
    expect(canCreateTrade).toHaveBeenCalledWith("receiver-1");
  });

  it("başlatan yetkisizse alıcı sorgulanmadan reddedilir", async () => {
    const { service, canCreateTrade } = makeService({
      initiatorCanTrade: false,
      receiverCanTrade: true,
    });

    await expect(
      service.createTrade("initiator-1", dto),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(canCreateTrade).not.toHaveBeenCalledWith("receiver-1");
  });
});
