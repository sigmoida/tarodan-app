import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { OrderLifecycleService } from "./order-lifecycle.service";

/**
 * Grup iptali (R4): iptal SEPET bazındadır — alıcı grubun tamamını iptal eder.
 *  - Tüm üyeler iptal edilebilir durumda olmalı (pending_payment/paid/preparing
 *    ve hiçbiri taşıyıcıya teslim edilmemiş). Kısmen kargolanmış sepette iptal
 *    TAMAMEN kapalıdır (kalan kalemler için iade akışı kullanılır).
 *  - Zaten iptal olmuş üyeler atlanır; kalanlar mevcut tekil iptal akışıyla
 *    (para iadesi dahil) sırayla iptal edilir.
 */
describe("OrderLifecycleService.cancelGroup", () => {
  const makeService = (group: any) => {
    const prisma: any = {
      checkoutGroup: { findUnique: jest.fn().mockResolvedValue(group) },
    };
    const svc = Object.create(OrderLifecycleService.prototype);
    (svc as any).prisma = prisma;
    (svc as any).cancel = jest.fn().mockResolvedValue({ ok: true });
    (svc as any).orderQuery = {
      findCheckoutGroup: jest.fn().mockResolvedValue({ id: group?.id }),
    };
    return { svc: svc as OrderLifecycleService, prisma };
  };

  const order = (id: string, over: Record<string, any> = {}) => ({
    id,
    status: "paid",
    shipment: null,
    ...over,
  });

  const baseGroup = (orders: any[]) => ({
    id: "grp-1",
    buyerId: "buyer-1",
    orders,
  });

  it("tüm üyeler iptal edilebilirse hepsi tekil iptal akışıyla iptal edilir", async () => {
    const { svc } = makeService(
      baseGroup([order("o1"), order("o2", { status: "preparing" })]),
    );
    const dto = { reasonCode: "changed_mind", reason: "x" } as any;

    const result = await (svc as any).cancelGroup("grp-1", "buyer-1", dto);

    expect((svc as any).cancel).toHaveBeenCalledTimes(2);
    expect((svc as any).cancel).toHaveBeenCalledWith("o1", "buyer-1", dto);
    expect((svc as any).cancel).toHaveBeenCalledWith("o2", "buyer-1", dto);
    expect(result).toEqual({ id: "grp-1" });
  });

  it("herhangi bir üye kargoya verildiyse grup iptali TAMAMEN kapalıdır", async () => {
    const { svc } = makeService(
      baseGroup([
        order("o1"),
        order("o2", {
          status: "shipped",
          shipment: { status: "in_transit" },
        }),
      ]),
    );

    await expect(
      (svc as any).cancelGroup("grp-1", "buyer-1", {
        reasonCode: "changed_mind",
      }),
    ).rejects.toThrow(BadRequestException);
    expect((svc as any).cancel).not.toHaveBeenCalled();
  });

  it("paid üyenin kargosu taşıyıcıya geçtiyse (statü paid kalsa bile) grup iptali kapalıdır", async () => {
    const { svc } = makeService(
      baseGroup([
        order("o1", { shipment: { status: "picked_up" } }),
        order("o2"),
      ]),
    );

    await expect(
      (svc as any).cancelGroup("grp-1", "buyer-1", {
        reasonCode: "changed_mind",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("zaten iptal olmuş üyeler atlanır, kalanlar iptal edilir", async () => {
    const { svc } = makeService(
      baseGroup([order("o1", { status: "cancelled" }), order("o2")]),
    );

    await (svc as any).cancelGroup("grp-1", "buyer-1", {
      reasonCode: "changed_mind",
    });

    expect((svc as any).cancel).toHaveBeenCalledTimes(1);
    expect((svc as any).cancel).toHaveBeenCalledWith(
      "o2",
      "buyer-1",
      expect.anything(),
    );
  });

  it("tüm üyeler zaten iptal ise BadRequest", async () => {
    const { svc } = makeService(
      baseGroup([order("o1", { status: "cancelled" })]),
    );

    await expect(
      (svc as any).cancelGroup("grp-1", "buyer-1", {
        reasonCode: "changed_mind",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("alıcı olmayan kullanıcı Forbidden, olmayan grup NotFound", async () => {
    const { svc } = makeService(baseGroup([order("o1")]));
    await expect(
      (svc as any).cancelGroup("grp-1", "stranger", {
        reasonCode: "changed_mind",
      }),
    ).rejects.toThrow(ForbiddenException);

    const { svc: svc2 } = makeService(null);
    await expect(
      (svc2 as any).cancelGroup("nope", "buyer-1", {
        reasonCode: "changed_mind",
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
