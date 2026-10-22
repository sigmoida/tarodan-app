import { BadRequestException } from "@nestjs/common";
import { OfferService } from "./offer.service";
import { userBlockServiceStub } from "../user-block/user-block.testing";

/**
 * S9a — Apple 1.2: teklif notu mesajlaşmayla AYNI içerik filtresinden geçer
 * (ContentFilterService.screenUnqueuedText). Filtre işlem AÇILMADAN çalışır;
 * reddedilen not teklif açmaz, maskelenen not maskeli kaydedilir.
 *
 * Yeni teklifin notu (create) tarama anında teklif kimliği olmadığı için
 * ertelenmiş tarama kullanır (`screenUnqueuedTextDeferred`): inceleme kaydı
 * teklif yazıldıktan sonra teklifin kimliğiyle atılır. Karşı tekliflerde
 * kimlik (yanıt verilen teklif) tarama anında bellidir.
 */
describe("OfferService — teklif notu içerik filtresi", () => {
  const product = {
    id: "p1",
    sellerId: "s1",
    status: "active",
    // Above the 100 TL offers below: an offer at the price is refused.
    price: 120,
    oldPrice: null,
    quantity: 5,
    reservedQuantity: 0,
    title: "Ürün",
    seller: { id: "s1", displayName: "S", email: "s@example.com" },
  };

  const build = (screen: jest.Mock, deferred: jest.Mock = screen) => {
    const tx = {
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      offer: {
        findUnique: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        // Yazılan veriyi yakalayıp akışı durdurur (sonrası bu spec'in konusu değil).
        create: jest.fn().mockRejectedValue(new Error("stop")),
      },
    };
    const prisma = {
      $transaction: jest.fn((fn: any) => fn(tx)),
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new OfferService(
      prisma as any,
      { del: jest.fn(), delByPattern: jest.fn() } as any,
      { get: () => "24" } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined as any,
      {} as any,
      userBlockServiceStub() as any,
      undefined,
      undefined,
      undefined,
      {
        screenUnqueuedText: screen,
        screenUnqueuedTextDeferred: deferred,
      } as any,
    );
    return { service, tx, prisma };
  };

  it("uygunsuz not → 400 ve işlem hiç açılmaz", async () => {
    const screen = jest
      .fn()
      .mockRejectedValue(new BadRequestException({ i18nKey: "x" }));
    const { service, prisma } = build(screen);

    await expect(
      service.create("b1", {
        productId: "p1",
        amount: 100,
        message: "küfür",
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Yazan kullanıcı inceleme kaydı için iletilir.
    expect(screen).toHaveBeenCalledWith("küfür", {
      entityType: "offer",
      userId: "b1",
      field: "offer_message",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("maskelenen not maskeli kaydedilir", async () => {
    const screen = jest.fn().mockResolvedValue({
      text: "Ara: ***",
      recordFlag: jest.fn(),
    });
    const { service, tx } = build(screen);

    await service
      .create("b1", {
        productId: "p1",
        amount: 100,
        message: "Ara: 5551112233",
      } as any)
      .catch(() => undefined);

    expect(tx.offer.create.mock.calls[0][0].data.message).toBe("Ara: ***");
  });

  it("notsuz teklif null yazar", async () => {
    const screen = jest.fn(async (text: unknown) => ({
      text,
      recordFlag: jest.fn(),
    }));
    const { service, tx } = build(screen);

    await service
      .create("b1", { productId: "p1", amount: 100 } as any)
      .catch(() => undefined);

    expect(tx.offer.create.mock.calls[0][0].data.message).toBeNull();
  });

  it("incelemeye işaretlenen not, teklif yazıldıktan sonra teklif kimliğiyle kaydedilir", async () => {
    const recordFlag = jest.fn().mockResolvedValue(undefined);
    const deferred = jest.fn().mockResolvedValue({ text: "not", recordFlag });
    const { service, tx } = build(jest.fn(), deferred);
    tx.offer.create.mockResolvedValue({
      id: "offer-9",
      productId: "p1",
      buyerId: "b1",
      sellerId: "s1",
      amount: 100,
      buyer: {},
    });

    await service
      .create("b1", { productId: "p1", amount: 100, message: "not" } as any)
      .catch(() => undefined);

    expect(recordFlag).toHaveBeenCalledWith("offer-9");
    expect(recordFlag.mock.invocationCallOrder[0]).toBeGreaterThan(
      tx.offer.create.mock.invocationCallOrder[0],
    );
  });

  it.each(["counter", "buyerCounter"] as const)(
    "%s: inceleme kaydı yanıt verilen teklifin kimliğiyle taranır",
    async (method) => {
      const screen = jest.fn().mockResolvedValue("not");
      const { service } = build(screen);

      await service[method]("o1", "u1", { amount: 90, message: "not" }).catch(
        () => undefined,
      );

      expect(screen).toHaveBeenCalledWith("not", {
        entityType: "offer",
        entityId: "o1",
        userId: "u1",
        field: "offer_message",
      });
    },
  );

  it.each(["counter", "buyerCounter"] as const)(
    "%s: uygunsuz not → 400, işlem açılmaz",
    async (method) => {
      const screen = jest
        .fn()
        .mockRejectedValue(new BadRequestException({ i18nKey: "x" }));
      const { service, prisma } = build(screen);

      await expect(
        service[method]("o1", "u1", { amount: 90, message: "küfür" }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
});
