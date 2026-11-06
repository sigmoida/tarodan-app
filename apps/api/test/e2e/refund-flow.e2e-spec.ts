import * as request from "supertest";
import {
  OrderStatus,
  PaymentHoldStatus,
  PaymentStatus,
  RefundRequestStatus,
  ShipmentStatus,
} from "@prisma/client";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import {
  createUser,
  createAdminUser,
  authHeader,
} from "../factories/user.factory";
import { createProduct } from "../factories/product.factory";
import { createAddress } from "../factories/address.factory";
import { buyAndPay, buyNow, latestPaymentOfOrder } from "../factories/flows";
import { resolveTimingValue } from "../../src/common/timing-rules";
import { RefundService } from "../../src/modules/refund/refund.service";
import { PaymentService } from "../../src/modules/payment/payment.service";

describe("Refund flow (E2E)", () => {
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
    ctx.surat.reset();
  });

  it("paid + not yet shipped → instant refund (PayTR refund + Sürat cancel + Order=cancelled)", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 250,
      quantity: 1,
    });
    const buyerAddr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, buyerAddr.id);
    const prisma = getPrisma();

    const shipmentBefore = await prisma.shipment.findFirst({
      where: { orderId },
    });
    expect(shipmentBefore?.provider).toBe("surat");
    // buyAndPay waits for fulfillment, which books the Surat label: the
    // parcel is labelled but not yet handed to the carrier.
    expect(shipmentBefore?.status).toBe(ShipmentStatus.label_created);

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(201);

    expect(res.body.status).toBe(RefundRequestStatus.refunded);
    expect(res.body.refundNumber).toMatch(/^RFD-[0-9A-Z]{10,14}$/);
    expect(res.body.refundedAt).toBeTruthy();

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order!.status).toBe(OrderStatus.cancelled);

    const shipmentAfter = await prisma.shipment.findUnique({
      where: { id: shipmentBefore!.id },
    });
    expect(shipmentAfter!.status).toBe(ShipmentStatus.cancelled);

    expect(ctx.paytr.refundCalls.length).toBe(1);
    // The Surat shipment is booked per seller package (a3588f12e), so the
    // cancel goes by the package number, not the order number.
    const pkg = await prisma.orderPackage.findUniqueOrThrow({
      where: { id: order!.packageId! },
    });
    expect(ctx.surat.cancelCalls).toContain(pkg.packageNumber);

    const payment = await latestPaymentOfOrder(orderId);
    expect(payment!.status).toBe(PaymentStatus.refunded);
  });

  it("rejects duplicate active refund requests for the same order", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 100,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

    const prisma = getPrisma();
    // Force order into a phase where a non-instant request is created
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: { status: ShipmentStatus.in_transit },
    });

    await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(201);

    const dup = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(400);

    expect(dup.body.message).toMatch(/zaten aktif bir iade/i);
  });

  it("shipped (in_transit) → wait_for_delivery; delivered + cron → return shipment opens with Iademi=true", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 150,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    // A distinct seller address, so the direction check below can fail: the
    // factory default is the same street for every user.
    await createAddress({ userId: seller.id, address: "Satıcı Sok. No:2" });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    // Move order to shipped/in_transit
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: {
        status: ShipmentStatus.in_transit,
        trackingNumber: "TEST-TRK",
        providerTrackingId: "TEST-TRK",
      },
    });

    const createRes = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(201);

    expect(createRes.body.status).toBe(RefundRequestStatus.wait_for_delivery);
    expect(createRes.body.returnTrackingNumber).toBeNull();

    const refundService = ctx.app.get(RefundService);

    // Cron: nothing to open yet (not delivered)
    const pendingBefore = await refundService.findPendingDeliveryToOpenReturn();
    expect(pendingBefore).toHaveLength(0);

    // Mark order delivered
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: {
        status: ShipmentStatus.delivered,
        deliveredAt: new Date(),
      },
    });

    const pendingAfter = await refundService.findPendingDeliveryToOpenReturn();
    expect(pendingAfter).toHaveLength(1);

    await refundService.openReturnShipment(pendingAfter[0]);

    const rr = await prisma.refundRequest.findUnique({
      where: { id: createRes.body.id },
    });
    expect(rr!.status).toBe(RefundRequestStatus.return_shipment_open);
    expect(rr!.returnProvider).toBe("surat");
    expect(rr!.returnTrackingNumber).toMatch(/^RFD-[0-9A-Z]{10,14}$/);

    // Stub recorded a return shipment, and it goes the RIGHT WAY: an iade is a
    // direction change, so the buyer is the sender and the seller (or, when the
    // seller has no address, the warehouse) is the recipient.
    const returnCall = ctx.surat.shipmentCalls.find(
      (c) => c.reference === rr!.returnTrackingNumber,
    );
    expect(returnCall).toBeDefined();
    expect(returnCall!.isReturn).toBe(true);
    expect(returnCall!.sender.address).toContain("Atatürk Cad. No:1"); // buyer
    expect(returnCall!.recipient.address).toContain("Satıcı Sok. No:2"); // seller
  });

  it("14-day cooling-off (delivered, ≤14 days) → return shipment opens immediately, no seller approval needed", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 80,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: {
        status: ShipmentStatus.delivered,
        deliveredAt: new Date(),
        trackingNumber: "DELIV-1",
        providerTrackingId: "DELIV-1",
      },
    });

    const createRes = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(201);

    // Auto-approved — return shipment opens during create call (no seller step)
    expect(createRes.body.status).toBe(
      RefundRequestStatus.return_shipment_open,
    );
    expect(createRes.body.returnProvider).toBe("surat");
    expect(createRes.body.returnTrackingNumber).toMatch(
      /^RFD-[0-9A-Z]{10,14}$/,
    );

    const returnCall = ctx.surat.shipmentCalls.find(
      (c) => c.reference === createRes.body.returnTrackingNumber,
    );
    expect(returnCall).toBeDefined();
    expect(returnCall!.isReturn).toBe(true);
  });

  it("past 14 days → refund is blocked entirely (no description/evidence path anymore)", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 60,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    const oldDelivery = new Date(Date.now() - 20 * 24 * 3600 * 1000);
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: {
        status: ShipmentStatus.delivered,
        deliveredAt: oldDelivery,
        trackingNumber: "OLD-1",
        providerTrackingId: "OLD-1",
      },
    });

    // Once the return window has closed no refund request can be opened,
    // with or without evidence (the old "past_cooling_off + evidence" seller
    // dispute flow was removed). Both requests are refused for the window,
    // not for another reason. The first uses a reason that needs no
    // evidence: refund-creation checks evidence before the window, so a
    // `damaged` request without photos gets the evidence error instead.
    const expectWindowClosed = (res: request.Response) =>
      expect(res.body.i18nKey).toBe("server.refund.coolingOffExpired");

    await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind", description: "no longer needed" })
      .expect(400)
      .expect(expectWindowClosed);

    await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({
        reason: "damaged",
        description: "The package arrived torn and the door is broken.",
        evidencePhotoUrls: ["https://example.com/photo1.jpg"],
      })
      .expect(400)
      .expect(expectWindowClosed);

    expect(await prisma.refundRequest.count({ where: { orderId } })).toBe(0);
    expect(ctx.paytr.refundCalls).toHaveLength(0);
  });

  it("refuses refund on pending_payment order (must cancel order instead)", async () => {
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

    const res = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${buyRes.body.orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(400);

    expect(res.body.message).toMatch(/ödenmemiş/i);
  });

  it("only the buyer can request refund", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const stranger = await createUser(ctx.module);
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 90,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

    await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(stranger))
      .send({ reason: "changed_mind" })
      .expect(403);
  });

  // ── E. Escrow hold ↔ iade etkileşimi ───────────────────────────────────
  it("E1: cooling-off iade açılınca satıcı PaymentHold dondurulur (frozenByRefundId)", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 120,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    // Ödeme sonrası hold oluşur ve henüz dondurulmamıştır
    const holdBefore = await prisma.paymentHold.findFirst({
      where: { orderId },
    });
    expect(holdBefore).toBeTruthy();
    expect(holdBefore!.status).toBe(PaymentHoldStatus.held);
    expect(holdBefore!.frozenByRefundId).toBeNull();

    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: { status: ShipmentStatus.delivered, deliveredAt: new Date() },
    });

    const createRes = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(201);

    const holdAfter = await prisma.paymentHold.findFirst({
      where: { orderId },
    });
    expect(holdAfter!.frozenByRefundId).toBe(createRes.body.id);
  });

  it("E3: iade iptal edilince hold kilidi çözülür (frozenByRefundId → null)", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 140,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    // Kargoda ama henüz teslim değil → talep wait_for_delivery'de kalır (iptal edilebilir)
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: {
        status: ShipmentStatus.in_transit,
        trackingNumber: "TRK-E3",
        providerTrackingId: "TRK-E3",
      },
    });

    const createRes = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(201);
    expect(createRes.body.status).toBe(RefundRequestStatus.wait_for_delivery);

    const frozen = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(frozen!.frozenByRefundId).toBe(createRes.body.id);

    await request(ctx.app.getHttpServer())
      .post(`/api/refund-requests/${createRes.body.id}/cancel`)
      .set(authHeader(buyer))
      .expect(200);

    const unfrozen = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(unfrozen!.frozenByRefundId).toBeNull();
    expect(unfrozen!.status).toBe(PaymentHoldStatus.held);
  });

  it("E2/E4: iade açıkken releaseAt geçmiş olsa bile hold serbest BIRAKILMAZ (frozen guard)", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 160,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    // Teslim + cooling-off iade → hold dondurulur
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: { status: ShipmentStatus.delivered, deliveredAt: new Date() },
    });
    const createRes = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(201);

    // 14. gün yarışı: releaseAt'i geçmişe çek — ama hold frozen olduğu için cron atlamalı
    await prisma.paymentHold.updateMany({
      where: { orderId },
      data: { releaseAt: new Date(Date.now() - 60_000) },
    });

    const paymentService = ctx.app.get(PaymentService);
    await paymentService.releaseHoldsDue();

    const hold = await prisma.paymentHold.findFirst({ where: { orderId } });
    expect(hold!.status).toBe(PaymentHoldStatus.held); // released DEĞİL
    expect(hold!.releasedAt).toBeNull();
    expect(hold!.frozenByRefundId).toBe(createRes.body.id);

    // Donmuş hold için payout oluşmamalı
    const payouts = await prisma.payoutTransfer.findMany({
      where: { paymentHold: { orderId } },
    });
    expect(payouts).toHaveLength(0);
  });

  // C3/C6 (admin override-policy, set-shipping-payer) were removed with
  // their endpoints in ead37893b: one decision flow remains,
  // decision-preview + approve (component-based policy).

  // ── Liste yanıtı iade durumunu yansıtır (sipariş listesi ↔ detay tutarlılığı) ──
  it("LIST: teslim edilmiş siparişte aktif iade açıksa GET /orders yanıtı activeRefundRequest döner", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 150,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });
    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    // Teslim edildi + cooling-off iade açıldı (sipariş status'u 'delivered' kalır)
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: { status: ShipmentStatus.delivered, deliveredAt: new Date() },
    });
    await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(201);

    // Liste yanıtı: ilgili sipariş activeRefundRequest içermeli (fix öncesi null'dı →
    // liste "Teslim Edildi" gösteriyordu; detay ise iade gösteriyordu = tutarsızlık)
    const listRes = await request(ctx.app.getHttpServer())
      .get("/api/orders?role=buyer")
      .set(authHeader(buyer))
      .expect(200);

    const row = (listRes.body.data as any[]).find((o) => o.id === orderId);
    expect(row).toBeTruthy();
    expect(row.activeRefundRequest).toBeTruthy();
    expect(row.activeRefundRequest.status).toBe(
      RefundRequestStatus.return_shipment_open,
    );
  });

  it('LIST: refundsOnly=true tamamlanmış iadeyi (order cancelled olsa bile) "İadeler" sekmesinde gösterir', async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 175,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });
    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    // Teslim → cooling-off iade → finalize → refunded (+ order cancelled)
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: { status: ShipmentStatus.delivered, deliveredAt: new Date() },
    });
    const createRes = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(201);
    const refundService = ctx.app.get(RefundService);
    await prisma.refundRequest.update({
      where: { id: createRes.body.id },
      data: {
        status: RefundRequestStatus.return_delivered,
        returnDeliveredAt: new Date(Date.now() - 31 * 60 * 1000),
      },
    });
    await refundService.finalizeRefundForReturnedShipment(createRes.body.id);

    // Varsayılan liste (cancelled hariç) → sipariş YOK
    const def = await request(ctx.app.getHttpServer())
      .get("/api/orders?role=buyer")
      .set(authHeader(buyer))
      .expect(200);
    expect((def.body.data as any[]).find((o) => o.id === orderId)).toBeFalsy();

    // İadeler sekmesi (refundsOnly) → sipariş VAR, "İade Edildi"
    const refunds = await request(ctx.app.getHttpServer())
      .get("/api/orders?role=buyer&refundsOnly=true")
      .set(authHeader(buyer))
      .expect(200);
    const row = (refunds.body.data as any[]).find((o) => o.id === orderId);
    expect(row).toBeTruthy();
    expect(row.activeRefundRequest?.status).toBe(RefundRequestStatus.refunded);
  });

  // ── I/J. Cron idempotency + bildirimler ────────────────────────────────
  it("I1: processRefundedOrders idempotent — iade tamamlandıktan sonra ikinci tur PayTR çağırmaz", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 110,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });
    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

    await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/cancel`)
      .set(authHeader(buyer))
      .send({ reasonCode: "changed_mind", reason: "vazgeçtim" })
      .expect(200);

    const paymentService = ctx.app.get(PaymentService);
    await paymentService.processRefundedOrders(); // 1. tur: iade yapılır
    expect(ctx.paytr.refundCalls).toHaveLength(1);

    // 2. tur: aynı sipariş artık cancelled/refunded — tekrar PayTR ÇAĞRILMAZ
    const second = await paymentService.processRefundedOrders();
    expect(second.refunded).toBe(0);
    expect(ctx.paytr.refundCalls).toHaveLength(1);
  });

  it("J1: cooling-off iade onaylanınca alıcıya REFUND_APPROVED bildirimi gider", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 95,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });
    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    // Kargoda ama teslim değil → cooling-off wait_for_delivery (REFUND_APPROVED burada gider)
    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: {
        status: ShipmentStatus.in_transit,
        trackingNumber: "TRK-J1",
        providerTrackingId: "TRK-J1",
      },
    });
    await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(201);

    const notif = await prisma.notificationLog.findFirst({
      where: { userId: buyer.id, type: "refund_approved" },
    });
    expect(notif).toBeTruthy();
  });

  it("J2: alıcı iade talebini iptal edince satıcıya REFUND_CANCELLED bildirimi gider", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 88,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });
    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: {
        status: ShipmentStatus.in_transit,
        trackingNumber: "TRK-J2",
        providerTrackingId: "TRK-J2",
      },
    });
    const createRes = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(201);

    await request(ctx.app.getHttpServer())
      .post(`/api/refund-requests/${createRes.body.id}/cancel`)
      .set(authHeader(buyer))
      .expect(200);

    const notif = await prisma.notificationLog.findFirst({
      where: { userId: seller.id, type: "refund_cancelled" },
    });
    expect(notif).toBeTruthy();
  });

  // ── B. İade kargosu yaşam döngüsü + finalize ───────────────────────────
  it("B3/B5: iade kargo takibi in_transit→delivered ilerler; 30dk sonra finalize cron iadeyi tamamlar", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 130,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });
    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: { status: ShipmentStatus.delivered, deliveredAt: new Date() },
    });
    const createRes = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(201);
    expect(createRes.body.status).toBe(
      RefundRequestStatus.return_shipment_open,
    );

    const refundService = ctx.app.get(RefundService);
    const refundId = createRes.body.id;

    // B3: kargo yola çıktı → return_in_transit
    await refundService.applyReturnTrackingUpdate(refundId, {
      status: ShipmentStatus.in_transit,
      shippedAt: new Date(),
    });
    let rr = await prisma.refundRequest.findUnique({ where: { id: refundId } });
    expect(rr!.status).toBe(RefundRequestStatus.return_in_transit);

    // B3: satıcıya teslim edildi → return_delivered
    await refundService.applyReturnTrackingUpdate(refundId, {
      status: ShipmentStatus.delivered,
      deliveredAt: new Date(),
    });
    rr = await prisma.refundRequest.findUnique({ where: { id: refundId } });
    expect(rr!.status).toBe(RefundRequestStatus.return_delivered);

    // B5: not in the finalize list before the inspection window ends
    const early = await refundService.findReturnDeliveredPendingFinalize();
    expect(early).not.toContain(refundId);

    // Push returnDeliveredAt past the inspection window so finalize is due.
    // The window is the returnInspectionHours rule (default 24 h) since
    // 1ded7dcba, no longer a fixed 30 minutes.
    const inspectionHours = await resolveTimingValue(
      prisma as any,
      "returnInspectionHours",
    );
    await prisma.refundRequest.update({
      where: { id: refundId },
      data: {
        returnDeliveredAt: new Date(
          Date.now() - (inspectionHours * 60 + 1) * 60 * 1000,
        ),
      },
    });
    const due = await refundService.findReturnDeliveredPendingFinalize();
    expect(due).toContain(refundId);

    await refundService.finalizeRefundForReturnedShipment(refundId);
    const finalRr = await prisma.refundRequest.findUnique({
      where: { id: refundId },
    });
    expect(finalRr!.status).toBe(RefundRequestStatus.refunded);
    expect(finalRr!.refundedAt).toBeTruthy();
    expect(ctx.paytr.refundCalls).toHaveLength(1);

    // "İade Sürecinde" → "İade Edildi" geçişi: alıcıya REFUND_COMPLETED bildirimi gider
    const notif = await prisma.notificationLog.findFirst({
      where: { userId: buyer.id, type: "refund_completed" },
    });
    expect(notif).toBeTruthy(); // alıcıya iade tamamlandı bildirimi

    // Tam iade tamamlanınca order.status='cancelled' olur (processRefund) → sipariş
    // varsayılan listeden (cancelled hariç) düşer, "İptal Edilenler" (status=cancelled)
    // sekmesinde activeRefundRequest.status='refunded' ile görünür → UI "İade Edildi".
    const cancelledList = await request(ctx.app.getHttpServer())
      .get("/api/orders?role=buyer&status=cancelled")
      .set(authHeader(buyer))
      .expect(200);
    const row = (cancelledList.body.data as any[]).find(
      (o) => o.id === orderId,
    );
    expect(row?.activeRefundRequest?.status).toBe(RefundRequestStatus.refunded);
  });

  it("B6: satıcının adresi YOKKEN iade kargosu depo adresi fallback ile yine de açılır", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 90,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    // NOT: satıcı adresi OLUŞTURULMUYOR → warehouseReturnAddress() fallback'i test edilir
    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.delivered },
    });
    await prisma.shipment.update({
      where: { orderId },
      data: { status: ShipmentStatus.delivered, deliveredAt: new Date() },
    });

    const createRes = await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/refund-requests`)
      .set(authHeader(buyer))
      .send({ reason: "changed_mind" })
      .expect(201);

    // Satıcı adresi olmamasına rağmen iade kargosu açılmalı (fallback)
    expect(createRes.body.status).toBe(
      RefundRequestStatus.return_shipment_open,
    );
    expect(createRes.body.returnProvider).toBe("surat");
  });

  // ── F. Sipariş iptali → iade ────────────────────────────────────────────
  // Since c418e44f2 (enforce refund settlement policies) a buyer cancel of a
  // paid order is an instant refund through a refund request (fixed
  // idempotency key per request); it no longer parks the order in `refunded`
  // for the processRefundedOrders cron.
  it("F2: paid sipariş iptali → anında PayTR iadesi, order=cancelled; cron ikinci iade yapmaz", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 200,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/cancel`)
      .set(authHeader(buyer))
      .send({ reasonCode: "changed_mind", reason: "vazgeçtim" })
      .expect(200);

    expect(ctx.paytr.refundCalls).toHaveLength(1);
    const afterCancel = await prisma.order.findUnique({
      where: { id: orderId },
    });
    expect(afterCancel!.status).toBe(OrderStatus.cancelled);
    const payment = await latestPaymentOfOrder(orderId);
    expect(payment!.status).toBe(PaymentStatus.refunded);
    const rr = await prisma.refundRequest.findFirst({ where: { orderId } });
    expect(rr!.status).toBe(RefundRequestStatus.refunded);

    // The legacy cron finds nothing left to refund: no second PayTR refund.
    const paymentService = ctx.app.get(PaymentService);
    await paymentService.processRefundedOrders();
    expect(ctx.paytr.refundCalls).toHaveLength(1);
  });

  it("F4: a PayTR refund rejection fails the cancel and sends the request to financial review; the admin approve refunds it once", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 180,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();
    const before = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });

    ctx.paytr.nextRefundFails = true;
    await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/cancel`)
      .set(authHeader(buyer))
      .send({ reasonCode: "changed_mind", reason: "vazgeçtim" })
      .expect(400);

    expect(ctx.paytr.refundCalls).toHaveLength(1);
    // No money moved: the order is not closed and the payment not refunded.
    const afterFail = await prisma.order.findUnique({ where: { id: orderId } });
    expect(afterFail!.status).toBe(before.status);
    const payAfterFail = await latestPaymentOfOrder(orderId);
    expect(payAfterFail!.status).toBe(PaymentStatus.completed);
    // A person decides: the request waits for financial review.
    const rr = await prisma.refundRequest.findFirst({ where: { orderId } });
    expect(rr!.status).toBe(RefundRequestStatus.pending_review);
    expect(rr!.financialReviewRequired).toBe(true);

    // Recovery: the admin approves the request. The rejected attempt moved no
    // money, so the approve sends the same refund (same request key) to PayTR
    // once more and closes the order; the buyer is refunded exactly once.
    const admin = await createAdminUser(ctx.module);
    await request(ctx.app.getHttpServer())
      .post(`/api/admin/refund-requests/${rr!.id}/approve`)
      .set(authHeader(admin))
      .send({ note: "PayTR rejection reviewed, refund resent." })
      .expect(200);

    expect(ctx.paytr.refundCalls).toHaveLength(2);
    expect(ctx.paytr.refundCalls[1]).toEqual(ctx.paytr.refundCalls[0]);
    const finalOrder = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(finalOrder.status).toBe(OrderStatus.cancelled);
    const finalPay = await latestPaymentOfOrder(orderId);
    expect(finalPay!.status).toBe(PaymentStatus.refunded);
    const finalRr = await prisma.refundRequest.findUniqueOrThrow({
      where: { id: rr!.id },
    });
    expect(finalRr.status).toBe(RefundRequestStatus.refunded);
  });

  it("F3: kargoya verildikten (shipped) sonra sipariş iptali reddedilir (400)", async () => {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: 75,
      quantity: 1,
    });
    const addr = await createAddress({ userId: buyer.id });
    await createAddress({ userId: seller.id });

    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    await prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped },
    });

    await request(ctx.app.getHttpServer())
      .post(`/api/orders/${orderId}/cancel`)
      .set(authHeader(buyer))
      .send({ reasonCode: "changed_mind", reason: "vazgeçtim" })
      .expect(400)
      .expect((res) =>
        expect(res.body.i18nKey).toBe("server.order.cannotCancelShipped"),
      );
  });
});
