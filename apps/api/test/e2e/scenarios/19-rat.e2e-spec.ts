/**
 * 19 — Puanlama & Yorum (RAT) — Test Konsolu senaryoları.
 *
 * Bu dosya 01-auth.e2e-spec.ts FAN-OUT ŞABLONUNU birebir izler. Her test
 * `scenario('<ID>', fn)` ile manifest'e bağlanır (izlenebilirlik + başlık/pri
 * otomatik). beforeEach truncateAll()+seedBaseline() (+ ctx.paytr/ctx.surat reset).
 *
 * GERÇEK KODA GÖRE DENETLENDİ (adversarial statik doğrulama):
 *   - Uçlar: POST /api/ratings/users, POST /api/ratings/products (JWT korumalı, @Post default 201).
 *     GET users/:id, users/:id/stats, products/:id, products/:id/stats (@Public → misafire 200).
 *     POST /api/ratings/products/:ratingId/helpful (JWT korumalı, @Post default 201).
 *     Tüm :id path param'ları ParseUUIDPipe → geçersiz UUID = 400.
 *   - Admin moderasyon: PATCH /api/admin/reviews/:id/status ve
 *     /api/admin/user-ratings/:id/status (UpdateRatingStatusDto @IsEnum; geçersiz status=400;
 *     bulunamadı=404). GET /api/admin/reviews & /api/admin/user-ratings → { data, meta }.
 *     AdminController @UseGuards(AdminJwtAuthGuard, RolesGuard) + @Roles(super_admin,admin,moderator).
 *   - Puan yalnız DELIVERED/COMPLETED siparişte verilebilir; MEM- siparişleri reddedilir.
 *   - Rating.@@unique([giverId,orderId]) & ([giverId,tradeId]); ProductRating.orderId @unique.
 *   - Post-moderasyon: yeni puan status='approved' → anında public listede/stat'ta görünür;
 *     admin panelden sonradan rejected yapabilir. (Seed'lenen pending kayıtlar filtre dışı kalır.)
 *   - AI moderasyon (küfür filtresi) test ortamında KAPALI (.env.test AI_MODERATION_ENABLED yok →
 *     ModerationAiClient.isEnabled=false → assertCleanComment no-op). RAT-060/061/062 için
 *     paylaşılan ModerationAiClient örneğinin `enabled` alanını test içinde geçici true'ya
 *     çekeriz (hasProfanity regex deterministik, AI HTTP çağrısı yalnız temiz metinde denenir
 *     ve erişilemezse null'a düşer → sistem bloklanmaz). try/finally ile geri alınır.
 *   - Skip'ler yalnız SAF-UI/i18n parite senaryoları (API'den assert edilecek davranış yok;
 *     API tarafı zaten ilgili aktif senaryolarla kapsanır).
 */
import * as request from "supertest";
import { OrderStatus, RatingStatus, TradeStatus } from "@prisma/client";
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
import { scenario } from "../../test-utils/scenario";
import { ModerationAiClient } from "../../../src/modules/moderation/moderation-ai.client";

describe("19 — Puanlama & Yorum (RAT)", () => {
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

  type Auth = { accessToken: string; id: string };

  let orderSeq = 0;
  let tradeSeq = 0;

  /**
   * Doğrudan DB'ye sipariş satırı yaz. RatingService yalnız status/buyerId/sellerId/
   * productId/orderNumber okur; buy→pay zincirini kurmak yerine minimal alanları seed
   * ederiz (11-com.e2e-spec.ts:createOrder deseni ile aynı).
   */
  async function seedOrder(opts: {
    buyerId: string;
    sellerId: string;
    productId: string;
    status?: OrderStatus;
    orderNumber?: string;
  }): Promise<{ id: string }> {
    const prisma = getPrisma();
    const o = await prisma.order.create({
      data: {
        orderNumber: opts.orderNumber ?? `ORD-${Date.now()}-${++orderSeq}`,
        buyerId: opts.buyerId,
        sellerId: opts.sellerId,
        productId: opts.productId,
        totalAmount: 100,
        commissionAmount: 0,
        status: opts.status ?? OrderStatus.delivered,
        paymentExpiresAt: new Date(Date.now() + 864e5),
      },
    });
    return { id: o.id };
  }

  /** Doğrudan DB'ye takas satırı yaz (RatingService yalnız status/initiatorId/receiverId okur). */
  async function seedTrade(opts: {
    initiatorId: string;
    receiverId: string;
    status?: TradeStatus;
  }): Promise<{ id: string }> {
    const prisma = getPrisma();
    const t = await prisma.trade.create({
      data: {
        tradeNumber: `TRD-${Date.now()}-${++tradeSeq}`,
        initiatorId: opts.initiatorId,
        receiverId: opts.receiverId,
        status: opts.status ?? TradeStatus.completed,
        responseDeadline: new Date(Date.now() + 864e5),
      },
    });
    return { id: t.id };
  }

  /** Alıcı + satıcı + ürün + delivered sipariş kur. */
  async function setupDeliveredOrder(over?: {
    orderStatus?: OrderStatus;
    orderNumber?: string;
  }): Promise<{
    buyer: Auth;
    seller: Auth;
    productId: string;
    orderId: string;
  }> {
    const seller = (await createUser(ctx.module, {
      isSeller: true,
      sellerType: "individual",
    })) as Auth;
    const buyer = (await createUser(ctx.module)) as Auth;
    const product = await createProduct({
      sellerId: seller.id,
      categoryId: baseline.categoryId,
    });
    const order = await seedOrder({
      buyerId: buyer.id,
      sellerId: seller.id,
      productId: product.id,
      status: over?.orderStatus ?? OrderStatus.delivered,
      orderNumber: over?.orderNumber,
    });
    return { buyer, seller, productId: product.id, orderId: order.id };
  }

  const postUserRating = (auth: Auth, body: Record<string, unknown>) =>
    request(server())
      .post("/api/ratings/users")
      .set(authHeader(auth))
      .send(body);
  const postProductRating = (auth: Auth, body: Record<string, unknown>) =>
    request(server())
      .post("/api/ratings/products")
      .set(authHeader(auth))
      .send(body);

  /** DB'ye onaylı bir ürün puanı yaz (helpful/liste testleri için). */
  async function seedApprovedProductRating(opts: {
    productId: string;
    userId: string;
    orderId: string;
    score?: number;
    status?: RatingStatus;
    helpfulCount?: number;
  }): Promise<{ id: string }> {
    const prisma = getPrisma();
    const r = await prisma.productRating.create({
      data: {
        productId: opts.productId,
        userId: opts.userId,
        orderId: opts.orderId,
        score: opts.score ?? 5,
        status: opts.status ?? RatingStatus.approved,
        isVerifiedPurchase: true,
        helpfulCount: opts.helpfulCount ?? 0,
        images: [],
      },
    });
    return { id: r.id };
  }

  /** DB'ye onaylı bir kullanıcı puanı yaz (stat/liste testleri için). */
  async function seedUserRating(opts: {
    giverId: string;
    receiverId: string;
    orderId?: string;
    tradeId?: string;
    score: number;
    status?: RatingStatus;
  }): Promise<{ id: string }> {
    const prisma = getPrisma();
    const r = await prisma.rating.create({
      data: {
        giverId: opts.giverId,
        receiverId: opts.receiverId,
        orderId: opts.orderId,
        tradeId: opts.tradeId,
        score: opts.score,
        status: opts.status ?? RatingStatus.approved,
      },
    });
    return { id: r.id };
  }

  /** Küfür filtresini geçici aç → fn çalıştır → geri kapat (paylaşılan app güvenli). */
  async function withProfanityFilter<T>(fn: () => Promise<T>): Promise<T> {
    const mod = ctx.module.get(ModerationAiClient) as any;
    const prev = mod.enabled;
    mod.enabled = true;
    try {
      return await fn();
    } finally {
      mod.enabled = prev;
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // Kullanıcı puanı oluşturma (POST /ratings/users)
  // ════════════════════════════════════════════════════════════════════════
  describe("POST /ratings/users", () => {
    scenario("RAT-001", async () => {
      const { buyer, seller, orderId } = await setupDeliveredOrder();
      const res = await postUserRating(buyer, {
        receiverId: seller.id,
        orderId,
        score: 5,
        comment: "Hızlı kargo, temiz ürün",
      }).expect(201);
      expect(res.body.score).toBe(5);
      expect(res.body.giverId).toBe(buyer.id);
      expect(res.body.receiverId).toBe(seller.id);

      const prisma = getPrisma();
      const row = await prisma.rating.findFirst({
        where: { giverId: buyer.id, orderId },
      });
      expect(row?.status).toBe(RatingStatus.approved);
      expect(row?.score).toBe(5);

      // Post-moderasyon: puan anında yayınlanır → public listede hemen görünür.
      const list = await request(server())
        .get(`/api/ratings/users/${seller.id}`)
        .expect(200);
      expect(list.body.total).toBe(1);
      expect(list.body.ratings).toHaveLength(1);
      expect(list.body.ratings[0].score).toBe(5);
    });

    scenario("RAT-002", async () => {
      const initiator = (await createUser(ctx.module)) as Auth;
      const receiver = (await createUser(ctx.module)) as Auth;
      const trade = await seedTrade({
        initiatorId: initiator.id,
        receiverId: receiver.id,
      });
      await postUserRating(initiator, {
        receiverId: receiver.id,
        tradeId: trade.id,
        score: 4,
        comment: "İyi takas",
      }).expect(201);

      const prisma = getPrisma();
      const row = await prisma.rating.findFirst({
        where: { giverId: initiator.id, tradeId: trade.id },
      });
      expect(row?.tradeId).toBe(trade.id);
      expect(row?.orderId).toBeNull();
      expect(row?.status).toBe(RatingStatus.approved);
    });

    scenario("RAT-003", async () => {
      // Satıcı → alıcı puanı (API destekli). Aynı siparişte RAT-001'den ayrı satır (farklı giver).
      const { buyer, seller, orderId } = await setupDeliveredOrder();
      // Alıcı önce satıcıyı puanlar.
      await postUserRating(buyer, {
        receiverId: seller.id,
        orderId,
        score: 5,
      }).expect(201);
      // Satıcı alıcıyı puanlar → çakışma yok (unique giverId+orderId).
      const res = await postUserRating(seller, {
        receiverId: buyer.id,
        orderId,
        score: 5,
        comment: "Sorunsuz alıcı",
      }).expect(201);
      expect(res.body.giverId).toBe(seller.id);
      expect(res.body.receiverId).toBe(buyer.id);

      const prisma = getPrisma();
      const count = await prisma.rating.count({ where: { orderId } });
      expect(count).toBe(2);
    });

    scenario("RAT-121", async () => {
      // Web "tek modal": aynı delivered siparişte hem ürün hem satıcı puanı gönderilir.
      // Kriter kırılımı (İletişim/Kargo/Paketleme) istemcide birleştirilir; API ham comment
      // olarak saklar ve iki AYRI kayıt (product_ratings + ratings) oluşur.
      // Satıcı skoru = üç kriterin yuvarlanmış ortalaması: round((4+5+3)/3)=4.
      const { buyer, seller, productId, orderId } = await setupDeliveredOrder();
      const criteria = { iletisim: 4, kargo: 5, paketleme: 3 };
      const sellerScore = Math.round(
        (criteria.iletisim + criteria.kargo + criteria.paketleme) / 3,
      ); // 4
      const sellerComment = `İletişim: ${criteria.iletisim}/5, Kargo: ${criteria.kargo}/5, Paketleme: ${criteria.paketleme}/5`;

      // 1) Ürün puanı.
      const pr = await postProductRating(buyer, {
        productId,
        orderId,
        score: 4,
        title: "Güzel model",
        review: "Beklediğim gibi",
      }).expect(201);
      expect(pr.body.isVerifiedPurchase).toBe(true);
      // 2) Satıcı (kullanıcı) puanı — kriter kırılımı comment içinde.
      const ur = await postUserRating(buyer, {
        receiverId: seller.id,
        orderId,
        score: sellerScore,
        comment: sellerComment,
      }).expect(201);
      expect(ur.body.score).toBe(4);

      const prisma = getPrisma();
      const productRow = await prisma.productRating.findUnique({
        where: { orderId },
      });
      expect(productRow).toBeTruthy();
      expect(productRow?.score).toBe(4);
      const userRow = await prisma.rating.findFirst({
        where: { giverId: buyer.id, orderId },
      });
      expect(userRow?.receiverId).toBe(seller.id);
      expect(userRow?.score).toBe(4);
      // Kriter kırılımı ham saklanır (İletişim/Kargo/Paketleme x/5).
      expect(userRow?.comment).toBe(sellerComment);
      expect(userRow?.comment).toContain("İletişim: 4/5");
      expect(userRow?.comment).toContain("Kargo: 5/5");
      expect(userRow?.comment).toContain("Paketleme: 3/5");
    });

    scenario("RAT-020", async () => {
      // Kendini puanlama reddi (self-check receiver lookup'tan önce → sipariş gerekmez).
      const user = (await createUser(ctx.module)) as Auth;
      const res = await postUserRating(user, {
        receiverId: user.id,
        score: 5,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain("Kendinizi puanlayamazsınız");
    });

    scenario("RAT-021", async () => {
      // Siparişin tarafı olmayan kullanıcı puanlayamaz → 403.
      const { seller, orderId } = await setupDeliveredOrder();
      const outsider = (await createUser(ctx.module)) as Auth;
      const res = await postUserRating(outsider, {
        receiverId: seller.id,
        orderId,
        score: 1,
      }).expect(403);
      expect(JSON.stringify(res.body)).toContain(
        "Bu siparişi puanlama yetkiniz yok",
      );
    });

    scenario("RAT-022", async () => {
      // Taraf doğru (alıcı) ama receiver karşı taraf (satıcı) değil → 400 "Geçersiz alıcı".
      const { buyer, orderId } = await setupDeliveredOrder();
      const other = (await createUser(ctx.module)) as Auth;
      const res = await postUserRating(buyer, {
        receiverId: other.id,
        orderId,
        score: 5,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain("Geçersiz alıcı");
    });

    scenario("RAT-024", async () => {
      // Kimliksiz (misafir) puanlama → 401 (her iki uç).
      const receiver = (await createUser(ctx.module)) as Auth;
      const { productId, orderId } = await setupDeliveredOrder();
      await request(server())
        .post("/api/ratings/users")
        .send({ receiverId: receiver.id, score: 5 })
        .expect(401);
      await request(server())
        .post("/api/ratings/products")
        .send({ productId, orderId, score: 5 })
        .expect(401);
    });

    scenario("RAT-040", async () => {
      // Teslim edilmemiş (paid) siparişe kullanıcı puanı → 400.
      const { buyer, seller, orderId } = await setupDeliveredOrder({
        orderStatus: OrderStatus.paid,
      });
      const res = await postUserRating(buyer, {
        receiverId: seller.id,
        orderId,
        score: 5,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Sadece teslim edilmiş siparişler puanlanabilir",
      );
    });

    scenario("RAT-042", async () => {
      // Tamamlanmamış (pending) takasa puan → 400.
      const initiator = (await createUser(ctx.module)) as Auth;
      const receiver = (await createUser(ctx.module)) as Auth;
      const trade = await seedTrade({
        initiatorId: initiator.id,
        receiverId: receiver.id,
        status: TradeStatus.pending,
      });
      const res = await postUserRating(initiator, {
        receiverId: receiver.id,
        tradeId: trade.id,
        score: 5,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Sadece tamamlanmış takaslar puanlanabilir",
      );
    });

    scenario("RAT-044", async () => {
      // Üyelik (MEM-) siparişine kullanıcı puanı → 400.
      const { buyer, seller, orderId } = await setupDeliveredOrder({
        orderNumber: `MEM-${Date.now()}`,
      });
      const res = await postUserRating(buyer, {
        receiverId: seller.id,
        orderId,
        score: 5,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Üyelik siparişleri için değerlendirme yapılamaz",
      );
    });

    scenario("RAT-045", async () => {
      // 1) receiver 404: var olmayan receiverId (orderId yine var-olmayan) → "Kullanıcı bulunamadı"
      //    (receiver lookup order lookup'tan önce gelir).
      const { buyer, seller } = await setupDeliveredOrder();
      const ghostReceiver = "00000000-0000-0000-0000-0000000000aa";
      const ghostOrder = "00000000-0000-0000-0000-0000000000bb";
      const r1 = await postUserRating(buyer, {
        receiverId: ghostReceiver,
        orderId: ghostOrder,
        score: 5,
      }).expect(404);
      expect(JSON.stringify(r1.body)).toContain("Kullanıcı bulunamadı");
      // 2) order 404: receiver geçerli (satıcı) ama order var olmayan → "Sipariş bulunamadı".
      const r2 = await postUserRating(buyer, {
        receiverId: seller.id,
        orderId: ghostOrder,
        score: 5,
      }).expect(404);
      expect(JSON.stringify(r2.body)).toContain("Sipariş bulunamadı");
    });

    scenario("RAT-046", async () => {
      // receiver mevcut ama orderId/tradeId yok → 400 "Sipariş veya takas ID gerekli".
      const giver = (await createUser(ctx.module)) as Auth;
      const receiver = (await createUser(ctx.module)) as Auth;
      const res = await postUserRating(giver, {
        receiverId: receiver.id,
        score: 5,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Sipariş veya takas ID gerekli",
      );
    });

    scenario("RAT-050", async () => {
      // score 0 → ValidationPipe 400 (@Min(1)).
      const { buyer, seller, orderId } = await setupDeliveredOrder();
      const res = await postUserRating(buyer, {
        receiverId: seller.id,
        orderId,
        score: 0,
      }).expect(400);
      expect(JSON.stringify(res.body)).toMatch(/score|1/i);
    });

    scenario("RAT-051", async () => {
      // score 6 → 400 (her iki uç).
      const { buyer, seller, productId, orderId } = await setupDeliveredOrder();
      await postUserRating(buyer, {
        receiverId: seller.id,
        orderId,
        score: 6,
      }).expect(400);
      await postProductRating(buyer, { productId, orderId, score: 6 }).expect(
        400,
      );
    });

    scenario("RAT-052", async () => {
      // Sınır geçerli değerler 1 ve 5 → 201.
      const s1 = await setupDeliveredOrder();
      await postUserRating(s1.buyer, {
        receiverId: s1.seller.id,
        orderId: s1.orderId,
        score: 1,
      }).expect(201);
      const s2 = await setupDeliveredOrder();
      await postUserRating(s2.buyer, {
        receiverId: s2.seller.id,
        orderId: s2.orderId,
        score: 5,
      }).expect(201);
    });

    scenario("RAT-054", async () => {
      // comment 500 kabul, 501 red (@MaxLength(500)).
      const s1 = await setupDeliveredOrder();
      await postUserRating(s1.buyer, {
        receiverId: s1.seller.id,
        orderId: s1.orderId,
        score: 5,
        comment: "x".repeat(500),
      }).expect(201);
      const s2 = await setupDeliveredOrder();
      await postUserRating(s2.buyer, {
        receiverId: s2.seller.id,
        orderId: s2.orderId,
        score: 5,
        comment: "x".repeat(501),
      }).expect(400);
    });

    scenario("RAT-056", async () => {
      // Boş yorum kabul (opsiyonel). comment hiç yok + "" → 201.
      const s1 = await setupDeliveredOrder();
      await postUserRating(s1.buyer, {
        receiverId: s1.seller.id,
        orderId: s1.orderId,
        score: 4,
      }).expect(201);
      const s2 = await setupDeliveredOrder();
      await postUserRating(s2.buyer, {
        receiverId: s2.seller.id,
        orderId: s2.orderId,
        score: 4,
        comment: "",
      }).expect(201);
    });

    scenario("RAT-057", async () => {
      // score eksik → 400 (@IsNumber zorunlu).
      const { buyer, seller, orderId } = await setupDeliveredOrder();
      await postUserRating(buyer, { receiverId: seller.id, orderId }).expect(
        400,
      );
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Ürün puanı oluşturma (POST /ratings/products)
  // ════════════════════════════════════════════════════════════════════════
  describe("POST /ratings/products", () => {
    scenario("RAT-010", async () => {
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      const res = await postProductRating(buyer, {
        productId,
        orderId,
        score: 4,
        title: "Güzel model",
        review: "Beklediğim gibi",
        images: [],
      }).expect(201);
      expect(res.body.isVerifiedPurchase).toBe(true);
      expect(res.body.helpfulCount).toBe(0);

      const prisma = getPrisma();
      const row = await prisma.productRating.findUnique({ where: { orderId } });
      expect(row?.status).toBe(RatingStatus.approved);
      expect(row?.isVerifiedPurchase).toBe(true);

      // Post-moderasyon: puan anında yayınlanır → public listede görünür, averageRating hesaplanır.
      const list = await request(server())
        .get(`/api/ratings/products/${productId}`)
        .expect(200);
      expect(list.body.total).toBe(1);
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      expect(Number(product?.averageRating)).toBe(4);
    });

    scenario("RAT-011", async () => {
      // Yorumsuz/başlıksız ürün puanı (sadece skor).
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      await postProductRating(buyer, { productId, orderId, score: 3 }).expect(
        201,
      );
      const prisma = getPrisma();
      const row = await prisma.productRating.findUnique({ where: { orderId } });
      expect(row?.title).toBeNull();
      expect(row?.review).toBeNull();
      expect(row?.score).toBe(3);
    });

    scenario("RAT-023", async () => {
      // Ürün puanını yalnız alıcı verir; satıcı → 403.
      const { seller, productId, orderId } = await setupDeliveredOrder();
      const res = await postProductRating(seller, {
        productId,
        orderId,
        score: 5,
      }).expect(403);
      expect(JSON.stringify(res.body)).toContain(
        "Sadece alıcı ürünü puanlayabilir",
      );
    });

    scenario("RAT-041", async () => {
      // Teslim edilmemiş (paid) siparişe ürün puanı → 400.
      const { buyer, productId, orderId } = await setupDeliveredOrder({
        orderStatus: OrderStatus.paid,
      });
      const res = await postProductRating(buyer, {
        productId,
        orderId,
        score: 5,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Sadece teslim edilmiş siparişler puanlanabilir",
      );
    });

    scenario("RAT-043", async () => {
      // Üyelik (MEM-) siparişine ürün puanı → 400.
      const { buyer, productId, orderId } = await setupDeliveredOrder({
        orderNumber: `MEM-${Date.now()}`,
      });
      const res = await postProductRating(buyer, {
        productId,
        orderId,
        score: 5,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Üyelik siparişleri için değerlendirme yapılamaz",
      );
    });

    scenario("RAT-047", async () => {
      // Ürün-sipariş eşleşmemesi → 400. Alıcı doğru ama productId farklı bir ürün.
      const { buyer, orderId } = await setupDeliveredOrder();
      const otherSeller = (await createUser(ctx.module, {
        isSeller: true,
        sellerType: "individual",
      })) as Auth;
      const otherProduct = await createProduct({
        sellerId: otherSeller.id,
        categoryId: baseline.categoryId,
      });
      const res = await postProductRating(buyer, {
        productId: otherProduct.id,
        orderId,
        score: 5,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain("Siparişteki ürün eşleşmiyor");
    });

    scenario("RAT-055", async () => {
      // title 101 → 400; review 1001 → 400; title 100 + review 1000 → 201.
      const s1 = await setupDeliveredOrder();
      await postProductRating(s1.buyer, {
        productId: s1.productId,
        orderId: s1.orderId,
        score: 4,
        title: "x".repeat(101),
      }).expect(400);
      const s2 = await setupDeliveredOrder();
      await postProductRating(s2.buyer, {
        productId: s2.productId,
        orderId: s2.orderId,
        score: 4,
        review: "y".repeat(1001),
      }).expect(400);
      const s3 = await setupDeliveredOrder();
      await postProductRating(s3.buyer, {
        productId: s3.productId,
        orderId: s3.orderId,
        score: 4,
        title: "x".repeat(100),
        review: "y".repeat(1000),
      }).expect(201);
    });

    scenario("RAT-058", async () => {
      // images tip doğrulaması. "string" → 400; ["url1",123] → 400; [] → 201.
      const s1 = await setupDeliveredOrder();
      await postProductRating(s1.buyer, {
        productId: s1.productId,
        orderId: s1.orderId,
        score: 4,
        images: "tek-string",
      }).expect(400);
      const s2 = await setupDeliveredOrder();
      await postProductRating(s2.buyer, {
        productId: s2.productId,
        orderId: s2.orderId,
        score: 4,
        images: ["url1", 123],
      }).expect(400);
      const s3 = await setupDeliveredOrder();
      await postProductRating(s3.buyer, {
        productId: s3.productId,
        orderId: s3.orderId,
        score: 4,
        images: [],
      }).expect(201);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Idempotency / çift puan
  // ════════════════════════════════════════════════════════════════════════
  describe("Idempotency", () => {
    scenario("RAT-030", async () => {
      // Aynı sipariş için ikinci kullanıcı puanı → 400; DB'de tek satır, ilk skor korunur.
      const { buyer, seller, orderId } = await setupDeliveredOrder();
      await postUserRating(buyer, {
        receiverId: seller.id,
        orderId,
        score: 5,
      }).expect(201);
      const res = await postUserRating(buyer, {
        receiverId: seller.id,
        orderId,
        score: 1,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Bu sipariş için zaten puan verdiniz",
      );
      const prisma = getPrisma();
      const rows = await prisma.rating.findMany({
        where: { giverId: buyer.id, orderId },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].score).toBe(5);
    });

    scenario("RAT-031", async () => {
      // Aynı sipariş için ikinci ürün puanı → 400.
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      await postProductRating(buyer, { productId, orderId, score: 5 }).expect(
        201,
      );
      const res = await postProductRating(buyer, {
        productId,
        orderId,
        score: 1,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Bu sipariş için zaten ürün puanı verdiniz",
      );
    });

    scenario("RAT-032", async () => {
      // Aynı takas için ikinci puan → 400.
      const initiator = (await createUser(ctx.module)) as Auth;
      const receiver = (await createUser(ctx.module)) as Auth;
      const trade = await seedTrade({
        initiatorId: initiator.id,
        receiverId: receiver.id,
      });
      await postUserRating(initiator, {
        receiverId: receiver.id,
        tradeId: trade.id,
        score: 4,
      }).expect(201);
      const res = await postUserRating(initiator, {
        receiverId: receiver.id,
        tradeId: trade.id,
        score: 2,
      }).expect(400);
      expect(JSON.stringify(res.body)).toContain(
        "Bu takas için zaten puan verdiniz",
      );
    });

    scenario("RAT-033", async () => {
      // İki yönlü puan tek siparişte → iki satır, unique ihlali yok.
      const { buyer, seller, orderId } = await setupDeliveredOrder();
      await postUserRating(buyer, {
        receiverId: seller.id,
        orderId,
        score: 5,
      }).expect(201);
      await postUserRating(seller, {
        receiverId: buyer.id,
        orderId,
        score: 4,
      }).expect(201);
      const prisma = getPrisma();
      const count = await prisma.rating.count({ where: { orderId } });
      expect(count).toBe(2);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Küfür / içerik moderasyonu (filtre geçici açılır)
  // ════════════════════════════════════════════════════════════════════════
  describe("İçerik moderasyonu", () => {
    scenario("RAT-060", async () => {
      // Küfür içeren satıcı yorumu → 400; DB'ye puan YAZILMAZ; moderation_events blocked.
      await withProfanityFilter(async () => {
        const { buyer, seller, orderId } = await setupDeliveredOrder();
        const res = await postUserRating(buyer, {
          receiverId: seller.id,
          orderId,
          score: 5,
          comment: "orospu çocuğu satıcı",
        }).expect(400);
        expect(JSON.stringify(res.body)).toContain("uygun değildir");
        const prisma = getPrisma();
        const rows = await prisma.rating.findMany({
          where: { giverId: buyer.id, orderId },
        });
        expect(rows).toHaveLength(0);
        const events = await prisma.moderationEvent.findMany({
          where: { entityType: "user", decision: "blocked", userId: buyer.id },
        });
        expect(events.length).toBeGreaterThanOrEqual(1);
      });
    });

    scenario("RAT-061", async () => {
      // Küfür ürün başlık+yorumunda (birleşik "title review" denetlenir) → 400.
      await withProfanityFilter(async () => {
        const { buyer, productId, orderId } = await setupDeliveredOrder();
        const res = await postProductRating(buyer, {
          productId,
          orderId,
          score: 2,
          title: "temiz",
          review: "siktir git",
        }).expect(400);
        expect(JSON.stringify(res.body)).toContain("uygun değildir");
        const prisma = getPrisma();
        const row = await prisma.productRating.findUnique({
          where: { orderId },
        });
        expect(row).toBeNull();
      });
    });

    scenario("RAT-062", async () => {
      // Kelime-sınırı: "amacım iyi bir alışveriş" → 201 (yanlış-pozitif yok);
      // "am" tek kelime → 400 (tam kelime yakalanır).
      await withProfanityFilter(async () => {
        const s1 = await setupDeliveredOrder();
        await postUserRating(s1.buyer, {
          receiverId: s1.seller.id,
          orderId: s1.orderId,
          score: 5,
          comment: "amacım iyi bir alışveriş",
        }).expect(201);
        const s2 = await setupDeliveredOrder();
        await postUserRating(s2.buyer, {
          receiverId: s2.seller.id,
          orderId: s2.orderId,
          score: 1,
          comment: "am",
        }).expect(400);
      });
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Admin moderasyon (PATCH reviews / user-ratings status)
  // ════════════════════════════════════════════════════════════════════════
  describe("Admin moderasyon", () => {
    const patchReview = (auth: Auth, id: string, status: string) =>
      request(server())
        .patch(`/api/admin/reviews/${id}/status`)
        .set(authHeader(auth))
        .send({ status });
    const patchUserRating = (auth: Auth, id: string, status: string) =>
      request(server())
        .patch(`/api/admin/user-ratings/${id}/status`)
        .set(authHeader(auth))
        .send({ status });

    scenario("RAT-070", async () => {
      // Admin ürün yorumunu onaylar → public listede görünür + Product denorm güncellenir.
      const admin = (await createAdminUser(ctx.module)) as unknown as Auth;
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      const rating = await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        score: 4,
        status: RatingStatus.pending,
      });
      await patchReview(admin, rating.id, "approved").expect(200);

      const list = await request(server())
        .get(`/api/ratings/products/${productId}`)
        .expect(200);
      expect(list.body.total).toBe(1);
      const stats = await request(server())
        .get(`/api/ratings/products/${productId}/stats`)
        .expect(200);
      expect(stats.body.averageScore).toBe(4);
      expect(stats.body.totalRatings).toBe(1);

      const prisma = getPrisma();
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      expect(Number(product?.averageRating)).toBe(4);
      expect(product?.ratingCount).toBe(1);
      const audit = await prisma.auditLog.findFirst({
        where: { action: "review_status_update", entityId: rating.id },
      });
      expect(audit).toBeTruthy();
    });

    scenario("RAT-071", async () => {
      // Admin yorumu reddeder → public listeden kalkar + ortalama düşer/null olur.
      const admin = (await createAdminUser(ctx.module)) as unknown as Auth;
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      const rating = await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        score: 5,
        status: RatingStatus.approved,
      });
      // Onaylı → önce denorm güncellensin diye stats'ı senkronla.
      const prisma = getPrisma();
      await prisma.product.update({
        where: { id: productId },
        data: { averageRating: 5, ratingCount: 1 },
      });

      await patchReview(admin, rating.id, "rejected").expect(200);
      const list = await request(server())
        .get(`/api/ratings/products/${productId}`)
        .expect(200);
      expect(list.body.total).toBe(0);
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      expect(product?.averageRating).toBeNull();
      expect(product?.ratingCount).toBe(0);
    });

    scenario("RAT-072", async () => {
      // Admin satıcı (kullanıcı) puanını onaylar → public listede görünür.
      const admin = (await createAdminUser(ctx.module)) as unknown as Auth;
      const { buyer, seller, orderId } = await setupDeliveredOrder();
      const rating = await seedUserRating({
        giverId: buyer.id,
        receiverId: seller.id,
        orderId,
        score: 5,
        status: RatingStatus.pending,
      });
      const res = await patchUserRating(admin, rating.id, "approved").expect(
        200,
      );
      expect(res.body.success).toBe(true);

      const list = await request(server())
        .get(`/api/ratings/users/${seller.id}`)
        .expect(200);
      expect(list.body.total).toBe(1);
      const prisma = getPrisma();
      const audit = await prisma.auditLog.findFirst({
        where: { action: "user_rating_status_update", entityId: rating.id },
      });
      expect(audit).toBeTruthy();
    });

    scenario("RAT-073", async () => {
      // Yetkisiz rol (normal kullanıcı token'ı) moderasyon yapamaz → 401/403. Durum değişmez.
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      const rating = await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        status: RatingStatus.pending,
      });
      const res = await patchReview(buyer, rating.id, "approved");
      expect([401, 403]).toContain(res.status);
      const prisma = getPrisma();
      const row = await prisma.productRating.findUnique({
        where: { id: rating.id },
      });
      expect(row?.status).toBe(RatingStatus.pending);
    });

    scenario("RAT-074", async () => {
      // Var olmayan yorum durumu güncellenemez → 404.
      const admin = (await createAdminUser(ctx.module, {
        role: "moderator" as any,
      })) as unknown as Auth;
      await patchReview(
        admin,
        "00000000-0000-0000-0000-0000000000cc",
        "approved",
      ).expect(404);
    });

    scenario("RAT-075", async () => {
      // Geçersiz status değeri → 400 (@IsEnum).
      const admin = (await createAdminUser(ctx.module)) as unknown as Auth;
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      const rating = await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        status: RatingStatus.pending,
      });
      await patchReview(admin, rating.id, "yayinla").expect(400);
    });

    scenario("RAT-077", async () => {
      // Yeniden onaya alma: rejected → pending → approved (her geçiş 200).
      const admin = (await createAdminUser(ctx.module)) as unknown as Auth;
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      const rating = await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        status: RatingStatus.rejected,
      });
      await patchReview(admin, rating.id, "pending").expect(200);
      await patchReview(admin, rating.id, "approved").expect(200);
      const list = await request(server())
        .get(`/api/ratings/products/${productId}`)
        .expect(200);
      expect(list.body.total).toBe(1);
    });

    scenario("RAT-078", async () => {
      // Admin moderasyon listesi & arama: { data, meta{total,page,limit,totalPages} }.
      const admin = (await createAdminUser(ctx.module)) as unknown as Auth;
      const { buyer, seller, productId, orderId } = await setupDeliveredOrder();
      await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        title: "harika ürün",
        status: RatingStatus.pending,
      } as any);
      await seedUserRating({
        giverId: buyer.id,
        receiverId: seller.id,
        orderId,
        score: 5,
        status: RatingStatus.pending,
      });

      const pending = await request(server())
        .get("/api/admin/reviews?status=pending")
        .set(authHeader(admin))
        .expect(200);
      expect(pending.body.data.length).toBeGreaterThanOrEqual(1);
      expect(pending.body.meta).toEqual(
        expect.objectContaining({
          total: expect.any(Number),
          page: expect.any(Number),
          limit: expect.any(Number),
          totalPages: expect.any(Number),
        }),
      );

      const userRatings = await request(server())
        .get("/api/admin/user-ratings")
        .set(authHeader(admin))
        .expect(200);
      expect(userRatings.body.data.length).toBeGreaterThanOrEqual(1);
      expect(userRatings.body.meta.total).toBeGreaterThanOrEqual(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Public listeler & istatistik
  // ════════════════════════════════════════════════════════════════════════
  describe("Public listeler & stats", () => {
    scenario("RAT-025", async () => {
      // Public listeler misafire açık → 200.
      const seller = (await createUser(ctx.module)) as Auth;
      const buyerSeller = (await createUser(ctx.module, {
        isSeller: true,
        sellerType: "individual",
      })) as Auth;
      const product = await createProduct({
        sellerId: buyerSeller.id,
        categoryId: baseline.categoryId,
      });
      await request(server())
        .get(`/api/ratings/users/${seller.id}`)
        .expect(200);
      await request(server())
        .get(`/api/ratings/users/${seller.id}/stats`)
        .expect(200);
      await request(server())
        .get(`/api/ratings/products/${product.id}`)
        .expect(200);
      await request(server())
        .get(`/api/ratings/products/${product.id}/stats`)
        .expect(200);
    });

    scenario("RAT-080", async () => {
      // Kullanıcı ortalama puanı: skorlar 4,4,5 → averageScore 4.3, totalRatings 3, dağılım.
      const receiver = (await createUser(ctx.module)) as Auth;
      const g1 = (await createUser(ctx.module)) as Auth;
      const g2 = (await createUser(ctx.module)) as Auth;
      const g3 = (await createUser(ctx.module)) as Auth;
      await seedUserRating({
        giverId: g1.id,
        receiverId: receiver.id,
        orderId: (await makeOrderFor(g1, receiver)).id,
        score: 4,
      });
      await seedUserRating({
        giverId: g2.id,
        receiverId: receiver.id,
        orderId: (await makeOrderFor(g2, receiver)).id,
        score: 4,
      });
      await seedUserRating({
        giverId: g3.id,
        receiverId: receiver.id,
        orderId: (await makeOrderFor(g3, receiver)).id,
        score: 5,
      });

      const stats = await request(server())
        .get(`/api/ratings/users/${receiver.id}/stats`)
        .expect(200);
      expect(stats.body.averageScore).toBe(4.3);
      expect(stats.body.totalRatings).toBe(3);
      expect(stats.body.scoreDistribution).toEqual({
        1: 0,
        2: 0,
        3: 0,
        4: 2,
        5: 1,
      });
    });

    scenario("RAT-081", async () => {
      // Puan yokken ortalama 0. Ayrıca onaysız puanlı ürün için Product.averageRating null.
      const user = (await createUser(ctx.module)) as Auth;
      const stats = await request(server())
        .get(`/api/ratings/users/${user.id}/stats`)
        .expect(200);
      expect(stats.body.averageScore).toBe(0);
      expect(stats.body.totalRatings).toBe(0);
      expect(stats.body.scoreDistribution).toEqual({
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
      });

      const { buyer, productId, orderId } = await setupDeliveredOrder();
      await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        score: 5,
        status: RatingStatus.pending,
      });
      const pStats = await request(server())
        .get(`/api/ratings/products/${productId}/stats`)
        .expect(200);
      expect(pStats.body.totalRatings).toBe(0);
      const prisma = getPrisma();
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      expect(product?.averageRating).toBeNull();
    });

    scenario("RAT-082", async () => {
      // Pending/rejected puan ortalamaya katılmaz: bir approved(5) + bir pending + bir rejected → avg 5, total 1.
      const { buyer, seller, productId, orderId } = await setupDeliveredOrder();
      await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        score: 5,
        status: RatingStatus.approved,
      });
      // Ek pending + rejected (farklı order/user unique için).
      const o2 = await makeOrderFor(buyer, seller, productId);
      const b2 = (await createUser(ctx.module)) as Auth;
      const o3 = await makeOrderFor(b2, seller, productId);
      await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId: o2.id,
        score: 1,
        status: RatingStatus.pending,
      });
      await seedApprovedProductRating({
        productId,
        userId: b2.id,
        orderId: o3.id,
        score: 1,
        status: RatingStatus.rejected,
      });

      const stats = await request(server())
        .get(`/api/ratings/products/${productId}/stats`)
        .expect(200);
      expect(stats.body.averageScore).toBe(5);
      expect(stats.body.totalRatings).toBe(1);
    });

    scenario("RAT-083", async () => {
      // Onay sonrası Product denormalize alanları güncellenir (average_rating/rating_count).
      const admin = (await createAdminUser(ctx.module)) as unknown as Auth;
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      const rating = await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        score: 4,
        status: RatingStatus.pending,
      });
      await request(server())
        .patch(`/api/admin/reviews/${rating.id}/status`)
        .set(authHeader(admin))
        .send({ status: "approved" })
        .expect(200);
      const prisma = getPrisma();
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });
      expect(Number(product?.averageRating)).toBe(4);
      expect(product?.ratingCount).toBe(1);
    });

    scenario("RAT-090", async () => {
      // Ürün yorumları puan filtresi score=5.
      const { buyer, seller, productId, orderId } = await setupDeliveredOrder();
      await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        score: 5,
      });
      const b2 = (await createUser(ctx.module)) as Auth;
      const o2 = await makeOrderFor(b2, seller, productId);
      await seedApprovedProductRating({
        productId,
        userId: b2.id,
        orderId: o2.id,
        score: 3,
      });

      const res = await request(server())
        .get(`/api/ratings/products/${productId}?score=5`)
        .expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.ratings.every((r: any) => r.score === 5)).toBe(true);
    });

    scenario("RAT-091", async () => {
      // Sıralama seçenekleri: highest/lowest/oldest/helpful + geçersiz → default (createdAt desc).
      const { buyer, seller, productId, orderId } = await setupDeliveredOrder();
      await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        score: 2,
        helpfulCount: 10,
      });
      const b2 = (await createUser(ctx.module)) as Auth;
      const o2 = await makeOrderFor(b2, seller, productId);
      await seedApprovedProductRating({
        productId,
        userId: b2.id,
        orderId: o2.id,
        score: 5,
        helpfulCount: 1,
      });

      const highest = await request(server())
        .get(`/api/ratings/products/${productId}?sortBy=highest`)
        .expect(200);
      expect(highest.body.ratings[0].score).toBe(5);
      const lowest = await request(server())
        .get(`/api/ratings/products/${productId}?sortBy=lowest`)
        .expect(200);
      expect(lowest.body.ratings[0].score).toBe(2);
      const helpful = await request(server())
        .get(`/api/ratings/products/${productId}?sortBy=helpful`)
        .expect(200);
      expect(helpful.body.ratings[0].helpfulCount).toBe(10);
      await request(server())
        .get(`/api/ratings/products/${productId}?sortBy=xyz`)
        .expect(200);
      await request(server())
        .get(`/api/ratings/products/${productId}?sortBy=oldest`)
        .expect(200);
    });

    scenario("RAT-092", async () => {
      // Sayfalama clamp: pageSize>100 → 100, page<1 → 1.
      const product = await createProduct({
        sellerId: (
          await createUser(ctx.module, {
            isSeller: true,
            sellerType: "individual",
          })
        ).id,
        categoryId: baseline.categoryId,
      });
      const res = await request(server())
        .get(`/api/ratings/products/${product.id}?pageSize=500&page=0`)
        .expect(200);
      expect(res.body.pageSize).toBe(100);
      expect(res.body.page).toBe(1);
    });

    scenario("RAT-093", async () => {
      // Geçersiz UUID parametresi → 400 (ParseUUIDPipe).
      await request(server())
        .get("/api/ratings/users/not-a-uuid/stats")
        .expect(400);
      await request(server())
        .get("/api/ratings/products/not-a-uuid")
        .expect(400);
    });

    scenario("RAT-094", async () => {
      // Boş liste yapısı: ratings [], total 0, page 1, pageSize 20 (varsayılan).
      const product = await createProduct({
        sellerId: (
          await createUser(ctx.module, {
            isSeller: true,
            sellerType: "individual",
          })
        ).id,
        categoryId: baseline.categoryId,
      });
      const res = await request(server())
        .get(`/api/ratings/products/${product.id}`)
        .expect(200);
      expect(res.body.ratings).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
    });

    scenario("RAT-144", async () => {
      // Negatif/tamsayı-dışı sayfalama enjeksiyonu güvenli: page=-5&pageSize=abc&score=99
      // → 200, page 1, pageSize 20, score filtresi yok. 500 yok.
      const { buyer, seller, productId, orderId } = await setupDeliveredOrder();
      await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        score: 5,
      });
      const b2 = (await createUser(ctx.module)) as Auth;
      const o2 = await makeOrderFor(b2, seller, productId);
      await seedApprovedProductRating({
        productId,
        userId: b2.id,
        orderId: o2.id,
        score: 3,
      });

      const res = await request(server())
        .get(`/api/ratings/products/${productId}?page=-5&pageSize=abc&score=99`)
        .expect(200);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
      expect(res.body.total).toBe(2); // score=99 aralık dışı → filtre uygulanmaz
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Faydalı işaretleme (helpful)
  // ════════════════════════════════════════════════════════════════════════
  describe("Helpful", () => {
    const markHelpful = (auth: Auth, ratingId: string) =>
      request(server())
        .post(`/api/ratings/products/${ratingId}/helpful`)
        .set(authHeader(auth));

    scenario("RAT-100", async () => {
      // Onaylı yorumu faydalı işaretle → 201, helpfulCount=1.
      const user = (await createUser(ctx.module)) as Auth;
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      const rating = await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        score: 5,
      });
      const res = await markHelpful(user, rating.id).expect(201);
      expect(res.body.helpfulCount).toBe(1);
    });

    scenario("RAT-101", async () => {
      // Onaysız (pending) yorum faydalı işaretlenemez → 404.
      const user = (await createUser(ctx.module)) as Auth;
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      const rating = await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        status: RatingStatus.pending,
      });
      await markHelpful(user, rating.id).expect(404);
    });

    scenario("RAT-103", async () => {
      // Var-olmayan ratingId → 404; geçersiz UUID → 400 (ParseUUIDPipe).
      const user = (await createUser(ctx.module)) as Auth;
      await markHelpful(user, "00000000-0000-0000-0000-0000000000dd").expect(
        404,
      );
      await markHelpful(user, "abc").expect(400);
    });

    scenario("RAT-143", async () => {
      // Helpful ucu auth gerektirir → token'sız 401.
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      const rating = await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        score: 5,
      });
      await request(server())
        .post(`/api/ratings/products/${rating.id}/helpful`)
        .expect(401);
    });

    scenario("RAT-132", async () => {
      // Eşzamanlı helpful artışı tutarlılığı: 10 eşzamanlı istek → helpfulCount=10.
      const user = (await createUser(ctx.module)) as Auth;
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      const rating = await seedApprovedProductRating({
        productId,
        userId: buyer.id,
        orderId,
        score: 5,
      });
      await Promise.all(
        Array.from({ length: 10 }, () =>
          markHelpful(user, rating.id).expect(201),
        ),
      );
      const prisma = getPrisma();
      const row = await prisma.productRating.findUnique({
        where: { id: rating.id },
      });
      expect(row?.helpfulCount).toBe(10);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // Eşzamanlılık / güvenlik
  // ════════════════════════════════════════════════════════════════════════
  describe("Eşzamanlılık & güvenlik", () => {
    scenario("RAT-130", async () => {
      // Aynı sipariş için iki eşzamanlı kullanıcı puanı → biri 201, diğeri hata; DB'de TEK satır.
      const { buyer, seller, orderId } = await setupDeliveredOrder();
      const [a, b] = await Promise.all([
        postUserRating(buyer, { receiverId: seller.id, orderId, score: 5 }),
        postUserRating(buyer, { receiverId: seller.id, orderId, score: 1 }),
      ]);
      expect(a.status).not.toBe(500);
      expect(b.status).not.toBe(500);
      const statuses = [a.status, b.status].sort();
      expect(statuses).toContain(201);
      const prisma = getPrisma();
      const count = await prisma.rating.count({
        where: { giverId: buyer.id, orderId },
      });
      expect(count).toBe(1);
    });

    scenario("RAT-131", async () => {
      // Eşzamanlı ürün puanı (orderId unique) → biri 201, diğeri hata; DB'de tek satır.
      const { buyer, productId, orderId } = await setupDeliveredOrder();
      const [a, b] = await Promise.all([
        postProductRating(buyer, { productId, orderId, score: 5 }),
        postProductRating(buyer, { productId, orderId, score: 1 }),
      ]);
      expect(a.status).not.toBe(500);
      expect(b.status).not.toBe(500);
      expect([a.status, b.status]).toContain(201);
      const prisma = getPrisma();
      const count = await prisma.productRating.count({ where: { orderId } });
      expect(count).toBe(1);
    });

    scenario("RAT-140", async () => {
      // giverId enjeksiyonu: body'ye fazladan giverId → yok sayılır; kayıt token sahibi ile oluşur.
      const { buyer, seller, orderId } = await setupDeliveredOrder();
      const attacker = (await createUser(ctx.module)) as Auth;
      await postUserRating(buyer, {
        receiverId: seller.id,
        orderId,
        score: 5,
        giverId: attacker.id, // enjeksiyon denemesi
      }).expect(201);
      const prisma = getPrisma();
      const row = await prisma.rating.findFirst({ where: { orderId } });
      expect(row?.giverId).toBe(buyer.id); // token sahibi, attacker değil
    });

    scenario("RAT-141", async () => {
      // XSS/HTML enjeksiyonu: <script> içeren comment kabul edilir ve HAM saklanır (render katmanı escape eder).
      const { buyer, seller, orderId } = await setupDeliveredOrder();
      const payload = "<script>alert(1)</script>";
      await postUserRating(buyer, {
        receiverId: seller.id,
        orderId,
        score: 5,
        comment: payload,
      }).expect(201);
      const prisma = getPrisma();
      const row = await prisma.rating.findFirst({ where: { orderId } });
      expect(row?.comment).toBe(payload); // sunucu ham saklar; sanitizasyon UI render'ında (React escape)
    });

    scenario("RAT-142", async () => {
      // IDOR: başkasının siparişiyle puan → 403; sipariş içeriği dönmez.
      const victim = await setupDeliveredOrder(); // ayse↔ali
      const attacker = (await createUser(ctx.module)) as Auth;
      const res = await postUserRating(attacker, {
        receiverId: victim.seller.id,
        orderId: victim.orderId,
        score: 1,
      }).expect(403);
      expect(JSON.stringify(res.body)).toContain(
        "Bu siparişi puanlama yetkiniz yok",
      );
      // Bilgi sızıntısı yok: yanıtta sipariş numarası/ürün bilgisi bulunmaz.
      expect(JSON.stringify(res.body)).not.toContain("ORD-");
    });
  });

  // ────────────────────────── küçük yardımcı ──────────────────────────
  /** Belirli giver→receiver için delivered sipariş (stat testlerinde unique orderId üretmek için). */
  async function makeOrderFor(
    giver: Auth,
    receiver: Auth,
    productId?: string,
  ): Promise<{ id: string }> {
    let pid = productId;
    if (!pid) {
      const p = await createProduct({
        sellerId: receiver.id,
        categoryId: baseline.categoryId,
      });
      pid = p.id;
    }
    return seedOrder({
      buyerId: giver.id,
      sellerId: receiver.id,
      productId: pid,
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // Saf-UI / i18n parite senaryoları — API'den assert edilecek davranış yok.
  // API tarafı davranışları ilgili aktif senaryolarla zaten kapsanır.
  // ════════════════════════════════════════════════════════════════════════
  scenario.skip(
    "RAT-120",
    'Web "değerlendir" butonu görünürlük kuralı saf istemci mantığı (isBuyer && delivered/completed ' +
      "&& !membership && eksik puan). API ucu yok; puanlama uygunluğu RAT-001/010/040/041/043/044 ile kapsanır.",
  );
  scenario.skip(
    "RAT-122",
    "Mobile RatingModal: skor=0 iken buton pasif (istemci); doğru uçlara istek RAT-001/010 ile kapsanır. Saf-UI davranışı API’den assert edilemez.",
  );
  scenario.skip(
    "RAT-125",
    "Admin reviews sayfası aksiyon/toast/liste-yenileme saf-UI. Altta yatan PATCH uçları RAT-070/071/072/077 ile kapsanır.",
  );
  scenario.skip(
    "RAT-151",
    "Web başarı/hata toast TR/EN çevirisi saf-UI i18n; backend hata mesajı (TR sabit) zaten RAT-020/021/… yanıtlarında doğrulanıyor. Çeviri katmanı API’den assert edilemez.",
  );
});
