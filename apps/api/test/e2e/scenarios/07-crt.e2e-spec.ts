/**
 * 07 — Sepet & Checkout (CRT) — Test Konsolu senaryoları.
 *
 * GOLD ŞABLON: 01-auth.e2e-spec.ts yapısını birebir izler (createE2ETestApp,
 * truncateAll+seedBaseline, scenario('<ID>', fn)). Persona'lar yerine factory
 * eşdeğerleri (createUser/createProduct/createAddress) kullanılır. Sadece
 * gap===false senaryolar yazılır; saf-UI/parite senaryoları scenario.skip ile
 * gerekçelendirilir.
 *
 * Doğruluk için gerçek koddan teyit edilen ana noktalar:
 *  - GET /api/cart → 200, body { id, userId, couponCode, calculation:{ items[], itemCount,
 *    subtotal, productDiscountTotal, couponDiscountTotal, totalDiscount, shippingCost,
 *    amountToFreeShipping, grandTotal, appliedDiscounts[], warnings[] } } (cart-response.dto.ts).
 *  - POST /api/cart/items → 201 (varsayılan POST), DTO AddToCartDto: quantity Transform(string→trunc,
 *    boş/yok→1) @Min(1)@Max(99). Sepet stok üst sınırı = product.quantity (rezervasyondan bağımsız),
 *    hata "Bu üründen en fazla N adet sipariş verilebilir" / "Ürün stokta yok".
 *  - PATCH /api/cart/items/:productId → 200; quantity 0 = satırı kaldır; stok kontrolü product.quantity,
 *    hata "Stokta sadece N adet var".
 *  - DELETE /api/cart/items/:productId → 200 (CartResponseDto döner).
 *  - POST /api/cart/coupon → @HttpCode(200); kupon kodu upper-case saklanır; boş sepet "Sepetiniz boş".
 *  - DELETE /api/cart/coupon → 200; DELETE /api/cart → @HttpCode(204).
 *  - Kargo: subtotal>=500 → 0, altı → 29.99; %50 indirim tavanı (cart.service.ts).
 *  - Sepette salePrice/effectivePrice = getEffectiveDisplayPrice (kodsuz aktif kampanya); originalPrice
 *    = product.price (fiyat dondurulmaz, GET'te güncel hesaplanır).
 *  - POST /api/orders/quote → 201 (@Public, varsayılan POST); pricing.{subtotal,shippingAmount,
 *    buyerFeeAmount,taxAmount,totalAmount,...}; KDV yalnız kurumsal satıcı (businessStatus=approved+taxId)
 *    + aktif TaxRule; komisyon CommissionRule'a göre, kural yoksa 0 fallback.
 *  - POST /api/orders/checkout → 201; body { checkoutGroupId, groupNumber(GRP...), totalAmount,
 *    orders:[{ orderId, orderNumber, productId, totalAmount, subtotal, discountAmount, appliedCouponCode }],
 *    provider:'paytr' }. Aynı idempotencyKey replay → existingGroup:true; başka alıcının key'i → 403.
 *    Stok yetersiz → 400 + body.productId. Kendi ürünü → 403. Banlı → 403. Adres yok → 400.
 *  - Misafir checkout OTP: POST /api/orders/guest/send-verification-code → @HttpCode(200) { success,
 *    expiresInSeconds }; kod MailHog'a düşer; POST /api/orders/checkout/guest → 201.
 */
import * as request from 'supertest';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../../test-utils/create-app';
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from '../../test-utils/db';
import { createUser, authHeader } from '../../factories/user.factory';
import { createProduct } from '../../factories/product.factory';
import { createAddress } from '../../factories/address.factory';
import { scenario, scenarioSkip } from '../../test-utils/scenario';
import { clearMailbox, getLastEmailTo, extractCode } from '../../test-utils/mail';

describe('07 — Sepet & Checkout (CRT)', () => {
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

  // ──────────────────────────── ortak kurulum yardımcıları ────────────────────────────

  const uuid = () => crypto.randomUUID();

  /**
   * DB'de var olmayan sabit ID. Yalnızca @IsUUID('4') UYGULANMAYAN uçlarda kullanılır:
   * cart addItem (AddToCartDto.productId sadece @IsString) → 404; ve auth'suz uçlar → 401
   * (guard DTO'dan önce). NOT: bu sabit v4 DEĞİLDİR (versiyon nibble'ı 0), o yüzden
   * @IsUUID('4') olan checkout/quote DTO'larına gönderilmez.
   */
  const ABSENT_UUID = '00000000-0000-0000-0000-000000000000';

  /** Satıcı + aktif ürün üret (varsayılan price=100, quantity=1). */
  async function makeProduct(opts?: {
    price?: number;
    quantity?: number | null;
    status?: 'active' | 'sold' | 'inactive' | 'pending';
    maxQuantityPerOrder?: number;
    sellerId?: string;
  }) {
    const prisma = getPrisma();
    let sellerId = opts?.sellerId;
    if (!sellerId) {
      const seller = await createUser(ctx.module, { isSeller: true });
      sellerId = seller.id;
    }
    const product = await prisma.product.create({
      data: {
        sellerId,
        categoryId: baseline.categoryId,
        title: `Ürün ${Math.random().toString(36).slice(2, 8)}`,
        description: 'CRT e2e',
        price: new Prisma.Decimal(opts?.price ?? 100),
        condition: 'new' as any,
        status: (opts?.status ?? 'active') as any,
        quantity: opts?.quantity === undefined ? 1 : opts.quantity,
        reservedQuantity: 0,
        maxQuantityPerOrder: opts?.maxQuantityPerOrder ?? null,
      },
    });
    return { id: product.id, sellerId, price: Number(product.price) };
  }

  const addItem = (user: { accessToken: string }, body: Record<string, unknown>) =>
    request(server()).post('/api/cart/items').set(authHeader(user)).send(body);

  const getCart = (user: { accessToken: string }) =>
    request(server()).get('/api/cart').set(authHeader(user));

  /** Aktif (kodsuz) ürün-kapsamlı kampanya kur → sepette salePrice/effectivePrice düşer. */
  async function addProductCampaign(opts: {
    productId: string;
    type: 'percentage' | 'fixed_amount';
    value: number;
  }) {
    const prisma = getPrisma();
    const now = new Date();
    return prisma.discount.create({
      data: {
        name: `kampanya-${Math.random().toString(36).slice(2, 8)}`,
        code: null,
        type: opts.type as any,
        value: new Prisma.Decimal(opts.value),
        scope: 'product' as any,
        targetProductIds: [opts.productId],
        isActive: true,
        startDate: new Date(now.getTime() - 3_600_000),
        endDate: new Date(now.getTime() + 30 * 24 * 3_600_000),
      },
    });
  }

  /** Kupon (kodlu) indirim kur — varsayılan global %50, tüm satıcılara uyar. */
  async function addCoupon(opts?: {
    code?: string;
    type?: 'percentage' | 'fixed_amount';
    value?: number;
    scope?: 'global' | 'seller' | 'product';
    sellerId?: string | null;
    targetProductIds?: string[];
    maxDiscountAmount?: number;
    minCartValue?: number;
  }) {
    const prisma = getPrisma();
    const now = new Date();
    return prisma.discount.create({
      data: {
        name: 'Test Kupon',
        code: (opts?.code ?? 'INDIRIM10').toUpperCase(),
        type: (opts?.type ?? 'percentage') as any,
        value: new Prisma.Decimal(opts?.value ?? 10),
        scope: (opts?.scope ?? 'global') as any,
        sellerId: opts?.sellerId ?? null,
        targetProductIds: opts?.targetProductIds ?? [],
        maxDiscountAmount:
          opts?.maxDiscountAmount != null ? new Prisma.Decimal(opts.maxDiscountAmount) : null,
        minCartValue: opts?.minCartValue != null ? new Prisma.Decimal(opts.minCartValue) : null,
        usageLimitPerUser: null,
        isActive: true,
        startDate: new Date(now.getTime() - 3_600_000),
        endDate: new Date(now.getTime() + 30 * 24 * 3_600_000),
      },
    });
  }

  /** ALL+NULL kapsamlı komisyon kuralı (her satıcıya uyar). */
  async function addCommissionRule(opts: {
    appliesTo: 'SELLER' | 'BUYER';
    sellerRate?: number;
    buyerRate?: number;
  }) {
    const prisma = getPrisma();
    return prisma.commissionRule.create({
      data: {
        name: `rule-${opts.appliesTo}-${Math.random().toString(36).slice(2, 8)}`,
        ruleType: 'default' as any,
        appliesTo: opts.appliesTo as any,
        sellerType: 'ALL' as any,
        percentage: new Prisma.Decimal(0),
        sellerRate: opts.sellerRate != null ? new Prisma.Decimal(opts.sellerRate) : null,
        buyerRate: opts.buyerRate != null ? new Prisma.Decimal(opts.buyerRate) : null,
        isActive: true,
        priority: 0,
      },
    });
  }

  /** Kurumsal satıcı + aktif KDV(%20) altyapısı kur (quote'ta taxAmount>0). */
  async function setupCorporateTax(sellerId: string) {
    const prisma = getPrisma();
    await prisma.user.update({
      where: { id: sellerId },
      data: { businessStatus: 'approved' as any, taxId: '1234567890' },
    });
    const region = await prisma.taxRegion.create({
      data: { name: 'TR', countryCode: 'TR', isDefault: true, isActive: true },
    });
    const rate = await prisma.taxRate.create({
      data: { taxRegionId: region.id, name: 'KDV %20', rate: new Prisma.Decimal(20), isActive: true },
    });
    await prisma.taxRule.create({
      data: { taxRegionId: region.id, taxRateId: rate.id, scope: 'default_rate' as any, isActive: true },
    });
  }

  const validInlineAddress = (over: Record<string, unknown> = {}) => ({
    fullName: 'Ali Veli',
    phone: '+905551234567',
    city: 'İstanbul',
    district: 'Kadıköy',
    address: 'Caferağa Mah. Moda Cad. No:1',
    ...over,
  });

  // ════════════════════════════ POST /api/cart/items — ekleme ════════════════════════════

  scenario('CRT-001', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 250, quantity: 5 });

    const res = await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    const items = res.body.calculation.items;
    const line = items.find((i: any) => i.productId === product.id);
    expect(line).toBeTruthy();
    expect(line.quantity).toBe(1);
    expect(line.effectivePrice).toBe(250);
    expect(line.lineTotal).toBe(250);

    const cart = await getCart(buyer).expect(200);
    expect(cart.body.calculation.itemCount).toBe(1);
    expect(cart.body.calculation.subtotal).toBe(250);
  });

  scenario('CRT-002', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 100, quantity: 5 });
    const res = await addItem(buyer, { productId: product.id, quantity: 2 }).expect(201);
    const line = res.body.calculation.items.find((i: any) => i.productId === product.id);
    expect(line.quantity).toBe(2);
    expect(line.lineTotal).toBe(200);
    expect(res.body.calculation.subtotal).toBe(200);
  });

  scenario('CRT-003', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 100, quantity: 5 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    const res = await addItem(buyer, { productId: product.id, quantity: 2 }).expect(201);
    const lines = res.body.calculation.items.filter((i: any) => i.productId === product.id);
    expect(lines).toHaveLength(1); // @@unique([cartId, productId]) — tek satır
    expect(lines[0].quantity).toBe(3); // 1 + 2

    // DB teyidi: tek cart_item satırı, quantity=3
    const prisma = getPrisma();
    const rows = await prisma.cartItem.findMany({ where: { productId: product.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(3);
  });

  scenario('CRT-004', async () => {
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: seller.id });
    const res = await addItem(seller, { productId: product.id });
    // Servis 400 üretir; E2E 400/403 kabul edilir (cart.e2e-spec.ts:73-87 ile uyumlu).
    expect([400, 403]).toContain(res.status);
    expect(String(res.body.message)).toContain('Kendi ürününüzü satın alamazsınız');
  });

  scenario('CRT-005', async () => {
    const buyer = await createUser(ctx.module);
    const res = await addItem(buyer, { productId: ABSENT_UUID }).expect(404);
    expect(String(res.body.message)).toContain('Ürün bulunamadı');
  });

  scenario('CRT-006', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ status: 'inactive' });
    const res = await addItem(buyer, { productId: product.id }).expect(400);
    expect(String(res.body.message)).toContain('Bu ürün şu an satışa uygun değil');
  });

  scenario('CRT-007', async () => {
    // quantity=5 istenir, stok 2 → 400 "Bu üründen en fazla 2 adet sipariş verilebilir"
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 2 });
    const res = await addItem(buyer, { productId: product.id, quantity: 5 });
    expect([400, 422]).toContain(res.status);
    expect(String(res.body.message)).toContain('Bu üründen en fazla 2 adet sipariş verilebilir');
  });

  scenario('CRT-008', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 0 });
    const res = await addItem(buyer, { productId: product.id, quantity: 1 }).expect(400);
    expect(String(res.body.message)).toContain('Ürün stokta yok');
  });

  scenario('CRT-009', async () => {
    // maxQuantityPerOrder=3, yeni satır quantity=4 → 400
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 50, maxQuantityPerOrder: 3 });
    const res = await addItem(buyer, { productId: product.id, quantity: 4 }).expect(400);
    expect(String(res.body.message)).toContain('Bu üründen maksimum 3 adet alabilirsiniz');
  });

  scenario('CRT-010', async () => {
    // maxQuantityPerOrder=3; sepette 2 var, +2 → toplam 4 → 400, sepet 2'de kalır
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 50, maxQuantityPerOrder: 3 });
    await addItem(buyer, { productId: product.id, quantity: 2 }).expect(201);
    const res = await addItem(buyer, { productId: product.id, quantity: 2 }).expect(400);
    expect(String(res.body.message)).toContain('Bu üründen maksimum 3 adet alabilirsiniz');
    const cart = await getCart(buyer).expect(200);
    const line = cart.body.calculation.items.find((i: any) => i.productId === product.id);
    expect(line.quantity).toBe(2);
  });

  scenario('CRT-011', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 50 });
    // 1) quantity=0 → @Min(1) → 400
    await addItem(buyer, { productId: product.id, quantity: 0 }).expect(400);
    // 2) quantity=100 → @Max(99) → 400
    await addItem(buyer, { productId: product.id, quantity: 100 }).expect(400);
    // 3) quantity="2" (string) → Transform trunc → 2, 201
    const p3 = await makeProduct({ quantity: 50 });
    const r3 = await addItem(buyer, { productId: p3.id, quantity: '2' }).expect(201);
    expect(r3.body.calculation.items.find((i: any) => i.productId === p3.id).quantity).toBe(2);
    // 4) quantity yok → default 1, 201
    const p4 = await makeProduct({ quantity: 50 });
    const r4 = await addItem(buyer, { productId: p4.id }).expect(201);
    expect(r4.body.calculation.items.find((i: any) => i.productId === p4.id).quantity).toBe(1);
  });

  scenario('CRT-012', async () => {
    // Sınırsız stok (quantity=null) + maxQuantityPerOrder yok → quantity=50 serbest
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: null });
    const res = await addItem(buyer, { productId: product.id, quantity: 50 }).expect(201);
    const line = res.body.calculation.items.find((i: any) => i.productId === product.id);
    expect(line.quantity).toBe(50);
  });

  scenario('CRT-013', async () => {
    const product = await makeProduct();
    await request(server()).post('/api/cart/items').send({ productId: product.id }).expect(401);
  });

  // ════════════════════════════ PATCH /api/cart/items/:productId ════════════════════════════

  scenario('CRT-014', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 100, quantity: 5 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    const res = await request(server())
      .patch(`/api/cart/items/${product.id}`)
      .set(authHeader(buyer))
      .send({ quantity: 3 })
      .expect(200);
    const line = res.body.calculation.items.find((i: any) => i.productId === product.id);
    expect(line.quantity).toBe(3);
    expect(line.lineTotal).toBe(300);
  });

  scenario('CRT-015', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    await addItem(buyer, { productId: product.id, quantity: 2 }).expect(201);
    const res = await request(server())
      .patch(`/api/cart/items/${product.id}`)
      .set(authHeader(buyer))
      .send({ quantity: 0 })
      .expect(200);
    expect(res.body.calculation.items.find((i: any) => i.productId === product.id)).toBeUndefined();
  });

  scenario('CRT-016', async () => {
    // product.quantity=2 → PATCH quantity=5 → 400 "Stokta sadece 2 adet var"; adet 1'de kalır
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 2 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    const res = await request(server())
      .patch(`/api/cart/items/${product.id}`)
      .set(authHeader(buyer))
      .send({ quantity: 5 })
      .expect(400);
    expect(String(res.body.message)).toContain('Stokta sadece 2 adet var');
    const cart = await getCart(buyer).expect(200);
    expect(cart.body.calculation.items.find((i: any) => i.productId === product.id).quantity).toBe(1);
  });

  scenario('CRT-017', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 50, maxQuantityPerOrder: 3 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    const res = await request(server())
      .patch(`/api/cart/items/${product.id}`)
      .set(authHeader(buyer))
      .send({ quantity: 4 })
      .expect(400);
    expect(String(res.body.message)).toContain('Bu üründen maksimum 3 adet alabilirsiniz');
  });

  scenario('CRT-018', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    const res = await request(server())
      .patch(`/api/cart/items/${product.id}`)
      .set(authHeader(buyer))
      .send({ quantity: 2 })
      .expect(404);
    expect(String(res.body.message)).toContain('Ürün sepette bulunamadı');
  });

  // ════════════════════════════ DELETE item / DTO biçim ════════════════════════════

  scenario('CRT-019', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    await addItem(buyer, { productId: product.id }).expect(201);
    const res = await request(server())
      .delete(`/api/cart/items/${product.id}`)
      .set(authHeader(buyer))
      .expect(200);
    expect(res.body.calculation.items.find((i: any) => i.productId === product.id)).toBeUndefined();
  });

  scenario('CRT-020', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    const res = await request(server())
      .delete(`/api/cart/items/${product.id}`)
      .set(authHeader(buyer))
      .expect(404);
    expect(String(res.body.message)).toContain('Ürün sepette bulunamadı');
  });

  scenario('CRT-021', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    await addItem(buyer, { productId: product.id, quantity: 2 }).expect(201);
    // 1) quantity=-1 → @Min(0) → 400
    await request(server())
      .patch(`/api/cart/items/${product.id}`)
      .set(authHeader(buyer))
      .send({ quantity: -1 })
      .expect(400);
    // 2) quantity=100 → @Max(99) → 400
    await request(server())
      .patch(`/api/cart/items/${product.id}`)
      .set(authHeader(buyer))
      .send({ quantity: 100 })
      .expect(400);
    // 3) quantity="" → Transform boş→0 → satır kaldırılır, 200
    const res = await request(server())
      .patch(`/api/cart/items/${product.id}`)
      .set(authHeader(buyer))
      .send({ quantity: '' })
      .expect(200);
    expect(res.body.calculation.items.find((i: any) => i.productId === product.id)).toBeUndefined();
  });

  // ════════════════════════════ GET /cart , /cart/calculation , DELETE /cart ════════════════════════════

  scenario('CRT-022', async () => {
    const buyer = await createUser(ctx.module);
    const res = await getCart(buyer).expect(200);
    const c = res.body.calculation;
    expect(c.items).toEqual([]);
    expect(c.itemCount).toBe(0);
    expect(c.subtotal).toBe(0);
    expect(c.grandTotal).toBe(0);
    expect(c.shippingCost).toBe(0);
  });

  scenario('CRT-023', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 400, quantity: 5 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    const res = await request(server())
      .get('/api/cart/calculation')
      .set(authHeader(buyer))
      .expect(200);
    expect(res.body.subtotal).toBe(400);
    expect(res.body.grandTotal).toBeGreaterThan(0);
    expect(res.body.items).toHaveLength(1);
  });

  scenario('CRT-024', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    await addItem(buyer, { productId: product.id }).expect(201);
    await addCoupon();
    await request(server()).post('/api/cart/coupon').set(authHeader(buyer)).send({ code: 'INDIRIM10' });

    const clearRes = await request(server()).delete('/api/cart').set(authHeader(buyer));
    expect([200, 204]).toContain(clearRes.status);

    const cart = await getCart(buyer).expect(200);
    expect(cart.body.calculation.items).toEqual([]);
    expect(cart.body.couponCode ?? null).toBeNull();
  });

  scenario('CRT-025', async () => {
    await request(server()).get('/api/cart').expect(401);
    await request(server()).get('/api/cart/calculation').expect(401);
  });

  // ════════════════════════════ Stok/uyarı & fiyat değişimi (GET hesabı) ════════════════════════════

  scenario('CRT-026', async () => {
    // quantity=3, sonra reservedQuantity=2 → available=1 → "Stokta sadece 1 adet var", isAvailable=true
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 3 });
    await addItem(buyer, { productId: product.id, quantity: 3 }).expect(201);
    const prisma = getPrisma();
    await prisma.product.update({ where: { id: product.id }, data: { reservedQuantity: 2 } });

    const res = await getCart(buyer).expect(200);
    const line = res.body.calculation.items.find((i: any) => i.productId === product.id);
    expect(line.stockWarning).toBe('Stokta sadece 1 adet var');
    expect(line.isAvailable).toBe(true);
    expect(line.quantity).toBe(3); // istemci değeri korunur
  });

  scenario('CRT-027', async () => {
    // Stok 0'a düşer → isAvailable=false, stockWarning="Stokta yok"; warnings'te "artık satışta değil"
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 3 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    const prisma = getPrisma();
    await prisma.product.update({ where: { id: product.id }, data: { quantity: 0 } });

    const res = await getCart(buyer).expect(200);
    const line = res.body.calculation.items.find((i: any) => i.productId === product.id);
    expect(line.isAvailable).toBe(false);
    expect(line.stockWarning).toBe('Stokta yok');
    expect(res.body.calculation.warnings.some((w: string) => w.includes('artık satışta değil'))).toBe(true);
  });

  scenario('CRT-028', async () => {
    // available<=5 → "Son birkaç ürün!", isAvailable=true
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 4 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    const res = await getCart(buyer).expect(200);
    const line = res.body.calculation.items.find((i: any) => i.productId === product.id);
    expect(line.stockWarning).toBe('Son birkaç ürün!');
    expect(line.isAvailable).toBe(true);
  });

  scenario('CRT-029', async () => {
    // Ürün sold → isAvailable=false; warnings'te "artık satışta değil" (otomatik silinmez)
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 3 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    const prisma = getPrisma();
    await prisma.product.update({ where: { id: product.id }, data: { status: 'sold' as any } });

    const res = await getCart(buyer).expect(200);
    const line = res.body.calculation.items.find((i: any) => i.productId === product.id);
    expect(line).toBeTruthy();
    expect(line.isAvailable).toBe(false);
    expect(res.body.calculation.warnings.some((w: string) => w.includes('artık satışta değil'))).toBe(true);
  });

  scenario('CRT-030', async () => {
    // Fiyat 250→300 değişir → originalPrice=300, effectivePrice=300 (fiyat dondurulmaz)
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 250, quantity: 5 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    const prisma = getPrisma();
    await prisma.product.update({ where: { id: product.id }, data: { price: new Prisma.Decimal(300) } });

    const res = await getCart(buyer).expect(200);
    const line = res.body.calculation.items.find((i: any) => i.productId === product.id);
    expect(line.originalPrice).toBe(300);
    expect(line.effectivePrice).toBe(300);
    expect(line.lineTotal).toBe(300);
  });

  scenario('CRT-031', async () => {
    // Kampanya: price=200, fixed 50 indirim → effectivePrice=150, productDiscount(2adet)=100
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 200, quantity: 5 });
    await addProductCampaign({ productId: product.id, type: 'fixed_amount', value: 50 });
    await addItem(buyer, { productId: product.id, quantity: 2 }).expect(201);

    const res = await getCart(buyer).expect(200);
    const line = res.body.calculation.items.find((i: any) => i.productId === product.id);
    expect(line.originalPrice).toBe(200);
    expect(line.salePrice).toBe(150);
    expect(line.effectivePrice).toBe(150);
    expect(line.productDiscount).toBe(100); // 2 × 50
    expect(line.lineTotal).toBe(300);
    expect(res.body.calculation.productDiscountTotal).toBe(100);
  });

  // ════════════════════════════ Kupon (POST/DELETE /cart/coupon) ════════════════════════════

  scenario('CRT-032', async () => {
    // Geçerli kupon → 200, couponCode upper-case, couponDiscountTotal>0
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 200, quantity: 5 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    await addCoupon({ code: 'indirim10', type: 'percentage', value: 10, scope: 'global' });

    const res = await request(server())
      .post('/api/cart/coupon')
      .set(authHeader(buyer))
      .send({ code: 'indirim10' })
      .expect(200);
    expect(res.body.couponCode).toBe('INDIRIM10');
    expect(res.body.calculation.couponDiscountTotal).toBeGreaterThan(0);
    expect(res.body.calculation.appliedDiscounts.length).toBeGreaterThanOrEqual(1);
    expect(res.body.calculation.grandTotal).toBeLessThan(
      res.body.calculation.subtotal + res.body.calculation.shippingCost,
    );
  });

  scenario('CRT-033', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 200, quantity: 5 });
    await addItem(buyer, { productId: product.id }).expect(201);
    const res = await request(server())
      .post('/api/cart/coupon')
      .set(authHeader(buyer))
      .send({ code: 'TOTALLY-FAKE-COUPON' });
    expect([400, 404]).toContain(res.status);
  });

  scenario('CRT-034', async () => {
    // Boş kod + boş sepet → 400 (sepet boş kontrolü kupon doğrulamadan önce çalışır)
    const buyer = await createUser(ctx.module);
    await request(server())
      .post('/api/cart/coupon')
      .set(authHeader(buyer))
      .send({ code: '' })
      .expect(400);
  });

  scenario('CRT-035', async () => {
    const buyer = await createUser(ctx.module);
    await addCoupon();
    const res = await request(server())
      .post('/api/cart/coupon')
      .set(authHeader(buyer))
      .send({ code: 'INDIRIM10' })
      .expect(400);
    expect(String(res.body.message)).toContain('Sepetiniz boş');
  });

  scenario('CRT-036', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 200, quantity: 5 });
    await addItem(buyer, { productId: product.id }).expect(201);
    await addCoupon();
    await request(server()).post('/api/cart/coupon').set(authHeader(buyer)).send({ code: 'INDIRIM10' }).expect(200);

    const res = await request(server()).delete('/api/cart/coupon').set(authHeader(buyer)).expect(200);
    expect(res.body.couponCode ?? null).toBeNull();
    expect(res.body.calculation.couponDiscountTotal).toBe(0);
  });

  scenario('CRT-037', async () => {
    const buyer = await createUser(ctx.module);
    const r1 = await request(server()).delete('/api/cart/coupon').set(authHeader(buyer));
    expect([200, 204]).toContain(r1.status);
    const r2 = await request(server()).delete('/api/cart/coupon').set(authHeader(buyer));
    expect([200, 204]).toContain(r2.status);
  });

  scenario('CRT-038', async () => {
    // %50 indirim tavanı: subtotal=100, %100 kupon → totalDiscount 50'de kapanır + uyarı
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 100, quantity: 5 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    await addCoupon({ code: 'YARIM', type: 'percentage', value: 100, scope: 'global' });
    const res = await request(server())
      .post('/api/cart/coupon')
      .set(authHeader(buyer))
      .send({ code: 'YARIM' })
      .expect(200);
    expect(res.body.calculation.totalDiscount).toBe(50); // 100 × %50 tavan
    expect(
      res.body.calculation.warnings.some((w: string) => w.includes('Maksimum indirim limitine ulaşıldı')),
    ).toBe(true);
  });

  scenario('CRT-039', async () => {
    // Kupon başka satıcının ürünlerine kapsamlı → sepetteki ürüne uygulanamaz.
    // applyCoupon önce validateCoupon'dan geçer (geçer: kod aktif/tarih ok), sonra
    // calculateCart içinde eligibleAmount=0 → couponDiscountTotal=0 + uyarı.
    const buyer = await createUser(ctx.module);
    const otherSeller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ price: 200, quantity: 5 }); // farklı satıcı
    await addItem(buyer, { productId: product.id }).expect(201);
    // seller-kapsamlı kupon, ürünün satıcısına AİT DEĞİL → uygulanamaz
    await addCoupon({ code: 'SELLERONLY', scope: 'seller', sellerId: otherSeller.id, value: 10 });

    const res = await request(server())
      .post('/api/cart/coupon')
      .set(authHeader(buyer))
      .send({ code: 'SELLERONLY' });
    if (res.status === 200) {
      expect(res.body.calculation.couponDiscountTotal).toBe(0);
      expect(
        res.body.calculation.warnings.some((w: string) =>
          w.includes('sepetinizdeki ürünlere uygulanamaz'),
        ),
      ).toBe(true);
    } else {
      expect([400, 404]).toContain(res.status);
    }
  });

  // ════════════════════════════ Kargo / grandTotal ════════════════════════════

  scenario('CRT-040', async () => {
    // subtotal>=500 → ücretsiz kargo
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 500, quantity: 5 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    const res = await getCart(buyer).expect(200);
    expect(res.body.calculation.shippingCost).toBe(0);
    expect(res.body.calculation.amountToFreeShipping).toBe(0);
  });

  scenario('CRT-041', async () => {
    // subtotal=300 (<500) → kargo 29.99, amountToFreeShipping=200, grandTotal=329.99
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 300, quantity: 5 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    const res = await getCart(buyer).expect(200);
    const c = res.body.calculation;
    expect(c.shippingCost).toBe(29.99);
    expect(c.amountToFreeShipping).toBe(200);
    expect(c.grandTotal).toBeCloseTo(329.99, 2);
  });

  scenario('CRT-042', async () => {
    // grandTotal asla negatif olmaz (Math.max(0, ...))
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 100, quantity: 5 });
    await addItem(buyer, { productId: product.id, quantity: 1 }).expect(201);
    await addCoupon({ code: 'YARIM', type: 'percentage', value: 100, scope: 'global' });
    await request(server()).post('/api/cart/coupon').set(authHeader(buyer)).send({ code: 'YARIM' }).expect(200);
    const res = await getCart(buyer).expect(200);
    expect(res.body.calculation.grandTotal).toBeGreaterThanOrEqual(0);
  });

  // ════════════════════════════ Checkout quote (POST /orders/quote) ════════════════════════════

  scenario('CRT-043', async () => {
    // Bireysel satıcı → taxAmount=0; buyerFee kuralı %3 → buyerFeeAmount>0
    await addCommissionRule({ appliesTo: 'BUYER', buyerRate: 3 });
    const product = await makeProduct({ price: 100, quantity: 5 });
    const res = await request(server())
      .post('/api/orders/quote')
      .send({ items: [{ productId: product.id, quantity: 1 }] })
      .expect(201);
    expect(res.body.pricing.taxAmount).toBe(0);
    expect(res.body.pricing.buyerFeeAmount).toBeGreaterThan(0);
    const pr = res.body.pricing;
    expect(pr.totalAmount).toBeCloseTo(pr.subtotal + pr.shippingAmount + pr.buyerFeeAmount + pr.taxAmount, 2);
  });

  scenario('CRT-044', async () => {
    // Kurumsal satıcı → taxAmount>0, total KDV dahil
    const seller = await createUser(ctx.module, { isSeller: true });
    await setupCorporateTax(seller.id);
    const product = await makeProduct({ sellerId: seller.id, price: 1000, quantity: 5 });
    const res = await request(server())
      .post('/api/orders/quote')
      .send({ items: [{ productId: product.id, quantity: 1 }] })
      .expect(201);
    expect(res.body.pricing.taxAmount).toBeGreaterThan(0);
    const pr = res.body.pricing;
    expect(pr.totalAmount).toBeCloseTo(pr.subtotal + pr.shippingAmount + pr.buyerFeeAmount + pr.taxAmount, 2);
  });

  scenario('CRT-045', async () => {
    // Parite'nin API tarafı: buyerRate=%3 kuralında checkout özetini besleyen
    // quote.pricing.buyerFeeAmount = subtotal × %3 ve satır kalemindeki buyerFeeAmount.
    // ("Platform Hizmet Bedeli (%3)" satırının GÖRÜNÜRLÜĞÜ saf-UI'dir → PAR/web tarafında.)
    await addCommissionRule({ appliesTo: 'BUYER', buyerRate: 3 });
    const product = await makeProduct({ price: 200, quantity: 5 });
    const res = await request(server())
      .post('/api/orders/quote')
      .send({ items: [{ productId: product.id, quantity: 1 }] })
      .expect(201);
    const pr = res.body.pricing;
    expect(pr.subtotal).toBe(200);
    // %3 alıcı hizmet bedeli: 200 × 0.03 = 6
    expect(pr.buyerFeeAmount).toBeCloseTo(6, 2);
    expect(typeof pr.buyerFeeAmount).toBe('number');
    // Satır kaleminde de aynı bedel yansır (özet kartındaki satır kaynağı)
    expect(res.body.items[0].buyerFeeAmount).toBeCloseTo(6, 2);
    // Toplam = Ara Toplam + Kargo + Hizmet Bedeli + KDV
    expect(pr.totalAmount).toBeCloseTo(pr.subtotal + pr.shippingAmount + pr.buyerFeeAmount + pr.taxAmount, 2);
  });

  scenario('CRT-046', async () => {
    // Çok-adetli ölçekleme: price=100, quantity=3 → items[0].subtotal=300, itemsSubtotal=300
    const product = await makeProduct({ price: 100, quantity: 10 });
    const res = await request(server())
      .post('/api/orders/quote')
      .send({ items: [{ productId: product.id, quantity: 3 }] })
      .expect(201);
    expect(res.body.items[0].subtotal).toBe(300);
    expect(res.body.itemsSubtotal).toBe(300);
  });

  scenario('CRT-047', async () => {
    const product = await makeProduct({ status: 'sold' });
    const res = await request(server())
      .post('/api/orders/quote')
      .send({ items: [{ productId: product.id }] })
      .expect(400);
    expect(String(res.body.message)).toContain('satışta değil');
  });

  scenario('CRT-048', async () => {
    const res = await request(server()).post('/api/orders/quote').send({ items: [] }).expect(400);
    expect(String(res.body.message)).toContain('En az bir ürün gereklidir');
  });

  // ════════════════════════════ Misafir sepet/parite (CRT-049..052) — saf web ════════════════════════════

  scenarioSkip(
    'CRT-049',
    'Saf-UI: misafir sepeti localStorage (cart-storage / offlineItems) tarafından tutulur; backend POST /api/cart/items çağrılmaz (401). API kapsamı yok.',
  );
  scenarioSkip(
    'CRT-050',
    'Saf-UI: misafir offline kargo eşiği store içinde hesaplanır; backend uç yok.',
  );
  scenarioSkip(
    'CRT-051',
    'Saf-UI/akış: giriş sonrası offline sepetin POST /api/cart/items ile senkronu web client tarafından sürülür; tek başına API senaryosu değil (her bir ekleme CRT-001..013 ile kapsanır).',
  );
  scenarioSkip(
    'CRT-052',
    'Saf-UI/i18n: /cart sayfasında misafir "Hızlı ödeme için giriş yapın" CTA metni ve /login?redirect=/cart linki.',
  );

  // ════════════════════════════ Üye checkout (POST /orders/checkout) ════════════════════════════

  scenario('CRT-053', async () => {
    // Tek satıcı tek ürün → 201, 1 grup, 1 sipariş pending_payment, reservedQuantity++
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 250, quantity: 5 });
    const address = await createAddress({ userId: buyer.id });
    const key = uuid();

    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({ items: [{ productId: product.id }], idempotencyKey: key, shippingAddressId: address.id })
      .expect(201);
    expect(res.body.checkoutGroupId).toBeTruthy();
    expect(String(res.body.groupNumber)).toMatch(/^GRP/);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].orderId).toBeTruthy();
    expect(res.body.totalAmount).toBe(res.body.orders[0].totalAmount);

    const prisma = getPrisma();
    const groups = await prisma.checkoutGroup.count({ where: { id: res.body.checkoutGroupId } });
    expect(groups).toBe(1);
    const order = await prisma.order.findFirst({ where: { checkoutGroupId: res.body.checkoutGroupId } });
    expect(order?.status).toBe('pending_payment');
    expect(order?.checkoutGroupId).toBe(res.body.checkoutGroupId);
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.reservedQuantity).toBe(1);
  });

  scenario('CRT-054', async () => {
    // Çok-satıcılı: 2 ürün farklı satıcı → 1 grup + 2 sipariş, ikisi de aynı checkoutGroupId
    const buyer = await createUser(ctx.module);
    const s1 = await createUser(ctx.module, { isSeller: true });
    const s2 = await createUser(ctx.module, { isSeller: true });
    const p1 = await makeProduct({ sellerId: s1.id, price: 100, quantity: 5 });
    const p2 = await makeProduct({ sellerId: s2.id, price: 200, quantity: 5 });
    const address = await createAddress({ userId: buyer.id });

    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({
        items: [{ productId: p1.id }, { productId: p2.id }],
        idempotencyKey: uuid(),
        shippingAddressId: address.id,
      })
      .expect(201);
    expect(res.body.orders).toHaveLength(2);

    const prisma = getPrisma();
    const orders = await prisma.order.findMany({ where: { checkoutGroupId: res.body.checkoutGroupId } });
    expect(orders).toHaveLength(2);
    const sellerIds = orders.map((o) => o.sellerId).sort();
    expect(sellerIds).toEqual([s1.id, s2.id].sort());
    const sum = orders.reduce((acc, o) => acc + Number(o.totalAmount), 0);
    expect(res.body.totalAmount).toBeCloseTo(sum, 2);
    const pr1 = await prisma.product.findUnique({ where: { id: p1.id } });
    const pr2 = await prisma.product.findUnique({ where: { id: p2.id } });
    expect(pr1?.reservedQuantity).toBe(1);
    expect(pr2?.reservedQuantity).toBe(1);
  });

  scenario('CRT-055', async () => {
    // quantity=3 → tek sipariş quantity=3, reservedQuantity 3 artar, subtotal=birim×3
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 100, quantity: 10 });
    const address = await createAddress({ userId: buyer.id });
    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({
        items: [{ productId: product.id, quantity: 3 }],
        idempotencyKey: uuid(),
        shippingAddressId: address.id,
      })
      .expect(201);
    expect(res.body.orders).toHaveLength(1);
    const prisma = getPrisma();
    const order = await prisma.order.findFirst({ where: { checkoutGroupId: res.body.checkoutGroupId } });
    expect(order?.quantity).toBe(3);
    expect(Number(order?.subtotal)).toBe(300);
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.reservedQuantity).toBe(3);
  });

  scenario('CRT-056', async () => {
    // İki ürün, biri stoksuz → tüm grup iptal (atomik); 400 + body.productId; ne grup ne rezervasyon
    const buyer = await createUser(ctx.module);
    const ok = await makeProduct({ price: 100, quantity: 5 });
    const noStock = await makeProduct({ price: 100, quantity: 1 });
    const address = await createAddress({ userId: buyer.id });

    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({
        items: [{ productId: ok.id }, { productId: noStock.id, quantity: 2 }],
        idempotencyKey: uuid(),
        shippingAddressId: address.id,
      })
      .expect(400);
    expect(res.body.productId).toBe(noStock.id);
    expect(String(res.body.message)).toContain('yeterli stok yok');

    const prisma = getPrisma();
    expect(await prisma.checkoutGroup.count()).toBe(0);
    expect(await prisma.order.count()).toBe(0);
    const okProd = await prisma.product.findUnique({ where: { id: ok.id } });
    expect(okProd?.reservedQuantity).toBe(0); // P1 rezerve edilmedi (rollback)
  });

  scenario('CRT-057', async () => {
    // Satılmış/pasif ürün → 400, body.productId, mesaj "satışta değil veya başkası tarafından..."
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ status: 'sold', quantity: 1 });
    const address = await createAddress({ userId: buyer.id });
    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({ items: [{ productId: product.id }], idempotencyKey: uuid(), shippingAddressId: address.id })
      .expect(400);
    expect(res.body.productId).toBe(product.id);
    expect(String(res.body.message)).toContain('satışta değil');
  });

  scenario('CRT-058', async () => {
    // Adres yok → 400 "Teslimat adresi gereklidir (shippingAddressId veya shippingAddress)"
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({ items: [{ productId: product.id }], idempotencyKey: uuid() })
      .expect(400);
    expect(String(res.body.message)).toContain('Teslimat adresi gereklidir');
  });

  scenario('CRT-059', async () => {
    // Başkasının kayıtlı adres ID'si → 400 "Geçersiz teslimat adresi"
    const buyer = await createUser(ctx.module);
    const other = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    const otherAddr = await createAddress({ userId: other.id });
    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({ items: [{ productId: product.id }], idempotencyKey: uuid(), shippingAddressId: otherAddr.id })
      .expect(400);
    expect(String(res.body.message)).toContain('Geçersiz teslimat adresi');
  });

  scenario('CRT-060', async () => {
    // Inline adres → 201, yeni Address kaydı oluşur (üye için)
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({
        items: [{ productId: product.id }],
        idempotencyKey: uuid(),
        shippingAddress: validInlineAddress(),
      })
      .expect(201);
    expect(res.body.orders).toHaveLength(1);
    const prisma = getPrisma();
    const addresses = await prisma.address.findMany({ where: { userId: buyer.id } });
    expect(addresses.length).toBeGreaterThanOrEqual(1);
    const order = await prisma.order.findFirst({ where: { checkoutGroupId: res.body.checkoutGroupId } });
    expect(order?.shippingAddressId).toBeTruthy();
  });

  scenario('CRT-061', async () => {
    // Inline adreste city sadece boşluk → DTO @IsNotEmpty geçer (boş string DEĞİL),
    // servis .trim() kontrolü → 400 "Teslimat adresi için şehir gereklidir".
    // NOT: city:'' gönderilirse CheckoutAddressDto @IsNotEmpty() DTO düzeyinde
    // "city should not be empty" ile 400 verir ve servis mesajına ulaşılamaz;
    // bu yüzden whitespace ('  ') ile servis dalını test ederiz.
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({
        items: [{ productId: product.id }],
        idempotencyKey: uuid(),
        shippingAddress: validInlineAddress({ city: '  ' }),
      })
      .expect(400);
    expect(String(res.body.message)).toContain('şehir gereklidir');
  });

  scenario('CRT-062', async () => {
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 50 });
    const address = await createAddress({ userId: buyer.id });
    // 1) items boş → 400
    const r1 = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({ items: [], idempotencyKey: uuid(), shippingAddressId: address.id })
      .expect(400);
    expect(String(r1.body.message)).toContain('En az bir ürün gereklidir');
    // 2) 21 ürün → 400
    const items = Array.from({ length: 21 }, () => ({ productId: product.id }));
    const r2 = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({ items, idempotencyKey: uuid(), shippingAddressId: address.id })
      .expect(400);
    expect(String(r2.body.message)).toContain('en fazla 20 ürün');
  });

  scenario('CRT-063', async () => {
    // CheckoutItem quantity=21 → DTO @Max(20) → 400
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 50 });
    const address = await createAddress({ userId: buyer.id });
    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({
        items: [{ productId: product.id, quantity: 21 }],
        idempotencyKey: uuid(),
        shippingAddressId: address.id,
      })
      .expect(400);
    expect(String(res.body.message)).toContain('en fazla 20 adet');
  });

  scenario('CRT-064', async () => {
    // idempotencyKey UUID değil → 400
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    const address = await createAddress({ userId: buyer.id });
    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({ items: [{ productId: product.id }], idempotencyKey: 'not-a-uuid', shippingAddressId: address.id })
      .expect(400);
    expect(String(res.body.message)).toContain('idempotency');
  });

  scenario('CRT-065', async () => {
    // Banlı kullanıcı → 403
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    const address = await createAddress({ userId: buyer.id });
    const prisma = getPrisma();
    await prisma.user.update({ where: { id: buyer.id }, data: { isBanned: true } });
    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({ items: [{ productId: product.id }], idempotencyKey: uuid(), shippingAddressId: address.id })
      .expect(403);
    expect(String(res.body.message)).toContain('banlanmış');
  });

  scenario('CRT-066', async () => {
    // Kendi ürünü → 403 "Kendi ürününüzü satın alamazsınız"
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: seller.id, quantity: 5 });
    const address = await createAddress({ userId: seller.id });
    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(seller))
      .send({ items: [{ productId: product.id }], idempotencyKey: uuid(), shippingAddressId: address.id })
      .expect(403);
    expect(String(res.body.message)).toContain('Kendi ürününüzü satın alamazsınız');
  });

  scenario('CRT-067', async () => {
    // Kupon orantılı dağıtım: P1(200)+P2(300), %10 global kupon → ~50 TL; P1≈20, P2≈30
    const buyer = await createUser(ctx.module);
    const s1 = await createUser(ctx.module, { isSeller: true });
    const s2 = await createUser(ctx.module, { isSeller: true });
    const p1 = await makeProduct({ sellerId: s1.id, price: 200, quantity: 5 });
    const p2 = await makeProduct({ sellerId: s2.id, price: 300, quantity: 5 });
    const address = await createAddress({ userId: buyer.id });
    await addCoupon({ code: 'INDIRIM10', type: 'percentage', value: 10, scope: 'global' });

    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({
        items: [{ productId: p1.id }, { productId: p2.id }],
        idempotencyKey: uuid(),
        shippingAddressId: address.id,
        couponCode: 'INDIRIM10',
      })
      .expect(201);

    const prisma = getPrisma();
    const o1 = await prisma.order.findFirst({ where: { checkoutGroupId: res.body.checkoutGroupId, productId: p1.id } });
    const o2 = await prisma.order.findFirst({ where: { checkoutGroupId: res.body.checkoutGroupId, productId: p2.id } });
    expect(Number(o1?.discountAmount)).toBeCloseTo(20, 2);
    expect(Number(o2?.discountAmount)).toBeCloseTo(30, 2);
    expect(o1?.discountCode).toBe('INDIRIM10');
    expect(o2?.discountCode).toBe('INDIRIM10');
    const totalDiscount = Number(o1?.discountAmount) + Number(o2?.discountAmount);
    expect(totalDiscount).toBeCloseTo(50, 2);
  });

  scenarioSkip(
    'CRT-068',
    'Saf-UI/akış: checkout sonrası ödeme yönlendirmesi öncesi web client DELETE /api/cart çağırır; DELETE /api/cart davranışı CRT-024 ile kapsanır, "checkout sonrası temizlik" web orkestrasyonudur.',
  );

  scenario('CRT-069', async () => {
    // Aynı idempotencyKey replay → aynı grup, existingGroup:true, yeni sipariş/rezervasyon yok
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 100, quantity: 5 });
    const address = await createAddress({ userId: buyer.id });
    const key = uuid();
    const r1 = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({ items: [{ productId: product.id }], idempotencyKey: key, shippingAddressId: address.id })
      .expect(201);
    const r2 = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({ items: [{ productId: product.id }], idempotencyKey: key, shippingAddressId: address.id })
      .expect(201);
    expect(r2.body.checkoutGroupId).toBe(r1.body.checkoutGroupId);
    expect(r2.body.existingGroup).toBe(true);

    const prisma = getPrisma();
    expect(await prisma.checkoutGroup.count()).toBe(1);
    expect(await prisma.order.count()).toBe(1);
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.reservedQuantity).toBe(1); // çift rezervasyon yok
  });

  scenario('CRT-070', async () => {
    // Başka alıcının idempotencyKey'i → 403 "Bu işlem size ait değil"
    const buyerA = await createUser(ctx.module);
    const buyerB = await createUser(ctx.module);
    const product = await makeProduct({ price: 100, quantity: 5 });
    const addrA = await createAddress({ userId: buyerA.id });
    const addrB = await createAddress({ userId: buyerB.id });
    const key = uuid();
    await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyerA))
      .send({ items: [{ productId: product.id }], idempotencyKey: key, shippingAddressId: addrA.id })
      .expect(201);
    const res = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyerB))
      .send({ items: [{ productId: product.id }], idempotencyKey: key, shippingAddressId: addrB.id })
      .expect(403);
    expect(String(res.body.message)).toContain('Bu işlem size ait değil');
  });

  scenario('CRT-071', async () => {
    // Çift tıklama: aynı key ile hızlı ardışık iki istek → tek grup
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 100, quantity: 5 });
    const address = await createAddress({ userId: buyer.id });
    const key = uuid();
    const fire = () =>
      request(server())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({ items: [{ productId: product.id }], idempotencyKey: key, shippingAddressId: address.id });
    const [r1, r2] = await Promise.all([fire(), fire()]);
    expect([r1.status, r2.status].every((s) => [201].includes(s))).toBe(true);
    const groupIds = new Set([r1.body.checkoutGroupId, r2.body.checkoutGroupId]);
    expect(groupIds.size).toBe(1); // @unique idempotencyKey → tek grup
    const prisma = getPrisma();
    expect(await prisma.checkoutGroup.count()).toBe(1);
  });

  scenario('CRT-072', async () => {
    // Eski pending sipariş rezervasyonu yeni checkout'ta serbest bırakılır; "stokta yok" olmaz
    const buyer = await createUser(ctx.module);
    const product = await makeProduct({ price: 100, quantity: 1 });
    const address = await createAddress({ userId: buyer.id });
    const r1 = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({ items: [{ productId: product.id }], idempotencyKey: uuid(), shippingAddressId: address.id })
      .expect(201);

    // Yeni idempotencyKey ile aynı ürünü tekrar checkout et — eski pending cancel + rezervasyon decrement
    const r2 = await request(server())
      .post('/api/orders/checkout')
      .set(authHeader(buyer))
      .send({ items: [{ productId: product.id }], idempotencyKey: uuid(), shippingAddressId: address.id })
      .expect(201);
    expect(r2.body.checkoutGroupId).not.toBe(r1.body.checkoutGroupId);

    const prisma = getPrisma();
    const firstOrder = await prisma.order.findFirst({ where: { checkoutGroupId: r1.body.checkoutGroupId } });
    expect(firstOrder?.status).toBe('cancelled');
    expect(firstOrder?.cancelReason).toContain('Yeni toplu sipariş ile değiştirildi');
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.reservedQuantity).toBe(1); // eski 1 düştü, yeni 1 eklendi
  });

  scenario('CRT-073', async () => {
    // İki alıcı son tek stoğu eşzamanlı checkout → biri 201, biri 400 (yeterli stok yok)
    const buyerA = await createUser(ctx.module);
    const buyerB = await createUser(ctx.module);
    const product = await makeProduct({ price: 100, quantity: 1 });
    const addrA = await createAddress({ userId: buyerA.id });
    const addrB = await createAddress({ userId: buyerB.id });
    const fire = (buyer: { accessToken: string }, addrId: string) =>
      request(server())
        .post('/api/orders/checkout')
        .set(authHeader(buyer))
        .send({ items: [{ productId: product.id }], idempotencyKey: uuid(), shippingAddressId: addrId });
    const [rA, rB] = await Promise.all([fire(buyerA, addrA.id), fire(buyerB, addrB.id)]);
    const codes = [rA.status, rB.status].sort();
    expect(codes).toEqual([201, 400]);
    const failing = [rA, rB].find((r) => r.status === 400)!;
    expect(failing.body.productId).toBe(product.id);

    const prisma = getPrisma();
    const orders = await prisma.order.findMany({ where: { productId: product.id, status: 'pending_payment' } });
    expect(orders).toHaveLength(1);
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p?.reservedQuantity).toBe(1);
  });

  // ════════════════════════════ Misafir checkout OTP (CRT-074..079) ════════════════════════════

  scenario('CRT-074', async () => {
    // OTP gönder → 200 { success, expiresInSeconds }; MailHog'a 6 haneli kod düşer
    await clearMailbox();
    const guestEmail = `guest-${Date.now()}@external.test`;
    const res = await request(server())
      .post('/api/orders/guest/send-verification-code')
      .send({ email: guestEmail, expectedCheckoutCount: 1 })
      .expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.expiresInSeconds).toBeGreaterThan(0);

    const mail = await getLastEmailTo(guestEmail);
    const code = extractCode(mail.body, 6);
    expect(code).toMatch(/^\d{6}$/);
  });

  scenario('CRT-075', async () => {
    // OTP doğru → misafir toplu checkout 201; shippingAddress JSON'da isGuestOrder:true, guestEmail set
    await clearMailbox();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: seller.id, price: 120, quantity: 5 });
    const guestEmail = `guest-${Date.now()}@external.test`;

    await request(server())
      .post('/api/orders/guest/send-verification-code')
      .send({ email: guestEmail, expectedCheckoutCount: 1 })
      .expect(200);
    const mail = await getLastEmailTo(guestEmail);
    const code = extractCode(mail.body, 6)!;
    expect(code).toMatch(/^\d{6}$/);

    const res = await request(server())
      .post('/api/orders/checkout/guest')
      .send({
        items: [{ productId: product.id }],
        idempotencyKey: uuid(),
        email: guestEmail,
        emailVerificationCode: code,
        phone: '+905551234567',
        guestName: 'Misafir Test',
        shippingAddress: validInlineAddress(),
      })
      .expect(201);
    expect(res.body.checkoutGroupId).toBeTruthy();
    expect(res.body.orders).toHaveLength(1);

    const prisma = getPrisma();
    const group = await prisma.checkoutGroup.findUnique({ where: { id: res.body.checkoutGroupId } });
    expect(group?.isGuest).toBe(true);
    const order = await prisma.order.findFirst({ where: { checkoutGroupId: res.body.checkoutGroupId } });
    const addrJson = order?.shippingAddress as Record<string, unknown> | null;
    expect(addrJson?.isGuestOrder).toBe(true);
    expect(String(addrJson?.guestEmail).toLowerCase()).toBe(guestEmail.toLowerCase());
  });

  scenario('CRT-076', async () => {
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: seller.id, quantity: 5 });
    // 1) 6 hane olmayan kod ('123') → DTO @Matches(/^\d{6}$/) → 400
    await request(server())
      .post('/api/orders/checkout/guest')
      .send({
        items: [{ productId: product.id }],
        idempotencyKey: uuid(),
        email: `g-${Date.now()}@external.test`,
        emailVerificationCode: '123',
        phone: '+905551234567',
        guestName: 'Misafir',
        shippingAddress: validInlineAddress(),
      })
      .expect(400);
    // 2) yanlış 6 haneli kod (kod hiç üretilmedi) → consumeGuestCheckoutOtp 400
    const res2 = await request(server())
      .post('/api/orders/checkout/guest')
      .send({
        items: [{ productId: product.id }],
        idempotencyKey: uuid(),
        email: `g2-${Date.now()}@external.test`,
        emailVerificationCode: '000000',
        phone: '+905551234567',
        guestName: 'Misafir',
        shippingAddress: validInlineAddress(),
      })
      .expect(400);
    expect(String(res2.body.message)).toMatch(/Doğrulama kodu/);
  });

  scenario('CRT-077', async () => {
    // couponCode misafir → 400 "Kupon kodu misafir alışverişte desteklenmiyor".
    // NOT: kupon kontrolü OTP TÜKETİMİNDEN SONRA (createCheckoutGroup içinde) çalışır;
    // bu yüzden gerçek OTP üretip tüketilebilir kod göndeririz, yoksa consumeGuestCheckoutOtp
    // "Doğrulama kodu geçersiz..." ile daha önce patlar ve kupon dalına ulaşılamaz.
    await clearMailbox();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: seller.id, quantity: 5 });
    const guestEmail = `guest-${Date.now()}@external.test`;
    await request(server())
      .post('/api/orders/guest/send-verification-code')
      .send({ email: guestEmail, expectedCheckoutCount: 1 })
      .expect(200);
    const mail = await getLastEmailTo(guestEmail);
    const code = extractCode(mail.body, 6)!;
    expect(code).toMatch(/^\d{6}$/);

    const res = await request(server())
      .post('/api/orders/checkout/guest')
      .send({
        items: [{ productId: product.id }],
        idempotencyKey: uuid(),
        email: guestEmail,
        emailVerificationCode: code,
        phone: '+905551234567',
        guestName: 'Misafir',
        shippingAddress: validInlineAddress(),
        couponCode: 'INDIRIM10',
      })
      .expect(400);
    expect(String(res.body.message)).toContain('Kupon kodu misafir alışverişte desteklenmiyor');
  });

  scenario('CRT-078', async () => {
    // Idempotency replay: aynı key ile tekrar → aynı grup existingGroup:true, OTP yeniden tüketilmez
    await clearMailbox();
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await makeProduct({ sellerId: seller.id, price: 120, quantity: 5 });
    const guestEmail = `guest-${Date.now()}@external.test`;
    await request(server())
      .post('/api/orders/guest/send-verification-code')
      .send({ email: guestEmail, expectedCheckoutCount: 1 })
      .expect(200);
    const mail = await getLastEmailTo(guestEmail);
    const code = extractCode(mail.body, 6)!;
    const key = uuid();
    const body = {
      items: [{ productId: product.id }],
      idempotencyKey: key,
      email: guestEmail,
      emailVerificationCode: code,
      phone: '+905551234567',
      guestName: 'Misafir Test',
      shippingAddress: validInlineAddress(),
    };
    const r1 = await request(server()).post('/api/orders/checkout/guest').send(body).expect(201);
    // OTP tek-kullanımlık olabilir; replay yeni kod istemeden (idempotency OTP'den önce) aynı grubu döner
    const r2 = await request(server()).post('/api/orders/checkout/guest').send(body);
    expect([200, 201]).toContain(r2.status);
    expect(r2.body.checkoutGroupId).toBe(r1.body.checkoutGroupId);
    expect(r2.body.existingGroup).toBe(true);
  });

  scenario('CRT-079', async () => {
    // Kayıtlı e-posta ile misafir OTP → 409 EMAIL_ALREADY_REGISTERED
    const existing = await createUser(ctx.module, { email: `taken-${Date.now()}@demo.com` });
    const res = await request(server())
      .post('/api/orders/guest/send-verification-code')
      .send({ email: existing.email })
      .expect(409);
    expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  // ════════════════════════════ Sepet izolasyonu & 401 matrisi ════════════════════════════

  scenario('CRT-080', async () => {
    // B (ceren) A'nın itemini görmez
    const buyerA = await createUser(ctx.module);
    const buyerB = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    await addItem(buyerA, { productId: product.id }).expect(201);
    const res = await getCart(buyerB).expect(200);
    expect(res.body.calculation.items.find((i: any) => i.productId === product.id)).toBeUndefined();
    expect(res.body.calculation.itemCount).toBe(0);
  });

  scenario('CRT-081', async () => {
    // B, A'nın productId'siyle A'nın satırını silemez → B için 404; A etkilenmez
    const buyerA = await createUser(ctx.module);
    const buyerB = await createUser(ctx.module);
    const product = await makeProduct({ quantity: 5 });
    await addItem(buyerA, { productId: product.id }).expect(201);
    const res = await request(server())
      .delete(`/api/cart/items/${product.id}`)
      .set(authHeader(buyerB))
      .expect(404);
    expect(String(res.body.message)).toContain('Ürün sepette bulunamadı');
    const cartA = await getCart(buyerA).expect(200);
    expect(cartA.body.calculation.items.find((i: any) => i.productId === product.id)).toBeTruthy();
  });

  scenario('CRT-082', async () => {
    // Tüm cart uçları kimliksiz → 401
    await request(server()).get('/api/cart').expect(401);
    await request(server()).get('/api/cart/calculation').expect(401);
    await request(server()).post('/api/cart/items').send({ productId: ABSENT_UUID }).expect(401);
    await request(server()).patch(`/api/cart/items/${ABSENT_UUID}`).send({ quantity: 1 }).expect(401);
    await request(server()).delete(`/api/cart/items/${ABSENT_UUID}`).expect(401);
    await request(server()).post('/api/cart/coupon').send({ code: 'X' }).expect(401);
    await request(server()).delete('/api/cart/coupon').expect(401);
    await request(server()).delete('/api/cart').expect(401);
  });

  scenario('CRT-083', async () => {
    // Komisyon kuralına göre tutarlı sonuç: eşleşen kural yoksa fee=0 fallback (sabit değer iddia etmez)
    const product = await makeProduct({ price: 100, quantity: 5 });
    const res = await request(server())
      .post('/api/orders/quote')
      .send({ items: [{ productId: product.id }] })
      .expect(201);
    // Kural seed edilmedi → buyerFee/sellerFee = 0
    expect(res.body.pricing.buyerFeeAmount).toBe(0);
    expect(res.body.pricing.sellerFeeAmount).toBe(0);
    expect(res.body.pricing.commissionAmount).toBe(0);
    // Tutarlılık: totalAmount = subtotal + shipping + buyerFee + tax
    const pr = res.body.pricing;
    expect(pr.totalAmount).toBeCloseTo(pr.subtotal + pr.shippingAmount + pr.buyerFeeAmount + pr.taxAmount, 2);
  });

  // ════════════════════════════ Saf-UI / parite (CRT-084..090) ════════════════════════════

  scenarioSkip('CRT-084', 'Saf-UI/i18n: boş sepet ekranı (cart.empty / "İlanlara Gözat" / ikon + CTA).');
  scenarioSkip('CRT-085', 'Saf-UI: sepet yükleniyor animate-pulse skeleton (3 satır).');
  scenarioSkip('CRT-086', 'Saf-UI/i18n: /cart kargo metni "Ödeme adımında hesaplanır" / "Calculated at checkout".');
  scenario('CRT-087', async () => {
    // Parite'nin API tarafı: web+mobile checkout özetini besleyen quote.pricing içinde
    // hem alıcı hizmet bedeli (%3) hem KDV satırlarının TUTARLARI birlikte doğru üretilir.
    // (İki platformda satır GÖRÜNÜMÜ saf-UI paritedir → PAR/web tarafında; burada API ucu.)
    await addCommissionRule({ appliesTo: 'BUYER', buyerRate: 3 });
    const seller = await createUser(ctx.module, { isSeller: true });
    await setupCorporateTax(seller.id); // kurumsal satıcı → KDV %20 aktif
    const product = await makeProduct({ sellerId: seller.id, price: 1000, quantity: 5 });

    const res = await request(server())
      .post('/api/orders/quote')
      .send({ items: [{ productId: product.id, quantity: 1 }] })
      .expect(201);
    const pr = res.body.pricing;
    // Ara Toplam
    expect(pr.subtotal).toBe(1000);
    // Kargo satırı (subtotal>=500 → ücretsiz) — alan mevcut ve sayısal
    expect(typeof pr.shippingAmount).toBe('number');
    // Platform Hizmet Bedeli (%3): 1000 × 0.03 = 30
    expect(pr.buyerFeeAmount).toBeCloseTo(30, 2);
    // KDV satırı: kurumsal satıcı → taxAmount > 0 (%20 → 200)
    expect(pr.taxAmount).toBeGreaterThan(0);
    expect(pr.taxAmount).toBeCloseTo(200, 2);
    // Toplam = Ara Toplam + Kargo + Hizmet Bedeli + KDV (her iki platformda aynı tutar)
    expect(pr.totalAmount).toBeCloseTo(pr.subtotal + pr.shippingAmount + pr.buyerFeeAmount + pr.taxAmount, 2);
  });
  scenarioSkip('CRT-088', 'Saf-UI: checkout kargo satırı "Adres seçin" / "Hesaplanıyor..." durumları.');
  scenarioSkip(
    'CRT-089',
    'Saf-UI yönlendirme: stockout sonrası /products/unavailable/:id sayfasına yönlendirme; backend 400+productId davranışı CRT-056/073 ile kapsanır.',
  );
  scenarioSkip('CRT-090', 'Saf-UI/i18n: indirimli fiyat üstü-çizili gösterim (tr-TR "250,00 TL"), web/mobile parite.');
});
