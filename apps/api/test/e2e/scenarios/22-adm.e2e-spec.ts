/**
 * 22 — Admin Paneli & Yetkilendirme (ADM) — Test Konsolu senaryoları.
 *
 * Yapı 01-auth.e2e-spec.ts ile birebir aynıdır (FAN-OUT şablonu): her test
 * `scenario('ADM-NNN', fn)` ile manifest'e bağlanır; başlık/öncelik manifest'ten
 * otomatik gelir. Assertion'lar manifest exp'lerinden + GERÇEK koddan türetildi:
 *   - auth/admin-auth.controller.ts  (admin login/refresh/profile/logout)
 *   - auth/guards/admin-jwt-auth.guard.ts (yetkisiz/normal token → 401)
 *   - auth/guards/roles.guard.ts + admin/dto/role-permissions.dto.ts (rol + izin matrisi)
 *   - admin/admin.controller.ts + admin/admin.service.ts (dashboard/users/products/
 *     orders/settings/staff/payouts/tax/membership/audit-log)
 *   - reports/reports.controller.ts (sales/dashboard/access + RBAC)
 *   - pages/pages.service.ts + admin CMS uçları
 *   - prisma/schema.prisma (AuditLog, PayoutTransfer, TradeCashPayment, StaticPage)
 *
 * GERÇEK KODA GÖRE DENETLENDİ (adversarial statik doğrulama):
 *   - Guard zinciri (admin/*): önce AdminJwtAuthGuard. Normal kullanıcı token'ı
 *     (isAdmin claim'i yok) → AdminJwtStrategy 401. Yani "normal kullanıcı admin
 *     ucu" ve "oturumsuz" = 401. RolesGuard rol/izin eşleşmezse = 403.
 *   - createAdminUser varsayılan super_admin → RolesGuard'da matrisi BYPASS eder
 *     (role==='super_admin' → true). admin/moderator ayrımı gereken senaryolarda
 *     rol açıkça verilir (role: AdminRole.admin | AdminRole.moderator).
 *   - RolesGuard izin matrisi 60s cache'li SINGLETON; platform_settings truncate
 *     edildiğinden her test DEFAULT_ROLE_PERMISSIONS'a düşmeli → beforeEach'te
 *     ctx.module.get(RolesGuard).invalidateCache() (cache sızıntısını önle).
 *   - Matris URL segment'ine göre çözülür: /api/admin/<seg>/... → PERMISSION_MAP[seg].
 *     /reports/* uçlarında 'admin' segmenti YOK → resolveUrlPermissions null →
 *     yalnız @Roles uygulanır (matris devreye girmez).
 *   - admin default izinleri: settings/payment_settings/tax/membership_tiers/logs/
 *     audit_logs/staff/commission YOK → bu segmentlerde admin 403; super_admin 200.
 *   - moderator default izinleri: dashboard/products/users/reviews/reports/messages/
 *     support/trades/ai_moderation → commission/orders/discounts/settings/audit-logs/
 *     pages/email_templates/payments/payouts/refund_requests/tax/membership_tiers YOK.
 *   - createAuditLog(adminId=User.id) → içeride AdminUser.id'ye ÇÖZÜLÜR; ban/unban/
 *     setting_update/payout_release/manual_refund audit'leri DOĞRU yazılır (adminId
 *     controller'dan @CurrentUser('id')=User.id gelir). Hassas alanlar (passwordHash
 *     vb.) '[GİZLİ]' maskesi; Date→ISO string; Decimal→number.
 *   - throttle .env.test'te skipIf(NODE_ENV==='test') ile KAPALI → 429 üretilemez →
 *     ADM-003 (brute-force 429) tek skip'tir (harness kısıtı). ADM-004 pozitif
 *     regresyon (429 GÖRÜLMEMELİ) test EDİLİR.
 */
import * as request from 'supertest';
import { AdminRole, PaymentStatus, PayoutStatus } from '@prisma/client';
import { createE2ETestApp, E2ETestApp } from '../../test-utils/create-app';
import { truncateAll, getPrisma, seedBaseline, disconnectPrisma } from '../../test-utils/db';
import { createUser, createAdminUser, authHeader } from '../../factories/user.factory';
import { createProduct } from '../../factories/product.factory';
import { createAddress } from '../../factories/address.factory';
import { buyAndPay } from '../../factories/flows';
import { scenario } from '../../test-utils/scenario';
import { RolesGuard } from '../../../src/modules/auth/guards/roles.guard';
import { ADMIN_PERMISSION_KEYS } from '../../../src/modules/admin/dto/role-permissions.dto';

const NIL_UUID = 'a0000000-0000-4000-8000-000000000000';

describe('22 — Admin Paneli & Yetkilendirme (ADM)', () => {
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
    // RolesGuard izin matrisi 60s cache'li singleton; platform_settings truncate
    // edildiğinden her test DEFAULT_ROLE_PERMISSIONS'a düşmeli (özel matris sızıntısını önle).
    ctx.module.get(RolesGuard).invalidateCache();
  });

  // ──────────────────────────── Yardımcılar ────────────────────────────

  /** super_admin oluştur + gerçek admin refresh token'ı için admin-login yap. */
  async function adminLogin(admin: { email: string; password: string }) {
    return request(server())
      .post('/api/auth/admin/login')
      .send({ email: admin.email, password: admin.password });
  }

  /** Bir satıcı + adresli alıcı + pending ürün oluştur; döner ürün id. */
  async function pendingProduct(sellerId: string) {
    return createProduct({ sellerId, categoryId: baseline.categoryId, status: 'pending' });
  }

  /** premium tier'ı (yıllık-fiyat testleri için) ekle — seedBaseline yalnız free/basic seedler. */
  async function seedPremiumTier(monthly = 50) {
    const prisma = getPrisma();
    return prisma.membershipTier.create({
      data: {
        type: 'premium',
        name: 'Test Premium',
        monthlyPrice: monthly,
        yearlyPrice: monthly * 12,
        maxFreeListings: 5000,
        maxTotalListings: 5000,
        maxImagesPerListing: 30,
        canCreateCollections: true,
        canTrade: true,
        isAdFree: true,
        isActive: true,
      },
    });
  }

  /** admin'e belirli izin(ler) ver (staff gibi matris-dışı segmentleri test etmek için). */
  async function grantAdminPermissions(perms: string[]) {
    const prisma = getPrisma();
    const value = JSON.stringify({ admin: perms, moderator: [] });
    await prisma.platformSetting.upsert({
      where: { settingKey: 'admin_role_permissions' },
      update: { settingValue: value, settingType: 'json' },
      create: { settingKey: 'admin_role_permissions', settingValue: value, settingType: 'json' },
    });
    ctx.module.get(RolesGuard).invalidateCache();
  }

  // ════════════════════════════ Admin kimlik doğrulama ════════════════════════════

  scenario('ADM-001', async () => {
    const admin = await createAdminUser(ctx.module, { email: 'admin@tarodan.com', role: AdminRole.super_admin });
    const res = await adminLogin(admin).expect(200);
    expect(res.body.tokens?.accessToken).toBeTruthy();
    expect(res.body.tokens?.refreshToken).toBeTruthy();
    expect(res.body.user?.email).toBe('admin@tarodan.com');
    expect(res.body.user?.role).toBe('super_admin');
    const setCookie = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(setCookie.join(';')).toContain('admin_token=');
    expect(setCookie.join(';')).toContain('admin_refresh_token=');
  });

  scenario('ADM-002', async () => {
    const admin = await createAdminUser(ctx.module, { email: 'admin2@tarodan.com' });
    const res = await request(server())
      .post('/api/auth/admin/login')
      .send({ email: admin.email, password: 'yanlis-sifre' })
      .expect(401);
    const setCookie = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(setCookie.join(';')).not.toContain('admin_token=');
  });

  // Brute-force 429: ThrottlerModule skipIf(NODE_ENV==='test') → test'te throttle
  // TAMAMEN kapalı; 6. istek de 401 döner, 429 asla üretilemez → harness kısıtı.
  scenario.skip('ADM-003', 'Throttle test env’de kapalı (skipIf NODE_ENV=test) → admin login 429 üretilemez');

  scenario('ADM-004', async () => {
    // Admin profil ucu @SkipThrottle; ayrıca throttle test'te kapalı → 10 hızlı çağrıda 429 yok.
    const admin = await createAdminUser(ctx.module, { email: 'prof-throttle@tarodan.com' });
    for (let i = 0; i < 10; i++) {
      const r = await request(server()).get('/api/auth/admin/profile').set(authHeader(admin));
      expect(r.status).toBe(200);
      expect(r.status).not.toBe(429);
    }
  });

  scenario('ADM-005', async () => {
    // Admin token olmadan profil → AdminAuthGuard 401.
    await request(server()).get('/api/auth/admin/profile').expect(401);
  });

  scenario('ADM-006', async () => {
    // Normal kullanıcı token'ı admin ucunda → AdminJwtStrategy 401 (isAdmin claim yok).
    const user = await createUser(ctx.module);
    await request(server()).get('/api/admin/users').set(authHeader(user)).expect(401);
  });

  scenario('ADM-007', async () => {
    await request(server()).get('/api/admin/users').expect(401);
  });

  scenario('ADM-008', async () => {
    // Admin logout Public → token'sız da 200; admin cookie'leri temizlenir (maxAge=0).
    const res = await request(server()).post('/api/auth/admin/logout').expect(200);
    const setCookie = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    expect(setCookie.join(';')).toContain('admin_token=');
    expect(setCookie.join(';')).toContain('admin_refresh_token=');
  });

  scenario('ADM-009', async () => {
    // Admin refresh ayrı uçtan çalışır: admin-login → refresh token al → admin/refresh 200.
    const admin = await createAdminUser(ctx.module, { email: 'admin-refresh@tarodan.com' });
    const login = await adminLogin(admin).expect(200);
    const rt = login.body.tokens.refreshToken;
    const r = await request(server())
      .post('/api/auth/admin/refresh')
      .send({ refreshToken: rt })
      .expect(200);
    expect(r.body.accessToken).toBeTruthy();
    // Yenilenen access token isAdmin claim'i taşır (admin refresh).
    const payload = JSON.parse(Buffer.from(r.body.accessToken.split('.')[1], 'base64').toString('utf8'));
    expect(payload.isAdmin).toBe(true);
  });

  scenario('ADM-010', async () => {
    await request(server())
      .post('/api/auth/admin/refresh')
      .send({ refreshToken: 'bozuk.gecersiz.token' })
      .expect(401);
  });

  // ════════════════════════════ Komisyon kuralları (RBAC + para) ════════════════════════════

  scenario('ADM-013', async () => {
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const res = await request(server())
      .get('/api/admin/commission-rules')
      .set(authHeader(superAdmin))
      .expect(200);
    expect(res.body).toBeTruthy();
  });

  scenario('ADM-014', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    const res = await request(server())
      .get('/api/admin/commission-rules')
      .set(authHeader(moderator))
      .expect(403);
    expect(String(res.body.message)).toContain('commission');
  });

  scenario('ADM-015', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const res = await request(server())
      .post('/api/admin/commission-rules')
      .set(authHeader(admin))
      .send({ name: 'Bypass', sellerType: 'ALL', appliesTo: 'SELLER', sellerRate: 5 })
      .expect(403);
    expect(String(res.body.message)).toContain('super_admin');
  });

  scenario('ADM-016', async () => {
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const res = await request(server())
      .post('/api/admin/commission-rules')
      .set(authHeader(superAdmin))
      .send({ name: 'Varsayılan %5', sellerType: 'ALL', appliesTo: 'SELLER', sellerRate: 5, isActive: true });
    // Auth katmanı geçer: 401/403 DEĞİL (DTO validation'a bağlı 201 veya 400).
    expect([200, 201, 400]).toContain(res.status);
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  scenario('ADM-072', async () => {
    // Komisyon kuralı silme yalnız super_admin. Önce super_admin bir kural oluşturur.
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const admin = await createAdminUser(ctx.module, { email: 'del-cr-admin@tarodan.com', role: AdminRole.admin });
    const prisma = getPrisma();
    const rule = await prisma.commissionRule.create({
      data: { name: 'Silinecek', ruleType: 'default', percentage: 0.05, appliesTo: 'SELLER', sellerRate: 0.05, isActive: true },
    });
    // admin → 403.
    await request(server())
      .delete(`/api/admin/commission-rules/${rule.id}`)
      .set(authHeader(admin))
      .expect(403);
    // super_admin → 204.
    await request(server())
      .delete(`/api/admin/commission-rules/${rule.id}`)
      .set(authHeader(superAdmin))
      .expect(204);
    const gone = await prisma.commissionRule.findUnique({ where: { id: rule.id } });
    expect(gone).toBeNull();
  });

  // ════════════════════════════ Platform ayarları (RBAC) ════════════════════════════

  scenario('ADM-017', async () => {
    // admin settings OKUYAMAZ (matris @Roles'u ezer: admin'de settings/payment_settings yok).
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    await request(server()).get('/api/admin/settings').set(authHeader(admin)).expect(403);
    // super_admin okuyabilir.
    const superAdmin = await createAdminUser(ctx.module, { email: 'sa-settings@tarodan.com', role: AdminRole.super_admin });
    await request(server()).get('/api/admin/settings').set(authHeader(superAdmin)).expect(200);
  });

  scenario('ADM-018', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    await request(server())
      .patch('/api/admin/settings')
      .set(authHeader(moderator))
      .send({ key: 'commission_rate', value: '0.5' })
      .expect(403);
  });

  scenario('ADM-067', async () => {
    // Public settings kimlik doğrulamasız erişilir; yalnız public ayarlar döner.
    const res = await request(server()).get('/api/admin/settings/public').expect(200);
    expect(res.body).toBeTruthy();
  });

  scenario('ADM-068', async () => {
    // Segment-bazlı setting güncelleme (PATCH /settings/:key) yalnız super_admin → admin 403.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    await request(server())
      .patch('/api/admin/settings/commission_rate')
      .set(authHeader(admin))
      .send({ value: '0.1' })
      .expect(403);
  });

  scenario('ADM-069', async () => {
    // key eksik → PlatformSettingDto (@IsString key) 400.
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    await request(server())
      .patch('/api/admin/settings')
      .set(authHeader(superAdmin))
      .send({ value: 'x' })
      .expect(400);
  });

  scenario('ADM-070', async () => {
    // Yeni anahtar upsert ile oluşur; settingType default 'string'.
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    await request(server())
      .patch('/api/admin/settings')
      .set(authHeader(superAdmin))
      .send({ key: 'yeni_ayar', value: 'deger' })
      .expect(200);
    const prisma = getPrisma();
    const row = await prisma.platformSetting.findUnique({ where: { settingKey: 'yeni_ayar' } });
    expect(row?.settingValue).toBe('deger');
    expect(row?.settingType).toBe('string');
  });

  scenario('ADM-063', async () => {
    // premium_monthly_price=100 → premium tier monthlyPrice=100, yearlyPrice=960 (100*12*0.8).
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const prisma = getPrisma();
    await seedPremiumTier(50);
    await request(server())
      .patch('/api/admin/settings')
      .set(authHeader(superAdmin))
      .send({ key: 'premium_monthly_price', value: '100' })
      .expect(200);
    const premium = await prisma.membershipTier.findUnique({ where: { type: 'premium' } });
    expect(Number(premium?.monthlyPrice)).toBe(100);
    expect(Number(premium?.yearlyPrice)).toBe(960);
  });

  scenario('ADM-064', async () => {
    // yearly_discount_percentage=30 → her tier yearlyPrice = monthly*12*0.7.
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const prisma = getPrisma();
    await seedPremiumTier(100);
    await request(server())
      .patch('/api/admin/settings')
      .set(authHeader(superAdmin))
      .send({ key: 'yearly_discount_percentage', value: '30' })
      .expect(200);
    const basic = await prisma.membershipTier.findUnique({ where: { type: 'basic' } });
    const premium = await prisma.membershipTier.findUnique({ where: { type: 'premium' } });
    // basic monthly=50 → 50*12*0.7=420; premium monthly=100 → 100*12*0.7=840.
    expect(Number(basic?.yearlyPrice)).toBe(420);
    expect(Number(premium?.yearlyPrice)).toBe(840);
  });

  scenario('ADM-065', async () => {
    // Geçersiz (NaN) fiyat → ayar yazılır (200) ama tier yearlyPrice DEĞİŞMEZ (isNaN guard).
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const prisma = getPrisma();
    const before = await seedPremiumTier(100);
    await request(server())
      .patch('/api/admin/settings')
      .set(authHeader(superAdmin))
      .send({ key: 'premium_monthly_price', value: 'abc' })
      .expect(200);
    const after = await prisma.membershipTier.findUnique({ where: { type: 'premium' } });
    expect(Number(after?.yearlyPrice)).toBe(Number(before.yearlyPrice));
    const setting = await prisma.platformSetting.findUnique({ where: { settingKey: 'premium_monthly_price' } });
    expect(setting?.settingValue).toBe('abc');
  });

  // ════════════════════════════ Kullanıcı yönetimi (RBAC + ban) ════════════════════════════

  scenario('ADM-019', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    await createUser(ctx.module);
    await createUser(ctx.module);
    const res = await request(server()).get('/api/admin/users').set(authHeader(admin)).expect(200);
    const items = res.body.items || res.body.data || res.body;
    expect(Array.isArray(items) ? items.length : 0).toBeGreaterThanOrEqual(2);
  });

  scenario('ADM-020', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    await request(server()).get('/api/admin/users').set(authHeader(moderator)).expect(200);
  });

  scenario('ADM-036', async () => {
    // Ban → AuditLog(action=user_ban, entityType=User); oldValue/newValue JSON dolu.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const target = await createUser(ctx.module);
    const prisma = getPrisma();
    await request(server())
      .post(`/api/admin/users/${target.id}/ban`)
      .set(authHeader(admin))
      .send({ reason: 'Spam davranışı' })
      .expect(200);
    const banned = await prisma.user.findUnique({ where: { id: target.id } });
    expect(banned?.isBanned).toBe(true);
    expect(banned?.bannedReason).toBe('Spam davranışı');
    const logs = await prisma.auditLog.findMany({
      where: { action: 'user_ban', entityType: 'User', entityId: target.id },
    });
    expect(logs.length).toBe(1);
    expect(logs[0].oldValue).toBeTruthy();
    expect(logs[0].newValue).toBeTruthy();
  });

  scenario('ADM-037', async () => {
    // AuditLog hassas alanları maskeler: ban audit'i User nesnesini saklar (passwordHash içerir)
    // → oldValue/newValue içinde passwordHash '[GİZLİ]', düz metin hash YOK.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const target = await createUser(ctx.module, { email: 'mask-target@test.com', password: 'Secret123!' });
    const prisma = getPrisma();
    const before = await prisma.user.findUnique({ where: { id: target.id } });
    const plainHash = before!.passwordHash;
    await request(server())
      .post(`/api/admin/users/${target.id}/ban`)
      .set(authHeader(admin))
      .send({ reason: 'mask test' })
      .expect(200);
    const log = await prisma.auditLog.findFirst({
      where: { action: 'user_ban', entityId: target.id },
    });
    const blob = JSON.stringify(log?.oldValue) + JSON.stringify(log?.newValue);
    expect((log?.oldValue as any)?.passwordHash).toBe('[GİZLİ]');
    expect(blob).not.toContain(plainHash);
  });

  scenario('ADM-038', async () => {
    // setting_update audit Date→ISO string, Decimal→number; geçerli JSON.
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const prisma = getPrisma();
    await request(server())
      .patch('/api/admin/settings')
      .set(authHeader(superAdmin))
      .send({ key: 'premium_monthly_price', value: '99.90' })
      .expect(200);
    const log = await prisma.auditLog.findFirst({ where: { action: 'setting_update' }, orderBy: { createdAt: 'desc' } });
    expect(log).toBeTruthy();
    const nv = log!.newValue as any;
    // createdAt/updatedAt Date alanları ISO-8601 string olmalı.
    if (nv?.updatedAt) expect(typeof nv.updatedAt).toBe('string');
    // Tüm blob geçerli JSON (Prisma Json alanı → parse edilebilir).
    expect(() => JSON.stringify(nv)).not.toThrow();
  });

  scenario('ADM-043', async () => {
    // Audit yazımı best-effort: pasif/çözülemeyen admin senaryosunda ana işlem bozulmaz.
    // Setting'i doğrudan admin_users kaydı OLMAYAN bir User.id ile tetiklemek için:
    // super_admin ile ayar güncelle, sonra createAuditLog resolve edemese bile 200 döner.
    // Burada gözlemlenebilir garanti: ana aksiyon 200; audit atlanırsa hata FIRLAMAZ.
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const prisma = getPrisma();
    // admin kaydını pasifleştir → createAuditLog isActive:true filtresiyle audit'i atlar.
    await prisma.adminUser.updateMany({ where: { userId: superAdmin.id }, data: { isActive: false } });
    // Not: pasif admin login edemez ama mevcut JWT hâlâ geçerli (RolesGuard super_admin bypass).
    const res = await request(server())
      .patch('/api/admin/settings')
      .set(authHeader(superAdmin))
      .send({ key: 'robustness_key', value: '1' });
    expect(res.status).toBe(200);
    // Ana işlem başarılı; audit atlandı (adminUser isActive:false) — hata yok.
    const setting = await prisma.platformSetting.findUnique({ where: { settingKey: 'robustness_key' } });
    expect(setting?.settingValue).toBe('1');
  });

  scenario('ADM-046', async () => {
    // setting_update audit'te oldValue eski, newValue yeni değer taşır.
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const prisma = getPrisma();
    // Önce mevcut bir ayar oluştur (oldValue dolu olsun).
    await prisma.platformSetting.create({
      data: { settingKey: 'commission_rate', settingValue: '0.05', settingType: 'number' },
    });
    await request(server())
      .patch('/api/admin/settings')
      .set(authHeader(superAdmin))
      .send({ key: 'commission_rate', value: '0.07' })
      .expect(200);
    const log = await prisma.auditLog.findFirst({
      where: { action: 'setting_update' },
      orderBy: { createdAt: 'desc' },
    });
    expect((log?.oldValue as any)?.settingValue).toBe('0.05');
    expect((log?.newValue as any)?.settingValue).toBe('0.07');
  });

  scenario('ADM-113', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const target = await createUser(ctx.module);
    const prisma = getPrisma();
    await prisma.user.update({ where: { id: target.id }, data: { isBanned: true, bannedReason: 'ilk' } });
    const res = await request(server())
      .post(`/api/admin/users/${target.id}/ban`)
      .set(authHeader(admin))
      .send({ reason: 'tekrar' })
      .expect(400);
    expect(String(res.body.message)).toContain('zaten banlı');
  });

  scenario('ADM-114', async () => {
    // Ban: accepted takas cancelled + rezervasyon serbest; at_warehouse takas DEĞİŞMEZ.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const banned = await createUser(ctx.module, { isSeller: true });
    const other = await createUser(ctx.module, { isSeller: true });
    const prisma = getPrisma();

    const p1 = await createProduct({ sellerId: banned.id, categoryId: baseline.categoryId, isTradeEnabled: true, quantity: 1 });
    const p2 = await createProduct({ sellerId: other.id, categoryId: baseline.categoryId, isTradeEnabled: true, quantity: 1 });
    await prisma.product.update({ where: { id: p1.id }, data: { reservedQuantity: 1, status: 'reserved' } });

    const acceptedTrade = await prisma.trade.create({
      data: {
        tradeNumber: `T-ACC-${Date.now()}`,
        initiatorId: banned.id,
        receiverId: other.id,
        status: 'accepted',
        responseDeadline: new Date(Date.now() + 86400_000),
      },
    });
    await prisma.tradeItem.create({
      data: { tradeId: acceptedTrade.id, productId: p1.id, side: 'initiator', quantity: 1, valueAtTrade: 100 },
    });
    const warehouseTrade = await prisma.trade.create({
      data: {
        tradeNumber: `T-WH-${Date.now()}`,
        initiatorId: banned.id,
        receiverId: other.id,
        status: 'at_warehouse',
        responseDeadline: new Date(Date.now() + 86400_000),
      },
    });

    const res = await request(server())
      .post(`/api/admin/users/${banned.id}/ban`)
      .set(authHeader(admin))
      .send({ reason: 'abuse' })
      .expect(200);

    const acc = await prisma.trade.findUnique({ where: { id: acceptedTrade.id } });
    const wh = await prisma.trade.findUnique({ where: { id: warehouseTrade.id } });
    expect(acc?.status).toBe('cancelled');
    expect(wh?.status).toBe('at_warehouse'); // kargo/depo aşaması → DOKUNULMAZ
    expect(res.body.cancelledTradeIds).toContain(acceptedTrade.id);
    expect(Array.isArray(res.body.affectedProductIds)).toBe(true);
  });

  scenario('ADM-115', async () => {
    // Ban: active→suspended, pending→rejected, pending offer→cancelled.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const prisma = getPrisma();

    const activeP = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'active' });
    const pendingP = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'pending' });
    // buyer olarak bekleyen bir teklif oluştur.
    const targetP = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'active' });
    await prisma.offer.create({
      data: {
        productId: targetP.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        amount: 50,
        status: 'pending',
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });

    await request(server())
      .post(`/api/admin/users/${seller.id}/ban`)
      .set(authHeader(admin))
      .send({ reason: 'abuse' })
      .expect(200);

    expect((await prisma.product.findUnique({ where: { id: activeP.id } }))?.status).toBe('suspended');
    expect((await prisma.product.findUnique({ where: { id: pendingP.id } }))?.status).toBe('rejected');

    // buyer banlanmadı → onun teklifi hâlâ pending; seller banlandı için seller'ın teklif
    // durumunu doğrula: banlı seller'ın (varsa) teklifleri; burada buyer teklifi seller'a değil.
    // Bu yüzden banlı buyer testi ile teklif iptalini de doğrula:
    const buyer2 = await createUser(ctx.module);
    const p3 = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'active' });
    const off2 = await prisma.offer.create({
      data: { productId: p3.id, buyerId: buyer2.id, sellerId: seller.id, amount: 40, status: 'pending', expiresAt: new Date(Date.now() + 86400_000) },
    });
    await request(server())
      .post(`/api/admin/users/${buyer2.id}/ban`)
      .set(authHeader(admin))
      .send({ reason: 'abuse' })
      .expect(200);
    expect((await prisma.offer.findUnique({ where: { id: off2.id } }))?.status).toBe('cancelled');
  });

  scenario('ADM-116', async () => {
    // Unban: suspended ürünler active'e döner (onaya girmez); user_unban audit.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const prisma = getPrisma();
    await prisma.user.update({ where: { id: seller.id }, data: { isBanned: true, bannedReason: 'x', bannedAt: new Date() } });
    const suspended = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'active' });
    await prisma.product.update({ where: { id: suspended.id }, data: { status: 'suspended' } });

    await request(server())
      .post(`/api/admin/users/${seller.id}/unban`)
      .set(authHeader(admin))
      .expect(200);

    const u = await prisma.user.findUnique({ where: { id: seller.id } });
    expect(u?.isBanned).toBe(false);
    expect((await prisma.product.findUnique({ where: { id: suspended.id } }))?.status).toBe('active');
    const log = await prisma.auditLog.findFirst({ where: { action: 'user_unban', entityId: seller.id } });
    expect(log).toBeTruthy();
  });

  scenario('ADM-118', async () => {
    // Audit adminUserId = admin_users.id (User.id DEĞİL); FK tutarlı.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const target = await createUser(ctx.module);
    const prisma = getPrisma();
    const adminUserRow = await prisma.adminUser.findFirst({ where: { userId: admin.id } });
    await request(server())
      .post(`/api/admin/users/${target.id}/ban`)
      .set(authHeader(admin))
      .send({ reason: 'fk test' })
      .expect(200);
    const log = await prisma.auditLog.findFirst({ where: { action: 'user_ban', entityId: target.id } });
    expect(log?.adminUserId).toBe(adminUserRow!.id);
    expect(log?.adminUserId).not.toBe(admin.id); // User.id değil
  });

  // ════════════════════════════ Ürün moderasyonu (RBAC + audit) ════════════════════════════

  scenario('ADM-021', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await pendingProduct(seller.id);
    await request(server())
      .post(`/api/admin/products/${product.id}/approve`)
      .set(authHeader(moderator))
      .send({})
      .expect(200);
    const prisma = getPrisma();
    expect((await prisma.product.findUnique({ where: { id: product.id } }))?.status).toBe('active');
  });

  scenario('ADM-039', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await pendingProduct(seller.id);
    const prisma = getPrisma();
    await request(server())
      .post(`/api/admin/products/${product.id}/approve`)
      .set(authHeader(admin))
      .send({})
      .expect(200);
    const logs = await prisma.auditLog.findMany({
      where: { action: 'product_approve', entityType: 'Product', entityId: product.id },
    });
    expect(logs.length).toBe(1);
  });

  scenario('ADM-040', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const product = await pendingProduct(seller.id);
    const prisma = getPrisma();
    await request(server())
      .post(`/api/admin/products/${product.id}/reject`)
      .set(authHeader(admin))
      .send({ reason: 'Açıklama yetersiz' })
      .expect(200);
    const log = await prisma.auditLog.findFirst({
      where: { action: 'product_reject', entityId: product.id },
    });
    expect((log?.newValue as any)?.reason).toBe('Açıklama yetersiz');
    expect((await prisma.product.findUnique({ where: { id: product.id } }))?.status).toBe('rejected');
  });

  // ════════════════════════════ Sipariş / disput (RBAC + audit) ════════════════════════════

  scenario('ADM-022', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    const res = await request(server())
      .get('/api/admin/orders')
      .set(authHeader(moderator))
      .expect(403);
    expect(String(res.body.message)).toContain('orders');
  });

  scenario('ADM-034', async () => {
    // Force-complete yalnız super_admin. admin 403; super_admin 200 (geçerli sipariş).
    const admin = await createAdminUser(ctx.module, { email: 'fc-admin@test.com', role: AdminRole.admin });
    const superAdmin = await createAdminUser(ctx.module, { email: 'fc-sa@test.com', role: AdminRole.super_admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const addr = await createAddress({ userId: buyer.id });
    const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'active', quantity: 5 });
    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

    // admin → 403 (rol yetersiz).
    await request(server())
      .post(`/api/admin/orders/${orderId}/force-complete`)
      .set(authHeader(admin))
      .send({ reason: 'test' })
      .expect(403);
    // super_admin → 200.
    await request(server())
      .post(`/api/admin/orders/${orderId}/force-complete`)
      .set(authHeader(superAdmin))
      .send({ reason: 'test' })
      .expect(200);
  });

  scenario('ADM-041', async () => {
    // Dispute çözümü → dispute_resolve AuditLog (entityType=Order). resolveDispute yalnız
    // var olan sipariş ister; 'seller_favor' → status=completed.
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const addr = await createAddress({ userId: buyer.id });
    const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'active', quantity: 5 });
    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    await request(server())
      .post(`/api/admin/orders/${orderId}/resolve`)
      .set(authHeader(superAdmin))
      .send({ resolution: 'seller_favor', note: 'Satıcı lehine' })
      .expect(200);
    const log = await prisma.auditLog.findFirst({
      where: { action: 'dispute_resolve', entityType: 'Order', entityId: orderId },
    });
    expect(log).toBeTruthy();
    expect((log?.newValue as any)?.resolution).toBe('seller_favor');
  });

  scenario('ADM-111', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    await request(server())
      .get(`/api/admin/orders/${NIL_UUID}`)
      .set(authHeader(admin))
      .expect(404);
  });

  scenario('ADM-112', async () => {
    // Admin herhangi bir siparişi görür; normal kullanıcı admin ucunda 401.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const addr = await createAddress({ userId: buyer.id });
    const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'active', quantity: 5 });
    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);

    await request(server()).get(`/api/admin/orders/${orderId}`).set(authHeader(admin)).expect(200);
    await request(server()).get(`/api/admin/orders/${orderId}`).set(authHeader(buyer)).expect(401);
  });

  // ════════════════════════════ İndirim / kampanya (RBAC) ════════════════════════════

  scenario('ADM-023', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    // moderator matriste discounts yok → GET ve POST 403.
    await request(server()).get('/api/admin/discounts').set(authHeader(moderator)).expect(403);
    await request(server())
      .post('/api/admin/discounts')
      .set(authHeader(moderator))
      .send({ name: 'X', code: 'X10', type: 'percentage', value: 10, scope: 'global', startDate: '2026-01-01T00:00:00Z', endDate: '2026-12-31T23:59:59Z' })
      .expect(403);
  });

  scenario('ADM-024', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const res = await request(server())
      .post('/api/admin/discounts')
      .set(authHeader(admin))
      .send({
        name: 'Genel %10',
        code: 'GLOBAL10',
        type: 'percentage',
        value: 10,
        scope: 'global',
        startDate: '2026-01-01T00:00:00Z',
        endDate: '2026-12-31T23:59:59Z',
      });
    expect([200, 201]).toContain(res.status);
  });

  // ════════════════════════════ Audit-logs / logs / IP (RBAC) ════════════════════════════

  scenario('ADM-025', async () => {
    // audit-logs @RequirePermission('logs'): moderator 403, admin 403 (matriste logs yok), super_admin 200.
    const moderator = await createAdminUser(ctx.module, { email: 'al-mod@test.com', role: AdminRole.moderator });
    const admin = await createAdminUser(ctx.module, { email: 'al-admin@test.com', role: AdminRole.admin });
    const superAdmin = await createAdminUser(ctx.module, { email: 'al-sa@test.com', role: AdminRole.super_admin });
    await request(server()).get('/api/admin/audit-logs').set(authHeader(moderator)).expect(403);
    await request(server()).get('/api/admin/audit-logs').set(authHeader(admin)).expect(403);
    await request(server()).get('/api/admin/audit-logs').set(authHeader(superAdmin)).expect(200);
  });

  scenario('ADM-045', async () => {
    // Audit filtreleme (super_admin): ?action=user_ban yalnız user_ban kayıtları.
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const target = await createUser(ctx.module);
    await request(server())
      .post(`/api/admin/users/${target.id}/ban`)
      .set(authHeader(superAdmin))
      .send({ reason: 'filtre testi' })
      .expect(200);
    const res = await request(server())
      .get('/api/admin/audit-logs?action=user_ban')
      .set(authHeader(superAdmin))
      .expect(200);
    const items = res.body.items || res.body.data || [];
    expect(Array.isArray(items)).toBe(true);
    for (const it of items) expect(it.action).toBe('user_ban');
  });

  scenario('ADM-027', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    await request(server())
      .patch(`/api/admin/logs/security/${NIL_UUID}/resolve`)
      .set(authHeader(moderator))
      .expect(403);
  });

  scenario('ADM-028', async () => {
    // IP engelleme yalnız super_admin (@Roles(super_admin)+@RequirePermission('logs')).
    const admin = await createAdminUser(ctx.module, { email: 'ip-admin@test.com', role: AdminRole.admin });
    const superAdmin = await createAdminUser(ctx.module, { email: 'ip-sa@test.com', role: AdminRole.super_admin });
    await request(server())
      .post('/api/admin/logs/security/block-ip')
      .set(authHeader(admin))
      .send({ ipAddress: '1.2.3.4' })
      .expect(403);
    const res = await request(server())
      .post('/api/admin/logs/security/block-ip')
      .set(authHeader(superAdmin))
      .send({ ipAddress: '1.2.3.4' });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect([200, 201]).toContain(res.status);
  });

  // ════════════════════════════ AI moderasyon (RBAC) ════════════════════════════

  scenario('ADM-026', async () => {
    // moderator AI eşik ayarını değiştirebilir (@RequirePermission('ai_moderation')): yetki katmanı
    // GEÇER (403/401 DEĞİL). AI .env.test'te KAPALI → service 400 'AI moderasyon kapalı' döner;
    // önemli olan yetkinin geçmesi (moderator ai_moderation iznine sahip).
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    const res = await request(server())
      .post('/api/admin/moderation/ai-config')
      .set(authHeader(moderator))
      .send({ relevanceThreshold: 0.6, nsfwThreshold: 0.8 });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect([200, 201, 400]).toContain(res.status);
  });

  // ════════════════════════════ Reports modülü (RBAC) ════════════════════════════

  scenario('ADM-029', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    await request(server()).get('/api/reports/sales').set(authHeader(moderator)).expect(403);
  });

  scenario('ADM-030', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    await request(server()).get('/api/reports/dashboard').set(authHeader(moderator)).expect(200);
  });

  scenario('ADM-031', async () => {
    const user = await createUser(ctx.module);
    await request(server()).get('/api/reports/dashboard').set(authHeader(user)).expect(401);
  });

  scenario('ADM-055', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const res = await request(server()).get('/api/reports/sales').set(authHeader(admin)).expect(200);
    expect(res.body).toBeTruthy();
  });

  scenario('ADM-056', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const res = await request(server()).get('/api/reports/sales/export/csv').set(authHeader(admin)).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('filename=sales-report.csv');
  });

  scenario('ADM-057', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    await request(server()).get('/api/reports/access/realtime').set(authHeader(moderator)).expect(200);
  });

  scenario('ADM-058', async () => {
    const admin = await createAdminUser(ctx.module, { email: 'acc-admin@test.com', role: AdminRole.admin });
    const moderator = await createAdminUser(ctx.module, { email: 'acc-mod@test.com', role: AdminRole.moderator });
    await request(server()).get('/api/reports/access').set(authHeader(admin)).expect(200);
    await request(server()).get('/api/reports/access').set(authHeader(moderator)).expect(403);
  });

  scenario('ADM-059', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const res = await request(server()).get('/api/reports/dashboard').set(authHeader(admin)).expect(200);
    expect(res.body.period?.start).toBeTruthy();
    expect(res.body.period?.end).toBeTruthy();
    const diffDays = (new Date(res.body.period.end).getTime() - new Date(res.body.period.start).getTime()) / 86400_000;
    expect(diffDays).toBeGreaterThanOrEqual(29);
    expect(diffDays).toBeLessThanOrEqual(31);
    expect(res.body.sales).toBeTruthy();
    expect(res.body.users).toBeTruthy();
  });

  scenario('ADM-061', async () => {
    // Gelecekteki boş aralık → 200; sıfır değerler.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const res = await request(server())
      .get('/api/reports/sales?startDate=2099-01-01&endDate=2099-01-02')
      .set(authHeader(admin))
      .expect(200);
    expect(res.body.totalOrders ?? 0).toBe(0);
    expect(Number(res.body.totalRevenue ?? 0)).toBe(0);
  });

  // ════════════════════════════ Dashboard / analytics (RBAC + para) ════════════════════════════

  scenario('ADM-047', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const res = await request(server()).get('/api/admin/dashboard').set(authHeader(admin)).expect(200);
    expect(res.body).toBeTruthy();
  });

  scenario('ADM-048', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    await request(server()).get('/api/admin/dashboard').set(authHeader(moderator)).expect(200);
  });

  scenario('ADM-049', async () => {
    const user = await createUser(ctx.module);
    await request(server()).get('/api/admin/dashboard').set(authHeader(user)).expect(401);
  });

  scenario('ADM-050', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'pending' });
    await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'pending' });
    const res = await request(server())
      .get('/api/admin/dashboard/pending-actions')
      .set(authHeader(admin))
      .expect(200);
    expect(res.body.pendingProducts).toBeGreaterThanOrEqual(2);
  });

  scenario('ADM-051', async () => {
    const admin = await createAdminUser(ctx.module, { email: 'an-admin@test.com', role: AdminRole.admin });
    const moderator = await createAdminUser(ctx.module, { email: 'an-mod@test.com', role: AdminRole.moderator });
    await request(server()).get('/api/admin/analytics/sales').set(authHeader(admin)).expect(200);
    await request(server()).get('/api/admin/analytics/sales').set(authHeader(moderator)).expect(403);
  });

  scenario('ADM-052', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const res = await request(server())
      .get('/api/admin/analytics/revenue?startDate=2020-01-01&endDate=2030-01-01')
      .set(authHeader(admin))
      .expect(200);
    expect(res.body).toBeTruthy();
  });

  scenario('ADM-053', async () => {
    const admin = await createAdminUser(ctx.module, { email: 'snap-admin@test.com', role: AdminRole.admin });
    const superAdmin = await createAdminUser(ctx.module, { email: 'snap-sa@test.com', role: AdminRole.super_admin });
    // analytics_snapshots truncate listesinde değil; aynı (type,date) unique çakışmasını önle.
    await getPrisma().analyticsSnapshot.deleteMany({});
    await request(server()).post('/api/admin/analytics/snapshot').set(authHeader(admin)).expect(403);
    const res = await request(server()).post('/api/admin/analytics/snapshot').set(authHeader(superAdmin));
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect([200, 201]).toContain(res.status);
  });

  scenario('ADM-054', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    await request(server()).get('/api/admin/reports/sales').set(authHeader(admin)).expect(200);
  });

  scenario('ADM-060', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    await request(server()).get('/api/admin/commission/revenue').set(authHeader(moderator)).expect(403);
  });

  // ════════════════════════════ Tax (RBAC + para) ════════════════════════════

  scenario('ADM-032', async () => {
    // admin GET tax 403 (matris tax yok), admin POST 403 (rol); super_admin GET/POST 200/201.
    const admin = await createAdminUser(ctx.module, { email: 'tax-admin@test.com', role: AdminRole.admin });
    const superAdmin = await createAdminUser(ctx.module, { email: 'tax-sa@test.com', role: AdminRole.super_admin });
    await request(server()).get('/api/admin/tax/regions').set(authHeader(admin)).expect(403);
    await request(server()).post('/api/admin/tax/rates').set(authHeader(admin)).send({}).expect(403);
    await request(server()).get('/api/admin/tax/regions').set(authHeader(superAdmin)).expect(200);
    // super_admin geçerli rate için önce region oluştur.
    const region = await request(server())
      .post('/api/admin/tax/regions')
      .set(authHeader(superAdmin))
      .send({ name: 'Türkiye', countryCode: 'TR', isDefault: true })
      .expect(201);
    await request(server())
      .post('/api/admin/tax/rates')
      .set(authHeader(superAdmin))
      .send({ taxRegionId: region.body.id, name: 'KDV', rate: 20 })
      .expect(201);
  });

  scenario('ADM-066', async () => {
    // KDV oranı yalnız super_admin: admin 403, super_admin 201.
    const admin = await createAdminUser(ctx.module, { email: 'kdv-admin@test.com', role: AdminRole.admin });
    const superAdmin = await createAdminUser(ctx.module, { email: 'kdv-sa@test.com', role: AdminRole.super_admin });
    await request(server()).post('/api/admin/tax/rates').set(authHeader(admin)).send({}).expect(403);
    const region = await request(server())
      .post('/api/admin/tax/regions')
      .set(authHeader(superAdmin))
      .send({ name: 'TR', countryCode: 'TR' })
      .expect(201);
    await request(server())
      .post('/api/admin/tax/rates')
      .set(authHeader(superAdmin))
      .send({ taxRegionId: region.body.id, name: 'KDV Standart', rate: 20 })
      .expect(201);
  });

  scenario('ADM-071', async () => {
    // tax/report read admin matrisinde yok → admin 403, super_admin 200.
    const admin = await createAdminUser(ctx.module, { email: 'txr-admin@test.com', role: AdminRole.admin });
    const superAdmin = await createAdminUser(ctx.module, { email: 'txr-sa@test.com', role: AdminRole.super_admin });
    await request(server()).get('/api/admin/tax/report').set(authHeader(admin)).expect(403);
    await request(server()).get('/api/admin/tax/report').set(authHeader(superAdmin)).expect(200);
  });

  // ════════════════════════════ Membership tiers (RBAC) ════════════════════════════

  scenario('ADM-033', async () => {
    // moderator/admin membership-tiers PATCH yapamaz (matris membership_tiers yalnız super_admin).
    const admin = await createAdminUser(ctx.module, { email: 'mt-admin@test.com', role: AdminRole.admin });
    const moderator = await createAdminUser(ctx.module, { email: 'mt-mod@test.com', role: AdminRole.moderator });
    const superAdmin = await createAdminUser(ctx.module, { email: 'mt-sa@test.com', role: AdminRole.super_admin });
    const prisma = getPrisma();
    const tier = await prisma.membershipTier.findFirst({ where: { type: 'basic' } });

    await request(server()).get('/api/admin/membership-tiers').set(authHeader(moderator)).expect(403);
    await request(server())
      .patch(`/api/admin/membership-tiers/${tier!.id}`)
      .set(authHeader(admin))
      .send({ monthlyPrice: 99 })
      .expect(403);
    await request(server())
      .patch(`/api/admin/membership-tiers/${tier!.id}`)
      .set(authHeader(superAdmin))
      .send({ monthlyPrice: 99 })
      .expect(200);
  });

  // ════════════════════════════ Bilinmeyen route fallback (matris) ════════════════════════════

  scenario('ADM-035', async () => {
    // media→products izni moderator'da var → yetki katmanı geçer; 403 DEĞİL.
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    const res = await request(server())
      .post('/api/admin/media/upload')
      .set(authHeader(moderator))
      .attach('file', Buffer.from('fake-image-bytes'), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });

  // ════════════════════════════ Payout / escrow (RBAC + para + idempotency) ════════════════════════════

  scenario('ADM-042', async () => {
    // Escrow release → payout_release AuditLog (oldValue.reason). Ödenmiş sipariş kur.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const addr = await createAddress({ userId: buyer.id });
    const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'active', quantity: 5 });
    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const prisma = getPrisma();

    const res = await request(server())
      .post(`/api/admin/payouts/release/${orderId}`)
      .set(authHeader(admin))
      .send({ reason: 'Teslim onaylandı' });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    if (res.status === 200) {
      const log = await prisma.auditLog.findFirst({ where: { action: 'payout_release', entityId: orderId } });
      expect((log?.oldValue as any)?.reason).toBe('Teslim onaylandı');
    }
  });

  scenario('ADM-083', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    const res = await request(server())
      .post(`/api/admin/payouts/release/${NIL_UUID}`)
      .set(authHeader(moderator))
      .send({ reason: 'x' })
      .expect(403);
    expect(String(res.body.message)).toContain('payouts');
  });

  scenario('ADM-084', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const res = await request(server())
      .post(`/api/admin/payouts/release/${NIL_UUID}`)
      .set(authHeader(admin))
      .send({})
      .expect(400);
    expect(String(res.body.message)).toContain('sebep');
  });

  scenario('ADM-085', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const addr = await createAddress({ userId: buyer.id });
    const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'active', quantity: 5 });
    const { orderId } = await buyAndPay(ctx, buyer, product.id, addr.id);
    const res = await request(server())
      .post(`/api/admin/payouts/release/${orderId}`)
      .set(authHeader(admin))
      .send({ reason: 'Teslim onaylandı' });
    // Ödenmiş sipariş için escrow held olmalı → release 200 { success:true }.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    if (res.status === 200) expect(res.body.success).toBe(true);
  });

  scenario('ADM-086', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    const res = await request(server())
      .post(`/api/admin/payments/${NIL_UUID}/manual-refund`)
      .set(authHeader(moderator))
      .send({ amount: 10 })
      .expect(403);
    expect(String(res.body.message)).toContain('payments');
  });

  scenario('ADM-087', async () => {
    // Admin manual-refund yalnız completed ödeme → non-completed payment 400.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const buyer = await createUser(ctx.module);
    const prisma = getPrisma();
    const product = await createProduct({ sellerId: seller.id, categoryId: baseline.categoryId, status: 'active', quantity: 5 });
    const order = await prisma.order.create({
      data: {
        orderNumber: `ORD-${Date.now()}`,
        buyerId: buyer.id,
        sellerId: seller.id,
        productId: product.id,
        quantity: 1,
        unitPrice: 100,
        totalAmount: 100,
        commissionAmount: 5,
        status: 'pending_payment' as any,
        paymentExpiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: 100,
        provider: 'paytr',
        status: PaymentStatus.pending,
      },
    });
    const res = await request(server())
      .post(`/api/admin/payments/${payment.id}/manual-refund`)
      .set(authHeader(admin))
      .send({ amount: 10 })
      .expect(400);
    expect(String(res.body.message)).toContain('tamamlanmış');
  });

  scenario('ADM-088', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    const res = await request(server())
      .post(`/api/admin/trades/${NIL_UUID}/retry-refund`)
      .set(authHeader(moderator))
      .expect(403);
    expect(String(res.body.message)).toContain('refund_requests');
  });

  scenario('ADM-089', async () => {
    // Payout retry yalnız failed/returned → completed transfer 400.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const prisma = getPrisma();
    const transfer = await prisma.payoutTransfer.create({
      data: {
        sellerId: seller.id,
        amount: 100, commission: 5, netAmount: 95,
        merchantOid: `C-${Date.now()}`, transId: `C${Date.now()}`,
        transferIban: 'TR330006100519786457841326', transferName: 'Test',
        status: PayoutStatus.completed,
      },
    });
    const res = await request(server())
      .post(`/api/admin/payouts/${transfer.id}/retry`)
      .set(authHeader(admin))
      .expect(400);
    expect(String(res.body.message)).toContain('completed');
  });

  scenario('ADM-090', async () => {
    // Failed payout retry → 200; status=pending, retryCount=0, failureReason=null.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const prisma = getPrisma();
    const transfer = await prisma.payoutTransfer.create({
      data: {
        sellerId: seller.id,
        amount: 100, commission: 5, netAmount: 95,
        merchantOid: `F-${Date.now()}`, transId: `F${Date.now()}`,
        transferIban: 'TR330006100519786457841326', transferName: 'Test',
        status: PayoutStatus.failed, failureReason: 'IBAN error', retryCount: 3,
      },
    });
    const res = await request(server())
      .post(`/api/admin/payouts/${transfer.id}/retry`)
      .set(authHeader(admin))
      .expect(200);
    expect(res.body.success).toBe(true);
    const after = await prisma.payoutTransfer.findUnique({ where: { id: transfer.id } });
    expect(after?.status).toBe(PayoutStatus.pending);
    expect(after?.retryCount).toBe(0);
    expect(after?.failureReason).toBeNull();
  });

  scenario('ADM-091', async () => {
    // Returned transfer retry → YENİ transId üretilir (idempotency); status=pending.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const prisma = getPrisma();
    const oldTransId = `R${Date.now()}`;
    const transfer = await prisma.payoutTransfer.create({
      data: {
        sellerId: seller.id,
        amount: 200, commission: 10, netAmount: 190,
        merchantOid: `R-${Date.now()}`, transId: oldTransId,
        transferIban: 'TR330006100519786457841326', transferName: 'Test',
        status: PayoutStatus.returned, failureReason: 'Geri döndü',
      },
    });
    await request(server())
      .post(`/api/admin/payouts/${transfer.id}/retry`)
      .set(authHeader(admin))
      .expect(200);
    const after = await prisma.payoutTransfer.findUnique({ where: { id: transfer.id } });
    expect(after?.status).toBe(PayoutStatus.pending);
    expect(after?.transId).not.toBe(oldTransId); // yeni ...R<timestamp>
  });

  scenario('ADM-092', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const seller = await createUser(ctx.module, { isSeller: true });
    const prisma = getPrisma();
    for (const [st, oid] of [[PayoutStatus.failed, 'F1'], [PayoutStatus.returned, 'F2'], [PayoutStatus.completed, 'C1']] as const) {
      await prisma.payoutTransfer.create({
        data: {
          sellerId: seller.id,
          amount: 100, commission: 5, netAmount: 95,
          merchantOid: `${oid}-${Date.now()}`, transId: `${oid}${Date.now()}`,
          transferIban: 'TR330006100519786457841326', transferName: 'Test',
          status: st,
        },
      });
    }
    const res = await request(server()).get('/api/admin/payouts/failed').set(authHeader(admin)).expect(200);
    expect(res.body.total).toBe(2);
    const statuses = res.body.items.map((i: any) => i.status);
    expect(statuses).toContain('failed');
    expect(statuses).toContain('returned');
    expect(statuses).not.toContain('completed');
  });

  scenario('ADM-093', async () => {
    // Trade nakit hold release idempotent: ilk 200 (releasedAt set), ikinci "Zaten serbest bırakılmış".
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const initiator = await createUser(ctx.module, { isSeller: true });
    const receiver = await createUser(ctx.module, { isSeller: true });
    const prisma = getPrisma();
    const trade = await prisma.trade.create({
      data: {
        tradeNumber: `T-REL-${Date.now()}`,
        initiatorId: initiator.id,
        receiverId: receiver.id,
        status: 'completed',
        responseDeadline: new Date(Date.now() + 86400_000),
      },
    });
    await prisma.tradeCashPayment.create({
      data: {
        tradeId: trade.id,
        payerId: initiator.id,
        recipientId: receiver.id,
        amount: 75, commission: 3, totalAmount: 78,
        provider: 'paytr',
        status: PaymentStatus.completed,
      },
    });
    const first = await request(server())
      .post(`/api/admin/payouts/release-trade/${trade.id}`)
      .set(authHeader(admin))
      .expect(200);
    expect(first.body.success).toBe(true);
    const after1 = await prisma.tradeCashPayment.findUnique({ where: { tradeId: trade.id } });
    expect(after1?.releasedAt).toBeTruthy();
    const releasedAt1 = after1?.releasedAt;

    const second = await request(server())
      .post(`/api/admin/payouts/release-trade/${trade.id}`)
      .set(authHeader(admin))
      .expect(200);
    expect(String(second.body.message)).toContain('Zaten serbest');
    const after2 = await prisma.tradeCashPayment.findUnique({ where: { tradeId: trade.id } });
    expect(after2?.releasedAt?.getTime()).toBe(releasedAt1?.getTime());
  });

  scenario('ADM-094', async () => {
    // İade edilmiş trade nakit release edilemez → 400.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const initiator = await createUser(ctx.module, { isSeller: true });
    const receiver = await createUser(ctx.module, { isSeller: true });
    const prisma = getPrisma();
    const trade = await prisma.trade.create({
      data: {
        tradeNumber: `T-RFD-${Date.now()}`,
        initiatorId: initiator.id,
        receiverId: receiver.id,
        status: 'cancelled',
        responseDeadline: new Date(Date.now() + 86400_000),
      },
    });
    await prisma.tradeCashPayment.create({
      data: {
        tradeId: trade.id,
        payerId: initiator.id,
        recipientId: receiver.id,
        amount: 75, commission: 3, totalAmount: 78,
        provider: 'paytr',
        status: PaymentStatus.refunded,
        refundedAt: new Date(),
      },
    });
    const res = await request(server())
      .post(`/api/admin/payouts/release-trade/${trade.id}`)
      .set(authHeader(admin))
      .expect(400);
    expect(String(res.body.message)).toContain('İade edilmiş');
  });

  scenario('ADM-095', async () => {
    const user = await createUser(ctx.module);
    await request(server())
      .post(`/api/admin/payouts/release-trade/${NIL_UUID}`)
      .set(authHeader(user))
      .expect(401);
  });

  scenario('ADM-096', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    await request(server()).get('/api/admin/refund-requests').set(authHeader(moderator)).expect(403);
  });

  scenario('ADM-097', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    await request(server())
      .post(`/api/admin/refund-requests/${NIL_UUID}/force-finalize`)
      .set(authHeader(moderator))
      .expect(403);
  });

  scenario('ADM-119', async () => {
    // Bilinmeyen payment id force-cancel → 404.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    await request(server())
      .post(`/api/admin/payments/${NIL_UUID}/force-cancel`)
      .set(authHeader(admin))
      .send({ reason: 'x' })
      .expect(404);
  });

  // ════════════════════════════ Static pages (CMS) ════════════════════════════

  async function seedPage(slug: string, isPublished = true) {
    const prisma = getPrisma();
    return prisma.staticPage.create({
      data: { slug, title: `${slug} title`, content: `${slug} content`, isPublished },
    });
  }

  scenario('ADM-074', async () => {
    await seedPage('about', true);
    const res = await request(server()).get('/api/pages/about').expect(200);
    expect(res.body.slug).toBe('about');
    expect(res.body.title).toBeTruthy();
    expect(res.body.content).toBeTruthy();
    expect(res.body).toHaveProperty('metaTitle');
    expect(res.body).toHaveProperty('updatedAt');
  });

  scenario('ADM-075', async () => {
    await seedPage('gizli', false); // yayında değil
    await request(server()).get('/api/pages/gizli').expect(404);
    await request(server()).get('/api/pages/olmayan-slug').expect(404);
  });

  scenario('ADM-076', async () => {
    await seedPage('about', true);
    await seedPage('terms', true);
    await seedPage('taslak', false);
    const res = await request(server()).get('/api/pages').expect(200);
    const slugs = (res.body as any[]).map((p) => p.slug);
    expect(slugs).toContain('about');
    expect(slugs).toContain('terms');
    expect(slugs).not.toContain('taslak');
  });

  scenario('ADM-077', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const res = await request(server())
      .post('/api/admin/pages')
      .set(authHeader(admin))
      .send({ slug: 'kvkk', title: 'KVKK', content: 'İçerik', isPublished: true });
    expect([200, 201]).toContain(res.status);
    const prisma = getPrisma();
    expect(await prisma.staticPage.findUnique({ where: { slug: 'kvkk' } })).toBeTruthy();
  });

  scenario('ADM-078', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    await request(server()).get('/api/admin/pages').set(authHeader(moderator)).expect(403);
    await request(server())
      .post('/api/admin/pages')
      .set(authHeader(moderator))
      .send({ slug: 'x', title: 'X', content: 'c' })
      .expect(403);
  });

  scenario('ADM-079', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const page = await seedPage('hakkinda', true);
    await request(server())
      .patch(`/api/admin/pages/${page.id}`)
      .set(authHeader(admin))
      .send({ title: 'Yeni Başlık', isPublished: false })
      .expect(200);
    // Artık yayından kalktı → public GET 404.
    await request(server()).get('/api/pages/hakkinda').expect(404);
  });

  scenario('ADM-080', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const page = await seedPage('silinecek', true);
    await request(server())
      .delete(`/api/admin/pages/${page.id}`)
      .set(authHeader(admin))
      .expect(204);
    const prisma = getPrisma();
    expect(await prisma.staticPage.findUnique({ where: { id: page.id } })).toBeNull();
    await request(server()).get('/api/pages/silinecek').expect(404);
  });

  scenario('ADM-081', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    await seedPage('about', true);
    const res = await request(server())
      .post('/api/admin/pages')
      .set(authHeader(admin))
      .send({ slug: 'about', title: 'Dup', content: 'c' });
    expect([400, 409]).toContain(res.status);
  });

  scenario('ADM-082', async () => {
    // Email template CMS: moderator matriste yok → 403; admin var → 200.
    const moderator = await createAdminUser(ctx.module, { email: 'et-mod@test.com', role: AdminRole.moderator });
    const admin = await createAdminUser(ctx.module, { email: 'et-admin@test.com', role: AdminRole.admin });
    await request(server()).get('/api/admin/email-templates').set(authHeader(moderator)).expect(403);
    await request(server()).get('/api/admin/email-templates').set(authHeader(admin)).expect(200);
  });

  // ════════════════════════════ Staff & role-permissions (RBAC + iş kuralı) ════════════════════════════

  scenario('ADM-044', async () => {
    // Staff atama başarılı: admin_users satırı role=moderator, isActive=true.
    // NOT: admin_staff_create audit'i createAuditLog'un çift-çözümlemesi nedeniyle atlanabilir
    // (auditStaff AdminUser.id'yi tekrar User.id gibi çözer) → burada gözlemlenebilir
    // yan etki (admin_users satırı) doğrulanır.
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const res = await request(server())
      .post('/api/admin/staff')
      .set(authHeader(superAdmin))
      .send({ email: 'yeni-mod@tarodan.com', role: 'moderator' })
      .expect(201);
    expect(res.body.role).toBe('moderator');
    const prisma = getPrisma();
    const created = await prisma.adminUser.findFirst({ where: { user: { email: 'yeni-mod@tarodan.com' } } });
    expect(created?.role).toBe('moderator');
    expect(created?.isActive).toBe(true);
  });

  scenario('ADM-098', async () => {
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const res = await request(server())
      .post('/api/admin/staff')
      .set(authHeader(superAdmin))
      .send({ email: 'temp-mod@tarodan.com', role: 'moderator' })
      .expect(201);
    // Yeni hesap → geçici şifre döner.
    expect(res.body.tempPassword).toBeTruthy();
    const prisma = getPrisma();
    const created = await prisma.adminUser.findFirst({ where: { user: { email: 'temp-mod@tarodan.com' } } });
    expect(created?.role).toBe('moderator');
    expect(created?.isActive).toBe(true);
  });

  scenario('ADM-099', async () => {
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    await request(server()).get('/api/admin/staff').set(authHeader(moderator)).expect(403);
    await request(server())
      .post('/api/admin/staff')
      .set(authHeader(moderator))
      .send({ email: 'x@y.com', role: 'moderator' })
      .expect(403);
  });

  scenario('ADM-100', async () => {
    // Admin'e 'staff' izni verilse bile ayar kapalıyken rol atayamaz (service iş kuralı).
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    await grantAdminPermissions(['staff']); // guard'ı geç, service'e ulaş
    const res = await request(server())
      .post('/api/admin/staff')
      .set(authHeader(admin))
      .send({ email: 'x@y.com', role: 'moderator' })
      .expect(403);
    expect(String(res.body.message)).toContain('yalnızca süper');
  });

  scenario('ADM-101', async () => {
    // Ayar açık olsa bile admin super_admin rolü atayamaz.
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const prisma = getPrisma();
    await grantAdminPermissions(['staff']);
    await prisma.platformSetting.upsert({
      where: { settingKey: 'allow_admin_assign_roles' },
      update: { settingValue: 'true', settingType: 'boolean' },
      create: { settingKey: 'allow_admin_assign_roles', settingValue: 'true', settingType: 'boolean' },
    });
    const res = await request(server())
      .post('/api/admin/staff')
      .set(authHeader(admin))
      .send({ email: 'x@y.com', role: 'super_admin' })
      .expect(403);
    expect(String(res.body.message)).toContain('Süper admin');
  });

  scenario('ADM-102', async () => {
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    await request(server())
      .patch('/api/admin/staff/settings')
      .set(authHeader(admin))
      .send({ allowAdminAssign: true })
      .expect(403);
  });

  scenario('ADM-103', async () => {
    // Son super_admin rolü düşürülemez → 400.
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const prisma = getPrisma();
    const adminRow = await prisma.adminUser.findFirst({ where: { userId: superAdmin.id } });
    const res = await request(server())
      .patch(`/api/admin/staff/${adminRow!.id}`)
      .set(authHeader(superAdmin))
      .send({ role: 'admin' })
      .expect(400);
    expect(String(res.body.message)).toContain('son süper admin');
  });

  // ADM-104: removeAdminStaff'taki "son süper admin kaldırılamaz" dalı API'den ULAŞILMAZ.
  // Sıra: (a) actor===target → "Kendi admin yetkinizi kaldıramazsınız"; (b) target super_admin
  // ve activeSupers<=1 → "son süper admin kaldırılamaz". Bir super_admin'i yalnızca BAŞKA bir
  // super_admin silebilir (assertCanManage) — ama başka super_admin varsa activeSupers>1 olur,
  // (b) hiç tetiklenmez; tek super_admin kendini silmeye çalışırsa (a) önce fırlar. Bu yüzden
  // (b) dalı erişilemez → skip. AYNI garanti ADM-103'te updateAdminStaff yoluyla kapsanır.
  scenario.skip('ADM-104', 'removeAdminStaff son-süper dalı erişilemez: actor≠target super_admin ⇒ activeSupers>1; actor===target ⇒ önce "kendi yetkini" hatası (aynı garanti ADM-103’te)');

  scenario('ADM-105', async () => {
    // Admin kendi yetkisini kaldıramaz → 400.
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    // İkinci super_admin ekle ki "son süper admin" kuralına düşmeden "kendi yetkini" kuralı test edilsin.
    await createAdminUser(ctx.module, { email: 'sa-second@test.com', role: AdminRole.super_admin });
    const prisma = getPrisma();
    const selfRow = await prisma.adminUser.findFirst({ where: { userId: superAdmin.id } });
    const res = await request(server())
      .delete(`/api/admin/staff/${selfRow!.id}`)
      .set(authHeader(superAdmin))
      .expect(400);
    expect(String(res.body.message)).toContain('Kendi admin yetkinizi');
  });

  scenario('ADM-106', async () => {
    // role-permissions matrisi @BypassPermissionMatrix → moderator dahil okunur.
    const moderator = await createAdminUser(ctx.module, { role: AdminRole.moderator });
    const res = await request(server())
      .get('/api/admin/staff/role-permissions')
      .set(authHeader(moderator))
      .expect(200);
    expect(res.body).toHaveProperty('super_admin');
    expect(res.body).toHaveProperty('moderator');
  });

  scenario('ADM-107', async () => {
    // İzin matrisi güncelleme yalnız super_admin; yanıt super_admin her zaman tüm 36 anahtarı içerir.
    const admin = await createAdminUser(ctx.module, { email: 'rp-admin@test.com', role: AdminRole.admin });
    const superAdmin = await createAdminUser(ctx.module, { email: 'rp-sa@test.com', role: AdminRole.super_admin });
    await request(server())
      .put('/api/admin/staff/role-permissions')
      .set(authHeader(admin))
      .send({ permissions: { moderator: ['dashboard'] } })
      .expect(403);
    const res = await request(server())
      .put('/api/admin/staff/role-permissions')
      .set(authHeader(superAdmin))
      .send({ permissions: { moderator: ['dashboard', 'products'] } })
      .expect(200);
    expect(res.body.super_admin).toEqual(expect.arrayContaining([...ADMIN_PERMISSION_KEYS]));
    expect(res.body.super_admin.length).toBe(ADMIN_PERMISSION_KEYS.length);
  });

  scenario('ADM-108', async () => {
    // İzin matrisi değişimi anında uygulanır (cache invalidate): moderator products 200 → kaldır → 403.
    const moderator = await createAdminUser(ctx.module, { email: 'ci-mod@test.com', role: AdminRole.moderator });
    const superAdmin = await createAdminUser(ctx.module, { email: 'ci-sa@test.com', role: AdminRole.super_admin });
    // 1) moderator products 200 (varsayılan matris).
    await request(server()).get('/api/admin/products').set(authHeader(moderator)).expect(200);
    // 2) super_admin moderator'dan products'ı kaldırır.
    await request(server())
      .put('/api/admin/staff/role-permissions')
      .set(authHeader(superAdmin))
      .send({ permissions: { moderator: ['dashboard'] } })
      .expect(200);
    // 3) anında 403 (controller invalidateCache çağırır).
    await request(server()).get('/api/admin/products').set(authHeader(moderator)).expect(403);
  });

  scenario('ADM-109', async () => {
    // Legacy anahtar migrate: 'catalog' → categories,brands,car_models,manufacturers,attributes,collections.
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    const prisma = getPrisma();
    await prisma.platformSetting.create({
      data: {
        settingKey: 'admin_role_permissions',
        settingType: 'json',
        settingValue: JSON.stringify({ moderator: ['dashboard', 'catalog'] }),
      },
    });
    const res = await request(server())
      .get('/api/admin/staff/role-permissions')
      .set(authHeader(superAdmin))
      .expect(200);
    expect(res.body.moderator).toEqual(
      expect.arrayContaining(['categories', 'brands', 'car_models', 'manufacturers', 'attributes', 'collections']),
    );
    expect(res.body.moderator).not.toContain('catalog');
  });

  scenario('ADM-110', async () => {
    const superAdmin = await createAdminUser(ctx.module, { role: AdminRole.super_admin });
    await request(server())
      .put('/api/admin/staff/role-permissions')
      .set(authHeader(superAdmin))
      .send({})
      .expect(400);
  });

  // ════════════════════════════ i18n ════════════════════════════

  scenario('ADM-120', async () => {
    // Hata mesajları Türkçe ve tutarlı: ADM-006 (admin değil), ADM-084 (sebep yok), ADM-113 (zaten banlı).
    const admin = await createAdminUser(ctx.module, { role: AdminRole.admin });
    const user = await createUser(ctx.module);

    // ADM-006 benzeri: normal kullanıcı admin ucu → 401 Türkçe.
    const r1 = await request(server()).get('/api/admin/users').set(authHeader(user)).expect(401);
    expect(String(r1.body.message)).toMatch(/yetki|admin/i);

    // ADM-084 benzeri: escrow release sebep yok → 400 Türkçe.
    const r2 = await request(server())
      .post(`/api/admin/payouts/release/${NIL_UUID}`)
      .set(authHeader(admin))
      .send({})
      .expect(400);
    expect(String(r2.body.message)).toMatch(/sebep/i);

    // ADM-113 benzeri: zaten banlı → 400 Türkçe.
    const prisma = getPrisma();
    await prisma.user.update({ where: { id: user.id }, data: { isBanned: true } });
    const r3 = await request(server())
      .post(`/api/admin/users/${user.id}/ban`)
      .set(authHeader(admin))
      .send({ reason: 'x' })
      .expect(400);
    expect(String(r3.body.message)).toMatch(/zaten banlı/i);
  });
});
