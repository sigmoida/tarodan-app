/**
 * 15 — Stok Bütünlüğü & Rezervasyon (STK) — Test Konsolu senaryoları.
 *
 * Bu dosya 01-auth / 09-ord FAN-OUT ŞABLONUNU birebir izler. Her test
 * `scenario('<ID>', fn)` ile manifest'e bağlanır (izlenebilirlik + başlık/pri
 * otomatik). Boilerplate ve assertion stilleri mevcut yeşil 09-ord / 12-ref /
 * stock-integrity-proof e2e dosyalarından alınmıştır.
 *
 * Ortam (apps/api/.env.test):
 *   - PAYMENT_BYPASS=false → PayTR callback (signCallback) ile ödeme tamamlanır.
 *   - SURAT_CARGO_ENABLED=true + SURAT_SOAP_MODE=stub → buy/checkout/offer-order
 *     yaratımında StubSuratSoapClient çağrılır ve varsayılan 'Tamam' (başarı) döner.
 *   - PAYMENT_TIMEOUT_MINUTES=5 → createdAt 31dk geri çekilip
 *     releaseExpiredOrderReservations() ile rezervasyon serbest bırakılır.
 *
 * Stok kuralları (kaynak: order.service.ts / payment.service.ts / product-lock.service.ts):
 *   - Buy Now / checkout: rezervasyon (reservedQuantity++) alınır, fiziksel quantity
 *     ödeme tamamlanınca (PayTR success callback) düşer.
 *   - Teklif akışı: accept STOK DEĞİŞTİRMEZ; rezervasyon ödeme başlatılınca (initiate) alınır.
 *   - Ödeme başarısı stok bitince (quantity<=0) stockout kaskadı: diğer açık
 *     sipariş/teklifler iptal + OUT_OF_STOCK bildirimleri.
 *   - Cron'lar HTTP dev hook (/api/dev/run/*) ile veya DI konteynerinden
 *     (ctx.module.get(PaymentService)) çağrılır. reconcileReservedQuantities /
 *     expireUnpaidOrders dev hook'ta YOK → doğrudan servis metodu çağrılır.
 */
import * as request from "supertest";
import { randomUUID } from "crypto";
import {
  OrderStatus,
  OfferStatus,
  PaymentStatus,
  ProductStatus,
} from "@prisma/client";
import { createE2ETestApp, E2ETestApp } from "../../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../../test-utils/db";
import { createUser, authHeader } from "../../factories/user.factory";
import { createProduct } from "../../factories/product.factory";
import { createAddress } from "../../factories/address.factory";
import { createOfferRow } from "../../factories/offer.factory";
import { scenario } from "../../test-utils/scenario";
import { signCallback } from "../../mocks/paytr.mock";
import { runScheduler } from "../../test-utils/dev";
import {
  clearMailbox,
  getLastEmailTo,
  extractCode,
} from "../../test-utils/mail";
import { PaymentService } from "../../../src/modules/payment/payment.service";
import { ProductService } from "../../../src/modules/product/product.service";

describe("15 — Stok Bütünlüğü & Rezervasyon (STK)", () => {
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
  });

  // ──────────────────────────── ortak yardımcılar ────────────────────────────

  const prisma = () => getPrisma();

  async function makeProduct(opts: {
    sellerId: string;
    price?: number;
    quantity?: number | null;
    status?: "active" | "inactive" | "sold";
  }) {
    const p = await createProduct({
      sellerId: opts.sellerId,
      categoryId: baseline.categoryId,
      price: opts.price ?? 100,
      quantity: opts.quantity === undefined ? 1 : (opts.quantity ?? 1),
      status: opts.status ?? "active",
    });
    // Factory quantity `?? 1` ile null'ı 1 yapar → sınırsız stok için doğrudan set.
    if (opts.quantity === null) {
      await prisma().product.update({
        where: { id: p.id },
        data: { quantity: null },
      });
    }
    return p;
  }

  /** Alıcı + satıcı + ürün + alıcı adresi (varsayılan fiyat 100, adet 1). */
  async function setup(
    opts: {
      price?: number;
      quantity?: number | null;
      status?: "active" | "inactive" | "sold";
    } = {},
  ) {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      price: opts.price,
      quantity: opts.quantity,
      status: opts.status,
    });
    const addr = await createAddress({ userId: buyer.id });
    return { buyer, seller, product, addr };
  }

  const buyNow = (
    buyer: { accessToken: string },
    productId: string,
    shippingAddressId?: string,
  ) =>
    request(server())
      .post("/api/orders/buy")
      .set(authHeader(buyer))
      .send(
        shippingAddressId ? { productId, shippingAddressId } : { productId },
      );

  const initiate = (buyer: { accessToken: string }, orderId: string) =>
    request(server())
      .post("/api/payments/initiate")
      .set(authHeader(buyer))
      .send({ orderId, provider: "paytr" });

  const initiateGroup = (
    buyer: { accessToken: string },
    checkoutGroupId: string,
  ) =>
    request(server())
      .post("/api/payments/initiate")
      .set(authHeader(buyer))
      .send({ checkoutGroupId, provider: "paytr" });

  async function lastPaymentByOrder(orderId: string) {
    return prisma().payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
  }
  async function paymentByGroup(checkoutGroupId: string) {
    return prisma().payment.findFirst({
      where: { checkoutGroupId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Başarılı/başarısız PayTR callback'i (kuruş = amount*100). */
  function callback(
    payment: { providerConversationId: string | null; amount: any },
    status: "success" | "failed" = "success",
  ) {
    return request(server())
      .post("/api/payments/callback/paytr")
      .send(
        signCallback({
          merchantOid: payment.providerConversationId!,
          status,
          totalAmount: Math.round(Number(payment.amount) * 100),
        }),
      );
  }

  /**
   * NON-async yardımcılar: çağrı yerleri sonucu doğrudan `.expect(200)` ile
   * zincirler, yani `request.Test` dönmelidir (Promise değil). Payment'ı bulmak
   * için gereken asenkron DB okuması, supertest isteği fiilen gönderilmeden
   * (`.end` çağrılmadan) hemen önce yapılır; böylece fonksiyon senkron kalırken
   * imza yine ilgili payment'a göre üretilir. Çağrı yerleri değişmez.
   * (Şablon: 09-ord.e2e-spec.ts successCallback.)
   */
  function callbackForPayment(
    lookup: () => Promise<{
      providerConversationId: string | null;
      amount: any;
    } | null>,
    status: "success" | "failed" = "success",
  ): request.Test {
    const test = request(server()).post("/api/payments/callback/paytr");
    const originalEnd = test.end.bind(test);
    (test as any).end = (cb: (err: any, res: any) => void) => {
      lookup()
        .then((payment) => {
          test.send(
            signCallback({
              merchantOid: payment!.providerConversationId!,
              status,
              totalAmount: Math.round(Number(payment!.amount) * 100),
            }),
          );
          originalEnd(cb);
        })
        .catch((err) => cb(err, undefined));
      return test;
    };
    return test;
  }

  function successCallbackForOrder(
    orderId: string,
    status: "success" | "failed" = "success",
  ): request.Test {
    return callbackForPayment(() => lastPaymentByOrder(orderId), status);
  }
  function successCallbackForGroup(
    checkoutGroupId: string,
    status: "success" | "failed" = "success",
  ): request.Test {
    return callbackForPayment(() => paymentByGroup(checkoutGroupId), status);
  }

  /** buy + initiate + başarılı callback → ödeme tamamlanmış sipariş (status preparing). */
  async function buyAndPay(
    buyer: { accessToken: string },
    productId: string,
    addrId: string,
  ): Promise<string> {
    const res = await buyNow(buyer, productId, addrId).expect(201);
    const orderId = res.body.orderId as string;
    await initiate(buyer, orderId).expect(201);
    await successCallbackForOrder(orderId).expect(200);
    return orderId;
  }

  /** Üye checkout: tek grup, tek ürün, verilen adet. */
  function checkout(
    buyer: { accessToken: string },
    productId: string,
    quantity: number,
    addrId: string,
    idempotencyKey = randomUUID(),
  ) {
    return request(server())
      .post("/api/orders/checkout")
      .set(authHeader(buyer))
      .send({
        items: [{ productId, quantity }],
        idempotencyKey,
        shippingAddressId: addrId,
      });
  }

  async function readProduct(id: string) {
    const p = await prisma().product.findUnique({ where: { id } });
    return {
      quantity: p!.quantity,
      reserved: p!.reservedQuantity ?? 0,
      status: p!.status,
      available:
        p!.quantity === null
          ? null
          : Math.max(0, (p!.quantity ?? 0) - (p!.reservedQuantity ?? 0)),
    };
  }

  const paymentSvc = () => ctx.module.get(PaymentService);

  // ═══════════════════════════ Rezervasyon (Buy Now / Teklif) ═══════════════════════════

  scenario("STK-001", async () => {
    // Buy Now rezervasyon yapar, fiziksel stok dokunulmaz.
    const { buyer, product, addr } = await setup({ quantity: 2, price: 100 });
    const res = await buyNow(buyer, product.id, addr.id).expect(201);
    expect(res.body.orderId).toBeTruthy();
    expect(res.body.orderNumber).toBeTruthy();
    expect(res.body.totalAmount).toBeGreaterThan(0);

    const order = await prisma().order.findUnique({
      where: { id: res.body.orderId },
    });
    expect(order?.status).toBe(OrderStatus.pending_payment);

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(1);
    expect(p.quantity).toBe(2); // değişmedi
    expect(p.available).toBe(1); // 2 - 1
  });

  scenario("STK-002", async () => {
    // Teklif akışında rezervasyon ödeme başlatınca alınır (kabulde değil).
    const { buyer, seller, product } = await setup({ quantity: 1, price: 100 });
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      amount: 80,
    });

    // accept: stok/rezerv değişmez, offerId'li pending_payment order oluşur (Payment YOK).
    await request(server())
      .post(`/api/offers/${offer.id}/accept`)
      .set(authHeader(seller))
      .expect(200);
    let p = await readProduct(product.id);
    expect(p.reserved).toBe(0);

    const order = await prisma().order.findFirst({
      where: { offerId: offer.id },
    });
    expect(order?.status).toBe(OrderStatus.pending_payment);

    // initiate: rezervasyon şimdi alınır.
    await initiate(buyer, order!.id).expect(201);
    p = await readProduct(product.id);
    expect(p.reserved).toBe(1);
    const orderAfter = await prisma().order.findUnique({
      where: { id: order!.id },
    });
    expect(orderAfter?.status).toBe(OrderStatus.pending_payment);
  });

  scenario("STK-003", async () => {
    // Aynı alıcının bekleyen siparişi varsa yeni rezervasyon açılmaz (existingOrder döner).
    const { buyer, product, addr } = await setup({ quantity: 2 });
    const first = await buyNow(buyer, product.id, addr.id).expect(201);
    const second = await buyNow(buyer, product.id, addr.id).expect(201);
    expect(second.body.existingOrder).toBe(true);
    expect(second.body.orderId).toBe(first.body.orderId);

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(1); // 2 olmadı
    const count = await prisma().order.count({
      where: { buyerId: buyer.id, productId: product.id },
    });
    expect(count).toBe(1);
  });

  scenario("STK-004", async () => {
    // Stokta olmayan (fully reserved) üründe Buy Now reddedilir.
    const { buyer, product, addr } = await setup({ quantity: 1 });
    await prisma().product.update({
      where: { id: product.id },
      data: { reservedQuantity: 1 },
    }); // available=0
    const res = await buyNow(buyer, product.id, addr.id).expect(400);
    expect(JSON.stringify(res.body)).toMatch(
      /stokta bulunmamaktadır|satışta değil/,
    );

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(1); // değişmedi
    const count = await prisma().order.count({
      where: { productId: product.id },
    });
    expect(count).toBe(0);
  });

  // ═══════════════════════════ Ödeme → stok düşümü ═══════════════════════════

  scenario("STK-010", async () => {
    // Tek ürün ödemesi başarılı → quantity−1, reserved−1, stok bitince inactive.
    const { buyer, product, addr } = await setup({ quantity: 1, price: 100 });
    const orderId = await buyAndPay(buyer, product.id, addr.id);

    const order = await prisma().order.findUnique({ where: { id: orderId } });
    expect([OrderStatus.preparing, OrderStatus.paid]).toContain(order?.status);

    const p = await readProduct(product.id);
    expect(p.quantity).toBe(0);
    expect(p.reserved).toBe(0);
    expect(p.status).toBe(ProductStatus.inactive);
  });

  scenario("STK-011", async () => {
    // Çoklu stok: ödeme yalnız sipariş adedini düşürür (3'ten 1 al).
    const { buyer, product, addr } = await setup({ quantity: 3, price: 100 });
    await buyAndPay(buyer, product.id, addr.id);
    const p = await readProduct(product.id);
    expect(p.quantity).toBe(2);
    expect(p.reserved).toBe(0);
    expect(p.status).toBe(ProductStatus.active); // hâlâ stok var
  });

  scenario("STK-012", async () => {
    // Ödeme başarısı stok bitince stockout kaskadını tetikler (kaybeden teklif/sipariş iptal).
    const {
      buyer: fastBuyer,
      seller,
      product,
      addr,
    } = await setup({ quantity: 1, price: 100 });
    const slowBuyer = await createUser(ctx.module);

    // slowBuyer teklif verir, satıcı kabul eder → offerId'li pending_payment order (rezerv yok).
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: slowBuyer.id,
      sellerId: seller.id,
      amount: 90,
    });
    await request(server())
      .post(`/api/offers/${offer.id}/accept`)
      .set(authHeader(seller))
      .expect(200);
    const slowOrder = await prisma().order.findFirst({
      where: { offerId: offer.id },
    });

    // fastBuyer Buy Now → initiate → success callback ile uçtan uca öder.
    await buyAndPay(fastBuyer, product.id, addr.id);

    const p = await readProduct(product.id);
    expect(p.quantity).toBe(0);
    expect(p.reserved).toBe(0); // negatif değil

    const cancelledOffer = await prisma().offer.findUnique({
      where: { id: offer.id },
    });
    expect(cancelledOffer?.status).toBe(OfferStatus.cancelled);
    expect(cancelledOffer?.cancelReason ?? "").toMatch(/Stok/i);
    const cancelledSlowOrder = await prisma().order.findUnique({
      where: { id: slowOrder!.id },
    });
    expect(cancelledSlowOrder?.status).toBe(OrderStatus.cancelled);
  });

  scenario("STK-013", async () => {
    // Çoklu stok + 2 eşzamanlı alıcı: ilk ödeme ikinciyi iptal ETMEZ.
    const {
      buyer: b1,
      product,
      addr: a1,
    } = await setup({ quantity: 2, price: 100 });
    const b2 = await createUser(ctx.module);
    const a2 = await createAddress({ userId: b2.id });

    const r1 = await buyNow(b1, product.id, a1.id).expect(201);
    const r2 = await buyNow(b2, product.id, a2.id).expect(201);
    // ilk alıcı öder
    await initiate(b1, r1.body.orderId).expect(201);
    await successCallbackForOrder(r1.body.orderId).expect(200);

    const p = await readProduct(product.id);
    expect(p.quantity).toBe(1);
    expect(p.reserved).toBe(1); // ikincinin rezervi duruyor

    const order2 = await prisma().order.findUnique({
      where: { id: r2.body.orderId },
    });
    expect(order2?.status).toBe(OrderStatus.pending_payment); // iptal/iade edilmedi
  });

  // ═══════════════════════════ İptal / İade ═══════════════════════════

  scenario("STK-020", async () => {
    // Ödenmemiş sipariş iptali → rezervasyon serbest, fiziksel dokunulmaz.
    const { buyer, product, addr } = await setup({ quantity: 1 });
    const res = await buyNow(buyer, product.id, addr.id).expect(201);
    await request(server())
      .post(`/api/orders/${res.body.orderId}/cancel`)
      .set(authHeader(buyer))
      .send({ reason: "vazgeçtim" })
      .expect(200);

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(0);
    expect(p.quantity).toBe(1); // dokunulmadı
    expect(p.available).toBe(1);
    const order = await prisma().order.findUnique({
      where: { id: res.body.orderId },
    });
    expect(order?.status).toBe(OrderStatus.cancelled);
  });

  scenario("STK-021", async () => {
    // Ödenmiş sipariş iptali → refunded; iade işlenince fiziksel stok geri yüklenir.
    const { buyer, product, addr } = await setup({ quantity: 1, price: 100 });
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    // ödeme sonrası quantity=0, inactive
    let p = await readProduct(product.id);
    expect(p.quantity).toBe(0);

    // iptal → paid/preparing olduğu için status refunded olur (iade tetiklenir).
    await request(server())
      .post(`/api/orders/${orderId}/cancel`)
      .set(authHeader(buyer))
      .send({ reason: "iade istiyorum" })
      .expect(200);
    const refundedOrder = await prisma().order.findUnique({
      where: { id: orderId },
    });
    expect(refundedOrder?.status).toBe(OrderStatus.refunded);

    // iade işle → stok +1, sipariş cancelled.
    await paymentSvc().processRefund(orderId);
    p = await readProduct(product.id);
    expect(p.quantity).toBe(1); // restok
    expect(p.status).toBe(ProductStatus.active); // tekrar satışta
    const cancelled = await prisma().order.findUnique({
      where: { id: orderId },
    });
    expect(cancelled?.status).toBe(OrderStatus.cancelled);
  });

  scenario("STK-022", async () => {
    // 3-adetlik sipariş iadesi 3 adet restok eder (1 değil). Başlangıç quantity=5, 3 al → 2, iade → 5.
    const { buyer, product, addr } = await setup({ quantity: 5, price: 100 });
    const res = await checkout(buyer, product.id, 3, addr.id).expect(201);
    const groupId = res.body.checkoutGroupId as string;
    const order = await prisma().order.findFirst({
      where: { checkoutGroupId: groupId },
    });
    await initiateGroup(buyer, groupId).expect(201);
    await successCallbackForGroup(groupId).expect(200);

    let p = await readProduct(product.id);
    expect(p.quantity).toBe(2); // 5 - 3

    // iptal → refunded, iade işle → +3
    await request(server())
      .post(`/api/orders/${order!.id}/cancel`)
      .set(authHeader(buyer))
      .send({ reason: "iade" })
      .expect(200);
    await paymentSvc().processRefund(order!.id);

    p = await readProduct(product.id);
    expect(p.quantity).toBe(5); // 2 + 3
    expect(p.status).toBe(ProductStatus.active);
  });

  scenario("STK-023", async () => {
    // Kargolanmış sipariş iptal edilemez.
    const { buyer, product, addr } = await setup({ quantity: 1, price: 100 });
    const orderId = await buyAndPay(buyer, product.id, addr.id);
    await prisma().order.update({
      where: { id: orderId },
      data: { status: OrderStatus.shipped },
    });

    const before = await readProduct(product.id);
    const res = await request(server())
      .post(`/api/orders/${orderId}/cancel`)
      .set(authHeader(buyer))
      .send({ reason: "vazgeçtim" })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain(
      "kargoya verildikten sonra iptal edilemez",
    );

    const after = await readProduct(product.id);
    expect(after.quantity).toBe(before.quantity); // stok değişmedi
  });

  scenario("STK-024", async () => {
    // Kısmi adet iadesi (refundQuantity=1): stok kısmen geri döner, sipariş açık kalır.
    const { buyer, product, addr } = await setup({ quantity: 5, price: 100 });
    const res = await checkout(buyer, product.id, 3, addr.id).expect(201);
    const groupId = res.body.checkoutGroupId as string;
    const order = await prisma().order.findFirst({
      where: { checkoutGroupId: groupId },
    });
    await initiateGroup(buyer, groupId).expect(201);
    await successCallbackForGroup(groupId).expect(200);

    let p = await readProduct(product.id);
    expect(p.quantity).toBe(2); // 5 - 3

    // Kısmi tutar (1 adet) iadesi → stok 2→3, sipariş cancelled OLMAZ (tam iade eşiği altı).
    const unitTotal = Number(order!.totalAmount) / (order!.quantity ?? 3);
    await paymentSvc().processRefund(order!.id, unitTotal, {
      refundQuantity: 1,
    });

    p = await readProduct(product.id);
    expect(p.quantity).toBe(3); // 2 + 1
    const openOrder = await prisma().order.findUnique({
      where: { id: order!.id },
    });
    expect(openOrder?.status).not.toBe(OrderStatus.cancelled);
  });

  // ═══════════════════════════ Uçtan uca çoklu-adet + checkout sınırları ═══════════════════════════

  scenario("STK-030", async () => {
    // 5 stoktan 3 al: rezerve 3, öde→2, iade→5 (uçtan uca).
    const { buyer, product, addr } = await setup({ quantity: 5, price: 100 });
    const res = await checkout(buyer, product.id, 3, addr.id).expect(201);
    const groupId = res.body.checkoutGroupId as string;
    const order = await prisma().order.findFirst({
      where: { checkoutGroupId: groupId },
    });
    expect(order?.quantity).toBe(3);

    let p = await readProduct(product.id);
    expect(p.reserved).toBe(3);
    expect(p.quantity).toBe(5);
    expect(p.available).toBe(2);

    await initiateGroup(buyer, groupId).expect(201);
    await successCallbackForGroup(groupId).expect(200);
    p = await readProduct(product.id);
    expect(p.quantity).toBe(2);
    expect(p.reserved).toBe(0);

    await request(server())
      .post(`/api/orders/${order!.id}/cancel`)
      .set(authHeader(buyer))
      .send({ reason: "iade" })
      .expect(200);
    await paymentSvc().processRefund(order!.id);
    p = await readProduct(product.id);
    expect(p.quantity).toBe(5);
    expect(p.status).toBe(ProductStatus.active);
  });

  scenario("STK-031", async () => {
    // Stoktan fazla checkout reddedilir (6/5). Body { message, productId }.
    const { buyer, product, addr } = await setup({ quantity: 5, price: 100 });
    const res = await checkout(buyer, product.id, 6, addr.id).expect(400);
    expect(res.body.message).toMatch(
      /yeterli stok yok \(istenen 6, mevcut 5\)/,
    );
    expect(res.body.productId).toBe(product.id);

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(0); // değişmedi
  });

  scenario("STK-032", async () => {
    // Checkout adet DTO sınırı: Min 1 / Max 20.
    const { buyer, product, addr } = await setup({ quantity: 5 });
    for (const q of [0, 21, -1]) {
      const res = await checkout(buyer, product.id, q, addr.id).expect(400);
      const msg = JSON.stringify(res.body);
      if (q === 21) {
        expect(msg).toContain("Tek üründen en fazla 20 adet alınabilir");
      } else {
        expect(msg).toContain("Adet en az 1 olmalıdır");
      }
    }
    const p = await readProduct(product.id);
    expect(p.reserved).toBe(0);
  });

  scenario("STK-033", async () => {
    // Sepette 20'den fazla ürün (21 farklı satır) reddedilir.
    const { buyer, seller, addr } = await setup({ quantity: 5 });
    const items: Array<{ productId: string; quantity: number }> = [];
    for (let i = 0; i < 21; i++) {
      const p = await makeProduct({ sellerId: seller.id, quantity: 5 });
      items.push({ productId: p.id, quantity: 1 });
    }
    const res = await request(server())
      .post("/api/orders/checkout")
      .set(authHeader(buyer))
      .send({ items, idempotencyKey: randomUUID(), shippingAddressId: addr.id })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain(
      "Tek siparişte en fazla 20 ürün alınabilir",
    );
  });

  scenario("STK-034", async () => {
    // Terk edilmiş checkout siparişi yeni denemede stok kilitlemez (eski iptal + yeni rezerv, net 1).
    const { buyer, product, addr } = await setup({ quantity: 1, price: 100 });
    const first = await checkout(buyer, product.id, 1, addr.id).expect(201);
    const firstOrder = await prisma().order.findFirst({
      where: { checkoutGroupId: first.body.checkoutGroupId },
    });
    let p = await readProduct(product.id);
    expect(p.reserved).toBe(1);

    // Aynı ürünü yeni idempotencyKey ile tekrar checkout → stok hatası YOK.
    const second = await checkout(
      buyer,
      product.id,
      1,
      addr.id,
      randomUUID(),
    ).expect(201);
    const secondOrder = await prisma().order.findFirst({
      where: { checkoutGroupId: second.body.checkoutGroupId },
    });
    expect(secondOrder!.id).not.toBe(firstOrder!.id);

    const oldOrder = await prisma().order.findUnique({
      where: { id: firstOrder!.id },
    });
    expect(oldOrder?.status).toBe(OrderStatus.cancelled);
    expect(oldOrder?.cancelReason).toContain(
      "Yeni toplu sipariş ile değiştirildi",
    );

    p = await readProduct(product.id);
    expect(p.reserved).toBe(1); // eski bırakıldı + yeni alındı → net 1
  });

  // ═══════════════════════════ Negatif-stok / clamp güvenliği ═══════════════════════════

  scenario("STK-040", async () => {
    // Stok uçuş sırasında 0'a kayarsa ödeme quantity'yi negatife itmez (GREATEST(q-1,0)).
    const { buyer, product, addr } = await setup({ quantity: 1, price: 100 });
    const res = await buyNow(buyer, product.id, addr.id).expect(201);
    await initiate(buyer, res.body.orderId).expect(201);
    // Ödeme öncesi stok başka yolla 0'a kaydırılır.
    await prisma().product.update({
      where: { id: product.id },
      data: { quantity: 0 },
    });
    await successCallbackForOrder(res.body.orderId).expect(200);

    const p = await readProduct(product.id);
    expect(p.quantity).toBe(0); // GREATEST(0-1,0)=0, asla -1
    expect(p.quantity).toBeGreaterThanOrEqual(0);
  });

  scenario("STK-041", async () => {
    // Zaman aşımı sonrası iptal reservedQuantity'yi negatife itmez (guard + clamp).
    const { buyer, product, addr } = await setup({ quantity: 1 });
    const res = await buyNow(buyer, product.id, addr.id).expect(201);
    // createdAt'i 31dk geri çek → rezerv serbest, sipariş pending_payment kalır.
    await prisma().order.update({
      where: { id: res.body.orderId },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    await runScheduler(ctx.app, "release-expired-reservations");

    let p = await readProduct(product.id);
    expect(p.reserved).toBe(0);
    const mid = await prisma().order.findUnique({
      where: { id: res.body.orderId },
    });
    expect(mid?.status).toBe(OrderStatus.pending_payment);
    expect(mid?.reservationReleasedAt).not.toBeNull();

    // Alıcı yine iptal eder → rezerv 2. kez düşmez.
    await request(server())
      .post(`/api/orders/${res.body.orderId}/cancel`)
      .set(authHeader(buyer))
      .send({ reason: "vazgeçtim" })
      .expect(200);
    p = await readProduct(product.id);
    expect(p.reserved).toBeGreaterThanOrEqual(0);
    expect(p.available!).toBeLessThanOrEqual(1); // oversell yok
  });

  scenario("STK-042", async () => {
    // Ödeme başarısızlığı zaten-bırakılmış rezervi tekrar düşmez.
    const { buyer, product, addr } = await setup({ quantity: 1 });
    const res = await buyNow(buyer, product.id, addr.id).expect(201);
    await initiate(buyer, res.body.orderId).expect(201);
    // 31dk geri + rezerv serbest → reservationReleasedAt dolu.
    await prisma().order.update({
      where: { id: res.body.orderId },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    await runScheduler(ctx.app, "release-expired-reservations");
    // Retry: initiate CAS ile reservationReleasedAt temizler, rezerv tekrar 1.
    await initiate(buyer, res.body.orderId).expect(201);
    let p = await readProduct(product.id);
    expect(p.reserved).toBe(1);

    // failed callback → rezerv 1 kez bırakılır, negatife inmez, sipariş cancelled.
    await successCallbackForOrder(res.body.orderId, "failed").expect(200);
    p = await readProduct(product.id);
    expect(p.reserved).toBeGreaterThanOrEqual(0);
    const order = await prisma().order.findUnique({
      where: { id: res.body.orderId },
    });
    expect(order?.status).toBe(OrderStatus.cancelled);
  });

  // ═══════════════════════════ Eşzamanlılık (yarışlar) ═══════════════════════════

  scenario("STK-050", async () => {
    // Son ünite için 2 eşzamanlı Buy Now: biri 201, biri 400.
    const { buyer: b1, product, addr: a1 } = await setup({ quantity: 1 });
    const b2 = await createUser(ctx.module);
    const a2 = await createAddress({ userId: b2.id });

    const [r1, r2] = await Promise.all([
      buyNow(b1, product.id, a1.id),
      buyNow(b2, product.id, a2.id),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 400]);

    const p = await readProduct(product.id);
    expect(p.quantity).toBe(1);
    expect(p.reserved).toBe(1);
    const pending = await prisma().order.count({
      where: { productId: product.id, status: OrderStatus.pending_payment },
    });
    expect(pending).toBe(1);
  });

  scenario("STK-051", async () => {
    // quantity=3'e 5 paralel Buy Now: tam 3 başarı, 2 hata; reserved=3 (asla over-reserve).
    const { seller, product } = await setup({ quantity: 3 });
    const buyers = await Promise.all(
      Array.from({ length: 5 }, () => createUser(ctx.module)),
    );
    const addrs = await Promise.all(
      buyers.map((b) => createAddress({ userId: b.id })),
    );

    const results = await Promise.all(
      buyers.map((b, i) => buyNow(b, product.id, addrs[i].id)),
    );
    const ok = results.filter((r) => r.status === 201).length;
    const bad = results.filter((r) => r.status === 400).length;
    expect(ok).toBe(3);
    expect(bad).toBe(2);

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(3); // asla over-reserve
    expect(p.quantity).toBe(3);
    void seller;
  });

  scenario("STK-052", async () => {
    // Son ünitede Buy Now + offer.accept yarışı: toplam rezerv <= 1.
    const { buyer, seller, product, addr } = await setup({ quantity: 1 });
    const offerBuyer = await createUser(ctx.module);
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: offerBuyer.id,
      sellerId: seller.id,
      amount: 80,
    });

    const [buyRes, acceptRes] = await Promise.all([
      buyNow(buyer, product.id, addr.id),
      request(server())
        .post(`/api/offers/${offer.id}/accept`)
        .set(authHeader(seller)),
    ]);
    // En az biri başarılı (accept stok değiştirmez, buy rezerve eder).
    expect(
      [buyRes.status, acceptRes.status].some((s) => s === 200 || s === 201),
    ).toBe(true);

    const p = await readProduct(product.id);
    expect(p.reserved).toBeLessThanOrEqual(1);
    expect(p.quantity).toBe(1);
  });

  scenario("STK-053", async () => {
    // Üç paralel özdeş başarı callback'i siparişi tam bir kez sonlandırır (idempotent).
    const { buyer, product, addr } = await setup({ quantity: 1, price: 100 });
    const res = await buyNow(buyer, product.id, addr.id).expect(201);
    await initiate(buyer, res.body.orderId).expect(201);
    const payment = await lastPaymentByOrder(res.body.orderId);

    const cbs = await Promise.all(
      Array.from({ length: 3 }, () => callback(payment!, "success")),
    );
    for (const c of cbs) expect(c.status).toBe(200);

    const order = await prisma().order.findUnique({
      where: { id: res.body.orderId },
    });
    expect([OrderStatus.preparing, OrderStatus.paid]).toContain(order?.status);

    const completed = await prisma().payment.count({
      where: { orderId: res.body.orderId, status: PaymentStatus.completed },
    });
    expect(completed).toBe(1);
    const holds = await prisma().paymentHold.count({
      where: { orderId: res.body.orderId },
    });
    expect(holds).toBe(1);

    const p = await readProduct(product.id);
    expect(p.quantity).toBe(0);
    expect(p.reserved).toBe(0);
  });

  scenario("STK-054", async () => {
    // Çoklu stok + iki alıcı ikisi de öder: ikisi de başarılı, quantity=0.
    const {
      buyer: b1,
      product,
      addr: a1,
    } = await setup({ quantity: 2, price: 100 });
    const b2 = await createUser(ctx.module);
    const a2 = await createAddress({ userId: b2.id });

    await buyAndPay(b1, product.id, a1.id);
    await buyAndPay(b2, product.id, a2.id);

    const p = await readProduct(product.id);
    expect(p.quantity).toBe(0);
    expect(p.reserved).toBe(0);
  });

  // ═══════════════════════════ Teklif akışı — rezervasyon ═══════════════════════════

  scenario("STK-060", async () => {
    // Teklif kabulü stoğu/rezervi değiştirmez.
    const { buyer, seller, product } = await setup({ quantity: 1 });
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      amount: 80,
    });
    await request(server())
      .post(`/api/offers/${offer.id}/accept`)
      .set(authHeader(seller))
      .expect(200);

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(0);
    expect(p.quantity).toBe(1);
    expect(p.available).toBe(1);
    const accepted = await prisma().offer.findUnique({
      where: { id: offer.id },
    });
    expect(accepted?.status).toBe(OfferStatus.accepted);
  });

  scenario("STK-061", async () => {
    // Stok bitmiş üründe teklif kabulü reddedilir.
    const { buyer, seller, product } = await setup({ quantity: 1 });
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      amount: 80,
    });
    // Ürünü tamamen rezerve et (available=0) — status hâlâ active.
    await prisma().product.update({
      where: { id: product.id },
      data: { reservedQuantity: 1 },
    });

    const res = await request(server())
      .post(`/api/offers/${offer.id}/accept`)
      .set(authHeader(seller))
      .expect(400);
    expect(JSON.stringify(res.body)).toMatch(
      /yeterli müsait adet yok|artık satışta değil/,
    );
  });

  scenario("STK-062", async () => {
    // Reconcile ödenmemiş teklif siparişini rezervasyon saymaz.
    const { buyer, seller, product } = await setup({ quantity: 1 });
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      amount: 80,
    });
    await request(server())
      .post(`/api/offers/${offer.id}/accept`)
      .set(authHeader(seller))
      .expect(200);
    const order = await prisma().order.findFirst({
      where: { offerId: offer.id },
    });
    const payment = await prisma().payment.findFirst({
      where: { orderId: order!.id },
    });
    expect(payment).toBeNull(); // ödeme başlatılmadı → rezerv yok

    // Drift'i simüle et: reservedQuantity takılı kalmış.
    await prisma().product.update({
      where: { id: product.id },
      data: { reservedQuantity: 1 },
    });
    await paymentSvc().reconcileReservedQuantities();

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(0);
    expect(p.available).toBe(1);
  });

  scenario("STK-063", async () => {
    // Teklif ödeme başlatma retry'da çift rezerve etmez (CAS).
    const { buyer, seller, product } = await setup({ quantity: 1 });
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      amount: 80,
    });
    await request(server())
      .post(`/api/offers/${offer.id}/accept`)
      .set(authHeader(seller))
      .expect(200);
    const order = await prisma().order.findFirst({
      where: { offerId: offer.id },
    });

    const [i1, i2] = await Promise.all([
      initiate(buyer, order!.id),
      initiate(buyer, order!.id),
    ]);
    expect([i1.status, i2.status].every((s) => s === 201)).toBe(true);

    const p = await readProduct(product.id);
    expect(p.reserved).toBeLessThanOrEqual(1); // iki initiate çift artıramaz
    const orderAfter = await prisma().order.findUnique({
      where: { id: order!.id },
    });
    expect(orderAfter?.reservationReleasedAt).toBeNull();
  });

  // ═══════════════════════════ Timeout / reconcile / kill-switch ═══════════════════════════

  scenario("STK-070", async () => {
    // 5dk timeout rezervi bırakır, sipariş retry'a açık kalır.
    const { buyer, product, addr } = await setup({ quantity: 1 });
    const res = await buyNow(buyer, product.id, addr.id).expect(201);
    await prisma().order.update({
      where: { id: res.body.orderId },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    await runScheduler(ctx.app, "release-expired-reservations");

    const p = await readProduct(product.id);
    expect(p.quantity).toBe(1);
    expect(p.reserved).toBe(0);
    expect(p.available).toBe(1);
    expect(p.status).toBe(ProductStatus.active);
    const order = await prisma().order.findUnique({
      where: { id: res.body.orderId },
    });
    expect(order?.status).toBe(OrderStatus.pending_payment); // retry'a açık
  });

  scenario("STK-071", async () => {
    // 3-adetlik siparişin timeout'u 3 adet bırakır.
    const { buyer, product, addr } = await setup({ quantity: 5 });
    const res = await checkout(buyer, product.id, 3, addr.id).expect(201);
    const order = await prisma().order.findFirst({
      where: { checkoutGroupId: res.body.checkoutGroupId },
    });
    let p = await readProduct(product.id);
    expect(p.reserved).toBe(3);

    await prisma().order.update({
      where: { id: order!.id },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    await runScheduler(ctx.app, "release-expired-reservations");

    p = await readProduct(product.id);
    expect(p.reserved).toBe(0); // 3 bırakıldı
    expect(p.quantity).toBe(5);
  });

  scenario("STK-072", async () => {
    // reconcile takılı kalmış reservedQuantity'yi ground-truth'a düzeltir.
    // Ground-truth = 1 (direct-buy pending_payment sipariş), takılı sayaç = 3.
    const { buyer, product, addr } = await setup({ quantity: 5 });
    await buyNow(buyer, product.id, addr.id).expect(201); // reserved → 1 (gerçek)
    await prisma().product.update({
      where: { id: product.id },
      data: { reservedQuantity: 3 },
    }); // drift

    await paymentSvc().reconcileReservedQuantities();

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(1); // ground-truth
    expect(p.available).toBe(4);
  });

  scenario("STK-073", async () => {
    // q=0 üründe takılı rezervin timeout'u status'u inactive yapar (reserved limbo değil).
    const { buyer, product, addr } = await setup({ quantity: 1 });
    const res = await buyNow(buyer, product.id, addr.id).expect(201);
    // Fiziksel stok başka yolla 0'a düşürülmüş, rezerv hâlâ takılı.
    await prisma().product.update({
      where: { id: product.id },
      data: { quantity: 0 },
    });
    await prisma().order.update({
      where: { id: res.body.orderId },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    await runScheduler(ctx.app, "release-expired-reservations");

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(0);
    expect(p.status).toBe(ProductStatus.inactive); // 'reserved' limbosu DEĞİL
  });

  scenario("STK-074", async () => {
    // 24s kill-switch ödenmemiş siparişi süresinde iptal eder (rezerv de bırakılır).
    const { buyer, product, addr } = await setup({ quantity: 1 });
    const res = await buyNow(buyer, product.id, addr.id).expect(201);
    let p = await readProduct(product.id);
    expect(p.reserved).toBe(1);

    // paymentExpiresAt'i geçmişe çek → expireUnpaidOrders adayı.
    await prisma().order.update({
      where: { id: res.body.orderId },
      data: { paymentExpiresAt: new Date(Date.now() - 60 * 1000) },
    });
    await paymentSvc().expireUnpaidOrders();

    const order = await prisma().order.findUnique({
      where: { id: res.body.orderId },
    });
    expect(order?.status).toBe(OrderStatus.cancelled);
    p = await readProduct(product.id);
    expect(p.reserved).toBe(0); // rezerv bırakıldı → available geri yükselir
    expect(p.available).toBe(1);
  });

  scenario("STK-075", async () => {
    // sweepOutOfStockProducts q=0 üründe kalan teklifleri iptal eder.
    const { buyer, seller, product } = await setup({ quantity: 1 });
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      amount: 80,
    });
    // Ürün tükendi (quantity=0) ama teklif hâlâ pending.
    await prisma().product.update({
      where: { id: product.id },
      data: { quantity: 0 },
    });

    await runScheduler(ctx.app, "sweep-out-of-stock");

    const swept = await prisma().offer.findUnique({ where: { id: offer.id } });
    expect(swept?.status).toBe(OfferStatus.cancelled);
  });

  // ═══════════════════════════ Sınırsız stok (quantity=null) ═══════════════════════════

  scenario("STK-080", async () => {
    // Sınırsız stoklu üründe rezerv bırakılınca status active kalır.
    const { buyer, product, addr } = await setup({ quantity: null });
    const res = await buyNow(buyer, product.id, addr.id).expect(201);
    await prisma().order.update({
      where: { id: res.body.orderId },
      data: { createdAt: new Date(Date.now() - 31 * 60 * 1000) },
    });
    await runScheduler(ctx.app, "release-expired-reservations");

    const p = await readProduct(product.id);
    expect(p.status).toBe(ProductStatus.active); // sınırsız asla gizlenmez
  });

  scenario("STK-081", async () => {
    // Sınırsız stoklu ürün her zaman satılabilir (available=null); ödemede quantity null kalır.
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      quantity: null,
      price: 100,
    });

    for (let i = 0; i < 3; i++) {
      const b = await createUser(ctx.module);
      const a = await createAddress({ userId: b.id });
      await buyAndPay(b, product.id, a.id);
      const p = await readProduct(product.id);
      expect(p.quantity).toBeNull(); // düşmez
      expect(p.available).toBeNull();
    }
  });

  scenario("STK-082", async () => {
    // Sınırsız ürün iadesinde quantity restok edilmez (null kalır).
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      quantity: null,
      price: 100,
    });
    const buyer = await createUser(ctx.module);
    const addr = await createAddress({ userId: buyer.id });
    const orderId = await buyAndPay(buyer, product.id, addr.id);

    await request(server())
      .post(`/api/orders/${orderId}/cancel`)
      .set(authHeader(buyer))
      .send({ reason: "iade" })
      .expect(200);
    await paymentSvc().processRefund(orderId);

    const p = await readProduct(product.id);
    expect(p.quantity).toBeNull(); // değişmez
    expect(p.status).toBe(ProductStatus.active);
  });

  // ═══════════════════════════ Bildirimler (stockout / back-in-stock) ═══════════════════════════

  scenario("STK-090", async () => {
    // Buy Now ile stok bitince kaybeden teklif sahibine OUT_OF_STOCK bildirimi (in_app).
    const {
      buyer: fastBuyer,
      seller,
      product,
      addr,
    } = await setup({ quantity: 1, price: 100 });
    const loser = await createUser(ctx.module);
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: loser.id,
      sellerId: seller.id,
      amount: 90,
    });
    await request(server())
      .post(`/api/offers/${offer.id}/accept`)
      .set(authHeader(seller))
      .expect(200);

    await buyAndPay(fastBuyer, product.id, addr.id);

    const notif = await prisma().notificationLog.findFirst({
      where: {
        userId: loser.id,
        type: "offer_cancelled_out_of_stock" as any,
        channel: "in_app",
      },
    });
    expect(notif).toBeTruthy();
    const data = notif!.data as any;
    expect(data.productId).toBe(product.id);
    expect(data.categoryId).toBe(baseline.categoryId);
  });

  scenario("STK-091", async () => {
    // Ödenmemiş teklif iptalinde offer-cancelled mesajı (order-cancelled değil), çift bildirim yok.
    const {
      buyer: fastBuyer,
      seller,
      product,
      addr,
    } = await setup({ quantity: 1, price: 100 });
    const loser = await createUser(ctx.module);
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: loser.id,
      sellerId: seller.id,
      amount: 90,
    });
    await request(server())
      .post(`/api/offers/${offer.id}/accept`)
      .set(authHeader(seller))
      .expect(200);

    await buyAndPay(fastBuyer, product.id, addr.id);

    const offerNotif = await prisma().notificationLog.count({
      where: { userId: loser.id, type: "offer_cancelled_out_of_stock" as any },
    });
    const orderNotif = await prisma().notificationLog.count({
      where: { userId: loser.id, type: "order_cancelled_out_of_stock" as any },
    });
    expect(offerNotif).toBeGreaterThanOrEqual(1);
    expect(orderNotif).toBe(0); // dedup: order-cancelled gönderilmez
  });

  scenario("STK-092", async () => {
    // Ödeme başarısızlığı rezervi bırakır + wishlist'e BACK_IN_STOCK (24s debounce → 2. failure yine 1).
    const { buyer, seller, product, addr } = await setup({
      quantity: 1,
      price: 100,
    });
    // wishlist'te bir kullanıcı: product tamamen tükenip failure ile geri gelince bildirim alır.
    const wisher = await createUser(ctx.module);
    const wishlist = await prisma().wishlist.create({
      data: { userId: wisher.id },
    });
    await prisma().wishlistItem.create({
      data: { wishlistId: wishlist.id, productId: product.id },
    });

    // 1) Buy → initiate → success → stok 0'a düşer (available 1→0).
    await buyAndPay(buyer, product.id, addr.id);
    const p = await readProduct(product.id);
    expect(p.available).toBe(0);

    // Stok geri getir (available 0 durumunda), yeni alıcı buy → initiate → failed → available 0→1 → BACK_IN_STOCK.
    await prisma().product.update({
      where: { id: product.id },
      data: { quantity: 1, status: ProductStatus.active },
    });
    const b2 = await createUser(ctx.module);
    const a2 = await createAddress({ userId: b2.id });
    const r2 = await buyNow(b2, product.id, a2.id).expect(201); // reserved → available 0
    await initiate(b2, r2.body.orderId).expect(201);
    await successCallbackForOrder(r2.body.orderId, "failed").expect(200); // rezerv bırak → available 1

    let count = await prisma().notificationLog.count({
      where: {
        userId: wisher.id,
        type: "back_in_stock" as any,
        data: { path: ["productId"], equals: product.id },
      },
    });
    expect(count).toBe(1);

    // 2) 24s içinde ikinci failure → yine available 0→1 transition → ama debounce → hâlâ 1.
    // quantity=1 tut; buy → reserved 1 → available 0 → failed → reserved 0 → available 1 (transition).
    await prisma().product.update({
      where: { id: product.id },
      data: { quantity: 1, status: ProductStatus.active, reservedQuantity: 0 },
    });
    const b3 = await createUser(ctx.module);
    const a3 = await createAddress({ userId: b3.id });
    const r3 = await buyNow(b3, product.id, a3.id).expect(201);
    await initiate(b3, r3.body.orderId).expect(201);
    await successCallbackForOrder(r3.body.orderId, "failed").expect(200); // available 0→1 tekrar

    count = await prisma().notificationLog.count({
      where: {
        userId: wisher.id,
        type: "back_in_stock" as any,
        data: { path: ["productId"], equals: product.id },
      },
    });
    expect(count).toBe(1); // debounce (24s): ikinci transition bildirim üretmez
    void p;
  });

  scenario("STK-093", async () => {
    // Geri-stokta bildirimi önceden stockout-iptal edilen alıcılara da gider (wishlist'te olmasa bile).
    const { buyer, seller, product, addr } = await setup({
      quantity: 1,
      price: 100,
    });
    const stockoutBuyer = await createUser(ctx.module);
    // stockoutBuyer'ın stok-tükendi nedeniyle iptal edilmiş siparişi (broadcastBackInStock 7 gün penceresi).
    await prisma().order.create({
      data: {
        orderNumber: `SO${Date.now()}`,
        productId: product.id,
        buyerId: stockoutBuyer.id,
        sellerId: seller.id,
        totalAmount: 100,
        commissionAmount: 0,
        paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: OrderStatus.cancelled,
        cancelReason: "Stok tükendi",
      },
    });

    // Restock + failed payment ile available 0→1 geçişi tetiklenir.
    await buyAndPay(buyer, product.id, addr.id); // available → 0
    await prisma().product.update({
      where: { id: product.id },
      data: { quantity: 1, status: ProductStatus.active },
    });
    const b2 = await createUser(ctx.module);
    const a2 = await createAddress({ userId: b2.id });
    const r2 = await buyNow(b2, product.id, a2.id).expect(201); // available → 0
    await initiate(b2, r2.body.orderId).expect(201);
    await successCallbackForOrder(r2.body.orderId, "failed").expect(200); // available 0→1

    const notif = await prisma().notificationLog.findFirst({
      where: { userId: stockoutBuyer.id, type: "back_in_stock" as any },
    });
    expect(notif).toBeTruthy();
  });

  scenario("STK-094", async () => {
    // sweep cron'u OUT_OF_STOCK bildirimi üretir.
    const { buyer, seller, product } = await setup({ quantity: 1 });
    const offer = await createOfferRow({
      productId: product.id,
      buyerId: buyer.id,
      sellerId: seller.id,
      amount: 80,
    });
    await prisma().product.update({
      where: { id: product.id },
      data: { quantity: 0 },
    });

    await runScheduler(ctx.app, "sweep-out-of-stock");

    const notif = await prisma().notificationLog.findFirst({
      where: { userId: buyer.id, type: "offer_cancelled_out_of_stock" as any },
    });
    expect(notif).toBeTruthy();
    void offer;
  });

  // ═══════════════════════════ Sepet (cart) stok kuralları ═══════════════════════════

  const addToCart = (
    buyer: { accessToken: string },
    productId: string,
    quantity: number,
  ) =>
    request(server())
      .post("/api/cart/items")
      .set(authHeader(buyer))
      .send({ productId, quantity });

  scenario("STK-100", async () => {
    // Sepete ekleme fiziksel üst sınırı kontrol eder, rezervasyona bakmaz.
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: seller.id, quantity: 2 });
    // Rezerv olsa bile (available=0) fiziksel 2 >= 2 → eklenir.
    await prisma().product.update({
      where: { id: product.id },
      data: { reservedQuantity: 2 },
    });

    const res = await addToCart(buyer, product.id, 2);
    expect([200, 201]).toContain(res.status);
  });

  scenario("STK-101", async () => {
    // Fiziksel stoktan fazla sepete ekleme reddedilir.
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: seller.id, quantity: 2 });
    const res = await addToCart(buyer, product.id, 3).expect(400);
    expect(JSON.stringify(res.body)).toContain(
      "Bu üründen en fazla 2 adet sipariş verilebilir",
    );
  });

  scenario("STK-102", async () => {
    // quantity=0 (inactive) üründe sepete ekleme reddedilir.
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      quantity: 1,
      status: "inactive",
    });
    const res = await addToCart(buyer, product.id, 1).expect(400);
    // status active olmadığından 'satışa uygun değil'.
    expect(JSON.stringify(res.body)).toMatch(/satışa uygun değil|stokta yok/i);
  });

  scenario("STK-103", async () => {
    // Sepet satır uyarıları rezerv-duyarlı (available'a göre).
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });

    // available=0: isAvailable=false, 'Stokta yok'.
    const pOut = await makeProduct({ sellerId: seller.id, quantity: 5 });
    await addToCart(buyer, pOut.id, 1).expect((r) =>
      expect([200, 201]).toContain(r.status),
    );
    await prisma().product.update({
      where: { id: pOut.id },
      data: { reservedQuantity: 5 },
    }); // available=0

    // available=3, sepette istenen 5: 'Stokta sadece 3 adet var'.
    // Fiziksel stok 5 iken 1 adet ekle (kabul), sonra sepet satırını 5 yap + stoğu 3'e indir.
    const pLow = await makeProduct({ sellerId: seller.id, quantity: 5 });
    await addToCart(buyer, pLow.id, 1).expect((r) =>
      expect([200, 201]).toContain(r.status),
    );
    await prisma().cartItem.updateMany({
      where: { product: { id: pLow.id } },
      data: { quantity: 5 },
    });
    await prisma().product.update({
      where: { id: pLow.id },
      data: { quantity: 3 },
    }); // available=3 < istenen 5

    // available<=5: 'Son birkaç ürün!'.
    const pFew = await makeProduct({ sellerId: seller.id, quantity: 5 });
    await addToCart(buyer, pFew.id, 1).expect((r) =>
      expect([200, 201]).toContain(r.status),
    );

    const cart = await request(server())
      .get("/api/cart")
      .set(authHeader(buyer))
      .expect(200);
    const items: any[] = cart.body.items ?? [];
    const byId = (id: string) => items.find((it) => it.productId === id);

    expect(byId(pOut.id)?.isAvailable).toBe(false);
    expect(byId(pOut.id)?.stockWarning).toBe("Stokta yok");
    if (byId(pLow.id))
      expect(byId(pLow.id)?.stockWarning).toBe("Stokta sadece 3 adet var");
    expect(byId(pFew.id)?.stockWarning).toBe("Son birkaç ürün!");
  });

  scenario("STK-104", async () => {
    // maxQuantityPerOrder sınırı sepette uygulanır.
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    // Fiziksel stok >=3 ki fiziksel kontrol değil maxQuantityPerOrder mesajı çıksın.
    const product = await makeProduct({ sellerId: seller.id, quantity: 10 });
    await prisma().product.update({
      where: { id: product.id },
      data: { maxQuantityPerOrder: 2 },
    });

    const res = await addToCart(buyer, product.id, 3).expect(400);
    expect(JSON.stringify(res.body)).toContain(
      "Bu üründen maksimum 2 adet alabilirsiniz",
    );
  });

  scenario("STK-105", async () => {
    // Sepet adet DTO sınırı: Min 1 / Max 99 (AddToCartDto).
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: seller.id, quantity: 100 });

    // quantity:0 → Min(1) → 400.
    await addToCart(buyer, product.id, 0).expect(400);
    // quantity:100 → Max(99) → 400.
    await addToCart(buyer, product.id, 100).expect(400);
    // quantity:'abc' → Transform 1'e çevirir → 400 vermez (eklenir).
    const res = await request(server())
      .post("/api/cart/items")
      .set(authHeader(buyer))
      .send({ productId: product.id, quantity: "abc" });
    expect([200, 201]).toContain(res.status);
  });

  // ═══════════════════════════ Listeleme (rezerv-duyarlı) ═══════════════════════════

  scenario("STK-110", async () => {
    // Tamamen rezerve ürün findPopular'da gizlenir.
    const seller = await createUser(ctx.module, { isSeller: true });
    const inStock = await makeProduct({ sellerId: seller.id, quantity: 1 });
    const reserved = await makeProduct({ sellerId: seller.id, quantity: 1 });
    await prisma().product.update({
      where: { id: reserved.id },
      data: { reservedQuantity: 1 },
    }); // available=0

    const res = await ctx.module.get(ProductService).findPopular(20, 1);
    const ids = res.data.map((p: any) => p.id);
    expect(ids).toContain(inStock.id);
    expect(ids).not.toContain(reserved.id);
  });

  scenario("STK-111", async () => {
    // Genel listeleme/arama rezerv-duyarlı stok filtresi uygular (GET /products default liste).
    const seller = await createUser(ctx.module, { isSeller: true });
    const inStock = await makeProduct({ sellerId: seller.id, quantity: 1 });
    const reserved = await makeProduct({ sellerId: seller.id, quantity: 1 });
    await prisma().product.update({
      where: { id: reserved.id },
      data: { reservedQuantity: 1 },
    });

    const res = await request(server()).get("/api/products").expect(200);
    const ids: string[] = (res.body.data ?? []).map((p: any) => p.id);
    expect(ids).toContain(inStock.id);
    expect(ids).not.toContain(reserved.id);
  });

  scenario("STK-112", async () => {
    // Sınırsız stoklu (quantity=null) ürün listelerde her zaman görünür.
    const seller = await createUser(ctx.module, { isSeller: true });
    const unlimited = await makeProduct({
      sellerId: seller.id,
      quantity: null,
    });

    const list = await request(server()).get("/api/products").expect(200);
    const listIds: string[] = (list.body.data ?? []).map((p: any) => p.id);
    expect(listIds).toContain(unlimited.id);

    const popular = await ctx.module.get(ProductService).findPopular(20, 1);
    const popIds = popular.data.map((p: any) => p.id);
    expect(popIds).toContain(unlimited.id);
  });

  // ═══════════════════════════ Yetki / güvenlik ═══════════════════════════

  scenario("STK-120", async () => {
    // Buy Now üye gerektirir (misafir 401).
    const { product, addr } = await setup({ quantity: 1 });
    const before = await readProduct(product.id);
    await request(server())
      .post("/api/orders/buy")
      .send({ productId: product.id, shippingAddressId: addr.id })
      .expect(401);
    const after = await readProduct(product.id);
    expect(after.reserved).toBe(before.reserved);
  });

  scenario("STK-121", async () => {
    // Üye checkout (JwtAuthGuard) vs misafir checkout (@Public) paritesi: her ürün için reserved=3.
    const seller = await createUser(ctx.module, { isSeller: true });

    // Üye
    const buyer = await createUser(ctx.module);
    const memberProduct = await makeProduct({
      sellerId: seller.id,
      quantity: 5,
      price: 100,
    });
    const addr = await createAddress({ userId: buyer.id });
    const memberRes = await checkout(
      buyer,
      memberProduct.id,
      3,
      addr.id,
    ).expect(201);
    expect(memberRes.body.checkoutGroupId).toBeTruthy();
    const p = await readProduct(memberProduct.id);
    expect(p.reserved).toBe(3);
    expect(p.quantity).toBe(5);

    // Misafir (ayrı ürün) — OTP MailHog'a düşer (GUEST_CHECKOUT_OTP_SECRET HMAC).
    // Kodu maildan oku, checkout/guest 3 adet → reserved=3 (parite).
    await clearMailbox();
    const guestProduct = await makeProduct({
      sellerId: seller.id,
      quantity: 5,
      price: 100,
    });
    const guestEmail = `guest-${Date.now()}@external.test`;
    await request(server())
      .post("/api/orders/guest/send-verification-code")
      .send({ email: guestEmail, expectedCheckoutCount: 1 })
      .expect(200);
    const mail = await getLastEmailTo(guestEmail);
    const code = extractCode(mail.body, 6)!;
    expect(code).toMatch(/^\d{6}$/);

    const guestRes = await request(server())
      .post("/api/orders/checkout/guest")
      .send({
        items: [{ productId: guestProduct.id, quantity: 3 }],
        idempotencyKey: randomUUID(),
        email: guestEmail,
        emailVerificationCode: code,
        phone: "+905551234567",
        guestName: "Misafir Test",
        shippingAddress: {
          fullName: "Misafir Test",
          phone: "+905551234567",
          city: "İstanbul",
          district: "Kadıköy",
          address: "Test Cad. No:1",
        },
      })
      .expect(201);
    expect(guestRes.body.checkoutGroupId).toBeTruthy();
    const gp = await readProduct(guestProduct.id);
    expect(gp.reserved).toBe(3);
    expect(gp.quantity).toBe(5);
    void p;
  });

  scenario("STK-122", async () => {
    // Başka kullanıcının siparişini iptal etme yasak (403); rezerv değişmez.
    const { buyer, product, addr } = await setup({ quantity: 1 });
    const attacker = await createUser(ctx.module);
    const res = await buyNow(buyer, product.id, addr.id).expect(201);
    const before = await readProduct(product.id);

    await request(server())
      .post(`/api/orders/${res.body.orderId}/cancel`)
      .set(authHeader(attacker))
      .send({ reason: "hack" })
      .expect(403);

    const after = await readProduct(product.id);
    expect(after.reserved).toBe(before.reserved);
    expect(after.reserved).toBe(1);
  });

  scenario("STK-123", async () => {
    // Banlı kullanıcı sipariş oluşturamaz (403); rezerv değişmez.
    const { buyer, product, addr } = await setup({ quantity: 1 });
    await prisma().user.update({
      where: { id: buyer.id },
      data: { isBanned: true },
    });

    const res = await buyNow(buyer, product.id, addr.id).expect(403);
    expect(JSON.stringify(res.body)).toContain("Hesabınız banlanmış");

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(0);
  });

  scenario("STK-124", async () => {
    // Satıcı kendi ürününü satın alamaz (buy 403, checkout 403, cart 400).
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({
      sellerId: seller.id,
      quantity: 5,
      price: 100,
    });
    const sellerAddr = await createAddress({ userId: seller.id });

    const buyRes = await buyNow(seller, product.id, sellerAddr.id).expect(403);
    expect(JSON.stringify(buyRes.body)).toContain(
      "Kendi ürününüzü satın alamazsınız",
    );

    const checkoutRes = await checkout(
      seller,
      product.id,
      1,
      sellerAddr.id,
    ).expect(403);
    expect(JSON.stringify(checkoutRes.body)).toContain(
      "Kendi ürününüzü satın alamazsınız",
    );

    // Sepet: cart.service BadRequestException (400) atar; mesaj aynı.
    const cartRes = await addToCart(seller, product.id, 1).expect(400);
    expect(JSON.stringify(cartRes.body)).toContain(
      "Kendi ürününüzü satın alamazsınız",
    );

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(0);
    expect(p.quantity).toBe(5);
  });

  // ═══════════════════════════ Idempotency ═══════════════════════════

  scenario("STK-130", async () => {
    // Aynı idempotencyKey ile tekrar checkout aynı grubu döndürür (çift rezervasyon yok).
    const { buyer, product, addr } = await setup({ quantity: 5, price: 100 });
    const key = randomUUID();
    const first = await checkout(buyer, product.id, 3, addr.id, key).expect(
      201,
    );
    const second = await checkout(buyer, product.id, 3, addr.id, key).expect(
      201,
    );
    expect(second.body.checkoutGroupId).toBe(first.body.checkoutGroupId);

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(3); // 6 olmadı
  });

  scenario("STK-131", async () => {
    // Tekrarlanan başarılı callback stoğu ikinci kez düşürmez.
    const { buyer, product, addr } = await setup({ quantity: 2, price: 100 });
    const res = await buyNow(buyer, product.id, addr.id).expect(201);
    await initiate(buyer, res.body.orderId).expect(201);
    await successCallbackForOrder(res.body.orderId).expect(200);
    let p = await readProduct(product.id);
    expect(p.quantity).toBe(1); // 2→1

    // Aynı success callback tekrar → idempotent.
    await successCallbackForOrder(res.body.orderId).expect(200);
    p = await readProduct(product.id);
    expect(p.quantity).toBe(1); // 1→0 olmadı
  });

  // ═══════════════════════════ Para / tutarlılık ═══════════════════════════

  scenario("STK-140", async () => {
    // Çoklu-adet checkout'ta subtotal = unitPrice × quantity, order.quantity=3, reserved=3.
    const { buyer, product, addr } = await setup({ quantity: 5, price: 100 });
    const res = await checkout(buyer, product.id, 3, addr.id).expect(201);
    const order = await prisma().order.findFirst({
      where: { checkoutGroupId: res.body.checkoutGroupId },
    });
    expect(order?.quantity).toBe(3);
    expect(Number(order?.subtotal)).toBe(300); // 100 × 3
    expect(Number(order?.totalAmount)).toBeGreaterThanOrEqual(300);

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(3);
  });

  scenario("STK-141", async () => {
    // Kısmi adet iadesinde iade tutarı ile restok adedi tutarlı (1 adet ~100 TL, quantity 2→3).
    const { buyer, product, addr } = await setup({ quantity: 5, price: 100 });
    const res = await checkout(buyer, product.id, 3, addr.id).expect(201);
    const order = await prisma().order.findFirst({
      where: { checkoutGroupId: res.body.checkoutGroupId },
    });
    await initiateGroup(buyer, res.body.checkoutGroupId).expect(201);
    await successCallbackForGroup(res.body.checkoutGroupId).expect(200);
    let p = await readProduct(product.id);
    expect(p.quantity).toBe(2);

    const unitTotal = Number(order!.totalAmount) / (order!.quantity ?? 3);
    const refund = await paymentSvc().processRefund(order!.id, unitTotal, {
      refundQuantity: 1,
    });
    if (!refund)
      throw new Error("processRefund reported an already-finalized attempt");
    expect(refund.refundAmount).toBeCloseTo(unitTotal, 1);

    p = await readProduct(product.id);
    expect(p.quantity).toBe(3); // 2 + 1
    const openOrder = await prisma().order.findUnique({
      where: { id: order!.id },
    });
    expect(openOrder?.status).not.toBe(OrderStatus.cancelled); // tam-iade eşiği altı
  });

  // ═══════════════════════════ i18n / UI (kapsam/varsayım) ═══════════════════════════

  scenario("STK-150", async () => {
    // Stok hata mesajları Türkçe ve tutarlı (API tarafı).
    const { buyer, product, addr } = await setup({ quantity: 2 });

    // 1) Stokta olmayan Buy Now.
    const outProduct = await makeProduct({
      sellerId: (await createUser(ctx.module, { isSeller: true })).id,
      quantity: 1,
    });
    await prisma().product.update({
      where: { id: outProduct.id },
      data: { reservedQuantity: 1 },
    });
    const buyRes = await buyNow(buyer, outProduct.id, addr.id).expect(400);
    expect(JSON.stringify(buyRes.body)).toMatch(
      /stokta bulunmamaktadır|satışta değil/,
    );

    // 2) Fazla checkout.
    const checkoutRes = await checkout(buyer, product.id, 6, addr.id).expect(
      400,
    );
    expect(checkoutRes.body.message).toMatch(
      /yeterli stok yok \(istenen 6, mevcut 2\)/,
    );

    // 3) Sepete fazla ekleme.
    const cartRes = await addToCart(buyer, product.id, 3).expect(400);
    expect(JSON.stringify(cartRes.body)).toContain(
      "Bu üründen en fazla 2 adet sipariş verilebilir",
    );
  });

  scenario.skip(
    "STK-151",
    "Saf UI (web/mobile/admin stok-bitti/yükleniyor/hata durumları). Frontend kaynağı bu görevde yok; API uyarı alanları STK-103/150 ile kapsandı.",
  );

  // ═══════════════════════════ Güvenlik ═══════════════════════════

  scenario("STK-160", async () => {
    // Negatif/sıfır quantity ile ürün oluşturma reddedilir (DTO Min(1)); omitted → default 1.
    const seller = await createUser(ctx.module, { isSeller: true });
    const base = () => ({
      title: "Test Ürün Başlığı",
      description: "Test açıklaması yeterince uzun",
      price: 100,
      categoryId: baseline.categoryId,
      condition: "new",
    });
    const create = (body: Record<string, unknown>) =>
      request(server())
        .post("/api/products")
        .set(authHeader(seller))
        .send(body);

    const zero = await create({ ...base(), quantity: 0 }).expect(400);
    expect(JSON.stringify(zero.body)).toContain(
      "Stok miktarı en az 1 olmalıdır",
    );
    const neg = await create({ ...base(), quantity: -5 }).expect(400);
    expect(JSON.stringify(neg.body)).toContain(
      "Stok miktarı en az 1 olmalıdır",
    );

    // quantity verilmeden → default 1 (DTO validasyonu geçer). Servis 201 döndürür;
    // görsel/kategori/membership seed'li olduğundan status pending oluşur.
    const omitted = await create(base());
    expect(omitted.status).toBe(201);
    if (omitted.status === 201) {
      const prod = await prisma().product.findUnique({
        where: { id: omitted.body.id },
      });
      expect(prod?.quantity).toBe(1);
    }
  });

  scenario("STK-161", async () => {
    // Sahte/yetkisiz callback ile stok düşürme engellenir (hash uyuşmazlığı).
    const { buyer, product, addr } = await setup({ quantity: 1, price: 100 });
    const res = await buyNow(buyer, product.id, addr.id).expect(201);
    await initiate(buyer, res.body.orderId).expect(201);
    const payment = await lastPaymentByOrder(res.body.orderId);

    // Geçersiz hash: callback body'sini bozarak gönder.
    const forged = signCallback({
      merchantOid: payment!.providerConversationId!,
      status: "success",
      totalAmount: Math.round(Number(payment!.amount) * 100),
    });
    forged.hash = "gecersiz-hash-degeri";
    await request(server())
      .post("/api/payments/callback/paytr")
      .send(forged)
      .expect(200); // PayTR 'OK' döner ama işlenmez

    const p = await readProduct(product.id);
    expect(p.quantity).toBe(1); // düşmedi
    const order = await prisma().order.findUnique({
      where: { id: res.body.orderId },
    });
    expect(order?.status).toBe(OrderStatus.pending_payment);
    const completed = await prisma().payment.count({
      where: { orderId: res.body.orderId, status: PaymentStatus.completed },
    });
    expect(completed).toBe(0);
  });

  scenario("STK-162", async () => {
    // Başka kullanıcının adresiyle Buy Now reddedilir (IDOR) → rezerv artmaz.
    const { buyer, product } = await setup({ quantity: 1 });
    const other = await createUser(ctx.module);
    const otherAddr = await createAddress({ userId: other.id });

    const res = await buyNow(buyer, product.id, otherAddr.id).expect(400);
    expect(JSON.stringify(res.body)).toContain("Geçersiz teslimat adresi");

    const p = await readProduct(product.id);
    expect(p.reserved).toBe(0); // rezervasyon adres doğrulamasından sonra → sipariş açılmaz
  });

  scenario("STK-163", async () => {
    // Stok kontrolü transaction içinde FOR UPDATE ile yapılır (TOCTOU yok): 10 paralel Buy Now,
    // başarı sayısı stok adedini aşmaz, reservedQuantity <= quantity.
    const { product } = await setup({ quantity: 1 });
    const buyers = await Promise.all(
      Array.from({ length: 10 }, () => createUser(ctx.module)),
    );
    const addrs = await Promise.all(
      buyers.map((b) => createAddress({ userId: b.id })),
    );

    const results = await Promise.all(
      buyers.map((b, i) => buyNow(b, product.id, addrs[i].id)),
    );
    const ok = results.filter((r) => r.status === 201).length;

    const p = await readProduct(product.id);
    expect(ok).toBeLessThanOrEqual(p.quantity ?? 0 + 999);
    expect(ok).toBe(1); // yalnız 1 stok
    expect(p.reserved).toBeLessThanOrEqual(p.quantity ?? Infinity);
    expect(p.reserved).toBe(1);
  });
});
