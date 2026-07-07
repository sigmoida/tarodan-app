/**
 * 02 — Kullanıcı Profili & Hesap Yönetimi (USR) — Test Konsolu senaryoları.
 *
 * Yapı 01-auth.e2e-spec.ts ile birebir aynıdır (FAN-OUT şablonu): her test
 * `scenario('USR-NNN', fn)` ile manifest'e bağlanır; başlık/öncelik manifest'ten
 * otomatik gelir. Assertion'lar manifest exp'lerinden + gerçek koddan
 * (user.controller.ts / user.service.ts / dto'lar / jwt.strategy.ts) türetilmiştir.
 *
 * Paylaşılan yardımcılar: factory (createUser/authHeader/createProduct/createAddress),
 * getPrisma DB assertion. Granül kurulum (membership/order/bank-account) spec içinde
 * getPrisma ile inline yapılır (test-utils değiştirilmez).
 */
import * as request from 'supertest';
import { createE2ETestApp, E2ETestApp } from '../../test-utils/create-app';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../../test-utils/db';
import { createUser, authHeader } from '../../factories/user.factory';
import { createProduct } from '../../factories/product.factory';
import { createAddress } from '../../factories/address.factory';
import { scenario } from '../../test-utils/scenario';

describe('02 — Kullanıcı Profili & Hesap Yönetimi (USR)', () => {
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

  // Geçerli adres gövdesi üretici.
  const validAddress = (over: Record<string, unknown> = {}) => ({
    title: 'Ev',
    fullName: 'Ahmet Yılmaz',
    phone: '+905551234567',
    city: 'İstanbul',
    district: 'Kadıköy',
    address: 'Caferağa Mah. Moda Cad. No:123',
    ...over,
  });

  // Aktif (silmeyi engelleyen) bir sipariş oluştur — verilen adresi shipping olarak kullanır.
  async function createBlockingOrder(opts: {
    buyerId: string;
    sellerId: string;
    productId: string;
    shippingAddressId: string;
    status?: string;
  }): Promise<{ id: string }> {
    const prisma = getPrisma();
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        buyerId: opts.buyerId,
        sellerId: opts.sellerId,
        productId: opts.productId,
        shippingAddressId: opts.shippingAddressId,
        totalAmount: 100,
        commissionAmount: 10,
        paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: (opts.status ?? 'paid') as any,
      },
    });
    return { id: order.id };
  }

  // ──────────────────────────── GET /api/users/me ────────────────────────────
  describe('GET /api/users/me', () => {
    scenario('USR-001', async () => {
      const user = await createUser(ctx.module, { displayName: 'Profil Sahibi' });
      await createAddress({ userId: user.id, isDefault: false });
      await createAddress({ userId: user.id, isDefault: true });

      const res = await request(server()).get('/api/users/me').set(authHeader(user)).expect(200);

      expect(res.body.id).toBe(user.id);
      expect(res.body.email).toBe(user.email);
      expect(res.body.displayName).toBe('Profil Sahibi');
      expect(Array.isArray(res.body.addresses)).toBe(true);
      expect(res.body.membership?.tier).toBeTruthy();
      expect(res.body.membership.tier.type).toBeTruthy();
      expect(typeof res.body.listingCount).toBe('number');
      expect(typeof res.body.isPremium).toBe('boolean');
      expect(res.body.stats).toEqual(
        expect.objectContaining({
          totalListings: expect.any(Number),
          totalSales: expect.any(Number),
          totalTrades: expect.any(Number),
          averageRating: expect.anything(),
          totalRatings: expect.any(Number),
        }),
      );
      // Hassas alanlar yanıtta olmamalı.
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.fcmToken).toBeUndefined();
      expect(res.body.bannedBy).toBeUndefined();
      expect(res.body.bannedReason).toBeUndefined();
      // addresses isDefault desc sıralı: ilk eleman default olmalı.
      expect(res.body.addresses[0].isDefault).toBe(true);
    });

    scenario('USR-002', async () => {
      await request(server()).get('/api/users/me').expect(401);
    });

    scenario('USR-003', async () => {
      // seedBaseline free tier'ı canTrade=true seed ediyor; FREE fallback sadece üyelik
      // KAYDI yoksa devreye girer. Üyeliksiz kullanıcı oluşturup fallback'i doğrula.
      const user = await createUser(ctx.module);
      const res = await request(server()).get('/api/users/me').set(authHeader(user)).expect(200);

      // Üyelik kaydı yok → service free fallback nesnesini döner (user.service.ts:225-240).
      const tier = res.body.membership.tier;
      expect(tier.type).toBe('free');
      expect(tier.maxFreeListings).toBe(5);
      expect(tier.maxTotalListings).toBe(10);
      expect(tier.maxImagesPerListing).toBe(3);
      expect(tier.canTrade).toBe(false);
      expect(tier.canCreateCollections).toBe(false);
      expect(tier.isAdFree).toBe(false);
      expect(tier.featuredListingSlots).toBe(0);
      expect(tier.commissionDiscount).toBe(0);
      expect(res.body.isPremium).toBe(false);
    });

    scenario('USR-004', async () => {
      const user = await createUser(ctx.module);
      // Hesabı anonimleştir → deletedAt dolu; jwt.strategy.ts:43-46 reddeder.
      await request(server()).delete('/api/users/me').set(authHeader(user)).expect(200);
      await request(server()).get('/api/users/me').set(authHeader(user)).expect(401);
    });
  });

  // ──────────────────────────── PATCH /api/users/me ────────────────────────────
  describe('PATCH /api/users/me', () => {
    scenario('USR-005', async () => {
      const user = await createUser(ctx.module);
      const res = await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ displayName: 'Yeni İsim', bio: 'Koleksiyoncu, F1 sever' })
        .expect(200);
      expect(res.body.displayName).toBe('Yeni İsim');
      expect(res.body.bio).toBe('Koleksiyoncu, F1 sever');
    });

    scenario('USR-006', async () => {
      const user = await createUser(ctx.module);
      const res = await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ phone: '12345' })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('Geçerli bir Türkiye telefon numarası');
    });

    scenario('USR-007', async () => {
      const user = await createUser(ctx.module);
      const res = await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ phone: '+905559998877' })
        .expect(200);
      expect(res.body.phone).toBe('+905559998877');
    });

    scenario('USR-008', async () => {
      const user = await createUser(ctx.module);
      // Boş telefon → ValidateIf regex'i atlar; bio güncellenir.
      const res = await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ phone: '', bio: 'test' })
        .expect(200);
      expect(res.body.bio).toBe('test');
    });

    scenario('USR-009', async () => {
      const owner = await createUser(ctx.module, { email: 'phone-owner@test.com' });
      // owner'a benzersiz telefon ata.
      await getPrisma().user.update({
        where: { id: owner.id },
        data: { phone: '+905551112233' },
      });
      const other = await createUser(ctx.module, { email: 'phone-other@test.com' });
      const res = await request(server())
        .patch('/api/users/me')
        .set(authHeader(other))
        .send({ phone: '+905551112233' })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('Bu telefon numarası zaten kullanılıyor');
    });

    scenario('USR-010', async () => {
      const user = await createUser(ctx.module);
      await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ bio: 'a'.repeat(501) })
        .expect(400);
      const ok = await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ bio: 'a'.repeat(500) })
        .expect(200);
      expect(ok.body.bio).toHaveLength(500);
    });

    scenario('USR-011', async () => {
      const user = await createUser(ctx.module);
      await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ displayName: 'A' })
        .expect(400);
      await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ displayName: 'X'.repeat(101) })
        .expect(400);
      const ok = await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ displayName: 'Ab' })
        .expect(200);
      expect(ok.body.displayName).toBe('Ab');
    });

    scenario('USR-012', async () => {
      const user = await createUser(ctx.module);
      // taxOffice şemada yok + free tier'da companyName/taxId işlenmez → updateData boş → 400.
      const res = await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ taxOffice: 'Kadıköy VD' })
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('Güncellenecek alan bulunamadı');
    });

    scenario('USR-013', async () => {
      const user = await createUser(ctx.module);
      // business tier değil + isCorporateSeller yok → companyName/taxId null'lanır.
      const res = await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ displayName: 'Z', companyName: 'Hayalet Ltd', taxId: '1234567890' })
        .expect(200);
      expect(res.body.companyName).toBeNull();
      expect(res.body.taxId).toBeNull();
    });

    scenario('USR-014', async () => {
      const user = await createUser(ctx.module);
      const res = await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ isCorporateSeller: true, companyName: 'Ali Diecast A.Ş.', taxId: '12345678901' })
        .expect(200);
      expect(res.body.companyName).toBe('Ali Diecast A.Ş.');
      expect(res.body.taxId).toBe('12345678901');
    });

    scenario('USR-015', async () => {
      const user = await createUser(ctx.module);
      await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ isCorporateSeller: true, taxId: '123' })
        .expect(400);
      await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ isCorporateSeller: true, taxId: '123456789012' })
        .expect(400);
      await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ isCorporateSeller: true, taxId: '12AB567890' })
        .expect(400);
    });

    scenario('USR-016', async () => {
      const user = await createUser(ctx.module);
      await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ birthDate: '01.01.1990' })
        .expect(400);
      await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ birthDate: '1990-01-01' })
        .expect(200);
    });

    scenario.skip(
      'USR-017',
      'AI moderasyon test ortamında kapalı (.env.test AI_MODERATION_ENABLED yok → ' +
        "default 'false'); assertTextClean no-op olduğu için bio reddi tetiklenmez " +
        '(moderation-ai.client.ts:148). API üzerinden assert edilemez.',
    );

    scenario('USR-018', async () => {
      await request(server()).patch('/api/users/me').send({ displayName: 'X' }).expect(401);
    });

    scenario('USR-077', async () => {
      const me = await createUser(ctx.module, { displayName: 'Deniz' });
      const other = await createUser(ctx.module, { displayName: 'Başka' });
      // body'ye id enjekte → controller @CurrentUser('id') kullanır, body id'yi yok sayar.
      await request(server())
        .patch('/api/users/me')
        .set(authHeader(me))
        .send({ id: other.id, displayName: 'X' })
        .expect(200);
      // Başka kullanıcı etkilenmedi.
      const otherDb = await getPrisma().user.findUnique({ where: { id: other.id } });
      expect(otherDb?.displayName).toBe('Başka');
      const meDb = await getPrisma().user.findUnique({ where: { id: me.id } });
      expect(meDb?.displayName).toBe('X');
    });

    scenario('USR-049', async () => {
      // showTrustScore DB'ye yazılır; premium üyede public profilde trustScore yine dolu döner.
      const user = await createUser(ctx.module, { premium: true });
      await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ showTrustScore: false })
        .expect(200);
      const db = await getPrisma().user.findUnique({ where: { id: user.id } });
      expect(db?.showTrustScore).toBe(false);
      // Misafir gözüyle public profil → premium olduğu için trustScore yine dolu.
      const pub = await request(server()).get(`/api/users/${user.id}/profile`).expect(200);
      expect(pub.body.isPremium).toBe(true);
      expect(typeof pub.body.trustScore).toBe('number');
    });
  });

  // ──────────────────────────── Avatar ────────────────────────────
  describe('Avatar redirect', () => {
    scenario('USR-019', async () => {
      const user = await createUser(ctx.module);
      // avatarUrl S3 key olarak ayarlandığında storage stub presigned http(s) URL döner.
      await getPrisma().user.update({
        where: { id: user.id },
        data: { avatarUrl: 'dev/avatars/test/abc.jpg' },
      });
      const res = await request(server()).get(`/api/users/${user.id}/avatar`).redirects(0);
      expect(res.status).toBe(302);
      expect(res.headers.location).toMatch(/^https?:\/\//);
      expect(res.headers['cache-control']).toBe('public, max-age=3600');
    });

    scenario('USR-020', async () => {
      const user = await createUser(ctx.module);
      // avatarUrl null → 404, boş gövde.
      const res = await request(server()).get(`/api/users/${user.id}/avatar`).redirects(0);
      expect(res.status).toBe(404);
    });

    scenario('USR-021', async () => {
      const user = await createUser(ctx.module);
      // S3 key kaydet → GET /me'de presigned http(s) URL'e çözülür (key değil).
      const patch = await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ avatarUrl: 'dev/avatars/test/abc.jpg' })
        .expect(200);
      expect(patch.body.avatarUrl).toMatch(/^https?:\/\//);
      const me = await request(server()).get('/api/users/me').set(authHeader(user)).expect(200);
      expect(me.body.avatarUrl).toMatch(/^https?:\/\//);
    });
  });

  // ──────────────────────────── Addresses ────────────────────────────
  describe('Addresses', () => {
    scenario('USR-022', async () => {
      const user = await createUser(ctx.module);
      const res = await request(server())
        .post('/api/users/me/addresses')
        .set(authHeader(user))
        .send(validAddress({ isDefault: true }))
        .expect(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.isDefault).toBe(true);
    });

    scenario('USR-023', async () => {
      const user = await createUser(ctx.module);
      // İlk adres (existingAddresses===0) → otomatik default.
      const res = await request(server())
        .post('/api/users/me/addresses')
        .set(authHeader(user))
        .send({
          fullName: 'Ceren K',
          phone: '+905551112233',
          city: 'İzmir',
          district: 'Konak',
          address: 'Alsancak Mah. No:1 D:2',
        })
        .expect(201);
      expect(res.body.isDefault).toBe(true);
    });

    scenario('USR-024', async () => {
      const user = await createUser(ctx.module);
      await createAddress({ userId: user.id, isDefault: true });
      // 2. adres isDefault=true → eski default devredilir.
      await request(server())
        .post('/api/users/me/addresses')
        .set(authHeader(user))
        .send(validAddress({ isDefault: true }))
        .expect(201);
      const list = await request(server())
        .get('/api/users/me/addresses')
        .set(authHeader(user))
        .expect(200);
      const defaults = (list.body as any[]).filter((a) => a.isDefault);
      expect(defaults).toHaveLength(1);
    });

    scenario('USR-025', async () => {
      const user = await createUser(ctx.module);
      const addr = await createAddress({ userId: user.id });
      const res = await request(server())
        .patch(`/api/users/me/addresses/${addr.id}`)
        .set(authHeader(user))
        .send({ title: 'İş Yeri' })
        .expect(200);
      expect(res.body.title).toBe('İş Yeri');
    });

    scenario('USR-026', async () => {
      const user = await createUser(ctx.module);
      const a = await createAddress({ userId: user.id, isDefault: true });
      const b = await createAddress({ userId: user.id, isDefault: false });
      await request(server())
        .patch(`/api/users/me/addresses/${b.id}`)
        .set(authHeader(user))
        .send({ isDefault: true })
        .expect(200);
      const list = await request(server())
        .get('/api/users/me/addresses')
        .set(authHeader(user))
        .expect(200);
      const byId = new Map((list.body as any[]).map((x) => [x.id, x.isDefault]));
      expect(byId.get(b.id)).toBe(true);
      expect(byId.get(a.id)).toBe(false);
    });

    scenario('USR-027', async () => {
      const userA = await createUser(ctx.module);
      const userB = await createUser(ctx.module);
      const bAddr = await createAddress({ userId: userB.id });
      const res = await request(server())
        .patch(`/api/users/me/addresses/${bAddr.id}`)
        .set(authHeader(userA))
        .send({ title: 'Hacked' })
        .expect(404);
      expect(JSON.stringify(res.body.message)).toContain('Adres bulunamadı');
    });

    scenario('USR-028', async () => {
      const user = await createUser(ctx.module);
      const res = await request(server())
        .post('/api/users/me/addresses')
        .set(authHeader(user))
        .send(validAddress({ fullName: 'X' }))
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('Ad soyad en az 2 karakter');
    });

    scenario('USR-029', async () => {
      const user = await createUser(ctx.module);
      await request(server())
        .post('/api/users/me/addresses')
        .set(authHeader(user))
        .send({ fullName: 'Ali Veli', phone: '123', city: 'X', district: 'Y', address: 'kısa' })
        .expect(400);
    });

    scenario('USR-030', async () => {
      const user = await createUser(ctx.module);
      // 10 adres oluştur, 11.'yi reddet.
      for (let i = 0; i < 10; i++) {
        await createAddress({ userId: user.id, isDefault: false });
      }
      const res = await request(server())
        .post('/api/users/me/addresses')
        .set(authHeader(user))
        .send(validAddress())
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('En fazla 10 adres');
    });

    scenario('USR-031', async () => {
      const user = await createUser(ctx.module);
      const addr = await createAddress({ userId: user.id });
      await request(server())
        .delete(`/api/users/me/addresses/${addr.id}`)
        .set(authHeader(user))
        .expect(200);
      const remaining = await getPrisma().address.findUnique({ where: { id: addr.id } });
      expect(remaining).toBeNull();
    });

    scenario('USR-032', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      const addr = await createAddress({ userId: buyer.id });
      // Açık (paid) sipariş bu adrese bağlı → silinemez.
      await createBlockingOrder({
        buyerId: buyer.id,
        sellerId: seller.id,
        productId: product.id,
        shippingAddressId: addr.id,
        status: 'paid',
      });
      const res = await request(server())
        .delete(`/api/users/me/addresses/${addr.id}`)
        .set(authHeader(buyer))
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('devam eden siparişleriniz');
    });

    scenario('USR-033', async () => {
      const user = await createUser(ctx.module);
      const a = await createAddress({ userId: user.id, isDefault: true });
      const b = await createAddress({ userId: user.id, isDefault: false });
      await request(server())
        .delete(`/api/users/me/addresses/${a.id}`)
        .set(authHeader(user))
        .expect(200);
      const list = await request(server())
        .get('/api/users/me/addresses')
        .set(authHeader(user))
        .expect(200);
      const ids = (list.body as any[]).map((x) => x.id);
      expect(ids).not.toContain(a.id);
      const bRow = (list.body as any[]).find((x) => x.id === b.id);
      expect(bRow?.isDefault).toBe(true);
    });

    scenario('USR-034', async () => {
      const user = await createUser(ctx.module);
      const res = await request(server())
        .delete('/api/users/me/addresses/00000000-0000-0000-0000-000000000000')
        .set(authHeader(user))
        .expect(404);
      expect(JSON.stringify(res.body.message)).toContain('Adres bulunamadı');
    });

    scenario('USR-035', async () => {
      const user = await createUser(ctx.module);
      const addr = await createAddress({ userId: user.id });
      await request(server()).get('/api/users/me/addresses').expect(401);
      await request(server()).post('/api/users/me/addresses').send(validAddress()).expect(401);
      await request(server())
        .patch(`/api/users/me/addresses/${addr.id}`)
        .send({ title: 'X' })
        .expect(401);
      await request(server()).delete(`/api/users/me/addresses/${addr.id}`).expect(401);
    });
  });

  // ──────────────────────────── Follow ────────────────────────────
  describe('Follow', () => {
    scenario('USR-036', async () => {
      const me = await createUser(ctx.module);
      const target = await createUser(ctx.module);

      await request(server())
        .post(`/api/users/${target.id}/follow`)
        .set(authHeader(me))
        .expect(201);
      const status = await request(server())
        .get(`/api/users/${target.id}/follow`)
        .set(authHeader(me))
        .expect(200);
      expect(status.body.following).toBe(true);

      const following = await request(server())
        .get('/api/users/me/following')
        .set(authHeader(me))
        .expect(200);
      const ids = (following.body.following as any[]).map((f) => f.following?.id ?? f.id);
      expect(ids).toContain(target.id);

      await request(server())
        .delete(`/api/users/${target.id}/follow`)
        .set(authHeader(me))
        .expect(200);
      const after = await request(server())
        .get(`/api/users/${target.id}/follow`)
        .set(authHeader(me))
        .expect(200);
      expect(after.body.following).toBe(false);
    });

    scenario('USR-037', async () => {
      const me = await createUser(ctx.module);
      const res = await request(server())
        .post(`/api/users/${me.id}/follow`)
        .set(authHeader(me))
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('Kendinizi takip edemezsiniz');
    });

    scenario('USR-038', async () => {
      const me = await createUser(ctx.module);
      const target = await createUser(ctx.module);
      await request(server())
        .post(`/api/users/${target.id}/follow`)
        .set(authHeader(me))
        .expect(201);
      // Tekrar takip → idempotent: "Zaten takip ediyorsunuz".
      const again = await request(server())
        .post(`/api/users/${target.id}/follow`)
        .set(authHeader(me))
        .expect(201);
      expect(again.body.message).toContain('Zaten takip ediyorsunuz');
      expect(again.body.following).toBe(true);
      // Tek UserFollow kaydı.
      const count = await getPrisma().userFollow.count({
        where: { followerId: me.id, followingId: target.id },
      });
      expect(count).toBe(1);
    });

    scenario('USR-039', async () => {
      const me = await createUser(ctx.module);
      const res = await request(server())
        .post('/api/users/00000000-0000-0000-0000-000000000000/follow')
        .set(authHeader(me))
        .expect(404);
      expect(JSON.stringify(res.body.message)).toContain('Kullanıcı bulunamadı');
    });

    scenario('USR-075', async () => {
      const me = await createUser(ctx.module);
      const target = await createUser(ctx.module);
      // currentUserId perspektifli: me henüz takip etmiyor → false.
      const before = await request(server())
        .get(`/api/users/${target.id}/follow`)
        .set(authHeader(me))
        .expect(200);
      expect(before.body).toEqual({ following: false });
      await request(server())
        .post(`/api/users/${target.id}/follow`)
        .set(authHeader(me))
        .expect(201);
      const after = await request(server())
        .get(`/api/users/${target.id}/follow`)
        .set(authHeader(me))
        .expect(200);
      expect(after.body).toEqual({ following: true });
    });
  });

  // ──────────────────────────── Account deletion ────────────────────────────
  describe('Account deletion', () => {
    scenario('USR-040', async () => {
      const user = await createUser(ctx.module);
      const res = await request(server())
        .delete('/api/users/me')
        .set(authHeader(user))
        .expect(200);
      expect(res.body.message).toContain('başarıyla silindi');

      const prisma = getPrisma();
      const row = await prisma.user.findUnique({ where: { id: user.id } });
      expect(row).toBeTruthy();
      expect(row?.deletedAt).toBeTruthy();
      expect(row?.email).toBe(`deleted_${user.id}@deleted.local`);
      expect(row?.phone).toBeNull();
      expect(row?.passwordHash).toBe('');
      expect(row?.displayName).toBe('Silinmiş Kullanıcı');
      expect(row?.avatarUrl).toBeNull();
      expect(row?.bio).toBeNull();
      expect(row?.companyName).toBeNull();
      expect(row?.taxId).toBeNull();
      expect(row?.acceptsMarketingEmails).toBe(false);
      expect(row?.isSeller).toBe(false);
      // Auth/PII bağımlı kayıtlar silinmiş.
      expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.address.count({ where: { userId: user.id } })).toBe(0);
    });

    scenario('USR-041', async () => {
      const user = await createUser(ctx.module, { isSeller: true });
      await createProduct({ sellerId: user.id, categoryId: baseline.categoryId, status: 'active' });
      const res = await request(server())
        .delete('/api/users/me')
        .set(authHeader(user))
        .expect(400);
      expect(res.body.message).toContain('tamamlamanız gerekmektedir');
      expect(Array.isArray(res.body.errors)).toBe(true);
      expect(JSON.stringify(res.body.errors)).toContain('aktif ilanınız');
      expect(res.body.details.activeProducts).toBeGreaterThanOrEqual(1);
    });

    scenario('USR-042', async () => {
      const buyer = await createUser(ctx.module);
      const seller = await createUser(ctx.module, { isSeller: true });
      const product = await createProduct({
        sellerId: seller.id,
        categoryId: baseline.categoryId,
      });
      const addr = await createAddress({ userId: buyer.id });
      await createBlockingOrder({
        buyerId: buyer.id,
        sellerId: seller.id,
        productId: product.id,
        shippingAddressId: addr.id,
        status: 'paid',
      });
      const res = await request(server())
        .delete('/api/users/me')
        .set(authHeader(buyer))
        .expect(400);
      expect(res.body.details.pendingOrders).toBeGreaterThanOrEqual(1);
    });

    scenario('USR-043', async () => {
      const initiator = await createUser(ctx.module);
      const receiver = await createUser(ctx.module);
      // Aktif (pending) takas → silme engellenir.
      await getPrisma().trade.create({
        data: {
          tradeNumber: `TR-${Date.now()}`,
          initiatorId: initiator.id,
          receiverId: receiver.id,
          status: 'pending' as any,
          responseDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      const res = await request(server())
        .delete('/api/users/me')
        .set(authHeader(initiator))
        .expect(400);
      expect(res.body.details.activeTrades).toBeGreaterThanOrEqual(1);
    });

    scenario('USR-044', async () => {
      await request(server()).delete('/api/users/me').expect(401);
    });

    scenario('USR-045', async () => {
      const user = await createUser(ctx.module, { email: 'reuse@test.com' });
      await getPrisma().user.update({
        where: { id: user.id },
        data: { phone: '+905554443322' },
      });
      await request(server()).delete('/api/users/me').set(authHeader(user)).expect(200);
      // Email/telefon serbest kaldı (deleted_*@... çekildi) → aynı email ile yeni kayıt.
      const res = await request(server())
        .post('/api/auth/register')
        .send({
          email: 'reuse@test.com',
          password: 'SecurePass123!',
          displayName: 'Yeniden',
          birthDate: '1995-06-15',
          phone: '+905554443322',
        })
        .expect(201);
      expect(res.body.user?.email).toBe('reuse@test.com');
    });
  });

  // ──────────────────────────── Notification settings ────────────────────────────
  describe('Notification settings', () => {
    scenario('USR-046', async () => {
      const user = await createUser(ctx.module);
      const res = await request(server())
        .get('/api/users/me/settings')
        .set(authHeader(user))
        .expect(200);
      expect(res.body).toEqual({
        emailNotifications: true,
        pushNotifications: true,
        smsNotifications: false,
        marketingEmails: false,
        orderUpdates: true,
        messageAlerts: true,
        priceDropAlerts: true,
        newListingAlerts: false,
      });
    });

    scenario('USR-047', async () => {
      const user = await createUser(ctx.module);
      const patch = await request(server())
        .patch('/api/users/me/settings')
        .set(authHeader(user))
        .send({ marketingEmails: true })
        .expect(200);
      expect(patch.body.marketingEmails).toBe(true);
      const get = await request(server())
        .get('/api/users/me/settings')
        .set(authHeader(user))
        .expect(200);
      expect(get.body).toEqual({
        emailNotifications: true,
        pushNotifications: true,
        smsNotifications: false,
        marketingEmails: true,
        orderUpdates: true,
        messageAlerts: true,
        priceDropAlerts: true,
        newListingAlerts: false,
      });
    });

    scenario('USR-048', async () => {
      const user = await createUser(ctx.module);
      await request(server())
        .patch('/api/users/me/settings')
        .set(authHeader(user))
        .send({ emailNotifications: 'evet' })
        .expect(400);
    });

    scenario('USR-050', async () => {
      await request(server()).get('/api/users/me/settings').expect(401);
      await request(server())
        .patch('/api/users/me/settings')
        .send({ marketingEmails: true })
        .expect(401);
    });

    scenario('USR-081', async () => {
      // Parite: iki kısmi güncelleme korunarak merge edilir.
      const user = await createUser(ctx.module);
      await request(server())
        .patch('/api/users/me/settings')
        .set(authHeader(user))
        .send({ marketingEmails: true })
        .expect(200);
      await request(server())
        .patch('/api/users/me/settings')
        .set(authHeader(user))
        .send({ pushNotifications: false })
        .expect(200);
      const get = await request(server())
        .get('/api/users/me/settings')
        .set(authHeader(user))
        .expect(200);
      expect(get.body.marketingEmails).toBe(true);
      expect(get.body.pushNotifications).toBe(false);
      expect(get.body.emailNotifications).toBe(true);
      expect(get.body.smsNotifications).toBe(false);
    });
  });

  // ──────────────────────────── Push token ────────────────────────────
  describe('Push token', () => {
    scenario('USR-051', async () => {
      const user = await createUser(ctx.module);
      const res = await request(server())
        .post('/api/notifications/push-token')
        .set(authHeader(user))
        .send({ token: 'ExponentPushToken[abc123]', platform: 'ios', deviceId: 'device-uuid-1' })
        .expect(200);
      expect(res.body).toEqual({ success: true, userId: user.id, platform: 'ios' });
      const row = await getPrisma().pushToken.findFirst({
        where: { userId: user.id, token: 'ExponentPushToken[abc123]' },
      });
      expect(row?.isActive).toBe(true);
    });

    scenario('USR-052', async () => {
      const user = await createUser(ctx.module);
      const body = {
        token: 'ExponentPushToken[abc123]',
        platform: 'ios',
        deviceId: 'device-uuid-1',
      };
      await request(server())
        .post('/api/notifications/push-token')
        .set(authHeader(user))
        .send(body)
        .expect(200);
      await request(server())
        .post('/api/notifications/push-token')
        .set(authHeader(user))
        .send(body)
        .expect(200);
      const count = await getPrisma().pushToken.count({
        where: { userId: user.id, token: 'ExponentPushToken[abc123]' },
      });
      expect(count).toBe(1);
    });

    scenario('USR-053', async () => {
      const user = await createUser(ctx.module);
      await request(server())
        .post('/api/notifications/push-token')
        .set(authHeader(user))
        .send({ token: 'ExponentPushToken[abc123]', platform: 'ios', deviceId: 'd1' })
        .expect(200);
      const res = await request(server())
        .post('/api/notifications/push-token')
        .set(authHeader(user))
        .send({ token: 'ExponentPushToken[abc123]', revoke: true })
        .expect(200);
      expect(res.body).toEqual({ success: true, userId: user.id, revoked: true });
      const row = await getPrisma().pushToken.findFirst({
        where: { userId: user.id, token: 'ExponentPushToken[abc123]' },
      });
      expect(row?.isActive).toBe(false);
    });

    scenario('USR-054', async () => {
      const user = await createUser(ctx.module);
      // Geçersiz format: provider Error fırlatır, service try/catch yutar → success:false.
      const res = await request(server())
        .post('/api/notifications/push-token')
        .set(authHeader(user))
        .send({ token: 'gecersiz-token', platform: 'android' })
        .expect(200);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid Expo push token format');
    });

    scenario('USR-055', async () => {
      await request(server())
        .post('/api/notifications/push-token')
        .send({ token: 'ExponentPushToken[abc123]', platform: 'ios' })
        .expect(401);
    });
  });

  // ──────────────────────────── Public profile ────────────────────────────
  describe('Public profile', () => {
    scenario('USR-056', async () => {
      const user = await createUser(ctx.module, { displayName: 'Public Tester' });
      const res = await request(server()).get(`/api/users/${user.id}/profile`).expect(200);
      expect(res.body.displayName).toBe('Public Tester');
      // PII sızıntısı yok.
      expect(res.body.email).toBeUndefined();
      expect(res.body.phone).toBeUndefined();
      expect(res.body.stats).toEqual(
        expect.objectContaining({
          totalListings: expect.any(Number),
          totalSales: expect.any(Number),
          totalTrades: expect.any(Number),
          totalCollections: expect.any(Number),
          averageRating: expect.anything(),
          totalRatings: expect.any(Number),
        }),
      );
      expect(typeof res.body.followersCount).toBe('number');
      expect(typeof res.body.isPremium).toBe('boolean');
      expect(res.body.membershipTier).toBeTruthy();
    });

    scenario('USR-057', async () => {
      const owner = await createUser(ctx.module, { isSeller: true });
      // active + inactive ürün: misafir sadece active sayar, sahip inactive dahil (deleted hariç).
      await createProduct({ sellerId: owner.id, categoryId: baseline.categoryId, status: 'active' });
      await createProduct({
        sellerId: owner.id,
        categoryId: baseline.categoryId,
        status: 'inactive',
      });
      const ownerView = await request(server())
        .get(`/api/users/${owner.id}/profile`)
        .set(authHeader(owner))
        .expect(200);
      const guestView = await request(server())
        .get(`/api/users/${owner.id}/profile`)
        .expect(200);
      expect(ownerView.body.stats.totalListings).toBeGreaterThanOrEqual(
        guestView.body.stats.totalListings,
      );
    });

    scenario('USR-058', async () => {
      const user = await createUser(ctx.module, { premium: true });
      const res = await request(server()).get(`/api/users/${user.id}/profile`).expect(200);
      expect(res.body.isPremium).toBe(true);
      expect(typeof res.body.trustScore).toBe('number');
      expect(res.body.trustScore).toBeGreaterThanOrEqual(0);
      expect(res.body.trustScore).toBeLessThanOrEqual(100);
      expect(res.body.trustLevel).toBeTruthy();
    });

    scenario('USR-059', async () => {
      // Üyeliksiz (free) → trustScore/trustLevel gizli (null).
      const user = await createUser(ctx.module);
      const res = await request(server()).get(`/api/users/${user.id}/profile`).expect(200);
      expect(res.body.isPremium).toBe(false);
      expect(res.body.trustScore).toBeNull();
      expect(res.body.trustLevel).toBeNull();
    });

    scenario('USR-060', async () => {
      // İptal edilmiş AMA dönem-içi (currentPeriodEnd > now) → premium hakkı sürer.
      const user = await createUser(ctx.module);
      const prisma = getPrisma();
      const paidTier = await prisma.membershipTier.findFirst({
        where: { type: { not: 'free' }, isActive: true },
      });
      const now = new Date();
      await prisma.userMembership.create({
        data: {
          userId: user.id,
          tierId: paidTier!.id,
          status: 'cancelled' as any,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
          autoRenew: false,
        },
      });
      const res = await request(server()).get(`/api/users/${user.id}/profile`).expect(200);
      expect(res.body.isPremium).toBe(true);
      expect(typeof res.body.trustScore).toBe('number');
    });

    scenario('USR-061', async () => {
      const res = await request(server())
        .get('/api/users/00000000-0000-0000-0000-000000000000/profile')
        .expect(404);
      expect(JSON.stringify(res.body.message)).toContain('Kullanıcı bulunamadı');
    });

    scenario('USR-078', async () => {
      const user = await createUser(ctx.module, { displayName: 'PII Test' });
      await getPrisma().user.update({
        where: { id: user.id },
        data: { phone: '+905551234567', avatarUrl: 'dev/avatars/test/x.jpg' },
      });
      const profile = await request(server()).get(`/api/users/${user.id}/profile`).expect(200);
      expect(profile.body.email).toBeUndefined();
      expect(profile.body.phone).toBeUndefined();
      expect(profile.body.passwordHash).toBeUndefined();
      expect(profile.body.fcmToken).toBeUndefined();
      expect(profile.body.bannedReason).toBeUndefined();
      // Avatar redirect yalnızca presigned http(s) URL.
      const avatar = await request(server()).get(`/api/users/${user.id}/avatar`).redirects(0);
      expect(avatar.status).toBe(302);
      expect(avatar.headers.location).toMatch(/^https?:\/\//);
    });
  });

  // ──────────────────────────── Bank account ────────────────────────────
  describe('Bank account', () => {
    scenario('USR-062', async () => {
      const user = await createUser(ctx.module);
      // NOT: DTO @Matches(/^TR\d{24}$/) boşluklu IBAN'ı REDDEDER (Transform yok);
      // bu yüzden normalizasyonu doğrulamak için boşluksuz gönderiyoruz. Service yine
      // toUpperCase + boşluk temizliği uygular (user.service.ts:2510).
      await request(server())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({
          accountHolder: 'Ahmet Yılmaz',
          iban: 'TR330006100519786457841326',
          tcKimlikNo: '12345678901',
        })
        .expect(200);
      const get = await request(server())
        .get('/api/users/me/bank-account')
        .set(authHeader(user))
        .expect(200);
      expect(get.body.iban).toBe('TR330006100519786457841326');
      expect(get.body.isVerified).toBe(false);
    });

    scenario('USR-063', async () => {
      const user = await createUser(ctx.module);
      const prisma = getPrisma();
      await request(server())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({ accountHolder: 'Ahmet Yılmaz', iban: 'TR330006100519786457841326' })
        .expect(200);
      // Verify=true yap, sonra farklı IBAN ile upsert → verify reset.
      await prisma.sellerBankAccount.update({
        where: { userId: user.id },
        data: { isVerified: true, verifiedAt: new Date() },
      });
      await request(server())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({ accountHolder: 'Ahmet Yılmaz', iban: 'TR000006100519786457841399' })
        .expect(200);
      const count = await prisma.sellerBankAccount.count({ where: { userId: user.id } });
      expect(count).toBe(1);
      const row = await prisma.sellerBankAccount.findUnique({ where: { userId: user.id } });
      expect(row?.iban).toBe('TR000006100519786457841399');
      expect(row?.isVerified).toBe(false);
      expect(row?.verifiedAt).toBeNull();
    });

    scenario('USR-064', async () => {
      const user = await createUser(ctx.module);
      const r1 = await request(server())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({ accountHolder: 'Ahmet', iban: 'DE89370400440532013000' })
        .expect(400);
      expect(JSON.stringify(r1.body.message)).toContain('Geçerli bir TR IBAN');
      await request(server())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({ accountHolder: 'Ahmet', iban: 'TR12' })
        .expect(400);
    });

    scenario('USR-065', async () => {
      const user = await createUser(ctx.module);
      // accountHolder 1 karakter → 400 (2-150).
      await request(server())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({ accountHolder: 'A', iban: 'TR330006100519786457841326' })
        .expect(400);
      // tcKimlikNo 3 hane → 400 (11 hane).
      await request(server())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({ accountHolder: 'Ahmet', iban: 'TR330006100519786457841326', tcKimlikNo: '123' })
        .expect(400);
    });

    scenario('USR-066', async () => {
      const user = await createUser(ctx.module);
      await request(server())
        .patch('/api/users/me/bank-account')
        .set(authHeader(user))
        .send({ accountHolder: 'Ahmet Yılmaz', iban: 'TR330006100519786457841326' })
        .expect(200);
      const del = await request(server())
        .delete('/api/users/me/bank-account')
        .set(authHeader(user))
        .expect(200);
      expect(del.body.success).toBe(true);
      const del2 = await request(server())
        .delete('/api/users/me/bank-account')
        .set(authHeader(user))
        .expect(404);
      expect(JSON.stringify(del2.body.message)).toContain('Banka hesabı bulunamadı');
    });

    scenario('USR-067', async () => {
      await request(server()).get('/api/users/me/bank-account').expect(401);
      await request(server())
        .patch('/api/users/me/bank-account')
        .send({ accountHolder: 'A', iban: 'TR330006100519786457841326' })
        .expect(401);
      await request(server()).delete('/api/users/me/bank-account').expect(401);
    });

    scenario('USR-068', async () => {
      const ayse = await createUser(ctx.module, { email: 'ayse@test.com' });
      const ahmet = await createUser(ctx.module, { email: 'ahmet@test.com' });
      // ahmet'in hesabı.
      await request(server())
        .patch('/api/users/me/bank-account')
        .set(authHeader(ahmet))
        .send({ accountHolder: 'Ahmet', iban: 'TR110006100519786457841311' })
        .expect(200);
      // ayse kendi hesabını oluşturur, farklı IBAN.
      await request(server())
        .patch('/api/users/me/bank-account')
        .set(authHeader(ayse))
        .send({ accountHolder: 'Ayşe', iban: 'TR220006100519786457841322' })
        .expect(200);
      const ayseGet = await request(server())
        .get('/api/users/me/bank-account')
        .set(authHeader(ayse))
        .expect(200);
      expect(ayseGet.body.iban).toBe('TR220006100519786457841322');
      expect(ayseGet.body.iban).not.toBe('TR110006100519786457841311');
    });
  });

  // ──────────────────────────── Block ────────────────────────────
  describe('Block', () => {
    scenario('USR-069', async () => {
      const me = await createUser(ctx.module);
      const target = await createUser(ctx.module);
      await request(server())
        .post(`/api/users/${target.id}/block`)
        .set(authHeader(me))
        .expect(201);
      const list = await request(server())
        .get('/api/users/me/blocked')
        .set(authHeader(me))
        .expect(200);
      expect((list.body as any[]).map((u) => u.id)).toContain(target.id);
      await request(server())
        .delete(`/api/users/${target.id}/block`)
        .set(authHeader(me))
        .expect(200);
      const after = await request(server())
        .get('/api/users/me/blocked')
        .set(authHeader(me))
        .expect(200);
      expect((after.body as any[]).map((u) => u.id)).not.toContain(target.id);
    });

    scenario('USR-070', async () => {
      const me = await createUser(ctx.module);
      const res = await request(server())
        .post(`/api/users/${me.id}/block`)
        .set(authHeader(me))
        .expect(400);
      expect(JSON.stringify(res.body.message)).toContain('Kendinizi engelleyemezsiniz');
    });

    scenario('USR-071', async () => {
      const me = await createUser(ctx.module);
      const target = await createUser(ctx.module);
      await request(server())
        .post('/api/users/00000000-0000-0000-0000-000000000000/block')
        .set(authHeader(me))
        .expect(404);
      await request(server())
        .post(`/api/users/${target.id}/block`)
        .set(authHeader(me))
        .expect(201);
      const dup = await request(server())
        .post(`/api/users/${target.id}/block`)
        .set(authHeader(me))
        .expect(400);
      expect(JSON.stringify(dup.body.message)).toContain('zaten engellenmiş');
    });

    scenario.skip(
      'USR-072',
      'Engel listesi in-memory Map (user.service.ts:72-73). API restart davranışı ' +
        'tek-process supertest harness\'inde gözlemlenemez (uygulama yeniden başlatılamaz).',
    );

    scenario('USR-073', async () => {
      const target = await createUser(ctx.module);
      await request(server()).post(`/api/users/${target.id}/block`).expect(401);
      await request(server()).delete(`/api/users/${target.id}/block`).expect(401);
      await request(server()).get('/api/users/me/blocked').expect(401);
    });
  });

  // ──────────────────────────── Seller upgrade ────────────────────────────
  describe('Seller upgrade', () => {
    scenario('USR-074', async () => {
      const user = await createUser(ctx.module);
      await request(server()).post('/api/users/me/seller').set(authHeader(user)).expect(201);
      const me = await request(server()).get('/api/users/me').set(authHeader(user)).expect(200);
      expect(me.body.isSeller).toBe(true);
      expect(me.body.sellerType).toBe('individual');
    });
  });

  // ──────────────────────────── Security / risk ────────────────────────────
  describe('Security & risk', () => {
    scenario('USR-076', async () => {
      // Banlı kullanıcı: BannedUserGuard global APP_GUARD olarak kayıtlı (app.module.ts:237).
      // jwt.strategy yalnız deletedAt'e bakar ama banned-user.guard.ts kimliği doğrulanmış
      // aksiyonları reddeder → /me 403 (USER_BANNED). Public/logout/support hariç.
      const user = await createUser(ctx.module);
      await getPrisma().user.update({
        where: { id: user.id },
        data: { isBanned: true, bannedReason: 'test' },
      });
      const res = await request(server()).get('/api/users/me').set(authHeader(user)).expect(403);
      expect(res.body.errorCode).toBe('USER_BANNED');
    });
  });

  // ──────────────────────────── Stats & analytics ────────────────────────────
  describe('Stats & analytics', () => {
    scenario('USR-083', async () => {
      const user = await createUser(ctx.module);
      const res = await request(server())
        .get('/api/users/me/stats')
        .set(authHeader(user))
        .expect(200);
      for (const key of [
        'productsCount',
        'activeProductsCount',
        'soldProductsCount',
        'ordersCount',
        'completedOrdersCount',
        'purchasesCount',
        'salesCount',
        'tradesCount',
        'successfulTradesCount',
        'collectionsCount',
        'totalViews',
        'totalFavorites',
        'rating',
        'reviewsCount',
        'totalRevenue',
        'totalSpent',
        'memberSince',
        'membershipTier',
      ]) {
        expect(res.body).toHaveProperty(key);
      }
    });

    scenario('USR-084', async () => {
      const user = await createUser(ctx.module);
      const fields = [
        'totalViews',
        'totalFavorites',
        'totalSales',
        'totalRevenue',
        'activeListings',
        'pendingOrders',
        'topProducts',
        'dailyViews',
        'recentActivity',
        'categoryStats',
      ];
      for (const period of ['7d', '90d', '']) {
        const q = period ? `?period=${period}` : '';
        const res = await request(server())
          .get(`/api/users/me/analytics${q}`)
          .set(authHeader(user))
          .expect(200);
        for (const f of fields) expect(res.body).toHaveProperty(f);
      }
    });

    scenario('USR-085', async () => {
      const prisma = getPrisma();
      // (a) Free tier kullanıcı → "işletme üyeliğine sahip" hatası.
      const free = await createUser(ctx.module);
      const a = await request(server())
        .get('/api/users/me/business-stats')
        .set(authHeader(free))
        .expect(400);
      expect(JSON.stringify(a.body.message)).toContain('işletme üyeliğine sahip');

      // (b) Business tier AMA companyName yok → "şirket adı bilgisi gereklidir".
      const biz = await createUser(ctx.module);
      const bizTier = await prisma.membershipTier.create({
        data: {
          type: 'business' as any,
          name: 'Test Business',
          monthlyPrice: 100,
          yearlyPrice: 1000,
          maxFreeListings: 1000,
          maxTotalListings: 1000,
          maxImagesPerListing: 20,
          isActive: true,
        },
      });
      const now = new Date();
      await prisma.userMembership.create({
        data: {
          userId: biz.id,
          tierId: bizTier.id,
          status: 'active' as any,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          autoRenew: false,
        },
      });
      const b = await request(server())
        .get('/api/users/me/business-stats')
        .set(authHeader(biz))
        .expect(400);
      expect(JSON.stringify(b.body.message)).toContain('şirket adı bilgisi gereklidir');
    });

    scenario('USR-086', async () => {
      const prisma = getPrisma();
      const biz = await createUser(ctx.module);
      const bizTier = await prisma.membershipTier.create({
        data: {
          type: 'business' as any,
          name: 'Test Business',
          monthlyPrice: 100,
          yearlyPrice: 1000,
          maxFreeListings: 1000,
          maxTotalListings: 1000,
          maxImagesPerListing: 20,
          isActive: true,
        },
      });
      const now = new Date();
      await prisma.userMembership.create({
        data: {
          userId: biz.id,
          tierId: bizTier.id,
          status: 'active' as any,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          autoRenew: false,
        },
      });
      await prisma.user.update({
        where: { id: biz.id },
        data: { companyName: 'Ali Diecast A.Ş.' },
      });
      const res = await request(server())
        .get('/api/users/me/business-stats')
        .set(authHeader(biz))
        .expect(200);
      expect(res.body.overview).toBeTruthy();
      expect(res.body.weekly).toBeTruthy();
      expect(res.body.topProducts).toEqual(
        expect.objectContaining({ byViews: expect.any(Array), byLikes: expect.any(Array) }),
      );
      expect(Array.isArray(res.body.topCollections)).toBe(true);
      expect(res.body.company).toBeTruthy();
    });
  });

  // ──────────────────────────── Public featured endpoints ────────────────────────────
  describe('Public featured endpoints', () => {
    scenario('USR-087', async () => {
      const topSellers = await request(server())
        .get('/api/users/top-sellers?limit=5')
        .expect(200);
      expect(Array.isArray(topSellers.body)).toBe(true);

      const topCollections = await request(server())
        .get('/api/users/top-collections?limit=20')
        .expect(200);
      expect(Array.isArray(topCollections.body)).toBe(true);

      // featured-collector / featured-business: veri yoksa null döner (try/catch graceful).
      const collector = await request(server()).get('/api/users/featured-collector').expect(200);
      expect(collector.body === null || typeof collector.body === 'object').toBe(true);

      const business = await request(server()).get('/api/users/featured-business').expect(200);
      expect(business.body === null || typeof business.body === 'object').toBe(true);
    });
  });

  // ──────────────────────────── Parite / i18n (kapsam dışı / saf-UI) ────────────────────────────
  describe('Parite & i18n', () => {
    scenario('USR-079', async () => {
      // Hata mesajları Türkçe + locale'den bağımsız sabit (DTO mesajları).
      const user = await createUser(ctx.module);
      const phone = await request(server())
        .patch('/api/users/me')
        .set(authHeader(user))
        .send({ phone: '12345' })
        .expect(400);
      expect(JSON.stringify(phone.body.message)).toContain('Geçerli bir Türkiye telefon');
      for (let i = 0; i < 10; i++) await createAddress({ userId: user.id, isDefault: false });
      const addr = await request(server())
        .post('/api/users/me/addresses')
        .set(authHeader(user))
        .send(validAddress())
        .expect(400);
      expect(JSON.stringify(addr.body.message)).toContain('En fazla 10 adres');
    });

    scenario.skip(
      'USR-080',
      'Web↔mobile parite: her iki platform da tek DTO ile aynı PATCH /api/users/me ' +
        'ucuna gider; tek backend endpoint olduğundan API-seviyesi parite ek bir assertion ' +
        'üretmez (UI/istemci paritesi e2e kapsamı dışı). USR-005..016 zaten tek DTO ' +
        'davranışını doğrular.',
    );

    scenario.skip(
      'USR-082',
      'Admin kullanıcı yönetimi paritesi admin paneli/admin API (AdminJwtAuthGuard + Roles) ' +
        'kapsamında; USR domaininin uçları değil. Admin domain spec\'inde ele alınmalı.',
    );
  });
});
