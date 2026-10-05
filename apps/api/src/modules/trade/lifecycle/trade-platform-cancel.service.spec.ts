import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  CancellationActor,
  OutboxStatus,
  PaymentStatus,
  ProductStatus,
  ShipmentStatus,
  TradeStatus,
} from "@prisma/client";
import type { AdminCancelReasonCode } from "@tarodan/types";
import { OutboxService } from "../../outbox/outbox.service";
import { OutboxHandlerRegistry } from "../../outbox/outbox-handler.registry";
import {
  OUTBOX_TRADE_CANCEL_SETTLE,
  OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE,
  type TradePlatformCancelNoticePayload,
} from "../../outbox/outbox.types";
import { TradePlatformCancelService } from "./trade-platform-cancel.service";

/**
 * Platform (admin) takas iptali — süre dolumu taramasının kargo öncesi
 * çekirdeğiyle. Bellek içi sahte tablo `$transaction`'ı satır kilidi gibi
 * sıraya sokar ve hata fırlatan tx'i GERİ ALIR (fail-closed denetimi bununla
 * sınanır). Çekirdek (`cancelPreShipmentTradeInTx`), iade politikası,
 * OutboxService ve handler kaydı GERÇEK koddur; yalnız dış servisler (iade
 * sağlayıcı, kargo, bildirim) sahte. `drain()` drainer'ın claim → handler →
 * completed / retry döngüsünü taklit eder.
 */
describe("TradePlatformCancelService", () => {
  const T0 = new Date("2026-10-05T12:00:00.000Z");

  interface PaymentRow {
    payerId: string;
    status: PaymentStatus;
    totalAmount: number;
    shippingAmount: number;
    tradeFeeAmount: number;
    commission: number;
    commissionTaxAmount: number;
    releasedAt: Date | null;
    refundedAt: Date | null;
    fullRefundEntitled: boolean;
    payment: { status: PaymentStatus; provider: string } | null;
  }

  interface ShipmentRow {
    leg: string;
    status: ShipmentStatus;
    shippedAt: Date | null;
    deliveredAt: Date | null;
  }

  interface OutboxRow {
    id: string;
    type: string;
    payload: unknown;
    dedupeKey: string;
    status: OutboxStatus;
  }

  interface TradeRow {
    id: string;
    tradeNumber: string;
    status: TradeStatus;
    initiatorId: string;
    receiverId: string;
    firstWarehouseArrivalAt: Date | null;
    cancelLockedAt: Date | null;
    cancelledBy: CancellationActor | null;
    cancelledAt?: Date | null;
    cancelReason?: string | null;
    adminCancelReasonCode: string | null;
    paymentDeadline: Date | null;
    paymentExtendedAt: Date | null;
  }

  interface State {
    trade: TradeRow;
    shipments: ShipmentRow[];
    items: Array<{
      productId: string;
      quantity: number;
      side: string;
      product: { title: string };
    }>;
    products: Record<string, { reservedQuantity: number; status: string }>;
    payments: PaymentRow[];
    outbox: OutboxRow[];
  }

  /** Sahte Prisma istemcisi; tx ile kök istemci aynı nesnedir. */
  interface FakeDb {
    $queryRaw: jest.Mock;
    trade: { findUnique: jest.Mock; update: jest.Mock };
    tradeShipment: { findFirst: jest.Mock; findMany: jest.Mock };
    tradeItem: { findMany: jest.Mock };
    product: { findUnique: jest.Mock; update: jest.Mock };
    tradeCashPayment: { updateMany: jest.Mock; findMany: jest.Mock };
    outboxEvent: { upsert: jest.Mock; updateMany: jest.Mock };
    $transaction: jest.Mock;
  }

  /** v2 ödeme satırı: 150 hizmet bedeli + 80 kargo = 230 tahsilat. */
  const paidRow = (payerId: string): PaymentRow => ({
    payerId,
    status: PaymentStatus.completed,
    totalAmount: 230,
    shippingAmount: 80,
    tradeFeeAmount: 150,
    commission: 0,
    commissionTaxAmount: 0,
    releasedAt: null,
    refundedAt: null,
    fullRefundEntitled: false,
    payment: { status: PaymentStatus.completed, provider: "paytr" },
  });
  const unpaidRow = (payerId: string): PaymentRow => ({
    ...paidRow(payerId),
    status: PaymentStatus.pending,
    payment: null,
  });

  const makeState = (patch: Partial<TradeRow> = {}): State => ({
    trade: {
      id: "t1",
      tradeNumber: "TKS-1",
      status: TradeStatus.awaiting_payment,
      initiatorId: "u1",
      receiverId: "u2",
      firstWarehouseArrivalAt: null,
      cancelLockedAt: null,
      cancelledBy: null,
      adminCancelReasonCode: null,
      paymentDeadline: new Date(T0.getTime() + 3_600_000),
      paymentExtendedAt: null,
      ...patch,
    },
    shipments: [],
    items: [
      {
        productId: "p1",
        quantity: 1,
        side: "initiator",
        product: { title: "Ferrari 1:18" },
      },
      {
        productId: "p2",
        quantity: 1,
        side: "receiver",
        product: { title: "Porsche 1:43" },
      },
    ],
    products: {
      p1: { reservedQuantity: 1, status: ProductStatus.reserved },
      p2: { reservedQuantity: 1, status: ProductStatus.reserved },
    },
    payments: [paidRow("u1"), unpaidRow("u2")],
    outbox: [],
  });

  /** `select: { alan: true }` alt kümesi (iç içe select'ler ayrıca eklenir). */
  const pick = (
    row: object,
    select?: Record<string, unknown>,
  ): Record<string, unknown> => {
    const source = row as Record<string, unknown>;
    if (!select) return { ...source };
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(select)) {
      if (select[key] === true) out[key] = source[key];
    }
    return out;
  };

  type Where = Record<string, unknown>;

  const makeHarness = (state: State) => {
    const lockLog: string[] = [];
    const calls: string[] = [];
    let lock: Promise<unknown> = Promise.resolve();

    const db: FakeDb = {
      $queryRaw: jest.fn(async (strings: TemplateStringsArray) => {
        lockLog.push(strings.join("?").trim());
        return [];
      }),
      trade: {
        findUnique: jest.fn(
          async ({
            where,
            select,
          }: {
            where: { id: string };
            select?: Record<string, unknown>;
          }) => {
            if (where.id !== state.trade.id) return null;
            const row = pick(state.trade, select);
            if (select?.shipments)
              row.shipments = state.shipments.map((s) => ({ ...s }));
            if (select?.cashPayments)
              row.cashPayments = state.payments.map((p) => ({ ...p }));
            if (select?.items) row.items = state.items.map((i) => ({ ...i }));
            return row;
          },
        ),
        update: jest.fn(async ({ data }: { data: Partial<TradeRow> }) => {
          Object.assign(state.trade, data);
          return state.trade;
        }),
      },
      tradeShipment: {
        findFirst: jest.fn(
          async ({ where }: { where: { leg: string } }) =>
            state.shipments.find(
              (s) => s.leg === where.leg && s.shippedAt !== null,
            ) ?? null,
        ),
        findMany: jest.fn(async () => state.shipments.map((s) => ({ ...s }))),
      },
      tradeItem: {
        findMany: jest.fn(async () => state.items.map((i) => ({ ...i }))),
      },
      product: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
          state.products[where.id] ? { ...state.products[where.id] } : null,
        ),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: Partial<State["products"][string]>;
          }) => {
            Object.assign(state.products[where.id], data);
            return {};
          },
        ),
      },
      tradeCashPayment: {
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { status?: PaymentStatus };
            data: Partial<PaymentRow>;
          }) => {
            const hit = state.payments.filter(
              (p) => !where.status || p.status === where.status,
            );
            hit.forEach((p) => Object.assign(p, data));
            return { count: hit.length };
          },
        ),
        findMany: jest.fn(async () => state.payments.map((p) => ({ ...p }))),
      },
      outboxEvent: {
        upsert: jest.fn(
          async ({
            where,
            create,
          }: {
            where: { dedupeKey: string };
            create: { type: string; payload: unknown };
          }) => {
            const existing = state.outbox.find(
              (row) => row.dedupeKey === where.dedupeKey,
            );
            if (existing) return existing;
            const row: OutboxRow = {
              id: `ob-${state.outbox.length + 1}`,
              type: create.type,
              payload: create.payload,
              dedupeKey: where.dedupeKey,
              status: OutboxStatus.pending,
            };
            state.outbox.push(row);
            return row;
          },
        ),
        updateMany: jest.fn(
          async ({
            where,
            data,
          }: {
            where: Where;
            data: { status?: OutboxStatus };
          }) => {
            const hit = state.outbox.filter(
              (row) =>
                (where.dedupeKey === undefined ||
                  row.dedupeKey === where.dedupeKey) &&
                (where.status === undefined || row.status === where.status),
            );
            hit.forEach((row) => {
              if (data.status) row.status = data.status;
            });
            return { count: hit.length };
          },
        ),
      },
      // Satır kilidi taklidi + geri alma: fırlatan tx'in yazdığı her şey geri döner.
      $transaction: jest.fn(
        (fn: (tx: FakeDb) => Promise<unknown>): Promise<unknown> => {
          const run: Promise<unknown> = lock.then(async () => {
            const snapshot = structuredClone(state);
            try {
              return await fn(db);
            } catch (error) {
              Object.assign(state, snapshot);
              throw error;
            }
          });
          lock = run.catch(() => undefined);
          return run;
        },
      ),
    };

    const paymentService = {
      refundTradeCashTracked: jest.fn(
        async (): Promise<{
          refunded: boolean;
          failed: boolean;
          reason?: string;
        }> => {
          calls.push("refund");
          return { refunded: true, failed: false };
        },
      ),
    };
    const tradeShipment = {
      cancelSuratShipmentsForTrade: jest.fn(async () => {
        calls.push("labels");
      }),
    };
    const tradeCommon = {
      invalidateProductCachesForTrade: jest.fn(async () => {
        calls.push("cache");
      }),
    };
    const notificationService = {
      sendTradeCancelledByPlatformNotice: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    const outbox = new OutboxService();
    const registry = new OutboxHandlerRegistry();
    const onCancelled = jest.fn().mockResolvedValue(undefined);

    const service = new TradePlatformCancelService(
      db as never,
      paymentService as never,
      tradeShipment as never,
      tradeCommon as never,
      notificationService as never,
      outbox,
      registry,
    );
    service.onModuleInit();

    /** Drainer turu: bekleyen her satırı claim et, handler'ı çalıştır. */
    const drain = async (): Promise<void> => {
      for (const row of state.outbox) {
        if (row.status !== OutboxStatus.pending) continue;
        row.status = OutboxStatus.processing;
        try {
          await registry.get(row.type)!(row.payload, row as never);
          row.status = OutboxStatus.completed;
        } catch {
          row.status = OutboxStatus.pending;
        }
      }
    };

    const rowsOf = (type: string) =>
      state.outbox.filter((row) => row.type === type);

    return {
      service,
      db,
      state,
      lockLog,
      calls,
      paymentService,
      tradeShipment,
      notificationService,
      outbox,
      registry,
      onCancelled,
      drain,
      rowsOf,
      cancel: (code: AdminCancelReasonCode = "stock_error") =>
        service.cancel("t1", code, { onCancelled }),
    };
  };

  beforeEach(() => jest.useFakeTimers().setSystemTime(T0));
  afterEach(() => jest.useRealTimers());

  describe("uygun aşamalar", () => {
    it("pending: rezervasyon yok, iade yok; platform aktörü + kod + etiket gerekçesiyle iptal", async () => {
      const state = makeState({ status: TradeStatus.pending });
      state.payments = [];
      const h = makeHarness(state);

      const result = await h.cancel("suspicious_activity");

      expect(state.trade.status).toBe(TradeStatus.cancelled);
      expect(state.trade.cancelledBy).toBe(CancellationActor.platform);
      expect(state.trade.adminCancelReasonCode).toBe("suspicious_activity");
      expect(state.trade.cancelReason).toBe(
        "Tarodan tarafından iptal edildi: Şüpheli işlem",
      );
      expect(state.products.p1.reservedQuantity).toBe(1);
      expect(result).toEqual(
        expect.objectContaining({
          alreadyCancelled: false,
          refundFailed: false,
          refunds: [
            { userId: "u1", side: "initiator", paid: false, refundAmount: 0 },
            { userId: "u2", side: "receiver", paid: false, refundAmount: 0 },
          ],
        }),
      );
    });

    it("accepted: kabulde yapılan rezervasyon çözülür, ürünler yeniden aktif", async () => {
      const state = makeState({ status: TradeStatus.accepted });
      state.payments = [];
      const h = makeHarness(state);

      await h.cancel();

      expect(state.products.p1).toEqual({
        reservedQuantity: 0,
        status: ProductStatus.active,
      });
      expect(state.products.p2).toEqual({
        reservedQuantity: 0,
        status: ProductStatus.active,
      });
      const record = h.onCancelled.mock.calls[0][1];
      expect(record.releasedReservations).toEqual([
        { productId: "p1", quantity: 1 },
        { productId: "p2", quantity: 1 },
      ]);
    });

    it("awaiting_payment, tek taraf ödemiş: ödeyen taraf taramayla aynı tam iadeyi alır, diğeri 0", async () => {
      const h = makeHarness(makeState());

      const result = await h.cancel();

      expect(result.refunds).toEqual([
        { userId: "u1", side: "initiator", paid: true, refundAmount: 230 },
        { userId: "u2", side: "receiver", paid: false, refundAmount: 0 },
      ]);
      expect(h.paymentService.refundTradeCashTracked).toHaveBeenCalledWith(
        "t1",
      );
      // Kusursuz bayrağı satıra yazıldı: retry cron'u da aynı tutarı hesaplar.
      expect(h.state.payments.every((p) => p.fullRefundEntitled)).toBe(true);
    });

    it("shipping_to_warehouse, iki taraf da ödemiş, yalnız etiket basılmış: iptal + tam iade + etiket iptali", async () => {
      const state = makeState({ status: TradeStatus.shipping_to_warehouse });
      state.payments = [paidRow("u1"), paidRow("u2")];
      state.shipments = [
        {
          leg: "to_warehouse",
          status: ShipmentStatus.label_created,
          shippedAt: null,
          deliveredAt: null,
        },
        {
          leg: "to_warehouse",
          status: ShipmentStatus.pending,
          shippedAt: null,
          deliveredAt: null,
        },
      ];
      const h = makeHarness(state);

      const result = await h.cancel();

      expect(state.trade.status).toBe(TradeStatus.cancelled);
      expect(result.refunds.map((r) => r.refundAmount)).toEqual([230, 230]);
      // Commit sonrası: taramayla aynı sıra — iade, önbellek, etiket iptali.
      expect(h.calls).toEqual(["refund", "cache", "labels"]);
    });
  });

  describe("kimse cezalandırılmaz", () => {
    it("hizmet bedeli ve kargo dahil tahsil edilenin tamamı döner (kusurlu iptalde bedel kesilirdi)", async () => {
      const state = makeState({ status: TradeStatus.shipping_to_warehouse });
      state.payments = [paidRow("u1"), paidRow("u2")];
      const h = makeHarness(state);

      const preview = await h.service.preview("t1");
      const result = await h.cancel();

      expect(preview.refunds.map((r) => r.refundAmount)).toEqual([230, 230]);
      expect(result.refunds).toEqual(preview.refunds);
      // Ödemesi henüz tamamlanmamış satır da kusursuz (geç gelen callback).
      expect(h.db.tradeCashPayment.updateMany).toHaveBeenCalledWith({
        where: { tradeId: "t1" },
        data: { fullRefundEntitled: true },
      });
    });
  });

  describe("engeller (ortak kural, kilit altında)", () => {
    it.each([
      [
        "kolisi yolda",
        {
          leg: "to_warehouse",
          status: ShipmentStatus.in_transit,
          shippedAt: null,
          deliveredAt: null,
        },
      ],
      [
        "shippedAt mührü",
        {
          leg: "to_warehouse",
          status: ShipmentStatus.label_created,
          shippedAt: new Date(),
          deliveredAt: null,
        },
      ],
      [
        "depoya teslim",
        {
          leg: "to_warehouse",
          status: ShipmentStatus.delivered,
          shippedAt: null,
          deliveredAt: new Date(),
        },
      ],
    ])(
      "shipping_to_warehouse + %s → 400, hiçbir şey yazılmaz",
      async (_, shipment) => {
        const state = makeState({ status: TradeStatus.shipping_to_warehouse });
        state.shipments = [shipment as ShipmentRow];
        const h = makeHarness(state);

        await expect(h.cancel()).rejects.toBeInstanceOf(BadRequestException);
        expect(state.trade.status).toBe(TradeStatus.shipping_to_warehouse);
        expect(state.products.p1.reservedQuantity).toBe(1);
        expect(state.outbox).toHaveLength(0);
        expect(h.onCancelled).not.toHaveBeenCalled();
        expect(h.paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
      },
    );

    it("ilk depo varışı damgası → 400", async () => {
      const h = makeHarness(
        makeState({
          status: TradeStatus.shipping_to_warehouse,
          firstWarehouseArrivalAt: T0,
          cancelLockedAt: T0,
        }),
      );
      await expect(h.cancel()).rejects.toBeInstanceOf(BadRequestException);
    });

    it.each([
      TradeStatus.at_warehouse,
      TradeStatus.admin_reviewing,
      TradeStatus.shipping_to_recipients,
      TradeStatus.returning,
      TradeStatus.disputed,
      TradeStatus.both_shipped,
      TradeStatus.initiator_shipped,
    ])("%s → 400 (kendi admin aksiyonu var)", async (status) => {
      const h = makeHarness(makeState({ status }));
      await expect(h.cancel()).rejects.toBeInstanceOf(BadRequestException);
      expect(h.onCancelled).not.toHaveBeenCalled();
    });

    it.each([TradeStatus.completed, TradeStatus.rejected])(
      "%s → 409",
      async (status) => {
        const h = makeHarness(makeState({ status }));
        await expect(h.cancel()).rejects.toBeInstanceOf(ConflictException);
      },
    );

    it("takas yoksa 404", async () => {
      const h = makeHarness(makeState());
      await expect(
        h.service.cancel("nope", "stock_error", { onCancelled: h.onCancelled }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("önizleme de aynı engeli verir", async () => {
      const h = makeHarness(makeState({ status: TradeStatus.at_warehouse }));
      await expect(h.service.preview("t1")).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe("yarışlar ve idempotency", () => {
    it("çift gönderim: ikinci çağrı yeni iptal, duyuru, denetim ya da ikinci iade üretmez", async () => {
      const h = makeHarness(makeState());

      const [first, second] = await Promise.all([h.cancel(), h.cancel()]);

      expect(first.alreadyCancelled).toBe(false);
      expect(second.alreadyCancelled).toBe(true);
      expect(h.onCancelled).toHaveBeenCalledTimes(1);
      expect(h.paymentService.refundTradeCashTracked).toHaveBeenCalledTimes(1);
      expect(h.rowsOf(OUTBOX_TRADE_CANCEL_SETTLE)).toHaveLength(1);
      expect(h.rowsOf(OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE)).toHaveLength(4);
    });

    it("taraf önce iptal ettiyse → 409, ikinci iade yok", async () => {
      const h = makeHarness(
        makeState({
          status: TradeStatus.cancelled,
          cancelledBy: CancellationActor.buyer,
        }),
      );
      await expect(h.cancel()).rejects.toBeInstanceOf(ConflictException);
      expect(h.paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
    });

    it("süre dolumu taraması önce iptal ettiyse → 409", async () => {
      const h = makeHarness(
        makeState({
          status: TradeStatus.cancelled,
          cancelledBy: CancellationActor.system,
        }),
      );
      await expect(h.cancel()).rejects.toBeInstanceOf(ConflictException);
    });

    it("önizleme ile onay arasında ödeme tamamlandı (shipping_to_warehouse'a geçti): kilit altında yeniden değerlendirilir, iki taraf da tam iade", async () => {
      const state = makeState();
      const h = makeHarness(state);
      const preview = await h.service.preview("t1");
      expect(preview.refunds[1].refundAmount).toBe(0);

      // Karşı tarafın callback'i commit oldu.
      state.payments[1] = paidRow("u2");
      state.trade.status = TradeStatus.shipping_to_warehouse;
      const result = await h.cancel();

      expect(result.refunds.map((r) => r.refundAmount)).toEqual([230, 230]);
    });

    it("önizleme ile onay arasında koli taşıyıcıya geçti → 400, iptal yok", async () => {
      const state = makeState({ status: TradeStatus.shipping_to_warehouse });
      state.shipments = [
        {
          leg: "to_warehouse",
          status: ShipmentStatus.label_created,
          shippedAt: null,
          deliveredAt: null,
        },
      ];
      const h = makeHarness(state);
      await expect(h.service.preview("t1")).resolves.toBeDefined();

      state.shipments[0] = {
        ...state.shipments[0],
        status: ShipmentStatus.picked_up,
        shippedAt: T0,
      };
      await expect(h.cancel()).rejects.toBeInstanceOf(BadRequestException);
      expect(state.trade.status).toBe(TradeStatus.shipping_to_warehouse);
    });

    it("uzatma hakkı kullanılmış (son tarih ileri alınmış) takas yine iptal edilir — son tarihe bakılmaz", async () => {
      const h = makeHarness(
        makeState({
          paymentExtendedAt: T0,
          paymentDeadline: new Date(T0.getTime() + 48 * 3_600_000),
        }),
      );
      await expect(h.cancel()).resolves.toEqual(
        expect.objectContaining({ alreadyCancelled: false }),
      );
      expect(h.state.trade.status).toBe(TradeStatus.cancelled);
    });

    it("kararı trade → bacak kilidi sırasıyla verir (depo teslim alma ile aynı sıra)", async () => {
      const h = makeHarness(
        makeState({ status: TradeStatus.shipping_to_warehouse }),
      );
      await h.cancel();
      const tradeLock = h.lockLog.findIndex((q) => q.includes("FROM trades"));
      const legLock = h.lockLog.findIndex((q) =>
        q.includes("FROM trade_shipments"),
      );
      expect(tradeLock).toBeGreaterThanOrEqual(0);
      expect(legLock).toBeGreaterThan(tradeLock);
    });
  });

  describe("commit ile iade arasında çökme (dayanıklı commit sonrası iş)", () => {
    /** Süreç commit'ten hemen sonra, anlık yol işi sahiplenemeden ölür. */
    const crashAfterCommit = (h: ReturnType<typeof makeHarness>) =>
      jest
        .spyOn(h.outbox, "runInline")
        .mockRejectedValueOnce(new Error("SIGKILL after commit"));

    it("commit sonrası iş iptalle aynı tx'te pending olarak kuyruğa girer, anlık yol tamamlar", async () => {
      const h = makeHarness(makeState());

      await h.cancel();

      expect(h.rowsOf(OUTBOX_TRADE_CANCEL_SETTLE)).toEqual([
        expect.objectContaining({
          dedupeKey: `${OUTBOX_TRADE_CANCEL_SETTLE}:t1`,
          payload: { tradeId: "t1" },
          status: OutboxStatus.completed,
        }),
      ]);
      // Drainer tamamlanmış işi tekrar çalıştırmaz.
      await h.drain();
      expect(h.paymentService.refundTradeCashTracked).toHaveBeenCalledTimes(1);
    });

    it("çökme: iade hiç denenmedi; drainer iadeyi yapar ve etiketleri iptal eder", async () => {
      const h = makeHarness(makeState());
      crashAfterCommit(h);

      await expect(h.cancel()).rejects.toThrow("SIGKILL after commit");
      expect(h.state.trade.status).toBe(TradeStatus.cancelled);
      expect(h.paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
      expect(h.rowsOf(OUTBOX_TRADE_CANCEL_SETTLE)[0].status).toBe(
        OutboxStatus.pending,
      );

      await h.drain();

      expect(h.paymentService.refundTradeCashTracked).toHaveBeenCalledTimes(1);
      expect(h.paymentService.refundTradeCashTracked).toHaveBeenCalledWith(
        "t1",
      );
      expect(h.tradeShipment.cancelSuratShipmentsForTrade).toHaveBeenCalledWith(
        "t1",
      );
      expect(h.rowsOf(OUTBOX_TRADE_CANCEL_SETTLE)[0].status).toBe(
        OutboxStatus.completed,
      );
    });

    it("çökme sonrası admin yeniden gönderirse bekleyen iş o istekte tamamlanır; drainer ikinci kez çalıştırmaz", async () => {
      const h = makeHarness(makeState());
      crashAfterCommit(h);
      await expect(h.cancel()).rejects.toThrow();

      const retry = await h.cancel();

      expect(retry.alreadyCancelled).toBe(true);
      expect(retry.refundOutcome).toEqual({ refunded: true, failed: false });
      expect(h.onCancelled).toHaveBeenCalledTimes(1);
      expect(h.paymentService.refundTradeCashTracked).toHaveBeenCalledTimes(1);
      expect(
        h.tradeShipment.cancelSuratShipmentsForTrade,
      ).toHaveBeenCalledTimes(1);

      await h.drain();
      expect(h.paymentService.refundTradeCashTracked).toHaveBeenCalledTimes(1);
    });

    it("drainer işi yürütürken gelen admin tekrarı işi ikinci kez çalıştırmaz", async () => {
      const h = makeHarness(makeState());
      crashAfterCommit(h);
      await expect(h.cancel()).rejects.toThrow();
      h.rowsOf(OUTBOX_TRADE_CANCEL_SETTLE)[0].status = OutboxStatus.processing;

      const retry = await h.cancel();

      expect(retry.refundOutcome).toBeNull();
      expect(h.paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
    });
  });

  describe("denetim (fail-closed) ve iade hatası", () => {
    it("denetim kancası iptalle aynı tx'te, kayıtla çağrılır", async () => {
      const h = makeHarness(makeState());
      await h.cancel("user_request");

      expect(h.onCancelled).toHaveBeenCalledTimes(1);
      const [tx, record] = h.onCancelled.mock.calls[0];
      expect(tx).toBe(h.db);
      expect(record).toEqual({
        tradeId: "t1",
        tradeNumber: "TKS-1",
        stageBefore: TradeStatus.awaiting_payment,
        reasonCode: "user_request",
        initiatorId: "u1",
        receiverId: "u2",
        refunds: [
          { userId: "u1", side: "initiator", paid: true, refundAmount: 230 },
          { userId: "u2", side: "receiver", paid: false, refundAmount: 0 },
        ],
        releasedReservations: [
          { productId: "p1", quantity: 1 },
          { productId: "p2", quantity: 1 },
        ],
      });
    });

    it("denetim yazılamazsa iptal, rezervasyon, iade işi ve duyuru geri alınır; iade denenmez", async () => {
      const state = makeState();
      const h = makeHarness(state);
      h.onCancelled.mockRejectedValueOnce(new Error("audit down"));

      await expect(h.cancel()).rejects.toThrow("audit down");

      expect(state.trade.status).toBe(TradeStatus.awaiting_payment);
      expect(state.trade.adminCancelReasonCode).toBeNull();
      expect(state.products.p1.reservedQuantity).toBe(1);
      expect(state.payments.some((p) => p.fullRefundEntitled)).toBe(false);
      expect(state.outbox).toHaveLength(0);
      expect(h.paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
    });

    it("iade sağlayıcıda patlarsa iptal kalır ve sonuç refundFailed=true döner (retry-refund yolu)", async () => {
      const h = makeHarness(makeState());
      h.paymentService.refundTradeCashTracked.mockResolvedValueOnce({
        refunded: false,
        failed: true,
        reason: "PayTR timeout",
      });

      const result = await h.cancel();

      expect(h.state.trade.status).toBe(TradeStatus.cancelled);
      expect(result.refundFailed).toBe(true);
      expect(result.refundOutcome).toEqual(
        expect.objectContaining({ failed: true, reason: "PayTR timeout" }),
      );
      // Etiketler yine de iptal edilir.
      expect(h.tradeShipment.cancelSuratShipmentsForTrade).toHaveBeenCalledWith(
        "t1",
      );
    });
  });

  describe("duyuru (outbox, alıcı × kanal)", () => {
    const noticeRows = (h: ReturnType<typeof makeHarness>) =>
      h
        .rowsOf(OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE)
        .map((row) => row.payload as TradePlatformCancelNoticePayload);

    it("iptalle aynı tx'te her taraf × kanal için bir, nottan arınmış satır kuyruğa alınır", async () => {
      const h = makeHarness(makeState());
      await h.cancel("other");

      expect(noticeRows(h)).toEqual([
        { tradeId: "t1", userId: "u1", refundAmount: 230, channel: "in_app" },
        { tradeId: "t1", userId: "u1", refundAmount: 230, channel: "email" },
        { tradeId: "t1", userId: "u2", refundAmount: 0, channel: "in_app" },
        { tradeId: "t1", userId: "u2", refundAmount: 0, channel: "email" },
      ]);
      expect(
        h.rowsOf(OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE).map((r) => r.dedupeKey),
      ).toEqual([
        `${OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE}:t1:u1:in_app`,
        `${OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE}:t1:u1:email`,
        `${OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE}:t1:u2:in_app`,
        `${OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE}:t1:u2:email`,
      ]);
      // Duyuru anlık gitmez; yalnız drainer'dan (handler) gider.
      expect(
        h.notificationService.sendTradeCancelledByPlatformNotice,
      ).not.toHaveBeenCalled();
    });

    it("drainer her taraf için tam bir in-app ve bir e-posta gönderir", async () => {
      const h = makeHarness(makeState());
      await h.cancel("stock_error");

      await h.drain();
      await h.drain();

      const sent =
        h.notificationService.sendTradeCancelledByPlatformNotice.mock.calls;
      expect(sent).toHaveLength(4);
      expect(sent.map(([notice]) => notice)).toEqual([
        {
          tradeId: "t1",
          tradeNumber: "TKS-1",
          reasonCode: "stock_error",
          userId: "u1",
          refundAmount: 230,
          channel: "in_app",
        },
        expect.objectContaining({ userId: "u1", channel: "email" }),
        expect.objectContaining({
          userId: "u2",
          channel: "in_app",
          refundAmount: 0,
        }),
        expect.objectContaining({ userId: "u2", channel: "email" }),
      ]);
    });

    it("bir gönderim başarısızsa yalnız o satır yeniden denenir; başarılı olanlar ikinci kez gitmez", async () => {
      const h = makeHarness(makeState());
      await h.cancel();
      const send = h.notificationService.sendTradeCancelledByPlatformNotice;
      send.mockImplementation(
        async (notice: { userId: string; channel: string }) => {
          if (notice.userId === "u1" && notice.channel === "email") {
            throw new Error("smtp down");
          }
        },
      );

      await h.drain();
      expect(send).toHaveBeenCalledTimes(4);
      expect(
        h
          .rowsOf(OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE)
          .filter((row) => row.status === OutboxStatus.pending)
          .map((row) => row.dedupeKey),
      ).toEqual([`${OUTBOX_TRADE_PLATFORM_CANCEL_NOTICE}:t1:u1:email`]);

      send.mockResolvedValue(undefined);
      await h.drain();
      expect(send).toHaveBeenCalledTimes(5);
      expect(send.mock.calls[4][0]).toEqual(
        expect.objectContaining({ userId: "u1", channel: "email" }),
      );
    });

    it("gönderimden ÖNCEKİ bir hata (takas okunamadı) fırlatılır → outbox yeniden dener", async () => {
      const h = makeHarness(makeState());
      await h.cancel();
      h.db.trade.findUnique.mockRejectedValueOnce(new Error("db down"));

      await expect(
        h.service.sendCancellationNotice(noticeRows(h)[0]),
      ).rejects.toThrow("db down");
      expect(
        h.notificationService.sendTradeCancelledByPlatformNotice,
      ).not.toHaveBeenCalled();
    });

    it("takas platform iptali değilse handler kimseye duyuru göndermez", async () => {
      const h = makeHarness(
        makeState({
          status: TradeStatus.cancelled,
          cancelledBy: CancellationActor.system,
        }),
      );
      await h.service.sendCancellationNotice({
        tradeId: "t1",
        userId: "u1",
        refundAmount: 0,
        channel: "in_app",
      });
      expect(
        h.notificationService.sendTradeCancelledByPlatformNotice,
      ).not.toHaveBeenCalled();
    });
  });

  describe("önizleme", () => {
    it("taraf başına iade, serbest kalacak ürünler ve iptal edilecek etiketler", async () => {
      const state = makeState({ status: TradeStatus.shipping_to_warehouse });
      state.payments = [paidRow("u1"), paidRow("u2")];
      state.shipments = [
        {
          leg: "to_warehouse",
          status: ShipmentStatus.label_created,
          shippedAt: null,
          deliveredAt: null,
        },
        {
          leg: "to_warehouse",
          status: ShipmentStatus.cancelled,
          shippedAt: null,
          deliveredAt: null,
        },
      ];
      const h = makeHarness(state);

      await expect(h.service.preview("t1")).resolves.toEqual({
        tradeId: "t1",
        tradeNumber: "TKS-1",
        status: TradeStatus.shipping_to_warehouse,
        refunds: [
          { userId: "u1", side: "initiator", paid: true, refundAmount: 230 },
          { userId: "u2", side: "receiver", paid: true, refundAmount: 230 },
        ],
        refundTotal: 460,
        releasedItems: [
          {
            productId: "p1",
            title: "Ferrari 1:18",
            side: "initiator",
            quantity: 1,
          },
          {
            productId: "p2",
            title: "Porsche 1:43",
            side: "receiver",
            quantity: 1,
          },
        ],
        labelsToCancel: 1,
      });
      // Önizleme hiçbir şey yazmaz.
      expect(h.db.trade.update).not.toHaveBeenCalled();
    });

    it("pending: rezervasyon olmadığı için serbest kalacak ürün listesi boş", async () => {
      const h = makeHarness(makeState({ status: TradeStatus.pending }));
      const preview = await h.service.preview("t1");
      expect(preview.releasedItems).toEqual([]);
    });
  });
});
