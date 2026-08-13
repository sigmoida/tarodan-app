import { NotFoundException } from "@nestjs/common";
import { OrderCancellationReason } from "@prisma/client";
import { OrderLifecycleService } from "./order-lifecycle.service";

/**
 * Misafir iptali (token = sipariş numarası + e-posta, takip ucuyla aynı kural).
 *
 * Misafir siparişi sentetik bir alıcıya bağlıdır ve oturum tabanlı iptal ucu bu
 * kullanıcı için hiç çalışmıyordu: müşteri dokümanının "alıcı, ürün kargoya
 * verilene kadar iptal edebilir" taahhüdü misafirde karşılıksız kalıyordu.
 * Kritik nokta: erişim doğrulandıktan sonra ÜYE iptaliyle AYNI komuta düşülür —
 * ayrı bir para yolu açılmaz.
 */
describe("OrderLifecycleService.cancelAsGuest", () => {
  const makeService = (
    access: { id: string; buyerId: string } | Error = {
      id: "order-1",
      buyerId: "guest-buyer-1",
    },
  ) => {
    const orderQuery = {
      resolveGuestOrderAccess: jest
        .fn()
        .mockImplementation(() =>
          access instanceof Error
            ? Promise.reject(access)
            : Promise.resolve(access),
        ),
    };
    const service = new OrderLifecycleService(
      {} as any, // prisma
      {} as any, // cache
      {} as any, // notificationService
      {} as any, // productLockService
      {} as any, // commissionLedger
      {} as any, // orderCommon
      orderQuery as any,
      {} as any, // elogoInvoicing
    );
    const cancel = jest.fn().mockResolvedValue({ id: "order-1" });
    (service as any).cancel = cancel;
    return { service, orderQuery, cancel };
  };

  it("erişim doğrulanınca ÜYE iptaliyle aynı komuta düşer", async () => {
    const { service, orderQuery, cancel } = makeService();

    await service.cancelAsGuest({
      orderNumber: "ORD-1",
      email: "Guest@Example.com",
      reasonCode: OrderCancellationReason.changed_mind,
      reason: "vazgeçtim",
    });

    expect(orderQuery.resolveGuestOrderAccess).toHaveBeenCalledWith({
      orderNumber: "ORD-1",
      email: "Guest@Example.com",
    });
    // Sahiplik kontrolü sentetik alıcı kimliğiyle geçer; kesinti politikası,
    // kargoya-devir kilidi ve escrow davranışı üye yoluyla birebir aynıdır.
    expect(cancel).toHaveBeenCalledWith("order-1", "guest-buyer-1", {
      reasonCode: OrderCancellationReason.changed_mind,
      reason: "vazgeçtim",
    });
  });

  it("e-posta tutmazsa iptal komutu HİÇ çalışmaz", async () => {
    const { service, cancel } = makeService(new NotFoundException());

    await expect(
      service.cancelAsGuest({ orderNumber: "ORD-1", email: "yanlis@x.com" }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(cancel).not.toHaveBeenCalled();
  });
});
