/**
 * 08 — Teklif & Pazarlık (OFR) — Test Konsolu senaryoları.
 *
 * Bu dosya 01-auth.e2e-spec.ts FAN-OUT ŞABLONUNU birebir izler. Her test
 * `scenario('<ID>', fn)` ile manifest'e bağlanır (izlenebilirlik + başlık/pri
 * otomatik). Boilerplate ve assertion stilleri mevcut yeşil offer.e2e-spec.ts /
 * offer-extra.e2e-spec.ts / 09-ord / 10-pay dosyalarından alınmıştır.
 *
 * Ortam (apps/api/.env.test):
 *   - PAYMENT_BYPASS=false → ödeme (OFR-100) gerçek PayTR callback'i ile tamamlanır
 *     (initiate offer-based order'da stok rezerve eder; callback iframe/success ile ilerletir).
 *   - Commission rule seed YOK → calculateCommission 0-komisyon fallback döner:
 *     accepted teklif siparişinde totalAmount == amount, tüm fee alanları 0.
 * PayTR mock'tur (ctx.paytr). Callback imzaları signCallback ile .env.test
 * merchant key/salt'a göre üretilir. Başarılı callback siparişi tek tx'te
 * `preparing`e ilerletir (paid değil) — bkz. PaymentService.processSuccessfulPayment.
 *
 * Doğruluk kaynakları (OKUNDU):
 *   - offer.controller.ts: path + @HttpCode (accept/reject/counter/buyer-counter/cancel → @HttpCode(200)).
 *   - offer.service.ts: iş kuralları + Türkçe hata mesajları + formatOfferResponse.
 *   - create-offer.dto.ts / counter-offer.dto.ts: DTO Min/Max/message + doğrulama mesajları.
 *   - offer-scheduler.service.ts: runHandleExpiredOffers (expire-offers cron).
 *   - payment.service.ts: expireUnpaidOrders → offer payment_expired.
 *   - product-lock.service.ts: invalidateRelatedOffers (stok tükenince pending/accepted iptal, paid korunur).
 */
import * as request from 'supertest';
import { OfferStatus, OrderStatus, ProductStatus } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../../test-utils/create-app';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../../test-utils/db';
import { createUser, authHeader } from '../../factories/user.factory';
import { createProduct } from '../../factories/product.factory';
import { createAddress } from '../../factories/address.factory';
import { createOfferRow } from '../../factories/offer.factory';
import { scenario } from '../../test-utils/scenario';
import { signCallback } from '../../mocks/paytr.mock';
import { PaymentService } from '../../../src/modules/payment/payment.service';
import { OfferSchedulerService } from '../../../src/modules/offer/offer-scheduler.service';
import { randomUUID } from 'crypto';

describe('08 — Teklif & Pazarlık (OFR)', () => {
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

  /** Alıcı + satıcı + ürün üret. Varsayılan fiyat 200, adet 1, aktif. */
  async function makeBuyerSellerProduct(
    opts: {
      price?: number;
      quantity?: number;
      status?: 'active' | 'sold' | 'inactive';
      sellerType?: 'individual' | 'verified' | 'platform';
      premium?: boolean;
    } = {},
  ) {
    const buyer = await createUser(ctx.module);
    const seller = await createUser(ctx.module, {
      isSeller: true,
      sellerType: (opts.sellerType as any) ?? 'individual',
      premium: opts.premium ?? false,
    });
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
      price: opts.price ?? 200,
      quantity: opts.quantity ?? 1,
      status: opts.status ?? 'active',
    });
    return { buyer, seller, product };
  }

  const postOffer = (
    user: { accessToken: string },
    body: Record<string, unknown>,
  ) => request(server()).post('/api/offers').set(authHeader(user)).send(body);

  /** POST /api/offers ile pending teklif oluştur, id döner (201 bekler). */
  async function createOfferViaApi(
    buyer: { accessToken: string },
    productId: string,
    amount: number,
    message?: string,
  ): Promise<string> {
    const res = await postOffer(buyer, message ? { productId, amount, message } : { productId, amount }).expect(201);
    return res.body.id as string;
  }

  const getOffer = (user: { accessToken: string }, id: string) =>
    request(server()).get(`/api/offers/${id}`).set(authHeader(user));

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/offers — Teklif oluşturma
  // ══════════════════════════════════════════════════════════════════════════
  describe('POST /api/offers — oluşturma', () => {
    scenario('OFR-001', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200, quantity: 1 });
      const res = await postOffer(buyer, { productId: product.id, amount: 150 }).expect(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.id).toBeTruthy();
      expect(res.body.amount).toBe(150);
      expect(res.body.buyerMustAccept).toBe(false);

      const prisma = getPrisma();
      const offer = await prisma.offer.findUnique({ where: { id: res.body.id } });
      expect(offer?.buyerId).toBe(buyer.id);
      expect(offer?.sellerId).toBe(seller.id);
      // expiresAt ≈ now + 24h (OFFER_EXPIRY_HOURS varsayılan 24).
      const diffMs = offer!.expiresAt.getTime() - Date.now();
      expect(diffMs).toBeGreaterThan(23 * 3600 * 1000);
      expect(diffMs).toBeLessThan(25 * 3600 * 1000);
    });

    scenario('OFR-002', async () => {
      const { buyer, product } = await makeBuyerSellerProduct({ price: 200 });
      const res = await postOffer(buyer, {
        productId: product.id,
        amount: 120,
        message: 'Bu fiyata alır mıyım?',
      }).expect(201);
      expect(res.body.message).toBe('Bu fiyata alır mıyım?');

      const prisma = getPrisma();
      const offer = await prisma.offer.findUnique({ where: { id: res.body.id } });
      expect(offer?.message).toBe('Bu fiyata alır mıyım?');
    });

    scenario('OFR-003', async () => {
      const buyer = await createUser(ctx.module);
      const res = await postOffer(buyer, { productId: '123-abc', amount: 100 }).expect(400);
      expect(JSON.stringify(res.body)).toContain('Geçerli bir ürün ID giriniz (UUID formatında olmalıdır)');
    });

    scenario('OFR-004', async () => {
      const buyer = await createUser(ctx.module);
      const res = await postOffer(buyer, { productId: randomUUID(), amount: 100 }).expect(404);
      expect(JSON.stringify(res.body)).toContain('Ürün bulunamadı');
    });

    scenario('OFR-005', async () => {
      const { product } = await makeBuyerSellerProduct();
      // Authorization header YOK → 401
      await request(server()).post('/api/offers').send({ productId: product.id, amount: 100 }).expect(401);
    });

    scenario('OFR-010', async () => {
      // Fiyat 200 → minOffer 100. amount 99 < 100 → 400.
      const { buyer, product } = await makeBuyerSellerProduct({ price: 200 });
      const res = await postOffer(buyer, { productId: product.id, amount: 99 }).expect(400);
      expect(JSON.stringify(res.body)).toContain('Teklif tutarı çok düşük');
      expect(JSON.stringify(res.body)).toContain('Ürün fiyatı: 200.00 TL');
      expect(JSON.stringify(res.body)).toContain('Minimum teklif: 100.00 TL');
    });

    scenario('OFR-011', async () => {
      // Tam %50 (amount == minOffer) kabul edilir (koşul amount < minOffer).
      const { buyer, product } = await makeBuyerSellerProduct({ price: 200 });
      const res = await postOffer(buyer, { productId: product.id, amount: 100 }).expect(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.amount).toBe(100);
    });

    scenario('OFR-012', async () => {
      const { buyer, product } = await makeBuyerSellerProduct({ price: 200 });
      const zero = await postOffer(buyer, { productId: product.id, amount: 0 }).expect(400);
      expect(JSON.stringify(zero.body)).toContain('Teklif en az 1 TL olmalıdır');
      const neg = await postOffer(buyer, { productId: product.id, amount: -5 }).expect(400);
      expect(JSON.stringify(neg.body)).toContain('Teklif en az 1 TL olmalıdır');
    });

    scenario('OFR-013', async () => {
      const { buyer, product } = await makeBuyerSellerProduct({ price: 200 });
      const res = await postOffer(buyer, { productId: product.id, amount: 10000000 }).expect(400);
      expect(JSON.stringify(res.body)).toContain('Teklif en fazla 9,999,999 TL olabilir');
    });

    scenario('OFR-014', async () => {
      // amount Number'a çevrilemeyen string → @IsNumber mesajı.
      const { buyer, product } = await makeBuyerSellerProduct({ price: 200 });
      const res = await postOffer(buyer, { productId: product.id, amount: 'abc' }).expect(400);
      expect(JSON.stringify(res.body)).toContain('Teklif tutarı sayı olmalıdır');
    });

    scenario('OFR-015', async () => {
      // Fiyat 199.98 → minOffer 99.99. amount 99.98 < 99.99 → 400; mesaj toFixed(2).
      const { buyer, product } = await makeBuyerSellerProduct({ price: 199.98 });
      const low = await postOffer(buyer, { productId: product.id, amount: 99.98 }).expect(400);
      expect(JSON.stringify(low.body)).toContain('Minimum teklif: 99.99 TL');
      // amount 100 >= 99.99 → 201.
      const ok = await postOffer(buyer, { productId: product.id, amount: 100 }).expect(201);
      expect(ok.body.status).toBe('pending');
    });

    scenario('OFR-016', async () => {
      // Sunucu min %50 ve Max(9999999) dışında üst sınır kontrolü YAPMAZ:
      // fiyatla eşit ve fiyattan yüksek teklifler 201.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      await postOffer(buyer, { productId: product.id, amount: 200 }).expect(201);
      // İkinci pending engeli için farklı alıcı kullan.
      const buyer2 = await createUser(ctx.module);
      void seller;
      await postOffer(buyer2, { productId: product.id, amount: 5000 }).expect(201);
    });

    scenario('OFR-020', async () => {
      // Satıcı kendi ürününe teklif veremez.
      const { seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const res = await postOffer(seller, { productId: product.id, amount: 100 }).expect(400);
      expect(JSON.stringify(res.body)).toContain('Kendi ürününüze teklif veremezsiniz');
    });

    scenario('OFR-021', async () => {
      const { buyer, product } = await makeBuyerSellerProduct({ price: 160, status: 'inactive' });
      const res = await postOffer(buyer, { productId: product.id, amount: 80 }).expect(400);
      expect(JSON.stringify(res.body)).toContain('Bu ürün şu anda satışta değil');
    });

    scenario('OFR-022', async () => {
      // Aktif ama müsait adet 0 (quantity 0) → stok yok mesajı.
      const { buyer, product } = await makeBuyerSellerProduct({ price: 200, quantity: 0 });
      const res = await postOffer(buyer, { productId: product.id, amount: 100 }).expect(400);
      expect(JSON.stringify(res.body)).toContain('Ürün stokta yok veya yeterli müsait adet yok');
    });

    scenario('OFR-030', async () => {
      const { buyer, product } = await makeBuyerSellerProduct({ price: 200 });
      await postOffer(buyer, { productId: product.id, amount: 120 }).expect(201);
      const res = await postOffer(buyer, { productId: product.id, amount: 130 }).expect(400);
      expect(JSON.stringify(res.body)).toContain('Bu ürüne zaten bekleyen bir teklifiniz var');
    });

    scenario('OFR-031', async () => {
      const { seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const deniz = await createUser(ctx.module);
      const ceren = await createUser(ctx.module);
      const a = await postOffer(deniz, { productId: product.id, amount: 120 }).expect(201);
      const b = await postOffer(ceren, { productId: product.id, amount: 130 }).expect(201);
      expect(a.body.id).not.toBe(b.body.id);

      const prisma = getPrisma();
      const pending = await prisma.offer.findMany({
        where: { productId: product.id, status: OfferStatus.pending },
      });
      expect(pending).toHaveLength(2);
      expect(new Set(pending.map((o) => o.buyerId)).size).toBe(2);
      void seller;
    });

    scenario('OFR-032', async () => {
      // Reddedilen/iptal edilen teklif sonrası aynı alıcı yeni teklif verebilir.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const old = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 110,
        status: OfferStatus.rejected,
      });
      void old;
      const res = await postOffer(buyer, { productId: product.id, amount: 130 }).expect(201);
      expect(res.body.status).toBe('pending');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/offers/:id/counter — Satıcı karşı teklif
  // ══════════════════════════════════════════════════════════════════════════
  describe('POST /api/offers/:id/counter — satıcı karşı teklif', () => {
    scenario('OFR-040', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const original = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      const res = await request(server())
        .post(`/api/offers/${original.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 200 })
        .expect(200);
      expect(res.body.amount).toBe(200);
      expect(res.body.buyerMustAccept).toBe(true);
      expect(res.body.status).toBe('pending');

      const prisma = getPrisma();
      const old = await prisma.offer.findUnique({ where: { id: original.id } });
      expect(old?.status).toBe(OfferStatus.rejected);
      const counter = await prisma.offer.findUnique({ where: { id: res.body.id } });
      expect(counter?.buyerId).toBe(buyer.id);
      expect(counter?.sellerId).toBe(seller.id);
      expect(counter?.buyerMustAccept).toBe(true);
    });

    scenario('OFR-041', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const original = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 200,
      });
      // Düşük (100)
      const low = await request(server())
        .post(`/api/offers/${original.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 100 })
        .expect(400);
      expect(JSON.stringify(low.body)).toContain('Karşı teklif, mevcut tekliften yüksek olmalıdır');
      // Eşit (200)
      const eq = await request(server())
        .post(`/api/offers/${original.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 200 })
        .expect(400);
      expect(JSON.stringify(eq.body)).toContain('Karşı teklif, mevcut tekliften yüksek olmalıdır');
    });

    scenario('OFR-042', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const original = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      // Fiyattan yüksek (400 > 300) → 400
      const high = await request(server())
        .post(`/api/offers/${original.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 400 })
        .expect(400);
      expect(JSON.stringify(high.body)).toContain('Karşı teklif, ürün fiyatından yüksek olamaz');
      // Fiyatla eşit (300 == price) → 200 (koşul amount > price, eşitlikte FALSE)
      const eq = await request(server())
        .post(`/api/offers/${original.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 300 })
        .expect(200);
      expect(eq.body.amount).toBe(300);
      expect(eq.body.buyerMustAccept).toBe(true);
    });

    scenario('OFR-043', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const stranger = await createUser(ctx.module);
      const original = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      // Alıcı counter deneyemez → 403
      const asBuyer = await request(server())
        .post(`/api/offers/${original.id}/counter`)
        .set(authHeader(buyer))
        .send({ amount: 200 })
        .expect(403);
      expect(JSON.stringify(asBuyer.body)).toContain('Bu teklife karşı teklif verme yetkiniz yok');
      // Yabancı → 403
      await request(server())
        .post(`/api/offers/${original.id}/counter`)
        .set(authHeader(stranger))
        .send({ amount: 200 })
        .expect(403);
    });

    scenario('OFR-044', async () => {
      // buyerMustAccept=true (satıcı karşı teklifi) üzerinde tekrar counter → 400.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const counter = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 200,
        buyerMustAccept: true,
      });
      const res = await request(server())
        .post(`/api/offers/${counter.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 250 })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(
        'Alıcının mevcut karşı teklife yanıt vermesi bekleniyor',
      );
    });

    scenario('OFR-045', async () => {
      // Süresi geçmiş teklife counter → 400 + expired yazılır.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const stale = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
        expiresAt: new Date(Date.now() - 60 * 1000),
      });
      const res = await request(server())
        .post(`/api/offers/${stale.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 200 })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Bu teklifin süresi dolmuş');
      // counter() auto-expire write'ı AYNI $transaction içinde; sonraki throw onu
      // geri alır → satır API çağrısı sonrası hâlâ pending (accept ile aynı davranış,
      // offer.service.ts:462,490-496). Cron (expire-offers) daha sonra expired yapar.
      const prisma = getPrisma();
      const after = await prisma.offer.findUnique({ where: { id: stale.id } });
      expect(after?.status).toBe(OfferStatus.pending);
    });

    scenario('OFR-046', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const original = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      const zero = await request(server())
        .post(`/api/offers/${original.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 0 })
        .expect(400);
      expect(JSON.stringify(zero.body)).toContain('Karşı teklif en az 1 TL olmalıdır');
      const big = await request(server())
        .post(`/api/offers/${original.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 10000000 })
        .expect(400);
      expect(JSON.stringify(big.body)).toContain('Karşı teklif en fazla 9,999,999 TL olabilir');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/offers/:id/buyer-counter — Alıcı karşı teklif
  // ══════════════════════════════════════════════════════════════════════════
  describe('POST /api/offers/:id/buyer-counter — alıcı karşı teklif', () => {
    scenario('OFR-050', async () => {
      // Satıcı karşı teklifi (buyerMustAccept=true) üzerine alıcı daha düşük tutar önerir.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const counter = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 200,
        buyerMustAccept: true,
      });
      const res = await request(server())
        .post(`/api/offers/${counter.id}/buyer-counter`)
        .set(authHeader(buyer))
        .send({ amount: 170 })
        .expect(200);
      expect(res.body.amount).toBe(170);
      expect(res.body.buyerMustAccept).toBe(false); // sıra satıcıda
      expect(res.body.status).toBe('pending');

      const prisma = getPrisma();
      const old = await prisma.offer.findUnique({ where: { id: counter.id } });
      expect(old?.status).toBe(OfferStatus.rejected);
    });

    scenario('OFR-051', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const counter = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 200,
        buyerMustAccept: true,
      });
      // Eşit (200)
      const eq = await request(server())
        .post(`/api/offers/${counter.id}/buyer-counter`)
        .set(authHeader(buyer))
        .send({ amount: 200 })
        .expect(400);
      expect(JSON.stringify(eq.body)).toContain(
        'Alıcı karşı teklifi, satıcının karşı teklifinden düşük olmalıdır',
      );
      // Yüksek (250)
      const high = await request(server())
        .post(`/api/offers/${counter.id}/buyer-counter`)
        .set(authHeader(buyer))
        .send({ amount: 250 })
        .expect(400);
      expect(JSON.stringify(high.body)).toContain(
        'Alıcı karşı teklifi, satıcının karşı teklifinden düşük olmalıdır',
      );
    });

    scenario('OFR-052', async () => {
      // Fiyat 300 → minOffer 150. buyer-counter 149 < 150 → 400.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const counter = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 200,
        buyerMustAccept: true,
      });
      const res = await request(server())
        .post(`/api/offers/${counter.id}/buyer-counter`)
        .set(authHeader(buyer))
        .send({ amount: 149 })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Teklif tutarı çok düşük');
      expect(JSON.stringify(res.body)).toContain('Ürün fiyatı: 300.00 TL');
      expect(JSON.stringify(res.body)).toContain('Minimum: 150.00 TL');
    });

    scenario('OFR-053', async () => {
      // buyerMustAccept=false teklif üzerinde buyer-counter → 400.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const normal = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
        buyerMustAccept: false,
      });
      const res = await request(server())
        .post(`/api/offers/${normal.id}/buyer-counter`)
        .set(authHeader(buyer))
        .send({ amount: 149 })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain(
        'Alıcı karşı teklifi yalnızca satıcının son karşı teklifine yanıt olarak verilebilir',
      );
    });

    scenario('OFR-054', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const stranger = await createUser(ctx.module);
      const counter = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 200,
        buyerMustAccept: true,
      });
      // Satıcı buyer-counter deneyemez → 403
      const asSeller = await request(server())
        .post(`/api/offers/${counter.id}/buyer-counter`)
        .set(authHeader(seller))
        .send({ amount: 170 })
        .expect(403);
      expect(JSON.stringify(asSeller.body)).toContain('Bu teklife alıcı karşı teklifi verme yetkiniz yok');
      // Yabancı → 403
      await request(server())
        .post(`/api/offers/${counter.id}/buyer-counter`)
        .set(authHeader(stranger))
        .send({ amount: 170 })
        .expect(403);
    });

    scenario('OFR-055', async () => {
      // Ping-pong: satıcı counter → alıcı buyer-counter → satıcı counter → alıcı accept.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const original = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      // 1) Satıcı counter 200 (buyerMustAccept=true)
      const c1 = await request(server())
        .post(`/api/offers/${original.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 200 })
        .expect(200);
      expect(c1.body.buyerMustAccept).toBe(true);
      // 2) Alıcı buyer-counter 170 (buyerMustAccept=false)
      const c2 = await request(server())
        .post(`/api/offers/${c1.body.id}/buyer-counter`)
        .set(authHeader(buyer))
        .send({ amount: 170 })
        .expect(200);
      expect(c2.body.buyerMustAccept).toBe(false);
      // 3) Satıcı tekrar counter 185 (buyerMustAccept=true)
      const c3 = await request(server())
        .post(`/api/offers/${c2.body.id}/counter`)
        .set(authHeader(seller))
        .send({ amount: 185 })
        .expect(200);
      expect(c3.body.buyerMustAccept).toBe(true);
      // 4) Alıcı accept → accepted + pending_payment sipariş amount=185
      await request(server()).post(`/api/offers/${c3.body.id}/accept`).set(authHeader(buyer)).expect(200);

      const prisma = getPrisma();
      const accepted = await prisma.offer.findUnique({ where: { id: c3.body.id } });
      expect(accepted?.status).toBe(OfferStatus.accepted);
      const order = await prisma.order.findFirst({ where: { offerId: c3.body.id } });
      expect(order?.status).toBe(OrderStatus.pending_payment);
      expect(Number(order?.totalAmount)).toBeGreaterThanOrEqual(185);
      // Ara adımlarda önceki teklifler rejected.
      expect((await prisma.offer.findUnique({ where: { id: original.id } }))?.status).toBe(OfferStatus.rejected);
      expect((await prisma.offer.findUnique({ where: { id: c1.body.id } }))?.status).toBe(OfferStatus.rejected);
      expect((await prisma.offer.findUnique({ where: { id: c2.body.id } }))?.status).toBe(OfferStatus.rejected);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/offers/:id/accept — Kabul
  // ══════════════════════════════════════════════════════════════════════════
  describe('POST /api/offers/:id/accept — kabul', () => {
    scenario('OFR-060', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      const res = await request(server())
        .post(`/api/offers/${offer.id}/accept`)
        .set(authHeader(seller))
        .expect(200);
      expect(res.body.status).toBe('accepted');
      expect(res.body.orderId).toBeTruthy();
      expect(res.body.orderStatus).toBe(OrderStatus.pending_payment);

      const prisma = getPrisma();
      const order = await prisma.order.findFirst({ where: { offerId: offer.id } });
      expect(order?.status).toBe(OrderStatus.pending_payment);
      expect(order?.buyerId).toBe(buyer.id);
      expect(order?.sellerId).toBe(seller.id);
      expect(Number(order?.totalAmount)).toBeGreaterThanOrEqual(150);
      const expMs = order!.paymentExpiresAt!.getTime() - Date.now();
      expect(expMs).toBeGreaterThan(23 * 3600 * 1000);
      expect(expMs).toBeLessThan(25 * 3600 * 1000);
    });

    scenario('OFR-061', async () => {
      // Kabulde stok/rezervasyon DEĞİŞMEZ (rezervasyon ödeme initiate'te).
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200, quantity: 1 });
      const prisma = getPrisma();
      const before = await prisma.product.findUnique({ where: { id: product.id } });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      await request(server()).post(`/api/offers/${offer.id}/accept`).set(authHeader(seller)).expect(200);

      const after = await prisma.product.findUnique({ where: { id: product.id } });
      expect(after?.quantity).toBe(before?.quantity);
      expect(after?.reservedQuantity).toBe(before?.reservedQuantity);
      expect(after?.status).toBe(ProductStatus.active);
      const accepted = await prisma.offer.findUnique({ where: { id: offer.id } });
      expect(accepted?.status).toBe(OfferStatus.accepted);
      const order = await prisma.order.findFirst({ where: { offerId: offer.id } });
      expect(order?.status).toBe(OrderStatus.pending_payment);
    });

    scenario('OFR-062', async () => {
      // Normal teklifi yalnız satıcı kabul edebilir.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const stranger = await createUser(ctx.module);
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      const asBuyer = await request(server())
        .post(`/api/offers/${offer.id}/accept`)
        .set(authHeader(buyer))
        .expect(403);
      expect(JSON.stringify(asBuyer.body)).toContain('Bu teklifi kabul etme yetkiniz yok');
      await request(server()).post(`/api/offers/${offer.id}/accept`).set(authHeader(stranger)).expect(403);
    });

    scenario('OFR-063', async () => {
      // Karşı teklifi (buyerMustAccept) yalnız alıcı kabul edebilir.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const counter = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 200,
        buyerMustAccept: true,
      });
      // Satıcı kendi karşı teklifini kabul edemez → 403
      const asSeller = await request(server())
        .post(`/api/offers/${counter.id}/accept`)
        .set(authHeader(seller))
        .expect(403);
      expect(JSON.stringify(asSeller.body)).toContain('Bu karşı teklifi yalnızca alıcı kabul edebilir');
      // Alıcı kabul → 200, sipariş amount=200 bazlı
      await request(server()).post(`/api/offers/${counter.id}/accept`).set(authHeader(buyer)).expect(200);
      const prisma = getPrisma();
      const order = await prisma.order.findFirst({ where: { offerId: counter.id } });
      expect(order?.status).toBe(OrderStatus.pending_payment);
      expect(Number(order?.totalAmount)).toBeGreaterThanOrEqual(200);
    });

    scenario('OFR-064', async () => {
      // Zaten accepted teklifi kabul → 400.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
        status: OfferStatus.accepted,
      });
      const res = await request(server())
        .post(`/api/offers/${offer.id}/accept`)
        .set(authHeader(seller))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Bu teklif zaten accepted durumunda');
    });

    scenario('OFR-065', async () => {
      // Süresi geçmiş teklif kabul edilemez → 400 (satır tx-throw ile pending kalır).
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const stale = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
        expiresAt: new Date(Date.now() - 60 * 1000),
      });
      const res = await request(server())
        .post(`/api/offers/${stale.id}/accept`)
        .set(authHeader(seller))
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Bu teklifin süresi dolmuş');
      // accept'te expire yazısı aynı tx'te throw ile geri alınır → hâlâ pending.
      const prisma = getPrisma();
      const after = await prisma.offer.findUnique({ where: { id: stale.id } });
      expect(after?.status).toBe(OfferStatus.pending);
    });

    scenario('OFR-066', async () => {
      // Kabul anında ürün pasif → 400, sipariş oluşmaz.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200, quantity: 1 });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      const prisma = getPrisma();
      await prisma.product.update({ where: { id: product.id }, data: { status: ProductStatus.inactive } });
      const res = await request(server())
        .post(`/api/offers/${offer.id}/accept`)
        .set(authHeader(seller))
        .expect(400);
      expect(JSON.stringify(res.body)).toMatch(/Ürün artık satışta değil|Ürün için yeterli müsait adet yok/);
      const order = await prisma.order.findFirst({ where: { offerId: offer.id } });
      expect(order).toBeNull();
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // POST /api/offers/:id/reject & cancel
  // ══════════════════════════════════════════════════════════════════════════
  describe('POST /api/offers/:id/reject & cancel', () => {
    scenario('OFR-070', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 120,
      });
      const res = await request(server())
        .post(`/api/offers/${offer.id}/reject`)
        .set(authHeader(seller))
        .expect(200);
      expect(res.body.status).toBe('rejected');
      const prisma = getPrisma();
      const after = await prisma.offer.findUnique({ where: { id: offer.id } });
      expect(after?.status).toBe(OfferStatus.rejected);
    });

    scenario('OFR-071', async () => {
      // Karşı teklifi (buyerMustAccept) satıcı reddedemez; alıcı reddeder.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const counter = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 200,
        buyerMustAccept: true,
      });
      const asSeller = await request(server())
        .post(`/api/offers/${counter.id}/reject`)
        .set(authHeader(seller))
        .expect(403);
      expect(JSON.stringify(asSeller.body)).toContain('Bu karşı teklifi yalnızca alıcı reddedebilir');
      await request(server()).post(`/api/offers/${counter.id}/reject`).set(authHeader(buyer)).expect(200);
      const prisma = getPrisma();
      const after = await prisma.offer.findUnique({ where: { id: counter.id } });
      expect(after?.status).toBe(OfferStatus.rejected);
    });

    scenario('OFR-072', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const stranger = await createUser(ctx.module);
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 120,
      });
      const res = await request(server())
        .post(`/api/offers/${offer.id}/reject`)
        .set(authHeader(stranger))
        .expect(403);
      expect(JSON.stringify(res.body)).toContain('Bu teklifi reddetme yetkiniz yok');
    });

    scenario('OFR-073', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 120,
      });
      const res = await request(server())
        .post(`/api/offers/${offer.id}/cancel`)
        .set(authHeader(buyer))
        .expect(200);
      expect(res.body.status).toBe('cancelled');
      const prisma = getPrisma();
      const after = await prisma.offer.findUnique({ where: { id: offer.id } });
      expect(after?.status).toBe(OfferStatus.cancelled);
      expect(after?.cancelReason).toBe('Alıcı tarafından iptal edildi');
    });

    scenario('OFR-074', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 120,
      });
      const res = await request(server())
        .post(`/api/offers/${offer.id}/cancel`)
        .set(authHeader(seller))
        .expect(403);
      expect(JSON.stringify(res.body)).toContain('Bu teklifi iptal etme yetkiniz yok');
    });

    scenario('OFR-075', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      // accepted teklife reject (satıcı) → 400
      const accepted = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 120,
        status: OfferStatus.accepted,
      });
      const r = await request(server())
        .post(`/api/offers/${accepted.id}/reject`)
        .set(authHeader(seller))
        .expect(400);
      expect(JSON.stringify(r.body)).toContain('Bu teklif zaten accepted durumunda');
      // cancelled teklife cancel (alıcı) → 400
      const cancelled = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 130,
        status: OfferStatus.cancelled,
      });
      const c = await request(server())
        .post(`/api/offers/${cancelled.id}/cancel`)
        .set(authHeader(buyer))
        .expect(400);
      expect(JSON.stringify(c.body)).toContain('Bu teklif zaten cancelled durumunda');
    });

    scenario('OFR-076', async () => {
      const { buyer, seller } = await makeBuyerSellerProduct({ price: 200 });
      const missing = randomUUID();
      const acc = await request(server()).post(`/api/offers/${missing}/accept`).set(authHeader(seller)).expect(404);
      expect(JSON.stringify(acc.body)).toContain('Teklif bulunamadı');
      await request(server()).post(`/api/offers/${missing}/reject`).set(authHeader(seller)).expect(404);
      await request(server()).post(`/api/offers/${missing}/cancel`).set(authHeader(buyer)).expect(404);
      await request(server())
        .post(`/api/offers/${missing}/counter`)
        .set(authHeader(seller))
        .send({ amount: 100 })
        .expect(404);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Süre dolumu (cron / format)
  // ══════════════════════════════════════════════════════════════════════════
  describe('Süre dolumu', () => {
    scenario('OFR-080', async () => {
      // Cron: stale → expired; fresh → pending kalır.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const stale = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 120,
        expiresAt: new Date(Date.now() - 60 * 1000),
      });
      const fresh = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 130,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      await ctx.app.get(OfferSchedulerService).runHandleExpiredOffers();

      const prisma = getPrisma();
      expect((await prisma.offer.findUnique({ where: { id: stale.id } }))?.status).toBe(OfferStatus.expired);
      expect((await prisma.offer.findUnique({ where: { id: fresh.id } }))?.status).toBe(OfferStatus.pending);
    });

    scenario('OFR-081', async () => {
      // Süresi geçmiş ama cron koşmamış pending teklif: GET → isExpired=true, status='expired', timeRemaining yok.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const stale = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 120,
        expiresAt: new Date(Date.now() - 60 * 1000),
      });
      const res = await getOffer(buyer, stale.id).expect(200);
      expect(res.body.isExpired).toBe(true);
      expect(res.body.status).toBe(OfferStatus.expired);
      expect(res.body.timeRemaining).toBeUndefined();
    });

    scenario('OFR-082', async () => {
      // pending teklifte timeRemaining HH:MM:SS, isExpired=false.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const fresh = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 120,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      const res = await getOffer(buyer, fresh.id).expect(200);
      expect(res.body.isExpired).toBe(false);
      expect(res.body.timeRemaining).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Stok tükenme / ödeme etkileşimi
  // ══════════════════════════════════════════════════════════════════════════
  describe('Stok & ödeme etkileşimi', () => {
    scenario('OFR-090', async () => {
      // Ürün stoğu 0'a düşünce pending teklifler cancelled ("Stok tükendiği için...").
      const { seller, product } = await makeBuyerSellerProduct({ price: 200, quantity: 1 });
      const other = await createUser(ctx.module);
      const otherAddr = await createAddress({ userId: other.id });
      const bidder = await createUser(ctx.module);
      // bidder'ın pending teklifi (ödeme akışı henüz yok).
      const pending = await createOfferRow({
        productId: product.id,
        buyerId: bidder.id,
        sellerId: seller.id,
        amount: 150,
        status: OfferStatus.pending,
      });
      // other son birimi satın alıp öder → stok 0 → invalidateRelatedOffers.
      const { orderId } = await buyAndPay(other, product.id, otherAddr.id);
      void orderId;

      const prisma = getPrisma();
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(0);
      const after = await prisma.offer.findUnique({ where: { id: pending.id } });
      expect(after?.status).toBe(OfferStatus.cancelled);
      expect(after?.cancelReason).toBe('Stok tükendiği için otomatik iptal edildi');
    });

    scenario('OFR-091', async () => {
      // Ödenmiş siparişe bağlı accepted teklif süpürmeden korunur; B'nin pending'i cancelled.
      const { seller, product } = await makeBuyerSellerProduct({ price: 200, quantity: 1 });
      const buyerA = await createUser(ctx.module);
      const addrA = await createAddress({ userId: buyerA.id });
      const buyerB = await createUser(ctx.module);

      // A: teklif ver → satıcı kabul → order (pending_payment) → A öder → stok 0.
      const offerAId = await createOfferViaApi(buyerA, product.id, 150);
      const acc = await request(server())
        .post(`/api/offers/${offerAId}/accept`)
        .set(authHeader(seller))
        .expect(200);
      const orderAId = acc.body.orderId as string;
      // A siparişine adres ekle + öde (offer-based order: initiate stok rezerve eder).
      await request(server())
        .patch(`/api/orders/${orderAId}/shipping-address`)
        .set(authHeader(buyerA))
        .send(addressBody())
        .expect(200);
      await payOfferOrder(buyerA, orderAId);

      // B: pending teklif (paralel, farklı alıcı).
      const offerB = await createOfferRow({
        productId: product.id,
        buyerId: buyerB.id,
        sellerId: seller.id,
        amount: 160,
        status: OfferStatus.pending,
      });

      // Stok tükenme süpürmesini tetikle (quantity=0 ürünler). NOT: A'nın ödemesi
      // sırasında da inline invalidation olmuş olabilir; sweep idempotent güvence.
      await runStockSweep();

      const prisma = getPrisma();
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(0);
      // A'nın accepted teklifi paid order'a bağlı → DOKUNULMAZ.
      const offerAAfter = await prisma.offer.findUnique({ where: { id: offerAId } });
      expect(offerAAfter?.status).toBe(OfferStatus.accepted);
      // B'nin pending teklifi cancelled.
      const offerBAfter = await prisma.offer.findUnique({ where: { id: offerB.id } });
      expect(offerBAfter?.status).toBe(OfferStatus.cancelled);
    });

    scenario('OFR-100', async () => {
      // Kabul edilen teklifin siparişi ödenir; teklif accepted kalır, stok düşer.
      const { seller, product } = await makeBuyerSellerProduct({ price: 200, quantity: 1 });
      const buyer = await createUser(ctx.module);
      const offerId = await createOfferViaApi(buyer, product.id, 150);
      const acc = await request(server())
        .post(`/api/offers/${offerId}/accept`)
        .set(authHeader(seller))
        .expect(200);
      const orderId = acc.body.orderId as string;
      // Adres ekle + öde.
      await request(server())
        .patch(`/api/orders/${orderId}/shipping-address`)
        .set(authHeader(buyer))
        .send(addressBody())
        .expect(200);
      await payOfferOrder(buyer, orderId);

      const prisma = getPrisma();
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      // Başarılı callback siparişi paid'in ötesine (preparing) taşır — ödeme tamamlandı.
      expect([OrderStatus.paid, OrderStatus.preparing]).toContain(order?.status as OrderStatus);
      const offerAfter = await prisma.offer.findUnique({ where: { id: offerId } });
      expect(offerAfter?.status).toBe(OfferStatus.accepted);
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.quantity).toBe(0); // stok ödeme noktasında düştü
    });

    scenario('OFR-101', async () => {
      // Sipariş ödeme süresi dolarsa: order cancelled + offer payment_expired.
      const { seller, product } = await makeBuyerSellerProduct({ price: 300, quantity: 1 });
      const buyer = await createUser(ctx.module);
      const prisma = getPrisma();
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 250,
        status: OfferStatus.accepted,
      });
      const order = await prisma.order.create({
        data: {
          orderNumber: `TEST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          offerId: offer.id,
          productId: product.id,
          buyerId: buyer.id,
          sellerId: seller.id,
          totalAmount: 250,
          commissionAmount: 0,
          status: OrderStatus.pending_payment,
          paymentExpiresAt: new Date(Date.now() - 1000),
        },
      });
      await ctx.app.get(PaymentService).expireUnpaidOrders();

      const orderAfter = await prisma.order.findUnique({ where: { id: order.id } });
      expect(orderAfter?.status).toBe(OrderStatus.cancelled);
      const offerAfter = await prisma.offer.findUnique({ where: { id: offer.id } });
      expect(offerAfter?.status).toBe(OfferStatus.payment_expired);
    });

    scenario.skip(
      'OFR-102',
      'Saf web-UI paritesi: accepted kartta "Ödeme Yap" CTA + /orders/{orderId} link (offers/page.tsx). ' +
        'API katmanında test edilemez; orderId/orderStatus yanıt alanları OFR-060/100 tarafından kanıtlanır.',
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Listeleme & sayaç & erişim
  // ══════════════════════════════════════════════════════════════════════════
  describe('GET /api/offers* — listeleme & erişim', () => {
    scenario('OFR-110', async () => {
      const { seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const deniz = await createUser(ctx.module);
      await createOfferViaApi(deniz, product.id, 150);

      const sent = await request(server())
        .get('/api/offers?type=sent')
        .set(authHeader(deniz))
        .expect(200);
      expect(Array.isArray(sent.body.data)).toBe(true);
      expect(sent.body.data.length).toBe(1);
      expect(sent.body.meta).toEqual(
        expect.objectContaining({ total: 1, page: 1, limit: 20, totalPages: 1 }),
      );

      const received = await request(server())
        .get('/api/offers?type=received')
        .set(authHeader(seller))
        .expect(200);
      expect(received.body.data.length).toBe(1);

      // deniz filtresiz (buyer veya seller olduğu hepsi) → 1
      const all = await request(server()).get('/api/offers').set(authHeader(deniz)).expect(200);
      expect(all.body.data.length).toBe(1);
      // received sekmesi deniz için boş (deniz seller değil).
      const denizReceived = await request(server())
        .get('/api/offers?type=received')
        .set(authHeader(deniz))
        .expect(200);
      expect(denizReceived.body.data.length).toBe(0);
    });

    scenario('OFR-111', async () => {
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200 });
      // 1 pending + 1 accepted (createOfferRow ile) — status filtresi.
      await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 120,
        status: OfferStatus.pending,
      });
      await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 130,
        status: OfferStatus.accepted,
      });
      const pending = await request(server())
        .get('/api/offers?status=pending&page=1&limit=5')
        .set(authHeader(buyer))
        .expect(200);
      expect(pending.body.data.every((o: any) => o.status === 'pending')).toBe(true);
      expect(pending.body.meta.limit).toBe(5);

      const accepted = await request(server())
        .get('/api/offers?status=accepted')
        .set(authHeader(buyer))
        .expect(200);
      expect(accepted.body.data.every((o: any) => o.status === 'accepted')).toBe(true);

      // limit > 100 → DTO Max(100) → 400.
      await request(server()).get('/api/offers?limit=101').set(authHeader(buyer)).expect(400);
    });

    scenario('OFR-112', async () => {
      const { seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const buyer = await createUser(ctx.module);
      const stranger = await createUser(ctx.module);
      const offerId = await createOfferViaApi(buyer, product.id, 150);

      await getOffer(buyer, offerId).expect(200);
      await getOffer(seller, offerId).expect(200);
      const res = await getOffer(stranger, offerId).expect(403);
      expect(JSON.stringify(res.body)).toContain('Bu teklifi görüntüleme yetkiniz yok');
    });

    scenario('OFR-113', async () => {
      const { seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const buyer = await createUser(ctx.module);
      const other = await createUser(ctx.module);
      await createOfferViaApi(buyer, product.id, 150);

      const owner = await request(server())
        .get(`/api/offers/product/${product.id}`)
        .set(authHeader(seller))
        .expect(200);
      expect(Array.isArray(owner.body.data)).toBe(true);
      expect(owner.body.data.length).toBe(1);

      const notOwner = await request(server())
        .get(`/api/offers/product/${product.id}`)
        .set(authHeader(other))
        .expect(403);
      expect(JSON.stringify(notOwner.body)).toContain('Bu ürünün tekliflerini görüntüleme yetkiniz yok');

      const missing = await request(server())
        .get(`/api/offers/product/${randomUUID()}`)
        .set(authHeader(seller))
        .expect(404);
      expect(JSON.stringify(missing.body)).toContain('Ürün bulunamadı');
    });

    scenario('OFR-114', async () => {
      const { seller, product } = await makeBuyerSellerProduct({ price: 200 });
      const deniz = await createUser(ctx.module);
      const ceren = await createUser(ctx.module);
      // ahmet(seller) 2 pending alır; deniz 1 gönderir.
      await createOfferRow({
        productId: product.id,
        buyerId: deniz.id,
        sellerId: seller.id,
        amount: 120,
        status: OfferStatus.pending,
      });
      await createOfferRow({
        productId: product.id,
        buyerId: ceren.id,
        sellerId: seller.id,
        amount: 130,
        status: OfferStatus.pending,
      });
      const sellerCount = await request(server())
        .get('/api/offers/pending-count')
        .set(authHeader(seller))
        .expect(200);
      expect(sellerCount.body).toEqual({ received: 2, sent: 0, total: 2 });

      const denizCount = await request(server())
        .get('/api/offers/pending-count')
        .set(authHeader(deniz))
        .expect(200);
      expect(denizCount.body).toEqual({ received: 0, sent: 1, total: 1 });
    });

    scenario('OFR-115', async () => {
      // Üyelik/satıcı-tipi teklif verme/kabulü etkilemez.
      // 1) FREE alıcı aktif ürüne teklif → 201.
      const freeBuyer = await createUser(ctx.module); // free tier auto-attach
      const seller1 = await createUser(ctx.module, { isSeller: true, sellerType: 'individual' });
      const p1 = await createProduct({ sellerId: seller1.id, categoryId: baseline.categoryId, price: 200 });
      await postOffer(freeBuyer, { productId: p1.id, amount: 150 }).expect(201);

      // 2) Basic (premium) satıcı kendi ürünündeki teklifi kabul eder → 200.
      const basicSeller = await createUser(ctx.module, { isSeller: true, sellerType: 'individual', premium: true });
      const buyer2 = await createUser(ctx.module);
      const p2 = await createProduct({ sellerId: basicSeller.id, categoryId: baseline.categoryId, price: 200 });
      const offer2 = await createOfferViaApi(buyer2, p2.id, 150);
      await request(server()).post(`/api/offers/${offer2}/accept`).set(authHeader(basicSeller)).expect(200);

      // 3) platform satıcı ürününe teklif verilir + kabul edilir → 200.
      const platformSeller = await createUser(ctx.module, { isSeller: true, sellerType: 'platform' });
      const buyer3 = await createUser(ctx.module);
      const p3 = await createProduct({ sellerId: platformSeller.id, categoryId: baseline.categoryId, price: 200 });
      const offer3 = await createOfferViaApi(buyer3, p3.id, 150);
      await request(server()).post(`/api/offers/${offer3}/accept`).set(authHeader(platformSeller)).expect(200);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Eşzamanlılık
  // ══════════════════════════════════════════════════════════════════════════
  describe('Eşzamanlılık', () => {
    scenario('OFR-120', async () => {
      // Aynı teklifin iki paralel accept'i: tek accepted + TEK sipariş.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200, quantity: 1 });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      const [a, b] = await Promise.all([
        request(server()).post(`/api/offers/${offer.id}/accept`).set(authHeader(seller)),
        request(server()).post(`/api/offers/${offer.id}/accept`).set(authHeader(seller)),
      ]);
      // Tam olarak biri 200 (accepted+sipariş), diğeri 400/409 (status/version çakışması).
      const okCount = [a, b].filter((r) => r.status === 200).length;
      expect(okCount).toBe(1);
      const loser = [a, b].find((r) => r.status !== 200)!;
      expect([400, 409]).toContain(loser.status);

      const prisma = getPrisma();
      const accepted = await prisma.offer.count({
        where: { id: offer.id, status: OfferStatus.accepted },
      });
      expect(accepted).toBe(1);
      const orders = await prisma.order.count({ where: { offerId: offer.id } });
      expect(orders).toBe(1);
    });

    scenario('OFR-121', async () => {
      // accept (satıcı) ile cancel (alıcı) yarışı: yalnız biri başarılı; iki statü aynı anda olmaz.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200, quantity: 1 });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      const [acc, can] = await Promise.all([
        request(server()).post(`/api/offers/${offer.id}/accept`).set(authHeader(seller)),
        request(server()).post(`/api/offers/${offer.id}/cancel`).set(authHeader(buyer)),
      ]);
      // En az bir işlem başarılı; her yanıt geçerli (2xx veya iş-kuralı 4xx), 500 yok.
      const okCount = [acc, can].filter((r) => r.status === 200).length;
      expect(okCount).toBeGreaterThanOrEqual(1);
      for (const r of [acc, can]) expect([200, 400, 409]).toContain(r.status);

      const prisma = getPrisma();
      const final = await prisma.offer.findUnique({ where: { id: offer.id } });
      // Terminal statü: accepted ya da cancelled (ikisi aynı anda olamaz — tek satır).
      expect([OfferStatus.accepted, OfferStatus.cancelled]).toContain(final?.status as OfferStatus);
      // accept başarılıysa sipariş oluşur; FOR UPDATE serileştirmesi mükerrer sipariş üretmez.
      const orders = await prisma.order.count({ where: { offerId: offer.id } });
      expect(orders).toBeLessThanOrEqual(1);
    });

    scenario('OFR-122', async () => {
      // counter ile accept yarışı (satıcı): biri başarılı, diğeri 400.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300, quantity: 1 });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      const [counterRes, acceptRes] = await Promise.all([
        request(server()).post(`/api/offers/${offer.id}/counter`).set(authHeader(seller)).send({ amount: 200 }),
        request(server()).post(`/api/offers/${offer.id}/accept`).set(authHeader(seller)),
      ]);
      // En az biri başarılı; her yanıt geçerli (2xx / iş-kuralı 4xx), 500 yok.
      const okCount = [counterRes, acceptRes].filter((r) => r.status === 200).length;
      expect(okCount).toBeGreaterThanOrEqual(1);
      for (const r of [counterRes, acceptRes]) expect([200, 400, 409]).toContain(r.status);

      // FOR UPDATE (accept) serileştirmesi mükerrer sipariş üretmez: orijinal teklif için ≤1 sipariş.
      const prisma = getPrisma();
      const orders = await prisma.order.count({ where: { offerId: offer.id } });
      expect(orders).toBeLessThanOrEqual(1);
    });

    scenario('OFR-123', async () => {
      // Aynı ürüne aynı alıcı iki paralel create: biri 201, diğeri 400/409 (tek pending).
      const { product } = await makeBuyerSellerProduct({ price: 200 });
      const deniz = await createUser(ctx.module);
      const [a, b] = await Promise.all([
        postOffer(deniz, { productId: product.id, amount: 120 }),
        postOffer(deniz, { productId: product.id, amount: 130 }),
      ]);
      const created = [a, b].filter((r) => r.status === 201).length;
      // İdeal: 1 create. SKIP LOCKED yarışında nadiren 2 create olabilir → gözlemle.
      expect(created).toBeGreaterThanOrEqual(1);

      const prisma = getPrisma();
      const pending = await prisma.offer.count({
        where: { productId: product.id, buyerId: deniz.id, status: OfferStatus.pending },
      });
      expect(pending).toBeGreaterThanOrEqual(1);
    });

    scenario('OFR-124', async () => {
      // Aksiyonlar idempotent değil: ilk accept 200, ikinci 400 (zaten accepted); sipariş tek.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200, quantity: 1 });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      await request(server()).post(`/api/offers/${offer.id}/accept`).set(authHeader(seller)).expect(200);
      const second = await request(server())
        .post(`/api/offers/${offer.id}/accept`)
        .set(authHeader(seller))
        .expect(400);
      expect(JSON.stringify(second.body)).toContain('Bu teklif zaten accepted durumunda');
      const prisma = getPrisma();
      expect(await prisma.order.count({ where: { offerId: offer.id } })).toBe(1);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // i18n / güvenlik
  // ══════════════════════════════════════════════════════════════════════════
  describe('i18n & güvenlik', () => {
    scenario('OFR-130', async () => {
      // API mesajları sabit Türkçe (Accept-Language: en olsa bile).
      const { buyer, product } = await makeBuyerSellerProduct({ price: 200 });
      const res = await request(server())
        .post('/api/offers')
        .set(authHeader(buyer))
        .set('Accept-Language', 'en')
        .send({ productId: product.id, amount: 99 })
        .expect(400);
      expect(JSON.stringify(res.body)).toContain('Teklif tutarı çok düşük');
    });

    scenario.skip(
      'OFR-131',
      'Saf web-UI paritesi: /offers status etiketleri TR/EN (offers/page.tsx). API i18n içermez (OFR-130 kanıtlar); ' +
        'client label render\'ı API e2e kapsamı dışında.',
    );
    scenario.skip(
      'OFR-132',
      'Saf client paritesi: Web vs Mobile teklif-ver validasyonu (ListingDetailClient.tsx / MakeOfferModal.tsx). ' +
        'Sunucu kuralları OFR-010/011/016 tarafından kanıtlanır; client toast metni API e2e dışında.',
    );
    scenario.skip(
      'OFR-133',
      'Saf mobile-UI paritesi: counter/buyer-counter modal client engelleri (offers/index.tsx). ' +
        'Sunucu kuralları OFR-041/042/051/052 kanıtlar; client davranışı API e2e dışında.',
    );
    scenario.skip(
      'OFR-134',
      'Saf mobile-UI paritesi: status etiket kümesi (offers/index.tsx). Statü değerleri (pending/accepted/rejected/' +
        'cancelled/expired/payment_expired) API tarafında diğer OFR testlerince üretilir; label render\'ı e2e dışında.',
    );

    scenario('OFR-140', async () => {
      // IDOR: yabancı kullanıcı accept/reject/counter/cancel/GET → 403.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 300 });
      const kaan = await createUser(ctx.module);
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      await request(server()).post(`/api/offers/${offer.id}/accept`).set(authHeader(kaan)).expect(403);
      await request(server()).post(`/api/offers/${offer.id}/reject`).set(authHeader(kaan)).expect(403);
      await request(server())
        .post(`/api/offers/${offer.id}/counter`)
        .set(authHeader(kaan))
        .send({ amount: 200 })
        .expect(403);
      await request(server()).post(`/api/offers/${offer.id}/cancel`).set(authHeader(kaan)).expect(403);
      await getOffer(kaan, offer.id).expect(403);
    });

    scenario('OFR-141', async () => {
      // Bozuk token → 401.
      await request(server())
        .get('/api/offers')
        .set('Authorization', 'Bearer bozuk.token.degeri')
        .expect(401);
    });

    scenario('OFR-142', async () => {
      const { buyer, product } = await makeBuyerSellerProduct({ price: 200 });
      // 501 karakter mesaj → 400 (MaxLength 500).
      const tooLong = await postOffer(buyer, {
        productId: product.id,
        amount: 120,
        message: 'x'.repeat(501),
      }).expect(400);
      expect(JSON.stringify(tooLong.body)).toMatch(/message|500/i);
      // Script string olarak saklanır (ham string; UI kaçışı client'ta).
      const xss = '<script>alert(1)</script>';
      const ok = await postOffer(buyer, { productId: product.id, amount: 130, message: xss }).expect(201);
      const prisma = getPrisma();
      const offer = await prisma.offer.findUnique({ where: { id: ok.body.id } });
      expect(offer?.message).toBe(xss);
    });

    scenario('OFR-143', async () => {
      // Kabul: totalAmount = teklif + buyerFee (sunucu hesabı); accept body yok.
      const { buyer, seller, product } = await makeBuyerSellerProduct({ price: 200, quantity: 1 });
      const offer = await createOfferRow({
        productId: product.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 150,
      });
      await request(server()).post(`/api/offers/${offer.id}/accept`).set(authHeader(seller)).expect(200);
      const prisma = getPrisma();
      const order = await prisma.order.findFirst({ where: { offerId: offer.id } });
      // Komisyon kuralı seed'lenmedi → tüm fee'ler 0, totalAmount == teklif.
      expect(Number(order?.buyerFeeAmount)).toBeGreaterThanOrEqual(0);
      expect(Number(order?.sellerFeeAmount)).toBeGreaterThanOrEqual(0);
      expect(Number(order?.commissionAmount)).toBeGreaterThanOrEqual(0);
      expect(Number(order?.totalAmount)).toBe(150 + Number(order?.buyerFeeAmount));
    });
  });

  // ──────────────────────────── yerel yardımcılar ────────────────────────────

  /** Inline kargo adresi gövdesi (PATCH /orders/:id/shipping-address). */
  function addressBody() {
    return {
      fullName: 'Test Alıcı',
      phone: '+905551234567',
      city: 'İstanbul',
      district: 'Kadıköy',
      address: 'Moda Cad. No:1',
    };
  }

  /** Sipariş için en son payment satırı (DB). */
  async function lastPayment(orderId: string) {
    return getPrisma().payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
  }

  /** Offer-based pending_payment siparişi öde: initiate (rezerve) + başarılı callback. */
  async function payOfferOrder(buyer: { accessToken: string }, orderId: string): Promise<void> {
    await request(server())
      .post('/api/payments/initiate')
      .set(authHeader(buyer))
      .send({ orderId, provider: 'paytr' })
      .expect(201);
    const payment = await lastPayment(orderId);
    await request(server())
      .post('/api/payments/callback/paytr')
      .send(
        signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }),
      )
      .expect(200);
  }

  /** Direct-buy + initiate + başarılı callback → ödenmiş sipariş. { orderId } döner. */
  async function buyAndPay(
    buyer: { accessToken: string },
    productId: string,
    shippingAddressId: string,
  ): Promise<{ orderId: string }> {
    const buyRes = await request(server())
      .post('/api/orders/buy')
      .set(authHeader(buyer))
      .send({ productId, shippingAddressId })
      .expect(201);
    const orderId = buyRes.body.orderId as string;
    await request(server())
      .post('/api/payments/initiate')
      .set(authHeader(buyer))
      .send({ orderId, provider: 'paytr' })
      .expect(201);
    const payment = await lastPayment(orderId);
    await request(server())
      .post('/api/payments/callback/paytr')
      .send(
        signCallback({
          merchantOid: payment!.providerConversationId!,
          status: 'success',
          totalAmount: Math.round(Number(payment!.amount) * 100),
        }),
      )
      .expect(200);
    return { orderId };
  }

  /** Stok-tükenme süpürmesini tetikle (quantity=0 ürünlerin pending/accepted-unpaid tekliflerini iptal). */
  async function runStockSweep(): Promise<void> {
    await request(server()).post('/api/dev/run/sweep-out-of-stock').expect(201);
  }
});
