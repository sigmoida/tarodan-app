import { CancellationActor, OrderStatus } from "@prisma/client";
import { timingActionSettingKey } from "@tarodan/types";
import { NotificationType } from "../../notification/dto/notification.dto";
import { I18nService } from "../../i18n/i18n.service";
import { ORDER_CANCEL_REASON } from "../../order/helpers/order-cancel-reasons";
import { orderCancelledData } from "../../order/helpers/order-cancellation";
import {
  addDaysSkippingSundays,
  formatPreparingDeadline,
  preparingDeadlineApproachingWhere,
} from "../../../common/helpers/preparing-deadline";
import { PaymentExpiryReconciliationService } from "./payment-expiry-reconciliation.service";

/**
 * Hazırlık son tarihi: tek seferlik uzatma (Süreler ve Kurallar →
 * `preparingDeadlineDays` = `extend_once`) ve uyarı öncesi süre
 * (`preparingWarningLeadHours`).
 *
 * Sözleşme:
 *  - Varsayılan eylemde davranış eskisiyle birebir: uzatma yok, iptal + iade
 *    aynı yazımlarla çalışır, uyarı metni aynıdır.
 *  - `extend_once`: ilk dolumda son tarih BİR KEZ tam bir hazırlık süresi
 *    ileri alınır; iade, stok, kupon, defter hiç çalışmaz. İkinci dolumda iptal
 *    + iade değişmeden çalışır.
 *  - Mevcut kapılar aynı sırada: satır kilidi → durum → (yeni) son tarih hâlâ
 *    geçmiş mi → hareket eden koli → eylem.
 *  - Eşzamanlı ya da tekrarlanan turlar siparişi iki kez uzatamaz, hem uzatıp
 *    hem iptal edemez.
 *  - Uzatmadan sonra satıcı yeni son tarihten önce YENİDEN uyarılır.
 *
 * Veritabanı tek bir sipariş satırını tutan bellek içi bir sahtedir; işlemler
 * satır kilidi gibi sıraya girer (`FOR UPDATE` tek satırda budur).
 */

const HOUR = 60 * 60 * 1000;
/** 2026-10-07 çarşamba. */
const T0 = new Date("2026-10-07T09:00:00.000Z");
const EXTEND_ONCE = {
  [timingActionSettingKey("preparingDeadlineDays")]: "extend_once",
};

interface OrderRow {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  quantity: number;
  buyerId: string;
  sellerId: string;
  preparingDeadline: Date | null;
  preparingWarningSentAt: Date | null;
  preparingExtendedAt: Date | null;
  originalPreparingDeadline: Date | null;
  version: number;
  product: {
    id: string;
    title: string;
    quantity: number | null;
    status: string;
    inactiveReason: string | null;
  };
}

type Where = Record<string, unknown>;

/** Süpürmenin kullandığı `where` biçimleri için küçük eşleyici. */
function matches(row: OrderRow, where: Where): boolean {
  const fields = row as unknown as Record<string, unknown>;
  return Object.entries(where).every(([key, condition]) => {
    const value = fields[key];
    if (condition === null) return value === null;
    if (condition instanceof Date) {
      return value instanceof Date && value.getTime() === condition.getTime();
    }
    if (typeof condition === "object") {
      if (!(value instanceof Date)) return false;
      const { gt, lte, lt } = condition as { gt?: Date; lte?: Date; lt?: Date };
      return (
        (!gt || value.getTime() > gt.getTime()) &&
        (!lte || value.getTime() <= lte.getTime()) &&
        (!lt || value.getTime() < lt.getTime())
      );
    }
    return value === condition;
  });
}

function apply(row: OrderRow, data: Record<string, unknown>): void {
  const fields = row as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && "increment" in value) {
      fields[key] =
        (fields[key] as number) + (value as { increment: number }).increment;
    } else {
      fields[key] = value;
    }
  }
}

/** Bayat okuma: tur, satırın o anki kopyasıyla çalışır. */
const snapshot = (row: OrderRow): OrderRow => ({
  ...row,
  product: { ...row.product },
});

/** İki turun süre-dolumu sorgusunu ikisi de yapana kadar bekletir. */
function barrier(parties: number) {
  let arrived = 0;
  let open!: () => void;
  const gate = new Promise<void>((resolve) => (open = resolve));
  return async () => {
    arrived += 1;
    if (arrived >= parties) open();
    await gate;
  };
}

function createStore(overrides: Partial<OrderRow> = {}) {
  const row: OrderRow = {
    id: "o1",
    orderNumber: "ORD-1",
    status: OrderStatus.preparing,
    quantity: 2,
    buyerId: "u-buyer",
    sellerId: "u-seller",
    preparingDeadline: new Date(T0.getTime() - HOUR),
    preparingWarningSentAt: new Date(T0.getTime() - 20 * HOUR),
    preparingExtendedAt: null,
    originalPreparingDeadline: null,
    version: 0,
    product: {
      id: "p1",
      title: "Ürün",
      quantity: 5,
      status: "active",
      inactiveReason: null,
    },
    ...overrides,
  };
  let chain: Promise<unknown> = Promise.resolve();
  return {
    row,
    shipment: null as { status: string; shippedAt: Date | null } | null,
    /** Satır kilidi: işlemler sırayla çalışır. */
    serialize<T>(work: () => Promise<T>): Promise<T> {
      const run = chain.then(work);
      chain = run.catch(() => undefined);
      return run;
    },
  };
}

type Store = ReturnType<typeof createStore>;

function makeRun(
  store: Store,
  settings: Record<string, string> = {},
  options: { expiryBarrier?: () => Promise<void> } = {},
) {
  const order = {
    findMany: jest.fn(async ({ where }: { where: Where }) => {
      const hit = matches(store.row, where) ? [snapshot(store.row)] : [];
      const isExpirySweep =
        (where.preparingDeadline as { lt?: Date } | undefined)?.lt !==
        undefined;
      if (isExpirySweep && options.expiryBarrier) {
        await options.expiryBarrier();
      }
      return hit;
    }),
    findUnique: jest.fn(async () => snapshot(store.row)),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      apply(store.row, data);
      return snapshot(store.row);
    }),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: Where;
        data: Record<string, unknown>;
      }) => {
        if (!matches(store.row, where)) return { count: 0 };
        apply(store.row, data);
        return { count: 1 };
      },
    ),
  };
  const tx = {
    $queryRaw: jest.fn(async () => []),
    order,
    shipment: { findUnique: jest.fn(async () => store.shipment) },
    paymentHold: { updateMany: jest.fn(async () => ({ count: 1 })) },
    refundRequest: { updateMany: jest.fn(async () => ({ count: 0 })) },
    product: { update: jest.fn(async () => ({})) },
  };
  const prisma = {
    order,
    platformSetting: {
      findUnique: jest.fn(
        async ({ where }: { where: { settingKey: string } }) =>
          settings[where.settingKey] === undefined
            ? null
            : {
                settingValue: settings[where.settingKey],
                updatedBy: "admin-1",
              },
      ),
    },
    $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
      store.serialize(() => work(tx)),
    ),
  };
  const notificationService = {
    createInAppNotification: jest.fn(async () => true),
    notifySellerDidNotShipRefunded: jest.fn(async () => undefined),
    notifyCouponReturned: jest.fn(async () => undefined),
    // Alıcı tarafı (zil + push + misafirde gerçek adrese e-posta) bildirim
    // servisinde; adres çözümü order-buyer-contact.spec'te.
    notifyPreparingExtendedBuyer: jest.fn(
      async (_orderId: string, _data: Record<string, string>) => undefined,
    ),
  };
  const paymentRefund = { processRefund: jest.fn(async () => ({})) };
  const commissionLedger = { markWaived: jest.fn(async () => undefined) };
  const cache = { del: jest.fn(async () => undefined) };
  const service = new PaymentExpiryReconciliationService(
    prisma as never,
    cache as never,
    { get: () => undefined } as never,
    notificationService as never,
    commissionLedger as never,
    paymentRefund as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return {
    run: () => service.handleExpiredPreparingOrders(),
    prisma,
    tx,
    notificationService,
    paymentRefund,
    commissionLedger,
  };
}

type Run = ReturnType<typeof makeRun>;

/** Eski (uzatmasız) iptal yazımı — değişmemesi gereken tek iptal biçimi. */
const legacyCancelData = (at: Date) => ({
  ...orderCancelledData(CancellationActor.system, at),
  cancellationType: "iptal",
  cancelReason: ORDER_CANCEL_REASON.sellerShipDeadlineExpired,
  version: { increment: 1 },
});

/** İptal + iade yolunun tamamı, eskisiyle aynı argümanlarla çalıştı. */
function expectLegacyCancelPath(run: Run, at: Date) {
  expect(run.tx.order.update).toHaveBeenCalledTimes(1);
  expect(run.tx.order.update).toHaveBeenCalledWith({
    where: { id: "o1" },
    data: legacyCancelData(at),
  });
  expect(run.tx.paymentHold.updateMany).toHaveBeenCalledWith({
    where: { orderId: "o1", status: "held" },
    data: { status: "cancelled" },
  });
  expect(run.commissionLedger.markWaived).toHaveBeenCalledWith(
    "o1",
    "seller_did_not_ship",
    run.tx,
  );
  expect(run.tx.product.update).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { id: "p1" },
      data: expect.objectContaining({ quantity: { increment: 2 } }),
    }),
  );
  expect(run.paymentRefund.processRefund).toHaveBeenCalledWith(
    "o1",
    undefined,
    { cancelledBy: CancellationActor.system },
  );
  expect(
    run.notificationService.notifySellerDidNotShipRefunded,
  ).toHaveBeenCalledWith("u-buyer", "o1");
}

/** Hiçbir para/stok/defter yazımı yapılmadı. */
function expectNoCancelPath(run: Run) {
  expect(run.tx.order.update).not.toHaveBeenCalled();
  expect(run.tx.paymentHold.updateMany).not.toHaveBeenCalled();
  expect(run.tx.refundRequest.updateMany).not.toHaveBeenCalled();
  expect(run.tx.product.update).not.toHaveBeenCalled();
  expect(run.commissionLedger.markWaived).not.toHaveBeenCalled();
  expect(run.paymentRefund.processRefund).not.toHaveBeenCalled();
  expect(
    run.notificationService.notifySellerDidNotShipRefunded,
  ).not.toHaveBeenCalled();
}

const notificationsOf = (run: Run, type: NotificationType) =>
  (
    run.notificationService.createInAppNotification.mock.calls as unknown as [
      string,
      NotificationType,
      Record<string, unknown>,
    ][]
  ).filter(([, sentType]) => sentType === type);

describe("hazırlık son tarihi — uyarı ve tek seferlik uzatma", () => {
  beforeEach(() => {
    // Yalnız saat sahte: söz zinciri ve mikro görevler gerçek kalır.
    jest.useFakeTimers({
      doNotFake: [
        "nextTick",
        "queueMicrotask",
        "setImmediate",
        "clearImmediate",
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
      ],
    });
    jest.setSystemTime(T0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("varsayılan eylem (ayar yok) — eski davranış birebir", () => {
    it("süresi dolan siparişi uzatmadan iptal eder ve iade eder", async () => {
      const store = createStore();
      const run = makeRun(store);

      await expect(run.run()).resolves.toEqual({
        warned: 0,
        extended: 0,
        cancelled: 1,
      });

      expectLegacyCancelPath(run, T0);
      expect(run.tx.order.updateMany).not.toHaveBeenCalled();
      expect(
        run.notificationService.createInAppNotification,
      ).not.toHaveBeenCalled();
      expect(
        run.notificationService.notifyPreparingExtendedBuyer,
      ).not.toHaveBeenCalled();
      expect(store.row.preparingExtendedAt).toBeNull();
      expect(store.row.originalPreparingDeadline).toBeNull();
    });

    it("uzatma süresini hiç okumaz (yalnız uyarı süresi + eylem)", async () => {
      const run = makeRun(createStore());
      await run.run();
      const keys = run.prisma.platformSetting.findUnique.mock.calls.map(
        ([args]) =>
          (args as { where: { settingKey: string } }).where.settingKey,
      );
      expect(keys.sort()).toEqual(
        [
          "preparing_warning_lead_hours",
          timingActionSettingKey("preparingDeadlineDays"),
        ].sort(),
      );
    });

    it("uyarı metni eskisiyle aynıdır (tr ve en)", async () => {
      const store = createStore({
        preparingDeadline: new Date(T0.getTime() + 12 * HOUR),
        preparingWarningSentAt: null,
      });
      const run = makeRun(store);

      await expect(run.run()).resolves.toMatchObject({ warned: 1 });
      const [[, data]] = notificationsOf(
        run,
        NotificationType.ORDER_PREPARING_DEADLINE_WARNING,
      ).map(([userId, , payload]) => [userId, payload] as const);
      expect(data).toMatchObject({ audience: "seller", final: "yes" });

      const i18n = new I18nService();
      const key = "server.notification.orderPreparingDeadlineWarning.message";
      const values = data as Record<string, string>;
      expect(i18n.translate(key, "tr", values)).toBe(
        `"Ürün" siparişini ${values.deadline} tarihine kadar kargoya vermeniz gerekmektedir. Aksi halde sipariş otomatik iptal edilecektir.`,
      );
      expect(i18n.translate(key, "en", values)).toBe(
        `You must ship the order for "Ürün" by ${values.deadline}. Otherwise the order will be cancelled automatically.`,
      );
    });
  });

  describe("uyarı öncesi süre Süreler ve Kurallar'dan okunur", () => {
    it("varsayılan 24 saat: pencere dashboard ile aynı tanımdan gelir", async () => {
      const run = makeRun(createStore());
      await run.run();
      const [[phaseOne]] = run.prisma.order.findMany.mock.calls as unknown as [
        [{ where: Where }],
      ];
      expect(phaseOne.where).toEqual({
        ...preparingDeadlineApproachingWhere(T0, 24),
        preparingWarningSentAt: null,
      });
    });

    it("admin değeri pencereyi taşır", async () => {
      const inside = createStore({
        preparingDeadline: new Date(T0.getTime() + 5 * HOUR),
        preparingWarningSentAt: null,
      });
      const outside = createStore({
        preparingDeadline: new Date(T0.getTime() + 7 * HOUR),
        preparingWarningSentAt: null,
      });
      const settings = { preparing_warning_lead_hours: "6" };

      await expect(makeRun(inside, settings).run()).resolves.toMatchObject({
        warned: 1,
      });
      await expect(makeRun(outside, settings).run()).resolves.toMatchObject({
        warned: 0,
      });
      expect(inside.row.preparingWarningSentAt).toEqual(T0);
      expect(outside.row.preparingWarningSentAt).toBeNull();
    });

    it("uzatma bekleyen siparişte uyarı iptal değil uzatma der", async () => {
      const store = createStore({
        preparingDeadline: new Date(T0.getTime() + 12 * HOUR),
        preparingWarningSentAt: null,
      });
      const run = makeRun(store, EXTEND_ONCE);
      await run.run();
      const [[, , data]] = notificationsOf(
        run,
        NotificationType.ORDER_PREPARING_DEADLINE_WARNING,
      );
      expect(data).toMatchObject({ final: "no" });
    });
  });

  describe("extend_once", () => {
    it("bir kez uzatır, sonra yeniden uyarır, ikinci dolumda iade yolu değişmeden çalışır", async () => {
      const store = createStore();
      const firstDeadline = store.row.preparingDeadline;

      // 1) İlk dolum: uzatma.
      const first = makeRun(store, EXTEND_ONCE);
      await expect(first.run()).resolves.toEqual({
        warned: 0,
        extended: 1,
        cancelled: 0,
      });
      const nextDeadline = addDaysSkippingSundays(T0, 3);
      expect(store.row).toMatchObject({
        status: OrderStatus.preparing,
        preparingDeadline: nextDeadline,
        originalPreparingDeadline: firstDeadline,
        preparingExtendedAt: T0,
        // Uyarı damgası temizlendi: yeni son tarihten önce yeniden uyarılır.
        preparingWarningSentAt: null,
        version: 1,
      });
      expectNoCancelPath(first);

      const [[sellerId, , sellerData]] = notificationsOf(
        first,
        NotificationType.ORDER_PREPARING_EXTENDED_SELLER,
      );
      expect(sellerId).toBe("u-seller");
      const expectedData = {
        orderNumber: "ORD-1",
        productTitle: "Ürün",
        deadline: formatPreparingDeadline(nextDeadline),
      };
      expect(sellerData).toEqual({
        orderId: "o1",
        ...expectedData,
        audience: "seller",
      });
      // Alıcı: sipariş üzerinden (misafirde gerçek adrese e-posta dahil).
      expect(
        first.notificationService.notifyPreparingExtendedBuyer,
      ).toHaveBeenCalledWith("o1", expectedData);
      expect(
        first.notificationService.notifyPreparingExtendedBuyer,
      ).toHaveBeenCalledTimes(1);

      // 2) Aynı anda tekrar koşan tur: son tarih ileride, dokunmaz.
      const repeat = makeRun(store, EXTEND_ONCE);
      await expect(repeat.run()).resolves.toEqual({
        warned: 0,
        extended: 0,
        cancelled: 0,
      });
      expect(store.row.version).toBe(1);

      // 3) Yeni son tarihten 12 saat önce: satıcı YENİDEN uyarılır, bu kez
      //    "son süre" (uzatma kullanıldı → dolunca iptal).
      const warnAt = new Date(nextDeadline.getTime() - 12 * HOUR);
      jest.setSystemTime(warnAt);
      const warning = makeRun(store, EXTEND_ONCE);
      await expect(warning.run()).resolves.toMatchObject({ warned: 1 });
      const [[, , warningData]] = notificationsOf(
        warning,
        NotificationType.ORDER_PREPARING_DEADLINE_WARNING,
      );
      expect(warningData).toMatchObject({
        deadline: formatPreparingDeadline(nextDeadline),
        final: "yes",
      });
      expect(store.row.preparingWarningSentAt).toEqual(warnAt);

      // 4) İkinci dolum: eski iptal + iade yolu, aynı yazımlarla.
      const cancelAt = new Date(nextDeadline.getTime() + HOUR);
      jest.setSystemTime(cancelAt);
      const second = makeRun(store, EXTEND_ONCE);
      await expect(second.run()).resolves.toEqual({
        warned: 0,
        extended: 0,
        cancelled: 1,
      });
      expectLegacyCancelPath(second, cancelAt);
      expect(second.tx.order.updateMany).not.toHaveBeenCalled();
      expect(store.row.status).toBe(OrderStatus.cancelled);
      expect(store.row.preparingExtendedAt).toEqual(T0);
    });

    it("koli taşıyıcıda hareket ediyorsa uzatmaz (mevcut atlama kazanır)", async () => {
      const store = createStore();
      store.shipment = { status: "in_transit", shippedAt: null };
      const before = snapshot(store.row);
      const run = makeRun(store, EXTEND_ONCE);

      await expect(run.run()).resolves.toEqual({
        warned: 0,
        extended: 0,
        cancelled: 0,
      });
      expect(run.tx.order.updateMany).not.toHaveBeenCalled();
      expect(
        run.notificationService.createInAppNotification,
      ).not.toHaveBeenCalled();
      expect(
        run.notificationService.notifyPreparingExtendedBuyer,
      ).not.toHaveBeenCalled();
      expectNoCancelPath(run);
      expect(store.row).toEqual(before);
    });

    it("kapılar sırayla: kilit → durum/son tarih → koli → uzatma", async () => {
      const run = makeRun(createStore(), EXTEND_ONCE);
      await run.run();
      const order = [
        run.tx.$queryRaw.mock.invocationCallOrder[0],
        run.tx.order.findUnique.mock.invocationCallOrder[0],
        run.tx.shipment.findUnique.mock.invocationCallOrder[0],
        run.tx.order.updateMany.mock.invocationCallOrder[0],
      ];
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(run.tx.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "o1",
            status: OrderStatus.preparing,
            preparingExtendedAt: null,
          },
        }),
      );
    });

    it("kilit altında sipariş artık hazırlıkta değilse uzatmaz", async () => {
      const store = createStore();
      const run = makeRun(store, EXTEND_ONCE);
      run.tx.order.findUnique.mockImplementationOnce(async () => ({
        ...snapshot(store.row),
        status: OrderStatus.shipped,
      }));

      await expect(run.run()).resolves.toEqual({
        warned: 0,
        extended: 0,
        cancelled: 0,
      });
      expect(run.tx.order.updateMany).not.toHaveBeenCalled();
      expect(store.row.preparingExtendedAt).toBeNull();
    });
  });

  describe("eşzamanlı turlar", () => {
    it("iki uzatma turu siparişi yalnız BİR kez uzatır", async () => {
      const store = createStore();
      const arrive = barrier(2);
      const a = makeRun(store, EXTEND_ONCE, { expiryBarrier: arrive });
      const b = makeRun(store, EXTEND_ONCE, { expiryBarrier: arrive });

      const [ra, rb] = await Promise.all([a.run(), b.run()]);

      expect(ra.extended + rb.extended).toBe(1);
      expect(ra.cancelled + rb.cancelled).toBe(0);
      expect(store.row.version).toBe(1);
      expect(store.row.preparingDeadline).toEqual(
        addDaysSkippingSundays(T0, 3),
      );
      const sent = [a, b].flatMap(
        (run) =>
          run.notificationService.notifyPreparingExtendedBuyer.mock.calls,
      );
      expect(sent).toHaveLength(1);
      expectNoCancelPath(a);
      expectNoCancelPath(b);
    });

    it.each([
      ["uzatan tur önce", true],
      ["iptal eden tur önce", false],
    ])(
      "uzatma ve iptal turları yarışırsa sipariş hem uzatılıp hem iptal edilemez (%s)",
      async (_label, extenderFirst) => {
        // Admin turlar arasında eylemi değiştirdi: biri extend_once, diğeri
        // varsayılanı (iptal + iade) okudu; ikisi de bayat süre-dolumu listesini
        // aldı.
        const store = createStore();
        const arrive = barrier(2);
        const extender = makeRun(store, EXTEND_ONCE, { expiryBarrier: arrive });
        const canceller = makeRun(store, {}, { expiryBarrier: arrive });

        const runs = extenderFirst
          ? [extender.run(), canceller.run()]
          : [canceller.run(), extender.run()];
        await Promise.all(runs);

        const extendedHappened = store.row.preparingExtendedAt !== null;
        const cancelledHappened = store.row.status === OrderStatus.cancelled;
        expect(Number(extendedHappened) + Number(cancelledHappened)).toBe(1);

        if (extendedHappened) {
          expectNoCancelPath(canceller);
          expect(store.row.status).toBe(OrderStatus.preparing);
        } else {
          expect(extender.tx.order.updateMany).not.toHaveBeenCalled();
          expect(
            notificationsOf(
              extender,
              NotificationType.ORDER_PREPARING_EXTENDED_SELLER,
            ),
          ).toHaveLength(0);
          expect(
            extender.notificationService.notifyPreparingExtendedBuyer,
          ).not.toHaveBeenCalled();
          expect(canceller.paymentRefund.processRefund).toHaveBeenCalledTimes(
            1,
          );
        }
      },
    );
  });
});
