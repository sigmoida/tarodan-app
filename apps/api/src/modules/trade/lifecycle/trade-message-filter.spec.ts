import { BadRequestException } from "@nestjs/common";
import { TradeLifecycleService } from "./trade-lifecycle.service";
import { userBlockServiceStub } from "../../user-block/user-block.testing";

/**
 * S9a — Apple 1.2: takas mesajı ve karşı tarafa görünen red/iptal gerekçesi
 * mesajlaşmayla AYNI içerik filtresinden geçer. Filtre işlem AÇILMADAN
 * çalışır: reddedilen metin takası değiştirmez.
 */
describe("TradeLifecycleService — takas metinleri içerik filtresi", () => {
  const build = (screen: jest.Mock) => {
    const prisma = { $transaction: jest.fn() };
    const service = new TradeLifecycleService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      userBlockServiceStub() as any,
      undefined,
      undefined,
      { screenUnqueuedText: screen } as any,
    );
    return { service, prisma };
  };

  const rejecting = () =>
    jest.fn().mockRejectedValue(new BadRequestException({ i18nKey: "x" }));

  it("red gerekçesi uygunsuzsa 400, takas değişmez", async () => {
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

  it("iptal gerekçesi uygunsuzsa 400, takas değişmez", async () => {
    const screen = rejecting();
    const { service, prisma } = build(screen);

    await expect(
      service.cancelTrade("t1", "u1", { reason: "küfür içeren gerekçe" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("filtre yoksa (dar kurulum) metin aynen geçer", async () => {
    const service = new TradeLifecycleService(
      { $transaction: jest.fn().mockRejectedValue(new Error("stop")) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      userBlockServiceStub() as any,
    );

    // İşleme kadar gelir (filtre atlanır); işlem burada durdurulur.
    await expect(
      service.rejectTrade("t1", "u1", { reason: "olmadı" }),
    ).rejects.toThrow("stop");
  });
});
