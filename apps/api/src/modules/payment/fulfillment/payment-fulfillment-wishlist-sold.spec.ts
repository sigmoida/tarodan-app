import { OrderStatus } from "@prisma/client";
import { PaymentFulfillmentService } from "./payment-fulfillment.service";
import { NotificationType } from "../../notification/dto";
import { addDaysSkippingSundays } from "../../../common/helpers/preparing-deadline";

/**
 * WISHLIST_SOLD ödeme BAŞARISINDA çıkar, sipariş oluşturmada değil.
 *
 * Regresyon: bildirim sipariş oluşturulurken (pending_payment) gönderiliyordu;
 * ödeme hiç tamamlanmasa da istek listesi takipçilerine ürün "satıldı"
 * deniyordu. Artık tek kaynak ödeme fulfillment'ıdır (post-commit):
 *  - tekil + sepet (grup) yolları ürün başına TEK bildirim üretir,
 *  - üyelik/boost sanal siparişleri hiç üretmez,
 *  - satıcı ve ürünü satın alan alıcı bildirim almaz.
 */
describe("PaymentFulfillmentService — WISHLIST_SOLD", () => {
  /** Post-commit fire-and-forget zincirinin bitmesini bekle. */
  const flush = () => new Promise((resolve) => setImmediate(resolve));

  const wishlistEntries = [
    { wishlist: { userId: "watcher-1" } },
    { wishlist: { userId: "watcher-2" } },
    // Satıcı ve alıcı da ürünü listesine eklemiş olabilir — onlara gitmez.
    { wishlist: { userId: "seller-1" } },
    { wishlist: { userId: "buyer-1" } },
  ];

  const makeOrder = (n: number, productId = `product-${n}`) => ({
    id: `order-${n}`,
    orderNumber: `ORD-${n}`,
    buyerId: "buyer-1",
    sellerId: "seller-1",
    productId,
    quantity: 1,
    totalAmount: 100,
    status: OrderStatus.pending_payment,
    shippingAddress: { fullName: "Alıcı" },
    buyer: { id: "buyer-1", email: "b@x.com", displayName: "Alıcı" },
    seller: { id: "seller-1", email: "s@x.com", displayName: "Satıcı" },
    product: { id: productId, title: "Ürün" },
  });

  const makeHarness = (
    settings: Record<string, string> = {},
    env: Record<string, string> = {},
  ) => {
    const createInAppNotification = jest.fn().mockResolvedValue(true);
    const tx: any = {
      payment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      order: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma: any = {
      $transaction: jest.fn().mockImplementation((fn: any) => fn(tx)),
      wishlistItem: {
        findMany: jest.fn().mockResolvedValue(wishlistEntries),
      },
      productBoost: { findUnique: jest.fn().mockResolvedValue(null) },
      checkoutGroup: {
        findUnique: jest.fn().mockResolvedValue({ groupNumber: "GRP-1" }),
      },
      // Hazırlık süresi Süreler ve Kurallar'dan; satır yok → env/varsayılan.
      platformSetting: {
        findUnique: jest.fn(
          async ({ where }: { where: { settingKey: string } }) =>
            where.settingKey in settings
              ? { settingValue: settings[where.settingKey] }
              : null,
        ),
      },
    };
    const service = new PaymentFulfillmentService(
      prisma,
      {
        del: jest.fn().mockResolvedValue(undefined),
        delPattern: jest.fn().mockResolvedValue(undefined),
      } as never,
      { get: jest.fn((key: string) => env[key]) } as never,
      {
        emitOrderFulfillmentRequested: jest.fn().mockResolvedValue(undefined),
        emitGroupBuyerOrderPaid: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        notifyStockoutCascade: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        applyBoostInTx: jest.fn().mockResolvedValue("boosted-product"),
        applyMembershipInTx: jest.fn().mockResolvedValue(undefined),
        issueBoostInvoice: jest.fn(),
        issueMembershipInvoice: jest.fn(),
      } as never,
      {
        decrementForOrder: jest.fn().mockResolvedValue({
          cancelledOrders: [],
          cancelledOffers: [],
        }),
      } as never,
      { createInAppNotification } as never,
      { createHold: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
      { recordTradeCashCapture: jest.fn() } as never,
      {
        consumeReservedUsageForOrders: jest.fn().mockResolvedValue(undefined),
        releaseReservedUsageForOrders: jest.fn().mockResolvedValue(undefined),
      } as never,
      undefined,
    );
    return { service, tx, prisma, createInAppNotification };
  };

  const wishlistCalls = (mock: jest.Mock) =>
    mock.mock.calls.filter(
      (call) => call[1] === NotificationType.WISHLIST_SOLD,
    );

  it("tekil ödeme: takipçilere gider, satıcı ve alıcı hariç", async () => {
    const { service, tx, createInAppNotification } = makeHarness();
    const order = makeOrder(1);
    tx.order.findUnique
      .mockResolvedValueOnce({
        status: OrderStatus.pending_payment,
        orderNumber: "ORD-1",
      })
      .mockResolvedValueOnce(order);

    const done = await service.processSuccessfulPayment(
      {
        id: "pay-1",
        orderId: order.id,
        order,
        status: "pending",
        metadata: {},
        provider: "paytr",
      },
      "txn-1",
    );
    await flush();

    expect(done).toBe(true);
    const calls = wishlistCalls(createInAppNotification);
    expect(calls.map((c) => c[0]).sort()).toEqual(["watcher-1", "watcher-2"]);
    expect(calls[0][2]).toMatchObject({
      productId: "product-1",
      productTitle: "Ürün",
    });
  });

  it("boost (sanal) siparişi takipçilere 'satıldı' DEMEZ", async () => {
    const { service, tx, prisma, createInAppNotification } = makeHarness();
    const order = makeOrder(1, "boost-abc");
    tx.order.findUnique
      .mockResolvedValueOnce({
        status: OrderStatus.pending_payment,
        orderNumber: "ORD-1",
      })
      .mockResolvedValueOnce(order);

    await service.processSuccessfulPayment(
      {
        id: "pay-1",
        orderId: order.id,
        order,
        status: "pending",
        metadata: {},
        provider: "paytr",
      },
      "txn-1",
    );
    await flush();

    expect(wishlistCalls(createInAppNotification)).toHaveLength(0);
    expect(prisma.wishlistItem.findMany).not.toHaveBeenCalled();
  });

  it("sepet (grup) ödemesi: ürün başına TEK bildirim", async () => {
    const { service, tx, createInAppNotification } = makeHarness();
    // Aynı ürün iki siparişte: bildirim ürün başına bir kez atılmalı.
    tx.order.findMany.mockResolvedValue([
      makeOrder(1, "product-1"),
      makeOrder(2, "product-1"),
      makeOrder(3, "product-3"),
    ]);

    const done = await (service as any).processSuccessfulGroupPayment(
      {
        id: "pay-group-1",
        orderId: null,
        checkoutGroupId: "group-1",
        status: "pending",
        metadata: {},
        provider: "paytr",
      },
      "txn-1",
    );
    await flush();

    expect(done).toBe(true);
    const calls = wishlistCalls(createInAppNotification);
    const byProduct = new Map<string, string[]>();
    for (const [userId, , data] of calls) {
      const list = byProduct.get(data.productId) ?? [];
      list.push(userId);
      byProduct.set(data.productId, list);
    }
    // Her ürün için takipçi listesi bir kez gezilir (watcher-1 + watcher-2).
    expect(byProduct.get("product-1")?.sort()).toEqual([
      "watcher-1",
      "watcher-2",
    ]);
    expect(byProduct.get("product-3")?.sort()).toEqual([
      "watcher-1",
      "watcher-2",
    ]);
    expect(calls).toHaveLength(4);
  });

  /**
   * Satıcı hazırlık süresi Süreler ve Kurallar'dan (`preparingDeadlineDays`):
   * ayar → env PREPARING_DEADLINE_DAYS → 3 gün; pazar hariç sayılır ve
   * siparişe damgalanır.
   */
  describe("hazırlık son tarihi — süre kaynağı", () => {
    const NOW = new Date("2026-10-05T09:00:00.000Z");

    afterEach(() => jest.useRealTimers());

    const preparingDeadlineFor = async (
      settings: Record<string, string>,
      env: Record<string, string>,
    ): Promise<Date> => {
      jest.useFakeTimers({ now: NOW, doNotFake: ["setImmediate"] });
      const { service, tx } = makeHarness(settings, env);
      const order = makeOrder(1);
      tx.order.findUnique
        .mockResolvedValueOnce({
          status: OrderStatus.pending_payment,
          orderNumber: "ORD-1",
        })
        .mockResolvedValueOnce(order);
      await service.processSuccessfulPayment(
        {
          id: "pay-1",
          orderId: order.id,
          order,
          status: "pending",
          metadata: {},
          provider: "paytr",
        },
        "txn-1",
      );
      const preparingCall = tx.order.update.mock.calls.find(
        (call: any[]) => call[0]?.data?.status === OrderStatus.preparing,
      );
      return preparingCall[0].data.preparingDeadline as Date;
    };

    it("admin değeri ve env yokken bugünkü gibi 3 gün (pazar hariç)", async () => {
      await expect(preparingDeadlineFor({}, {})).resolves.toEqual(
        addDaysSkippingSundays(NOW, 3),
      );
    });

    it("env geri düşüşünü okur, admin değeri onu ezer", async () => {
      await expect(
        preparingDeadlineFor({}, { PREPARING_DEADLINE_DAYS: "5" }),
      ).resolves.toEqual(addDaysSkippingSundays(NOW, 5));
      await expect(
        preparingDeadlineFor(
          { preparing_deadline_days: "2" },
          { PREPARING_DEADLINE_DAYS: "5" },
        ),
      ).resolves.toEqual(addDaysSkippingSundays(NOW, 2));
    });
  });
});
