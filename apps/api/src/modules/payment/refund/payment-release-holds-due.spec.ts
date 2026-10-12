import { PaymentHoldReleaseService } from "./payment-hold-release.service";
import {
  OrderStatus,
  PaymentHoldStatus,
  Prisma,
  RefundRequestStatus,
} from "@prisma/client";
import { BadRequestException } from "@nestjs/common";
import { HOLD_RELEASE_ORDER_SELECT } from "../../payout/helpers/hold-release-eligibility";

/**
 * releaseHoldsDue escrow-release güvenlik guard'ları (çekirdek para yolu, önceden testsiz):
 * bir hold ancak (a) held + releaseAt geçmiş + frozenByRefundId null, (b) sipariş releasable
 * statüde (delivered/awaiting/completed), (c) AÇIK iade yoksa serbest bırakılır.
 *
 * Kalıntı: iade/iptalle kapanmış siparişin hold'unda kalan tutar (satıcının
 * kargo payı) kusur satıcıda değilse bırakılır, satıcıdaysa asla.
 */
const PAST = new Date(Date.now() - 60 * 60 * 1000);

const heldHold = (overrides: Record<string, unknown> = {}) => ({
  id: "hold-1",
  orderId: "o1",
  amount: 100,
  refundedAmount: 0,
  sellerId: "s1",
  status: PaymentHoldStatus.held,
  frozenByRefundId: null,
  releaseAt: PAST,
  ...overrides,
});

const openRefund = { status: RefundRequestStatus.pending_review };
const finalized = (faultParty: string | null, policyCode = "v2_x") => ({
  status: RefundRequestStatus.refunded,
  faultParty,
  policyCode,
});

describe("PaymentHoldReleaseService.releaseHoldsDue — escrow release guards", () => {
  const makeService = (order: unknown, hold = heldHold()) => {
    const prisma = {
      paymentHold: {
        findMany: jest.fn().mockResolvedValue([hold]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue([]) },
      // Damgasız kalıntı adayları (kapanmış sipariş JOIN'i) — varsayılan yok.
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const configService = { get: jest.fn().mockReturnValue(undefined) };
    const service = new PaymentHoldReleaseService(
      prisma as never,
      configService as never,
      {} as never, // eventService
      {} as never, // notificationService
    );
    return { service, prisma };
  };

  it("releasable statü + açık iade yok → hold serbest bırakılır", async () => {
    const { service, prisma } = makeService({
      status: OrderStatus.delivered,
      refundRequests: [],
    });

    const res = await service.releaseHoldsDue();

    expect(res.count).toBe(1);
    expect(prisma.paymentHold.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "hold-1",
          status: PaymentHoldStatus.held,
          frozenByRefundId: null,
        }),
        data: expect.objectContaining({ status: PaymentHoldStatus.released }),
      }),
    );
    // Sipariş, yüklemin tek okuması ile yüklenir.
    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { id: "o1" },
      select: HOLD_RELEASE_ORDER_SELECT,
    });
  });

  it("AÇIK iade varsa → serbest BIRAKILMAZ", async () => {
    const { service, prisma } = makeService({
      status: OrderStatus.delivered,
      refundRequests: [openRefund],
    });

    const res = await service.releaseHoldsDue();

    expect(res.count).toBe(0);
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
  });

  it("releasable OLMAYAN statü (preparing) → serbest BIRAKILMAZ", async () => {
    const { service, prisma } = makeService({
      status: OrderStatus.preparing,
      refundRequests: [],
    });

    const res = await service.releaseHoldsDue();

    expect(res.count).toBe(0);
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
  });

  it("sipariş bulunamazsa → serbest BIRAKILMAZ", async () => {
    const { service, prisma } = makeService(null);

    const res = await service.releaseHoldsDue();

    expect(res.count).toBe(0);
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
  });

  it("adaylar: tarihi gelmişler + kapanmış siparişin damgasız hold'ları (sipariş durumundan)", async () => {
    const { service, prisma } = makeService(null);

    await service.releaseHoldsDue();

    const { where } = prisma.paymentHold.findMany.mock.calls[0][0];
    expect(where).toEqual({
      status: PaymentHoldStatus.held,
      frozenByRefundId: null,
      releaseAt: { lte: expect.any(Date) },
    });
    // Kalıntı adayı `refundedAmount`'a göre DEĞİL, siparişin kapanmış
    // olmasına göre seçilir — sınırlı ve sıralı JOIN.
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const query = prisma.$queryRaw.mock.calls[0][0] as Prisma.Sql;
    expect(typeof query.sql).toBe("string");
    expect(query.sql).toContain("JOIN orders o ON o.id = h.order_id");
    expect(query.sql).toContain("h.release_at IS NULL");
    expect(query.sql).toContain("h.frozen_by_refund_id IS NULL");
    expect(query.sql).toContain("ORDER BY h.created_at ASC");
    expect(query.sql).toContain("LIMIT");
    expect(query.sql).not.toContain("refunded_amount");
    expect(query.values).toEqual(
      expect.arrayContaining([
        PaymentHoldStatus.held,
        OrderStatus.cancelled,
        OrderStatus.refunded,
      ]),
    );
  });

  it("aynı hold iki aday kümesinde de çıksa bir kez bırakılır", async () => {
    const hold = heldHold({ amount: 420, refundedAmount: 395 });
    const { service, prisma } = makeService(
      { status: OrderStatus.cancelled, refundRequests: [finalized("buyer")] },
      hold,
    );
    prisma.$queryRaw.mockResolvedValue([{ id: hold.id }]);

    expect((await service.releaseHoldsDue()).count).toBe(1);
    expect(prisma.paymentHold.updateMany).toHaveBeenCalledTimes(1);
  });

  describe("kapanmış siparişin kalıntısı", () => {
    // hold 420, iade 395 tüketti → satıcıya kalan 25
    const residual = heldHold({ amount: 420, refundedAmount: 395 });

    it("kusur alıcıda → kalıntı serbest bırakılır", async () => {
      const { service, prisma } = makeService(
        {
          status: OrderStatus.cancelled,
          refundRequests: [finalized("buyer")],
        },
        residual,
      );

      const res = await service.releaseHoldsDue();

      expect(res.count).toBe(1);
      expect(prisma.paymentHold.updateMany).toHaveBeenCalledTimes(1);
    });

    it("kargoya verilmeden iptal: damgasız kalıntı da hemen vadelidir", async () => {
      const { service } = makeService(
        {
          status: OrderStatus.cancelled,
          refundRequests: [finalized("platform")],
        },
        heldHold({ amount: 420, refundedAmount: 395, releaseAt: null }),
      );

      expect((await service.releaseHoldsDue()).count).toBe(1);
    });

    describe("iade hiç tüketmediyse (refundedAmount 0, kalıntı = hold'un tamamı)", () => {
      // Bırakılacak pay hold'u aşınca iade hold'dan hiçbir şey tüketmez:
      // refundedAmount 0 ve releaseAt null kalır. Eski aday süzgeci
      // (`refundedAmount > 0`) bu hold'u hiç görmüyordu.
      const untouched = heldHold({
        amount: 30,
        refundedAmount: 0,
        releaseAt: null,
      });
      const withClosedOrderCandidate = (refundRequests: unknown[]) => {
        const ctx = makeService(
          { status: OrderStatus.cancelled, refundRequests },
          untouched,
        );
        // Tarih süzgeci bu hold'u görmez; yalnız kapanmış-sipariş JOIN'i bulur.
        ctx.prisma.paymentHold.findMany
          .mockReset()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([untouched]);
        ctx.prisma.$queryRaw.mockResolvedValue([{ id: untouched.id }]);
        return ctx;
      };

      it("kusur satıcıda değil → cron kalıntıyı serbest bırakır", async () => {
        const { service, prisma } = withClosedOrderCandidate([
          finalized("buyer"),
        ]);

        expect((await service.releaseHoldsDue()).count).toBe(1);
        expect(prisma.paymentHold.findMany).toHaveBeenLastCalledWith({
          where: {
            id: { in: ["hold-1"] },
            status: PaymentHoldStatus.held,
            frozenByRefundId: null,
          },
          orderBy: { createdAt: "asc" },
        });
        expect(prisma.paymentHold.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ id: "hold-1" }),
            data: expect.objectContaining({
              status: PaymentHoldStatus.released,
            }),
          }),
        );
      });

      it("kusur satıcıda → bırakılmaz (settle-residual ile kapatılır)", async () => {
        const { service, prisma } = withClosedOrderCandidate([
          finalized("seller"),
        ]);

        expect((await service.releaseHoldsDue()).count).toBe(0);
        expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
      });
    });

    it("tam iadeden sonra planlanan tarih henüz gelmediyse bekler", async () => {
      const { service, prisma } = makeService(
        {
          status: OrderStatus.refunded,
          refundRequests: [finalized("buyer")],
        },
        heldHold({
          amount: 420,
          refundedAmount: 395,
          releaseAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }),
      );

      expect((await service.releaseHoldsDue()).count).toBe(0);
      expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      ["kusur satıcıda", [finalized("seller")]],
      ["v1 satıcı kusuru", [finalized(null, "seller_fault_cancellation")]],
      ["kusur belirlenemiyor", []],
    ])("%s → kalıntı ASLA bırakılmaz", async (_name, refundRequests) => {
      const { service, prisma } = makeService(
        { status: OrderStatus.cancelled, refundRequests },
        residual,
      );

      expect((await service.releaseHoldsDue()).count).toBe(0);
      expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
    });

    it("idempotent: ikinci tur (hold artık held değil, CAS 0 satır) hiçbir şey saymaz", async () => {
      const { service, prisma } = makeService(
        {
          status: OrderStatus.cancelled,
          refundRequests: [finalized("buyer")],
        },
        residual,
      );
      prisma.paymentHold.updateMany.mockResolvedValue({ count: 0 });

      expect((await service.releaseHoldsDue()).count).toBe(0);
    });
  });
});

describe("PaymentHoldReleaseService.releasePayment — admin manual release", () => {
  const makeService = (order: unknown, hold: unknown) => {
    const prisma = {
      paymentHold: {
        findFirst: jest.fn().mockResolvedValue(hold),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      order: { findUnique: jest.fn().mockResolvedValue(order) },
    };
    const service = new PaymentHoldReleaseService(
      prisma as never,
      { get: jest.fn() } as never,
      {} as never,
      {} as never,
    );
    return { service, prisma };
  };

  it("releases the residual of a buyer-fault cancellation and reports what reaches the seller", async () => {
    const { service, prisma } = makeService(
      { status: OrderStatus.cancelled, refundRequests: [finalized("buyer")] },
      heldHold({ amount: 420, refundedAmount: 395 }),
    );

    const res = await service.releasePayment("o1");

    expect(res).toEqual({ success: true, holdId: "hold-1", amount: 25 });
    expect(prisma.paymentHold.updateMany).toHaveBeenCalledWith({
      where: {
        id: "hold-1",
        status: PaymentHoldStatus.held,
        frozenByRefundId: null,
      },
      data: {
        status: PaymentHoldStatus.released,
        releasedAt: expect.any(Date),
      },
    });
  });

  it("rejects a seller-fault residual with the localized seller-at-fault reason", async () => {
    const { service, prisma } = makeService(
      { status: OrderStatus.cancelled, refundRequests: [finalized("seller")] },
      heldHold({ amount: 420, refundedAmount: 395 }),
    );

    const error = await service.releasePayment("o1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect(
      JSON.stringify((error as BadRequestException).getResponse()),
    ).toContain("server.payment.holdReleaseBlocked.sellerAtFault");
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
  });

  it("early release (force) skips only the date — the fault rule still applies", async () => {
    const { service, prisma } = makeService(
      { status: OrderStatus.refunded, refundRequests: [finalized("seller")] },
      heldHold({
        amount: 420,
        refundedAmount: 395,
        releaseAt: new Date(Date.now() + 86_400_000),
      }),
    );

    await expect(
      service.releasePayment("o1", { ignoreReleaseDate: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
  });

  it("a frozen hold is never released, whatever the order says", async () => {
    const { service, prisma } = makeService(
      { status: OrderStatus.delivered, refundRequests: [] },
      heldHold({ frozenByRefundId: "rr-1" }),
    );

    await expect(service.releasePayment("o1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.paymentHold.updateMany).not.toHaveBeenCalled();
  });
});
