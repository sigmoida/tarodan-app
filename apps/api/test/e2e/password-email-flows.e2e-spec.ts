import * as request from "supertest";
import * as crypto from "crypto";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import { createUser, authHeader } from "../factories/user.factory";

describe("Password & Email Verification flows (E2E)", () => {
  let ctx: E2ETestApp;

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

  // ============================================================================
  // Password change (authenticated)
  // ============================================================================

  describe("POST /api/security/password/change", () => {
    it("changes password with correct current password", async () => {
      const user = await createUser(ctx.module, { password: "OldPass123!" });

      await request(ctx.app.getHttpServer())
        .post("/api/security/password/change")
        .set(authHeader(user))
        .send({ currentPassword: "OldPass123!", newPassword: "NewPass456!" })
        .expect(200);

      // Old password no longer works
      await request(ctx.app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: user.email, password: "OldPass123!" })
        .expect(401);

      // New password works
      const login = await request(ctx.app.getHttpServer())
        .post("/api/auth/login")
        .send({ email: user.email, password: "NewPass456!" })
        .expect(200);
      expect(login.body.tokens?.accessToken).toBeTruthy();
    });

    it("rejects with 401 when current password is wrong", async () => {
      const user = await createUser(ctx.module, { password: "RealPass123!" });

      await request(ctx.app.getHttpServer())
        .post("/api/security/password/change")
        .set(authHeader(user))
        .send({
          currentPassword: "WrongPass123!",
          newPassword: "NewPass456!",
        })
        .expect(401);
    });

    it("rejects weak new password (validation rule)", async () => {
      const user = await createUser(ctx.module, { password: "OldPass123!" });

      await request(ctx.app.getHttpServer())
        .post("/api/security/password/change")
        .set(authHeader(user))
        .send({ currentPassword: "OldPass123!", newPassword: "weakpass" })
        .expect(400);
    });

    it("rejects unauthenticated request (401)", async () => {
      await request(ctx.app.getHttpServer())
        .post("/api/security/password/change")
        .send({ currentPassword: "x", newPassword: "NewPass456!" })
        .expect(401);
    });
  });

  // Password reset: tek yol auth (`/api/auth/forgot-password` +
  // `/api/auth/reset-password`) — kapsamı scenarios/01-auth.e2e-spec.ts
  // (AUTH-044..052, AUTH-071). Eski /api/security/password/request-reset +
  // /reset çifti kaldırıldı (#432).

  // ============================================================================
  // Email verification — auth is the ONLY verification path.
  //
  // Bu blok eskiden /api/security/email/verify'i test ediyordu: o uc token'i
  // HAM ariyordu ve test de elle ham token ekiyordu, dolayisiyla gercek akisi
  // (auth sha256 YAZAR) hic dogrulamiyordu. Uc kaldirildi; test artik kayit
  // akisinin urettigi token'in nasil saklandigini ve nasil tuketildigini pinler.
  // ============================================================================

  describe("POST /api/auth/verify-email", () => {
    const hash = (token: string) =>
      crypto.createHash("sha256").update(token).digest("hex");

    it("verifies email with a valid token and flips isEmailVerified to true", async () => {
      const user = await createUser(ctx.module, { isEmailVerified: false });
      const prisma = getPrisma();

      const rawToken = crypto.randomBytes(32).toString("hex");
      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          // Auth token'i HASH'leyerek saklar - DB okuma yetkisi tek basina
          // bekleyen bir e-postayi dogrulamaya yetmesin.
          token: hash(rawToken),
          email: user.email,
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
        },
      });

      await request(ctx.app.getHttpServer())
        .post("/api/auth/verify-email")
        .send({ token: rawToken })
        .expect(200);

      const refreshed = await prisma.user.findUnique({
        where: { id: user.id },
      });
      expect(refreshed!.isEmailVerified).toBe(true);

      const usedToken = await prisma.emailVerificationToken.findFirst({
        where: { userId: user.id },
      });
      expect(usedToken!.usedAt).not.toBeNull();
    });

    it("rejects expired and unknown tokens with 400", async () => {
      const user = await createUser(ctx.module, { isEmailVerified: false });
      const prisma = getPrisma();

      const expiredToken = crypto.randomBytes(32).toString("hex");
      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          token: hash(expiredToken),
          email: user.email,
          expiresAt: new Date(Date.now() - 60 * 1000),
        },
      });
      await request(ctx.app.getHttpServer())
        .post("/api/auth/verify-email")
        .send({ token: expiredToken })
        .expect(400);

      await request(ctx.app.getHttpServer())
        .post("/api/auth/verify-email")
        .send({ token: "unknown-token" })
        .expect(400);
    });

    it("is idempotent for an already verified account", async () => {
      const user = await createUser(ctx.module, { isEmailVerified: true });
      const prisma = getPrisma();

      const usedToken = crypto.randomBytes(32).toString("hex");
      await prisma.emailVerificationToken.create({
        data: {
          userId: user.id,
          token: hash(usedToken),
          email: user.email,
          expiresAt: new Date(Date.now() + 3600 * 1000),
          usedAt: new Date(),
        },
      });

      // Kullanici linke iki kez tiklarsa hata degil, sessiz onay gormeli.
      await request(ctx.app.getHttpServer())
        .post("/api/auth/verify-email")
        .send({ token: usedToken })
        .expect(200);
    });
  });
});
