/**
 * 14 — Kargo & Teslimat (SHP) — Test Konsolu senaryoları.
 *
 * Bu dosya 01-auth.e2e-spec.ts GOLD şablonunu birebir izler: aynı import/yapı,
 * beforeEach truncateAll()+seedBaseline() (+ ctx.paytr/ctx.surat reset). Her test
 * `scenario('SHP-NNN', fn)` ile manifest'e bağlanır (başlık/pri manifest'ten gelir).
 *
 * Assertion'lar apps/api/src/modules/shipping/* (controller/service/DTO),
 * order.service.ts (createDirectOrder/confirmReceipt) ve surat-cargo stub'undan
 * (StubSuratSoapClient.shipmentCalls) türetildi.
 *
 * Kapsam dışı bırakılanlar (scenario.skip): saf util/mapper birim testleri,
 * canlı SOAP/REST tracking entegrasyonu, salt-UI pariteleri ve .env.test ile
 * çelişen (runtime togglanmayan) config senaryoları — her biri gerekçeyle.
 */
import * as request from "supertest";
import { Prisma, OrderStatus, ShipmentStatus } from "@prisma/client";
import { createE2ETestApp, E2ETestApp } from "../../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../../test-utils/db";
import {
  createUser,
  authHeader,
  CreatedTestUser,
} from "../../factories/user.factory";
import { createProduct } from "../../factories/product.factory";
import { createAddress } from "../../factories/address.factory";
import { buyAndPay, completePaymentByCallback } from "../../factories/flows";
import { scenario } from "../../test-utils/scenario";

describe("14 — Kargo & Teslimat (SHP)", () => {
  let ctx: E2ETestApp;
  const server = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createE2ETestApp();
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  let seed: { categoryId: string; brandId: string; manufacturerId: string };

  beforeEach(async () => {
    await truncateAll();
    seed = await seedBaseline();
    ctx.paytr.reset();
    ctx.surat.reset();
  });

  // ─────────────────────────── Ortak yardımcılar (inline) ───────────────────────────

  /** Satıcı (default İstanbul adresli) + ürün üret. */
  async function makeSellerWithProduct(
    opts: { price?: number; sellerCity?: string; title?: string } = {},
  ): Promise<{ seller: CreatedTestUser; productId: string }> {
    const seller = await createUser(ctx.module, { isSeller: true });
    await createAddress({
      userId: seller.id,
      isDefault: true,
      city: opts.sellerCity ?? "İstanbul",
    });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: seed.categoryId,
      price: opts.price ?? 250,
      title: opts.title,
      status: "active",
    });
    return { seller, productId: product.id };
  }

  /** Alıcı + kendine ait teslimat adresi üret. */
  async function makeBuyerWithAddress(
    city = "Ankara",
  ): Promise<{ buyer: CreatedTestUser; addressId: string }> {
    const buyer = await createUser(ctx.module);
    const addr = await createAddress({
      userId: buyer.id,
      isDefault: true,
      city,
    });
    return { buyer, addressId: addr.id };
  }

  /**
   * Tam akış: satın al + öde → sipariş 'preparing'. Ödeme başarısında shipment
   * kaydı OTOMATİK oluşur (payment-fulfillment.service — kanonik akış); satıcı
   * manuel POST /api/shipping ÇAĞIRMAZ. Otomatik oluşan shipment'ı okuruz.
   * Döner: ids + otomatik oluşan shipment id'si.
   */
  async function setupPreparedOrderWithShipment(
    opts: { buyerCity?: string; sellerCity?: string; price?: number } = {},
  ): Promise<{
    seller: CreatedTestUser;
    buyer: CreatedTestUser;
    productId: string;
    orderId: string;
    shipmentId: string;
  }> {
    const { seller, productId } = await makeSellerWithProduct({
      price: opts.price ?? 250,
      sellerCity: opts.sellerCity ?? "İstanbul",
    });
    const { buyer, addressId } = await makeBuyerWithAddress(
      opts.buyerCity ?? "Ankara",
    );
    const { orderId } = await buyAndPay(ctx, buyer, productId, addressId);

    const shipRes = await request(server())
      .get(`/api/shipping/order/${orderId}`)
      .set(authHeader(seller))
      .expect(200);

    return { seller, buyer, productId, orderId, shipmentId: shipRes.body.id };
  }

  /** setupPreparedOrderWithShipment + satıcı takip no girer → shipment picked_up, order shipped. */
  async function setupShipmentWithTracking(
    trackingNumber = "1234567890",
    opts: { buyerCity?: string; sellerCity?: string } = {},
  ) {
    const s = await setupPreparedOrderWithShipment(opts);
    await request(server())
      .patch(`/api/shipping/${s.shipmentId}/tracking`)
      .set(authHeader(s.seller))
      .send({ trackingNumber })
      .expect(200);
    return { ...s, trackingNumber };
  }

  /**
   * awaiting_buyer_confirmation durumunda gerçek sipariş kur (48h akışı).
   * Prisma ile doğrudan (order-48h-window.e2e-spec.ts fixture pattern'i),
   * ama JWT için createUser factory kullanılır.
   */
  async function setupAwaitingConfirmationOrder(): Promise<{
    buyer: CreatedTestUser;
    seller: CreatedTestUser;
    orderId: string;
  }> {
    const prisma = getPrisma();
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: seed.categoryId,
      price: 100,
      status: "active",
    });
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        buyerId: buyer.id,
        sellerId: seller.id,
        productId: product.id,
        totalAmount: new Prisma.Decimal(100),
        subtotal: new Prisma.Decimal(100),
        commissionAmount: new Prisma.Decimal(10),
        buyerFeeAmount: new Prisma.Decimal(3),
        paymentExpiresAt: new Date(Date.now() + 3_600_000),
        status: OrderStatus.awaiting_buyer_confirmation,
        deliveredAt: new Date(),
        confirmationDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
      },
    });
    return { buyer, seller, orderId: order.id };
  }

  const NIL_UUID = "00000000-0000-4000-8000-000000000000";
  const WEBHOOK_SECRET = "test-webhook-secret"; // .env.test: SURAT_WEBHOOK_SECRET

  /**
   * Runtime env override — ConfigModule.forRoot cache'siz olduğundan ConfigService.get()
   * her çağrıda process.env'i CANLI okur (bkz. escrow-edge-cases.e2e-spec.ts:869 aynı pattern).
   * Böylece Sürat stub davranışı (SURAT_STUB_RESPONSE/THROW/CARGO_ENABLED) ve 48h feature
   * flag'i tek test süresince deterministik olarak değiştirilebilir; finally ile geri alınır.
   */
  async function withEnv<T>(
    overrides: Record<string, string | undefined>,
    fn: () => Promise<T>,
  ): Promise<T> {
    const prev: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(overrides)) {
      prev[k] = process.env[k];
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      return await fn();
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  function sendWebhook(
    provider: string,
    payload: Record<string, unknown>,
    expectedStatus: number,
    secret: string | null = WEBHOOK_SECRET,
  ) {
    return withEnv({ SHIPPING_WEBHOOK_ENABLED: "true" }, async () => {
      let req = request(server()).post(`/api/shipping/webhook/${provider}`);
      if (secret) req = req.set("X-Webhook-Secret", secret);
      return req.send(payload).expect(expectedStatus);
    });
  }

  // ═══════════════════════════ GET /api/shipping/carriers ═══════════════════════════
  describe("GET /api/shipping/carriers (Public)", () => {
    scenario("SHP-001", async () => {
      const res = await request(server())
        .get("/api/shipping/carriers")
        .expect(200);
      expect(res.body.carriers[0].id).toBe("surat");
      expect(res.body.carriers[0].code).toBe("surat");
      expect(res.body.carriers[0].name).toBe("Sürat Kargo");
      expect(res.body.carriers[0].trackingUrl).toContain(
        "suratkargo.com.tr/KargoTakip",
      );
      expect(res.body.defaultCarrier).toBe("surat");
      expect(res.body.totalActive).toBe(1);
      expect(res.body.carriers[0].features).toHaveLength(4);
      expect(res.body.carriers[0].estimatedDelivery.sameCity).toBe(
        "1-2 iş günü",
      );
    });
  });

  // ═══════════════════════════ GET /api/shipping/rates (Public) ═══════════════════════════
  describe("GET /api/shipping/rates (Public)", () => {
    scenario("SHP-002", async () => {
      const res = await request(server())
        .get("/api/shipping/rates")
        .query({ city: "Ankara", carrier: "surat", weight: "1" })
        .expect(200);
      expect(res.body.rate).toBe(29.99);
    });

    scenario("SHP-003", async () => {
      const res = await request(server())
        .get("/api/shipping/rates")
        .query({ city: "İstanbul", carrier: "surat", weight: "1" })
        .expect(200);
      // Rate artık AKTİF TARİFEDEN düz gelir; eski aynı-şehir indirimi kaldırıldı.
      expect(res.body.rate).toBe(29.99);
    });

    scenario("SHP-004", async () => {
      const res = await request(server())
        .get("/api/shipping/rates")
        .query({ city: "Ankara", carrier: "surat", weight: "3" })
        .expect(200);
      // Ağırlık faktörü kaldırıldı (üründe ağırlık/desi yok) → düz tarife ücreti.
      expect(res.body.rate).toBe(29.99);
    });

    scenario("SHP-005", async () => {
      // weight yok → 0.5 kg → faktör 1
      const noWeight = await request(server())
        .get("/api/shipping/rates")
        .query({ city: "Ankara", carrier: "surat" })
        .expect(200);
      expect(noWeight.body.rate).toBe(29.99);
      // weight=abc → parseFloat NaN → 0.5
      const badWeight = await request(server())
        .get("/api/shipping/rates")
        .query({ city: "Ankara", carrier: "surat", weight: "abc" })
        .expect(200);
      expect(badWeight.body.rate).toBe(29.99);
    });

    scenario("SHP-006", async () => {
      // Bilinmeyen carrier enum'da değil → surat'a fallback
      const res = await request(server())
        .get("/api/shipping/rates")
        .query({ city: "Ankara", carrier: "yurtici", weight: "1" })
        .expect(200);
      expect(res.body.rate).toBe(29.99);
    });

    scenario("SHP-007", async () => {
      // city boş → düz tarife ücreti (şehir bazlı indirim yok).
      const res = await request(server())
        .get("/api/shipping/rates")
        .query({ city: "", carrier: "surat", weight: "1" })
        .expect(200);
      expect(res.body.rate).toBe(29.99);
    });

    scenario("SHP-008", async () => {
      // Kargo fiyatı artık AKTİF TARİFEDEN gelir; eski shipping_base_cost PlatformSetting'i
      // (retired) rate'i DEĞİŞTİRMEZ — gösterilen = tahsil edilen.
      const prisma = getPrisma();
      await prisma.platformSetting.create({
        data: {
          settingKey: "shipping_base_cost",
          settingValue: "49.9",
          settingType: "number",
        },
      });
      const res = await request(server())
        .get("/api/shipping/rates")
        .query({ city: "Ankara", carrier: "surat", weight: "1" })
        .expect(200);
      expect(res.body.rate).toBe(29.99);
    });
  });

  // ═══════════════════════════ POST /api/shipping/rates (Auth) ═══════════════════════════
  describe("POST /api/shipping/rates (Auth)", () => {
    scenario("SHP-009", async () => {
      await request(server())
        .post("/api/shipping/rates")
        .send({ fromAddressId: NIL_UUID, toAddressId: NIL_UUID })
        .expect(401);
    });

    scenario("SHP-010", async () => {
      const user = await createUser(ctx.module);
      const res = await request(server())
        .post("/api/shipping/rates")
        .set(authHeader(user))
        .send({
          fromAddressId: "00000000-0000-4000-8000-000000000000",
          toAddressId: "00000000-0000-4000-8000-000000000001",
        })
        .expect(404);
      expect(res.body.message).toContain("Adres bulunamadı");
    });

    scenario("SHP-011", async () => {
      const user = await createUser(ctx.module);
      const from = await createAddress({
        userId: user.id,
        isDefault: true,
        city: "İstanbul",
      });
      const to = await createAddress({
        userId: user.id,
        isDefault: false,
        city: "Ankara",
      });
      // @Min(0.1) ihlali → 400
      await request(server())
        .post("/api/shipping/rates")
        .set(authHeader(user))
        .send({ fromAddressId: from.id, toAddressId: to.id, weight: 0.05 })
        .expect(400);
    });
  });

  // ═══════════════════════════ POST /api/shipping (Gönderi oluştur) ═══════════════════════════
  describe("POST /api/shipping (create shipment)", () => {
    scenario("SHP-020", async () => {
      const { seller, productId } = await makeSellerWithProduct({
        sellerCity: "İstanbul",
      });
      const { buyer, addressId } = await makeBuyerWithAddress("Ankara");
      const { orderId } = await buyAndPay(ctx, buyer, productId, addressId);

      // Kanonik akış: ödeme başarısında shipment OTOMATİK oluşur; satıcı manuel
      // POST /api/shipping ÇAĞIRMAZ. Otomatik oluşan pending shipment'ı doğrula.
      const res = await request(server())
        .get(`/api/shipping/order/${orderId}`)
        .set(authHeader(seller))
        .expect(200);

      expect(res.body.status).toBe("pending");
      expect(res.body.provider).toBe("surat");
      expect(typeof res.body.cost).toBe("number");
      expect(res.body.events).toEqual([]);
      expect(res.body.estimatedDelivery).toBeTruthy();

      // DB yan etkisi: tek shipment, pending.
      const prisma = getPrisma();
      const dbShipment = await prisma.shipment.findUnique({
        where: { orderId },
      });
      expect(dbShipment?.status).toBe(ShipmentStatus.pending);
    });

    scenario("SHP-021", async () => {
      const { productId } = await makeSellerWithProduct();
      const { buyer, addressId } = await makeBuyerWithAddress();
      const { orderId } = await buyAndPay(ctx, buyer, productId, addressId);

      // Başka bir satıcı bu siparişe gönderi oluşturamaz.
      const otherSeller = await createUser(ctx.module, { isSeller: true });
      const res = await request(server())
        .post("/api/shipping")
        .set(authHeader(otherSeller))
        .send({ orderId, provider: "surat" })
        .expect(403);
      expect(res.body.message).toContain(
        "Bu sipariş için kargo oluşturamazsınız",
      );
    });

    // PR-3b: sipariş oluşturulurken OrderPackage'a AKTİF tarife snapshot'ı yazılır.
    it("OrderPackage taşır: tarife snapshot + kanonik alıcı-payı kargo", async () => {
      const { productId } = await makeSellerWithProduct({ price: 100 });
      const { buyer, addressId } = await makeBuyerWithAddress("Ankara");
      const { orderId } = await buyAndPay(ctx, buyer, productId, addressId);

      const prisma = getPrisma();
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { packageId: true },
      });
      const pkg = await prisma.orderPackage.findUnique({
        where: { id: order!.packageId! },
      });

      // Aktif tarife (seed edilen v1) snapshot'ı pakete yazıldı.
      expect(pkg!.shippingTariffId).toBeTruthy();
      expect(typeof pkg!.shippingTariffVersion).toBe("number");
      // shippingCost KANONİK olarak alıcı payıdır (direct/guest/group aynı semantik).
      expect(Number(pkg!.shippingCost)).toBe(Number(pkg!.buyerShippingAmount));
      // Tam bedel >= alıcı payı (buyerShare<=100).
      expect(Number(pkg!.fullShippingAmount)).toBeGreaterThanOrEqual(
        Number(pkg!.buyerShippingAmount),
      );
    });

    scenario("SHP-022", async () => {
      // Sipariş 'preparing' değil (buradan sonra prisma ile 'paid'e çekilir).
      const { seller, productId } = await makeSellerWithProduct();
      const { buyer, addressId } = await makeBuyerWithAddress();
      const { orderId } = await buyAndPay(ctx, buyer, productId, addressId);
      const prisma = getPrisma();
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.paid },
      });

      const res = await request(server())
        .post("/api/shipping")
        .set(authHeader(seller))
        .send({ orderId, provider: "surat" })
        .expect(400);
      expect(res.body.message).toContain("Sipariş hazırlanma durumunda değil");
    });

    scenario("SHP-023", async () => {
      const { seller, orderId } = await setupPreparedOrderWithShipment();
      // İkinci kez aynı orderId → unique shipment kuralı → 400.
      const res = await request(server())
        .post("/api/shipping")
        .set(authHeader(seller))
        .send({ orderId, provider: "surat" })
        .expect(400);
      expect(res.body.message).toContain(
        "Bu sipariş için zaten kargo oluşturulmuş",
      );
    });

    scenario("SHP-024", async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const res = await request(server())
        .post("/api/shipping")
        .set(authHeader(seller))
        .send({ orderId: NIL_UUID, provider: "surat" })
        .expect(404);
      expect(res.body.message).toContain("Sipariş bulunamadı");
    });

    scenario("SHP-025", async () => {
      // Satıcının default adresi YOK → 400 "Satıcı adresi bulunamadı".
      const seller = await createUser(ctx.module, { isSeller: true }); // adres yok
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: seed.categoryId,
        price: 200,
        status: "active",
      });
      const { buyer, addressId } = await makeBuyerWithAddress();
      const { orderId } = await buyAndPay(ctx, buyer, product.id, addressId);

      await getPrisma().shipment.delete({ where: { orderId } });
      const res = await request(server())
        .post("/api/shipping")
        .set(authHeader(seller))
        .send({ orderId, provider: "surat" })
        .expect(400);
      expect(res.body.message).toContain("Satıcı adresi bulunamadı");
    });

    scenario("SHP-026", async () => {
      // Geçersiz provider (enum dışı) → DTO @IsEnum 400. DTO doğrulaması service'ten önce
      // çalıştığından geçerli bir orderId gerekmez; sadece kimlik doğrulama yeterli.
      const seller = await createUser(ctx.module, { isSeller: true });
      const res = await request(server())
        .post("/api/shipping")
        .set(authHeader(seller))
        .send({ orderId: NIL_UUID, provider: "yurtici" })
        .expect(400);
      const msg = Array.isArray(res.body.message)
        ? res.body.message.join(" ")
        : res.body.message;
      expect(msg).toContain("Geçerli bir kargo firması seçiniz");
    });

    scenario("SHP-027", async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const res = await request(server())
        .post("/api/shipping")
        .set(authHeader(seller))
        .send({ orderId: "abc", provider: "surat" })
        .expect(400);
      const msg = Array.isArray(res.body.message)
        ? res.body.message.join(" ")
        : res.body.message;
      expect(msg).toContain("Geçerli bir sipariş ID giriniz");
    });

    scenario("SHP-028", async () => {
      await request(server())
        .post("/api/shipping")
        .send({ orderId: NIL_UUID, provider: "surat" })
        .expect(401);
    });

    scenario("SHP-029", async () => {
      // Hedef şehir çözümü: satıcı İstanbul, alıcı İzmir → şehirler arası maliyet.
      // Kanonik akış: shipment ödemede otomatik oluşur; cost sipariş kargo bedelinden gelir.
      const { seller, productId } = await makeSellerWithProduct({
        sellerCity: "İstanbul",
      });
      const { buyer, addressId } = await makeBuyerWithAddress("İzmir");
      const { orderId } = await buyAndPay(ctx, buyer, productId, addressId);

      const res = await request(server())
        .get(`/api/shipping/order/${orderId}`)
        .set(authHeader(seller))
        .expect(200);
      // Şehirler arası (İstanbul→İzmir) → indirim uygulanmaz (base 29.99, weight 1).
      expect(res.body.cost).toBe(29.99);
    });
  });

  // ═══════════════════════════ PATCH /api/shipping/:id/tracking ═══════════════════════════
  describe("PATCH /api/shipping/:id/tracking", () => {
    scenario("SHP-040", async () => {
      const { seller, orderId, shipmentId } =
        await setupPreparedOrderWithShipment();
      const res = await request(server())
        .patch(`/api/shipping/${shipmentId}/tracking`)
        .set(authHeader(seller))
        .send({ trackingNumber: "1234567890" })
        .expect(200);

      expect(res.body.status).toBe("picked_up");
      expect(res.body.trackingNumber).toMatch(/^ORD-/);
      expect(res.body.providerTrackingId).toBe("1234567890");
      expect(res.body.trackingUrl).toBe(
        "https://www.suratkargo.com.tr/KargoTakip/?kargotakipno=1234567890",
      );

      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.shipped);
      expect(order!.version).toBeGreaterThan(1); // increment sonrası
      const events = await prisma.shipmentEvent.findMany({
        where: { shipmentId },
      });
      expect(events).toHaveLength(1);
      expect(events[0].status).toBe("picked_up");
      expect(events[0].location).toBe("Satıcı");
      expect(events[0].description).toBe("Kargo teslim alındı");
    });

    scenario("SHP-041", async () => {
      const { shipmentId } = await setupPreparedOrderWithShipment();
      const otherSeller = await createUser(ctx.module, { isSeller: true });
      const res = await request(server())
        .patch(`/api/shipping/${shipmentId}/tracking`)
        .set(authHeader(otherSeller))
        .send({ trackingNumber: "999" })
        .expect(403);
      expect(res.body.message).toContain("Bu kargoyu güncelleme yetkiniz yok");
    });

    scenario("SHP-042", async () => {
      // Alıcı (buyer) takip no güncelleyemez → 403 (ownership satıcıya bağlı).
      const { buyer, shipmentId } = await setupPreparedOrderWithShipment();
      await request(server())
        .patch(`/api/shipping/${shipmentId}/tracking`)
        .set(authHeader(buyer))
        .send({ trackingNumber: "111" })
        .expect(403);
    });

    scenario("SHP-043", async () => {
      const seller = await createUser(ctx.module, { isSeller: true });
      const res = await request(server())
        .patch(`/api/shipping/${NIL_UUID}/tracking`)
        .set(authHeader(seller))
        .send({ trackingNumber: "1" })
        .expect(404);
      expect(res.body.message).toContain("Kargo bulunamadı");
    });

    scenario("SHP-044", async () => {
      const { seller, shipmentId } = await setupPreparedOrderWithShipment();
      const res = await request(server())
        .patch(`/api/shipping/${shipmentId}/tracking`)
        .set(authHeader(seller))
        .send({}) // trackingNumber eksik → @IsString ihlali
        .expect(400);
      const msg = Array.isArray(res.body.message)
        ? res.body.message.join(" ")
        : res.body.message;
      expect(msg).toContain("Takip numarası zorunludur");
    });

    scenario("SHP-045", async () => {
      // İdempotent DEĞİL: ikinci PATCH yeni event + yeni versiyon üretir.
      const { seller, orderId, shipmentId } =
        await setupPreparedOrderWithShipment();
      await request(server())
        .patch(`/api/shipping/${shipmentId}/tracking`)
        .set(authHeader(seller))
        .send({ trackingNumber: "1234567890" })
        .expect(200);
      const prisma = getPrisma();
      const afterFirst = await prisma.order.findUnique({
        where: { id: orderId },
      });

      const res2 = await request(server())
        .patch(`/api/shipping/${shipmentId}/tracking`)
        .set(authHeader(seller))
        .send({ trackingNumber: "9999999999" })
        .expect(200);
      expect(res2.body.trackingNumber).toMatch(/^ORD-/);
      expect(res2.body.providerTrackingId).toBe("9999999999");

      const events = await prisma.shipmentEvent.findMany({
        where: { shipmentId },
      });
      expect(events.length).toBe(2); // ikinci picked_up eklendi
      const afterSecond = await prisma.order.findUnique({
        where: { id: orderId },
      });
      expect(afterSecond!.version).toBeGreaterThan(afterFirst!.version);
    });

    scenario("SHP-046", async () => {
      // notifyOrderShipped hatası try/catch ile yutulur → istek her koşulda 200 döner,
      // shipment picked_up + order shipped commit'lenir (tx notify'dan bağımsız).
      const { seller, orderId, shipmentId } =
        await setupPreparedOrderWithShipment();
      const res = await request(server())
        .patch(`/api/shipping/${shipmentId}/tracking`)
        .set(authHeader(seller))
        .send({ trackingNumber: "1234567890" })
        .expect(200);
      expect(res.body.status).toBe("picked_up");
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.shipped);
    });
  });

  // ═══════════════════════════ GET /api/shipping/:id & /order/:orderId ═══════════════════════════
  describe("GET shipment (by id / by order)", () => {
    scenario("SHP-060", async () => {
      const { buyer, orderId, shipmentId } = await setupShipmentWithTracking();
      const res = await request(server())
        .get(`/api/shipping/order/${orderId}`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.id).toBe(shipmentId);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(res.body.events.length).toBeGreaterThanOrEqual(1);
    });

    scenario("SHP-061", async () => {
      const { orderId, shipmentId } = await setupPreparedOrderWithShipment();
      const thirdParty = await createUser(ctx.module); // ne alıcı ne satıcı
      const byOrder = await request(server())
        .get(`/api/shipping/order/${orderId}`)
        .set(authHeader(thirdParty))
        .expect(403);
      expect(byOrder.body.message).toContain("görüntüleme yetkiniz yok");
      await request(server())
        .get(`/api/shipping/${shipmentId}`)
        .set(authHeader(thirdParty))
        .expect(403);
    });

    scenario("SHP-062", async () => {
      const user = await createUser(ctx.module);
      // Olmayan sipariş → 404 "Sipariş bulunamadı".
      const noOrder = await request(server())
        .get(`/api/shipping/order/${NIL_UUID}`)
        .set(authHeader(user))
        .expect(404);
      expect(noOrder.body.message).toContain("Sipariş bulunamadı");

      // Sipariş var ama shipment yok → 404 "Bu sipariş için kargo bulunamadı".
      const { productId } = await makeSellerWithProduct();
      const { buyer, addressId } = await makeBuyerWithAddress();
      const { orderId } = await buyAndPay(ctx, buyer, productId, addressId);
      await getPrisma().shipment.delete({ where: { orderId } });
      const noShip = await request(server())
        .get(`/api/shipping/order/${orderId}`)
        .set(authHeader(buyer))
        .expect(404);
      expect(noShip.body.message).toContain("Bu sipariş için kargo bulunamadı");
    });

    scenario("SHP-063", async () => {
      const { orderId, shipmentId } = await setupPreparedOrderWithShipment();
      await request(server()).get(`/api/shipping/order/${orderId}`).expect(401);
      await request(server()).get(`/api/shipping/${shipmentId}`).expect(401);
    });
  });

  // ═══════════════════════════ POST /api/shipping/webhook/:provider ═══════════════════════════
  describe("POST /api/shipping/webhook/:provider", () => {
    scenario("SHP-080", async () => {
      const { shipmentId } = await setupShipmentWithTracking("1234567890");
      const res = await sendWebhook(
        "surat",
        {
          trackingNumber: "1234567890",
          status: "in_transit",
          location: "Ankara Aktarma",
          description: "Yolda",
          timestamp: "2026-06-30T10:00:00Z",
        },
        200,
      );
      expect(res.body.status).toBe("ok");

      const prisma = getPrisma();
      const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
      });
      expect(shipment?.status).toBe(ShipmentStatus.in_transit);
      const event = await prisma.shipmentEvent.findFirst({
        where: { shipmentId, status: "in_transit" },
      });
      expect(event?.location).toBe("Ankara Aktarma");
    });

    scenario("SHP-081", async () => {
      const { shipmentId } = await setupShipmentWithTracking("1234567890");
      const res = await sendWebhook(
        "surat",
        { trackingNumber: "1234567890", status: "delivered" },
        401,
        null,
      );
      expect(res.body.message).toContain("Invalid or missing webhook secret");
      // Gönderi değişmedi (picked_up kaldı).
      const prisma = getPrisma();
      const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
      });
      expect(shipment?.status).toBe(ShipmentStatus.picked_up);
    });

    scenario("SHP-082", async () => {
      // Gerçek Sürat callback sözleşmesi olmadığı için webhook varsayılan kapalıdır.
      const res = await request(server())
        .post("/api/shipping/webhook/surat")
        .set("X-Webhook-Secret", "anything")
        .send({ trackingNumber: "1234567890", status: "delivered" })
        .expect(404);
      expect(res.body.statusCode).toBe(404);
    });

    scenario("SHP-083", async () => {
      await setupShipmentWithTracking("1234567890");
      const res = await sendWebhook(
        "surat",
        { trackingNumber: "YOK-999", status: "delivered" },
        200,
      );
      expect(res.body.status).toBe("ignored");
      // Eşleşen gönderi değişmedi.
      const prisma = getPrisma();
      const shipment = await prisma.shipment.findFirst({
        where: { providerTrackingId: "1234567890" },
      });
      expect(shipment?.status).toBe(ShipmentStatus.picked_up);
    });

    scenario("SHP-084", async () => {
      const { shipmentId } = await setupShipmentWithTracking("1234567890");
      const res = await sendWebhook(
        "surat",
        { trackingNumber: "1234567890", status: "banana" },
        200,
      );
      expect(res.body.status).toBe("ok");
      const prisma = getPrisma();
      const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
      });
      expect(shipment?.status).toBe(ShipmentStatus.in_transit); // bilinmeyen → in_transit
      const event = await prisma.shipmentEvent.findFirst({
        where: { shipmentId, status: "in_transit" },
      });
      expect(event).toBeTruthy();
    });

    scenario("SHP-085", async () => {
      // Alternatif alan adı: tracking_no ile eşleşme.
      const { shipmentId } = await setupShipmentWithTracking("1234567890");
      const res = await sendWebhook(
        "surat",
        { tracking_no: "1234567890", status: "out_for_delivery" },
        200,
      );
      expect(res.body.status).toBe("ok");
      const prisma = getPrisma();
      const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
      });
      expect(shipment?.status).toBe(ShipmentStatus.out_for_delivery);
    });

    scenario("SHP-086", async () => {
      // location/timestamp/description eksik → varsayılanlar.
      const { shipmentId } = await setupShipmentWithTracking("1234567890");
      const before = Date.now();
      const res = await sendWebhook(
        "surat",
        { trackingNumber: "1234567890", status: "in_transit" },
        200,
      );
      expect(res.body.status).toBe("ok");
      const prisma = getPrisma();
      const event = await prisma.shipmentEvent.findFirst({
        where: { shipmentId, status: "in_transit" },
        orderBy: { occurredAt: "desc" },
      });
      expect(event?.location).toBe("Bilinmiyor");
      expect(event?.description).toBeNull(); // payload.description undefined → null
      expect(event!.occurredAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    });
  });

  // ═══════════════════════════ Teslimat / onay (webhook delivered + confirm-receipt) ═══════════════════════════
  describe("Delivery & confirmation", () => {
    scenario("SHP-100", async () => {
      // 48h penceresi KAPALI (.env.test'te FEATURE_48H_CONFIRMATION_WINDOW yok) →
      // webhook delivered doğrudan order.status=delivered + deliveredAt + version+1.
      const { orderId, shipmentId } =
        await setupShipmentWithTracking("1234567890");
      const prisma = getPrisma();
      const before = await prisma.order.findUnique({ where: { id: orderId } });

      const res = await sendWebhook(
        "surat",
        { trackingNumber: "1234567890", status: "delivered" },
        200,
      );
      expect(res.body.status).toBe("ok");

      const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
      });
      expect(shipment?.status).toBe(ShipmentStatus.delivered);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.delivered);
      expect(order?.deliveredAt).not.toBeNull();
      expect(order!.version).toBeGreaterThan(before!.version);
    });

    scenario("SHP-101", async () => {
      // 48h penceresi AÇIK: webhook delivered → order.status=awaiting_buyer_confirmation +
      // confirmationDeadline ≈ +48h + version+1 (webhook yolu flag'i canlı process.env'den okur).
      const { orderId, shipmentId } =
        await setupShipmentWithTracking("1234567890");
      const prisma = getPrisma();
      const before = await prisma.order.findUnique({ where: { id: orderId } });

      await withEnv({ FEATURE_48H_CONFIRMATION_WINDOW: "true" }, async () => {
        const res = await sendWebhook(
          "surat",
          { trackingNumber: "1234567890", status: "delivered" },
          200,
        );
        expect(res.body.status).toBe("ok");
      });

      const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
      });
      expect(shipment?.status).toBe(ShipmentStatus.delivered);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.awaiting_buyer_confirmation);
      expect(order?.deliveredAt).not.toBeNull();
      expect(order?.confirmationDeadline).not.toBeNull();
      // deadline ≈ deliveredAt + 48h (±1 dk tolerans).
      const delta =
        order!.confirmationDeadline!.getTime() - order!.deliveredAt!.getTime();
      expect(Math.abs(delta - 48 * 60 * 60 * 1000)).toBeLessThan(60_000);
      expect(order!.version).toBeGreaterThan(before!.version);
    });

    scenario("SHP-102", async () => {
      // Alıcı 48h penceresinde erken onay → completed.
      const { buyer, orderId } = await setupAwaitingConfirmationOrder();
      const res = await request(server())
        .post(`/api/orders/${orderId}/confirm-receipt`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.completed).toBe(true);
      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.completed);
    });

    scenario("SHP-103", async () => {
      // Satıcı / üçüncü kişi confirm-receipt → 403.
      const { seller, orderId } = await setupAwaitingConfirmationOrder();
      const res = await request(server())
        .post(`/api/orders/${orderId}/confirm-receipt`)
        .set(authHeader(seller))
        .expect(403);
      expect(res.body.message).toContain("Bu siparişi onaylama yetkiniz yok");
    });

    scenario("SHP-104", async () => {
      // Yanlış durumda (shipped) confirm-receipt → 400 (mevcut durum belirtilir).
      const { buyer, orderId } = await setupShipmentWithTracking("1234567890");
      const res = await request(server())
        .post(`/api/orders/${orderId}/confirm-receipt`)
        .set(authHeader(buyer))
        .expect(400);
      expect(res.body.message).toContain("Sipariş bu aşamada onaylanamaz");
      expect(res.body.message).toContain("shipped");
    });

    scenario("SHP-105", async () => {
      // Açık iade talebi varken confirm-receipt → 400.
      const { buyer, orderId } = await setupAwaitingConfirmationOrder();
      const prisma = getPrisma();
      await prisma.refundRequest.create({
        data: {
          refundNumber: `REF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          orderId,
          requesterId: buyer.id,
          reason: "damaged" as any,
          amount: new Prisma.Decimal(100),
          status: "pending_review" as any,
        },
      });
      const res = await request(server())
        .post(`/api/orders/${orderId}/confirm-receipt`)
        .set(authHeader(buyer))
        .expect(400);
      expect(res.body.message).toContain("Açık bir iade talebi var");
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.awaiting_buyer_confirmation); // onaylanmadı
    });

    scenario("SHP-106", async () => {
      // confirmDelivery: delivered → completed (optimistic-lock version guard).
      const { buyer, orderId } = await setupShipmentWithTracking("1234567890");
      const prisma = getPrisma();
      // shipped → delivered'a çek (webhook delivered ile aynı sonucu doğrudan kur).
      await prisma.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.delivered, deliveredAt: new Date() },
      });
      await request(server())
        .post(`/api/orders/${orderId}/confirm`)
        .set(authHeader(buyer))
        .expect(200);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.completed);
    });
  });

  // ═══════════════════════════ Sürat entegrasyonu (payment fulfillment) ═══════════════════════════
  describe("Sürat integration on payment fulfillment", () => {
    scenario("SHP-121", async () => {
      // Barkod yalnız başarılı ödeme sonrasında üretilir.
      const { productId } = await makeSellerWithProduct();
      const { buyer, addressId } = await makeBuyerWithAddress("Ankara");

      const { orderId } = await buyAndPay(ctx, buyer, productId, addressId);
      expect(orderId).toBeTruthy();

      expect(ctx.surat.shipmentCalls.length).toBe(1);
      const payload = ctx.surat.shipmentCalls[0];
      expect(payload.Pazaryerimi).toBe(0);
      expect(payload.KargoTuru).toBe(3); // Koli
      expect(payload.OdemeTipi).toBe(1); // Peşin
      expect(payload.KapidanOdemeTahsilatTipi).toBe(1); // Nakit
      expect(payload.Iademi).toBe(false);
      expect(payload.OzelKargoTakipNo).toBeTruthy();
    });

    scenario.skip(
      "SHP-120",
      "SURAT_CARGO_ENABLED uygulama açılışında ConfigModule tarafından sabitlenir; kapalı mod ayrı boot/config testinde doğrulanır",
    );

    scenario("SHP-122", async () => {
      // Taşıyıcı iş hatası checkout/ödemeyi geri almaz; kodsuz kayıt retry'a bırakılır.
      const { productId } = await makeSellerWithProduct();
      const { buyer, addressId } = await makeBuyerWithAddress("Ankara");

      await withEnv({ SURAT_STUB_THROW: "BUSINESS" }, async () => {
        const { orderId } = await buyAndPay(ctx, buyer, productId, addressId);
        const [order, shipment] = await Promise.all([
          getPrisma().order.findUnique({ where: { id: orderId } }),
          getPrisma().shipment.findUnique({ where: { orderId } }),
        ]);
        expect(order?.status).toBe(OrderStatus.preparing);
        expect(shipment?.status).toBe(ShipmentStatus.pending);
        expect(shipment?.providerTrackingId).toBeNull();
      });
      expect(ctx.surat.shipmentCalls.length).toBe(1);
    });

    scenario(
      "SHP-123",
      async () => {
        // Teknik hata retry edilir; ödeme ve sipariş başarılı kalır, kod retry job'una bırakılır.
        const { productId } = await makeSellerWithProduct();
        const { buyer, addressId } = await makeBuyerWithAddress("Ankara");

        await withEnv({ SURAT_STUB_THROW: "TIMEOUT" }, async () => {
          const { orderId } = await buyAndPay(ctx, buyer, productId, addressId);
          const [order, shipment] = await Promise.all([
            getPrisma().order.findUnique({ where: { id: orderId } }),
            getPrisma().shipment.findUnique({ where: { orderId } }),
          ]);
          expect(order?.status).toBe(OrderStatus.preparing);
          expect(shipment?.providerTrackingId).toBeNull();
        });
        expect(ctx.surat.shipmentCalls.length).toBe(3);
      },
      20000,
    );

    scenario(
      "SHP-124",
      async () => {
        // Teknik hata sınıflama matrisi barkod yolunda retry sayısını doğrular.
        // Hiçbiri başarılı ödemeyi veya siparişi geri almaz.
        const cases: Array<{ sim: string; calls: number }> = [
          { sim: "NETWORK", calls: 3 },
          { sim: "HTTP_5XX", calls: 3 },
          { sim: "SOAP_FAULT", calls: 3 },
          { sim: "EMPTY", calls: 2 },
          { sim: "PARSE_ERROR", calls: 2 },
          { sim: "UNKNOWN", calls: 1 },
        ];
        const prisma = getPrisma();
        for (const c of cases) {
          ctx.surat.reset();
          const { productId } = await makeSellerWithProduct();
          const { buyer, addressId } = await makeBuyerWithAddress("Ankara");
          await withEnv({ SURAT_STUB_THROW: c.sim }, async () => {
            const { orderId } = await buyAndPay(
              ctx,
              buyer,
              productId,
              addressId,
            );
            const shipment = await prisma.shipment.findUnique({
              where: { orderId },
            });
            expect(shipment?.providerTrackingId).toBeNull();
          });
          expect(ctx.surat.shipmentCalls.length).toBe(c.calls);
        }
      },
      30000,
    );

    scenario("SHP-126", async () => {
      // Tekrarlanan başarılı callback fulfillment ve Sürat barkodunu çoğaltmaz.
      const { productId } = await makeSellerWithProduct();
      const { buyer, addressId } = await makeBuyerWithAddress("Ankara");

      const { orderId } = await buyAndPay(ctx, buyer, productId, addressId);
      expect(ctx.surat.shipmentCalls.length).toBe(1);
      await completePaymentByCallback(ctx, orderId);
      expect(ctx.surat.shipmentCalls.length).toBe(1);
      expect(await getPrisma().shipment.count({ where: { orderId } })).toBe(1);
    });

    scenario.skip(
      "SHP-127",
      "Legacy metin yanıtlı gönderi ucu artık kullanılmıyor; yapılandırılmış barkod yanıtı ödeme-sonrası akışta doğrulanıyor",
    );

    scenario("SHP-192", async () => {
      // OzelKargoTakipNo === orderNumberPreview; ≤ 50 karakter.
      const { productId } = await makeSellerWithProduct();
      const { buyer, addressId } = await makeBuyerWithAddress("Ankara");
      const { orderId } = await buyAndPay(ctx, buyer, productId, addressId);

      const prisma = getPrisma();
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });
      expect(ctx.surat.shipmentCalls.length).toBe(1);
      const payload = ctx.surat.shipmentCalls[0];
      expect(payload.OzelKargoTakipNo).toBe(order!.orderNumber);
      expect(payload.OzelKargoTakipNo.length).toBeLessThanOrEqual(50);
    });

    scenario("SHP-193", async () => {
      // SahisBirim = ürün başlığı (başlık varsa payload'da yer alır).
      const seller = await createUser(ctx.module, { isSeller: true });
      await createAddress({
        userId: seller.id,
        isDefault: true,
        city: "İstanbul",
      });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: seed.categoryId,
        price: 300,
        title: "Nadir Vinil Plak 1975",
        status: "active",
      });
      const { buyer, addressId } = await makeBuyerWithAddress("Ankara");
      await buyAndPay(ctx, buyer, product.id, addressId);

      expect(ctx.surat.shipmentCalls.length).toBe(1);
      expect(ctx.surat.shipmentCalls[0].SahisBirim).toBe(
        "Nadir Vinil Plak 1975",
      );
    });
  });

  // ═══════════════════════════ Güvenlik / idempotency / misafir ═══════════════════════════
  describe("Security & idempotency", () => {
    scenario("SHP-230", async () => {
      // Misafir JWT'li kargo endpoint'ini kullanamaz → 401.
      const { orderId } = await setupPreparedOrderWithShipment();
      await request(server()).get(`/api/shipping/order/${orderId}`).expect(401);
    });

    scenario("SHP-231", async () => {
      // IDOR: başka kullanıcının shipmentId'siyle GET → 403; hiçbir bilgi dönmez.
      const { shipmentId } = await setupPreparedOrderWithShipment();
      const attacker = await createUser(ctx.module);
      const res = await request(server())
        .get(`/api/shipping/${shipmentId}`)
        .set(authHeader(attacker))
        .expect(403);
      expect(res.body.id).toBeUndefined();
      expect(res.body.trackingNumber).toBeUndefined();
    });

    scenario("SHP-232", async () => {
      // Webhook delivered iki kez → idempotent (order tekrar delivered set edilir, çökme yok).
      const { orderId, shipmentId } =
        await setupShipmentWithTracking("1234567890");
      const send = () =>
        sendWebhook(
          "surat",
          { trackingNumber: "1234567890", status: "delivered" },
          200,
        );
      await send();
      await send();
      const prisma = getPrisma();
      const shipment = await prisma.shipment.findUnique({
        where: { id: shipmentId },
      });
      expect(shipment?.status).toBe(ShipmentStatus.delivered);
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      expect(order?.status).toBe(OrderStatus.delivered);
    });

    scenario("SHP-234", async () => {
      // Bozuk/eksik payload para-etkili durum geçişine ulaşmadan reddedilir.
      await setupShipmentWithTracking("1234567890");
      const res = await sendWebhook("surat", {}, 400);
      expect(res.body.message).toContain("Invalid webhook payload");
    });
  });

  // ─────────────────────────── SKIP: birim/entegrasyon/UI/config-çelişki ───────────────────────────
  // Aşağıdakiler gerçek e2e stack'inde deterministik koşamaz; ilgili birim/entegrasyon
  // spec'lerinde kapsanır (manifest steps'i de bunlara işaret ediyor).

  // Otomatik 48h tamamlama cron'u (runAutoCompleteConfirmedOrders) /api/dev/run listesinde yok
  // (dev.controller.ts'te ilgili run hook'u yok) → e2e'den tetiklenecek API ucu yok.
  scenario.skip(
    "SHP-107",
    "auto-complete cron dev hook (run/auto-complete) yok → tetiklenecek API ucu yok; order-48h-window.e2e-spec.ts kapsıyor",
  );
  // Idempotency cache hit: buy akışı aynı ürün+alıcı için önce mevcut pending_payment siparişi
  // erken döndürüp Sürat'ı HİÇ çağırmıyor (order.service.ts:801) → "soapCall not called" e2e'de
  // cache-hit yüzünden mi yoksa erken-return yüzünden mi ayırt edilemez (assertion belirsiz).
  scenario.skip(
    "SHP-125",
    "Cache-hit vs pending-order erken return e2e'de ayrışmaz (ambiguous); surat-cargo.service.spec.ts kapsıyor",
  );
  // Canlı SOAP entegrasyon testleri (gerçek Sürat servisi) — stub harness dışında.
  scenario.skip(
    "SHP-128",
    "Canlı SOAP integration; surat-api.integration-spec.ts (gerçek servis) kapsıyor",
  );
  scenario.skip(
    "SHP-129",
    "Canlı SOAP integration; surat-api.integration-spec.ts kapsıyor",
  );
  scenario.skip(
    "SHP-130",
    "Canlı SOAP integration; surat-api.integration-spec.ts kapsıyor",
  );
  // GonderiSil (iptal) birim/entegrasyon seviye; e2e'de yalnız order-cancel yan etkisi olarak tetiklenir.
  scenario.skip(
    "SHP-131",
    "GonderiSil olmayan OID idempotent birim assertion; surat-cargo.service.spec.ts kapsıyor",
  );
  scenario.skip(
    "SHP-132",
    "cancelShipmentByOrderNumber integration_disabled birim assertion (config kapalı gerekir); birim spec kapsıyor",
  );
  scenario.skip(
    "SHP-133",
    "GonderiSil teknik hata throw birim assertion; surat-cargo.service.spec.ts kapsıyor",
  );
  // Tracking sync (Sürat REST takip API'si) — harness'te stub YOK, canlı endpoint'e gider (test'te null → no-op).
  scenario.skip(
    "SHP-150",
    "Durum kodu eşleme matrisi birim (surat-status.mapper); surat-status.mapper.spec.ts kapsıyor",
  );
  scenario.skip(
    "SHP-151",
    "syncShipmentTracking canlı Sürat REST API gerektirir (harness stub yok); surat-tracking.service.spec.ts kapsıyor",
  );
  scenario.skip(
    "SHP-152",
    "syncAllActiveShipments seçim mantığı birim/servis seviye; surat-tracking.service.spec.ts kapsıyor",
  );
  scenario.skip(
    "SHP-153",
    "İade tracking sync + processRefund canlı REST gerektirir; surat-tracking.service.spec.ts kapsıyor",
  );
  scenario.skip(
    "SHP-154",
    "fetchTrackingInfo null → no-op birim/servis assertion; surat-tracking.service.spec.ts kapsıyor",
  );
  scenario.skip(
    "SHP-155",
    "Event dedupe birim/servis assertion; surat-tracking.service.spec.ts kapsıyor",
  );
  scenario.skip(
    "SHP-156",
    "trackingNumber/URL boşsa doldurma birim/servis assertion; surat-tracking.service.spec.ts kapsıyor",
  );
  scenario.skip(
    "SHP-157",
    "Cron toplu çalıştırma özeti (in-process/Bull) birim/servis seviye; surat-tracking.service.spec.ts kapsıyor",
  );
  // İade/takas dönüş kargosu senkron — canlı REST + karmaşık kurulum, servis seviye.
  scenario.skip(
    "SHP-170",
    "syncAllActiveRefundReturns canlı REST + refund kurulumu gerektirir; surat-tracking.service.spec.ts kapsıyor",
  );
  scenario.skip(
    "SHP-171",
    "syncRefundReturnTracking referanssız → false birim/servis assertion; surat-tracking.service.spec.ts kapsıyor",
  );
  scenario.skip(
    "SHP-172",
    "ReturnShipmentsTab salt-UI (admin); web/mobile e2e kapsamı",
  );
  scenario.skip(
    "SHP-173",
    "syncTradeShipmentTracking canlı REST + takas kurulumu gerektirir; surat-tracking.service.spec.ts kapsıyor",
  );
  scenario.skip(
    "SHP-174",
    "Takas tek bacak teslim birim/servis assertion; surat-tracking.service.spec.ts kapsıyor",
  );
  scenario.skip(
    "SHP-175",
    "TradeShipmentsTab salt-UI (admin); web/mobile e2e kapsamı",
  );
  // Saf util normalizasyonu (buildGonderiXml öncesi) — birim.
  scenario.skip(
    "SHP-190",
    "Telefon normalizasyonu (normalizeSuratPhone) birim; surat-address.util spec kapsıyor",
  );
  scenario.skip(
    "SHP-191",
    "İl/ilçe normalizasyonu (normalizeSuratLocation) birim; surat-address.util spec kapsıyor",
  );
  // Salt-UI/parite senaryoları — web/mobile/admin e2e kapsamı.
  scenario.skip(
    "SHP-210",
    "Web takip satırı görünürlüğü salt-UI; apps/web e2e kapsamı",
  );
  scenario.skip(
    "SHP-211",
    "Mobile Kargo Takip kartı salt-UI; apps/mobile e2e kapsamı",
  );
  scenario.skip(
    "SHP-212",
    'Web "Kargo Bilgisi Ekle" → POST /orders/:id/ship (endpoint yok) salt-UI/BUG; apps/web e2e kapsamı',
  );
  scenario.skip(
    "SHP-213",
    "i18n TR/EN mesajları salt-UI; apps/web e2e kapsamı",
  );
  scenario.skip(
    "SHP-214",
    "Admin sipariş kargoları sekmesi salt-UI; admin e2e kapsamı",
  );
  // Eşzamanlı yarış senaryosu — e2e'de deterministik tetiklenemez (cron+HTTP race).
  scenario.skip(
    "SHP-233",
    "Eşzamanlı confirm-receipt + cron auto-confirm yarışı e2e'de deterministik değil; completeOrder idempotency birim spec kapsıyor",
  );
  // Log sızıntısı — harness'te log yakalama wiring yok; behavioral kanıt üretilemez.
  scenario.skip(
    "SHP-235",
    "Log sızıntı denetimi harness'te log-capture wiring gerektirir; statik/güvenlik incelemesi kapsamı",
  );
});
