import {
  CancellationActor,
  PaymentStatus,
  ProductStatus,
  TradeStatus,
} from "@prisma/client";
import {
  cancelPreShipmentTradeInTx,
  settlePreShipmentCancellation,
  type PreShipmentCancelInput,
} from "./trade-pre-shipment-cancel";

/**
 * Kargo öncesi iptal çekirdeği: süre dolumu taraması ile platform iptali aynı
 * adımları çalıştırır. Burada sabitlenen: kargo kilidi, rezervasyon çözümü,
 * iptal yazımı, kusur ataması ve commit sonrası adımların sırası.
 */
describe("cancelPreShipmentTradeInTx", () => {
  const AT = new Date("2026-10-05T12:00:00.000Z");

  const makeTx = (opts: {
    shippedLeg?: boolean;
    items?: Array<{ productId: string; quantity: number }>;
    reserved?: number;
  }) => ({
    $queryRaw: jest.fn().mockResolvedValue([]),
    tradeShipment: {
      findFirst: jest
        .fn()
        .mockResolvedValue(opts.shippedLeg ? { id: "leg-1" } : null),
    },
    tradeItem: {
      findMany: jest
        .fn()
        .mockResolvedValue(opts.items ?? [{ productId: "p1", quantity: 1 }]),
    },
    product: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ reservedQuantity: opts.reserved ?? 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    trade: { update: jest.fn().mockResolvedValue({}) },
    tradeCashPayment: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  });

  const input = (
    status: TradeStatus,
    patch: Partial<PreShipmentCancelInput> = {},
  ): PreShipmentCancelInput => ({
    trade: { id: "t1", status, firstWarehouseArrivalAt: null },
    actor: CancellationActor.system,
    reason: "Süre dolumu nedeniyle otomatik iptal",
    at: AT,
    faultless: "none",
    ...patch,
  });

  it("pending: rezervasyon yoktur, yalnız iptal yazılır", async () => {
    const tx = makeTx({});

    const outcome = await cancelPreShipmentTradeInTx(
      tx as never,
      input(TradeStatus.pending),
    );

    expect(outcome).toEqual({ releasedReservations: [] });
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.trade.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        status: TradeStatus.cancelled,
        cancelledAt: AT,
        cancelledBy: CancellationActor.system,
        cancelReason: "Süre dolumu nedeniyle otomatik iptal",
      },
    });
  });

  it.each([
    TradeStatus.accepted,
    TradeStatus.awaiting_payment,
    TradeStatus.shipping_to_warehouse,
  ])(
    "%s: kabulde yapılan rezervasyonu ürün başına toplanmış adetle çözer",
    async (status) => {
      const tx = makeTx({
        items: [
          { productId: "p1", quantity: 1 },
          { productId: "p1", quantity: 1 },
          { productId: "p2", quantity: 1 },
        ],
        reserved: 2,
      });

      const outcome = await cancelPreShipmentTradeInTx(
        tx as never,
        input(status),
      );

      expect(outcome?.releasedReservations).toEqual([
        { productId: "p1", quantity: 2 },
        { productId: "p2", quantity: 1 },
      ]);
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: "p1" },
        data: { reservedQuantity: 0, status: ProductStatus.active },
      });
      expect(tx.product.update).toHaveBeenCalledWith({
        where: { id: "p2" },
        data: { reservedQuantity: 1, status: ProductStatus.reserved },
      });
    },
  );

  it("shipping_to_warehouse: bir bacak kargoya verildiyse hiçbir şey yazmadan null döner", async () => {
    const tx = makeTx({ shippedLeg: true });

    const outcome = await cancelPreShipmentTradeInTx(
      tx as never,
      input(TradeStatus.shipping_to_warehouse),
    );

    expect(outcome).toBeNull();
    expect(tx.tradeShipment.findFirst).toHaveBeenCalledWith({
      where: { tradeId: "t1", leg: "to_warehouse", shippedAt: { not: null } },
      select: { id: true },
    });
    expect(tx.trade.update).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
    expect(tx.tradeCashPayment.updateMany).not.toHaveBeenCalled();
  });

  it("shipping_to_warehouse: depoya varış damgası varsa null döner", async () => {
    const tx = makeTx({});

    const outcome = await cancelPreShipmentTradeInTx(tx as never, {
      ...input(TradeStatus.shipping_to_warehouse),
      trade: {
        id: "t1",
        status: TradeStatus.shipping_to_warehouse,
        firstWarehouseArrivalAt: AT,
      },
    });

    expect(outcome).toBeNull();
    expect(tx.trade.update).not.toHaveBeenCalled();
  });

  it("faultless=none: hiçbir ödeme kusursuz işaretlenmez", async () => {
    const tx = makeTx({});

    await cancelPreShipmentTradeInTx(
      tx as never,
      input(TradeStatus.shipping_to_warehouse, { faultless: "none" }),
    );

    expect(tx.tradeCashPayment.updateMany).not.toHaveBeenCalled();
  });

  it("faultless=paid: yalnız tamamlanmış ödemeler kusursuz işaretlenir", async () => {
    const tx = makeTx({});

    await cancelPreShipmentTradeInTx(
      tx as never,
      input(TradeStatus.awaiting_payment, { faultless: "paid" }),
    );

    expect(tx.tradeCashPayment.updateMany).toHaveBeenCalledWith({
      where: { tradeId: "t1", status: PaymentStatus.completed },
      data: { fullRefundEntitled: true },
    });
  });

  it("faultless=all (platform iptali): durumundan bağımsız her ödeme satırı kusursuz işaretlenir", async () => {
    const tx = makeTx({});

    await cancelPreShipmentTradeInTx(
      tx as never,
      input(TradeStatus.shipping_to_warehouse, { faultless: "all" }),
    );

    expect(tx.tradeCashPayment.updateMany).toHaveBeenCalledWith({
      where: { tradeId: "t1" },
      data: { fullRefundEntitled: true },
    });
  });

  it("platform kodu verilirse iptalle aynı yazımda saklanır", async () => {
    const tx = makeTx({});

    await cancelPreShipmentTradeInTx(
      tx as never,
      input(TradeStatus.awaiting_payment, {
        actor: CancellationActor.platform,
        reason: "Tarodan tarafından iptal edildi: Stok hatası",
        faultless: "all",
        adminCancelReasonCode: "stock_error",
      }),
    );

    expect(tx.trade.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: {
        status: TradeStatus.cancelled,
        cancelledAt: AT,
        cancelledBy: CancellationActor.platform,
        cancelReason: "Tarodan tarafından iptal edildi: Stok hatası",
        adminCancelReasonCode: "stock_error",
      },
    });
  });

  it("kod verilmezse (süre dolumu) kolon yazıma hiç girmez", async () => {
    const tx = makeTx({});

    await cancelPreShipmentTradeInTx(tx as never, input(TradeStatus.pending));

    const data = tx.trade.update.mock.calls[0][0].data;
    expect(Object.keys(data)).not.toContain("adminCancelReasonCode");
  });
});

describe("settlePreShipmentCancellation", () => {
  it("izlenen iade → önbellek → Sürat etiket iptali sırasıyla çalışır ve iade sonucunu döner", async () => {
    const calls: string[] = [];
    const refund = { refunded: true, failed: false };
    const deps = {
      paymentService: {
        refundTradeCashTracked: jest.fn(async () => {
          calls.push("refund");
          return refund;
        }),
      },
      tradeCommon: {
        invalidateProductCachesForTrade: jest.fn(async () => {
          calls.push("cache");
        }),
      },
      tradeShipment: {
        cancelSuratShipmentsForTrade: jest.fn(async () => {
          calls.push("labels");
        }),
      },
      logger: { warn: jest.fn() },
    };

    await expect(
      settlePreShipmentCancellation(deps as never, "t1"),
    ).resolves.toBe(refund);
    expect(calls).toEqual(["refund", "cache", "labels"]);
    expect(deps.paymentService.refundTradeCashTracked).toHaveBeenCalledWith(
      "t1",
    );
  });

  it("önbellek hatası etiket iptalini atlatmaz ve çağırana fırlatılmaz", async () => {
    const refund = { refunded: false, failed: false };
    const deps = {
      paymentService: {
        refundTradeCashTracked: jest.fn().mockResolvedValue(refund),
      },
      tradeCommon: {
        invalidateProductCachesForTrade: jest
          .fn()
          .mockRejectedValue(new Error("redis down")),
      },
      tradeShipment: {
        cancelSuratShipmentsForTrade: jest.fn().mockResolvedValue(undefined),
      },
      logger: { warn: jest.fn() },
    };

    await expect(
      settlePreShipmentCancellation(deps as never, "t1"),
    ).resolves.toBe(refund);
    expect(
      deps.tradeShipment.cancelSuratShipmentsForTrade,
    ).toHaveBeenCalledWith("t1");
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("redis down"),
    );
  });
});
