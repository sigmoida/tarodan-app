import {
  CancellationActor,
  PaymentStatus,
  ProductStatus,
  TradeStatus,
} from "@prisma/client";
import { NotificationType } from "../../notification/dto";
import { TRADE_CANCEL_REASON } from "../helpers/trade-cancel-reasons";
import { TradeDeadlineExtensionService } from "./trade-deadline-extension.service";
import { TradeReconciliationService } from "./trade-reconciliation.service";

/**
 * Süreler ve Kurallar → tradeResponseHours / tradePaymentHours eylemi.
 *   - cancel (varsayılan): süresi dolan takas bugünkü yolla iptal edilir.
 *   - extend_once: aşama başına BİR kez, "şimdi + o anki süre" kadar uzatılır;
 *     hak `responseExtendedAt` / `paymentExtendedAt` ile kayda yazılır; ikinci
 *     dolumda mevcut iptal yolu DEĞİŞMEDEN çalışır.
 * Bellek içi sahte tablo where koşullarını gerçekten değerlendirir ve
 * `$transaction` satır kilidini (FOR UPDATE) taklit eden bir sıraya sokar.
 */
describe("TradeReconciliationService — extend_once (yanıt / ödeme)", () => {
  const T0 = new Date("2026-10-05T12:00:00.000Z");
  const HOUR = 60 * 60 * 1000;

  beforeEach(() => jest.useFakeTimers().setSystemTime(T0));
  afterEach(() => jest.useRealTimers());

  interface TradeRow {
    id: string;
    tradeNumber: string;
    status: TradeStatus;
    initiatorId: string;
    receiverId: string;
    responseDeadline: Date;
    paymentDeadline: Date | null;
    shippingDeadline: Date | null;
    responseExtendedAt: Date | null;
    paymentExtendedAt: Date | null;
    firstWarehouseArrivalAt: Date | null;
    cancelReason?: string | null;
    cancelledBy?: CancellationActor | null;
  }

  const pendingTrade = (patch: Partial<TradeRow> = {}): TradeRow => ({
    id: "t1",
    tradeNumber: "TKS-1",
    status: TradeStatus.pending,
    initiatorId: "u1",
    receiverId: "u2",
    responseDeadline: new Date(T0.getTime() - 60_000),
    paymentDeadline: null,
    shippingDeadline: null,
    responseExtendedAt: null,
    paymentExtendedAt: null,
    firstWarehouseArrivalAt: null,
    ...patch,
  });

  const awaitingPaymentTrade = (patch: Partial<TradeRow> = {}): TradeRow =>
    pendingTrade({
      status: TradeStatus.awaiting_payment,
      responseDeadline: new Date(T0.getTime() - 100 * HOUR),
      paymentDeadline: new Date(T0.getTime() - 60_000),
      ...patch,
    });

  const DEADLINE_KEYS = [
    "responseDeadline",
    "paymentDeadline",
    "shippingDeadline",
  ] as const;
  const matchTrade = (row: TradeRow, where: Record<string, any>): boolean =>
    Object.entries(where).every(([key, value]) => {
      if (key === "id") return row.id === value;
      if (key === "status") return row.status === value;
      if ((DEADLINE_KEYS as readonly string[]).includes(key)) {
        const current = (row as any)[key] as Date | null;
        return current instanceof Date && current < value.lt;
      }
      if (
        value === null &&
        [
          "responseExtendedAt",
          "paymentExtendedAt",
          "firstWarehouseArrivalAt",
        ].includes(key)
      ) {
        return (row as any)[key] === null;
      }
      // shipments / OR (kargo ve stuck sorguları) bu spec'te boş kümeye düşer.
      return true;
    });

  interface HarnessOptions {
    settings?: Record<string, string>;
    paymentRows?: Array<{ payerId: string; status: PaymentStatus }>;
    users?: Array<{ id: string; isBanned: boolean; deletedAt: Date | null }>;
    products?: Array<{
      id: string;
      status: ProductStatus;
      quantity: number | null;
      reservedQuantity: number | null;
    }>;
    blocked?: boolean;
    /** Hak talebi hep kaybedilir (başka tur kazanmış gibi). */
    loseClaim?: boolean;
  }

  const makeHarness = (trades: TradeRow[], options: HarnessOptions = {}) => {
    const settings = options.settings ?? {};
    const paymentRows = options.paymentRows ?? [];
    const users = options.users ?? [
      { id: "u1", isBanned: false, deletedAt: null },
      { id: "u2", isBanned: false, deletedAt: null },
    ];
    const products = options.products ?? [
      {
        id: "p1",
        status: ProductStatus.active,
        quantity: null,
        reservedQuantity: 0,
      },
    ];
    // Satır kilidi (FOR UPDATE) taklidi: işlemler sırayla çalışır.
    let lock: Promise<unknown> = Promise.resolve();

    const events: string[] = [];
    const productUpdates: Array<{ id: string; reservedQuantity: number }> = [];
    const refundEntitlements: string[] = [];

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      trade: {
        findUnique: jest.fn(async ({ where }: any) => {
          const row = trades.find((trade) => trade.id === where.id);
          return row ? { ...row } : null;
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (options.loseClaim) return { count: 0 };
          const hit = trades.filter((trade) => matchTrade(trade, where));
          for (const row of hit) {
            Object.assign(row, data);
            events.push(
              row.id + ":" + (data.responseExtendedAt ? "response" : "payment"),
            );
          }
          return { count: hit.length };
        }),
        update: jest.fn(async ({ where, data }: any) => {
          const row = trades.find((trade) => trade.id === where.id)!;
          Object.assign(row, data);
          events.push(row.id + ":cancelled");
          return row;
        }),
      },
      tradeItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ productId: "p1", quantity: 1 }]),
      },
      tradeShipment: { findFirst: jest.fn().mockResolvedValue(null) },
      product: {
        findUnique: jest.fn().mockResolvedValue({ reservedQuantity: 1 }),
        update: jest.fn(async ({ where, data }: any) => {
          productUpdates.push({
            id: where.id,
            reservedQuantity: data.reservedQuantity,
          });
          return {};
        }),
      },
      tradeCashPayment: {
        updateMany: jest.fn(async ({ data }: any) => {
          if (data.fullRefundEntitled) refundEntitlements.push("entitled");
          return { count: 1 };
        }),
      },
    };

    const prisma = {
      platformSetting: {
        findUnique: jest.fn(
          async ({ where }: { where: { settingKey: string } }) =>
            where.settingKey in settings
              ? { settingValue: settings[where.settingKey], updatedBy: "admin" }
              : null,
        ),
      },
      trade: {
        findMany: jest.fn(async ({ where }: any) =>
          trades
            .filter((row) => matchTrade(row, where))
            .map((row) => ({ ...row })),
        ),
      },
      $transaction: jest.fn((fn: any) => {
        const run = lock.then(() => fn(tx));
        lock = run.catch(() => undefined);
        return run;
      }),
      user: { findMany: jest.fn().mockResolvedValue(users) },
      tradeItem: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ productId: "p1", quantity: 1 }]),
      },
      product: { findMany: jest.fn().mockResolvedValue(products) },
      tradeCashPayment: { findMany: jest.fn().mockResolvedValue(paymentRows) },
    };

    const createInAppNotification = jest.fn().mockResolvedValue(true);
    const userBlocks = {
      isBlockedEither: jest.fn().mockResolvedValue(options.blocked ?? false),
    };
    const paymentService = {
      refundTradeCashTracked: jest.fn().mockResolvedValue(undefined),
    };
    const extension = new TradeDeadlineExtensionService(
      prisma as never,
      userBlocks as never,
      { createInAppNotification } as never,
    );
    const makeService = () => {
      const service = new TradeReconciliationService(
        prisma as never,
        {} as never,
        { createInAppNotification } as never,
        paymentService as never,
        undefined as never,
        { cancelSuratShipmentsForTrade: jest.fn() } as never,
        { invalidateProductCachesForTrade: jest.fn() } as never,
        extension,
      );
      // Bu spec yalnız yanıt/ödeme iptal-uzatma yolunu sınar; yan süpürmeler susturulur.
      Object.assign(service as object, {
        autoResolveLostParcelTrades: jest.fn().mockResolvedValue(0),
        startPendingTradeConfirmationWindows: jest.fn().mockResolvedValue(0),
        notifyAdminsOfUndeliveredOutboundTrades: jest
          .fn()
          .mockResolvedValue(undefined),
      });
      return service;
    };

    return {
      service: makeService(),
      makeService,
      trades,
      settings,
      events,
      productUpdates,
      refundEntitlements,
      createInAppNotification,
      paymentService,
      userBlocks,
      tx,
    };
  };

  const EXTEND_RESPONSE = {
    trade_response_deadline_hours_on_expiry: "extend_once",
  };
  const EXTEND_PAYMENT = {
    trade_payment_deadline_hours_on_expiry: "extend_once",
  };

  describe("yanıt aşaması (pending)", () => {
    it("varsayılan eylem (cancel): süresi dolan takas bugünkü gibi iptal edilir", async () => {
      const h = makeHarness([pendingTrade()]);

      const cancelled = await h.service.autoCancelExpiredTrades();

      expect(cancelled).toBe(1);
      expect(h.trades[0].status).toBe(TradeStatus.cancelled);
      expect(h.trades[0].cancelReason).toBe(TRADE_CANCEL_REASON.autoExpired);
      expect(h.trades[0].responseExtendedAt).toBeNull();
      expect(h.createInAppNotification).not.toHaveBeenCalled();
      expect(h.paymentService.refundTradeCashTracked).toHaveBeenCalledWith(
        "t1",
      );
    });

    it("extend_once: bir tam yanıt süresi uzatır, hakkı yazar, alıcıyı bilgilendirir; iptal etmez", async () => {
      const h = makeHarness([pendingTrade()], { settings: EXTEND_RESPONSE });

      const cancelled = await h.service.autoCancelExpiredTrades();

      const trade = h.trades[0];
      expect(cancelled).toBe(0);
      expect(trade.status).toBe(TradeStatus.pending);
      // Varsayılan yanıt süresi 72 saat: "şimdi + 72s".
      expect(trade.responseDeadline).toEqual(
        new Date(T0.getTime() + 72 * HOUR),
      );
      expect(trade.responseExtendedAt).toEqual(T0);
      expect(h.paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
      expect(h.createInAppNotification).toHaveBeenCalledTimes(1);
      expect(h.createInAppNotification).toHaveBeenCalledWith(
        "u2",
        NotificationType.TRADE_RESPONSE_EXTENDED,
        {
          tradeId: "t1",
          until: expect.stringMatching(/^\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$/),
          untilAt: new Date(T0.getTime() + 72 * HOUR).toISOString(),
        },
      );
    });

    it("bir kez uzatılır, ikinci dolumda mevcut iptal yolu çalışır", async () => {
      const h = makeHarness([pendingTrade()], { settings: EXTEND_RESPONSE });
      await h.service.autoCancelExpiredTrades();

      // Uzatılan sürenin içinde: dokunulmaz.
      jest.setSystemTime(new Date(T0.getTime() + 10 * HOUR));
      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(0);
      expect(h.trades[0].status).toBe(TradeStatus.pending);

      // İkinci dolum: eylem hâlâ extend_once ama hak kullanıldı → iptal.
      jest.setSystemTime(new Date(T0.getTime() + 73 * HOUR));
      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(1);

      expect(h.trades[0].status).toBe(TradeStatus.cancelled);
      expect(h.trades[0].cancelReason).toBe(TRADE_CANCEL_REASON.autoExpired);
      expect(h.trades[0].cancelledBy).toBe(CancellationActor.system);
      expect(h.createInAppNotification).toHaveBeenCalledTimes(1);
      expect(h.events.filter((e) => e.endsWith(":response"))).toHaveLength(1);
    });

    it("uzatma süresi, uzatma ANINDAKİ trade_response_deadline_hours değeridir", async () => {
      const h = makeHarness([pendingTrade()], {
        settings: { ...EXTEND_RESPONSE, trade_response_deadline_hours: "10" },
      });

      await h.service.autoCancelExpiredTrades();

      expect(h.trades[0].responseDeadline).toEqual(
        new Date(T0.getTime() + 10 * HOUR),
      );
    });

    it("kalem artık satışta değilse uzatılmaz, iptal edilir", async () => {
      const h = makeHarness([pendingTrade()], {
        settings: EXTEND_RESPONSE,
        products: [
          {
            id: "p1",
            status: ProductStatus.sold,
            quantity: null,
            reservedQuantity: 0,
          },
        ],
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(1);

      expect(h.trades[0].status).toBe(TradeStatus.cancelled);
      expect(h.trades[0].responseExtendedAt).toBeNull();
    });

    it("kalemin müsait adedi kalmadıysa uzatılmaz", async () => {
      const h = makeHarness([pendingTrade()], {
        settings: EXTEND_RESPONSE,
        products: [
          {
            id: "p1",
            status: ProductStatus.active,
            quantity: 1,
            reservedQuantity: 1,
          },
        ],
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(1);
    });

    it.each([
      [
        "taraf yasaklı",
        [
          { id: "u1", isBanned: true, deletedAt: null },
          { id: "u2", isBanned: false, deletedAt: null },
        ],
      ],
      [
        "taraf silinmiş",
        [
          { id: "u1", isBanned: false, deletedAt: T0 },
          { id: "u2", isBanned: false, deletedAt: null },
        ],
      ],
      ["taraf satırı eksik", [{ id: "u1", isBanned: false, deletedAt: null }]],
    ])("%s ise uzatılmaz, iptal edilir", async (_label, users) => {
      const h = makeHarness([pendingTrade()], {
        settings: EXTEND_RESPONSE,
        users,
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(1);
      expect(h.trades[0].responseExtendedAt).toBeNull();
    });

    it("taraflar arasında engel varsa uzatılmaz, iptal edilir", async () => {
      const h = makeHarness([pendingTrade()], {
        settings: EXTEND_RESPONSE,
        blocked: true,
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(1);
      expect(h.userBlocks.isBlockedEither).toHaveBeenCalledWith("u1", "u2");
    });

    it("eşzamanlı iki tur takası iki kez uzatmaz ve uzatılanı iptal etmez", async () => {
      const h = makeHarness([pendingTrade()], { settings: EXTEND_RESPONSE });
      const other = h.makeService();

      const [a, b] = await Promise.all([
        h.service.autoCancelExpiredTrades(),
        other.autoCancelExpiredTrades(),
      ]);

      expect(a + b).toBe(0);
      expect(h.trades[0].status).toBe(TradeStatus.pending);
      expect(h.events).toEqual(["t1:response"]);
      expect(h.createInAppNotification).toHaveBeenCalledTimes(1);
      expect(h.paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
    });

    it("hak talebi kaybedilirse takas ne uzatılır ne iptal edilir (atlanır)", async () => {
      const h = makeHarness([pendingTrade()], {
        settings: EXTEND_RESPONSE,
        loseClaim: true,
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(0);

      expect(h.tx.trade.update).not.toHaveBeenCalled();
      expect(h.createInAppNotification).not.toHaveBeenCalled();
      expect(h.paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
    });

    it("anlık görüntüden sonra yanıt süresi ileri alındıysa (karşı teklif) iptal edilmez", async () => {
      const h = makeHarness([pendingTrade()]);
      // Anlık görüntü eski süreyle okunur; kilitli tx'te satır yeniden damgalanmış.
      h.tx.trade.findUnique.mockResolvedValueOnce({
        ...h.trades[0],
        responseDeadline: new Date(T0.getTime() + 72 * HOUR),
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(0);
      expect(h.tx.trade.update).not.toHaveBeenCalled();
    });

    it("eylem yolda değişir: karar süre dolduğu andaki eyleme göredir", async () => {
      const h = makeHarness(
        [
          pendingTrade({
            responseDeadline: new Date(T0.getTime() + 1 * HOUR),
          }),
        ],
        { settings: { trade_response_deadline_hours_on_expiry: "cancel" } },
      );

      // Dolmadan önce tur dokunmaz.
      jest.setSystemTime(new Date(T0.getTime() + 30 * 60_000));
      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(0);

      // Admin dolumdan ÖNCE eylemi extend_once yapar → damgalı son tarih
      // yeniden yazılmadı, dolunca uzatılır.
      h.settings.trade_response_deadline_hours_on_expiry = "extend_once";
      expect(h.trades[0].responseDeadline).toEqual(
        new Date(T0.getTime() + 1 * HOUR),
      );
      jest.setSystemTime(new Date(T0.getTime() + 2 * HOUR));
      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(0);
      expect(h.trades[0].responseExtendedAt).toEqual(
        new Date(T0.getTime() + 2 * HOUR),
      );

      // Uzatıldıktan sonra admin eylemi cancel'a çevirir; ikinci dolumda iptal.
      h.settings.trade_response_deadline_hours_on_expiry = "cancel";
      jest.setSystemTime(new Date(T0.getTime() + 80 * HOUR));
      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(1);
      expect(h.trades[0].status).toBe(TradeStatus.cancelled);
    });

    it("eylem extend_once iken dolumdan önce cancel'a çevrilirse uzatılmaz", async () => {
      const h = makeHarness(
        [
          pendingTrade({
            responseDeadline: new Date(T0.getTime() + 1 * HOUR),
          }),
        ],
        { settings: EXTEND_RESPONSE },
      );

      h.settings.trade_response_deadline_hours_on_expiry = "cancel";
      jest.setSystemTime(new Date(T0.getTime() + 2 * HOUR));
      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(1);

      expect(h.trades[0].responseExtendedAt).toBeNull();
    });
  });

  describe("ödeme aşaması (awaiting_payment)", () => {
    const BOTH_PENDING = [
      { payerId: "u1", status: PaymentStatus.pending },
      { payerId: "u2", status: PaymentStatus.pending },
    ];
    const ONE_PAID = [
      { payerId: "u1", status: PaymentStatus.completed },
      { payerId: "u2", status: PaymentStatus.pending },
    ];

    it("varsayılan eylem (cancel): rezervasyon çözülür, ödenen taraf kusursuz sayılır, iade tetiklenir", async () => {
      const h = makeHarness([awaitingPaymentTrade()], {
        paymentRows: ONE_PAID,
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(1);

      expect(h.trades[0].status).toBe(TradeStatus.cancelled);
      expect(h.productUpdates).toEqual([{ id: "p1", reservedQuantity: 0 }]);
      expect(h.refundEntitlements).toEqual(["entitled"]);
      expect(h.paymentService.refundTradeCashTracked).toHaveBeenCalledWith(
        "t1",
      );
      expect(h.createInAppNotification).not.toHaveBeenCalled();
    });

    it("extend_once: yalnız ödemeyen tarafı bilgilendirir; rezervasyon ve alınan ödeme dokunulmaz", async () => {
      const h = makeHarness([awaitingPaymentTrade()], {
        settings: EXTEND_PAYMENT,
        paymentRows: ONE_PAID,
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(0);

      const trade = h.trades[0];
      expect(trade.status).toBe(TradeStatus.awaiting_payment);
      // Varsayılan ödeme süresi 48 saat.
      expect(trade.paymentDeadline).toEqual(new Date(T0.getTime() + 48 * HOUR));
      expect(trade.paymentExtendedAt).toEqual(T0);
      // Yanıt aşamasının hakkı bu aşamadan bağımsızdır.
      expect(trade.responseExtendedAt).toBeNull();
      // Para / stok: hiçbir şey çözülmedi.
      expect(h.productUpdates).toEqual([]);
      expect(h.refundEntitlements).toEqual([]);
      expect(h.paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
      expect(h.createInAppNotification).toHaveBeenCalledTimes(1);
      expect(h.createInAppNotification).toHaveBeenCalledWith(
        "u2",
        NotificationType.TRADE_PAYMENT_EXTENDED,
        expect.objectContaining({ tradeId: "t1" }),
      );
    });

    it("iki taraf da ödemediyse ikisine de hatırlatılır", async () => {
      const h = makeHarness([awaitingPaymentTrade()], {
        settings: EXTEND_PAYMENT,
        paymentRows: BOTH_PENDING,
      });

      await h.service.autoCancelExpiredTrades();

      expect(
        h.createInAppNotification.mock.calls.map((call) => call[0]).sort(),
      ).toEqual(["u1", "u2"]);
    });

    it("bir kez uzatılır; ikinci dolumda iptal, rezervasyon çözümü ve kusursuz taraf iadesi aynen çalışır", async () => {
      const h = makeHarness([awaitingPaymentTrade()], {
        settings: EXTEND_PAYMENT,
        paymentRows: ONE_PAID,
      });
      await h.service.autoCancelExpiredTrades();

      jest.setSystemTime(new Date(T0.getTime() + 49 * HOUR));
      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(1);

      expect(h.trades[0].status).toBe(TradeStatus.cancelled);
      expect(h.trades[0].cancelReason).toBe(TRADE_CANCEL_REASON.autoExpired);
      expect(h.productUpdates).toEqual([{ id: "p1", reservedQuantity: 0 }]);
      expect(h.refundEntitlements).toEqual(["entitled"]);
      expect(h.paymentService.refundTradeCashTracked).toHaveBeenCalledTimes(1);
      expect(h.events.filter((e) => e.endsWith(":payment"))).toHaveLength(1);
    });

    it("tüm ödemeler tamamlanmış ama takas hâlâ ödeme bekliyorsa UZATILMAZ (mevcut yol çalışır)", async () => {
      const h = makeHarness([awaitingPaymentTrade()], {
        settings: EXTEND_PAYMENT,
        paymentRows: [
          { payerId: "u1", status: PaymentStatus.completed },
          { payerId: "u2", status: PaymentStatus.completed },
        ],
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(1);
      expect(h.trades[0].paymentExtendedAt).toBeNull();
    });

    it("iade edilmiş bir ödeme satırı varsa UZATILMAZ", async () => {
      const h = makeHarness([awaitingPaymentTrade()], {
        settings: EXTEND_PAYMENT,
        paymentRows: [
          { payerId: "u1", status: PaymentStatus.refunded },
          { payerId: "u2", status: PaymentStatus.pending },
        ],
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(1);
      expect(h.trades[0].paymentExtendedAt).toBeNull();
    });

    it("ödeme satırı yoksa UZATILMAZ", async () => {
      const h = makeHarness([awaitingPaymentTrade()], {
        settings: EXTEND_PAYMENT,
        paymentRows: [],
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(1);
    });

    it("açık PayTR oturumu (processing) ve başarısız satır bekleyen sayılır: uzatılır", async () => {
      const h = makeHarness([awaitingPaymentTrade()], {
        settings: EXTEND_PAYMENT,
        paymentRows: [
          { payerId: "u1", status: PaymentStatus.processing },
          { payerId: "u2", status: PaymentStatus.failed },
        ],
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(0);
      expect(h.trades[0].paymentExtendedAt).toEqual(T0);
    });

    it("taraf yasaklıysa uzatılmaz, iptal edilir", async () => {
      const h = makeHarness([awaitingPaymentTrade()], {
        settings: EXTEND_PAYMENT,
        paymentRows: ONE_PAID,
        users: [
          { id: "u1", isBanned: false, deletedAt: null },
          { id: "u2", isBanned: true, deletedAt: null },
        ],
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(1);
    });

    it("eşzamanlı iki tur ödeme süresini iki kez uzatmaz", async () => {
      const h = makeHarness([awaitingPaymentTrade()], {
        settings: EXTEND_PAYMENT,
        paymentRows: ONE_PAID,
      });
      const other = h.makeService();

      const [a, b] = await Promise.all([
        h.service.autoCancelExpiredTrades(),
        other.autoCancelExpiredTrades(),
      ]);

      expect(a + b).toBe(0);
      expect(h.events).toEqual(["t1:payment"]);
      expect(h.createInAppNotification).toHaveBeenCalledTimes(1);
      expect(h.paymentService.refundTradeCashTracked).not.toHaveBeenCalled();
    });

    it("anlık görüntüden sonra ödeme tamamlanıp takas ilerlediyse (statü değişti) dokunulmaz", async () => {
      const h = makeHarness([awaitingPaymentTrade()], {
        settings: EXTEND_PAYMENT,
        paymentRows: ONE_PAID,
      });
      h.tx.trade.findUnique.mockResolvedValueOnce({
        ...h.trades[0],
        status: TradeStatus.shipping_to_warehouse,
      });

      await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(0);
      expect(h.trades[0].paymentExtendedAt).toBeNull();
      expect(h.tx.trade.update).not.toHaveBeenCalled();
    });

    it("uzatma satır sürümünü (version) oynatmaz: ödeme geçişinin version guard'ı bozulmaz", async () => {
      const h = makeHarness([awaitingPaymentTrade()], {
        settings: EXTEND_PAYMENT,
        paymentRows: ONE_PAID,
      });

      await h.service.autoCancelExpiredTrades();

      const claim = h.tx.trade.updateMany.mock.calls[0][0];
      expect(claim.data).not.toHaveProperty("version");
    });
  });

  it("yanıt ve ödeme aşamalarının hakları birbirinden bağımsızdır", async () => {
    // Takas daha önce yanıt aşamasında uzatılmış, şimdi ödeme aşamasında dolmuş.
    const h = makeHarness(
      [
        awaitingPaymentTrade({
          responseExtendedAt: new Date(T0.getTime() - 99 * HOUR),
        }),
      ],
      {
        settings: { ...EXTEND_RESPONSE, ...EXTEND_PAYMENT },
        paymentRows: [{ payerId: "u2", status: PaymentStatus.pending }],
      },
    );

    await expect(h.service.autoCancelExpiredTrades()).resolves.toBe(0);

    expect(h.trades[0].paymentExtendedAt).toEqual(T0);
  });
});
