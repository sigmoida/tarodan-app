/**
 * 12 — İade & İptal (REF) — Test Konsolu senaryoları.
 *
 * Fan-out şablonu 01-auth.e2e-spec.ts'ten alınmıştır. Her test `scenario('REF-NNN', fn)`
 * ile manifest'e bağlanır (başlık/pri manifest'ten gelir). Assertion stilleri mevcut
 * yeşil refund-flow.e2e-spec.ts / refund-extended.e2e-spec.ts / trade-cash-cancel-refund
 * .e2e-spec.ts dosyalarından türetilmiştir; endpoint/DTO/status/durum-geçişleri
 * apps/api/src/modules/refund|payment|order|admin controller/service'lerinden teyit edildi.
 */
import * as request from "supertest";
import {
  AdminRole,
  OrderStatus,
  PaymentHoldStatus,
  PaymentStatus,
  RefundRequestStatus,
  ShipmentStatus,
} from "@prisma/client";
import { createE2ETestApp, E2ETestApp } from "../../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../../test-utils/db";
import {
  createUser,
  createAdminUser,
  authHeader,
} from "../../factories/user.factory";
import { createProduct } from "../../factories/product.factory";
import { createAddress } from "../../factories/address.factory";
import { buyAndPay, buyNow } from "../../factories/flows";
import { signCallback } from "../../mocks/paytr.mock";
import { ConfigService } from "@nestjs/config";
import { scenario } from "../../test-utils/scenario";
import { RefundService } from "../../../src/modules/refund/refund.service";
import { PaymentService } from "../../../src/modules/payment/payment.service";
import { SuratCargoService } from "../../../src/modules/surat-cargo/surat-cargo.service";

describe("12 — İade & İptal (REF)", () => {
  let ctx: E2ETestApp;
  let baseline: { categoryId: string; brandId: string; manufacturerId: string };
  const server = () => ctx.app.getHttpServer();

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
    ctx.surat.reset();
    // Env-flag spy'ları (REF-064/REF-094) test başına sıfırlansın; aksi halde
    // sızan mockImplementation diğer testlerin config okumasını bozar.
    jest.restoreAllMocks();
  });

  // ──────────────────────────── Ortak kurulum yardımcıları (spec-içi) ────────────────────────────

  /** Alıcı + satıcı + ürün + iki adres + ödenmiş sipariş. */
  async function paidOrder(
    opts: { price?: number; quantity?: number; sellerAddress?: boolean } = {},
  ) {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: opts.price ?? 200,
      quantity: opts.quantity ?? 1,
    });
    const buyerAddr = await createAddress({ userId: buyer.id });
    if (opts.sellerAddress !== false)
      await createAddress({ userId: seller.id });
    const { orderId } = await buyAndPay(ctx, buyer, product.id, buyerAddr.id);
    return { buyer, seller, product, buyerAddr, orderId };
  }

  /** Ödenmiş siparişi 'delivered' + shipment delivered'a çek (cooling-off kargo hemen açılır). */
  async function markDelivered(
    orderId: string,
    deliveredAt: Date = new Date(),
  ) {
    const prisma = getPrisma();
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered, deliveredAt },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: { status: ShipmentStatus.delivered, deliveredAt },
    });
  }

  /** Ödenmiş siparişi 'shipped' + shipment in_transit'e çek (cooling-off → wait_for_delivery). */
  async function markShipped(orderId: string) {
    const prisma = getPrisma();
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: {
        status: ShipmentStatus.in_transit,
        trackingNumber: `TRK-${orderId.slice(0, 8)}`,
        providerTrackingId: `TRK-${orderId.slice(0, 8)}`,
      },
    });
  }

  const createRefund = (
    orderId: string,
    buyer: { accessToken: string },
    body: Record<string, unknown>,
  ) =>
    request(server())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send(body);

  // ══════════════════════════ İade talebi oluşturma (POST /orders/:id/refund-requests) ══════════════════════════

  describe("Cooling-off / anlık iade talebi oluşturma", () => {
    scenario("REF-001", async () => {
      // paid+kargosuz (preparing, shipment pending) → anlık iade.
      const { buyer, orderId } = await paidOrder({ price: 250 });
      const prisma = getPrisma();
      const shipmentBefore = await prisma.shipment.findFirst({
        where: { orderId },
      });
      expect(shipmentBefore?.status).toBe(ShipmentStatus.pending);

      const res = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      expect(res.body.status).toBe(RefundRequestStatus.refunded);
      expect(res.body.refundNumber).toMatch(/^RFD-[0-9A-Z]{10,14}$/);
      expect(res.body.refundedAt).toBeTruthy();

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order!.status).toBe(OrderStatus.cancelled);
      expect(order!.cancellationType).toBe("iptal");
      const payment = await prisma.payment.findFirst({ where: { orderId } });
      expect(payment!.status).toBe(PaymentStatus.refunded);
      const shipmentAfter = await prisma.shipment.findUnique({
        where: { id: shipmentBefore!.id },
      });
      expect(shipmentAfter!.status).toBe(ShipmentStatus.cancelled);

      expect(ctx.paytr.refundCalls).toHaveLength(1);
      expect(ctx.surat.cancelCalls).toContain(order!.orderNumber);
    });

    scenario("REF-002", async () => {
      // Kargoda (in_transit) ≤14 gün → wait_for_delivery.
      const { buyer, seller, orderId } = await paidOrder({ price: 150 });
      await markShipped(orderId);

      const res = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      expect(res.body.status).toBe(RefundRequestStatus.wait_for_delivery);
      expect(res.body.returnTrackingNumber).toBeNull();

      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold!.frozenByRefundId).toBe(res.body.id);
      const notif = await prisma.notificationLog.findFirst({
        where: { userId: buyer.id, type: "refund_approved" },
      });
      expect(notif).toBeTruthy();
      // Sipariş satıcı bildirimi değil; alıcı onayı burada gider.
      expect(seller.id).toBeTruthy();
    });

    scenario("REF-003", async () => {
      // Teslim edilmiş ≤14 gün → kargo hemen açılır (return_shipment_open, surat).
      const { buyer, orderId } = await paidOrder({ price: 180 });
      await markDelivered(orderId);

      const res = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      expect(res.body.status).toBe(RefundRequestStatus.return_shipment_open);
      expect(res.body.returnProvider).toBe("surat");
      expect(res.body.returnTrackingNumber).toMatch(/^RFD-[0-9A-Z]{10,14}$/);

      const returnCall = ctx.surat.shipmentCalls.find(
        (c) => c.OzelKargoTakipNo === res.body.returnTrackingNumber,
      );
      expect(returnCall).toBeDefined();
      expect(returnCall!.Iademi).toBe(true);
    });

    scenario("REF-004", async () => {
      // preparing fazı, shipment failed → yine anlık iade (refund.service.ts:625-630).
      const { buyer, orderId } = await paidOrder({ price: 120 });
      const prisma = getPrisma();
      await prisma.shipment.update({
        where: { orderId },
        data: { status: ShipmentStatus.failed },
      });

      const res = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      expect(res.body.status).toBe(RefundRequestStatus.refunded);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order!.status).toBe(OrderStatus.cancelled);
    });

    scenario("REF-005", async () => {
      // Teslim edilmiş ama deliveredAt boş → in_cooling_off varsayımı (kargo hemen açılır).
      const { buyer, orderId } = await paidOrder({ price: 140 });
      const prisma = getPrisma();
      // order.deliveredAt ve shipment.deliveredAt BOŞ bırakılır → classifyOrderPhase
      // deliveredAt=null görürse in_cooling_off (refund.service.ts:643-644).
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.delivered, deliveredAt: null },
      });
      await prisma.shipment.update({
        where: { orderId },
        data: { status: ShipmentStatus.delivered, deliveredAt: null },
      });

      const res = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      expect(res.body.status).toBe(RefundRequestStatus.return_shipment_open);
      expect(res.body.returnProvider).toBe("surat");
    });

    scenario("REF-120", async () => {
      // Tam sınır: ageDays == 14 → hâlâ iade edilebilir (cooling-off, refund.service.ts:646).
      const { buyer, orderId } = await paidOrder({ price: 100 });
      // Teslim tarihini tam 14 gün geriye çek (COOLING_OFF_DAYS sınırı dahil).
      const fourteenDaysAgo = new Date(
        Date.now() - 14 * 24 * 3600 * 1000 + 60_000,
      );
      await markDelivered(orderId, fourteenDaysAgo);

      const res = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      // 14. günde hâlâ cooling-off akışı (kargo açılır ya da wait_for_delivery), refunded değil.
      expect([
        RefundRequestStatus.return_shipment_open,
        RefundRequestStatus.wait_for_delivery,
      ]).toContain(res.body.status);
    });
  });

  // ══════════════════════════ İade talebi reddi (negatif/doğrulama) ══════════════════════════

  describe("İade talebi reddi", () => {
    scenario("REF-010", async () => {
      // 14 gün dolmuş (>14 gün teslim) → iade bloklanır (her iki gövde de 400).
      const { buyer, orderId } = await paidOrder({ price: 60 });
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 3600 * 1000);
      await markDelivered(orderId, twentyDaysAgo);

      const r1 = await createRefund(orderId, buyer, {
        reason: "damaged",
        description: "broken",
      }).expect(400);
      expect(r1.body.message).toMatch(/14 gün|dolmuş|oluşturulamaz/i);

      await createRefund(orderId, buyer, {
        reason: "damaged",
        description: "Ürün kırık geldi.",
        evidencePhotoUrls: ["https://example.com/p.jpg"],
      }).expect(400);
    });

    scenario("REF-011", async () => {
      // Ödenmemiş sipariş (pending_payment) → iade reddi.
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 50,
        quantity: 1,
      });
      const addr = await createAddress({ userId: buyer.id });
      const buyRes = await buyNow(ctx, buyer, product.id, addr.id).expect(201);

      const res = await createRefund(buyRes.body.orderId, buyer, {
        reason: "changed_mind",
      }).expect(400);
      expect(res.body.message).toMatch(/ödenmemiş/i);
    });

    scenario("REF-012", async () => {
      // Tamamlanmamış ödeme → "Tamamlanmış ödeme bulunamadı".
      const { buyer, orderId } = await paidOrder({ price: 70 });
      const prisma = getPrisma();
      // Ödeme completed değil yap; sipariş yine iade edilebilir bir durumda (preparing).
      await prisma.payment.updateMany({
        where: { orderId },
        data: { status: PaymentStatus.processing },
      });

      const res = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(400);
      expect(res.body.message).toMatch(/Tamamlanmış ödeme bulunamadı/i);
    });

    scenario("REF-013", async () => {
      // Zaten iptal/iade edilmiş siparişte iade reddi.
      const { buyer, orderId } = await paidOrder({ price: 80 });
      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.cancelled },
      });

      const res = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(400);
      expect(res.body.message).toMatch(/zaten iptal\/iade edilmiş/i);
    });

    scenario("REF-014", async () => {
      // Aynı sipariş için çift aktif iade engeli (ilk wait_for_delivery kalır).
      const { buyer, orderId } = await paidOrder({ price: 90 });
      await markShipped(orderId);
      await createRefund(orderId, buyer, { reason: "changed_mind" }).expect(
        201,
      );

      const dup = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(400);
      expect(dup.body.message).toMatch(/zaten aktif bir iade/i);
    });

    scenario("REF-015", async () => {
      // Üyelik (MEM-) siparişinde iade reddi. Guard sadece orderNumber prefix'ine bakar.
      const { buyer, orderId } = await paidOrder({ price: 100 });
      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: orderId },
        data: { orderNumber: `MEM-${Date.now()}` },
      });

      const res = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(400);
      expect(res.body.message).toMatch(
        /Üyelik siparişleri için iade talebi oluşturulamaz/i,
      );
    });

    scenario("REF-016", async () => {
      // Geçersiz reason enum → 400 (ValidationPipe IsEnum).
      const { buyer, orderId } = await paidOrder({ price: 100 });
      await createRefund(orderId, buyer, { reason: "abuse_reason" }).expect(
        400,
      );
    });

    scenario("REF-017", async () => {
      // refundQuantity < 1 (0) veya non-int (2.5) → 400 (Min(1) / IsInt).
      const { buyer, orderId } = await paidOrder({ price: 100 });
      await createRefund(orderId, buyer, {
        reason: "changed_mind",
        refundQuantity: 0,
      }).expect(400);
      await createRefund(orderId, buyer, {
        reason: "changed_mind",
        refundQuantity: 2.5,
      }).expect(400);
    });

    scenario("REF-018", async () => {
      // evidencePhotoUrls geçersiz URL → 400 (IsUrl each); description > 2000 → 400 (MaxLength).
      const { buyer, orderId } = await paidOrder({ price: 100 });
      await createRefund(orderId, buyer, {
        reason: "damaged",
        evidencePhotoUrls: ["not-a-url"],
      }).expect(400);
      await createRefund(orderId, buyer, {
        reason: "changed_mind",
        description: "x".repeat(2001),
      }).expect(400);
    });

    scenario("REF-019", async () => {
      // Bozuk orderId → 400 (ParseUUIDPipe); olmayan geçerli UUID → 404.
      const buyer = await createUser(ctx.module);
      await request(server())
        .post("/api/orders/not-a-uuid/refund-requests")
        .set(authHeader(buyer))
        .send({ reason: "changed_mind" })
        .expect(400);

      const res = await request(server())
        .post(
          "/api/orders/a0000000-0000-4000-8000-000000000000/refund-requests",
        )
        .set(authHeader(buyer))
        .send({ reason: "changed_mind" })
        .expect(404);
      expect(res.body.message).toMatch(/Sipariş bulunamadı/i);
    });
  });

  // ══════════════════════════ Yetki / güvenlik ══════════════════════════

  describe("Yetki & güvenlik (oluşturma/görüntüleme/iptal)", () => {
    scenario("REF-020", async () => {
      // Yalnızca alıcı iade talebi oluşturabilir; yabancı → 403.
      const { orderId } = await paidOrder({ price: 90 });
      const stranger = await createUser(ctx.module);
      const res = await createRefund(orderId, stranger, {
        reason: "changed_mind",
      }).expect(403);
      expect(res.body.message).toMatch(
        /Sadece alıcı iade talebi oluşturabilir/i,
      );
    });

    scenario("REF-021", async () => {
      // Auth yok → 401.
      const { orderId } = await paidOrder({ price: 90 });
      await request(server())
        .post(`/api/orders/${orderId}/refund-requests`)
        .send({ reason: "changed_mind" })
        .expect(401);
    });

    scenario("REF-022", async () => {
      // Detayı yalnızca alıcı/satıcı görür; yabancı → 403.
      const { buyer, seller, orderId } = await paidOrder({ price: 100 });
      const stranger = await createUser(ctx.module);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      const id = createRes.body.id;

      await request(server())
        .get(`/api/refund-requests/${id}`)
        .set(authHeader(buyer))
        .expect(200);
      await request(server())
        .get(`/api/refund-requests/${id}`)
        .set(authHeader(seller))
        .expect(200);
      await request(server())
        .get(`/api/refund-requests/${id}`)
        .set(authHeader(stranger))
        .expect(403);
    });

    scenario("REF-023", async () => {
      // Satıcı alıcının talebini iptal edemez → 403.
      const { buyer, seller, orderId } = await paidOrder({ price: 100 });
      await markShipped(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      const res = await request(server())
        .post(`/api/refund-requests/${createRes.body.id}/cancel`)
        .set(authHeader(seller))
        .expect(403);
      expect(res.body.message).toMatch(/Bu talebi iptal edemezsiniz/i);
    });

    scenario("REF-140", async () => {
      // IDOR: başka kullanıcı (ceren) talebi iptal edemez → 403.
      const { buyer, orderId } = await paidOrder({ price: 100 });
      await markShipped(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      const ceren = await createUser(ctx.module);
      const res = await request(server())
        .post(`/api/refund-requests/${createRes.body.id}/cancel`)
        .set(authHeader(ceren))
        .expect(403);
      expect(res.body.message).toMatch(/Bu talebi iptal edemezsiniz/i);
    });

    scenario("REF-141", async () => {
      // IDOR: başka kullanıcı (kaan) talebi görüntüleyemez → 403.
      const { buyer, orderId } = await paidOrder({ price: 100 });
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      const kaan = await createUser(ctx.module);
      await request(server())
        .get(`/api/refund-requests/${createRes.body.id}`)
        .set(authHeader(kaan))
        .expect(403);
    });

    scenario("REF-142", async () => {
      // refundNumber tahmin edilemez: üç farklı iade, ardışık olmayan RFD-... değerleri.
      const numbers: string[] = [];
      for (let i = 0; i < 3; i++) {
        const { buyer, orderId } = await paidOrder({ price: 100 + i });
        const res = await createRefund(orderId, buyer, {
          reason: "changed_mind",
        }).expect(201);
        expect(res.body.refundNumber).toMatch(/^RFD-[0-9A-Z]{10,14}$/);
        numbers.push(res.body.refundNumber);
      }
      // Hepsi benzersiz.
      expect(new Set(numbers).size).toBe(3);
    });
  });

  // ══════════════════════════ İade talebi iptali (POST /refund-requests/:id/cancel) ══════════════════════════

  describe("İade talebi iptali", () => {
    scenario("REF-030", async () => {
      // wait_for_delivery talebi alıcı iptal eder → cancelled + satıcıya REFUND_CANCELLED.
      const { buyer, seller, orderId } = await paidOrder({ price: 100 });
      await markShipped(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      const id = createRes.body.id;

      const res = await request(server())
        .post(`/api/refund-requests/${id}/cancel`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.status).toBe(RefundRequestStatus.cancelled);
      expect(res.body.decidedBy).toBe(buyer.id);
      expect(res.body.decidedAt).toBeTruthy();

      const prisma = getPrisma();
      const notif = await prisma.notificationLog.findFirst({
        where: { userId: seller.id, type: "refund_cancelled" },
      });
      expect(notif).toBeTruthy();
    });

    scenario("REF-031", async () => {
      // pending_review talebi alıcı iptal eder → cancelled. (pending_review normal akışta
      // üretilmez; talep satırı doğrudan seed edilir.)
      const { buyer, orderId } = await paidOrder({ price: 100 });
      const prisma = getPrisma();
      const rr = await prisma.refundRequest.create({
        data: {
          refundNumber: `RFD-PENDINGREV01`,
          orderId,
          requesterId: buyer.id,
          reason: "changed_mind",
          amount: 100,
          refundQuantity: 1,
          status: RefundRequestStatus.pending_review,
        },
      });

      const res = await request(server())
        .post(`/api/refund-requests/${rr.id}/cancel`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.status).toBe(RefundRequestStatus.cancelled);
    });

    scenario("REF-032", async () => {
      // Kargo açıldıktan sonra (return_shipment_open) iptal reddi → 400.
      const { buyer, orderId } = await paidOrder({ price: 100 });
      await markDelivered(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      expect(createRes.body.status).toBe(
        RefundRequestStatus.return_shipment_open,
      );

      const res = await request(server())
        .post(`/api/refund-requests/${createRes.body.id}/cancel`)
        .set(authHeader(buyer))
        .expect(400);
      expect(res.body.message).toMatch(
        /iade kargosu açılmış veya karara bağlanmış/i,
      );
    });

    scenario("REF-033", async () => {
      // refunded/rejected/disputed talebin iptal reddi → 400.
      const { buyer, orderId } = await paidOrder({ price: 100 });
      const prisma = getPrisma();
      for (const status of [
        RefundRequestStatus.refunded,
        RefundRequestStatus.rejected,
        RefundRequestStatus.disputed,
      ]) {
        const rr = await prisma.refundRequest.create({
          data: {
            refundNumber: `RFD-STATE${status.slice(0, 6).toUpperCase()}`,
            orderId,
            requesterId: buyer.id,
            reason: "changed_mind",
            amount: 100,
            refundQuantity: 1,
            status,
          },
        });
        await request(server())
          .post(`/api/refund-requests/${rr.id}/cancel`)
          .set(authHeader(buyer))
          .expect(400);
      }
    });

    scenario("REF-034", async () => {
      // Olmayan iade talebi id → 404.
      const buyer = await createUser(ctx.module);
      const res = await request(server())
        .post(
          `/api/refund-requests/a0000000-0000-4000-8000-000000000000/cancel`,
        )
        .set(authHeader(buyer))
        .expect(404);
      expect(res.body.message).toMatch(/İade talebi bulunamadı/i);
    });

    scenario("REF-132", async () => {
      // Parite (backend gözlemlenebilir kısmı): backend hem pending_review hem
      // wait_for_delivery talebini iptal eder (200). Web/mobil buton parite farkı UI
      // katmanındadır ve bu API testinde kapsanmaz — burada backend tutarlılığı doğrulanır.
      const { buyer: b1, orderId: o1 } = await paidOrder({ price: 100 });
      await markShipped(o1);
      const waitRes = await createRefund(o1, b1, {
        reason: "changed_mind",
      }).expect(201);
      expect(waitRes.body.status).toBe(RefundRequestStatus.wait_for_delivery);
      await request(server())
        .post(`/api/refund-requests/${waitRes.body.id}/cancel`)
        .set(authHeader(b1))
        .expect(200);

      const { buyer: b2, orderId: o2 } = await paidOrder({ price: 100 });
      const prisma = getPrisma();
      const rr = await prisma.refundRequest.create({
        data: {
          refundNumber: `RFD-PARITEPR01`,
          orderId: o2,
          requesterId: b2.id,
          reason: "changed_mind",
          amount: 100,
          refundQuantity: 1,
          status: RefundRequestStatus.pending_review,
        },
      });
      await request(server())
        .post(`/api/refund-requests/${rr.id}/cancel`)
        .set(authHeader(b2))
        .expect(200);
    });
  });

  // ══════════════════════════ Sipariş iptali → iade (POST /orders/:id/cancel) ══════════════════════════

  describe("Sipariş iptali", () => {
    scenario("REF-040", async () => {
      // paid iptal → refunded; cron PayTR iadesini yapar → cancelled + payment refunded.
      const { buyer, orderId } = await paidOrder({ price: 200 });
      const prisma = getPrisma();

      await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: "vazgeçtim" })
        .expect(200);

      const afterCancel = await prisma.order.findUnique({
        where: { id: orderId },
      });
      expect(afterCancel!.status).toBe(OrderStatus.refunded);
      expect(afterCancel!.cancellationType).toBe("iptal");
      expect(ctx.paytr.refundCalls).toHaveLength(0);

      const paymentService = ctx.app.get(PaymentService);
      const res = await paymentService.processRefundedOrders();
      expect(res.refunded).toBeGreaterThanOrEqual(1);
      expect(ctx.paytr.refundCalls).toHaveLength(1);

      const finalOrder = await prisma.order.findUnique({
        where: { id: orderId },
      });
      expect(finalOrder!.status).toBe(OrderStatus.cancelled);
      const payment = await prisma.payment.findFirst({ where: { orderId } });
      expect(payment!.status).toBe(PaymentStatus.refunded);
    });

    scenario("REF-041", async () => {
      // shipped sonrası sipariş iptali reddi → 400.
      const { buyer, orderId } = await paidOrder({ price: 75 });
      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.shipped },
      });

      const res = await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: "vazgeçtim" })
        .expect(400);
      expect(res.body.message).toMatch(
        /kargoya verildikten sonra iptal edilemez/i,
      );
    });

    scenario("REF-042", async () => {
      // pending_payment iptal → cancelled; product.reservedQuantity düşer (clamp).
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        price: 120,
        quantity: 5,
      });
      const addr = await createAddress({ userId: buyer.id });
      const buyRes = await buyNow(ctx, buyer, product.id, addr.id).expect(201);
      const orderId = buyRes.body.orderId;

      const prisma = getPrisma();
      const reservedBefore = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(reservedBefore!.reservedQuantity).toBe(1);

      await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: "vazgeçtim" })
        .expect(200);

      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order!.status).toBe(OrderStatus.cancelled);
      const reservedAfter = await prisma.product.findUnique({
        where: { id: product.id },
      });
      expect(reservedAfter!.reservedQuantity).toBe(0);
    });

    scenario("REF-043", async () => {
      // Sipariş iptalini yalnızca alıcı yapabilir → 403.
      const { seller, orderId } = await paidOrder({ price: 100 });
      const res = await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(seller))
        .send({ reason: "vazgeçtim" })
        .expect(403);
      expect(res.body.message).toMatch(/Bu siparişi iptal etme yetkiniz yok/i);
    });
  });

  // ══════════════════════════ Escrow hold ↔ iade etkileşimi ══════════════════════════

  describe("PaymentHold ↔ iade kilit etkileşimi", () => {
    scenario("REF-050", async () => {
      // Cooling-off iade açılınca PaymentHold dondurulur.
      const { buyer, orderId } = await paidOrder({ price: 120 });
      const prisma = getPrisma();
      const holdBefore = await prisma.paymentHold.findFirst({
        where: { orderId },
      });
      expect(holdBefore!.frozenByRefundId).toBeNull();

      await markDelivered(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);

      const holdAfter = await prisma.paymentHold.findFirst({
        where: { orderId },
      });
      expect(holdAfter!.frozenByRefundId).toBe(createRes.body.id);
    });

    scenario("REF-051", async () => {
      // İade iptal edilince hold kilidi çözülür (frozenByRefundId=null, status=held).
      const { buyer, orderId } = await paidOrder({ price: 140 });
      await markShipped(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      const prisma = getPrisma();
      const frozen = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(frozen!.frozenByRefundId).toBe(createRes.body.id);

      await request(server())
        .post(`/api/refund-requests/${createRes.body.id}/cancel`)
        .set(authHeader(buyer))
        .expect(200);

      const unfrozen = await prisma.paymentHold.findFirst({
        where: { orderId },
      });
      expect(unfrozen!.frozenByRefundId).toBeNull();
      expect(unfrozen!.status).toBe(PaymentHoldStatus.held);
    });

    scenario("REF-052", async () => {
      // Donmuş hold releaseAt geçmişte olsa bile serbest BIRAKILMAZ (14. gün yarışı).
      const { buyer, orderId } = await paidOrder({ price: 160 });
      await markDelivered(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);

      const prisma = getPrisma();
      await prisma.paymentHold.updateMany({
        where: { orderId },
        data: { releaseAt: new Date(Date.now() - 60_000) },
      });
      const paymentService = ctx.app.get(PaymentService);
      await paymentService.releaseHoldsDue();

      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold!.status).toBe(PaymentHoldStatus.held);
      expect(hold!.releasedAt).toBeNull();
      expect(hold!.frozenByRefundId).toBe(createRes.body.id);
      const payouts = await prisma.payoutTransfer.findMany({
        where: { paymentHold: { orderId } },
      });
      expect(payouts).toHaveLength(0);
    });
  });

  // ══════════════════════════ İade kargosu yaşam döngüsü + finalize ══════════════════════════

  describe("İade kargosu + finalize", () => {
    scenario("REF-060", async () => {
      // Teslimat sonrası cron iade kargosunu açar (wait_for_delivery → return_shipment_open).
      const { buyer, orderId } = await paidOrder({ price: 150 });
      await markShipped(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      expect(createRes.body.status).toBe(RefundRequestStatus.wait_for_delivery);

      const refundService = ctx.app.get(RefundService);
      expect(
        await refundService.findPendingDeliveryToOpenReturn(),
      ).toHaveLength(0);

      await markDelivered(orderId);
      const pending = await refundService.findPendingDeliveryToOpenReturn();
      expect(pending).toHaveLength(1);
      await refundService.openReturnShipment(pending[0]);

      const prisma = getPrisma();
      const rr = await prisma.refundRequest.findUnique({
        where: { id: createRes.body.id },
      });
      expect(rr!.status).toBe(RefundRequestStatus.return_shipment_open);
      expect(rr!.returnProvider).toBe("surat");
      expect(rr!.returnTrackingNumber).toMatch(/^RFD-[0-9A-Z]{10,14}$/);
      const returnCall = ctx.surat.shipmentCalls.find(
        (c) => c.OzelKargoTakipNo === rr!.returnTrackingNumber,
      );
      expect(returnCall).toBeDefined();
      expect(returnCall!.Iademi).toBe(true);
    });

    scenario("REF-061", async () => {
      // Kargo takibi in_transit → delivered; 30dk sonra finalize cron iadeyi tamamlar.
      const { buyer, orderId } = await paidOrder({ price: 130 });
      await markDelivered(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      expect(createRes.body.status).toBe(
        RefundRequestStatus.return_shipment_open,
      );

      const refundService = ctx.app.get(RefundService);
      const prisma = getPrisma();
      const refundId = createRes.body.id;

      await refundService.applyReturnTrackingUpdate(refundId, {
        status: ShipmentStatus.in_transit,
        shippedAt: new Date(),
      });
      expect(
        (await prisma.refundRequest.findUnique({ where: { id: refundId } }))!
          .status,
      ).toBe(RefundRequestStatus.return_in_transit);

      await refundService.applyReturnTrackingUpdate(refundId, {
        status: ShipmentStatus.delivered,
        deliveredAt: new Date(),
      });
      expect(
        (await prisma.refundRequest.findUnique({ where: { id: refundId } }))!
          .status,
      ).toBe(RefundRequestStatus.return_delivered);

      // 30dk dolmadan finalize listesinde YOK.
      expect(
        await refundService.findReturnDeliveredPendingFinalize(),
      ).not.toContain(refundId);
      await prisma.refundRequest.update({
        where: { id: refundId },
        data: { returnDeliveredAt: new Date(Date.now() - 31 * 60 * 1000) },
      });
      expect(
        await refundService.findReturnDeliveredPendingFinalize(),
      ).toContain(refundId);

      await refundService.finalizeRefundForReturnedShipment(refundId);
      const finalRr = await prisma.refundRequest.findUnique({
        where: { id: refundId },
      });
      expect(finalRr!.status).toBe(RefundRequestStatus.refunded);
      expect(finalRr!.refundedAt).toBeTruthy();
      expect(ctx.paytr.refundCalls).toHaveLength(1);
      const notif = await prisma.notificationLog.findFirst({
        where: { userId: buyer.id, type: "refund_completed" },
      });
      expect(notif).toBeTruthy();

      const cancelledList = await request(server())
        .get("/api/orders?role=buyer&status=cancelled")
        .set(authHeader(buyer))
        .expect(200);
      const row = (cancelledList.body.data as any[]).find(
        (o) => o.id === orderId,
      );
      expect(row?.activeRefundRequest?.status).toBe(
        RefundRequestStatus.refunded,
      );
    });

    scenario("REF-062", async () => {
      // Satıcı adresi YOKKEN iade kargosu depo fallback ile açılır.
      const { buyer, orderId } = await paidOrder({
        price: 90,
        sellerAddress: false,
      });
      await markDelivered(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      expect(createRes.body.status).toBe(
        RefundRequestStatus.return_shipment_open,
      );
      expect(createRes.body.returnProvider).toBe("surat");
    });

    scenario("REF-063", async () => {
      // Alıcı adresi de yoksa iade kargosu açılamaz → 400 (openReturnShipment throw).
      const { buyer, orderId } = await paidOrder({ price: 100 });
      await markShipped(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      const refundId = createRes.body.id;

      const prisma = getPrisma();
      // Hem sipariş teslimat JSON'ını (fallback kaynağı) hem alıcının kayıtlı adreslerini kaldır.
      await prisma.$executeRawUnsafe(
        `UPDATE "orders" SET "shipping_address" = NULL WHERE id = '${orderId}'`,
      );
      await prisma.address.deleteMany({ where: { userId: buyer.id } });

      const refundService = ctx.app.get(RefundService);
      await expect(refundService.openReturnShipment(refundId)).rejects.toThrow(
        /teslimat\/kayıtlı adresi bulunamadı/i,
      );
    });

    scenario("REF-065", async () => {
      // openReturnShipment idempotent: returnTrackingNumber doluysa Sürat çağrısı tekrarlanmaz.
      const { buyer, orderId } = await paidOrder({ price: 100 });
      await markDelivered(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      const refundId = createRes.body.id;
      const shipmentCallsAfterOpen = ctx.surat.shipmentCalls.length;
      expect(shipmentCallsAfterOpen).toBeGreaterThanOrEqual(1);

      const refundService = ctx.app.get(RefundService);
      const again = await refundService.openReturnShipment(refundId);
      expect(again!.returnTrackingNumber).toBe(
        createRes.body.returnTrackingNumber,
      );
      // İkinci çağrı yeni Sürat shipment üretmemeli.
      expect(ctx.surat.shipmentCalls.length).toBe(shipmentCallsAfterOpen);
    });
  });

  // ══════════════════════════ Bildirimler / e-posta ══════════════════════════

  describe("İade bildirimleri", () => {
    scenario("REF-070", async () => {
      // Cooling-off onayda alıcıya REFUND_APPROVED.
      const { buyer, orderId } = await paidOrder({ price: 95 });
      await markShipped(orderId);
      await createRefund(orderId, buyer, { reason: "changed_mind" }).expect(
        201,
      );
      const prisma = getPrisma();
      const notif = await prisma.notificationLog.findFirst({
        where: { userId: buyer.id, type: "refund_approved" },
      });
      expect(notif).toBeTruthy();
    });

    scenario("REF-071", async () => {
      // Talep iptalinde satıcıya REFUND_CANCELLED.
      const { buyer, seller, orderId } = await paidOrder({ price: 88 });
      await markShipped(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      await request(server())
        .post(`/api/refund-requests/${createRes.body.id}/cancel`)
        .set(authHeader(buyer))
        .expect(200);
      const prisma = getPrisma();
      const notif = await prisma.notificationLog.findFirst({
        where: { userId: seller.id, type: "refund_cancelled" },
      });
      expect(notif).toBeTruthy();
    });

    scenario("REF-072", async () => {
      // İade tamamlanınca alıcı (refund_completed) + satıcı (refund_completed_seller) bildirimleri.
      const { buyer, seller, orderId } = await paidOrder({ price: 130 });
      await markDelivered(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      const refundService = ctx.app.get(RefundService);
      const prisma = getPrisma();
      await prisma.refundRequest.update({
        where: { id: createRes.body.id },
        data: {
          status: RefundRequestStatus.return_delivered,
          returnDeliveredAt: new Date(Date.now() - 31 * 60 * 1000),
        },
      });
      await refundService.finalizeRefundForReturnedShipment(createRes.body.id);

      const buyerNotif = await prisma.notificationLog.findFirst({
        where: { userId: buyer.id, type: "refund_completed" },
      });
      expect(buyerNotif).toBeTruthy();
      const sellerNotif = await prisma.notificationLog.findFirst({
        where: { userId: seller.id, type: "refund_completed_seller" },
      });
      expect(sellerNotif).toBeTruthy();
    });

    scenario("REF-073", async () => {
      // Kargo in_transit/delivered geçişlerinde her iki tarafa bildirim.
      const { buyer, seller, orderId } = await paidOrder({ price: 110 });
      await markDelivered(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      const refundService = ctx.app.get(RefundService);
      const prisma = getPrisma();

      await refundService.applyReturnTrackingUpdate(createRes.body.id, {
        status: ShipmentStatus.in_transit,
        shippedAt: new Date(),
      });
      expect(
        await prisma.notificationLog.findFirst({
          where: { userId: buyer.id, type: "refund_return_in_transit" },
        }),
      ).toBeTruthy();
      expect(
        await prisma.notificationLog.findFirst({
          where: { userId: seller.id, type: "refund_return_shipped_seller" },
        }),
      ).toBeTruthy();

      await refundService.applyReturnTrackingUpdate(createRes.body.id, {
        status: ShipmentStatus.delivered,
        deliveredAt: new Date(),
      });
      expect(
        await prisma.notificationLog.findFirst({
          where: { userId: buyer.id, type: "refund_return_delivered_buyer" },
        }),
      ).toBeTruthy();
      expect(
        await prisma.notificationLog.findFirst({
          where: { userId: seller.id, type: "refund_return_delivered_seller" },
        }),
      ).toBeTruthy();
    });
  });

  // ══════════════════════════ Sipariş listesi / UI durumu (API tarafı) ══════════════════════════

  describe("Sipariş listesi iade durumu", () => {
    scenario("REF-074", async () => {
      // GET /api/orders?role=buyer → activeRefundRequest yansır (return_shipment_open).
      const { buyer, orderId } = await paidOrder({ price: 150 });
      await markDelivered(orderId);
      await createRefund(orderId, buyer, { reason: "changed_mind" }).expect(
        201,
      );

      const listRes = await request(server())
        .get("/api/orders?role=buyer")
        .set(authHeader(buyer))
        .expect(200);
      const row = (listRes.body.data as any[]).find((o) => o.id === orderId);
      expect(row).toBeTruthy();
      expect(row.activeRefundRequest?.status).toBe(
        RefundRequestStatus.return_shipment_open,
      );
    });

    scenario("REF-075", async () => {
      // Tamamlanmış iade varsayılan listede yok; refundsOnly=true "İadeler" sekmesinde var.
      const { buyer, orderId } = await paidOrder({ price: 175 });
      await markDelivered(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      const refundService = ctx.app.get(RefundService);
      const prisma = getPrisma();
      await prisma.refundRequest.update({
        where: { id: createRes.body.id },
        data: {
          status: RefundRequestStatus.return_delivered,
          returnDeliveredAt: new Date(Date.now() - 31 * 60 * 1000),
        },
      });
      await refundService.finalizeRefundForReturnedShipment(createRes.body.id);

      const def = await request(server())
        .get("/api/orders?role=buyer")
        .set(authHeader(buyer))
        .expect(200);
      expect(
        (def.body.data as any[]).find((o) => o.id === orderId),
      ).toBeFalsy();

      const refunds = await request(server())
        .get("/api/orders?role=buyer&refundsOnly=true")
        .set(authHeader(buyer))
        .expect(200);
      const row = (refunds.body.data as any[]).find((o) => o.id === orderId);
      expect(row).toBeTruthy();
      expect(row.activeRefundRequest?.status).toBe(
        RefundRequestStatus.refunded,
      );
    });
  });

  // ══════════════════════════ Para/vergi: kısmi iade & override-policy ══════════════════════════

  describe("Kısmi iade tutarı & admin override-policy", () => {
    scenario("REF-080", async () => {
      // Adet bazlı kısmi iade tutarı orantılı: refundQuantity=1, orderQty=3.
      const { buyer, orderId } = await paidOrder({ price: 300 });
      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: orderId },
        data: { quantity: 3 },
      });
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      const expected = Math.round((Number(order!.totalAmount) / 3) * 100) / 100;

      const res = await createRefund(orderId, buyer, {
        reason: "changed_mind",
        refundQuantity: 1,
      }).expect(201);
      expect(res.body.refundQuantity).toBe(1);
      expect(Number(res.body.amount)).toBeCloseTo(expected, 2);
    });

    scenario("REF-081", async () => {
      // refundQuantity=99 → orderQty'ye (2) clamp'lenir; amount=totalAmount.
      const { buyer, orderId } = await paidOrder({ price: 200 });
      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: orderId },
        data: { quantity: 2 },
      });
      const order = await prisma.order.findUnique({ where: { id: orderId } });

      const res = await createRefund(orderId, buyer, {
        reason: "changed_mind",
        refundQuantity: 99,
      }).expect(201);
      expect(res.body.refundQuantity).toBe(2);
      expect(Number(res.body.amount)).toBeCloseTo(
        Number(order!.totalAmount),
        2,
      );
    });

    // wait_for_delivery iade + admin (override-policy / set-shipping-payer) kurulumu.
    async function waitForDeliveryRefund(price = 300) {
      const { buyer, seller, orderId } = await paidOrder({ price });
      await markShipped(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      return { buyer, seller, orderId, refundId: createRes.body.id as string };
    }

    scenario("REF-082", async () => {
      // Admin override-policy ürün-only → tutar = total - shipping - buyerFee (< total).
      const { orderId, refundId } = await waitForDeliveryRefund();
      const admin = await createAdminUser(ctx.module);
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      const expected =
        Number(order!.totalAmount) -
        Number(order!.shippingCost) -
        Number(order!.buyerFeeAmount);

      await request(server())
        .patch(`/api/admin/refund-requests/${refundId}/override-policy`)
        .set(authHeader(admin))
        .send({
          refundProductAmount: true,
          refundShippingFee: false,
          refundBuyerFee: false,
          refundSellerCommission: false,
        })
        .expect(200);

      const rr = await prisma.refundRequest.findUnique({
        where: { id: refundId },
      });
      expect(Number(rr!.amount)).toBeCloseTo(expected, 2);
      expect(Number(rr!.amount)).toBeLessThan(Number(order!.totalAmount));
    });

    scenario("REF-083", async () => {
      // override-policy negatif ürün tutarı 0'a sabitlenir (yalnız ürün seçili, ürün payı negatifse).
      const { orderId, refundId } = await waitForDeliveryRefund();
      const admin = await createAdminUser(ctx.module);
      const prisma = getPrisma();
      // Ürün payı negatif olsun diye shipping + buyerFee'yi total'dan büyük yap.
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      await prisma.order.update({
        where: { id: orderId },
        data: {
          shippingCost: Number(order!.totalAmount),
          buyerFeeAmount: Number(order!.totalAmount),
        },
      });

      await request(server())
        .patch(`/api/admin/refund-requests/${refundId}/override-policy`)
        .set(authHeader(admin))
        .send({
          refundProductAmount: true,
          refundShippingFee: false,
          refundBuyerFee: false,
        })
        .expect(200);

      const rr = await prisma.refundRequest.findUnique({
        where: { id: refundId },
      });
      expect(Number(rr!.amount)).toBe(0);
    });

    scenario("REF-084", async () => {
      // refundSellerCommission alıcı iade tutarına EKLENMEZ.
      const { orderId, refundId } = await waitForDeliveryRefund();
      const admin = await createAdminUser(ctx.module);
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      // Varsayılan policy (ürün + shipping + buyerFee tümü true kabul edilir) → total.
      const productShippingBuyerFee = Number(order!.totalAmount);

      await request(server())
        .patch(`/api/admin/refund-requests/${refundId}/override-policy`)
        .set(authHeader(admin))
        .send({ refundSellerCommission: true })
        .expect(200);

      const rr = await prisma.refundRequest.findUnique({
        where: { id: refundId },
      });
      // Komisyon hesaba katılmaz → tutar ürün/shipping/buyerFee toplamını (total) aşmaz.
      expect(Number(rr!.amount)).toBeCloseTo(productShippingBuyerFee, 2);
    });

    scenario("REF-104", async () => {
      // Admin set-shipping-payer iade kargo tarafını günceller (seller).
      const { refundId } = await waitForDeliveryRefund();
      const admin = await createAdminUser(ctx.module);
      const prisma = getPrisma();

      await request(server())
        .patch(`/api/admin/refund-requests/${refundId}/set-shipping-payer`)
        .set(authHeader(admin))
        .send({ payer: "seller" })
        .expect(200);

      const rr = await prisma.refundRequest.findUnique({
        where: { id: refundId },
      });
      expect(rr!.returnShippingPayer).toBe("seller");
    });

    scenario("REF-105", async () => {
      // set-shipping-payer geçersiz değer → 400.
      const { refundId } = await waitForDeliveryRefund();
      const admin = await createAdminUser(ctx.module);
      await request(server())
        .patch(`/api/admin/refund-requests/${refundId}/set-shipping-payer`)
        .set(authHeader(admin))
        .send({ payer: "courier" })
        .expect(400);
    });
  });

  // ══════════════════════════ POST /payments/refund KALDIRILDI (güvenlik #61) ══════════════════════════
  // Buyer-facing doğrudan iade ucu, order.status kapısı OLMADAN processRefund çağırıyordu →
  // alıcı teslim SONRASI tam iade alıp malı da tutabiliyordu (RefundService state-machine
  // bypass'ı: cooling-off / iade penceresi / iade-kargosu-geri-teslim kontrolleri atlanıyordu).
  // Uç tamamen kaldırıldı; alıcı iadeleri YALNIZCA RefundController (POST /orders/:id/
  // refund-requests) state machine'inden geçer. processRefund paylaşılan executor olarak KALIR
  // (admin/cron/sürat/RefundService çağırır); yalnız buyer-facing doğrudan uç gitti.

  describe("POST /api/payments/refund kaldırıldı → RefundController", () => {
    scenario("REF-024", async () => {
      // Uç kaldırıldı → route yok → herkes için 404. JwtAuthGuard route'a bağlı olduğundan
      // artık çalışmaz: auth'suz istek bile 401 değil 404 alır. Meşru kargo-öncesi iade ise
      // RefundController (refund-requests) üzerinden çalışmaya devam eder (REF-001 ile aynı yol).
      const { buyer, seller, orderId } = await paidOrder({ price: 200 });
      const stranger = await createUser(ctx.module);
      const prisma = getPrisma();

      for (const who of [buyer, seller, stranger]) {
        await request(server())
          .post("/api/payments/refund")
          .set(authHeader(who))
          .send({ orderId })
          .expect(404);
      }
      await request(server())
        .post("/api/payments/refund")
        .send({ orderId })
        .expect(404); // auth'suz da 404

      // Uç 404 olsa da alıcı meşru yoldan kargo-öncesi iadeyi yapabilir → anlık iade.
      const rr = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      expect(rr.body.status).toBe(RefundRequestStatus.refunded);
      const payment = await prisma.payment.findFirst({ where: { orderId } });
      expect(payment!.status).toBe(PaymentStatus.refunded);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order!.status).toBe(OrderStatus.cancelled);
      expect(ctx.paytr.refundCalls).toHaveLength(1);
    });

    scenario("REF-085", async () => {
      // "Client-supplied refundAmount'a güvenme": buyer DTO'sunda (CreateRefundRequestDto)
      // tutar alanı YOK. Enjekte edilen refundAmount whitelist ValidationPipe ile strip edilir
      // → iade SUNUCU'nun hesapladığı tam tutarla (sipariş toplamı) işlenir, alıcı şişiremez.
      const { buyer, orderId } = await paidOrder({ price: 200 });
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });

      const rr = await createRefund(orderId, buyer, {
        reason: "changed_mind",
        refundAmount: 999999,
      }).expect(201);
      expect(rr.body.status).toBe(RefundRequestStatus.refunded);
      // Enjekte edilen 999999 DEĞİL, sunucunun hesapladığı sipariş toplamı iade edildi.
      expect(Number(rr.body.amount)).toBeCloseTo(Number(order!.totalAmount), 2);
      expect(ctx.paytr.refundCalls).toHaveLength(1);
      expect(ctx.paytr.refundCalls[0].refundAmount).toBeCloseTo(
        Number(order!.totalAmount),
        2,
      );
    });

    scenario("REF-093", async () => {
      // Payout completed iken iade reddi (çift-ödeme koruması). Guard artık RefundController
      // yolundan tetiklenir: createInstantRefund → processRefund guard'ı fırlatır →
      // createInstantRefund RefundRequest'i geri alıp 400 döndürür.
      const { buyer, seller, orderId } = await paidOrder({ price: 200 });
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold).toBeTruthy();
      // İcra edilmiş bir payout yerleştir → iade "Transfer zaten başlatılmış" ile reddedilmeli.
      await prisma.payoutTransfer.create({
        data: {
          paymentHoldId: hold!.id,
          sellerId: seller.id,
          amount: hold!.amount,
          commission: 0,
          netAmount: hold!.amount,
          merchantOid: `OID-${orderId.slice(0, 8)}`,
          transId: `TRANS-${orderId.slice(0, 12)}`,
          transferIban: "TR000000000000000000000000",
          transferName: "Test Seller",
          status: "completed",
        },
      });

      const res = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(400);
      expect(JSON.stringify(res.body)).toMatch(
        /Transfer zaten başlatılmış, iade yapılamaz/i,
      );
      // Guard fırladı → oluşturulan RefundRequest geri alındı (aktif talep kalmadı), PayTR yok.
      const rrs = await prisma.refundRequest.findMany({ where: { orderId } });
      expect(rrs).toHaveLength(0);
      expect(ctx.paytr.refundCalls).toHaveLength(0);
    });

    scenario("REF-122", async () => {
      // Anlık iade + payout yarışı: iade ÖNCE pending/retry_pending payout'ları
      // failed(order_refunded) yapar. Guard yine RefundController yolundan (createInstantRefund).
      const { buyer, seller, orderId } = await paidOrder({ price: 200 });
      const prisma = getPrisma();
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      const payout = await prisma.payoutTransfer.create({
        data: {
          paymentHoldId: hold!.id,
          sellerId: seller.id,
          amount: hold!.amount,
          commission: 0,
          netAmount: hold!.amount,
          merchantOid: `OID2-${orderId.slice(0, 8)}`,
          transId: `TRANS2-${orderId.slice(0, 12)}`,
          transferIban: "TR000000000000000000000000",
          transferName: "Test Seller",
          status: "pending",
        },
      });

      await createRefund(orderId, buyer, { reason: "changed_mind" }).expect(
        201,
      );

      const afterPayout = await prisma.payoutTransfer.findUnique({
        where: { id: payout.id },
      });
      expect(afterPayout!.status).toBe("failed");
      expect(afterPayout!.failureReason).toBe("order_refunded");
    });

    scenario("REF-143", async () => {
      // Satıcı alıcı adına iade tetikleyemez → 403. Doğrudan uç kaldırıldığından satıcı için
      // tek yol RefundController; o da buyerId kontrolüyle reddeder (aynı mesaj).
      const { seller, orderId } = await paidOrder({ price: 100 });
      const res = await request(server())
        .post(`/api/orders/${orderId}/refund-requests`)
        .set(authHeader(seller))
        .send({ reason: "changed_mind" })
        .expect(403);
      expect(JSON.stringify(res.body)).toMatch(
        /Sadece alıcı iade talebi oluşturabilir/i,
      );
    });

    // REF-144: POST /payments/refund rate-limit testi ARTIK KONUSUZ — uç #61 ile kaldırıldı.
    scenario.skip(
      "REF-144",
      "POST /payments/refund ucu #61 ile kaldırıldı → rate-limit senaryosu konusuz.",
    );

    scenario("REF-145", async () => {
      // [P0] REGRESYON (#61): Alıcı TESLİM EDİLMİŞ siparişi self-refund edip malı TUTAMAZ.
      // (a) Kaldırılan doğrudan uç → 404, PayTR iadesi yok. (b) Meşru yol (refund-requests)
      // teslim sonrası ANINDA para iadesi YAPMAZ; iade kargosu açar (mal geri gelmeli).
      // Ne PayTR iadesi ne hold iptali olur; ödeme completed kalır.
      const { buyer, orderId } = await paidOrder({ price: 200 });
      const prisma = getPrisma();
      await markDelivered(orderId);

      // (a) Kaldırılan uç → 404 (sömürü yolu yok), PayTR iadesi tetiklenmez.
      await request(server())
        .post("/api/payments/refund")
        .set(authHeader(buyer))
        .send({ orderId })
        .expect(404);
      expect(ctx.paytr.refundCalls).toHaveLength(0);

      // (b) Meşru yol: teslim sonrası → return_shipment_open (mal geri istenir), iade DEĞİL.
      const rr = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      expect(rr.body.status).toBe(RefundRequestStatus.return_shipment_open);

      // Hiç para iadesi olmadı: PayTR çağrısı yok, ödeme hâlâ completed, hold iptal edilmedi.
      expect(ctx.paytr.refundCalls).toHaveLength(0);
      const payment = await prisma.payment.findFirst({ where: { orderId } });
      expect(payment!.status).toBe(PaymentStatus.completed);
      const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
      expect(hold!.status).not.toBe(PaymentHoldStatus.cancelled);
    });
  });

  // ══════════════════════════ Cron idempotency / PayTR retry ══════════════════════════

  describe("processRefundedOrders idempotency & retry", () => {
    scenario("REF-090", async () => {
      // processRefundedOrders idempotent: 2. tur PayTR çağırmaz.
      const { buyer, orderId } = await paidOrder({ price: 110 });
      await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: "vazgeçtim" })
        .expect(200);

      const paymentService = ctx.app.get(PaymentService);
      await paymentService.processRefundedOrders();
      expect(ctx.paytr.refundCalls).toHaveLength(1);

      const second = await paymentService.processRefundedOrders();
      expect(second.refunded).toBe(0);
      expect(ctx.paytr.refundCalls).toHaveLength(1);
    });

    scenario("REF-091", async () => {
      // PayTR iadesi başarısızsa retry; sipariş refunded kalır, 2. tur tamamlar.
      const { buyer, orderId } = await paidOrder({ price: 180 });
      await request(server())
        .post(`/api/orders/${orderId}/cancel`)
        .set(authHeader(buyer))
        .send({ reason: "vazgeçtim" })
        .expect(200);

      const paymentService = ctx.app.get(PaymentService);
      const prisma = getPrisma();

      ctx.paytr.nextRefundFails = true;
      const first = await paymentService.processRefundedOrders();
      expect(first.failed).toBeGreaterThanOrEqual(1);
      const afterFail = await prisma.order.findUnique({
        where: { id: orderId },
      });
      expect(afterFail!.status).toBe(OrderStatus.refunded);
      const payAfterFail = await prisma.payment.findFirst({
        where: { orderId },
      });
      expect(payAfterFail!.status).not.toBe(PaymentStatus.refunded);

      const second = await paymentService.processRefundedOrders();
      expect(second.refunded).toBeGreaterThanOrEqual(1);
      const finalOrder = await prisma.order.findUnique({
        where: { id: orderId },
      });
      expect(finalOrder!.status).toBe(OrderStatus.cancelled);
      const finalPay = await prisma.payment.findFirst({ where: { orderId } });
      expect(finalPay!.status).toBe(PaymentStatus.refunded);
    });

    scenario("REF-092", async () => {
      // Anlık iade PayTR hatasında RefundRequest rollback; retry "zaten aktif"e takılmaz.
      const { buyer, orderId } = await paidOrder({ price: 100 });
      const prisma = getPrisma();

      ctx.paytr.nextRefundFails = true;
      // İlk istek: PayTR hatası → 500 (HttpException değil), RefundRequest rollback.
      const first = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      });
      expect(first.status).toBeGreaterThanOrEqual(400);
      const count = await prisma.refundRequest.count({ where: { orderId } });
      expect(count).toBe(0);

      // İkinci istek: "zaten aktif iade"ye TAKILMAZ, başarıyla tamamlanır.
      const second = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      expect(second.body.status).toBe(RefundRequestStatus.refunded);
    });

    scenario("REF-121", async () => {
      // Eşzamanlı iki iade talebi (aynı sipariş) — en fazla biri 201, diğeri 400.
      const { buyer, orderId } = await paidOrder({ price: 100 });
      await markShipped(orderId);
      const [a, b] = await Promise.all([
        createRefund(orderId, buyer, { reason: "changed_mind" }),
        createRefund(orderId, buyer, { reason: "changed_mind" }),
      ]);
      const statuses = [a.status, b.status];
      const successCount = statuses.filter((s) => s === 201).length;
      // Ana değişmez: aynı sipariş için en fazla bir aktif iade oluşabilir.
      // (Salt app-katmanı guard'ı; DB unique kısıtı yok — iki paralel istek nadiren
      // ikisi de 201 dönebilir; o durumda bu test guard'daki yarışı ORTAYA ÇIKARIR.)
      expect(successCount).toBeLessThanOrEqual(1);
      // Kaybeden istek "zaten aktif" (400) döner.
      expect(statuses).toContain(400);
    });
  });

  // ══════════════════════════ Admin iade yönetimi & yetki matrisi ══════════════════════════

  describe("Admin iade yönetimi & yetki", () => {
    scenario("REF-100", async () => {
      // Admin iade taleplerini listeler (sayfalı). Bir wait_for_delivery talebi seed edilir.
      const admin = await createAdminUser(ctx.module, {
        role: AdminRole.admin,
      });
      const { buyer, orderId } = await paidOrder({ price: 120 });
      await markShipped(orderId);
      await createRefund(orderId, buyer, { reason: "changed_mind" }).expect(
        201,
      );

      // status[]=wait_for_delivery (dizi param) — DTO @IsArray + @IsEnum each.
      const res = await request(server())
        .get(
          "/api/admin/refund-requests?status[]=wait_for_delivery&page=1&limit=20",
        )
        .set(authHeader(admin))
        .expect(200);
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(20);
      expect(typeof res.body.total).toBe("number");
    });

    scenario("REF-101", async () => {
      // Moderator iade taleplerini listeleyemez → 403.
      const mod = await createAdminUser(ctx.module, {
        role: AdminRole.moderator,
      });
      const res = await request(server())
        .get("/api/admin/refund-requests")
        .set(authHeader(mod))
        .expect(403);
      expect(res.body.message).toMatch(/\[refund_requests\].*Rol: moderator/i);
    });

    scenario("REF-102", async () => {
      // Moderator detay/force-finalize/override-policy/set-shipping-payer tetikleyemez → hepsi 403.
      const mod = await createAdminUser(ctx.module, {
        role: AdminRole.moderator,
      });
      const fakeId = "a0000000-0000-4000-8000-000000000000";
      await request(server())
        .get(`/api/admin/refund-requests/${fakeId}`)
        .set(authHeader(mod))
        .expect(403);
      await request(server())
        .post(`/api/admin/refund-requests/${fakeId}/force-finalize`)
        .set(authHeader(mod))
        .expect(403);
      await request(server())
        .patch(`/api/admin/refund-requests/${fakeId}/override-policy`)
        .set(authHeader(mod))
        .send({ refundShippingFee: false })
        .expect(403);
      await request(server())
        .patch(`/api/admin/refund-requests/${fakeId}/set-shipping-payer`)
        .set(authHeader(mod))
        .send({ payer: "seller" })
        .expect(403);
    });

    scenario("REF-103", async () => {
      // Moderator takas retry-refund tetikleyemez → 403 (@RequirePermission('refund_requests')).
      const mod = await createAdminUser(ctx.module, {
        role: AdminRole.moderator,
      });
      const fakeId = "a0000000-0000-4000-8000-000000000000";
      await request(server())
        .post(`/api/admin/trades/${fakeId}/retry-refund`)
        .set(authHeader(mod))
        .expect(403);
    });

    scenario("REF-106", async () => {
      // Admin force-finalize yalnızca return_delivered'da çalışır.
      const admin = await createAdminUser(ctx.module);
      const { buyer, orderId } = await paidOrder({ price: 120 });
      await markDelivered(orderId);
      const createRes = await createRefund(orderId, buyer, {
        reason: "changed_mind",
      }).expect(201);
      const refundId = createRes.body.id;
      const prisma = getPrisma();

      // (1) return_shipment_open → 400
      const r1 = await request(server())
        .post(`/api/admin/refund-requests/${refundId}/force-finalize`)
        .set(authHeader(admin))
        .expect(400);
      expect(r1.body.message).toMatch(/uygun değil.*return_delivered/i);

      // (2) return_delivered → 200 (refunded)
      await prisma.refundRequest.update({
        where: { id: refundId },
        data: {
          status: RefundRequestStatus.return_delivered,
          returnDeliveredAt: new Date(),
        },
      });
      const r2 = await request(server())
        .post(`/api/admin/refund-requests/${refundId}/force-finalize`)
        .set(authHeader(admin))
        .expect(200);
      expect(r2.body.status).toBe(RefundRequestStatus.refunded);

      // (3) zaten refunded → 400
      const r3 = await request(server())
        .post(`/api/admin/refund-requests/${refundId}/force-finalize`)
        .set(authHeader(admin))
        .expect(400);
      expect(r3.body.message).toMatch(/zaten tamamlanmış/i);
    });

    scenario("REF-107", async () => {
      // Admin manuel iade (POST /admin/payments/:id/manual-refund).
      const admin = await createAdminUser(ctx.module);
      const { orderId } = await paidOrder({ price: 150 });
      const prisma = getPrisma();
      const payment = await prisma.payment.findFirst({ where: { orderId } });

      const res = await request(server())
        .post(`/api/admin/payments/${payment!.id}/manual-refund`)
        .set(authHeader(admin))
        .send({ amount: Number(payment!.amount), reason: "Test manuel iade" })
        .expect(200);
      expect(res.body.success).toBe(true);

      const after = await prisma.payment.findUnique({
        where: { id: payment!.id },
      });
      expect(after!.status).toBe(PaymentStatus.refunded);
      const audit = await prisma.auditLog.findFirst({
        where: { action: "payment_manual_refund" },
      });
      expect(audit).toBeTruthy();
    });
  });

  // ══════════════════════════ Takas (karşı-ödemeli) iptal → iade ══════════════════════════

  describe("Takas cash iptal → iade", () => {
    scenario("REF-110", async () => {
      // Karşı-ödemeli takas kargo öncesi iptal → tam PayTR iadesi + rezervasyon serbest.
      const prisma = getPrisma();
      const initiator = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const receiver = await createUser(ctx.module, {
        isSeller: true,
        premium: true,
      });
      const ip = await createProduct({
        sellerId: initiator.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        price: 200,
        quantity: 1,
      });
      const rp = await createProduct({
        sellerId: receiver.id,
        categoryId: baseline.categoryId,
        isTradeEnabled: true,
        price: 200,
        quantity: 1,
      });
      await createAddress({ userId: initiator.id });
      await createAddress({ userId: receiver.id });

      const created = await request(server())
        .post("/api/trades")
        .set(authHeader(initiator))
        .send({
          receiverId: receiver.id,
          initiatorItems: [{ productId: ip.id, quantity: 1 }],
          receiverItems: [{ productId: rp.id, quantity: 1 }],
          cashAmount: 100,
        })
        .expect(201);
      const tradeId: string = created.body.id;

      await request(server())
        .post(`/api/trades/${tradeId}/accept`)
        .set(authHeader(receiver))
        .send({})
        .expect(201);
      expect(
        (await prisma.product.findUnique({ where: { id: ip.id } }))!
          .reservedQuantity,
      ).toBe(1);
      expect(
        (await prisma.product.findUnique({ where: { id: rp.id } }))!
          .reservedQuantity,
      ).toBe(1);

      const cashBefore = await prisma.tradeCashPayment.findUnique({
        where: { tradeId },
      });
      await request(server())
        .post("/api/payments/initiate-trade-cash")
        .set(authHeader(initiator))
        .send({ tradeId })
        .expect(201);
      const payment = await prisma.payment.findFirst({
        where: { tradeCashPaymentId: cashBefore!.id },
      });
      await request(server())
        .post("/api/payments/callback/paytr")
        .send(
          signCallback({
            merchantOid: payment!.providerConversationId!,
            status: "success",
            totalAmount: Math.round(Number(payment!.amount) * 100),
          }),
        )
        .expect(200);
      const cashAfterPay = await prisma.tradeCashPayment.findUnique({
        where: { tradeId },
      });
      expect(cashAfterPay!.releasedAt).toBeNull();
      expect(ctx.paytr.refundCalls).toHaveLength(0);

      await request(server())
        .post(`/api/trades/${tradeId}/cancel`)
        .set(authHeader(initiator))
        .send({ reason: "vazgeçtik" })
        .expect(201);

      expect(ctx.paytr.refundCalls).toHaveLength(1);
      const expectedAmount = Number(
        cashAfterPay!.totalAmount ?? payment!.amount,
      );
      expect(ctx.paytr.refundCalls[0].refundAmount).toBe(expectedAmount);
      const cashAfterCancel = await prisma.tradeCashPayment.findUnique({
        where: { tradeId },
      });
      expect(cashAfterCancel!.refundedAt).not.toBeNull();
      expect(
        (await prisma.product.findUnique({ where: { id: ip.id } }))!
          .reservedQuantity,
      ).toBe(0);
      expect(
        (await prisma.product.findUnique({ where: { id: rp.id } }))!
          .reservedQuantity,
      ).toBe(0);
    });

    scenario("REF-111", async () => {
      // Takas retry-refund idempotent; olmayan/geçersiz durumda 4xx döner (super_admin yetkili).
      const admin = await createAdminUser(ctx.module);
      // retryTradeRefund yalnız returning/cancelled/disputed durumda anlamlıdır; burada
      // olmayan bir trade ile çağrılınca 404 döner — yetki geçtiği (super_admin) kanıtlanır.
      const res = await request(server())
        .post(
          `/api/admin/trades/a0000000-0000-4000-8000-000000000000/retry-refund`,
        )
        .set(authHeader(admin));
      expect([400, 404]).toContain(res.status);
    });
  });

  // ══════════════════════════ Uygulanamaz / saf-UI senaryolar ══════════════════════════

  // REF-064: Sürat entegrasyonu KAPALIYKEN manuel kargo açılır. Env global sabit
  // olsa da SuratCargoService.isIntegrationEnabled() metodunu per-test spy'lamak
  // (03-mem/09-ord altın deseni) app davranışını bozmadan bu yolu deterministik
  // kılar; jest.restoreAllMocks() beforeEach'te spy'ı geri alır.
  scenario("REF-064", async () => {
    // Sipariş/kargo NORMAL akışta oluşsun (satın alma sırasında Sürat açık kalsın);
    // yalnız İADE kargosu açılırken entegrasyonu kapatıp manuel yolu zorlarız.
    const { buyer, orderId } = await paidOrder({ price: 130 });
    await markDelivered(orderId);

    const surat = ctx.app.get(SuratCargoService);
    jest.spyOn(surat, "isIntegrationEnabled").mockReturnValue(false);
    const shipmentCallsBefore = ctx.surat.shipmentCalls.length;

    const res = await createRefund(orderId, buyer, {
      reason: "changed_mind",
    }).expect(201);
    // Sürat kapalı → return_shipment_open ama provider 'manual', takip no = refundNumber.
    expect(res.body.status).toBe(RefundRequestStatus.return_shipment_open);
    expect(res.body.returnProvider).toBe("manual");
    expect(res.body.returnTrackingNumber).toMatch(/^RFD-[0-9A-Z]{10,14}$/);
    expect(res.body.returnTrackingNumber).toBe(res.body.refundNumber);
    // Manuel yolda Sürat'a yeni iade-kargo çağrısı YAPILMAZ.
    expect(ctx.surat.shipmentCalls.length).toBe(shipmentCallsBefore);
  });

  // REF-094: PAYMENT_BYPASS modunda PayTR iade çağrısı atlanır. refundResult.bypass
  // HTTP yanıtında dönmese de GÖZLEMLENEBİLİR etki nettir: PayTR createRefund HİÇ
  // çağrılmaz (ctx.paytr.refundCalls boş kalır) ama iade DB'de tamamlanır. Flag'i
  // ConfigService.get spy'ıyla (03-mem altın deseni) deterministik açarız.
  scenario("REF-094", async () => {
    // Önce siparişi NORMAL akışta ödet (bypass spy'ını ödeme tamamlandıktan sonra
    // aç ki checkout/callback davranışı değişmesin — yalnız iade yolu bypass'lansın).
    const { buyer, orderId } = await paidOrder({ price: 120 });

    const cfg = ctx.app.get(ConfigService);
    const real = cfg.get.bind(cfg);
    jest
      .spyOn(cfg, "get")
      .mockImplementation((key: any, def?: any) =>
        key === "PAYMENT_BYPASS" ? "true" : real(key, def),
      );

    // preparing (shipment pending) → anlık iade yolu; bypass ile PayTR atlanır.
    const res = await createRefund(orderId, buyer, {
      reason: "changed_mind",
    }).expect(201);
    expect(res.body.status).toBe(RefundRequestStatus.refunded);

    // Bypass: PayTR createRefund HİÇ çağrılmadı, ama iade tamamlandı.
    expect(ctx.paytr.refundCalls).toHaveLength(0);
    const prisma = getPrisma();
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order!.status).toBe(OrderStatus.cancelled);
    const payment = await prisma.payment.findFirst({ where: { orderId } });
    expect(payment!.status).toBe(PaymentStatus.refunded);
  });

  // REF-130: Web iade detay TR/EN metinleri — saf web UI (apps/web), API e2e kapsamı dışı.
  scenario.skip(
    "REF-130",
    "Saf web UI (i18n metinleri) — API e2e ile doğrulanamaz.",
  );

  // REF-131: Mobil iade ekranı yalnızca TR — harici istemci UI kapsamı.
  scenario.skip(
    "REF-131",
    "Harici mobil istemci UI testi — API e2e ile doğrulanamaz.",
  );

  // REF-133: Sebep etiketleri parite (counterfeit/lost_in_transit) — web/mobil reasonLabels UI.
  scenario.skip(
    "REF-133",
    "Saf web/mobil UI (reasonLabels eşlemesi) — API e2e ile doğrulanamaz.",
  );

  // REF-134: Sipariş listesi durum rozeti (İptal Edildi vs İade Edildi) — UI rozet metni.
  // API tarafı (cancellationType) REF-001/REF-072'de doğrulanıyor; rozet metni saf UI.
  scenario.skip(
    "REF-134",
    "Saf UI rozet metni (İptal/İade Edildi) — cancellationType API tarafı REF-001/REF-072 kapsıyor.",
  );
});
