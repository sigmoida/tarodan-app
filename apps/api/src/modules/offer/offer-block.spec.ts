import { ForbiddenException } from "@nestjs/common";
import { OfferService } from "./offer.service";
import { userBlockServiceStub } from "../user-block/user-block.testing";

describe("OfferService — user blocks", () => {
  const product = {
    id: "p1",
    sellerId: "s1",
    status: "active",
    quantity: 5,
    reservedQuantity: 0,
    seller: { id: "s1", displayName: "S" },
  };
  const build = (blocked: boolean) => {
    const tx = {
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      offer: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    const userBlocks = userBlockServiceStub({ blockedEither: blocked });
    const service = new OfferService(
      {
        $transaction: jest.fn((fn: any) => fn(tx)),
        // Süreler işlem açılmadan Süreler ve Kurallar'dan okunur.
        platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any,
      { del: jest.fn(), delByPattern: jest.fn() } as any,
      { get: () => "24" } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined as any,
      {
        // accept() tarife/kural seti snapshot'ını tx'ten ÖNCE alır; blok
        // kontrolü tx içinde gelir.
        resolveOfferOrderSnapshots: jest.fn().mockResolvedValue({
          shippingTariff: { tariffId: "t", tariffVersion: 1, tariff: {} },
          commissionRuleSet: { id: "rs" },
        }),
      } as any,
      userBlocks as any,
    );
    return { service, tx, userBlocks };
  };

  it("create → 403 when buyer and seller are blocked either way", async () => {
    const { service, userBlocks } = build(true);
    await expect(
      service.create("b1", { productId: "p1", amount: 100 } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(userBlocks.isBlockedEither).toHaveBeenCalledWith("b1", "s1");
  });

  it("counter → 403 when the pair is blocked", async () => {
    const { service, tx } = build(true);
    tx.offer.findUnique.mockResolvedValue({
      id: "o1",
      buyerId: "b1",
      sellerId: "s1",
      status: "pending",
      product,
    });
    await expect(
      service.counter("o1", "s1", { amount: 90 } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("accept → 403 when the pair is blocked (no order is created)", async () => {
    const { service, tx } = build(true);
    (tx as any).$queryRaw = jest.fn().mockResolvedValue([{ id: "o1" }]);
    tx.offer.findUnique.mockResolvedValue({
      id: "o1",
      buyerId: "b1",
      sellerId: "s1",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000),
      product,
    });
    await expect(service.accept("o1", "s1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("buyerCounter → 403 when the pair is blocked", async () => {
    const { service, tx } = build(true);
    tx.offer.findUnique.mockResolvedValue({
      id: "o1",
      buyerId: "b1",
      sellerId: "s1",
      status: "countered",
      buyerMustAccept: true,
      product,
    });
    await expect(
      service.buyerCounter("o1", "b1", { amount: 95 } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // Hesap silme ile serileşme: kabul alıcıya sipariş açar; alıcının kullanıcı
  // satırı FOR SHARE kilitlenir (silme FOR UPDATE alır) ve teklif satırından
  // ÖNCE alınır (silme de kullanıcıdan başlar → kilit sırası tutarlı).
  describe("accept — alıcı hesap silme kilidi", () => {
    const sqlOf = (call: unknown[]) =>
      (call[0] as string[]).join("?").replace(/\s+/g, " ");

    it("alıcının kullanıcı satırı, teklif satırı kilidinden önce FOR SHARE kilitlenir", async () => {
      const { service, tx } = build(true);
      const queryRaw = jest
        .fn()
        .mockResolvedValueOnce([{ id: "b1", deleted_at: null }])
        .mockResolvedValue([{ id: "o1" }]);
      (tx as any).$queryRaw = queryRaw;
      tx.offer.findUnique.mockResolvedValue({
        id: "o1",
        buyerId: "b1",
        sellerId: "s1",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
        product,
      });

      await service.accept("o1", "s1").catch(() => undefined);

      expect(sqlOf(queryRaw.mock.calls[0])).toContain("FROM users");
      expect(sqlOf(queryRaw.mock.calls[0])).toContain("FOR SHARE");
      expect(queryRaw.mock.calls[0][1].values).toEqual(["b1"]);
      expect(sqlOf(queryRaw.mock.calls[1])).toContain('FROM "offers"');
    });

    it("alıcı hesabı silinmişse kabul reddedilir, sipariş açılmaz", async () => {
      const { service, tx } = build(false);
      (tx as any).$queryRaw = jest
        .fn()
        .mockResolvedValue([{ id: "b1", deleted_at: new Date() }]);
      tx.offer.findUnique.mockResolvedValue({
        id: "o1",
        buyerId: "b1",
        sellerId: "s1",
        status: "pending",
        expiresAt: new Date(Date.now() + 60_000),
        product,
      });

      const error = await service.accept("o1", "s1").catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ForbiddenException);
      expect((error as ForbiddenException).getResponse()).toMatchObject({
        i18nKey: "server.auth.accountDeleted",
      });
      expect((tx as any).$queryRaw).toHaveBeenCalledTimes(1);
    });
  });
});
