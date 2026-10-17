import { OrderStatus } from "@prisma/client";
import { OrderLifecycleService } from "./order-lifecycle.service";

/**
 * Ödenmemiş iptalin personel bildirimi (`order.cancelled`) commit SONRASI,
 * işlemin dışında çalışır: çekirdek (`cancelUnpaidOrderInTx`) işlem içinde
 * ek sorgu yapmaz, ikinci bağlantıdan ayar okumaz. Çağıranlar bu metodu
 * işlem bittikten sonra çağırır.
 */
describe("OrderLifecycleService.notifyStaffUnpaidCancelled", () => {
  const build = (order: Record<string, unknown> | null) => {
    const prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
    };
    const notifier = { emit: jest.fn().mockResolvedValue(undefined) };
    const deps = Array.from({ length: 9 }, () => ({}));
    const service = new (
      OrderLifecycleService as unknown as new (
        ...args: unknown[]
      ) => OrderLifecycleService
    )(prisma, ...deps, notifier);
    return { service, notifier };
  };

  const cancelled = {
    orderNumber: "ORD-10002",
    totalAmount: 450,
    isTest: false,
    status: OrderStatus.cancelled,
  };

  it("alıcı iptalini aktör ve alıcının nedeniyle, sipariş anahtarıyla bildirir", async () => {
    const { service, notifier } = build(cancelled);

    await service.notifyStaffUnpaidCancelled(
      "o-2",
      "buyer_cancelled",
      "Yanlış ürün",
    );

    expect(notifier.emit).toHaveBeenCalledWith(
      "order.cancelled",
      expect.objectContaining({
        ref: "ORD-10002",
        facts: expect.arrayContaining([
          {
            label: "cancelledBy",
            valueKey: "server.mailRouting.internal.actors.buyer",
          },
          { label: "reason", value: "Yanlış ürün" },
        ]),
      }),
      { isTest: false, dedupeKey: "o-2" },
    );
  });

  it("yönetici iptalinin serbest metni postaya girmez", async () => {
    const { service, notifier } = build(cancelled);

    await service.notifyStaffUnpaidCancelled(
      "o-2",
      "admin_cancelled",
      "iç not",
    );

    const notice = notifier.emit.mock.calls[0][1];
    expect(JSON.stringify(notice)).not.toContain("iç not");
    expect(notice.facts).toContainEqual({
      label: "cancelledBy",
      valueKey: "server.mailRouting.internal.actors.platform",
    });
  });

  it("iptal commit olmadıysa (sipariş iptal değil) bildirmez", async () => {
    const { service, notifier } = build({
      ...cancelled,
      status: OrderStatus.pending_payment,
    });

    await service.notifyStaffUnpaidCancelled("o-2", "buyer_cancelled");

    expect(notifier.emit).not.toHaveBeenCalled();
  });

  it("okuma hatası iptal akışına yükselmez", async () => {
    const { service } = build(null);
    await expect(
      service.notifyStaffUnpaidCancelled("o-2", "buyer_cancelled"),
    ).resolves.toBeUndefined();
  });
});
