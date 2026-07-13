/**
 * 05 — Koleksiyon & Favori (Wishlist) (COL) — Test Konsolu senaryoları.
 *
 * Yapı 01-auth.e2e-spec.ts ile birebir aynıdır (FAN-OUT şablonu): her test
 * `scenario('COL-NNN', fn)` ile manifest'e bağlanır; başlık/öncelik manifest'ten
 * otomatik gelir. Assertion'lar manifest exp'lerinden + gerçek koddan türetilmiştir:
 *   - collection.controller.ts / collection.service.ts / dto/collection.dto.ts
 *   - wishlist.controller.ts / wishlist.service.ts / dto/wishlist.dto.ts
 *   - membership.service.ts (canCreateCollection gating)
 *   - discount.service.ts (favori kampanya fiyatı)
 *
 * Paylaşılan yardımcılar: factory (createUser/authHeader/createProduct), getPrisma
 * DB assertion. Granül kurulum (membership tier'ları, discount, custom collection)
 * spec içinde getPrisma ile inline yapılır (test-utils/factory değiştirilmez).
 *
 * NOTLAR (gerçek koddan doğrulanmış davranışlar):
 *   - Test baseline'ında FREE tier `canCreateCollections: true` (db.ts:143). "Gating"
 *     senaryolarında (FREE reddi) seed'lenen free tier'ı inline `canCreateCollections:false`
 *     yaparız; kullanıcı lazy free tier alır → 403.
 *   - Slug üretimi: name.toLowerCase().replace(/[^a-z0-9çğıöşü]+/g,'-') — TR harfler
 *     (ç,ğ,ı,ö,ş,ü) KORUNUR, lowercase. "Yeni Porsche Adı" → "yeni-porsche-adı" (ı korunur).
 *   - Moderasyon test ortamında KAPALI (AI_MODERATION_ENABLED varsayılan 'false') →
 *     assertTextClean erken döner; içerik reddi DTO validasyonuyla olur.
 */
import * as request from "supertest";
import { createE2ETestApp, E2ETestApp } from "../../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../../test-utils/db";
import { createUser, authHeader } from "../../factories/user.factory";
import { createProduct } from "../../factories/product.factory";
import { scenario } from "../../test-utils/scenario";

const RANDOM_UUID = "11111111-2222-4333-8444-555555555555";

// Multipart görsel gövdesi üretici (COL-032). Multer memory storage kullanılır;
// media.service yalnız file.size + file.mimetype'a bakar (sharp yok → resize atlanır),
// storage stub uploadFile+getPresignedDownloadUrl her zaman sabit URL döndürür.
const jpegBuffer = (bytes = 4 * 1024): Buffer => {
  const buf = Buffer.alloc(bytes, 0x00);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[bytes - 2] = 0xff;
  buf[bytes - 1] = 0xd9;
  return buf;
};

describe("05 — Koleksiyon & Favori (Wishlist) (COL)", () => {
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
  });

  // ──────────────────────────── Inline kurulum yardımcıları ────────────────────────────

  /** Seed'lenen FREE tier'ı koleksiyon yetkisiz yapar (gating reddi senaryoları için). */
  async function disableFreeTierCollections(): Promise<void> {
    const prisma = getPrisma();
    await prisma.membershipTier.update({
      where: { type: "free" as any },
      data: { canCreateCollections: false },
    });
  }

  /** İstenen tier tipini (yoksa) oluşturur ve verilen kullanıcıya aktif üyelik bağlar. */
  async function attachMembership(
    userId: string,
    tierType: "free" | "basic" | "premium" | "business",
    canCreateCollections = true,
  ): Promise<void> {
    const prisma = getPrisma();
    let tier = await prisma.membershipTier.findUnique({
      where: { type: tierType as any },
    });
    if (!tier) {
      tier = await prisma.membershipTier.create({
        data: {
          type: tierType as any,
          name: `Test ${tierType}`,
          monthlyPrice: 100,
          yearlyPrice: 1000,
          maxFreeListings: 1000,
          maxTotalListings: 1000,
          maxImagesPerListing: 20,
          canCreateCollections,
          canTrade: true,
          isAdFree: true,
          isActive: true,
        },
      });
    } else if (tier.canCreateCollections !== canCreateCollections) {
      tier = await prisma.membershipTier.update({
        where: { id: tier.id },
        data: { canCreateCollections },
      });
    }
    const now = new Date();
    await prisma.userMembership.upsert({
      where: { userId },
      create: {
        userId,
        tierId: tier.id,
        status: "active" as any,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
      update: {
        tierId: tier.id,
        status: "active" as any,
        currentPeriodStart: now,
        currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  }

  /** Doğrudan DB'ye koleksiyon ekler (controller gating'i atlar). */
  async function seedCollection(opts: {
    userId: string;
    name: string;
    slug?: string;
    isPublic?: boolean;
    categoryId?: string | null;
  }): Promise<{ id: string; slug: string }> {
    const prisma = getPrisma();
    const slug =
      opts.slug ??
      opts.name
        .toLowerCase()
        .replace(/[^a-z0-9çğıöşü]+/g, "-")
        .replace(/^-|-$/g, "");
    const col = await prisma.collection.create({
      data: {
        userId: opts.userId,
        name: opts.name,
        slug,
        isPublic: opts.isPublic ?? true,
        categoryId: opts.categoryId ?? undefined,
      },
    });
    return { id: col.id, slug: col.slug };
  }

  /** Koleksiyona ürün item'ı ekler (DB). */
  async function seedItem(opts: {
    collectionId: string;
    productId?: string | null;
    customTitle?: string;
    sortOrder?: number;
  }): Promise<{ id: string }> {
    const prisma = getPrisma();
    const item = await prisma.collectionItem.create({
      data: {
        collectionId: opts.collectionId,
        productId: opts.productId ?? null,
        customTitle: opts.customTitle,
        sortOrder: opts.sortOrder ?? 0,
      },
    });
    return { id: item.id };
  }

  // İsim sınır gövdesi üretici (koleksiyon oluşturma için minimum).
  const createBody = (over: Record<string, unknown> = {}) => ({
    name: "Test Koleksiyon",
    ...over,
  });

  // Premium (koleksiyon yetkili) kullanıcı — happy-path testlerinin standart aktörü.
  async function premiumUser(email?: string) {
    const u = await createUser(ctx.module, { email, isSeller: true });
    await attachMembership(u.id, "premium", true);
    return u;
  }

  // ════════════════════════════════════════════════════════════════════════
  // OLUŞTURMA — POST /api/collections
  // ════════════════════════════════════════════════════════════════════════
  describe("POST /api/collections", () => {
    scenario("COL-001", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const res = await request(server())
        .post("/api/collections")
        .set(authHeader(ahmet))
        .send({
          name: "Porsche Vitrinim",
          description: "Tüm Porsche modellerim",
          isPublic: true,
        })
        .expect(201);

      expect(res.body.id).toBeTruthy();
      expect(res.body.name).toBe("Porsche Vitrinim");
      expect(res.body.slug).toBe("porsche-vitrinim");
      expect(res.body.isPublic).toBe(true);
      expect(res.body.viewCount).toBe(0);
      expect(res.body.likeCount).toBe(0);
      expect(res.body.itemCount).toBe(0);
      expect(res.body.userName).toBe(ahmet.displayName);

      const prisma = getPrisma();
      const count = await prisma.collection.count({
        where: { userId: ahmet.id },
      });
      expect(count).toBe(1);
    });

    scenario("COL-002", async () => {
      // FREE kullanıcı koleksiyon oluşturamaz (gating). Web modal saf-UI; API 403 doğrulanır.
      await disableFreeTierCollections();
      const free = await createUser(ctx.module, { email: "zeynep@demo.com" });
      const res = await request(server())
        .post("/api/collections")
        .set(authHeader(free))
        .send(createBody({ name: "Denemem" }))
        .expect(403);
      expect(res.body.message).toBe(
        "Koleksiyon özelliği üyeliğinizde mevcut değil. Üyeliğinizi yükseltin.",
      );
    });

    scenario("COL-003", async () => {
      // Basic tier canCreateCollections=true → 201.
      const u = await createUser(ctx.module);
      await attachMembership(u.id, "basic", true);
      const res = await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send(createBody({ name: "JDM Koleksiyonum" }))
        .expect(201);
      expect(res.body.slug).toBe("jdm-koleksiyonum");
    });

    scenario("COL-004", async () => {
      const u = await createUser(ctx.module);
      await attachMembership(u.id, "business", true);
      await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send(createBody({ name: "Premium Vitrinim" }))
        .expect(201);
    });

    scenario("COL-005", async () => {
      const ahmet = await premiumUser();
      await request(server())
        .post("/api/collections")
        .set(authHeader(ahmet))
        .send(createBody({ name: "Porsche Vitrinim" }))
        .expect(201);
      // Aynı kullanıcı + aynı isim → slug çakışması.
      const res = await request(server())
        .post("/api/collections")
        .set(authHeader(ahmet))
        .send(createBody({ name: "Porsche Vitrinim" }))
        .expect(400);
      expect(res.body.message).toBe("Bu isimde bir koleksiyonunuz zaten var");
    });

    scenario("COL-006", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      await request(server())
        .post("/api/collections")
        .set(authHeader(ahmet))
        .send(createBody({ name: "Porsche Vitrinim" }))
        .expect(201);
      const res = await request(server())
        .post("/api/collections")
        .set(authHeader(ayse))
        .send(createBody({ name: "Porsche Vitrinim" }))
        .expect(201);
      expect(res.body.slug).toBe("porsche-vitrinim");
      expect(res.body.userId).toBe(ayse.id);
    });

    scenario("COL-007", async () => {
      const u = await premiumUser();
      // 2 karakter → MinLength(3) ihlali.
      await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send({ name: "ab" })
        .expect(400);
      // 101 karakter → MaxLength(100) ihlali.
      await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send({ name: "x".repeat(101) })
        .expect(400);
      // Tam 3 karakter → 201 (sınır dahil).
      await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send({ name: "abc" })
        .expect(201);
    });

    scenario("COL-008", async () => {
      const u = await premiumUser();
      // 501 karakter description → MaxLength(500) ihlali.
      await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send({ name: "Test1", description: "d".repeat(501) })
        .expect(400);
      // description yok → 201, yanıtta description undefined.
      const res = await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send({ name: "Test2" })
        .expect(201);
      expect(res.body.description).toBeUndefined();
    });

    scenario("COL-009", async () => {
      // Tek boşluk (uzunluk 1) → MinLength(3) ihlaliyle reddedilir; koleksiyon oluşmaz.
      const u = await premiumUser();
      await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send({ name: " " })
        .expect(400);
      const prisma = getPrisma();
      expect(await prisma.collection.count({ where: { userId: u.id } })).toBe(
        0,
      );
    });

    scenario("COL-010", async () => {
      const u = await premiumUser();
      // 1) categoryId UUID değil → 400.
      await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send({ name: "KatTest", categoryId: "not-a-uuid" })
        .expect(400);
      // 2) Geçerli UUID ama DB'de yok → FK ihlali (Prisma) — controller 4xx/5xx.
      const res = await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send({ name: "KatTest2", categoryId: RANDOM_UUID });
      expect(res.status).toBeGreaterThanOrEqual(400);
      const prisma = getPrisma();
      expect(
        await prisma.collection.findFirst({
          where: { userId: u.id, name: "KatTest2" },
        }),
      ).toBeNull();
    });

    scenario("COL-088", async () => {
      // TR karakterli ad → slug TR harfleri korur, lowercase.
      const u = await premiumUser();
      const res = await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send({ name: "Şahane Öğütülmüş Çığ" })
        .expect(201);
      expect(res.body.slug).toBe("şahane-öğütülmüş-çığ");
    });

    scenario("COL-089", async () => {
      // Yalnızca özel karakterli ad (MinLength 3 geçer) → boş slug. İkinci boş-slug çakışır.
      const u = await premiumUser();
      const first = await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send({ name: "!!! @@@" })
        .expect(201);
      // Boş slug riski: slug boş string olur.
      expect(first.body.slug).toBe("");
      // Aynı kullanıcı ikinci boş-slug ad → @@unique([userId,slug]) çakışması → 400.
      const second = await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send({ name: "### $$$" });
      expect(second.status).toBe(400);
    });

    scenario("COL-101", async () => {
      // XSS payload: moderasyon kapalı → kabul edilir; depolama ham metin (encoding render-time).
      const u = await premiumUser();
      const res = await request(server())
        .post("/api/collections")
        .set(authHeader(u))
        .send({ name: "<script>alert(1)</script>" })
        .expect(201);
      const prisma = getPrisma();
      const col = await prisma.collection.findUnique({
        where: { id: res.body.id },
      });
      // API HTML-encode etmez; ham saklanır (web React encoding ile XSS engellenir).
      expect(col?.name).toBe("<script>alert(1)</script>");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // GÜNCELLEME / SİLME — PATCH/DELETE /api/collections/:id
  // ════════════════════════════════════════════════════════════════════════
  describe("PATCH/DELETE /api/collections/:id", () => {
    scenario("COL-011", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Porsche Vitrinim",
      });
      const res = await request(server())
        .patch(`/api/collections/${col.id}`)
        .set(authHeader(ahmet))
        .send({ name: "Yeni Porsche Adı" })
        .expect(200);
      expect(res.body.name).toBe("Yeni Porsche Adı");
      expect(res.body.slug).toBe("yeni-porsche-adı");
    });

    scenario("COL-012", async () => {
      const ahmet = await premiumUser();
      await seedCollection({ userId: ahmet.id, name: "A Koleksiyonu" });
      const b = await seedCollection({
        userId: ahmet.id,
        name: "B Koleksiyonu",
      });
      const res = await request(server())
        .patch(`/api/collections/${b.id}`)
        .set(authHeader(ahmet))
        .send({ name: "A Koleksiyonu" })
        .expect(400);
      expect(res.body.message).toBe("Bu isimde bir koleksiyonunuz zaten var");
    });

    scenario("COL-013", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Porsche Vitrinim",
      });
      const res = await request(server())
        .patch(`/api/collections/${col.id}`)
        .set(authHeader(ayse))
        .send({ name: "Hacklendi" })
        .expect(403);
      expect(res.body.message).toBe("Bu koleksiyonu düzenleme yetkiniz yok");
    });

    scenario("COL-014", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Kategorili",
        categoryId: baseline.categoryId,
      });
      // 1) isPublic=false.
      const r1 = await request(server())
        .patch(`/api/collections/${col.id}`)
        .set(authHeader(ahmet))
        .send({ isPublic: false })
        .expect(200);
      expect(r1.body.isPublic).toBe(false);
      // 2) categoryId null → disconnect.
      const r2 = await request(server())
        .patch(`/api/collections/${col.id}`)
        .set(authHeader(ahmet))
        .send({ categoryId: null })
        .expect(200);
      expect(r2.body.category ?? null).toBeNull();
      // 3) Geçerli categoryId → yeniden bağlanır.
      const r3 = await request(server())
        .patch(`/api/collections/${col.id}`)
        .set(authHeader(ahmet))
        .send({ categoryId: baseline.categoryId })
        .expect(200);
      expect(r3.body.categoryId).toBe(baseline.categoryId);
    });

    scenario("COL-015", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Açıklamalı",
      });
      const res = await request(server())
        .patch(`/api/collections/${col.id}`)
        .set(authHeader(ahmet))
        .send({ description: "" })
        .expect(200);
      // mapper: description || undefined → boş string undefined olur.
      expect(res.body.description).toBeUndefined();
    });

    scenario("COL-016", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const col = await seedCollection({ userId: ahmet.id, name: "Silinecek" });
      await seedItem({ collectionId: col.id, customTitle: "Custom 1" });
      // ayse koleksiyonu beğensin → collection_likes satırı.
      await request(server())
        .post(`/api/collections/${col.id}/like`)
        .set(authHeader(ayse))
        .expect(200);

      await request(server())
        .delete(`/api/collections/${col.id}`)
        .set(authHeader(ahmet))
        .expect(204);

      const prisma = getPrisma();
      expect(
        await prisma.collection.findUnique({ where: { id: col.id } }),
      ).toBeNull();
      expect(
        await prisma.collectionItem.count({ where: { collectionId: col.id } }),
      ).toBe(0);
      expect(
        await prisma.collectionLike.count({ where: { collectionId: col.id } }),
      ).toBe(0);
    });

    scenario("COL-017", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const col = await seedCollection({ userId: ahmet.id, name: "Korumalı" });
      const res = await request(server())
        .delete(`/api/collections/${col.id}`)
        .set(authHeader(ayse))
        .expect(403);
      expect(res.body.message).toBe("Bu koleksiyonu silme yetkiniz yok");
    });

    scenario("COL-018", async () => {
      const ahmet = await premiumUser();
      const p = await request(server())
        .patch(`/api/collections/${RANDOM_UUID}`)
        .set(authHeader(ahmet))
        .send({ name: "Yok" })
        .expect(404);
      expect(p.body.message).toBe("Koleksiyon bulunamadı");
      const d = await request(server())
        .delete(`/api/collections/${RANDOM_UUID}`)
        .set(authHeader(ahmet))
        .expect(404);
      expect(d.body.message).toBe("Koleksiyon bulunamadı");
    });

    scenario("COL-019", async () => {
      // Dosyasız cover PATCH → 400 "Kapak resmi gerekli". (Dosyalı yol moderasyon/S3 stub gerektirir.)
      const ahmet = await premiumUser();
      const col = await seedCollection({ userId: ahmet.id, name: "Kapaklı" });
      const res = await request(server())
        .patch(`/api/collections/${col.id}/cover`)
        .set(authHeader(ahmet))
        .expect(400);
      expect(res.body.message).toBe("Kapak resmi gerekli");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ITEM EKLE/ÇIKAR/SIRALA — /api/collections/:id/items, /reorder
  // ════════════════════════════════════════════════════════════════════════
  describe("Collection items & reorder", () => {
    scenario("COL-020", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({ userId: ahmet.id, name: "Ürünlü" });
      // Önce bir item ekleyelim ki sortOrder max+1 doğrulanabilsin.
      await seedItem({ collectionId: col.id, customTitle: "C", sortOrder: 5 });
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      const res = await request(server())
        .post(`/api/collections/${col.id}/items`)
        .set(authHeader(ahmet))
        .send({ productId: product.id })
        .expect(201);
      expect(res.body.productId).toBe(product.id);
      expect(res.body.isCustom).toBe(false);
      expect(res.body.sortOrder).toBe(6); // max(5)+1
    });

    scenario("COL-021", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({ userId: ahmet.id, name: "Çift" });
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      await request(server())
        .post(`/api/collections/${col.id}/items`)
        .set(authHeader(ahmet))
        .send({ productId: product.id })
        .expect(201);
      const res = await request(server())
        .post(`/api/collections/${col.id}/items`)
        .set(authHeader(ahmet))
        .send({ productId: product.id })
        .expect(400);
      expect(res.body.message).toBe("Ürün zaten koleksiyonda");
    });

    scenario("COL-022", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({ userId: ahmet.id, name: "Yok-Ürün" });
      const res = await request(server())
        .post(`/api/collections/${col.id}/items`)
        .set(authHeader(ahmet))
        .send({ productId: RANDOM_UUID })
        .expect(404);
      expect(res.body.message).toBe("Ürün bulunamadı");
    });

    scenario("COL-023", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({ userId: ahmet.id, name: "Boş-Body" });
      const res = await request(server())
        .post(`/api/collections/${col.id}/items`)
        .set(authHeader(ahmet))
        .send({})
        .expect(400);
      expect(res.body.message).toBe(
        "Ürün ID veya custom ürün bilgileri gerekli",
      );
    });

    scenario("COL-024", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Sahip-Korumalı",
      });
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      const res = await request(server())
        .post(`/api/collections/${col.id}/items`)
        .set(authHeader(ayse))
        .send({ productId: product.id })
        .expect(403);
      expect(res.body.message).toBe("Bu koleksiyona ekleme yetkiniz yok");
    });

    scenario("COL-025", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({ userId: ahmet.id, name: "Item-Sil" });
      const item = await seedItem({
        collectionId: col.id,
        customTitle: "Custom X",
      });
      await request(server())
        .delete(`/api/collections/${col.id}/items/${item.id}`)
        .set(authHeader(ahmet))
        .expect(204);
      const prisma = getPrisma();
      expect(
        await prisma.collectionItem.findUnique({ where: { id: item.id } }),
      ).toBeNull();
    });

    scenario("COL-026", async () => {
      const ahmet = await premiumUser();
      const colA = await seedCollection({ userId: ahmet.id, name: "A" });
      const colB = await seedCollection({ userId: ahmet.id, name: "B" });
      const itemB = await seedItem({
        collectionId: colB.id,
        customTitle: "B-item",
      });
      const res = await request(server())
        .delete(`/api/collections/${colA.id}/items/${itemB.id}`)
        .set(authHeader(ahmet))
        .expect(404);
      expect(res.body.message).toBe("Koleksiyon öğesi bulunamadı");
      const prisma = getPrisma();
      expect(
        await prisma.collectionItem.findUnique({ where: { id: itemB.id } }),
      ).toBeTruthy();
    });

    scenario("COL-027", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({ userId: ahmet.id, name: "UUID-Pipe" });
      // ParseUUIDPipe → 400.
      await request(server())
        .delete(`/api/collections/${col.id}/items/not-a-uuid`)
        .set(authHeader(ahmet))
        .expect(400);
    });

    scenario("COL-028", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({ userId: ahmet.id, name: "Sırala" });
      const a = await seedItem({
        collectionId: col.id,
        customTitle: "A",
        sortOrder: 0,
      });
      const b = await seedItem({
        collectionId: col.id,
        customTitle: "B",
        sortOrder: 1,
      });
      await request(server())
        .post(`/api/collections/${col.id}/reorder`)
        .set(authHeader(ahmet))
        .send({
          items: [
            { itemId: a.id, sortOrder: 2 },
            { itemId: b.id, sortOrder: 1 },
          ],
        })
        .expect(204);
      // Detayda yeni sırayla (sortOrder asc): B(1) önce, A(2) sonra.
      const detail = await request(server())
        .get(`/api/collections/${col.id}`)
        .expect(200);
      const order = detail.body.items.map((i: any) => i.id);
      expect(order).toEqual([b.id, a.id]);
    });

    scenario("COL-029", async () => {
      // GÖZLEM/BULGU: reorder item aidiyeti kontrol etmez. Yabancı item'ın sortOrder'ı değişir.
      const ahmet = await premiumUser();
      const colA = await seedCollection({ userId: ahmet.id, name: "A" });
      const colB = await seedCollection({ userId: ahmet.id, name: "B" });
      const itemB = await seedItem({
        collectionId: colB.id,
        customTitle: "B-item",
        sortOrder: 0,
      });
      await request(server())
        .post(`/api/collections/${colA.id}/reorder`)
        .set(authHeader(ahmet))
        .send({ items: [{ itemId: itemB.id, sortOrder: 99 }] })
        .expect(204);
      const prisma = getPrisma();
      const fresh = await prisma.collectionItem.findUnique({
        where: { id: itemB.id },
      });
      // Cross-collection yan etki: itemB.sortOrder, colA reorder'ından etkilenir (IDOR/bulgu).
      expect(fresh?.sortOrder).toBe(99);
    });

    scenario("COL-030", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Sahip-Reorder",
      });
      const item = await seedItem({
        collectionId: col.id,
        customTitle: "X",
        sortOrder: 0,
      });
      const res = await request(server())
        .post(`/api/collections/${col.id}/reorder`)
        .set(authHeader(ayse))
        .send({ items: [{ itemId: item.id, sortOrder: 1 }] })
        .expect(403);
      expect(res.body.message).toBe("Bu koleksiyonu düzenleme yetkiniz yok");
    });

    scenario("COL-031", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({ userId: ahmet.id, name: "Custom" });
      const res = await request(server())
        .post(`/api/collections/${col.id}/items`)
        .set(authHeader(ahmet))
        .send({
          customTitle: "Nadir Tomica",
          customBrand: "Tomica",
          customYear: 1980,
          customScale: "1:64",
        })
        .expect(201);
      expect(res.body.isCustom).toBe(true);
      expect(res.body.productId).toBeUndefined();
      expect(res.body.productTitle).toBe("Nadir Tomica");
    });

    scenario("COL-032", async () => {
      // Custom item resimle ekleme: multipart image + customTitle → 201.
      // Moderasyon KAPALI (assertImageClean no-op); mediaService.upload sharp'sız
      // resize atlar, storage stub uploadFile→key, getPresignedDownloadUrl→sabit URL.
      // → customImageUrl presigned URL ile dolar; kayıt custom (productId null).
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Resimli-Custom",
      });
      const res = await request(server())
        .post(`/api/collections/${col.id}/items`)
        .set(authHeader(ahmet))
        .field("customTitle", "Nadir Görselli")
        .attach("image", jpegBuffer(), {
          filename: "x.jpg",
          contentType: "image/jpeg",
        })
        .expect(201);
      expect(res.body.isCustom).toBe(true);
      expect(res.body.productId).toBeUndefined();
      expect(res.body.productTitle).toBe("Nadir Görselli");
      // Stub getPresignedDownloadUrl her zaman URL döndürür → alan dolu gelir.
      expect(typeof res.body.customImageUrl).toBe("string");
      expect(res.body.customImageUrl.length).toBeGreaterThan(0);
      const prisma = getPrisma();
      const item = await prisma.collectionItem.findUnique({
        where: { id: res.body.id },
      });
      expect(item?.productId).toBeNull();
      expect(item?.customTitle).toBe("Nadir Görselli");
      expect(item?.customImageUrl).toBe(res.body.customImageUrl);
    });

    scenario("COL-033", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Boş-Custom",
      });
      // " " (tek boşluk) MinLength(1) geçer ama servis trim().length===0 → 400.
      const res = await request(server())
        .post(`/api/collections/${col.id}/items`)
        .set(authHeader(ahmet))
        .send({ customTitle: " " })
        .expect(400);
      expect(res.body.message).toBe("Custom ürün için isim zorunludur");
    });

    scenario("COL-034", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({ userId: ahmet.id, name: "Yıl-Sınır" });
      const post = (body: Record<string, unknown>) =>
        request(server())
          .post(`/api/collections/${col.id}/items`)
          .set(authHeader(ahmet))
          .send(body);
      await post({ customTitle: "Y1", customYear: 1899 }).expect(400); // Min 1900
      await post({ customTitle: "Y2", customYear: 2101 }).expect(400); // Max 2100
      await post({ customTitle: "Y3", customYear: 1900 }).expect(201);
      await post({ customTitle: "Y4", customYear: 2100 }).expect(201);
    });

    scenario("COL-035", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Alan-Sınır",
      });
      const post = (body: Record<string, unknown>) =>
        request(server())
          .post(`/api/collections/${col.id}/items`)
          .set(authHeader(ahmet))
          .send(body);
      await post({ customTitle: "x".repeat(201) }).expect(400); // customTitle MaxLength 200
      await post({
        customTitle: "ok1",
        customDescription: "d".repeat(1001),
      }).expect(400); // 1000
      await post({ customTitle: "ok2", customBrand: "b".repeat(101) }).expect(
        400,
      ); // 100
      await post({ customTitle: "ok3", customModel: "m".repeat(101) }).expect(
        400,
      ); // 100
      await post({
        customTitle: "ok4",
        customManufacturer: "n".repeat(101),
      }).expect(400); // 100
      await post({ customTitle: "ok5", customScale: "s".repeat(51) }).expect(
        400,
      ); // 50
      await post({ customTitle: "ok6", customMaterial: "r".repeat(51) }).expect(
        400,
      ); // 50
    });

    scenario("COL-036", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Mükerrer-Custom",
      });
      const post = () =>
        request(server())
          .post(`/api/collections/${col.id}/items`)
          .set(authHeader(ahmet))
          .send({ customTitle: "Nadir Tomica" });
      await post().expect(201);
      await post().expect(201); // benzersizlik yok → ikinci de oluşur.
      const prisma = getPrisma();
      expect(
        await prisma.collectionItem.count({
          where: { collectionId: col.id, customTitle: "Nadir Tomica" },
        }),
      ).toBe(2);
    });

    scenario("COL-090", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "SortOrder-Sınır",
      });
      await request(server())
        .post(`/api/collections/${col.id}/items`)
        .set(authHeader(ahmet))
        .send({ customTitle: "Neg", sortOrder: -1 })
        .expect(400); // Min(0) ihlali
    });

    scenario("COL-091", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Boş-Reorder",
      });
      await request(server())
        .post(`/api/collections/${col.id}/reorder`)
        .set(authHeader(ahmet))
        .send({ items: [] })
        .expect(204); // boş transaction, hata yok
    });

    scenario("COL-092", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({ userId: ahmet.id, name: "Items-Yok" });
      await request(server())
        .post(`/api/collections/${col.id}/reorder`)
        .set(authHeader(ahmet))
        .send({})
        .expect(400); // @IsArray() items eksik
    });

    scenario("COL-085", async () => {
      // Eşzamanlı çift ekleme: biri 201, diğeri 400 (P2002 → "Ürün zaten koleksiyonda"); 500 değil.
      const ahmet = await premiumUser();
      const col = await seedCollection({ userId: ahmet.id, name: "Eşzamanlı" });
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      const fire = () =>
        request(server())
          .post(`/api/collections/${col.id}/items`)
          .set(authHeader(ahmet))
          .send({ productId: product.id });
      const [r1, r2] = await Promise.all([fire(), fire()]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 400]);
      expect(statuses).not.toContain(500);
      const prisma = getPrisma();
      expect(
        await prisma.collectionItem.count({
          where: { collectionId: col.id, productId: product.id },
        }),
      ).toBe(1);
    });

    scenario("COL-098", async () => {
      // IDOR matrisi. (1) yabancı item silme → 403. (2) kendi koleksiyonunda yabancı itemId reorder → değişir (bulgu).
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const ahmetCol = await seedCollection({
        userId: ahmet.id,
        name: "Ahmet",
      });
      const ahmetItem = await seedItem({
        collectionId: ahmetCol.id,
        customTitle: "Ah-item",
        sortOrder: 0,
      });

      // (1) ayse ahmet'in item'ını ahmet'in koleksiyonundan silmeye çalışır → sahip değil → 403.
      const del = await request(server())
        .delete(`/api/collections/${ahmetCol.id}/items/${ahmetItem.id}`)
        .set(authHeader(ayse))
        .expect(403);
      expect(del.body.message).toBe("Bu koleksiyondan silme yetkiniz yok");

      // (2) ayse kendi koleksiyonunda ahmet'in itemId'sini reorder'lar → sahip kontrolü geçer → yabancı item değişir.
      const ayseCol = await seedCollection({ userId: ayse.id, name: "Ayse" });
      await request(server())
        .post(`/api/collections/${ayseCol.id}/reorder`)
        .set(authHeader(ayse))
        .send({ items: [{ itemId: ahmetItem.id, sortOrder: 77 }] })
        .expect(204);
      const prisma = getPrisma();
      const fresh = await prisma.collectionItem.findUnique({
        where: { id: ahmetItem.id },
      });
      expect(fresh?.sortOrder).toBe(77); // IDOR riski doğrulandı (bulgu).
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // GÖRÜNTÜLEME — GET /api/collections/:id, /slug/:slug, /user/:id, /me
  // ════════════════════════════════════════════════════════════════════════
  describe("Collection viewing & privacy", () => {
    scenario("COL-037", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Best JDM",
        slug: "best-jdm",
        isPublic: true,
      });
      // Görüntüleme kullanıcı başına tekil sayılır (collectionView üzerinden dedup); viewerId
      // olmadan dedup edilemediği için anonim görüntüleme SAYILMAZ. Sadece giriş yapmış,
      // sahip olmayan üyenin ilk görüntülemesi +1 sayılır.
      await request(server()).get("/api/collections/slug/best-jdm").expect(200); // anonim → sayılmaz
      const res = await request(server())
        .get("/api/collections/slug/best-jdm")
        .set(authHeader(ayse))
        .expect(200);
      expect(res.body.id).toBe(col.id);
      const prisma = getPrisma();
      const after = await prisma.collection.findUnique({
        where: { id: col.id },
      });
      expect(after?.viewCount).toBe(1); // yalnız giriş yapmış yabancı görüntüleme
    });

    scenario("COL-038", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const priv = await seedCollection({
        userId: ahmet.id,
        name: "Gizli",
        isPublic: false,
      });
      // 1) Anonim.
      const anon = await request(server())
        .get(`/api/collections/${priv.id}`)
        .expect(403);
      expect(anon.body.message).toBe("Bu koleksiyon özel");
      // 2) Yabancı üye.
      const other = await request(server())
        .get(`/api/collections/${priv.id}`)
        .set(authHeader(ayse))
        .expect(403);
      expect(other.body.message).toBe("Bu koleksiyon özel");
    });

    scenario("COL-039", async () => {
      const ahmet = await premiumUser();
      const priv = await seedCollection({
        userId: ahmet.id,
        name: "Sahip-Gizli",
        isPublic: false,
      });
      const res = await request(server())
        .get(`/api/collections/${priv.id}`)
        .set(authHeader(ahmet))
        .expect(200);
      expect(res.body.id).toBe(priv.id);
      const prisma = getPrisma();
      const after = await prisma.collection.findUnique({
        where: { id: priv.id },
      });
      expect(after?.viewCount).toBe(0); // sahip görüntülemesi sayılmaz
    });

    scenario("COL-040", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const pub = await seedCollection({
        userId: ahmet.id,
        name: "Açık",
        isPublic: true,
      });
      await seedCollection({
        userId: ahmet.id,
        name: "Kapalı",
        isPublic: false,
      });
      // 1) ayse ahmet'in listesini görür → yalnızca public.
      const r1 = await request(server())
        .get(`/api/collections/user/${ahmet.id}`)
        .set(authHeader(ayse))
        .expect(200);
      expect(r1.body.total).toBe(1);
      expect(r1.body.collections[0].id).toBe(pub.id);
      // 2) ahmet kendi listesini görür → public+private.
      const r2 = await request(server())
        .get(`/api/collections/user/${ahmet.id}`)
        .set(authHeader(ahmet))
        .expect(200);
      expect(r2.body.total).toBe(2);
    });

    scenario("COL-041", async () => {
      const ahmet = await premiumUser();
      await seedCollection({ userId: ahmet.id, name: "Açık", isPublic: true });
      await seedCollection({
        userId: ahmet.id,
        name: "Kapalı",
        isPublic: false,
      });
      const res = await request(server())
        .get("/api/collections/me")
        .set(authHeader(ahmet))
        .expect(200);
      expect(res.body.total).toBe(2); // public+private
      // createdAt desc — en yeni "Kapalı" önce.
      const dates = res.body.collections.map((c: any) =>
        new Date(c.createdAt).getTime(),
      );
      expect(dates[0]).toBeGreaterThanOrEqual(dates[1]);
    });

    scenario("COL-042", async () => {
      await request(server()).get("/api/collections/me").expect(401);
    });

    scenario("COL-051", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const kaan = await premiumUser("kaan@demo.com");
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Liked-Flag",
        isPublic: true,
      });
      await request(server())
        .post(`/api/collections/${col.id}/like`)
        .set(authHeader(ayse))
        .expect(200);
      // ayse → isLiked true
      const a = await request(server())
        .get(`/api/collections/${col.id}`)
        .set(authHeader(ayse))
        .expect(200);
      expect(a.body.isLiked).toBe(true);
      // kaan → isLiked false
      const k = await request(server())
        .get(`/api/collections/${col.id}`)
        .set(authHeader(kaan))
        .expect(200);
      expect(k.body.isLiked).toBe(false);
      // anonim → isLiked false
      const anon = await request(server())
        .get(`/api/collections/${col.id}`)
        .expect(200);
      expect(anon.body.isLiked).toBe(false);
    });

    scenario("COL-100", async () => {
      // Cross-tenant erişim engellenir; içerik dönmez.
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const priv = await seedCollection({
        userId: ahmet.id,
        name: "Sızıntı",
        slug: "sizinti",
        isPublic: false,
      });
      await seedItem({ collectionId: priv.id, customTitle: "gizli-item" });
      const byId = await request(server())
        .get(`/api/collections/${priv.id}`)
        .set(authHeader(ayse))
        .expect(403);
      expect(byId.body.message).toBe("Bu koleksiyon özel");
      expect(byId.body.items).toBeUndefined();
      const bySlug = await request(server())
        .get("/api/collections/slug/sizinti")
        .set(authHeader(ayse))
        .expect(403);
      expect(bySlug.body.message).toBe("Bu koleksiyon özel");
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // BEĞENİ — POST/DELETE /api/collections/:id/like, /liked
  // ════════════════════════════════════════════════════════════════════════
  describe("Collection likes", () => {
    scenario("COL-043", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Beğenilecek",
        isPublic: true,
      });
      const res = await request(server())
        .post(`/api/collections/${col.id}/like`)
        .set(authHeader(ayse))
        .expect(200);
      expect(res.body.liked).toBe(true);
      expect(res.body.likeCount).toBe(1);
      const prisma = getPrisma();
      expect(
        await prisma.collectionLike.count({
          where: { collectionId: col.id, userId: ayse.id },
        }),
      ).toBe(1);
    });

    scenario("COL-044", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Toggle",
        isPublic: true,
      });
      await request(server())
        .post(`/api/collections/${col.id}/like`)
        .set(authHeader(ayse))
        .expect(200);
      // İkinci POST → toggle off.
      const res = await request(server())
        .post(`/api/collections/${col.id}/like`)
        .set(authHeader(ayse))
        .expect(200);
      expect(res.body.liked).toBe(false);
      const prisma = getPrisma();
      expect(
        await prisma.collectionLike.count({
          where: { collectionId: col.id, userId: ayse.id },
        }),
      ).toBe(0);
    });

    scenario("COL-045", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Delete-Like",
        isPublic: true,
      });
      await request(server())
        .post(`/api/collections/${col.id}/like`)
        .set(authHeader(ayse))
        .expect(200);
      const res = await request(server())
        .delete(`/api/collections/${col.id}/like`)
        .set(authHeader(ayse))
        .expect(200);
      expect(res.body.liked).toBe(false);
      expect(res.body.likeCount).toBe(0);
    });

    scenario("COL-046", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Delete-NoLike",
        isPublic: true,
      });
      const res = await request(server())
        .delete(`/api/collections/${col.id}/like`)
        .set(authHeader(ayse))
        .expect(200);
      expect(res.body.liked).toBe(false);
      expect(res.body.likeCount).toBe(0); // değişmez
    });

    scenario("COL-047", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Kendi",
        isPublic: true,
      });
      const res = await request(server())
        .post(`/api/collections/${col.id}/like`)
        .set(authHeader(ahmet))
        .expect(400);
      expect(res.body.message).toBe("Kendi koleksiyonunuzu beğenemezsiniz");
      const prisma = getPrisma();
      const after = await prisma.collection.findUnique({
        where: { id: col.id },
      });
      expect(after?.likeCount).toBe(0);
    });

    scenario("COL-048", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const priv = await seedCollection({
        userId: ahmet.id,
        name: "Gizli-Beğeni",
        slug: "gizli-begeni",
        isPublic: false,
      });
      const res = await request(server())
        .post("/api/collections/gizli-begeni/like")
        .set(authHeader(ayse))
        .expect(403);
      expect(res.body.message).toBe("Bu koleksiyon özel");
    });

    scenario("COL-049", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Anon-Like",
        isPublic: true,
      });
      await request(server())
        .post(`/api/collections/${col.id}/like`)
        .expect(401);
    });

    scenario("COL-050", async () => {
      const ayse = await premiumUser();
      const res = await request(server())
        .post(`/api/collections/${RANDOM_UUID}/like`)
        .set(authHeader(ayse))
        .expect(404);
      expect(res.body.message).toBe("Koleksiyon bulunamadı");
    });

    scenario("COL-056", async () => {
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const c1 = await seedCollection({
        userId: ahmet.id,
        name: "L1",
        isPublic: true,
      });
      const c2 = await seedCollection({
        userId: ahmet.id,
        name: "L2",
        isPublic: true,
      });
      await request(server())
        .post(`/api/collections/${c1.id}/like`)
        .set(authHeader(ayse))
        .expect(200);
      await request(server())
        .post(`/api/collections/${c2.id}/like`)
        .set(authHeader(ayse))
        .expect(200);
      const res = await request(server())
        .get("/api/collections/liked")
        .set(authHeader(ayse))
        .expect(200);
      expect(res.body.total).toBe(2);
      expect(res.body.collections.every((c: any) => c.isLiked === true)).toBe(
        true,
      );
      expect(String(res.headers["cache-control"])).toContain("no-store");
    });

    scenario("COL-057", async () => {
      // Beğenilen private koleksiyon (ayse sahip değil) liked listesinden filtrelenir.
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const pub = await seedCollection({
        userId: ahmet.id,
        name: "Pub",
        isPublic: true,
      });
      const priv = await seedCollection({
        userId: ahmet.id,
        name: "Priv",
        isPublic: true,
      });
      await request(server())
        .post(`/api/collections/${pub.id}/like`)
        .set(authHeader(ayse))
        .expect(200);
      await request(server())
        .post(`/api/collections/${priv.id}/like`)
        .set(authHeader(ayse))
        .expect(200);
      // Sonradan priv'i gizli yap.
      const prisma = getPrisma();
      await prisma.collection.update({
        where: { id: priv.id },
        data: { isPublic: false },
      });
      const res = await request(server())
        .get("/api/collections/liked")
        .set(authHeader(ayse))
        .expect(200);
      const ids = res.body.collections.map((c: any) => c.id);
      expect(ids).toContain(pub.id);
      expect(ids).not.toContain(priv.id); // validLikes filtresi private+yabancı → görünmez
    });

    scenario("COL-058", async () => {
      await request(server()).get("/api/collections/liked").expect(401);
    });

    scenario("COL-087", async () => {
      // İki kullanıcı eşzamanlı like → DB likeCount 2; detay GET doğru DB değeri.
      const ahmet = await premiumUser("ahmet@demo.com");
      const ayse = await premiumUser("ayse@demo.com");
      const kaan = await premiumUser("kaan@demo.com");
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Concurrent-Like",
        isPublic: true,
      });
      await Promise.all([
        request(server())
          .post(`/api/collections/${col.id}/like`)
          .set(authHeader(ayse)),
        request(server())
          .post(`/api/collections/${col.id}/like`)
          .set(authHeader(kaan)),
      ]);
      const prisma = getPrisma();
      const after = await prisma.collection.findUnique({
        where: { id: col.id },
      });
      expect(after?.likeCount).toBe(2);
      expect(
        await prisma.collectionLike.count({ where: { collectionId: col.id } }),
      ).toBe(2);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // BROWSE — GET /api/collections/browse
  // ════════════════════════════════════════════════════════════════════════
  describe("Browse public collections", () => {
    scenario("COL-052", async () => {
      const ahmet = await premiumUser();
      await seedCollection({
        userId: ahmet.id,
        name: "Açık-1",
        isPublic: true,
      });
      await seedCollection({
        userId: ahmet.id,
        name: "Gizli-1",
        isPublic: false,
      });
      const res = await request(server())
        .get("/api/collections/browse?page=1&pageSize=20")
        .expect(200);
      expect(res.body.page).toBe(1);
      expect(res.body.pageSize).toBe(20);
      expect(Array.isArray(res.body.collections)).toBe(true);
      // Yalnızca public.
      expect(res.body.collections.every((c: any) => c.isPublic === true)).toBe(
        true,
      );
      const ids = res.body.collections.map((c: any) => c.name);
      expect(ids).toContain("Açık-1");
      expect(ids).not.toContain("Gizli-1");
    });

    scenario("COL-053", async () => {
      const ahmet = await premiumUser();
      await seedCollection({ userId: ahmet.id, name: "Çita", isPublic: true });
      await seedCollection({ userId: ahmet.id, name: "Aslan", isPublic: true });
      await seedCollection({ userId: ahmet.id, name: "Bizon", isPublic: true });
      for (const sortBy of [
        "popular",
        "recent",
        "name",
        "items_asc",
        "items_desc",
      ]) {
        const res = await request(server())
          .get(`/api/collections/browse?sortBy=${sortBy}`)
          .expect(200);
        expect(res.body.total).toBeGreaterThanOrEqual(3);
      }
      // name sıralaması TR collator: Aslan, Bizon, Çita
      const byName = await request(server())
        .get("/api/collections/browse?sortBy=name&pageSize=100")
        .expect(200);
      const names = byName.body.collections.map((c: any) => c.name);
      expect(names.indexOf("Aslan")).toBeLessThan(names.indexOf("Bizon"));
      expect(names.indexOf("Bizon")).toBeLessThan(names.indexOf("Çita"));
    });

    scenario("COL-054", async () => {
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        displayName: "Ahmet",
      });
      await attachMembership(ahmet.id, "premium", true);
      await seedCollection({
        userId: ahmet.id,
        name: "JDM Severler",
        isPublic: true,
      });
      // 1) İsim eşleşmesi.
      const r1 = await request(server())
        .get("/api/collections/browse?search=JDM")
        .expect(200);
      expect(
        r1.body.collections.some((c: any) => c.name === "JDM Severler"),
      ).toBe(true);
      // 2) Kullanıcı adı eşleşmesi.
      const r2 = await request(server())
        .get("/api/collections/browse?search=Ahmet")
        .expect(200);
      expect(r2.body.collections.some((c: any) => c.userName === "Ahmet")).toBe(
        true,
      );
      // 3) Eşleşmeyen → boş.
      const r3 = await request(server())
        .get("/api/collections/browse?search=zzzz-yok")
        .expect(200);
      expect(r3.body.total).toBe(0);
      expect(r3.body.collections).toEqual([]);
    });

    scenario("COL-055", async () => {
      const ahmet = await premiumUser();
      const prisma = getPrisma();
      const araba = await prisma.category.create({
        data: { name: "Araba", slug: "araba", sortOrder: 1, isActive: true },
      });
      await seedCollection({
        userId: ahmet.id,
        name: "Araba-Koleksiyon",
        isPublic: true,
        categoryId: araba.id,
      });
      await seedCollection({
        userId: ahmet.id,
        name: "Kategorisiz",
        isPublic: true,
      });
      const res = await request(server())
        .get("/api/collections/browse?category=araba")
        .expect(200);
      expect(
        res.body.collections.every((c: any) => c.categoryId === araba.id),
      ).toBe(true);
      expect(
        res.body.collections.some((c: any) => c.name === "Araba-Koleksiyon"),
      ).toBe(true);
    });

    scenario("COL-060", async () => {
      const ahmet = await premiumUser();
      await seedCollection({
        userId: ahmet.id,
        name: "Sayfalama",
        isPublic: true,
      });
      // pageSize=0 → clamp 20 (Math.max(1,..)||20 → 20'ye/1'e clamp); 500 → 100; page<1 → 1; page=abc → 1.
      const r1 = await request(server())
        .get("/api/collections/browse?pageSize=0")
        .expect(200);
      expect(r1.body.pageSize).toBeLessThanOrEqual(100);
      expect(r1.body.pageSize).toBeGreaterThanOrEqual(1);
      const r2 = await request(server())
        .get("/api/collections/browse?pageSize=500")
        .expect(200);
      expect(r2.body.pageSize).toBe(100);
      const r3 = await request(server())
        .get("/api/collections/browse?page=-1")
        .expect(200);
      expect(r3.body.page).toBe(1);
      const r4 = await request(server())
        .get("/api/collections/browse?page=abc")
        .expect(200);
      expect(r4.body.page).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // ITEM GÖRÜNÜRLÜĞÜ — ürün statüsüne göre detay/itemCount
  // ════════════════════════════════════════════════════════════════════════
  describe("Item visibility by product status", () => {
    scenario("COL-059", async () => {
      // Liste itemCount (browse/me) ile detay itemCount tutarlı: 3 active + 1 custom = 4; draft hariç.
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Tutarlı",
        isPublic: true,
      });
      const seller = await createUser(ctx.module, { isSeller: true });
      for (let i = 0; i < 3; i++) {
        const p = await createProduct({
          sellerId: seller.id,
          categoryId: baseline.categoryId,
          status: "active",
        });
        await seedItem({ collectionId: col.id, productId: p.id, sortOrder: i });
      }
      const draft = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        status: "inactive",
      });
      await seedItem({
        collectionId: col.id,
        productId: draft.id,
        sortOrder: 3,
      });
      await seedItem({
        collectionId: col.id,
        customTitle: "Custom-1",
        sortOrder: 4,
      });

      const detail = await request(server())
        .get(`/api/collections/${col.id}`)
        .expect(200);
      expect(detail.body.itemCount).toBe(4); // 3 active + 1 custom

      const me = await request(server())
        .get("/api/collections/me")
        .set(authHeader(ahmet))
        .expect(200);
      const listed = me.body.collections.find((c: any) => c.id === col.id);
      expect(listed.itemCount).toBe(4);
    });

    scenario("COL-061", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Sold-Görünür",
        isPublic: true,
      });
      const seller = await createUser(ctx.module, { isSeller: true });
      const sold = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        status: "sold",
      });
      await seedItem({
        collectionId: col.id,
        productId: sold.id,
        sortOrder: 0,
      });
      const detail = await request(server())
        .get(`/api/collections/${col.id}`)
        .expect(200);
      const it = detail.body.items.find((i: any) => i.productId === sold.id);
      expect(it).toBeTruthy();
      expect(it.productStatus).toBe("sold");
      expect(detail.body.itemCount).toBe(1);
    });

    scenario("COL-062", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Draft-Gizli",
        isPublic: true,
      });
      const seller = await createUser(ctx.module, { isSeller: true });
      const draft = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        status: "inactive",
      });
      await seedItem({
        collectionId: col.id,
        productId: draft.id,
        sortOrder: 0,
      });
      await seedItem({
        collectionId: col.id,
        customTitle: "Custom-Kalır",
        sortOrder: 1,
      });
      const detail = await request(server())
        .get(`/api/collections/${col.id}`)
        .expect(200);
      const ids = detail.body.items.map((i: any) => i.productId);
      expect(ids).not.toContain(draft.id); // draft gizli
      expect(detail.body.itemCount).toBe(1); // sadece custom
      // Browse'da da itemCount custom dahil (VISIBLE_ITEM_FILTER: productId null veya active/sold).
      const browse = await request(server())
        .get("/api/collections/browse?pageSize=100")
        .expect(200);
      const listed = browse.body.collections.find((c: any) => c.id === col.id);
      expect(listed.itemCount).toBe(1);
    });

    scenario("COL-063", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Cascade",
        isPublic: true,
      });
      const seller = await createUser(ctx.module, { isSeller: true });
      const p = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        status: "active",
      });
      await seedItem({ collectionId: col.id, productId: p.id, sortOrder: 0 });
      const prisma = getPrisma();
      // Ürünü tamamen sil → onDelete cascade collection_items satırını da siler.
      await prisma.product.delete({ where: { id: p.id } });
      expect(
        await prisma.collectionItem.count({
          where: { collectionId: col.id, productId: p.id },
        }),
      ).toBe(0);
      const detail = await request(server())
        .get(`/api/collections/${col.id}`)
        .expect(200);
      expect(
        detail.body.items.find((i: any) => i.productId === p.id),
      ).toBeUndefined();
      expect(detail.body.itemCount).toBe(0);
    });

    scenario("COL-064", async () => {
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Reactivate",
        isPublic: true,
      });
      const seller = await createUser(ctx.module, { isSeller: true });
      const p = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
        status: "inactive",
      });
      await seedItem({ collectionId: col.id, productId: p.id, sortOrder: 0 });
      // İlk durum: gizli.
      const before = await request(server())
        .get(`/api/collections/${col.id}`)
        .expect(200);
      expect(before.body.itemCount).toBe(0);
      // Active yap.
      const prisma = getPrisma();
      await prisma.product.update({
        where: { id: p.id },
        data: { status: "active" as any },
      });
      const after = await request(server())
        .get(`/api/collections/${col.id}`)
        .expect(200);
      expect(after.body.items.some((i: any) => i.productId === p.id)).toBe(
        true,
      );
      expect(after.body.itemCount).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // FAVORİ (WISHLIST) — /api/wishlist
  // ════════════════════════════════════════════════════════════════════════
  describe("Wishlist", () => {
    scenario("COL-065", async () => {
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const deniz = await createUser(ctx.module, { email: "deniz@demo.com" });
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      const res = await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: product.id })
        .expect(201);
      expect(res.body.productId).toBe(product.id);
      const prisma = getPrisma();
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.likeCount).toBe(1); // +1
    });

    scenario("COL-066", async () => {
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const deniz = await createUser(ctx.module, { email: "deniz@demo.com" });
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: product.id })
        .expect(201);
      // İkinci ekleme idempotent → var olan döner (201 veya 200).
      const res = await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: product.id });
      expect([200, 201]).toContain(res.status);
      const prisma = getPrisma();
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.likeCount).toBe(1); // artmaz (transaction'a girilmez)
      expect(
        await prisma.wishlistItem.count({ where: { productId: product.id } }),
      ).toBe(1);
    });

    scenario("COL-067", async () => {
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      const res = await request(server())
        .post("/api/wishlist")
        .set(authHeader(ahmet))
        .send({ productId: product.id })
        .expect(400);
      expect(res.body.message).toBe(
        "Kendi ürününüzü istek listesine ekleyemezsiniz",
      );
    });

    scenario("COL-068", async () => {
      const deniz = await createUser(ctx.module);
      const res = await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: RANDOM_UUID })
        .expect(404);
      expect(res.body.message).toBe("Ürün bulunamadı");
    });

    scenario("COL-069", async () => {
      const deniz = await createUser(ctx.module);
      // 1) Geçersiz UUID.
      const r1 = await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: "123" })
        .expect(400);
      expect(JSON.stringify(r1.body.message)).toContain(
        "Geçerli bir ürün ID giriniz",
      );
      // 2) Boş body.
      const r2 = await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({})
        .expect(400);
      expect(JSON.stringify(r2.body.message)).toContain("Ürün ID gereklidir");
    });

    scenario("COL-070", async () => {
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const deniz = await createUser(ctx.module, { email: "deniz@demo.com" });
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: product.id })
        .expect(201);
      await request(server())
        .delete(`/api/wishlist/${product.id}`)
        .set(authHeader(deniz))
        .expect(204);
      const check = await request(server())
        .get(`/api/wishlist/check/${product.id}`)
        .set(authHeader(deniz))
        .expect(200);
      expect(check.body.inWishlist).toBe(false);
      const prisma = getPrisma();
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      expect(p?.likeCount).toBe(0); // N-1
    });

    scenario("COL-071", async () => {
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const deniz = await createUser(ctx.module, { email: "deniz@demo.com" });
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      const other = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      // deniz'in wishlist'i var ama bu ürün listede değil → 404 "Ürün istek listenizde değil".
      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: product.id })
        .expect(201);
      const res = await request(server())
        .delete(`/api/wishlist/${other.id}`)
        .set(authHeader(deniz))
        .expect(404);
      expect(res.body.message).toBe("Ürün istek listenizde değil");
    });

    scenario("COL-072", async () => {
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const ceren = await createUser(ctx.module, { email: "ceren@demo.com" });
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      // ceren'in hiç wishlist'i yok → 404 "İstek listesi bulunamadı".
      const res = await request(server())
        .delete(`/api/wishlist/${product.id}`)
        .set(authHeader(ceren))
        .expect(404);
      expect(res.body.message).toBe("İstek listesi bulunamadı");
    });

    scenario("COL-073", async () => {
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const deniz = await createUser(ctx.module, { email: "deniz@demo.com" });
      const inList = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      const notIn = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: inList.id })
        .expect(201);
      const r1 = await request(server())
        .get(`/api/wishlist/check/${inList.id}`)
        .set(authHeader(deniz))
        .expect(200);
      expect(r1.body.inWishlist).toBe(true);
      const r2 = await request(server())
        .get(`/api/wishlist/check/${notIn.id}`)
        .set(authHeader(deniz))
        .expect(200);
      expect(r2.body.inWishlist).toBe(false);
    });

    scenario("COL-074", async () => {
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const deniz = await createUser(ctx.module, { email: "deniz@demo.com" });
      // Boş kullanıcı → lazy wishlist, items boş.
      const empty = await request(server())
        .get("/api/wishlist")
        .set(authHeader(deniz))
        .expect(200);
      expect(empty.body.items).toEqual([]);
      expect(empty.body.totalItems).toBe(0);
      // Dolu.
      const p1 = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      const p2 = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: p1.id })
        .expect(201);
      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: p2.id })
        .expect(201);
      const full = await request(server())
        .get("/api/wishlist")
        .set(authHeader(deniz))
        .expect(200);
      expect(full.body.totalItems).toBe(2);
      // addedAt desc — en son eklenen (p2) önce.
      expect(full.body.items[0].productId).toBe(p2.id);
    });

    scenario("COL-075", async () => {
      // Clear → 204; GET boş. BULGU: clear deleteMany kullanır, likeCount DECREMENT ETMEZ.
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const deniz = await createUser(ctx.module, { email: "deniz@demo.com" });
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: product.id })
        .expect(201);
      await request(server())
        .delete("/api/wishlist")
        .set(authHeader(deniz))
        .expect(204);
      const after = await request(server())
        .get("/api/wishlist")
        .set(authHeader(deniz))
        .expect(200);
      expect(after.body.items).toEqual([]);
      expect(after.body.totalItems).toBe(0);
      const prisma = getPrisma();
      const p = await prisma.product.findUnique({ where: { id: product.id } });
      // Tutarsızlık: clear decrement yapmadığı için likeCount 1'de kalır.
      expect(p?.likeCount).toBe(1);
    });

    scenario("COL-076", async () => {
      const kaan = await createUser(ctx.module);
      // Hiç wishlist yokken clear → 204, hata yok.
      await request(server())
        .delete("/api/wishlist")
        .set(authHeader(kaan))
        .expect(204);
    });

    scenario("COL-077", async () => {
      // Tüm favori uçları anonim → 401.
      await request(server()).get("/api/wishlist").expect(401);
      await request(server())
        .post("/api/wishlist")
        .send({ productId: RANDOM_UUID })
        .expect(401);
      await request(server())
        .delete(`/api/wishlist/${RANDOM_UUID}`)
        .expect(401);
      await request(server())
        .get(`/api/wishlist/check/${RANDOM_UUID}`)
        .expect(401);
      await request(server()).delete("/api/wishlist").expect(401);
    });

    scenario("COL-078", async () => {
      // Kampanya indirimli fiyat: price 1000, %20 indirim → 800; originalPrice 1000.
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const deniz = await createUser(ctx.module, { email: "deniz@demo.com" });
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
        price: 1000,
      });
      const prisma = getPrisma();
      const now = new Date();
      await prisma.discount.create({
        data: {
          name: "Ürün İndirimi",
          type: "percentage" as any,
          value: 20,
          scope: "product" as any,
          targetProductIds: [product.id],
          isActive: true,
          startDate: new Date(now.getTime() - 60_000),
          endDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: product.id })
        .expect(201);
      const res = await request(server())
        .get("/api/wishlist")
        .set(authHeader(deniz))
        .expect(200);
      const item = res.body.items.find((i: any) => i.productId === product.id);
      expect(item.productPrice).toBe(800);
      expect(item.productOriginalPrice).toBe(1000);
    });

    scenario("COL-079", async () => {
      // Satılan ürün favori listede statüsüyle kalır.
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const deniz = await createUser(ctx.module, { email: "deniz@demo.com" });
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
        status: "active",
      });
      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: product.id })
        .expect(201);
      const prisma = getPrisma();
      await prisma.product.update({
        where: { id: product.id },
        data: { status: "sold" as any },
      });
      const res = await request(server())
        .get("/api/wishlist")
        .set(authHeader(deniz))
        .expect(200);
      const item = res.body.items.find((i: any) => i.productId === product.id);
      expect(item).toBeTruthy();
      expect(item.productStatus).toBe("sold");
    });

    scenario("COL-080", async () => {
      // Silinen ürün favori listeden atlanır (item kaydı varsa bile).
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const deniz = await createUser(ctx.module, { email: "deniz@demo.com" });
      const keep = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      const drop = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: keep.id })
        .expect(201);
      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: drop.id })
        .expect(201);
      const prisma = getPrisma();
      await prisma.product.delete({ where: { id: drop.id } }); // cascade → wishlist_item de silinir
      const res = await request(server())
        .get("/api/wishlist")
        .set(authHeader(deniz))
        .expect(200);
      const ids = res.body.items.map((i: any) => i.productId);
      expect(ids).toContain(keep.id);
      expect(ids).not.toContain(drop.id);
      expect(res.body.totalItems).toBe(1);
    });

    scenario("COL-086", async () => {
      // GÖZLEM/BULGU: eşzamanlı favoriye ekleme. Kod existence + ayrı transaction; P2002 map'leme YOK.
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const deniz = await createUser(ctx.module, { email: "deniz@demo.com" });
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      const fire = () =>
        request(server())
          .post("/api/wishlist")
          .set(authHeader(deniz))
          .send({ productId: product.id });
      await Promise.all([fire(), fire()]);
      const prisma = getPrisma();
      // Tek WishlistItem oluşmalı (unique constraint).
      expect(
        await prisma.wishlistItem.count({ where: { productId: product.id } }),
      ).toBe(1);
    });

    scenario("COL-099", async () => {
      // likeCount tutarlılığı: ekle(→1), çıkar(→0), tekrar ekle(→1), clear → item silinir AMA likeCount 1'de kalır (bulgu).
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const deniz = await createUser(ctx.module, { email: "deniz@demo.com" });
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      const prisma = getPrisma();
      const read = async () =>
        (await prisma.product.findUnique({ where: { id: product.id } }))
          ?.likeCount;

      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: product.id })
        .expect(201);
      expect(await read()).toBe(1);
      await request(server())
        .delete(`/api/wishlist/${product.id}`)
        .set(authHeader(deniz))
        .expect(204);
      expect(await read()).toBe(0);
      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: product.id })
        .expect(201);
      expect(await read()).toBe(1);
      await request(server())
        .delete("/api/wishlist")
        .set(authHeader(deniz))
        .expect(204);
      expect(
        await prisma.wishlistItem.count({ where: { productId: product.id } }),
      ).toBe(0);
      // Tutarsızlık: clear decrement yapmaz → likeCount 1'de kalır.
      expect(await read()).toBe(1);
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // YETKİ MATRİSİ & i18n
  // ════════════════════════════════════════════════════════════════════════
  describe("Authorization matrix & i18n", () => {
    scenario("COL-081", async () => {
      // Koleksiyon oluşturma yetki matrisi (tier'a göre 403/201).
      await disableFreeTierCollections();
      const post = (u: { accessToken: string }) =>
        request(server())
          .post("/api/collections")
          .set(authHeader(u))
          .send(
            createBody({
              name: `Mat-${Math.random().toString(36).slice(2, 8)}`,
            }),
          );

      const free = await createUser(ctx.module, { email: "zeynep@demo.com" });
      await post(free).expect(403);

      const basic = await createUser(ctx.module, { email: "mehmet@demo.com" });
      await attachMembership(basic.id, "basic", true);
      await post(basic).expect(201);

      const premium = await createUser(ctx.module, { email: "ahmet@demo.com" });
      await attachMembership(premium.id, "premium", true);
      await post(premium).expect(201);

      const business = await createUser(ctx.module, { email: "ali@demo.com" });
      await attachMembership(business.id, "business", true);
      await post(business).expect(201);
    });

    scenario("COL-082", async () => {
      // Üyeliksiz platform satıcı → lazy free tier (canCreateCollections=false) → 403.
      await disableFreeTierCollections();
      const platform = await createUser(ctx.module, {
        email: "platform@tarodan.com",
        isSeller: true,
        sellerType: "platform",
      });
      const res = await request(server())
        .post("/api/collections")
        .set(authHeader(platform))
        .send(createBody({ name: "Platform Vitrini" }))
        .expect(403);
      expect(res.body.message).toBe(
        "Koleksiyon özelliği üyeliğinizde mevcut değil. Üyeliğinizi yükseltin.",
      );
    });

    scenario("COL-083", async () => {
      // Misafir (token yok): public okuma 200; korumalı uçlar 401.
      const ahmet = await premiumUser();
      const col = await seedCollection({
        userId: ahmet.id,
        name: "Misafir",
        slug: "misafir",
        isPublic: true,
      });
      // Public okuma uçları.
      await request(server()).get("/api/collections/browse").expect(200);
      await request(server())
        .get(`/api/collections/user/${ahmet.id}`)
        .expect(200);
      await request(server()).get("/api/collections/slug/misafir").expect(200);
      await request(server()).get(`/api/collections/${col.id}`).expect(200);
      // Korumalı uçlar → 401.
      await request(server()).get("/api/collections/me").expect(401);
      await request(server()).get("/api/collections/liked").expect(401);
      await request(server())
        .post(`/api/collections/${col.id}/like`)
        .expect(401);
      await request(server())
        .post("/api/collections")
        .send(createBody())
        .expect(401);
    });

    scenario("COL-084", async () => {
      // Alıcı rolü (deniz, FREE): favori serbest ama koleksiyon premium → 403.
      await disableFreeTierCollections();
      const ahmet = await createUser(ctx.module, {
        email: "ahmet@demo.com",
        isSeller: true,
      });
      const deniz = await createUser(ctx.module, { email: "deniz@demo.com" });
      const product = await createProduct({
        sellerId: ahmet.id,
        categoryId: baseline.categoryId,
      });
      // 1) Favori → 201.
      await request(server())
        .post("/api/wishlist")
        .set(authHeader(deniz))
        .send({ productId: product.id })
        .expect(201);
      // 2) Koleksiyon → 403.
      await request(server())
        .post("/api/collections")
        .set(authHeader(deniz))
        .send(createBody({ name: "Deniz Set" }))
        .expect(403);
    });

    scenario("COL-093", async () => {
      // API mesajları TR sabit; Accept-Language: en gönderilse de TR döner (API i18n yapmaz) — bulgu.
      const ahmet = await premiumUser();
      const res = await request(server())
        .get(`/api/collections/${RANDOM_UUID}`)
        .set("Accept-Language", "en")
        .expect(404);
      expect(res.body.message).toBe("Koleksiyon bulunamadı"); // EN çeviri yok
    });
  });

  // ════════════════════════════════════════════════════════════════════════
  // SAF-UI / PARİTE — backend ile doğrulanamaz (skip, gerekçeli)
  // ════════════════════════════════════════════════════════════════════════
  scenario.skip(
    "COL-094",
    "Web /wishlist → /favorites yönlendirmesi: Next.js rota davranışı (apps/web), API kapsamı dışı.",
  );
  scenario.skip(
    "COL-095",
    "Koleksiyon/favori i18n anahtar paritesi (tr.json vs en.json): statik dosya karşılaştırması, e2e API testi değil.",
  );
  scenario.skip(
    "COL-096",
    "Web vs Mobile koleksiyon oluşturma parite (premium modal vs snackbar): istemci-UI davranışı; backend 403 COL-002/COL-081/COL-084 ile kapsanır.",
  );
  scenario.skip(
    "COL-097",
    "Web vs Mobile favori statü badge paritesi: istemci-UI render karşılaştırması; backend statüsü COL-079 ile kapsanır.",
  );
  scenario.skip(
    "COL-102",
    "Koleksiyon listesi boş durumu: UI empty-state + CTA görünümü, API kapsamı dışı.",
  );
  scenario.skip(
    "COL-103",
    "Favori listesi boş durumu: UI empty-state metni, API kapsamı dışı.",
  );
  scenario.skip(
    "COL-104",
    "Favori/Koleksiyon yükleniyor & hata UI: istemci loading/retry davranışı; GET /wishlist hata-tolerans dalı backend tarafında yapay hata enjeksiyonu gerektirir, saf-API e2e değil.",
  );
  scenario.skip(
    "COL-105",
    "Misafire favori/beğeni CTA & login yönlendirme: UI akışı; API 401 davranışı COL-077/COL-083/COL-049 ile kapsanır.",
  );
});
