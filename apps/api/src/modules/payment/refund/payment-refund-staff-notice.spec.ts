import { CancellationActor, OrderStatus } from "@prisma/client";
import { PaymentRefundService } from "./payment-refund.service";

/**
 * `order.cancelled` personel bildirimi, ödenmiş siparişin iptali para
 * iadesiyle kesinleştiğinde (processRefund commit SONRASI) çıkar. Teslim
 * sonrası iade (`iade`) iptal değildir; test şeridi notifier'da atlanır.
 */
describe("PaymentRefundService — order.cancelled personel bildirimi", () => {
  const build = (order: Record<string, unknown> | null) => {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
    };
    const notifier = { emit: jest.fn().mockResolvedValue(undefined) };
    const deps = Array.from({ length: 14 }, () => ({}));
    const service = new (
      PaymentRefundService as unknown as new (
        ...args: unknown[]
      ) => PaymentRefundService
    )(prisma, ...deps, notifier);
    const notify = (orderId: string, amount: number) =>
      (
        service as unknown as {
          notifyStaffOrderCancelled(id: string, a: number): Promise<void>;
        }
      ).notifyStaffOrderCancelled(orderId, amount);
    return { notify, notifier };
  };

  const cancelled = {
    orderNumber: "ORD-10001",
    status: OrderStatus.cancelled,
    cancellationType: "iptal",
    cancelledBy: CancellationActor.platform,
    isTest: false,
    buyer: { username: "ali", displayName: null, companyName: null },
    seller: { username: "satici", displayName: null, companyName: null },
  };

  it("kapanan iptali aktör ve iade tutarıyla, sipariş anahtarıyla bildirir", async () => {
    const { notify, notifier } = build(cancelled);

    await notify("o-1", 1250);

    expect(notifier.emit).toHaveBeenCalledWith(
      "order.cancelled",
      expect.objectContaining({
        ref: "ORD-10001",
        adminPath: "/operations/orders/o-1",
        facts: expect.arrayContaining([
          {
            label: "cancelledBy",
            valueKey: "server.mailRouting.internal.actors.platform",
          },
          { label: "amount", value: "1.250,00 TL" },
        ]),
      }),
      { isTest: false, dedupeKey: "o-1" },
    );
  });

  it("teslim sonrası iade (iade) bildirilmez", async () => {
    const { notify, notifier } = build({
      ...cancelled,
      cancellationType: "iade",
    });

    await notify("o-1", 100);

    expect(notifier.emit).not.toHaveBeenCalled();
  });

  it("sipariş iptal durumunda değilse bildirilmez", async () => {
    const { notify, notifier } = build({
      ...cancelled,
      status: OrderStatus.delivered,
    });

    await notify("o-1", 100);

    expect(notifier.emit).not.toHaveBeenCalled();
  });

  it("okuma hatası iade akışına yükselmez", async () => {
    const { notify } = build(null);
    await expect(notify("o-1", 100)).resolves.toBeUndefined();
  });
});
