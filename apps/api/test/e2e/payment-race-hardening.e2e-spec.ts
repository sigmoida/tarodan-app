import * as request from "supertest";
import { OrderStatus, PaymentStatus, PaymentHoldStatus } from "@prisma/client";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import { createUser, authHeader } from "../factories/user.factory";
import { createProduct } from "../factories/product.factory";
import { createAddress } from "../factories/address.factory";
import {
  buyAndInitiate,
  completePaymentByCallback,
  latestPaymentOfOrder,
} from "../factories/flows";
import { PaymentService } from "../../src/modules/payment/payment.service";

/**
 * Teslim-öncesi ödeme denetiminde bulunan YARIŞ/ZAMANLAMA boşluklarının (H1-H4)
 * regresyon testleri. Her test, düzeltme geri alınırsa KIRMIZIYA döner.
 *
 *  H1 — ödeme-iptal penceresi (PAYMENT_FAIL_TIMEOUT_MINUTES) PayTR 3DS oturumundan
 *       uzun; 5dk'lık rezervasyon penceresinde payment satırı `failed` yapılmaz.
 *  H2 — eşzamanlı direct-form: payment `processing`'e claim edilir, ikinci çekim engellenir.
 *  H3 — cancelExpiredPayments CAS'lı: completed payment'ı `failed`'a EZMEZ.
 *  H4 — admin releasePayment, açık iade ile DONMUŞ (frozenByRefundId) hold'u serbest bırakamaz.
 */
describe("Payment race hardening (H1-H4 regression, E2E)", () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });
  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });
  beforeEach(async () => {
    await truncateAll();
    baseline = await seedBaseline();
    ctx.paytr.reset();
    jest.restoreAllMocks();
  });

  /** Alıcı + pending_payment sipariş + initiate edilmiş (pending) payment döndürür. */
  async function makeOrderWithPendingPayment(price = 300) {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    // Current order-create contract (quote pins) + initiate, via the shared flow.
    const { orderId } = await buyAndInitiate(ctx, buyer, product.id, addr.id);
    // The order's payment is its checkout group's payment (no orderId on it).
    const payment = (await latestPaymentOfOrder(orderId))!;
    return { buyer, seller, product, orderId, payment };
  }

  /**
   * Completes the pending payment with a signed success callback (completed
   * payment + held hold) and waits for fulfillment, via the shared flow.
   */
  const completeViaCallback = (orderId: string) =>
    completePaymentByCallback(ctx, orderId);

  describe("H2 — eşzamanlı direct-form çift-çekim koruması", () => {
    it("aynı sipariş için iki paralel direct-form: biri çeker (201), biri reddedilir (400); PayTR yalnız 1 kez çağrılır", async () => {
      const { buyer, orderId } = await makeOrderWithPendingPayment();

      // Çekimi yavaşlat: ilk istek `processing` claim'ini ~400ms tutar; ikinci istek
      // bu pencerede claim deneyip count===0 (zaten processing) → 400 alır.
      const orig = ctx.paytr.createDirectPaymentForm.bind(ctx.paytr);
      jest
        .spyOn(ctx.paytr, "createDirectPaymentForm")
        .mockImplementation(async (...args: any[]) => {
          await new Promise((r) => setTimeout(r, 400));
          return (orig as any)(...args);
        });

      const fire = () =>
        request(ctx.app.getHttpServer())
          .post("/api/payments/direct-form")
          .set(authHeader(buyer))
          .send({ orderId });

      const [a, b] = await Promise.all([fire(), fire()]);
      const codes = [a.status, b.status].sort();

      // Tam olarak bir başarı (201) + bir "işleniyor" reddi (400).
      expect(codes).toEqual([201, 400]);
      // KRİTİK: PayTR'da yalnız BİR çekim — çift çekim yok.
      expect(ctx.paytr.directPaymentCalls.length).toBe(1);
    });

    it("çekim bittikten SONRA tekrar denemek mümkün (processing claim pending'e bırakılır)", async () => {
      const { buyer, orderId } = await makeOrderWithPendingPayment();

      await request(ctx.app.getHttpServer())
        .post("/api/payments/direct-form")
        .set(authHeader(buyer))
        .send({ orderId })
        .expect(201);

      const after = (await latestPaymentOfOrder(orderId))!;
      // Claim bırakıldı → callback gelebilsin diye pending'e döndü (processing'de kalmadı).
      expect(after.status).toBe(PaymentStatus.pending);

      // İkinci deneme (seri) engellenmez.
      await request(ctx.app.getHttpServer())
        .post("/api/payments/direct-form")
        .set(authHeader(buyer))
        .send({ orderId })
        .expect(201);
      expect(ctx.paytr.directPaymentCalls.length).toBe(2);
    });
  });

  describe("H1 — ödeme-iptal penceresi PayTR oturumundan uzun", () => {
    it("PayTR oturum penceresindeki (ör. 10dk) pending ödeme cancelExpiredPayments ile FAILED yapılmaz", async () => {
      const { orderId, payment } = await makeOrderWithPendingPayment();
      const prisma = getPrisma();

      // Ödeme 10 dk önce başlatıldı: rezervasyon (5dk) süresini geçti ama PayTR 3DS
      // oturumu (30dk) hâlâ açık → kullanıcı tamamlayabilir → payment'ı failed YAPMA.
      await prisma.payment.update({
        where: { id: payment.id },
        data: { createdAt: new Date(Date.now() - 10 * 60 * 1000) },
      });

      const paymentService = ctx.app.get(PaymentService);
      await paymentService.cancelExpiredPayments();

      const after = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      expect(after.status).toBe(PaymentStatus.pending);
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(order.status).toBe(OrderStatus.pending_payment);
    });

    it("PayTR oturumu geçmiş (ör. 40dk) terk edilmiş pending ödeme FAILED yapılır", async () => {
      const { payment } = await makeOrderWithPendingPayment();
      const prisma = getPrisma();
      await prisma.payment.update({
        where: { id: payment.id },
        data: { createdAt: new Date(Date.now() - 40 * 60 * 1000) },
      });

      const paymentService = ctx.app.get(PaymentService);
      await paymentService.cancelExpiredPayments();

      const after = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      expect(after.status).toBe(PaymentStatus.failed);
    });

    it("crash sonrası `processing`'de takılı (eski) ödeme cancelExpiredPayments ile pending'e iyileştirilir", async () => {
      const { payment } = await makeOrderWithPendingPayment();
      const prisma = getPrisma();
      // status=processing + updated_at 10 dk önce (updatedAt @updatedAt olduğu için raw SQL).
      await prisma.$executeRawUnsafe(
        `UPDATE payments SET status='processing', updated_at = now() - interval '10 minutes' WHERE id = $1`,
        payment.id,
      );

      const paymentService = ctx.app.get(PaymentService);
      await paymentService.cancelExpiredPayments();

      const after = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      expect(after.status).toBe(PaymentStatus.pending);
    });
  });

  describe("H3 — cancelExpiredPayments completed ödemeyi EZMEZ", () => {
    it("completed bir ödeme (eski createdAt) cancelExpiredPayments ile failed'a düşmez, sipariş bozulmaz", async () => {
      const { orderId, payment } = await makeOrderWithPendingPayment();
      await completeViaCallback(orderId);
      const prisma = getPrisma();

      // Ödeme tamamlandı; createdAt'i pencere ötesine çek (cron adayı olsun).
      await prisma.payment.update({
        where: { id: payment.id },
        data: { createdAt: new Date(Date.now() - 40 * 60 * 1000) },
      });

      const paymentService = ctx.app.get(PaymentService);
      await paymentService.cancelExpiredPayments();

      const after = await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
      });
      // CAS (where status=pending) sayesinde completed'a dokunulmaz.
      expect(after.status).toBe(PaymentStatus.completed);
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect([OrderStatus.paid, OrderStatus.preparing]).toContain(order.status);
    });
  });

  describe("H4 — admin releasePayment dondurulmuş hold'u serbest bırakamaz", () => {
    /**
     * A paid order made releasable in every other respect: delivered, with the
     * hold's release date passed. Admin release has required a delivered order
     * since 728496075 (fix(fulfillment): block oversold order processing), now
     * in holdReleaseBlockedReason; without this both tests would be refused
     * as order_not_terminal and the freeze would not be what is tested.
     */
    async function makeReleasableHold() {
      const { orderId } = await makeOrderWithPendingPayment();
      await completeViaCallback(orderId);
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirstOrThrow({
        where: { orderId },
      });
      expect(hold.status).toBe(PaymentHoldStatus.held);
      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.delivered,
          deliveredAt: new Date(Date.now() - 20 * 86_400_000),
        },
      });
      await prisma.paymentHold.update({
        where: { id: hold.id },
        data: { releaseAt: new Date(Date.now() - 60_000) },
      });
      return { orderId, holdId: hold.id };
    }

    it("açık iade ile frozen hold releasePayment ile serbest bırakılamaz (hold held kalır)", async () => {
      const { orderId, holdId } = await makeReleasableHold();
      const prisma = getPrisma();

      // Açık iadeyi simüle et: hold'u dondur.
      await prisma.paymentHold.update({
        where: { id: holdId },
        data: { frozenByRefundId: "refund-req-test-1" },
      });

      const paymentService = ctx.app.get(PaymentService);
      // Refused because of the freeze, not for any other reason.
      await expect(
        paymentService.releasePayment(orderId),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.payment.holdReleaseBlocked.frozen" },
      });

      const after = await prisma.paymentHold.findUniqueOrThrow({
        where: { id: holdId },
      });
      // Donmuş hold serbest bırakılmadı → çift kayıp (satıcıya öde + alıcıya iade) önlendi.
      expect(after.status).toBe(PaymentHoldStatus.held);
    });

    it("dondurulmamış (normal) held hold releasePayment ile serbest bırakılır", async () => {
      const { orderId, holdId } = await makeReleasableHold();
      const prisma = getPrisma();

      const paymentService = ctx.app.get(PaymentService);
      const res = await paymentService.releasePayment(orderId);
      expect(res.success).toBe(true);

      const after = await prisma.paymentHold.findUniqueOrThrow({
        where: { id: holdId },
      });
      expect(after.status).toBe(PaymentHoldStatus.released);
    });
  });
});
