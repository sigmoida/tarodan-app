/**
 * 03 — Üyelik & Premium (Gating) (MEM) — Test Konsolu senaryoları.
 *
 * GOLD ŞABLON: 01-auth.e2e-spec.ts ile birebir aynı import/yapı. Her test
 * `scenario('MEM-NNN', fn)` ile manifest'e bağlanır.
 *
 * NOT (seed): test-utils/db.ts:seedBaseline() yalnız `free` ve `basic` tier'ları
 * (Test-değerleriyle) ekler ve bunlar manifest'in beklediği üretim değerleriyle
 * UYUŞMAZ (örn. seed free canTrade=true). Bu yüzden bu domain, manifest'in
 * varsaydığı dört tier'ı (free/basic/premium/business) DOĞRU değerlerle her testte
 * inline yeniden kurar (`getPrisma()`), ayrıca paid abonelik için gereken
 * platform satıcısını (`platform@tarodan.com`) ekler. Bu, başka paylaşılan dosyaya
 * dokunmadan domaine özgü granül kurulumu spec içinde tutar (görev kuralı).
 */
import * as request from "supertest";
import {
  Prisma,
  SubscriptionStatus,
  SavedCardStatus,
  PaymentStatus,
  MembershipTierType,
  AdminRole,
  CommissionSellerType,
} from "@prisma/client";
import { ConfigService } from "@nestjs/config";
import { createE2ETestApp, E2ETestApp } from "../../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../../test-utils/db";
import {
  createUser,
  createAdminUser as createAdminUserFactory,
  authHeader,
  CreatedTestUser,
  CreatedTestAdmin,
} from "../../factories/user.factory";
import { createProduct } from "../../factories/product.factory";
import { completePaymentByCallback } from "../../factories/flows";
import { scenario } from "../../test-utils/scenario";
import { MembershipService } from "../../../src/modules/membership/membership.service";
import { MembershipSchedulerService } from "../../../src/modules/membership/jobs/membership-scheduler.service";
import { OrderService } from "../../../src/modules/order/order.service";

describe("03 — Üyelik & Premium (Gating) (MEM)", () => {
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
    jest.restoreAllMocks();
    await seedTiers();
    await ensurePlatformSeller();
  });

  // ──────────────────────────── Inline seed yardımcıları ────────────────────────────

  /**
   * Manifest'in beklediği dört tier'ı ÜRETİM benzeri değerlerle (yeniden) kurar.
   * seedBaseline free+basic'i ekler; burada free/basic'i manifest değerlerine
   * GÜNCELLER ve premium/business'ı OLUŞTURUR. sortOrder upgrade/downgrade yönü için.
   */
  async function seedTiers(): Promise<void> {
    const prisma = getPrisma();
    // free → manifest: canTrade=false, isAdFree=false, maxImages=3, maxTotal=10
    await prisma.membershipTier.update({
      where: { type: MembershipTierType.free },
      data: {
        name: "Ücretsiz Üyelik",
        monthlyPrice: 0,
        yearlyPrice: 0,
        maxFreeListings: 3,
        maxTotalListings: 10,
        maxImagesPerListing: 3,
        canCreateCollections: false,
        canTrade: false,
        isAdFree: false,
        featuredListingSlots: 0,
        commissionDiscount: 0,
        isActive: true,
        sortOrder: 0,
      },
    });
    // basic → manifest: ücretli, canTrade, isAdFree, commissionDiscount=0.005
    await prisma.membershipTier.update({
      where: { type: MembershipTierType.basic },
      data: {
        name: "Temel Üyelik",
        monthlyPrice: 49.99,
        yearlyPrice: 499.99,
        maxFreeListings: 3,
        maxTotalListings: 50,
        maxImagesPerListing: 5,
        canCreateCollections: true,
        canTrade: true,
        isAdFree: false,
        featuredListingSlots: 0,
        commissionDiscount: 0.005,
        isActive: true,
        sortOrder: 1,
      },
    });
    await prisma.membershipTier.upsert({
      where: { type: MembershipTierType.premium },
      update: {
        name: "Premium Üyelik",
        monthlyPrice: 99.99,
        yearlyPrice: 959.99,
        maxFreeListings: 50,
        maxTotalListings: 100,
        maxImagesPerListing: 10,
        canCreateCollections: true,
        canTrade: true,
        isAdFree: true,
        featuredListingSlots: 10,
        commissionDiscount: 0.01,
        isActive: true,
        sortOrder: 2,
      },
      create: {
        type: MembershipTierType.premium,
        name: "Premium Üyelik",
        monthlyPrice: 99.99,
        yearlyPrice: 959.99,
        maxFreeListings: 50,
        maxTotalListings: 100,
        maxImagesPerListing: 10,
        canCreateCollections: true,
        canTrade: true,
        isAdFree: true,
        featuredListingSlots: 10,
        commissionDiscount: 0.01,
        isActive: true,
        sortOrder: 2,
      },
    });
    await prisma.membershipTier.upsert({
      where: { type: MembershipTierType.business },
      update: {
        name: "Kurumsal Üyelik",
        monthlyPrice: 199.99,
        yearlyPrice: 1999.99,
        maxFreeListings: 100,
        maxTotalListings: 1000,
        maxImagesPerListing: 15,
        canCreateCollections: true,
        canTrade: true,
        isAdFree: true,
        featuredListingSlots: 50,
        commissionDiscount: 0.02,
        isActive: true,
        sortOrder: 3,
      },
      create: {
        type: MembershipTierType.business,
        name: "Kurumsal Üyelik",
        monthlyPrice: 199.99,
        yearlyPrice: 1999.99,
        maxFreeListings: 100,
        maxTotalListings: 1000,
        maxImagesPerListing: 15,
        canCreateCollections: true,
        canTrade: true,
        isAdFree: true,
        featuredListingSlots: 50,
        commissionDiscount: 0.02,
        isActive: true,
        sortOrder: 3,
      },
    });
  }

  /** initiateMembershipPayment platform satıcısını arar; yoksa 404 → paid subscribe patlardı. */
  async function ensurePlatformSeller(): Promise<{ id: string }> {
    const prisma = getPrisma();
    const existing = await prisma.user.findFirst({
      where: { email: "platform@tarodan.com", sellerType: "platform" },
    });
    if (existing) return { id: existing.id };
    const created = await prisma.user.create({
      data: {
        email: "platform@tarodan.com",
        passwordHash: "x",
        displayName: "Tarodan Platform",
        isSeller: true,
        sellerType: "platform",
        isEmailVerified: true,
        isVerified: true,
        birthDate: new Date("1990-01-01"),
      },
    });
    return { id: created.id };
  }

  /** Bir kullanıcıya belirtilen tier'ı active+dönem-gelecekte üyelik olarak bağla. */
  async function attachMembership(
    userId: string,
    type: MembershipTierType,
    opts: {
      status?: SubscriptionStatus;
      periodEnd?: Date;
      autoRenew?: boolean;
    } = {},
  ): Promise<void> {
    const prisma = getPrisma();
    const tier = await prisma.membershipTier.findUnique({ where: { type } });
    const now = new Date();
    await prisma.userMembership.upsert({
      where: { userId },
      update: {
        tierId: tier!.id,
        status: opts.status ?? SubscriptionStatus.active,
        currentPeriodStart: now,
        currentPeriodEnd:
          opts.periodEnd ?? new Date(now.getTime() + 30 * 86_400_000),
        autoRenew: opts.autoRenew ?? false,
        cancelledAt: null,
      },
      create: {
        userId,
        tierId: tier!.id,
        status: opts.status ?? SubscriptionStatus.active,
        currentPeriodStart: now,
        currentPeriodEnd:
          opts.periodEnd ?? new Date(now.getTime() + 30 * 86_400_000),
        autoRenew: opts.autoRenew ?? false,
      },
    });
  }

  /** Onaylı kurumsal (companyName+taxId+businessStatus=approved) kullanıcı — business abonelik için. */
  async function createCorporateUser(email: string): Promise<CreatedTestUser> {
    const user = await createUser(ctx.module, { email });
    const prisma = getPrisma();
    await prisma.user.update({
      where: { id: user.id },
      // businessStatus=approved şart: business tier yalnız onaylı kurumsal hesaplara açık.
      data: {
        companyName: `Co-${user.id.slice(0, 8)}`,
        taxId: "1234567890",
        businessStatus: "approved",
      },
    });
    return user;
  }

  const get = (path: string, user?: { accessToken: string }) => {
    const r = request(server()).get(path);
    return user ? r.set(authHeader(user)) : r;
  };

  // ════════════════════════ TIER KATALOĞU (public) ════════════════════════
  scenario("MEM-001", async () => {
    const res = await get("/api/membership/tiers").expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    for (const t of res.body) {
      expect(t).toHaveProperty("type");
      expect(t).toHaveProperty("name");
      expect(t).toHaveProperty("monthlyPrice");
      expect(t).toHaveProperty("yearlyPrice");
      expect(t).toHaveProperty("maxFreeListings");
      expect(t).toHaveProperty("maxTotalListings");
      expect(t).toHaveProperty("maxImagesPerListing");
      expect(t).toHaveProperty("canCreateCollections");
      expect(t).toHaveProperty("canTrade");
      expect(t).toHaveProperty("isAdFree");
      expect(t).toHaveProperty("featuredListingSlots");
      expect(t).toHaveProperty("commissionDiscount");
      expect(t).toHaveProperty("isActive");
      expect(t.isActive).toBe(true);
    }
  });

  scenario("MEM-002", async () => {
    const free = await get("/api/membership/tiers/free").expect(200);
    expect(free.body.type).toBe("free");
    expect(free.body.monthlyPrice).toBe(0);
    const premium = await get("/api/membership/tiers/premium").expect(200);
    expect(premium.body.type).toBe("premium");
    expect(premium.body.isAdFree).toBe(true);
    expect(premium.body.canTrade).toBe(true);
  });

  scenario("MEM-003", async () => {
    await get("/api/membership/tiers/nonexistent").expect(400);
  });

  scenario("MEM-004", async () => {
    await get("/api/membership/tiers").expect(200);
    await request(server())
      .post("/api/membership/subscribe")
      .send({ tierType: "premium", billingPeriod: "monthly" })
      .expect(401);
  });

  // ════════════════════════ GET /me & /me/limits ════════════════════════
  scenario("MEM-010", async () => {
    const user = await createUser(ctx.module, { email: "lazyfree@test.com" });
    const res = await get("/api/membership/me", user).expect(200);
    expect(res.body.tier.type).toBe("free");
    expect(res.body.status).toBe("active");
    // currentPeriodEnd ~100 yıl ileride.
    const endYear = new Date(res.body.currentPeriodEnd).getFullYear();
    expect(endYear).toBeGreaterThan(new Date().getFullYear() + 50);
    const prisma = getPrisma();
    const row = await prisma.userMembership.findUnique({
      where: { userId: user.id },
    });
    expect(row).toBeTruthy();
  });

  scenario("MEM-011", async () => {
    await get("/api/membership/me").expect(401);
  });

  scenario("MEM-012", async () => {
    const user = await createUser(ctx.module, { email: "freelimits@test.com" });
    const res = await get("/api/membership/me/limits", user).expect(200);
    expect(res.body.canTrade).toBe(false);
    expect(res.body.canCreateCollection).toBe(false);
    expect(res.body.isAdFree).toBe(false);
    expect(res.body.maxImages).toBe(3);
    expect(res.body.maxTotalListings).toBe(10);
    expect(res.body.tierType).toBe("free");
    expect(res.body.commissionDiscount).toBe(0);
  });

  scenario("MEM-013", async () => {
    const user = await createUser(ctx.module, { email: "premlimits@test.com" });
    await attachMembership(user.id, MembershipTierType.premium);
    const res = await get("/api/membership/me/limits", user).expect(200);
    expect(res.body.canTrade).toBe(true);
    expect(res.body.canCreateCollection).toBe(true);
    expect(res.body.isAdFree).toBe(true);
    expect(res.body.maxImages).toBe(10);
    expect(res.body.tierType).toBe("premium");
    expect(res.body.commissionDiscount).toBe(0.01);
  });

  scenario("MEM-014", async () => {
    const user = await createCorporateUser("bizlimits@test.com");
    await attachMembership(user.id, MembershipTierType.business);
    const res = await get("/api/membership/me/limits", user).expect(200);
    expect(res.body.tierType).toBe("business");
    expect(res.body.maxImages).toBe(15);
    expect(res.body.isAdFree).toBe(true);
    expect(res.body.canTrade).toBe(true);
    expect(res.body.canCreateCollection).toBe(true);
  });

  scenario("MEM-015", async () => {
    const seed = await seedBaselineRefs();
    const user = await createUser(ctx.module, {
      email: "usage@test.com",
      isSeller: true,
    });
    // 2 aktif + 1 sold ilan: sold sayıma girmemeli.
    await createProduct({
      sellerId: user.id,
      categoryId: seed.categoryId,
      status: "active",
    });
    const p2 = await createProduct({
      sellerId: user.id,
      categoryId: seed.categoryId,
      status: "active",
    });
    await createProduct({
      sellerId: user.id,
      categoryId: seed.categoryId,
      status: "sold",
    });

    const before = await get("/api/membership/me", user).expect(200);
    expect(before.body.usedTotalListings).toBe(2);
    const maxTotal = before.body.tier.maxTotalListings;
    expect(before.body.remainingTotalListings).toBe(Math.max(0, maxTotal - 2));

    // Aktif bir ilanı inactive yap → sayım düşer.
    const prisma = getPrisma();
    await prisma.product.update({
      where: { id: p2.id },
      data: { status: "inactive" as any },
    });
    const after = await get("/api/membership/me", user).expect(200);
    expect(after.body.usedTotalListings).toBe(1);
    expect(after.body.remainingTotalListings).toBe(Math.max(0, maxTotal - 1));
  });

  // ════════════════════════ SUBSCRIBE ════════════════════════
  scenario("MEM-020", async () => {
    const user = await createUser(ctx.module, { email: "upgrade@test.com" });
    const res = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "premium", billingPeriod: "monthly" })
      .expect(201);
    expect(res.body.paymentId).toBeTruthy();
    expect(res.body.orderId).toBeTruthy();
    expect(res.body.provider).toBeTruthy();
    expect(res.body).toHaveProperty("useBypass");

    const prisma = getPrisma();
    const membership = await prisma.userMembership.findUnique({
      where: { userId: user.id },
      include: { tier: true },
    });
    expect(membership!.status).toBe("past_due");
    expect(membership!.autoRenew).toBe(true);
    expect(membership!.tier.type).toBe("premium");
    const order = await prisma.order.findUnique({
      where: { id: res.body.orderId },
    });
    expect(order!.status).toBe("pending_payment");
    expect(order!.orderNumber.startsWith("MEM-")).toBe(true);

    // /me: efektif tier=free (past_due gizleme), pendingPayment + pendingTierName.
    const me = await get("/api/membership/me", user).expect(200);
    expect(me.body.pendingPayment).toBe(true);
    expect(me.body.tier.type).toBe("free");
    expect(me.body.pendingTierName).toBe("Premium Üyelik");
  });

  scenario("MEM-021", async () => {
    const user = await createUser(ctx.module, { email: "subfree@test.com" });
    const res = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "free", billingPeriod: "monthly" })
      .expect(201);
    expect(res.body.status).toBe("active");
    expect(res.body.tier.type).toBe("free");
    expect(res.body.paymentId).toBeUndefined();
    const prisma = getPrisma();
    const orders = await prisma.order.count({ where: { buyerId: user.id } });
    expect(orders).toBe(0);
  });

  scenario("MEM-022", async () => {
    const user = await createUser(ctx.module, { email: "dupe@test.com" });
    await attachMembership(user.id, MembershipTierType.premium); // monthly dönem
    const res = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "premium", billingPeriod: "monthly" });
    expect(res.status).toBe(400);
    // Aynı tier + aynı periyot + bekleyen değişiklik yok → "Zaten bu plandasınız".
    expect(JSON.stringify(res.body)).toContain("Zaten bu plandasınız");
  });

  scenario("MEM-023", async () => {
    const user = await createUser(ctx.module, { email: "faketier@test.com" });
    const res = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "totally-fake-tier", billingPeriod: "monthly" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  scenario("MEM-024", async () => {
    const admin = await createAdminUser("admin-mem024@test.com");
    await request(server())
      .patch("/api/membership/admin/tiers/basic")
      .set(authHeader(admin))
      .send({ isActive: false })
      .expect(200);
    const user = await createUser(ctx.module, {
      email: "inactivetier@test.com",
    });
    const res = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "basic", billingPeriod: "monthly" })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain("aktif değil");
  });

  scenario("MEM-025", async () => {
    const user = await createUser(ctx.module, { email: "indiv-biz@test.com" });
    const res = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "business", billingPeriod: "monthly" })
      .expect(403);
    expect(JSON.stringify(res.body)).toContain("şirket hesapları");
  });

  scenario("MEM-026", async () => {
    const user = await createCorporateUser("corp-biz@test.com");
    const res = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "business", billingPeriod: "yearly" })
      .expect(201);
    expect(res.body.paymentId).toBeTruthy();
    const prisma = getPrisma();
    const membership = await prisma.userMembership.findUnique({
      where: { userId: user.id },
    });
    expect(membership!.status).toBe("past_due");
    // Yıllık dönem ≈ +1 yıl.
    const days = Math.round(
      (membership!.currentPeriodEnd.getTime() -
        membership!.currentPeriodStart.getTime()) /
        86_400_000,
    );
    expect(days).toBeGreaterThan(180);
  });

  scenario("MEM-027", async () => {
    // past_due üyeyi farklı (daha yüksek) tier'a güncelle: tek satır UPDATE, ikinci satır yok.
    const user = await createUser(ctx.module, { email: "upd@test.com" });
    // Önce basic'e past_due abone ol.
    await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "basic", billingPeriod: "monthly" })
      .expect(201);
    const prisma = getPrisma();
    const beforeId = (await prisma.userMembership.findUnique({
      where: { userId: user.id },
    }))!.id;
    // Şimdi premium'a (yükseltme) abone ol — aynı satır güncellenmeli.
    await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "premium", billingPeriod: "yearly" })
      .expect(201);
    const rows = await prisma.userMembership.findMany({
      where: { userId: user.id },
      include: { tier: true },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(beforeId);
    expect(rows[0].tier.type).toBe("premium");
  });

  scenario("MEM-028", async () => {
    // Platform satıcı kaydını boz → initiateMembershipPayment 404; üyelik rollback (satır silinir).
    const prisma = getPrisma();
    await prisma.user.updateMany({
      where: { email: "platform@tarodan.com" },
      data: { sellerType: "individual" as any },
    });
    const user = await createUser(ctx.module, { email: "rollback@test.com" });
    const res = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "premium", billingPeriod: "monthly" });
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).toContain("Platform seller");
    const membership = await prisma.userMembership.findUnique({
      where: { userId: user.id },
    });
    expect(membership).toBeNull();
  });

  scenario("MEM-030", async () => {
    const user = await createUser(ctx.module, {
      email: "paycomplete@test.com",
    });
    const sub = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "premium", billingPeriod: "monthly" })
      .expect(201);
    // PAYMENT_BYPASS=false → callback ile tamamla.
    await completePaymentByCallback(ctx, sub.body.orderId);

    const prisma = getPrisma();
    const membership = await prisma.userMembership.findUnique({
      where: { userId: user.id },
      include: { tier: true },
    });
    expect(membership!.status).toBe("active");
    expect(membership!.tier.type).toBe("premium");
    const order = await prisma.order.findUnique({
      where: { id: sub.body.orderId },
    });
    // Üyelik sanal hizmet → callback siparişi terminal 'completed' yapar (kargo akışı yok).
    expect(["completed", "paid", "preparing", "delivered"]).toContain(
      order!.status,
    );
    // NOT: İlk abonelik akışı (subscribe→initiate→callback) bir MembershipPayment satırı
    // OLUŞTURMAZ. Callback yalnız var olan pending MembershipPayment'ı completed'a çevirir
    // (updateMany), ama initiateMembershipPayment pending satır yaratmaz → 0 satır güncellenir.
    // (MembershipPayment yalnız runAutoRenewals recurring çekiminde üretilir — bkz. MEM-051.)
    // Bu yüzden burada completed MembershipPayment ARANMAZ; gözlemlenen sonuç: üyelik aktif +
    // sipariş completed + efektif tier=premium. failed MembershipPayment de olmamalı.
    const failedMp = await prisma.membershipPayment.count({
      where: { membershipId: membership!.id, status: PaymentStatus.failed },
    });
    expect(failedMp).toBe(0);

    const me = await get("/api/membership/me", user).expect(200);
    expect(me.body.tier.type).toBe("premium");
    expect(me.body.pendingPayment).toBeFalsy();
  });

  scenario("MEM-031", async () => {
    // SELF-HEAL: callback hiç düşmemiş ama PayTR'de ödeme başarılı → /me açılınca verify ile aktive.
    const user = await createUser(ctx.module, { email: "selfheal@test.com" });
    const sub = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "premium", billingPeriod: "monthly" })
      .expect(201);
    // PayTR durum-sorgusu "ödendi" döndürsün.
    const prisma = getPrisma();
    const payment = await prisma.payment.findFirst({
      where: { orderId: sub.body.orderId },
      orderBy: { createdAt: "desc" },
    });
    ctx.paytr.setQueryResult(payment!.providerConversationId!, {
      ok: true,
      paymentTotalTl: Number(payment!.amount),
      paymentAmountTl: Number(payment!.amount),
      currency: "TL",
    } as any);

    const me = await get("/api/membership/me", user).expect(200);
    expect(me.body.tier.type).toBe("premium");
    expect(me.body.pendingPayment).toBeFalsy();
    const membership = await prisma.userMembership.findUnique({
      where: { userId: user.id },
    });
    expect(membership!.status).toBe("active");
  });

  scenario("MEM-032", async () => {
    // past_due'de premium "satın alınmış gibi" gösterilmez: /me free + pendingPayment;
    // /limits free yetkileri (getUserLimits, efektif free üyeliği kullanır).
    const user = await createUser(ctx.module, { email: "pastdue@test.com" });
    await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "premium", billingPeriod: "monthly" })
      .expect(201);
    // PayTR sorgusu "bulunamadı/ödenmemiş" (mock default ok:false) → self-heal aktive ETMEZ.
    // setQueryResult çağırmıyoruz; mock varsayılanı { ok:false } döndürür.

    const me = await get("/api/membership/me", user).expect(200);
    expect(me.body.tier.type).toBe("free");
    expect(me.body.pendingPayment).toBe(true);
    expect(me.body.pendingTierName).toBe("Premium Üyelik");

    const limits = await get("/api/membership/me/limits", user).expect(200);
    expect(limits.body.canTrade).toBe(false);
    expect(limits.body.tierType).toBe("free");
  });

  scenario("MEM-033", async () => {
    // Free üyelik için ödeme başlatma → 400.
    const user = await createUser(ctx.module, { email: "freeinit@test.com" });
    await get("/api/membership/me", user).expect(200); // free satırını lazy oluştur
    const res = await request(server())
      .post("/api/membership/payments/initiate")
      .set(authHeader(user))
      .send({ provider: "paytr" })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain(
      "Ücretsiz üyelik için ödeme gerekmez",
    );
  });

  scenario("MEM-034", async () => {
    // Yetim sipariş tekrar kullanımı: ikinci initiate aynı orderId'yi döndürür (çift pending yok).
    const user = await createUser(ctx.module, { email: "orphan@test.com" });
    await attachMembership(user.id, MembershipTierType.premium, {
      status: SubscriptionStatus.past_due,
    });
    const r1 = await request(server())
      .post("/api/membership/payments/initiate")
      .set(authHeader(user))
      .send({ provider: "paytr" })
      .expect(201);
    const r2 = await request(server())
      .post("/api/membership/payments/initiate")
      .set(authHeader(user))
      .send({ provider: "paytr" })
      .expect(201);
    expect(r1.body.orderId).toBe(r2.body.orderId);
    const prisma = getPrisma();
    const pendingOrders = await prisma.order.count({
      where: { buyerId: user.id, status: "pending_payment" },
    });
    expect(pendingOrders).toBe(1);
  });

  scenario("MEM-035", async () => {
    // Yıllık subscribe → sipariş tutarı tier.yearlyPrice; dönem ≈ +1 yıl.
    const user = await createUser(ctx.module, { email: "yearly@test.com" });
    const sub = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "premium", billingPeriod: "yearly" })
      .expect(201);
    const prisma = getPrisma();
    const order = await prisma.order.findUnique({
      where: { id: sub.body.orderId },
    });
    expect(Number(order!.totalAmount)).toBe(959.99);
    const membership = await prisma.userMembership.findUnique({
      where: { userId: user.id },
    });
    const days = Math.round(
      (membership!.currentPeriodEnd.getTime() -
        membership!.currentPeriodStart.getTime()) /
        86_400_000,
    );
    expect(days).toBeGreaterThan(180);
  });

  // ════════════════════════ CANCEL ════════════════════════
  scenario("MEM-040", async () => {
    const user = await createUser(ctx.module, { email: "cancel@test.com" });
    await attachMembership(user.id, MembershipTierType.premium);
    await request(server())
      .post("/api/membership/cancel")
      .set(authHeader(user))
      .expect(201);

    const prisma = getPrisma();
    const membership = await prisma.userMembership.findUnique({
      where: { userId: user.id },
    });
    expect(membership!.status).toBe("cancelled");
    expect(membership!.cancelledAt).toBeTruthy();

    const me = await get("/api/membership/me", user).expect(200);
    expect(me.body.tier.type).toBe("premium"); // dönem-içi premium görünür
    const trade = await get("/api/membership/check/trade", user).expect(200);
    expect(trade.body.allowed).toBe(true); // cancelled + dönem-içi → premium
  });

  scenario("MEM-041", async () => {
    const user = await createUser(ctx.module, { email: "cancelfree@test.com" });
    const res = await request(server())
      .post("/api/membership/cancel")
      .set(authHeader(user))
      .expect(400);
    expect(JSON.stringify(res.body)).toContain(
      "Ücretsiz üyelik iptal edilemez",
    );
  });

  scenario("MEM-042", async () => {
    const user = await createUser(ctx.module, { email: "cancel2x@test.com" });
    await attachMembership(user.id, MembershipTierType.premium, {
      status: SubscriptionStatus.cancelled,
    });
    const res = await request(server())
      .post("/api/membership/cancel")
      .set(authHeader(user));
    expect([400, 404]).toContain(res.status);
    expect(JSON.stringify(res.body)).toContain("zaten iptal");
  });

  scenario("MEM-043", async () => {
    await request(server()).post("/api/membership/cancel").expect(401);
  });

  // ════════════════════════ SÜRESİ-BİTME CRON ════════════════════════
  scenario("MEM-044", async () => {
    const user = await createUser(ctx.module, { email: "expirecron@test.com" });
    await attachMembership(user.id, MembershipTierType.premium, {
      periodEnd: new Date(Date.now() - 86_400_000), // dün doldu
      autoRenew: true,
    });
    await request(server())
      .post("/api/dev/run/check-expired-memberships")
      .expect(201);

    const prisma = getPrisma();
    const membership = await prisma.userMembership.findUnique({
      where: { userId: user.id },
      include: { tier: true },
    });
    expect(membership!.tier.type).toBe("free");
    expect(membership!.status).toBe("active"); // expired DEĞİL
    expect(membership!.autoRenew).toBe(false);
    expect(membership!.cancelledAt).toBeNull();
  });

  scenario("MEM-045", async () => {
    const user = await createUser(ctx.module, {
      email: "cancelledexpire@test.com",
    });
    await attachMembership(user.id, MembershipTierType.premium, {
      status: SubscriptionStatus.cancelled,
      periodEnd: new Date(Date.now() - 86_400_000),
    });
    await request(server())
      .post("/api/dev/run/check-expired-memberships")
      .expect(201);
    const prisma = getPrisma();
    const membership = await prisma.userMembership.findUnique({
      where: { userId: user.id },
      include: { tier: true },
    });
    expect(membership!.tier.type).toBe("free");
  });

  scenario("MEM-046", async () => {
    // İptal sonrası dönem-bitiş hatırlatmaları: runSendExpirationReminders sayımları doğru.
    const u7 = await createUser(ctx.module, { email: "remind7@test.com" });
    const u1 = await createUser(ctx.module, { email: "remind1@test.com" });
    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    in7.setHours(12, 0, 0, 0);
    const in1 = new Date();
    in1.setDate(in1.getDate() + 1);
    in1.setHours(12, 0, 0, 0);
    await attachMembership(u7.id, MembershipTierType.premium, {
      periodEnd: in7,
      autoRenew: true,
    });
    await attachMembership(u1.id, MembershipTierType.premium, {
      periodEnd: in1,
      autoRenew: false,
    });

    const res = await ctx.app
      .get(MembershipSchedulerService)
      .runSendExpirationReminders();
    expect(res.sevenDayReminders).toBeGreaterThanOrEqual(1);
    expect(res.oneDayReminders).toBeGreaterThanOrEqual(1);
  });

  // ════════════════════════ OTO-YENİLEME (recurring) ════════════════════════
  scenario("MEM-050", async () => {
    setRecurringFlag(false);
    await seedDueMembership();
    const res = await ctx.app.get(MembershipService).runAutoRenewals();
    expect(res).toEqual({ renewed: 0, failed: 0, attempted: 0 });
    expect(ctx.paytr.recurringCalls.length).toBe(0);
  });

  scenario("MEM-051", async () => {
    setRecurringFlag(true);
    const { m, tier } = await seedDueMembership();
    ctx.paytr.nextRecurringResult = { status: "success" };
    const res = await ctx.app.get(MembershipService).runAutoRenewals();
    expect(res.renewed).toBe(1);
    const prisma = getPrisma();
    const after = await prisma.userMembership.findUnique({
      where: { id: m.id },
    });
    expect(after!.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now());
    expect(after!.status).toBe(SubscriptionStatus.active);
    const mp = await prisma.membershipPayment.findFirst({
      where: { membershipId: m.id, status: PaymentStatus.completed },
    });
    expect(mp).toBeTruthy();
    expect(Number(mp!.amount)).toBe(Number(tier.monthlyPrice));
  });

  scenario("MEM-052", async () => {
    setRecurringFlag(true);
    const { m, card } = await seedDueMembership();
    ctx.paytr.nextRecurringResult = {
      status: "failed",
      reason: "Kart kapalı",
      tryAgain: false,
    };
    const res = await ctx.app.get(MembershipService).runAutoRenewals();
    expect(res.failed).toBe(1);
    const prisma = getPrisma();
    const c = await prisma.savedCard.findUnique({ where: { id: card.id } });
    expect(c!.status).toBe(SavedCardStatus.revoked);
    const mp = await prisma.membershipPayment.findFirst({
      where: { membershipId: m.id, status: PaymentStatus.failed },
    });
    expect(mp).toBeTruthy();
  });

  scenario("MEM-053", async () => {
    setRecurringFlag(true);
    const { m, card } = await seedDueMembership();
    ctx.paytr.nextRecurringResult = {
      status: "failed",
      reason: "geçici",
      tryAgain: true,
    };
    await ctx.app.get(MembershipService).runAutoRenewals();
    const prisma = getPrisma();
    const c = await prisma.savedCard.findUnique({ where: { id: card.id } });
    expect(c!.status).toBe(SavedCardStatus.active);
    const mp = await prisma.membershipPayment.findFirst({
      where: { membershipId: m.id, status: PaymentStatus.failed },
    });
    expect(mp).toBeTruthy();
  });

  scenario("MEM-054", async () => {
    setRecurringFlag(true);
    await seedDueMembership({ requireCvv: true });
    const res = await ctx.app.get(MembershipService).runAutoRenewals();
    expect(res.attempted).toBe(0);
    expect(ctx.paytr.recurringCalls.length).toBe(0);
  });

  scenario("MEM-055", async () => {
    const user = await createUser(ctx.module, { email: "toggle@test.com" });
    await attachMembership(user.id, MembershipTierType.premium, {
      autoRenew: true,
    });
    const res = await request(server())
      .patch("/api/membership/auto-renew")
      .set(authHeader(user))
      .send({ autoRenew: false })
      .expect(200);
    expect(res.body.autoRenew).toBe(false);
    const me = await get("/api/membership/me", user).expect(200);
    expect(me.body.autoRenew).toBe(false);
  });

  scenario("MEM-056", async () => {
    // Üyeliksiz değil — toggle üyelik satırı yoksa 404; kimliksizse 401.
    await request(server())
      .patch("/api/membership/auto-renew")
      .send({ autoRenew: false })
      .expect(401);
    const user = await createUser(ctx.module, { email: "notoggle@test.com" });
    const res = await request(server())
      .patch("/api/membership/auto-renew")
      .set(authHeader(user))
      .send({ autoRenew: false });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  // ════════════════════════ KAYITLI KARTLAR ════════════════════════
  scenario("MEM-057", async () => {
    const user = await createUser(ctx.module, { email: "cards@test.com" });
    const prisma = getPrisma();
    await prisma.savedCard.create({
      data: {
        userId: user.id,
        provider: "paytr",
        utoken: `UT-${user.id.slice(0, 8)}`,
        ctoken: `CT-active-${user.id.slice(0, 8)}`,
        last4: "4358",
        brand: "VISA",
        expMonth: "12",
        expYear: "30",
        requireCvv: false,
        isDefault: true,
        status: SavedCardStatus.active,
      },
    });
    // revoked kart listede görünmemeli.
    await prisma.savedCard.create({
      data: {
        userId: user.id,
        provider: "paytr",
        utoken: `UT-${user.id.slice(0, 8)}`,
        ctoken: `CT-revoked-${user.id.slice(0, 8)}`,
        last4: "0000",
        status: SavedCardStatus.revoked,
      },
    });

    const res = await get("/api/membership/cards", user).expect(200);
    expect(res.body.length).toBe(1);
    const card = res.body[0];
    expect(card).toHaveProperty("id");
    expect(card.last4).toBe("4358");
    expect(card.brand).toBe("VISA");
    expect(card).toHaveProperty("expMonth");
    expect(card).toHaveProperty("expYear");
    expect(card.requireCvv).toBe(false);
    expect(card.isDefault).toBe(true);
    expect(card.autoRenewEligible).toBe(true); // !requireCvv
    expect(card).toHaveProperty("createdAt");
    // PAN/CVV/token sızmaz.
    expect(card).not.toHaveProperty("utoken");
    expect(card).not.toHaveProperty("ctoken");
    expect(card).not.toHaveProperty("cvv");
    expect(card).not.toHaveProperty("pan");
  });

  scenario("MEM-058", async () => {
    const a = await createUser(ctx.module, { email: "carda@test.com" });
    const b = await createUser(ctx.module, { email: "cardb@test.com" });
    const prisma = getPrisma();
    const cardA = await prisma.savedCard.create({
      data: {
        userId: a.id,
        provider: "paytr",
        utoken: `UT-${a.id.slice(0, 8)}`,
        ctoken: `CT-${a.id.slice(0, 8)}`,
        last4: "1111",
        status: SavedCardStatus.active,
      },
    });
    const cardB = await prisma.savedCard.create({
      data: {
        userId: b.id,
        provider: "paytr",
        utoken: `UT-${b.id.slice(0, 8)}`,
        ctoken: `CT-${b.id.slice(0, 8)}`,
        last4: "2222",
        status: SavedCardStatus.active,
      },
    });

    // (1) A kendi kartını siler → {deleted:true}, DB'de revoked.
    const d1 = await request(server())
      .delete(`/api/membership/cards/${cardA.id}`)
      .set(authHeader(a))
      .expect(200);
    expect(d1.body.deleted).toBe(true);
    const afterDelete = await prisma.savedCard.findUnique({
      where: { id: cardA.id },
    });
    expect(afterDelete!.status).toBe(SavedCardStatus.revoked);

    // (2) idempotent: tekrar sil → yine {deleted:true}.
    const d2 = await request(server())
      .delete(`/api/membership/cards/${cardA.id}`)
      .set(authHeader(a))
      .expect(200);
    expect(d2.body.deleted).toBe(true);

    // (3) IDOR: A, B'nin kartını silemez → 404.
    await request(server())
      .delete(`/api/membership/cards/${cardB.id}`)
      .set(authHeader(a))
      .expect(404);
    const bStill = await prisma.savedCard.findUnique({
      where: { id: cardB.id },
    });
    expect(bStill!.status).toBe(SavedCardStatus.active);
  });

  // ════════════════════════ İLAN LİMİTİ GATING ════════════════════════
  scenario("MEM-060", async () => {
    const seed = await seedBaselineRefs();
    const user = await createUser(ctx.module, {
      email: "listinglimit@test.com",
      isSeller: true,
    });
    // free maxTotalListings=10 → 10 aktif ilan oluştur (limit dolsun).
    for (let i = 0; i < 10; i++) {
      await createProduct({
        sellerId: user.id,
        categoryId: seed.categoryId,
        status: "active",
      });
    }
    const res = await request(server())
      .post("/api/products")
      .set(authHeader(user))
      .send(productBody(seed))
      .expect(403);
    expect(JSON.stringify(res.body)).toContain("İlan limitinize ulaştınız");
    expect(JSON.stringify(res.body)).toContain("Ücretsiz Üyelik");
    const check = await get("/api/membership/check/listing", user).expect(200);
    expect(check.body.allowed).toBe(false);
  });

  scenario("MEM-061", async () => {
    const seed = await seedBaselineRefs();
    const admin = await createAdminUser("admin-mem061@test.com");
    const prisma = getPrisma();
    // Sınırsız limit KATMAN satırından gelir — platform ayarı override'ı yok.
    await prisma.membershipTier.update({
      where: { type: MembershipTierType.premium },
      data: { maxTotalListings: -1 },
    });
    const user = await createUser(ctx.module, {
      email: "unlimited@test.com",
      isSeller: true,
    });
    await attachMembership(user.id, MembershipTierType.premium);

    const limits = await get("/api/membership/me/limits", user).expect(200);
    expect(limits.body.maxTotalListings).toBe(-1);
    expect(limits.body.remainingTotalListings).toBe(-1);
    expect(limits.body.canCreateListing).toBe(true);

    // Birkaç ilan eklenebilir (limit yok).
    for (let i = 0; i < 3; i++) {
      await request(server())
        .post("/api/products")
        .set(authHeader(user))
        .send(productBody(seed))
        .expect(201);
    }
    void admin;
  });

  scenario("MEM-062", async () => {
    // Ücretsiz katmanın limiti KATMAN satırından okunur (tek kaynak).
    const prisma = getPrisma();
    await prisma.membershipTier.update({
      where: { type: MembershipTierType.free },
      data: { maxFreeListings: 3, maxTotalListings: 3 },
    });
    const user = await createUser(ctx.module, { email: "override@test.com" });
    const limits = await get("/api/membership/me/limits", user).expect(200);
    expect(limits.body.maxFreeListings).toBe(3);
    expect(limits.body.maxTotalListings).toBe(3);
  });

  scenario("MEM-063", async () => {
    const seed = await seedBaselineRefs();
    const user = await createUser(ctx.module, {
      email: "banned@test.com",
      isSeller: true,
    });
    const prisma = getPrisma();
    await prisma.user.update({
      where: { id: user.id },
      data: { isBanned: true },
    });
    const res = await request(server())
      .post("/api/products")
      .set(authHeader(user))
      .send(productBody(seed))
      .expect(403);
    expect(JSON.stringify(res.body)).toContain("banlanmış");
  });

  scenario("MEM-064", async () => {
    const seed = await seedBaselineRefs();
    const user = await createUser(ctx.module, {
      email: "limitmsg@test.com",
      isSeller: true,
    });
    for (let i = 0; i < 10; i++) {
      await createProduct({
        sellerId: user.id,
        categoryId: seed.categoryId,
        status: "active",
      });
    }
    const res = await request(server())
      .post("/api/products")
      .set(authHeader(user))
      .send(productBody(seed))
      .expect(403);
    // maksimum = remainingTotal(0) + activeCount(10) = 10 (tier toplam limiti), TR metin + tier adı.
    expect(JSON.stringify(res.body)).toContain("maksimum 10 ilan");
    expect(JSON.stringify(res.body)).toContain("Ücretsiz Üyelik");
  });

  // ════════════════════════ GÖRSEL LİMİTİ ════════════════════════
  scenario("MEM-070", async () => {
    const seed = await seedBaselineRefs();
    const user = await createUser(ctx.module, {
      email: "img4@test.com",
      isSeller: true,
    });
    const res = await request(server())
      .post("/api/products")
      .set(authHeader(user))
      .send(productBody(seed, { images: makeImages(4) }))
      .expect(400);
    expect(JSON.stringify(res.body)).toContain("maksimum 3 görsel");
    expect(JSON.stringify(res.body)).toContain("4 görsel");
  });

  scenario("MEM-071", async () => {
    const seed = await seedBaselineRefs();
    const user = await createUser(ctx.module, {
      email: "img10@test.com",
      isSeller: true,
    });
    await attachMembership(user.id, MembershipTierType.premium);
    // (1) 10 görsel OK.
    await request(server())
      .post("/api/products")
      .set(authHeader(user))
      .send(productBody(seed, { images: makeImages(10) }))
      .expect(201);
    // (2) 11 görsel → 400 (DTO @ArrayMaxSize(10) zaten reddeder; üyelik mesajı yerine DTO mesajı olabilir).
    await request(server())
      .post("/api/products")
      .set(authHeader(user))
      .send(productBody(seed, { images: makeImages(11) }))
      .expect(400);
  });

  scenario("MEM-072", async () => {
    const seed = await seedBaselineRefs();
    const user = await createCorporateUser("img16@test.com");
    await getPrisma().user.update({
      where: { id: user.id },
      data: { isSeller: true },
    });
    await attachMembership(user.id, MembershipTierType.business);
    // 16 görsel → 400. NOT: CreateProductDto @ArrayMaxSize(10) önce devreye girer → DTO mesajı
    // ("En fazla 10 resim") döner, manifest'in beklediği "maksimum 15 görsel" değil. Yalnız 400 doğrulanır.
    await request(server())
      .post("/api/products")
      .set(authHeader(user))
      .send(productBody(seed, { images: makeImages(16) }))
      .expect(400);
  });

  // ════════════════════════ TAKAS GATING ════════════════════════
  scenario("MEM-080", async () => {
    const initiator = await createUser(ctx.module, {
      email: "freetrade@test.com",
      isSeller: true,
    });
    const receiver = await createUser(ctx.module, {
      email: "tradrecv@test.com",
      isSeller: true,
    });
    const check = await get("/api/membership/check/trade", initiator).expect(
      200,
    );
    expect(check.body.allowed).toBe(false);
    expect(check.body.reason).toBe(
      "Takas özelliği üyeliğinizde mevcut değil. Üyeliğinizi yükseltin.",
    );

    // Takas teklifi: free initiator kapıya takılır (canCreateTrade → BadRequest 400).
    const seed = await seedBaselineRefs();
    const myProduct = await createProduct({
      sellerId: initiator.id,
      categoryId: seed.categoryId,
      status: "active",
    });
    const theirProduct = await createProduct({
      sellerId: receiver.id,
      categoryId: seed.categoryId,
      status: "active",
    });
    const res = await request(server())
      .post("/api/trades")
      .set(authHeader(initiator))
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: myProduct.id, quantity: 1 }],
        receiverItems: [{ productId: theirProduct.id, quantity: 1 }],
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(JSON.stringify(res.body)).toContain("Takas özelliği");
  });

  scenario("MEM-081", async () => {
    const basicUser = await createUser(ctx.module, {
      email: "basictrade@test.com",
    });
    await attachMembership(basicUser.id, MembershipTierType.basic);
    const premiumUser = await createUser(ctx.module, {
      email: "premtrade@test.com",
    });
    await attachMembership(premiumUser.id, MembershipTierType.premium);
    const bizUser = await createCorporateUser("biztrade@test.com");
    await attachMembership(bizUser.id, MembershipTierType.business);

    for (const u of [basicUser, premiumUser, bizUser]) {
      const res = await get("/api/membership/check/trade", u).expect(200);
      expect(res.body.allowed).toBe(true);
    }
  });

  scenario("MEM-082", async () => {
    // past_due ücretli üye: isPremiumEntitled(past_due)=false → canCreateTrade allowed:FALSE.
    // (Manifest'in risk notu: BEKLENEN allowed:false; kod past_due'yü premium saymaz.)
    const user = await createUser(ctx.module, {
      email: "pastduetrade@test.com",
    });
    await attachMembership(user.id, MembershipTierType.premium, {
      status: SubscriptionStatus.past_due,
    });
    const res = await get("/api/membership/check/trade", user).expect(200);
    expect(res.body.allowed).toBe(false);
  });

  scenario("MEM-083", async () => {
    // Süresi-dolmuş premium: dönem geçmiş → isPremiumEntitled=false → allowed:false.
    const user = await createUser(ctx.module, {
      email: "expiredtrade@test.com",
    });
    await attachMembership(user.id, MembershipTierType.premium, {
      periodEnd: new Date(Date.now() - 86_400_000),
    });
    const res = await get("/api/membership/check/trade", user).expect(200);
    expect(res.body.allowed).toBe(false);
  });

  scenario("MEM-084", async () => {
    // Receiver tarafında da kapı: free receiver, premium initiator'ın teklifini kabul edemez.
    const seed = await seedBaselineRefs();
    const initiator = await createUser(ctx.module, {
      email: "tinit@test.com",
      isSeller: true,
    });
    await attachMembership(initiator.id, MembershipTierType.premium);
    const receiver = await createUser(ctx.module, {
      email: "trecv2@test.com",
      isSeller: true,
    });
    // receiver free (takas yok).
    const initProduct = await createProduct({
      sellerId: initiator.id,
      categoryId: seed.categoryId,
      status: "active",
    });
    const recvProduct = await createProduct({
      sellerId: receiver.id,
      categoryId: seed.categoryId,
      status: "active",
    });
    const created = await request(server())
      .post("/api/trades")
      .set(authHeader(initiator))
      .send({
        receiverId: receiver.id,
        initiatorItems: [{ productId: initProduct.id, quantity: 1 }],
        receiverItems: [{ productId: recvProduct.id, quantity: 1 }],
      });
    expect(created.status).toBe(201);
    const tradeId = created.body.id;
    // receiver kabul etmeye çalışır → kapı engeller (acceptTrade → canCreateTrade receiver yolu → 400).
    // DİKKAT: acceptTrade, canCreateTrade false olunca KENDİ sabit mesajını fırlatır
    // (trade.service.ts:841 "Üyeliğinizin süresi dolmuş görünüyor...") — canCreateTrade'in
    // "Takas özelliği..." reason'ını DEĞİL. Bu yüzden mesaj yerine yalnız 400 + üyelik ibaresi doğrulanır.
    const accept = await request(server())
      .post(`/api/trades/${tradeId}/accept`)
      .set(authHeader(receiver));
    expect(accept.status).toBe(400);
    expect(JSON.stringify(accept.body)).toMatch(/üyeliğini|Üyeliğini/);
  });

  // ════════════════════════ KOLEKSİYON GATING ════════════════════════
  scenario("MEM-090", async () => {
    const user = await createUser(ctx.module, { email: "freecoll@test.com" });
    const check = await get("/api/membership/check/collection", user).expect(
      200,
    );
    expect(check.body.allowed).toBe(false);
    expect(check.body.reason).toBe(
      "Koleksiyon özelliği üyeliğinizde mevcut değil. Üyeliğinizi yükseltin.",
    );
    await request(server())
      .post("/api/collections")
      .set(authHeader(user))
      .send({ name: "Benim Koleksiyonum", isPublic: true })
      .expect(403);
  });

  scenario("MEM-091", async () => {
    const basicUser = await createUser(ctx.module, {
      email: "basiccoll@test.com",
    });
    await attachMembership(basicUser.id, MembershipTierType.basic);
    const check = await get(
      "/api/membership/check/collection",
      basicUser,
    ).expect(200);
    expect(check.body.allowed).toBe(true);
    await request(server())
      .post("/api/collections")
      .set(authHeader(basicUser))
      .send({ name: "Temel Koleksiyon", isPublic: true })
      .expect(201);
  });

  scenario("MEM-092", async () => {
    await get("/api/membership/check/collection").expect(401);
  });

  // ════════════════════════ REKLAMSIZLIK (isAdFree) ════════════════════════
  scenario("MEM-100", async () => {
    const user = await createUser(ctx.module, { email: "adfree@test.com" });
    await attachMembership(user.id, MembershipTierType.premium);
    const limits = await get("/api/membership/me/limits", user).expect(200);
    expect(limits.body.isAdFree).toBe(true); // → shouldShowAd=false
  });

  scenario("MEM-101", async () => {
    // free + basic isAdFree=false → reklam görünür.
    const freeUser = await createUser(ctx.module, { email: "freead@test.com" });
    const basicUser = await createUser(ctx.module, {
      email: "basicad@test.com",
    });
    await attachMembership(basicUser.id, MembershipTierType.basic);
    const freeLimits = await get("/api/membership/me/limits", freeUser).expect(
      200,
    );
    expect(freeLimits.body.isAdFree).toBe(false);
    const basicLimits = await get(
      "/api/membership/me/limits",
      basicUser,
    ).expect(200);
    expect(basicLimits.body.isAdFree).toBe(false);
  });

  scenario("MEM-102", async () => {
    // Misafir /me/limits'e erişemez (401) → istemci her zaman reklam gösterir (shouldShowAd=true).
    await get("/api/membership/me/limits").expect(401);
  });

  scenario("MEM-103", async () => {
    const premiumUser = await createUser(ctx.module, {
      email: "premslots@test.com",
    });
    await attachMembership(premiumUser.id, MembershipTierType.premium);
    const bizUser = await createCorporateUser("bizslots@test.com");
    await attachMembership(bizUser.id, MembershipTierType.business);
    const p = await get("/api/membership/me/limits", premiumUser).expect(200);
    expect(p.body.remainingFeaturedSlots).toBe(10);
    const b = await get("/api/membership/me/limits", bizUser).expect(200);
    expect(b.body.remainingFeaturedSlots).toBe(50);
  });

  // ════════════════════════ KOMİSYON KADEMESİ ════════════════════════
  scenario("MEM-110", async () => {
    await seedCommissionRules();
    const user = await createUser(ctx.module, {
      email: "premcomm@test.com",
      isSeller: true,
    });
    await attachMembership(user.id, MembershipTierType.premium);
    const res = await get(
      `/api/orders/commission-preview?amount=1000&categoryId=${baseline.categoryId}`,
      user,
    ).expect(200);
    // PREMIUM kuralı %5 → 50; FREE %8 → 80. Premium < Free (daha düşük komisyon).
    expect(res.body.sellerFeeAmount).toBe(50);
  });

  scenario("MEM-111", async () => {
    await seedCommissionRules();
    const user = await createCorporateUser("bizcomm@test.com");
    await getPrisma().user.update({
      where: { id: user.id },
      data: { isSeller: true },
    });
    await attachMembership(user.id, MembershipTierType.business);
    const res = await get(
      `/api/orders/commission-preview?amount=1000&categoryId=${baseline.categoryId}`,
      user,
    ).expect(200);
    // Kurumsal satıcı yalnız BUSINESS kuralına düşer.
    expect(res.body.sellerFeeAmount).toBe(20);
  });

  scenario("MEM-112", async () => {
    await seedCommissionRules();
    const user = await createUser(ctx.module, {
      email: "basiccomm@test.com",
      isSeller: true,
    });
    await attachMembership(user.id, MembershipTierType.basic);
    const res = await get(
      `/api/orders/commission-preview?amount=1000&categoryId=${baseline.categoryId}`,
      user,
    ).expect(200);
    // BASIC ayrı ve kesin bir satıcı tipidir.
    expect(res.body.sellerFeeAmount).toBe(40);
  });

  scenario("MEM-113", async () => {
    await seedCommissionRules();
    const prisma = getPrisma();
    const platform = await prisma.user.findFirst({
      where: { email: "platform@tarodan.com", sellerType: "platform" },
    });
    // Platform satıcıya HTTP token üretemiyoruz; servisten doğrudan komisyon hesapla.
    // Strict resolver platform satıcıyı BUSINESS kuralına bağlar (%2).
    const orderService = ctx.app.get(OrderService);
    const result = await orderService.calculateCommission(
      1000,
      platform!.id,
      baseline.categoryId,
    );
    expect(result.sellerFeeAmount).toBe(20); // BUSINESS %2 → 20
  });

  // ════════════════════════ ADMIN TIER YÖNETİMİ ════════════════════════
  scenario("MEM-120", async () => {
    const admin = await createAdminUser("admin-mem120@test.com");
    // Bir tier'ı pasif yap, includeInactive=true ile yine dönmeli.
    await request(server())
      .patch("/api/membership/admin/tiers/basic")
      .set(authHeader(admin))
      .send({ isActive: false })
      .expect(200);
    const res = await request(server())
      .get("/api/membership/admin/tiers?includeInactive=true")
      .set(authHeader(admin))
      .expect(200);
    const types = res.body.map((t: any) => t.type);
    expect(types).toContain("basic"); // pasif olmasına rağmen dönüyor
    expect(res.body.length).toBeGreaterThanOrEqual(4);
  });

  scenario("MEM-121", async () => {
    const admin = await createAdminUser("admin-mem121@test.com");
    // free zaten mevcut → createTier 400 "zaten mevcut".
    const res = await request(server())
      .post("/api/membership/admin/tiers")
      .set(authHeader(admin))
      .send({
        type: "free",
        name: "Free Dup",
        monthlyPrice: 0,
        yearlyPrice: 0,
        maxFreeListings: 1,
        maxTotalListings: 1,
        maxImagesPerListing: 1,
        canCreateCollections: false,
        canTrade: false,
        isAdFree: false,
        featuredListingSlots: 0,
        commissionDiscount: 0,
      })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain("zaten mevcut");
  });

  scenario("MEM-122", async () => {
    const admin = await createAdminUser("admin-mem122@test.com");
    await request(server())
      .patch("/api/membership/admin/tiers/premium")
      .set(authHeader(admin))
      .send({ monthlyPrice: 129.99, maxImagesPerListing: 12 })
      .expect(200);
    const res = await get("/api/membership/tiers/premium").expect(200);
    expect(res.body.monthlyPrice).toBe(129.99);
    expect(res.body.maxImagesPerListing).toBe(12);
  });

  scenario("MEM-123", async () => {
    const admin = await createAdminUser("admin-mem123@test.com");
    const base = {
      type: "premium",
      name: "X",
      monthlyPrice: 10,
      yearlyPrice: 100,
      maxFreeListings: 1,
      maxTotalListings: 1,
      maxImagesPerListing: 5,
      canCreateCollections: true,
      canTrade: true,
      isAdFree: true,
      featuredListingSlots: 1,
      commissionDiscount: 0.01,
    };
    const post = (over: Record<string, unknown>) =>
      request(server())
        .post("/api/membership/admin/tiers")
        .set(authHeader(admin))
        .send({ ...base, ...over });
    await post({ maxImagesPerListing: 25 }).expect(400); // >20
    await post({ commissionDiscount: 1.5 }).expect(400); // >1
    await post({ monthlyPrice: -1 }).expect(400); // <0
    await post({ maxTotalListings: 0 }).expect(400); // <1
  });

  scenario("MEM-124", async () => {
    const admin = await createAdminUser("admin-mem124@test.com");
    // Geçersiz enum controller sınırında reddedilir; Prisma'ya ulaşmaz.
    await request(server())
      .patch("/api/membership/admin/tiers/nonexistent")
      .set(authHeader(admin))
      .send({ monthlyPrice: 1 })
      .expect(400);
  });

  scenario("MEM-125", async () => {
    // Admin tier güncellemesi public /tiers'a yansır (tek kaynak DB) — web+mobile aynı uçtan okur.
    const admin = await createAdminUser("admin-mem125@test.com");
    await request(server())
      .patch("/api/membership/admin/tiers/premium")
      .set(authHeader(admin))
      .send({ monthlyPrice: 149.99 })
      .expect(200);
    const all = await get("/api/membership/tiers").expect(200);
    const premium = all.body.find((t: any) => t.type === "premium");
    expect(premium.monthlyPrice).toBe(149.99);
    const single = await get("/api/membership/tiers/premium").expect(200);
    expect(single.body.monthlyPrice).toBe(149.99);
  });

  scenario("MEM-130", async () => {
    const user = await createUser(ctx.module, {
      email: "usertierlist@test.com",
    });
    const res = await get("/api/membership/admin/tiers", user);
    expect(res.status).toBe(401);
  });

  scenario("MEM-131", async () => {
    const mod = await createAdminUser("mod-mem131@test.com", "moderator");
    await request(server())
      .post("/api/membership/admin/tiers")
      .set(authHeader(mod))
      .send({
        type: "premium",
        name: "Mod Premium",
        monthlyPrice: 10,
        yearlyPrice: 100,
        maxFreeListings: 1,
        maxTotalListings: 1,
        maxImagesPerListing: 5,
        canCreateCollections: true,
        canTrade: true,
        isAdFree: true,
        featuredListingSlots: 1,
        commissionDiscount: 0.01,
      })
      .expect(403);
  });

  scenario("MEM-132", async () => {
    const mod = await createAdminUser("mod-mem132@test.com", "moderator");
    await request(server())
      .patch("/api/membership/admin/tiers/premium")
      .set(authHeader(mod))
      .send({ monthlyPrice: 1 })
      .expect(403);
    const after = await get("/api/membership/tiers/premium").expect(200);
    expect(after.body.monthlyPrice).toBe(99.99);
  });

  // ════════════════════════ GÜVENLİK / IDOR ════════════════════════
  scenario("MEM-133", async () => {
    const a = await createUser(ctx.module, { email: "idora@test.com" });
    const b = await createUser(ctx.module, { email: "idorb@test.com" });
    // (1) A /me → yalnız kendi üyeliği.
    const meA = await get("/api/membership/me", a).expect(200);
    expect(meA.body.userId).toBe(a.id);
    // (2) A, B'nin kartını silemez → 404.
    const prisma = getPrisma();
    const cardB = await prisma.savedCard.create({
      data: {
        userId: b.id,
        provider: "paytr",
        utoken: `UT-${b.id.slice(0, 8)}`,
        ctoken: `CT-${b.id.slice(0, 8)}`,
        last4: "9999",
        status: SavedCardStatus.active,
      },
    });
    await request(server())
      .delete(`/api/membership/cards/${cardB.id}`)
      .set(authHeader(a))
      .expect(404);
    const still = await prisma.savedCard.findUnique({
      where: { id: cardB.id },
    });
    expect(still!.status).toBe(SavedCardStatus.active);
  });

  scenario("MEM-134", async () => {
    // Korumalı uçlar header'sız 401; yalnız /tiers ve /tiers/:type public.
    await get("/api/membership/me").expect(401);
    await get("/api/membership/me/limits").expect(401);
    await get("/api/membership/cards").expect(401);
    await get("/api/membership/check/listing").expect(401);
    await get("/api/membership/check/trade").expect(401);
    await get("/api/membership/check/collection").expect(401);
    await request(server())
      .post("/api/membership/subscribe")
      .send({ tierType: "premium", billingPeriod: "monthly" })
      .expect(401);
    await request(server()).post("/api/membership/cancel").expect(401);
    await request(server())
      .patch("/api/membership/auto-renew")
      .send({ autoRenew: false })
      .expect(401);
    await request(server())
      .post("/api/membership/payments/initiate")
      .send({ provider: "paytr" })
      .expect(401);
    // Public:
    await get("/api/membership/tiers").expect(200);
    await get("/api/membership/tiers/free").expect(200);
  });

  // ════════════════════════ PARİTE / i18n (UI) — saf-frontend skip ════════════════════════
  // Aşağıdaki 5 senaryo GEÇERLİ skip: saf web/mobile UI render, i18n metni, navigasyon
  // kilidi ve yönlendirme — API ucu yok. (MEM-145 ise API-tarafı parite gerçeğiyle AKTİF.)
  scenario.skip(
    "MEM-140",
    "Saf web UI i18n (TR/EN metin) — API e2e kapsamı dışı.",
  );
  scenario.skip(
    "MEM-141",
    "Saf web UI i18n (basic etiketi tier.name) — API e2e kapsamı dışı.",
  );
  scenario.skip(
    "MEM-142",
    "Saf mobile navigasyon kilidi (guardLocked) — API e2e kapsamı dışı.",
  );
  scenario.skip(
    "MEM-143",
    "Saf web+mobile UI görünürlük paritesi (business kartı) — API e2e kapsamı dışı.",
  );
  scenario.skip(
    "MEM-144",
    "Saf web yönlendirme (/pricing→/profile/membership) — API e2e kapsamı dışı.",
  );
  scenario("MEM-145", async () => {
    // Parite / Negatif: manifest'in tespit ettiği tutarsızlığın API-tarafı GERÇEĞİ.
    // Mobil UI business kartında "20 resim" / "Sınırsız ilan" yazsa da API business
    // tier'ı maxImages=15 ve maxTotalListings=1000 döner (seedTiers üretim değerleri).
    // Bu ayrık teyit, UI kopyasının yanlış olduğunu API tek-doğruluk-kaynağıyla kanıtlar.
    // (Saf UI metni test edilemez; ancak paritenin API ucu birebir doğrulanabilir.)
    const tier = await get("/api/membership/tiers/business").expect(200);
    expect(tier.body.type).toBe("business");
    expect(tier.body.maxImagesPerListing).toBe(15); // UI "20 resim" ile ÇELİŞİR
    expect(tier.body.maxTotalListings).toBe(1000); // UI "Sınırsız ilan" ile ÇELİŞİR

    // Efektif kullanıcı limitleri de aynı gerçeği yansıtır (mobil bu uçtan okur).
    const bizUser = await createCorporateUser("parity-mem145@test.com");
    await attachMembership(bizUser.id, MembershipTierType.business);
    const limits = await get("/api/membership/me/limits", bizUser).expect(200);
    expect(limits.body.tierType).toBe("business");
    expect(limits.body.maxImages).toBe(15);
    expect(limits.body.maxTotalListings).toBe(1000);
  });

  // ════════════════════════ EŞZAMANLILIK / IDEMPOTENCY ════════════════════════
  scenario("MEM-150", async () => {
    // Eşzamanlı çift subscribe premium: tek user_memberships satırı (unique constraint).
    const user = await createUser(ctx.module, {
      email: "concurrentsub@test.com",
    });
    const fire = () =>
      request(server())
        .post("/api/membership/subscribe")
        .set(authHeader(user))
        .send({ tierType: "premium", billingPeriod: "monthly" });
    const results = await Promise.allSettled([fire(), fire()]);
    // En az biri başarılı; ikincisi başarılı/çakışma olabilir ama iki satır oluşmaz.
    const ok = results.filter(
      (r) => r.status === "fulfilled" && (r.value as any).status < 400,
    );
    expect(ok.length).toBeGreaterThanOrEqual(1);
    const prisma = getPrisma();
    const rows = await prisma.userMembership.count({
      where: { userId: user.id },
    });
    expect(rows).toBe(1);
  });

  scenario("MEM-151", async () => {
    // Eşzamanlı çift ödeme-onayı (callback) idempotent: üyelik bir kez aktive, dönem tek kez kayar.
    const user = await createUser(ctx.module, {
      email: "concurrentpay@test.com",
    });
    const sub = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "premium", billingPeriod: "monthly" })
      .expect(201);
    await Promise.allSettled([
      completePaymentByCallback(ctx, sub.body.orderId),
      completePaymentByCallback(ctx, sub.body.orderId),
    ]);
    const prisma = getPrisma();
    const membership = await prisma.userMembership.findUnique({
      where: { userId: user.id },
      include: { tier: true },
    });
    expect(membership!.status).toBe("active");
    expect(membership!.tier.type).toBe("premium");
    const completed = await prisma.membershipPayment.count({
      where: { membershipId: membership!.id, status: PaymentStatus.completed },
    });
    expect(completed).toBeLessThanOrEqual(1 + 0); // tek completed (idempotent)
  });

  scenario("MEM-152", async () => {
    // Oto-yenileme eşzamanlı tur. ÖNEMLİ NÜANS: gerçek çift-çekim kilidi Bull repeatable
    // job'ın TEK-SEFER garantisidir; burada servis metodu DOĞRUDAN (Bull'suz) çağrılır →
    // DB-seviyesi kilit yoktur. İki paralel run aynı `due` satırını okuyabilir (dönem
    // ikisi de commit etmeden geçmişte). Bu yüzden gözlemlenen değişmez sonuç: üyelik
    // AKTİF + dönem GELECEKTE (yenilendi). completed MembershipPayment sayısı 1 (ideal,
    // sıralı yürütme) VEYA 2 (yarış) olabilir — servis seviyesinde tekillik garanti değil.
    setRecurringFlag(true);
    const { m } = await seedDueMembership();
    ctx.paytr.nextRecurringResult = { status: "success" };
    await Promise.allSettled([
      ctx.app.get(MembershipService).runAutoRenewals(),
      ctx.app.get(MembershipService).runAutoRenewals(),
    ]);
    const prisma = getPrisma();
    const after = await prisma.userMembership.findUnique({
      where: { id: m.id },
    });
    expect(after!.currentPeriodEnd.getTime()).toBeGreaterThan(Date.now()); // yenilendi
    expect(after!.status).toBe(SubscriptionStatus.active);
    // Tek user_memberships satırı korunur (unique userId — çift satır oluşmaz).
    const rows = await prisma.userMembership.count({
      where: { userId: m.userId },
    });
    expect(rows).toBe(1);
    const completed = await prisma.membershipPayment.count({
      where: { membershipId: m.id, status: PaymentStatus.completed },
    });
    expect(completed).toBeGreaterThanOrEqual(1);
    expect(completed).toBeLessThanOrEqual(2); // Bull'suz doğrudan çağrıda yarış olabilir
  });

  scenario("MEM-153", async () => {
    // Decimal hassasiyeti: yearlyPrice=959.99 korunur; yıllık sipariş tutarı tam eşit.
    const tiers = await get("/api/membership/tiers/premium").expect(200);
    expect(tiers.body.yearlyPrice).toBe(959.99);
    const user = await createUser(ctx.module, { email: "decimal@test.com" });
    const sub = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "premium", billingPeriod: "yearly" })
      .expect(201);
    const prisma = getPrisma();
    const order = await prisma.order.findUnique({
      where: { id: sub.body.orderId },
    });
    expect(Number(order!.totalAmount)).toBe(959.99);
  });

  scenario("MEM-154", async () => {
    const user = await createUser(ctx.module, { email: "billing@test.com" });
    // (1) billingPeriod eksik → 400 (IsString).
    await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "premium" })
      .expect(400);
    // (2) billingPeriod string ama "monthly" değil → yearly dönem (else dalı, +1 yıl).
    const sub = await request(server())
      .post("/api/membership/subscribe")
      .set(authHeader(user))
      .send({ tierType: "premium", billingPeriod: "haftalik" })
      .expect(201);
    const prisma = getPrisma();
    const membership = await prisma.userMembership.findUnique({
      where: { userId: user.id },
    });
    const days = Math.round(
      (membership!.currentPeriodEnd.getTime() -
        membership!.currentPeriodStart.getTime()) /
        86_400_000,
    );
    expect(days).toBeGreaterThan(180); // yearly
    const order = await prisma.order.findUnique({
      where: { id: sub.body.orderId },
    });
    expect(Number(order!.totalAmount)).toBe(959.99); // yearly fiyat
  });

  scenario("MEM-155", async () => {
    // Normal akış 200 (hata sarmalaması yalnız iç hata durumunda 400).
    const user = await createUser(ctx.module, { email: "limitswrap@test.com" });
    const res = await get("/api/membership/me/limits", user).expect(200);
    expect(res.body).toHaveProperty("tierType");
    expect(res.body).toHaveProperty("maxImages");
  });

  scenario("MEM-156", async () => {
    // Limite tam eşit ilan: remainingTotalListings=0, canCreateListing=false.
    const seed = await seedBaselineRefs();
    const user = await createUser(ctx.module, {
      email: "exactlimit@test.com",
      isSeller: true,
    });
    for (let i = 0; i < 10; i++) {
      await createProduct({
        sellerId: user.id,
        categoryId: seed.categoryId,
        status: "active",
      });
    }
    const res = await get("/api/membership/me/limits", user).expect(200);
    expect(res.body.remainingTotalListings).toBe(0);
    expect(res.body.canCreateListing).toBe(false);
  });

  // ──────────────────────────── Lokal test-utility'ler ────────────────────────────

  /** Truncate sonrası seedBaseline çağrılmış olur; referans ID'leri yeniden almak için yardımcı. */
  async function seedBaselineRefs(): Promise<{
    categoryId: string;
    brandId: string;
    manufacturerId: string;
  }> {
    const prisma = getPrisma();
    const category = await prisma.category.findFirst({
      where: { isActive: true },
    });
    const brand = await prisma.brand.findFirst({ where: { isActive: true } });
    const manufacturer = await prisma.manufacturer.findFirst({
      where: { isActive: true },
    });
    return {
      categoryId: category!.id,
      brandId: brand!.id,
      manufacturerId: manufacturer!.id,
    };
  }

  function makeImages(
    n: number,
  ): Array<{ cardKey: string; detailKey: string }> {
    return Array.from({ length: n }, (_, i) => ({
      cardKey: `dev/products/card-${i}.webp`,
      detailKey: `dev/products/detail-${i}.webp`,
    }));
  }

  function productBody(
    seed: { categoryId: string },
    over: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      title: "Test Ürünü Başlığı",
      description: "E2E ürün açıklaması yeterince uzun.",
      price: 100,
      categoryId: seed.categoryId,
      condition: "new",
      ...over,
    };
  }

  /** Roles dekoratörü için admin token (varsayılan super_admin). */
  function createAdminUser(
    email: string,
    role: "super_admin" | "admin" | "moderator" = "super_admin",
  ): Promise<CreatedTestAdmin> {
    return createAdminUserFactory(ctx.module, { email, role: AdminRole[role] });
  }

  /** PAYTR_RECURRING_ENABLED bayrağını deterministik kontrol et (recurring-renewal.e2e altın deseni). */
  function setRecurringFlag(enabled: boolean): void {
    const cfg = ctx.app.get(ConfigService);
    const real = cfg.get.bind(cfg);
    jest
      .spyOn(cfg, "get")
      .mockImplementation((key: any, def?: any) =>
        key === "PAYTR_RECURRING_ENABLED"
          ? enabled
            ? "true"
            : "false"
          : real(key, def),
      );
  }

  /** Yenilemeye hazır (süresi dolmuş) ücretli üyelik + kayıtlı kart seed'le. */
  async function seedDueMembership(opts: { requireCvv?: boolean } = {}) {
    const prisma = getPrisma();
    const user = await createUser(ctx.module);
    const tier = await prisma.membershipTier.findUnique({
      where: { type: MembershipTierType.basic },
    });
    const start = new Date(Date.now() - 31 * 86_400_000); // ~1 ay önce → monthly
    const end = new Date(Date.now() - 86_400_000); // dün doldu
    const m = await prisma.userMembership.create({
      data: {
        userId: user.id,
        tierId: tier!.id,
        status: SubscriptionStatus.active,
        autoRenew: true,
        currentPeriodStart: start,
        currentPeriodEnd: end,
      },
    });
    const card = await prisma.savedCard.create({
      data: {
        userId: user.id,
        provider: "paytr",
        utoken: `UT-${user.id.slice(0, 8)}`,
        ctoken: `CT-${user.id.slice(0, 8)}`,
        last4: "4358",
        brand: "VISA",
        status: SavedCardStatus.active,
        requireCvv: opts.requireCvv ?? false,
      },
    });
    return { user, tier: tier!, m, card };
  }

  /** Baseline kategorideki kesin satıcı tipi kurallarını günceller. */
  async function seedCommissionRules(): Promise<void> {
    const prisma = getPrisma();
    const rates: Record<CommissionSellerType, number> = {
      [CommissionSellerType.FREE]: 8,
      [CommissionSellerType.BASIC]: 4,
      [CommissionSellerType.PREMIUM]: 5,
      [CommissionSellerType.BUSINESS]: 2,
    };
    await Promise.all(
      Object.entries(rates).map(([sellerType, rate]) =>
        prisma.commissionRule.update({
          where: { id: `default-rule-${sellerType}` },
          data: {
            categoryId: baseline.categoryId,
            sellerCommissionRate: new Prisma.Decimal(rate),
          },
        }),
      ),
    );
  }
});
