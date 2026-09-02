/**
 * 01 — Kimlik Doğrulama & Hesap Güvenliği (AUTH) — Test Konsolu senaryoları.
 *
 * Bu dosya FAN-OUT ŞABLONUDUR: diğer domain spec'leri (02-usr … 24-jrn) bu yapıyı
 * birebir izler. Her test `scenario('<ID>', fn)` ile manifest'e bağlanır (izlenebilirlik
 * + P0-smoke filtrelemesi). Boilerplate ve assertion stilleri mevcut yeşil
 * auth.e2e-spec.ts / 2fa.e2e-spec.ts dosyalarından alınmıştır.
 *
 * Persona'lar yerine factory eşdeğerleri kullanılır (createUser/createAdminUser);
 * davranış demo seed ile aynıdır.
 *
 * GERÇEK KODA GÖRE DENETLENDİ (adversarial statik doğrulama):
 *   - POST /api/auth/refresh  → @HttpCode(200) ve gövde DÜZ TokensDto döner
 *     ({ accessToken, refreshToken }); login/register gibi { tokens:{…} } DEĞİL.
 *   - POST /api/auth/reset-password, verify-email, forgot-password, resend →
 *     @HttpCode(200). Register/login-body 201 vs 200 controller'a göre ayarlandı.
 *   - DELETE /api/security/tokens → @HttpCode(204).
 *   - Şifre değiştir/2FA uçları @Post default 201; yanlış TOTP → 401, 2FA kapalı → 400.
 *   - refresh_tokens.tokenHash (sha256 hex) alan adı schema.prisma ile birebir.
 *   - Rate-limit (429) senaryoları: ThrottlerModule test'te skipIf(NODE_ENV==='test')
 *     ile TAMAMEN kapalı → 429 asla üretilemez → skip (harness kısıtı).
 *   - Google login uçları GoogleAuthService gerçek Google'a gider; paylaşılan test
 *     app'te override edilemediğinden pozitif akışlar skip; yalnız malformed token → 401.
 */
import * as request from "supertest";
import * as crypto from "crypto";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { AdminRole } from "@prisma/client";
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
import { scenario } from "../../test-utils/scenario";
import { generateTOTPCode } from "../../test-utils/totp";
import {
  getLastEmailTo,
  extractLink,
  clearMailbox,
} from "../../test-utils/mail";

describe("01 — Kimlik Doğrulama & Hesap Güvenliği (AUTH)", () => {
  let ctx: E2ETestApp;
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
    await seedBaseline();
  });

  // Geçerli kayıt gövdesi üretici (yaş > 18).
  const validRegister = (over: Partial<Record<string, unknown>> = {}) => ({
    email: "newuser@test.com",
    password: "SecurePass123!",
    displayName: "New User",
    birthDate: "1995-06-15",
    ...over,
  });
  // Geçerli şirket kaydı gövdesi (BusinessRegisterDto zorunlu alanları).
  const validBusiness = (over: Partial<Record<string, unknown>> = {}) => ({
    companyName: "Test Şirket A.Ş.",
    email: "business@test.com",
    phone: "+905551112233",
    password: "SecurePass123!",
    taxId: "1234567890",
    city: "İstanbul",
    ...over,
  });
  const register = (body: Record<string, unknown>) =>
    request(server()).post("/api/auth/register").send(body);
  const registerBusiness = (body: Record<string, unknown>) =>
    request(server()).post("/api/auth/register/business").send(body);
  const login = (email: string, password: string) =>
    request(server()).post("/api/auth/login").send({ email, password });

  // ──────────────────────────── POST /api/auth/register ────────────────────────────
  describe("POST /api/auth/register", () => {
    scenario("AUTH-001", async () => {
      const res = await register(validRegister()).expect(201);
      expect(res.body.tokens?.accessToken).toBeTruthy();
      expect(res.body.tokens?.refreshToken).toBeTruthy();
      expect(res.body.user?.email).toBe("newuser@test.com");

      // DB yan etkisi: doğrulama tokeni oluşur, kullanıcı doğrulanmamış.
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({
        where: { email: "newuser@test.com" },
      });
      expect(user?.isEmailVerified).toBe(false);
      const tokenCount = await prisma.emailVerificationToken.count({
        where: { userId: user!.id },
      });
      expect(tokenCount).toBeGreaterThanOrEqual(1);
    });

    scenario("AUTH-002", async () => {
      await createUser(ctx.module, { email: "taken@test.com" });
      await register(validRegister({ email: "taken@test.com" })).expect(409);
    });

    scenario("AUTH-003", async () => {
      // Yinelenen telefon → 409. Telefon sahibi seed edilir (login test edilmediğinden hash gerekmez).
      const prisma = getPrisma();
      await prisma.user.create({
        data: {
          email: "phone-owner@test.com",
          passwordHash: "seeded-hash-not-used",
          displayName: "Phone Owner",
          phone: "+905559998877",
          isEmailVerified: true,
          isVerified: true,
          birthDate: new Date("1990-01-01"),
        },
      });
      await register(
        validRegister({ email: "newphone@test.com", phone: "+905559998877" }),
      ).expect(409);
    });

    scenario("AUTH-004", async () => {
      // 'weakpassword1' → büyük harf yok; @Matches(?=.*[A-Z]) 400 verir.
      await register(
        validRegister({ email: "weak@test.com", password: "weakpassword1" }),
      ).expect(400);
    });

    scenario("AUTH-005", async () => {
      // 'Ab1!' 4 karakter → MinLength(8) 400.
      await register(
        validRegister({ email: "short@test.com", password: "Ab1!" }),
      ).expect(400);
    });

    scenario("AUTH-006", async () => {
      // Sınır değer: 7 karakter reddedilir (MinLength(8)); 8 karakter kabul.
      await register(
        validRegister({ email: "len7@test.com", password: "Ab1cdef" }),
      ).expect(400); // 7
      await register(
        validRegister({ email: "len8@test.com", password: "Abc1defg" }),
      ).expect(201); // 8
      // 50 kabul, 51 red (MaxLength(50)). Hepsinde upper+lower+digit var.
      const p50 = "Ab1" + "c".repeat(47); // 50
      const p51 = "Ab1" + "c".repeat(48); // 51
      await register(
        validRegister({ email: "len50@test.com", password: p50 }),
      ).expect(201);
      await register(
        validRegister({ email: "len51@test.com", password: p51 }),
      ).expect(400);
    });

    scenario("AUTH-007", async () => {
      const today = new Date();
      const underage = new Date(
        today.getFullYear() - 15,
        today.getMonth(),
        today.getDate(),
      );
      await register(
        validRegister({
          email: "young@test.com",
          birthDate: underage.toISOString().split("T")[0],
        }),
      ).expect(400);
    });

    scenario("AUTH-008", async () => {
      const today = new Date();
      // Tam 18 (bugün 18. doğum günü) → kabul (201).
      const exactly18 = new Date(
        today.getFullYear() - 18,
        today.getMonth(),
        today.getDate(),
      );
      await register(
        validRegister({
          email: "age18@test.com",
          birthDate: exactly18.toISOString().split("T")[0],
        }),
      ).expect(201);
      // 18'e bir gün kala → red (400).
      const almost18 = new Date(
        today.getFullYear() - 18,
        today.getMonth(),
        today.getDate() + 1,
      );
      await register(
        validRegister({
          email: "almost18@test.com",
          birthDate: almost18.toISOString().split("T")[0],
        }),
      ).expect(400);
    });

    scenario("AUTH-009", async () => {
      const body = validRegister({ email: "nodob@test.com" });
      delete (body as Record<string, unknown>).birthDate;
      await register(body).expect(400);
    });

    scenario("AUTH-010", async () => {
      await register(validRegister({ email: "not-an-email" })).expect(400);
    });

    scenario("AUTH-011", async () => {
      await register({ email: "missing@test.com" }).expect(400);
    });

    scenario("AUTH-012", async () => {
      const res = await register(
        validRegister({ email: "seller@test.com", isSeller: true }),
      ).expect(201);
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({
        where: { email: "seller@test.com" },
      });
      expect(user?.isSeller).toBe(true);
      expect(user?.sellerType).toBe("individual");
      expect(res.body.user).toBeTruthy();
    });

    scenario("AUTH-013", async () => {
      // DTO dışı alan (whitelist) sessizce atılır; kayıt yine başarılı.
      const res = await register(
        validRegister({
          email: "extra@test.com",
          isAdmin: true,
          role: "super_admin",
        }),
      ).expect(201);
      expect(res.body.user?.email).toBe("extra@test.com");
      const prisma = getPrisma();
      const admin = await prisma.adminUser.findFirst({
        where: { user: { email: "extra@test.com" } },
      });
      expect(admin).toBeNull();
    });
  });

  // ──────────────────────────── POST /api/auth/register/business ────────────────────────────
  describe("POST /api/auth/register/business", () => {
    scenario("AUTH-014", async () => {
      const res = await registerBusiness(validBusiness()).expect(201);
      expect(res.body.tokens?.accessToken).toBeTruthy();
      expect(res.body.user?.email).toBe("business@test.com");
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({
        where: { email: "business@test.com" },
      });
      expect(user?.companyName).toBe("Test Şirket A.Ş.");
      expect(user?.taxId).toBe("1234567890");
      expect(user?.businessStatus).toBe("pending");
    });

    scenario("AUTH-015", async () => {
      await registerBusiness(validBusiness()).expect(201);
      // Aynı şirket adı (companyName @unique + service kontrolü) → 409. E-posta/telefon/vergi farklı.
      await registerBusiness(
        validBusiness({
          email: "b2@test.com",
          phone: "+905550000001",
          taxId: "9999999999",
        }),
      ).expect(409);
    });

    scenario("AUTH-016", async () => {
      await registerBusiness(validBusiness()).expect(201);
      // Aynı vergi no → 409 (şirket adı/e-posta/telefon farklı).
      await registerBusiness(
        validBusiness({
          companyName: "Farklı Şirket",
          email: "b3@test.com",
          phone: "+905550000002",
        }),
      ).expect(409);
    });

    scenario("AUTH-017", async () => {
      // Geçersiz telefon formatı → @Matches(/^\+90[0-9]{10}$/) 400.
      await registerBusiness(validBusiness({ phone: "05551234567" })).expect(
        400,
      );
    });

    scenario("AUTH-018", async () => {
      // taxId @Matches(/^[0-9]{10,11}$/): 9 hane red, 10 kabul, 11 kabul, 12 red.
      await registerBusiness(
        validBusiness({
          email: "t9@test.com",
          phone: "+905550000010",
          companyName: "T9",
          taxId: "123456789",
        }),
      ).expect(400);
      await registerBusiness(
        validBusiness({
          email: "t10@test.com",
          phone: "+905550000011",
          companyName: "T10",
          taxId: "1234567890",
        }),
      ).expect(201);
      await registerBusiness(
        validBusiness({
          email: "t11@test.com",
          phone: "+905550000012",
          companyName: "T11",
          taxId: "12345678901",
        }),
      ).expect(201);
      await registerBusiness(
        validBusiness({
          email: "t12@test.com",
          phone: "+905550000013",
          companyName: "T12",
          taxId: "123456789012",
        }),
      ).expect(400);
    });
  });

  // ──────────────────────────── POST /api/auth/login ────────────────────────────
  describe("POST /api/auth/login", () => {
    scenario("AUTH-019", async () => {
      const user = await createUser(ctx.module, {
        email: "login@test.com",
        password: "Demo123!",
      });
      const res = await login("login@test.com", "Demo123!").expect(200);
      expect(res.body.tokens?.accessToken).toBeTruthy();
      expect(res.body.tokens?.refreshToken).toBeTruthy();
      expect(res.body.user?.id).toBe(user.id);
      const setCookie =
        (res.headers["set-cookie"] as unknown as string[]) ?? [];
      expect(setCookie.join(";")).toContain("access_token=");
      expect(setCookie.join(";")).toContain("refresh_token=");
    });

    scenario("AUTH-020", async () => {
      await createUser(ctx.module, {
        email: "wrongpass@test.com",
        password: "CorrectPass123!",
      });
      await login("wrongpass@test.com", "WrongPass123!").expect(401);
    });

    scenario("AUTH-021", async () => {
      await login("noone@test.com", "SomePass123!").expect(401);
    });

    scenario("AUTH-022", async () => {
      await createUser(ctx.module, {
        email: "unverified@test.com",
        password: "Demo123!",
        isEmailVerified: false,
      });
      const res = await login("unverified@test.com", "Demo123!").expect(401);
      expect(res.body.errorCode).toBe("EMAIL_NOT_VERIFIED");
      expect(res.body.i18nKey).toBe("server.auth.emailNotVerifiedLogin");
    });

    scenario("AUTH-023", async () => {
      // OAuth-only hesap: passwordHash null → login 401 (bcrypt.compare guard).
      const prisma = getPrisma();
      await prisma.user.create({
        data: {
          email: "oauth-only@test.com",
          passwordHash: null,
          displayName: "OAuth Only",
          isEmailVerified: true,
          isVerified: true,
          birthDate: new Date("1990-01-01"),
        },
      });
      await login("oauth-only@test.com", "AnyPass123!").expect(401);
    });

    scenario("AUTH-024", async () => {
      await createUser(ctx.module, {
        email: "emptypass@test.com",
        password: "Demo123!",
      });
      await login("emptypass@test.com", "").expect(400);
    });

    scenario("AUTH-025", async () => {
      await login("not-an-email", "Demo123!").expect(400);
    });

    scenario("AUTH-107", async () => {
      // SQL/NoSQL injection denemesi → e-posta formatı geçersiz (400) veya kimlik hatası (401), 500 değil.
      await createUser(ctx.module, {
        email: "inj@test.com",
        password: "Demo123!",
      });
      const res = await login("inj@test.com' OR '1'='1", "Demo123!");
      expect([400, 401]).toContain(res.status);
    });

    scenario("AUTH-108", async () => {
      // Çok uzun alan değerleri → 500 patlaması yok; validation/işlem güvenli sonuç döner.
      const longEmail = "a".repeat(2000) + "@test.com";
      const res1 = await login(longEmail, "Demo123!");
      expect([400, 401]).toContain(res1.status);
      const res2 = await register(
        validRegister({
          email: "long@test.com",
          displayName: "x".repeat(5000),
        }),
      );
      expect([400, 201]).toContain(res2.status);
      expect(res2.status).not.toBe(500);
    });

    scenario("AUTH-113", async () => {
      // Başarısız login SecurityLog'a yazılır (eventType=failed_login).
      const prisma = getPrisma();
      await login("nobody-log@test.com", "Demo123!").expect(401);
      const logs = await prisma.securityLog.findMany({
        where: { eventType: "failed_login", email: "nobody-log@test.com" },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
    });

    scenario("AUTH-115", async () => {
      // JWT payload manipülasyonu reddedilir.
      const user = await createUser(ctx.module, {
        email: "jwt@test.com",
        password: "Demo123!",
      });
      const parts = user.accessToken.split(".");
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64").toString("utf8"),
      );
      payload.sub = "00000000-0000-0000-0000-000000000000";
      const tampered = `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${parts[2]}`;
      await request(server())
        .get("/api/auth/profile")
        .set("Authorization", `Bearer ${tampered}`)
        .expect(401);
    });
  });

  // ──────────────────────────── Google login ────────────────────────────
  describe("Google login", () => {
    scenario("AUTH-034", async () => {
      // Geçersiz/bozuk id_token → GoogleAuthService.verifyIdToken 401 fırlatır.
      const res = await request(server())
        .post("/api/auth/google")
        .send({ idToken: "gecersiz.bozuk.token" });
      expect(res.status).toBe(401);
    });

    // Google POZİTİF akışları (yeni kullanıcı / oto-bağlama / idempotency) ve
    // email_verified=false reddi GERÇEK GoogleAuthService.verifyIdToken çağrısı
    // gerektirir; paylaşılan createE2ETestApp() yalnız PayTR+Storage override eder,
    // GoogleAuthService'i mock'layamıyoruz → API'den güvenilir assert edilemez.
    scenario.skip(
      "AUTH-031",
      "GoogleAuthService test app’te mock edilemiyor (gerçek Google doğrulaması gerekir)",
    );
    scenario.skip(
      "AUTH-032",
      "GoogleAuthService test app’te mock edilemiyor (oto-bağlama gerçek token ister)",
    );
    scenario.skip(
      "AUTH-033",
      "GoogleAuthService test app’te mock edilemiyor (idempotent OAuthAccount gerçek token ister)",
    );
    scenario.skip(
      "AUTH-035",
      "email_verified=false reddi gerçek Google payload’ı ister; mock yok",
    );
  });

  // ──────────────────────────── GET /api/auth/profile ────────────────────────────
  describe("GET /api/auth/profile", () => {
    scenario("AUTH-026", async () => {
      const user = await createUser(ctx.module, {
        displayName: "Profile User",
      });
      const res = await request(server())
        .get("/api/auth/profile")
        .set(authHeader(user))
        .expect(200);
      expect(res.body.id).toBe(user.id);
      expect(res.body.displayName).toBe("Profile User");
    });

    scenario("AUTH-027", async () => {
      await request(server()).get("/api/auth/profile").expect(401);
    });

    scenario("AUTH-028", async () => {
      await request(server())
        .get("/api/auth/profile")
        .set("Authorization", "Bearer invalid-token-here")
        .expect(401);
    });
  });

  // ──────────────────────────── Admin auth ────────────────────────────
  describe("Admin login/profile", () => {
    scenario("AUTH-029", async () => {
      const admin = await createAdminUser(ctx.module, {
        email: "admin@test.com",
      });
      const res = await request(server())
        .get("/api/auth/admin/profile")
        .set(authHeader(admin))
        .expect(200);
      expect(res.body).toBeTruthy();
    });

    scenario("AUTH-030", async () => {
      const user = await createUser(ctx.module);
      await request(server())
        .get("/api/auth/admin/profile")
        .set(authHeader(user))
        .expect(401);
    });

    scenario("AUTH-100", async () => {
      // Non-admin kullanıcı admin korumalı uçta 401/403.
      const user = await createUser(ctx.module);
      const res = await request(server())
        .get("/api/auth/admin/profile")
        .set(authHeader(user));
      expect([401, 403]).toContain(res.status);
    });
  });

  // ──────────────────────────── E-posta doğrulama ────────────────────────────
  describe("Email verification", () => {
    scenario("AUTH-036", async () => {
      // ŞABLON: MailHog'dan ham token okuma örneği. Servis token'ı hash'li saklar,
      // e-postaya HAM token gönderir → yalnız mail'den okunabilir.
      await clearMailbox();
      await register(validRegister({ email: "verify@test.com" })).expect(201);
      const mail = await getLastEmailTo("verify@test.com");
      const link = extractLink(mail.body, "verify");
      expect(link).toBeTruthy();
      const token = new URL(link!).searchParams.get("token");
      expect(token).toBeTruthy();

      await request(server())
        .post("/api/auth/verify-email")
        .send({ token })
        .expect(200);
      const prisma = getPrisma();
      const user = await prisma.user.findUnique({
        where: { email: "verify@test.com" },
      });
      expect(user?.isEmailVerified).toBe(true);
    });

    scenario("AUTH-037", async () => {
      // Idempotent: zaten doğrulanmış kullanıcı için kullanılmış token → 200 (hata değil).
      await clearMailbox();
      await register(validRegister({ email: "idem@test.com" })).expect(201);
      const mail = await getLastEmailTo("idem@test.com");
      const token = new URL(extractLink(mail.body, "verify")!).searchParams.get(
        "token",
      );
      await request(server())
        .post("/api/auth/verify-email")
        .send({ token })
        .expect(200);
      // İkinci çağrı: token usedAt dolu + kullanıcı isEmailVerified → 200 (idempotent).
      await request(server())
        .post("/api/auth/verify-email")
        .send({ token })
        .expect(200);
    });

    scenario("AUTH-038", async () => {
      // Kullanılmış token AMA kullanıcı henüz doğrulanmamış → 400.
      // Token'ı service formatıyla (sha256 hash saklı) elle üret; ham token'ı biz tutarız.
      const prisma = getPrisma();
      const user = await createUser(ctx.module, {
        email: "used-unverified@test.com",
        isEmailVerified: false,
      });
      const raw = crypto.randomBytes(32).toString("hex");
      const hashed = crypto.createHash("sha256").update(raw).digest("hex");
      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          token: hashed,
          email: "used-unverified@test.com",
          expiresAt: new Date(Date.now() + 3600_000),
          usedAt: new Date(), // zaten kullanılmış
        },
      });
      await request(server())
        .post("/api/auth/verify-email")
        .send({ token: raw })
        .expect(400);
    });

    scenario("AUTH-039", async () => {
      // Süresi dolmuş doğrulama tokeni → 400.
      const prisma = getPrisma();
      const user = await createUser(ctx.module, {
        email: "expired-verify@test.com",
        isEmailVerified: false,
      });
      const raw = crypto.randomBytes(32).toString("hex");
      const hashed = crypto.createHash("sha256").update(raw).digest("hex");
      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          token: hashed,
          email: "expired-verify@test.com",
          expiresAt: new Date(Date.now() - 3600_000), // geçmiş
        },
      });
      await request(server())
        .post("/api/auth/verify-email")
        .send({ token: raw })
        .expect(400);
    });

    scenario("AUTH-040", async () => {
      await request(server())
        .post("/api/auth/verify-email")
        .send({ token: "bilinmeyen-gecersiz-token" })
        .expect(400);
    });

    scenario("AUTH-041", async () => {
      const user = await createUser(ctx.module, {
        email: "resend@test.com",
        isEmailVerified: false,
      });
      const res = await request(server())
        .post("/api/auth/resend-verification")
        .send({ email: "resend@test.com" })
        .expect(200);
      expect(res.body.message).toBeTruthy();
      const prisma = getPrisma();
      const count = await prisma.emailVerificationToken.count({
        where: { userId: user.id },
      });
      expect(count).toBeGreaterThanOrEqual(1);
    });

    scenario("AUTH-042", async () => {
      // Zaten doğrulanmış kullanıcıya resend: controller kullanıcı sızıntısı yapmaz,
      // service isEmailVerified ise BadRequest atsa da controller yalnız bulunca çağırır.
      // Var olan doğrulanmış kullanıcı → controller resendEmailVerification çağırır →
      // service 400 (zaten doğrulanmış). Var olmayan → 200 (sızıntı yok).
      await createUser(ctx.module, {
        email: "already-verified@test.com",
        isEmailVerified: true,
      });
      await request(server())
        .post("/api/auth/resend-verification")
        .send({ email: "already-verified@test.com" })
        .expect(400);
      // Var olmayan e-posta → 200 (kullanıcı varlığı sızdırılmaz).
      await request(server())
        .post("/api/auth/resend-verification")
        .send({ email: "ghost-resend@test.com" })
        .expect(200);
    });
  });

  // ──────────────────────────── Şifre sıfırlama / değiştirme ────────────────────────────
  describe("Password reset & change", () => {
    scenario("AUTH-044", async () => {
      const user = await createUser(ctx.module, { email: "forgot@test.com" });
      const res = await request(server())
        .post("/api/auth/forgot-password")
        .send({ email: "forgot@test.com" })
        .expect(200);
      expect(res.body.message).toBeTruthy();
      const prisma = getPrisma();
      const count = await prisma.passwordResetToken.count({
        where: { userId: user.id },
      });
      expect(count).toBeGreaterThanOrEqual(1);
    });

    scenario("AUTH-045", async () => {
      // Kullanıcı sızıntısı yok: var olmayan e-posta da 200.
      await request(server())
        .post("/api/auth/forgot-password")
        .send({ email: "noone@test.com" })
        .expect(200);
    });

    scenario("AUTH-046", async () => {
      // Geçerli token ile şifre sıfırlama (auth ucu). Token service formatıyla (sha256) saklanır.
      const prisma = getPrisma();
      const user = await createUser(ctx.module, {
        email: "reset-ok@test.com",
        password: "Old123!",
      });
      const raw = crypto.randomBytes(32).toString("hex");
      const hashed = crypto.createHash("sha256").update(raw).digest("hex");
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: hashed,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      await request(server())
        .post("/api/auth/reset-password")
        .send({ token: raw, newPassword: "BrandNew789!" })
        .expect(200);
      // Yeni şifreyle giriş yapılabilir, eski şifre reddedilir.
      await login("reset-ok@test.com", "BrandNew789!").expect(200);
      await login("reset-ok@test.com", "Old123!").expect(401);
    });

    scenario("AUTH-047", async () => {
      // auth/reset-password ResetPasswordDto: özel karakter ZORUNLU DEĞİL (min 8 + upper/lower/digit).
      const prisma = getPrisma();
      const user = await createUser(ctx.module, {
        email: "reset-nospecial@test.com",
        password: "Old123!",
      });
      const raw = crypto.randomBytes(32).toString("hex");
      const hashed = crypto.createHash("sha256").update(raw).digest("hex");
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: hashed,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      // Özel karaktersiz ama upper+lower+digit → auth ucunda geçerli → 200.
      await request(server())
        .post("/api/auth/reset-password")
        .send({ token: raw, newPassword: "NoSpecial123" })
        .expect(200);
    });

    scenario("AUTH-048", async () => {
      // Kullanılmış reset token 400 (security ucu). security/password/reset gövde regexi özel karakter ister.
      const prisma = getPrisma();
      const user = await createUser(ctx.module, {
        email: "used-reset@test.com",
      });
      const raw = crypto.randomBytes(32).toString("hex");
      const hashed = crypto.createHash("sha256").update(raw).digest("hex");
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: hashed,
          expiresAt: new Date(Date.now() + 3600_000),
          usedAt: new Date(), // zaten kullanılmış
        },
      });
      await request(server())
        .post("/api/security/password/reset")
        .send({ token: raw, newPassword: "BrandNew789!" })
        .expect(400);
    });

    scenario("AUTH-049", async () => {
      // Süresi dolmuş reset token 400 (auth ucu).
      const prisma = getPrisma();
      const user = await createUser(ctx.module, {
        email: "expired-reset@test.com",
      });
      const raw = crypto.randomBytes(32).toString("hex");
      const hashed = crypto.createHash("sha256").update(raw).digest("hex");
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: hashed,
          expiresAt: new Date(Date.now() - 3600_000),
        },
      });
      await request(server())
        .post("/api/auth/reset-password")
        .send({ token: raw, newPassword: "BrandNew789!" })
        .expect(400);
    });

    scenario("AUTH-050", async () => {
      await request(server())
        .post("/api/auth/reset-password")
        .send({ token: "bilinmeyen-token", newPassword: "BrandNew789!" })
        .expect(400);
    });

    scenario("AUTH-051", async () => {
      // security/password/reset başarılı sıfırlamada TÜM refresh token'ları iptal eder.
      const prisma = getPrisma();
      const user = await createUser(ctx.module, {
        email: "reset-revoke@test.com",
        password: "Old123!",
      });
      // Bir oturum aç → refresh token DB'de (revokedAt null).
      const loginRes = await login("reset-revoke@test.com", "Old123!").expect(
        200,
      );
      const activeBefore = await prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      });
      expect(activeBefore).toBeGreaterThanOrEqual(1);

      const raw = crypto.randomBytes(32).toString("hex");
      const hashed = crypto.createHash("sha256").update(raw).digest("hex");
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: hashed,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      await request(server())
        .post("/api/security/password/reset")
        .send({ token: raw, newPassword: "BrandNew789!" })
        .expect(200);

      const activeAfter = await prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      });
      expect(activeAfter).toBe(0);
      // İptal edilen refresh artık yenilenemez.
      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: loginRes.body.tokens.refreshToken })
        .expect(401);
    });

    scenario("AUTH-052", async () => {
      // Parite (negatif): auth/reset-password refresh token'ları İPTAL ETMEZ (security ucundan farklı).
      const prisma = getPrisma();
      const user = await createUser(ctx.module, {
        email: "reset-noRevoke@test.com",
        password: "Old123!",
      });
      await login("reset-noRevoke@test.com", "Old123!").expect(200);
      const activeBefore = await prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      });
      expect(activeBefore).toBeGreaterThanOrEqual(1);

      const raw = crypto.randomBytes(32).toString("hex");
      const hashed = crypto.createHash("sha256").update(raw).digest("hex");
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: hashed,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      await request(server())
        .post("/api/auth/reset-password")
        .send({ token: raw, newPassword: "BrandNew789!" })
        .expect(200);

      // auth ucu refresh iptali yapmaz → hâlâ aktif token var.
      const activeAfter = await prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      });
      expect(activeAfter).toBe(activeBefore);
    });

    scenario("AUTH-053", async () => {
      const user = await createUser(ctx.module, {
        email: "chpw@test.com",
        password: "Demo123!",
      });
      await request(server())
        .post("/api/security/password/change")
        .set(authHeader(user))
        .send({ currentPassword: "Demo123!", newPassword: "NewPass456!" })
        .expect(200);
      await login("chpw@test.com", "Demo123!").expect(401);
      await login("chpw@test.com", "NewPass456!").expect(200);
    });

    scenario("AUTH-054", async () => {
      const user = await createUser(ctx.module, {
        email: "chpw2@test.com",
        password: "Demo123!",
      });
      await request(server())
        .post("/api/security/password/change")
        .set(authHeader(user))
        .send({ currentPassword: "WrongCurrent1!", newPassword: "NewPass456!" })
        .expect(401);
    });

    scenario("AUTH-055", async () => {
      // Zayıf yeni şifre 400: ChangePasswordDto newPassword özel karakter ZORUNLU.
      const user = await createUser(ctx.module, {
        email: "chpw-weak@test.com",
        password: "Demo123!",
      });
      await request(server())
        .post("/api/security/password/change")
        .set(authHeader(user))
        .send({ currentPassword: "Demo123!", newPassword: "NoSpecial123" }) // özel karakter yok
        .expect(400);
    });

    scenario("AUTH-056", async () => {
      await request(server())
        .post("/api/security/password/change")
        .send({ currentPassword: "Demo123!", newPassword: "NewPass456!" })
        .expect(401);
    });
  });

  // ──────────────────────────── Refresh & logout ────────────────────────────
  describe("Refresh & logout", () => {
    scenario("AUTH-057", async () => {
      await createUser(ctx.module, {
        email: "refresh@test.com",
        password: "Demo123!",
      });
      const loginRes = await login("refresh@test.com", "Demo123!").expect(200);
      const first = loginRes.body.tokens.refreshToken;

      // /api/auth/refresh DÜZ TokensDto döner ({ accessToken, refreshToken }), { tokens:{…} } DEĞİL.
      const r1 = await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: first })
        .expect(200);
      expect(r1.body.accessToken).toBeTruthy();
      const second = r1.body.refreshToken;
      expect(second).toBeTruthy();
      expect(second).not.toBe(first);

      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: second })
        .expect(200);
      // Rotasyon: ilk token artık geçersiz.
      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: first })
        .expect(401);
    });

    scenario("AUTH-058", async () => {
      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: "yanlis.imzali.token" })
        .expect(401);
    });

    scenario("AUTH-059", async () => {
      // Süresi dolmuş refresh token 401. JwtRefreshStrategy imzayı + süresini (ignoreExpiration:false)
      // doğrular; imzalı ama süresi dolmuş bir refresh JWT üretiriz.
      const jwt = ctx.module.get<JwtService>(JwtService);
      const config = ctx.module.get<ConfigService>(ConfigService);
      const user = await createUser(ctx.module, {
        email: "expired-refresh@test.com",
        password: "Demo123!",
      });
      const secret =
        config.get<string>("JWT_REFRESH_SECRET") ||
        config.get<string>("JWT_SECRET");
      const expired = await jwt.signAsync(
        { sub: user.id, email: user.email, isSeller: false, type: "refresh" },
        { secret, expiresIn: "-1h" }, // zaten süresi dolmuş
      );
      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: expired })
        .expect(401);
    });

    scenario("AUTH-060", async () => {
      // Access-type token refresh olarak kullanılamaz (imza JWT_SECRET, strategy JWT_REFRESH_SECRET + type!=refresh).
      const user = await createUser(ctx.module, {
        email: "acc@test.com",
        password: "Demo123!",
      });
      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: user.accessToken })
        .expect(401);
    });

    scenario("AUTH-061", async () => {
      await request(server()).post("/api/auth/refresh").send({}).expect(401);
    });

    scenario("AUTH-062", async () => {
      // Silinmiş kullanıcı için refresh 401. Login → refresh token al → kullanıcıyı sil → refresh 401.
      const user = await createUser(ctx.module, {
        email: "deleted-refresh@test.com",
        password: "Demo123!",
      });
      const loginRes = await login(
        "deleted-refresh@test.com",
        "Demo123!",
      ).expect(200);
      const rt = loginRes.body.tokens.refreshToken;
      const prisma = getPrisma();
      await prisma.user.delete({ where: { id: user.id } });
      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: rt })
        .expect(401);
    });

    scenario("AUTH-063", async () => {
      // Admin refresh ucu admin token üretir (isAdmin claim'li). Admin login → admin refresh.
      const admin = await createAdminUser(ctx.module, {
        email: "admin-refresh@test.com",
      });
      // Admin login ederek admin refresh cookie/token elde et (factory'nin ürettiği şifreyle).
      const loginRes = await request(server())
        .post("/api/auth/admin/login")
        .send({ email: "admin-refresh@test.com", password: admin.password })
        .expect(200);
      const rt = loginRes.body.tokens.refreshToken;
      const loginPayload = ctx.module
        .get(JwtService)
        .decode(loginRes.body.tokens.accessToken) as { sessionToken: string };
      const r = await request(server())
        .post("/api/auth/admin/refresh")
        .send({ refreshToken: rt })
        .expect(200);
      expect(r.body.accessToken).toBeTruthy();
      // Yenilenen access token isAdmin claim'i taşır.
      const payload = JSON.parse(
        Buffer.from(r.body.accessToken.split(".")[1], "base64").toString(
          "utf8",
        ),
      );
      expect(payload.isAdmin).toBe(true);
      expect(payload.sessionToken).toBe(loginPayload.sessionToken);

      // Geriye dönük genel refresh ucu da admin oturum kimliğini korumalı.
      const generic = await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: r.body.refreshToken })
        .expect(200);
      const genericPayload = ctx.module
        .get(JwtService)
        .decode(generic.body.accessToken) as { sessionToken: string };
      expect(genericPayload.sessionToken).toBe(loginPayload.sessionToken);
    });

    scenario("AUTH-064", async () => {
      // Admin deaktif olduktan sonra admin refresh 401.
      const prisma = getPrisma();
      const admin = await createAdminUser(ctx.module, {
        email: "admin-deact@test.com",
      });
      const loginRes = await request(server())
        .post("/api/auth/admin/login")
        .send({ email: "admin-deact@test.com", password: admin.password })
        .expect(200);
      const rt = loginRes.body.tokens.refreshToken;
      // Admin'i deaktif et.
      await prisma.adminUser.updateMany({
        where: { userId: admin.id },
        data: { isActive: false },
      });
      await request(server())
        .post("/api/auth/admin/refresh")
        .send({ refreshToken: rt })
        .expect(401);
    });

    scenario("AUTH-065", async () => {
      // Eşzamanlı çift refresh: DB'deki revokedAt:null compare-and-set koşulunu
      // yalnız bir istek kazanabilir.
      await createUser(ctx.module, {
        email: "race-refresh@test.com",
        password: "Demo123!",
      });
      const loginRes = await login("race-refresh@test.com", "Demo123!").expect(
        200,
      );
      const rt = loginRes.body.tokens.refreshToken;
      const [a, b] = await Promise.all([
        request(server()).post("/api/auth/refresh").send({ refreshToken: rt }),
        request(server()).post("/api/auth/refresh").send({ refreshToken: rt }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 401]);
      // Deterministik: rotasyon sonrası ORİJİNAL token artık iptal → 401.
      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: rt })
        .expect(401);
    });

    scenario("AUTH-066", async () => {
      // Parite: access token süresi dolunca korumalı uç 401, refresh sonrası yeni access ile 200.
      const jwt = ctx.module.get<JwtService>(JwtService);
      const config = ctx.module.get<ConfigService>(ConfigService);
      const user = await createUser(ctx.module, {
        email: "expiry-flow@test.com",
        password: "Demo123!",
      });
      const expiredAccess = await jwt.signAsync(
        { sub: user.id, email: user.email, isSeller: false, type: "access" },
        { secret: config.get<string>("JWT_SECRET"), expiresIn: "-1h" },
      );
      // Süresi dolmuş access → 401.
      await request(server())
        .get("/api/auth/profile")
        .set("Authorization", `Bearer ${expiredAccess}`)
        .expect(401);
      // Refresh → yeni access → 200.
      const loginRes = await login("expiry-flow@test.com", "Demo123!").expect(
        200,
      );
      const r1 = await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: loginRes.body.tokens.refreshToken })
        .expect(200);
      await request(server())
        .get("/api/auth/profile")
        .set("Authorization", `Bearer ${r1.body.accessToken}`)
        .expect(200);
    });

    scenario("AUTH-067", async () => {
      await createUser(ctx.module, {
        email: "logout@test.com",
        password: "Demo123!",
      });
      const loginRes = await login("logout@test.com", "Demo123!").expect(200);
      const refreshToken = loginRes.body.tokens.refreshToken;

      await request(server())
        .post("/api/auth/logout")
        .send({ refreshToken })
        .expect(200);
      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken })
        .expect(401);
    });

    scenario("AUTH-068", async () => {
      // Public logout: token'sız da 200 ve cookie temizliği.
      const res = await request(server()).post("/api/auth/logout").expect(200);
      const setCookie =
        (res.headers["set-cookie"] as unknown as string[]) ?? [];
      expect(setCookie.join(";")).toContain("access_token=");
    });

    scenario("AUTH-069", async () => {
      const admin = await createAdminUser(ctx.module, {
        email: "admin-logout@test.com",
      });
      const loggedIn = await request(server())
        .post("/api/auth/admin/login")
        .send({ email: admin.email, password: admin.password })
        .expect(200);
      const payload = ctx.module
        .get(JwtService)
        .decode(loggedIn.body.tokens.accessToken) as { sessionToken: string };

      const res = await request(server())
        .post("/api/auth/admin/logout")
        .send({ refreshToken: loggedIn.body.tokens.refreshToken })
        .expect(200);
      const setCookie =
        (res.headers["set-cookie"] as unknown as string[]) ?? [];
      expect(setCookie.join(";")).toContain("admin_token=");
      await expect(
        getPrisma().adminSession.findUnique({
          where: { sessionToken: payload.sessionToken },
        }),
      ).resolves.toBeNull();
      await request(server())
        .get("/api/auth/admin/profile")
        .set("Authorization", `Bearer ${loggedIn.body.tokens.accessToken}`)
        .expect(401);
    });

    scenario("AUTH-070", async () => {
      await createUser(ctx.module, {
        email: "everywhere@test.com",
        password: "Demo123!",
      });
      const a = await login("everywhere@test.com", "Demo123!").expect(200);
      const b = await login("everywhere@test.com", "Demo123!").expect(200);
      const me = createUserTokenFrom(a);

      await request(server())
        .delete("/api/security/tokens")
        .set(authHeader({ accessToken: me }))
        .expect(204);

      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: a.body.tokens.refreshToken })
        .expect(401);
      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: b.body.tokens.refreshToken })
        .expect(401);
    });

    scenario("AUTH-071", async () => {
      // Şifre sıfırlama (security ucu) sonrası eski oturum geçersiz — AUTH-051 ile aynı garantinin
      // oturum-geçersizleştirme açısı: eski access token korumalı uçta hâlâ çalışsa da refresh iptal edilir.
      const prisma = getPrisma();
      const user = await createUser(ctx.module, {
        email: "reset-session@test.com",
        password: "Old123!",
      });
      const loginRes = await login("reset-session@test.com", "Old123!").expect(
        200,
      );
      const raw = crypto.randomBytes(32).toString("hex");
      const hashed = crypto.createHash("sha256").update(raw).digest("hex");
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: hashed,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      await request(server())
        .post("/api/security/password/reset")
        .send({ token: raw, newPassword: "BrandNew789!" })
        .expect(200);
      // Eski refresh token artık geçersiz.
      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: loginRes.body.tokens.refreshToken })
        .expect(401);
    });
  });

  // ──────────────────────────── 2FA ────────────────────────────
  describe("Two-factor auth", () => {
    scenario("AUTH-072", async () => {
      const user = await createUser(ctx.module);
      const enable = await request(server())
        .post("/api/security/2fa/enable")
        .set(authHeader(user))
        .expect(201);
      expect(enable.body.secret).toMatch(/^[A-Z2-7]{16,32}$/);
      expect(enable.body.qrCodeUrl).toContain("otpauth://totp/Tarodan:");
      expect(enable.body.backupCodes).toHaveLength(10);
      const status = await request(server())
        .get("/api/security/2fa/status")
        .set(authHeader(user))
        .expect(200);
      expect(status.body.isEnabled).toBe(false);
      expect(status.body.hasBackupCodes).toBe(true);
    });

    scenario("AUTH-073", async () => {
      const user = await createUser(ctx.module);
      const enable = await request(server())
        .post("/api/security/2fa/enable")
        .set(authHeader(user))
        .expect(201);
      const code = generateTOTPCode(enable.body.secret);
      await request(server())
        .post("/api/security/2fa/verify")
        .set(authHeader(user))
        .send({ code })
        .expect(201)
        .then((r) => expect(r.body.success).toBe(true));
      const status = await request(server())
        .get("/api/security/2fa/status")
        .set(authHeader(user))
        .expect(200);
      expect(status.body.isEnabled).toBe(true);
    });

    scenario("AUTH-074", async () => {
      const user = await createUser(ctx.module);
      const enable = await request(server())
        .post("/api/security/2fa/enable")
        .set(authHeader(user))
        .expect(201);
      await request(server())
        .post("/api/security/2fa/verify")
        .set(authHeader(user))
        .send({ code: generateTOTPCode(enable.body.secret) })
        .expect(201);
      await request(server())
        .post("/api/security/2fa/enable")
        .set(authHeader(user))
        .expect(400);
    });

    scenario("AUTH-075", async () => {
      const user = await createUser(ctx.module);
      await request(server())
        .post("/api/security/2fa/enable")
        .set(authHeader(user))
        .expect(201);
      await request(server())
        .post("/api/security/2fa/verify")
        .set(authHeader(user))
        .send({ code: "000000" })
        .expect(401);
      const status = await request(server())
        .get("/api/security/2fa/status")
        .set(authHeader(user))
        .expect(200);
      expect(status.body.isEnabled).toBe(false);
    });

    scenario("AUTH-076", async () => {
      // TOTP kod uzunluğu 6 dışında 400 (Verify2FADto Min/MaxLength(6)).
      const user = await createUser(ctx.module);
      await request(server())
        .post("/api/security/2fa/enable")
        .set(authHeader(user))
        .expect(201);
      await request(server())
        .post("/api/security/2fa/verify")
        .set(authHeader(user))
        .send({ code: "12345" }) // 5 hane
        .expect(400);
      await request(server())
        .post("/api/security/2fa/verify")
        .set(authHeader(user))
        .send({ code: "1234567" }) // 7 hane
        .expect(400);
    });

    scenario("AUTH-077", async () => {
      const user = await createUser(ctx.module);
      // 2FA hiç etkin değilken disable → 400.
      await request(server())
        .post("/api/security/2fa/disable")
        .set(authHeader(user))
        .send({ code: "123456" })
        .expect(400);
      // Etkinleştir, sonra yanlış kodla disable → 401.
      const enable = await request(server())
        .post("/api/security/2fa/enable")
        .set(authHeader(user))
        .expect(201);
      await request(server())
        .post("/api/security/2fa/verify")
        .set(authHeader(user))
        .send({ code: generateTOTPCode(enable.body.secret) })
        .expect(201);
      await request(server())
        .post("/api/security/2fa/disable")
        .set(authHeader(user))
        .send({ code: "000000" })
        .expect(401);
    });

    scenario("AUTH-078", async () => {
      const user = await createUser(ctx.module);
      const enable = await request(server())
        .post("/api/security/2fa/enable")
        .set(authHeader(user))
        .expect(201);
      await request(server())
        .post("/api/security/2fa/verify")
        .set(authHeader(user))
        .send({ code: generateTOTPCode(enable.body.secret) })
        .expect(201);
      await request(server())
        .post("/api/security/2fa/disable")
        .set(authHeader(user))
        .send({ code: generateTOTPCode(enable.body.secret) })
        .expect(201);
      const status = await request(server())
        .get("/api/security/2fa/status")
        .set(authHeader(user))
        .expect(200);
      expect(status.body.isEnabled).toBe(false);
    });

    scenario("AUTH-079", async () => {
      const user = await createUser(ctx.module);
      const enable = await request(server())
        .post("/api/security/2fa/enable")
        .set(authHeader(user))
        .expect(201);
      const initial: string[] = enable.body.backupCodes;
      await request(server())
        .post("/api/security/2fa/verify")
        .set(authHeader(user))
        .send({ code: generateTOTPCode(enable.body.secret) })
        .expect(201);
      const fresh = await request(server())
        .post("/api/security/2fa/backup-codes")
        .set(authHeader(user))
        .send({ code: generateTOTPCode(enable.body.secret) })
        .expect(201);
      expect(fresh.body.backupCodes).toHaveLength(10);
      expect(fresh.body.backupCodes).not.toEqual(initial);
    });

    scenario("AUTH-080", async () => {
      await request(server()).get("/api/security/2fa/status").expect(401);
      await request(server()).post("/api/security/2fa/enable").expect(401);
      await request(server())
        .post("/api/security/2fa/verify")
        .send({ code: "123456" })
        .expect(401);
      await request(server())
        .post("/api/security/2fa/disable")
        .send({ code: "123456" })
        .expect(401);
    });

    scenario("AUTH-081", async () => {
      const user = await createUser(ctx.module);
      const enable = await request(server())
        .post("/api/security/2fa/enable")
        .set(authHeader(user))
        .expect(201);
      const backupCode = enable.body.backupCodes[0];
      await request(server())
        .post("/api/security/2fa/verify")
        .set(authHeader(user))
        .send({ code: generateTOTPCode(enable.body.secret) })
        .expect(201);

      const credentials = {
        email: user.email,
        password: user.password,
        twoFactorCode: backupCode,
      };
      await request(server())
        .post("/api/auth/login")
        .send(credentials)
        .expect(200);
      await request(server())
        .post("/api/auth/login")
        .send(credentials)
        .expect(401);
    });
  });

  // ──────────────────────────── CSRF ────────────────────────────
  describe("CSRF token", () => {
    scenario("AUTH-082", async () => {
      // CSRF token üretimi (oturumlu).
      const user = await createUser(ctx.module);
      const res = await request(server())
        .get("/api/security/csrf-token")
        .set(authHeader(user))
        .expect(200);
      expect(res.body.token).toBeTruthy();
      expect(res.body.expiresAt).toBeTruthy();
      const prisma = getPrisma();
      const row = await prisma.csrfToken.findUnique({
        where: { token: res.body.token },
      });
      expect(row).toBeTruthy();
    });

    // CSRF validate/session-mismatch uçları controller'da EXPOSE edilmemiş
    // (validateCsrfToken yalnız servis içi kullanımdadır); API'den doğrudan assert edilemez.
    scenario.skip(
      "AUTH-083",
      "CSRF validate/silme public API ucu yok (yalnız servis-içi validateCsrfToken)",
    );
    scenario.skip(
      "AUTH-084",
      "CSRF yanlış-session reddi public API ucu yok (yalnız servis-içi validateCsrfToken)",
    );
  });

  // ──────────────────────────── Admin oturum yönetimi ────────────────────────────
  describe("Admin session management", () => {
    scenario("AUTH-085", async () => {
      const admin = await createAdminUser(ctx.module, {
        email: "sess-list@test.com",
      });
      const prisma = getPrisma();
      const adminUser = await prisma.adminUser.findUniqueOrThrow({
        where: { userId: admin.id },
      });
      const active = await prisma.adminSession.findFirstOrThrow({
        where: { adminUserId: adminUser.id },
      });
      await prisma.adminSession.create({
        data: {
          adminUserId: adminUser.id,
          sessionToken: crypto.randomUUID(),
          expiresAt: new Date(Date.now() - 60_000),
        },
      });

      const res = await request(server())
        .get("/api/security/admin/sessions")
        .set(authHeader(admin))
        .expect(200);
      expect(
        res.body.sessions.map((session: { id: string }) => session.id),
      ).toEqual([active.id]);
      expect(res.body.currentSessionId).toBe(active.id);
    });

    scenario("AUTH-086", async () => {
      const owner = await createAdminUser(ctx.module, {
        email: "sess-owner@test.com",
      });
      const other = await createAdminUser(ctx.module, {
        email: "sess-other@test.com",
      });
      const prisma = getPrisma();
      const ownerAdmin = await prisma.adminUser.findUniqueOrThrow({
        where: { userId: owner.id },
      });
      const otherAdmin = await prisma.adminUser.findUniqueOrThrow({
        where: { userId: other.id },
      });
      const ownerSession = await prisma.adminSession.findFirstOrThrow({
        where: { adminUserId: ownerAdmin.id },
      });
      const otherSession = await prisma.adminSession.findFirstOrThrow({
        where: { adminUserId: otherAdmin.id },
      });

      await request(server())
        .delete(`/api/security/admin/sessions/${otherSession.id}`)
        .set(authHeader(owner))
        .expect(204);
      await expect(
        prisma.adminSession.findUnique({ where: { id: otherSession.id } }),
      ).resolves.toBeTruthy();

      await request(server())
        .delete(`/api/security/admin/sessions/${ownerSession.id}`)
        .set(authHeader(owner))
        .expect(204);
      await expect(
        prisma.adminSession.findUnique({ where: { id: ownerSession.id } }),
      ).resolves.toBeNull();
    });

    scenario("AUTH-088", async () => {
      const owner = await createAdminUser(ctx.module, {
        email: "sess-all@test.com",
      });
      const other = await createAdminUser(ctx.module, {
        email: "sess-all-other@test.com",
      });
      const prisma = getPrisma();
      const ownerAdmin = await prisma.adminUser.findUniqueOrThrow({
        where: { userId: owner.id },
      });
      const otherAdmin = await prisma.adminUser.findUniqueOrThrow({
        where: { userId: other.id },
      });

      await request(server())
        .delete("/api/security/admin/sessions")
        .set(authHeader(owner))
        .expect(204);
      await expect(
        prisma.adminSession.count({ where: { adminUserId: ownerAdmin.id } }),
      ).resolves.toBe(0);
      await expect(
        prisma.adminSession.count({ where: { adminUserId: otherAdmin.id } }),
      ).resolves.toBe(1);
    });

    scenario("AUTH-089", async () => {
      const moderator = await createAdminUser(ctx.module, {
        email: "sess-moderator@test.com",
        role: AdminRole.moderator,
      });
      const user = await createUser(ctx.module, {
        email: "sess-user@test.com",
      });

      await request(server())
        .get("/api/security/admin/sessions")
        .set(authHeader(moderator))
        .expect(403);
      await request(server())
        .get("/api/security/admin/sessions")
        .set(authHeader(user))
        .expect(401);
    });

    scenario("AUTH-087", async () => {
      const admin = await createAdminUser(ctx.module, {
        email: "sess-admin@test.com",
      });
      await request(server())
        .delete("/api/security/admin/sessions/not-a-uuid")
        .set(authHeader(admin))
        .expect(400);
    });
  });

  // ──────────────────────────── Rate-limit (throttle) ────────────────────────────
  describe("Rate limiting", () => {
    // ThrottlerModule.forRoot({ skipIf: () => NODE_ENV==='test' }) → test'te throttle TAMAMEN
    // kapalı; 429 asla üretilemez. Bu senaryolar yalnız prod/staging'de anlamlı → skip (harness kısıtı).
    scenario.skip(
      "AUTH-090",
      "Throttle test env’de kapalı (skipIf NODE_ENV=test) → 429 üretilemez",
    );
    scenario.skip(
      "AUTH-091",
      "Throttle test env’de kapalı → register 429 üretilemez",
    );
    scenario.skip(
      "AUTH-092",
      "Throttle test env’de kapalı → forgot-password 429 üretilemez",
    );
    scenario.skip(
      "AUTH-093",
      "Throttle test env’de kapalı → resend 429 üretilemez",
    );
    scenario.skip(
      "AUTH-095",
      "Throttle test env’de kapalı → admin login 429 üretilemez",
    );

    scenario("AUTH-094", async () => {
      // Olağan refresh/profile trafiği geniş refresh limiti içinde 429 üretmez.
      // Throttle test'te kapalı; bu test yalnız pozitif akış regresyonunu korur.
      const user = await createUser(ctx.module, {
        email: "nothrottle@test.com",
        password: "Demo123!",
      });
      const loginRes = await login("nothrottle@test.com", "Demo123!").expect(
        200,
      );
      let rt = loginRes.body.tokens.refreshToken;
      for (let i = 0; i < 8; i++) {
        const r = await request(server())
          .post("/api/auth/refresh")
          .send({ refreshToken: rt });
        expect(r.status).not.toBe(429);
        if (r.status === 200) rt = r.body.refreshToken;
      }
      for (let i = 0; i < 8; i++) {
        const p = await request(server())
          .get("/api/auth/profile")
          .set(authHeader(user));
        expect(p.status).not.toBe(429);
      }
    });
  });

  // ──────────────────────────── Ban davranışı ────────────────────────────
  describe("Ban behavior", () => {
    scenario("AUTH-096", async () => {
      // Banlı kullanıcı korumalı uca erişemez → 403 USER_BANNED.
      const prisma = getPrisma();
      const user = await createUser(ctx.module, {
        email: "banned@test.com",
        password: "Demo123!",
      });
      const loginRes = await login("banned@test.com", "Demo123!").expect(200);
      await prisma.user.update({
        where: { id: user.id },
        data: { isBanned: true, bannedReason: "test" },
      });
      const res = await request(server())
        .get("/api/auth/profile")
        .set(authHeader(user))
        .expect(403);
      expect(res.body.errorCode).toBe("USER_BANNED");
      await login("banned@test.com", "Demo123!").expect(401);
      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: loginRes.body.tokens.refreshToken })
        .expect(401);
    });

    scenario("AUTH-097", async () => {
      // Banlı kullanıcı yine de çıkış yapabilir (logout Public + BannedUserGuard istisnası).
      const prisma = getPrisma();
      const user = await createUser(ctx.module, {
        email: "banned-logout@test.com",
        password: "Demo123!",
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { isBanned: true, bannedReason: "test" },
      });
      await request(server())
        .post("/api/auth/logout")
        .set(authHeader(user))
        .expect(200);
    });

    scenario("AUTH-098", async () => {
      // Banlı cookie/token varken BAŞKA hesapla login yapılabilir (login Public → ban bloklamaz).
      const prisma = getPrisma();
      const banned = await createUser(ctx.module, {
        email: "banned-cookie@test.com",
        password: "Demo123!",
      });
      await prisma.user.update({
        where: { id: banned.id },
        data: { isBanned: true },
      });
      await createUser(ctx.module, {
        email: "other-acct@test.com",
        password: "Demo123!",
      });
      // Banlı access token'ı header'da taşısak da login public → başarılı olmalı.
      await request(server())
        .post("/api/auth/login")
        .set(authHeader(banned))
        .send({ email: "other-acct@test.com", password: "Demo123!" })
        .expect(200);
    });
  });

  // ──────────────────────────── Güvenlik (depolama) ────────────────────────────
  describe("Security storage", () => {
    scenario("AUTH-109", async () => {
      await createUser(ctx.module, {
        email: "hash@test.com",
        password: "Demo123!",
      });
      const loginRes = await login("hash@test.com", "Demo123!").expect(200);
      const refreshToken: string = loginRes.body.tokens.refreshToken;
      const hash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");

      const prisma = getPrisma();
      const row = await prisma.refreshToken.findFirst({
        where: { tokenHash: hash },
      });
      expect(row).toBeTruthy();
      expect(row!.tokenHash).toHaveLength(64);
      // Ham JWT DB'de saklanmaz.
      const raw = await prisma.refreshToken.findFirst({
        where: { tokenHash: refreshToken },
      });
      expect(raw).toBeNull();
    });

    scenario("AUTH-110", async () => {
      // TOTP secret DB'de AES-256-GCM ciphertext olarak saklanır.
      const user = await createUser(ctx.module);
      const enable = await request(server())
        .post("/api/security/2fa/enable")
        .set(authHeader(user))
        .expect(201);
      const rawSecret: string = enable.body.secret;
      const prisma = getPrisma();
      const row = await prisma.twoFactorSecret.findUnique({
        where: { userId: user.id },
      });
      expect(row?.secret).toBeTruthy();
      expect(row?.secret).not.toBe(rawSecret);
      expect(row?.secret).toMatch(/^v1:/);
      expect(row?.secret).not.toBe(Buffer.from(rawSecret).toString("base64"));
    });

    scenario("AUTH-111", async () => {
      // Yedek kodlar DB'de bcrypt hash olarak saklanır (düz metin DEĞİL).
      const user = await createUser(ctx.module);
      const enable = await request(server())
        .post("/api/security/2fa/enable")
        .set(authHeader(user))
        .expect(201);
      const plainCodes: string[] = enable.body.backupCodes;
      const prisma = getPrisma();
      const row = await prisma.twoFactorSecret.findUnique({
        where: { userId: user.id },
      });
      expect(row?.backupCodes?.every((c) => c.startsWith("$2"))).toBe(true);
      // Ham kodlardan hiçbiri DB'de düz metin olarak bulunmamalı.
      for (const p of plainCodes) {
        expect(row?.backupCodes).not.toContain(p);
      }
    });

    scenario("AUTH-112", async () => {
      // Password reset / email verification token'ları DB'de sha256 hash'li saklanır (düz metin DEĞİL).
      await clearMailbox();
      const user = await createUser(ctx.module, {
        email: "token-hash@test.com",
      });
      // forgot-password → passwordResetToken.token = sha256(raw); raw yalnız e-postada/servis-içi.
      await request(server())
        .post("/api/auth/forgot-password")
        .send({ email: "token-hash@test.com" })
        .expect(200);
      const prisma = getPrisma();
      const prt = await prisma.passwordResetToken.findFirst({
        where: { userId: user.id },
      });
      expect(prt?.token).toBeTruthy();
      expect(prt!.token).toHaveLength(64); // sha256 hex
    });
  });

  // ──────────────────────────── Misafir sipariş bağlama ────────────────────────────
  describe("Guest order linking", () => {
    // AUTH-114: register sırasında guest@tarodan.system altındaki, shippingAddress.guestEmail'i
    // yeni kullanıcının e-postasıyla eşleşen siparişler yeni kullanıcıya bağlanır. Bunu kurmak
    // sistem-guest kullanıcısı + tam bir Order (zorunlu FK/alanlar: checkoutGroup, seller, ürün,
    // tutarlar) seed'i gerektirir; AUTH domaininde ürün/sipariş fabrikası kapsamı yok →
    // sipariş domain spec'inde (07-ord) daha uygun. Burada skip.
    scenario.skip(
      "AUTH-114",
      "Guest sipariş bağlama tam Order seed’i (checkoutGroup/seller/ürün/tutarlar) ister — sipariş domaininde kapsanır",
    );
  });

  // ──────────────────────────── i18n / UI ────────────────────────────
  describe("i18n & UI", () => {
    scenario("AUTH-101", async () => {
      // Hata mesajları Türkçe döner (API i18n). Yanlış şifre → Türkçe mesaj.
      await createUser(ctx.module, {
        email: "i18n@test.com",
        password: "Demo123!",
      });
      const res = await login("i18n@test.com", "Wrong123!").expect(401);
      expect(String(res.body.message)).toMatch(/şifre|hatalı|geçersiz/i);
    });

    scenario("AUTH-103", async () => {
      // Parite: web ve mobil aynı login/register/refresh/logout uçlarını çağırır. API tarafında
      // bu uçların var ve tutarlı olduğunu smoke ederiz (uç mevcudiyeti = parite ön koşulu).
      await createUser(ctx.module, {
        email: "parity@test.com",
        password: "Demo123!",
      });
      const l = await login("parity@test.com", "Demo123!").expect(200);
      await request(server())
        .post("/api/auth/refresh")
        .send({ refreshToken: l.body.tokens.refreshToken })
        .expect(200);
      await request(server()).post("/api/auth/logout").send({}).expect(200);
      await register(validRegister({ email: "parity2@test.com" })).expect(201);
    });

    scenario("AUTH-104", async () => {
      // Parite farkı (beklenen): web login httpOnly cookie taşır; mobil header/body token kullanır.
      // API her ikisini de destekler: login hem Set-Cookie hem body token döner.
      await createUser(ctx.module, {
        email: "cookie-vs-header@test.com",
        password: "Demo123!",
      });
      const res = await login("cookie-vs-header@test.com", "Demo123!").expect(
        200,
      );
      const setCookie =
        (res.headers["set-cookie"] as unknown as string[]) ?? [];
      expect(setCookie.join(";")).toContain("access_token=");
      // Mobil için body token da mevcut.
      expect(res.body.tokens?.accessToken).toBeTruthy();
    });

    // Saf-UI: ayrı login EKRANI (AUTH-105) ve boş/yükleniyor/hata UI durumları (AUTH-106)
    // API'den assert edilemez — istemci sunum katmanı.
    scenario.skip(
      "AUTH-105",
      "Admin ayrı login EKRANI saf UI (API tarafı AUTH-029/069 ile kapsanıyor)",
    );
    scenario.skip(
      "AUTH-106",
      "Boş/Yükleniyor/Hata UI durumları saf istemci sunumu — API’den assert edilemez",
    );

    scenario("AUTH-102", async () => {
      // Parite: web ile mobil AYNI reset-password ucunu (/api/auth/reset-password) kullanır.
      // Uç mevcudiyeti + geçerli token ile 200 → parite ön koşulu doğrulanır.
      const prisma = getPrisma();
      const user = await createUser(ctx.module, {
        email: "reset-parity@test.com",
        password: "Old123!",
      });
      const raw = crypto.randomBytes(32).toString("hex");
      const hashed = crypto.createHash("sha256").update(raw).digest("hex");
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: hashed,
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      await request(server())
        .post("/api/auth/reset-password")
        .send({ token: raw, newPassword: "BrandNew789!" })
        .expect(200);
    });

    scenario("AUTH-099", async () => {
      // Admin yetki: super_admin admin-korumalı uca (AdminAuthGuard ile GERÇEKTEN korunan
      // /auth/admin/profile) erişir; non-admin erişemez. (SecurityController'daki admin
      // oturum uçları RolesGuard bağlı olmadığından RBAC assert için uygun değildir.)
      const admin = await createAdminUser(ctx.module, {
        email: "super@test.com",
        role: AdminRole.super_admin,
      });
      await request(server())
        .get("/api/auth/admin/profile")
        .set(authHeader(admin))
        .expect(200);
      const normal = await createUser(ctx.module, {
        email: "nonadmin-99@test.com",
      });
      await request(server())
        .get("/api/auth/admin/profile")
        .set(authHeader(normal))
        .expect(401);
    });
  });
});

/** AUTH-070 yardımcı: login yanıtındaki access token'ı döner (DELETE /security/tokens için). */
function createUserTokenFrom(loginRes: request.Response): string {
  return loginRes.body.tokens.accessToken as string;
}
