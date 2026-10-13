import { BadRequestException } from "@nestjs/common";
import { OfferService } from "./offer.service";
import { userBlockServiceStub } from "../user-block/user-block.testing";

/**
 * S9a — Apple 1.2: teklif notu mesajlaşmayla AYNI içerik filtresinden geçer
 * (ContentFilterService.screenUnqueuedText). Filtre işlem AÇILMADAN çalışır;
 * reddedilen not teklif açmaz, maskelenen not maskeli kaydedilir.
 */
describe("OfferService — teklif notu içerik filtresi", () => {
  const product = {
    id: "p1",
    sellerId: "s1",
    status: "active",
    price: 100,
    oldPrice: null,
    quantity: 5,
    reservedQuantity: 0,
    title: "Ürün",
    seller: { id: "s1", displayName: "S", email: "s@example.com" },
  };

  const build = (screen: jest.Mock) => {
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
      { screenUnqueuedText: screen } as any,
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
    const screen = jest.fn().mockResolvedValue("Ara: ***");
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
    const screen = jest.fn(async (text: unknown) => text);
    const { service, tx } = build(screen);

    await service
      .create("b1", { productId: "p1", amount: 100 } as any)
      .catch(() => undefined);

    expect(tx.offer.create.mock.calls[0][0].data.message).toBeNull();
  });

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
