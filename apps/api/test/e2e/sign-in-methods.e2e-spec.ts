import * as request from "supertest";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import {
  truncateAll,
  getPrisma,
  seedBaseline,
  disconnectPrisma,
} from "../test-utils/db";
import {
  createUser,
  authHeader,
  type CreatedTestUser,
} from "../factories/user.factory";
import { GoogleAuthService } from "../../src/modules/auth/social/google-auth.service";
import { AppleAuthService } from "../../src/modules/auth/social/apple-auth.service";
import { OUTBOX_APPLE_TOKEN_REVOKE } from "../../src/modules/outbox/outbox.types";

/**
 * Sign-in methods and step-up over HTTP (sign-in methods plan, T8 and T9):
 * `GET /auth/sign-in-methods`, `POST /auth/reauth`, `POST /auth/password/set`,
 * `POST /auth/social/{google,apple}/link`, `POST /auth/social/:provider/unlink`.
 * The providers are stubbed at `GoogleAuthService` and `AppleAuthService`;
 * everything else is real (Postgres row lock, Redis token store, guards,
 * validation, outbox).
 */
describe("Sign-in methods and step-up (E2E)", () => {
  let ctx: E2ETestApp;
  let google: GoogleAuthService;
  let apple: AppleAuthService;
  const SUB = "google-sub-e2e";

  beforeAll(async () => {
    ctx = await createE2ETestApp();
    google = ctx.module.get(GoogleAuthService);
    apple = ctx.module.get(AppleAuthService);
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    await truncateAll();
    await seedBaseline();
  });

  const http = () => request(ctx.app.getHttpServer());

  /** A Google-only account: no password, one Google link. */
  async function createSocialOnlyUser(): Promise<CreatedTestUser> {
    const user = await createUser(ctx.module);
    const prisma = getPrisma();
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: null },
    });
    await prisma.oAuthAccount.create({
      data: {
        provider: "google",
        providerUserId: SUB,
        email: user.email,
        userId: user.id,
      },
    });
    return user;
  }

  function stubGoogle(issuedAt = Math.floor(Date.now() / 1000), sub = SUB) {
    jest
      .spyOn(google, "verifyIdToken")
      .mockResolvedValue({ sub, email: "g@example.com", issuedAt });
  }

  async function reauthWithPassword(user: CreatedTestUser): Promise<string> {
    const res = await http()
      .post("/api/auth/reauth")
      .set(authHeader(user))
      .send({ password: user.password })
      .expect(200);
    return res.body.reauthToken;
  }

  async function reauthWithGoogle(user: CreatedTestUser): Promise<string> {
    stubGoogle();
    const res = await http()
      .post("/api/auth/reauth")
      .set(authHeader(user))
      .send({ provider: "google", idToken: "native-id-token" })
      .expect(200);
    return res.body.reauthToken;
  }

  describe("GET /api/auth/sign-in-methods", () => {
    it("needs a session", async () => {
      await http().get("/api/auth/sign-in-methods").expect(401);
    });

    it("reports the password and only this user's providers", async () => {
      const owner = await createSocialOnlyUser();
      const other = await createUser(ctx.module);

      const otherRes = await http()
        .get("/api/auth/sign-in-methods")
        .set(authHeader(other))
        .expect(200);
      expect(otherRes.body).toEqual({ hasPassword: true, providers: [] });

      const ownerRes = await http()
        .get("/api/auth/sign-in-methods")
        .set(authHeader(owner))
        .expect(200);
      expect(ownerRes.body.hasPassword).toBe(false);
      expect(ownerRes.body.providers).toEqual([
        {
          provider: "google",
          email: owner.email,
          linkedAt: expect.any(String),
        },
      ]);
    });
  });

  describe("POST /api/auth/reauth", () => {
    it("issues a token for the right password, about 5 minutes long", async () => {
      const user = await createUser(ctx.module);

      const res = await http()
        .post("/api/auth/reauth")
        .set(authHeader(user))
        .send({ password: user.password })
        .expect(200);

      expect(typeof res.body.reauthToken).toBe("string");
      const ttlMs = new Date(res.body.expiresAt).getTime() - Date.now();
      expect(ttlMs).toBeGreaterThan(290_000);
      expect(ttlMs).toBeLessThanOrEqual(300_000);
    });

    it("answers 403 REAUTH_FAILED for a wrong password and 429 on the sixth try", async () => {
      const user = await createUser(ctx.module);

      for (let i = 0; i < 5; i++) {
        const res = await http()
          .post("/api/auth/reauth")
          .set(authHeader(user))
          .send({ password: "Wrong-Pass-1" })
          .expect(403);
        expect(res.body.errorCode).toBe("REAUTH_FAILED");
      }
      await http()
        .post("/api/auth/reauth")
        .set(authHeader(user))
        .send({ password: user.password })
        .expect(429);

      const logs = await getPrisma().securityLog.findMany({
        where: { userId: user.id },
        select: { eventType: true },
      });
      expect(logs.filter((l) => l.eventType === "reauth_failed")).toHaveLength(
        5,
      );
      expect(logs.filter((l) => l.eventType === "reauth_locked")).toHaveLength(
        1,
      );
    });

    it("refuses a provider proof from an account with a password (400)", async () => {
      const user = await createUser(ctx.module);
      stubGoogle();

      await http()
        .post("/api/auth/reauth")
        .set(authHeader(user))
        .send({ provider: "google", idToken: "native-id-token" })
        .expect(400);
    });

    it("accepts a fresh sign-in of the linked provider from a social-only account", async () => {
      const user = await createSocialOnlyUser();
      expect(await reauthWithGoogle(user)).toEqual(expect.any(String));
    });

    it("refuses a stale or a foreign provider sign-in with 403 REAUTH_FAILED", async () => {
      const user = await createSocialOnlyUser();

      stubGoogle(Math.floor(Date.now() / 1000) - 600);
      const stale = await http()
        .post("/api/auth/reauth")
        .set(authHeader(user))
        .send({ provider: "google", idToken: "cached-id-token" })
        .expect(403);
      expect(stale.body.errorCode).toBe("REAUTH_FAILED");

      stubGoogle(undefined, "someone-elses-sub");
      const foreign = await http()
        .post("/api/auth/reauth")
        .set(authHeader(user))
        .send({ provider: "google", idToken: "other-id-token" })
        .expect(403);
      expect(foreign.body.errorCode).toBe("REAUTH_FAILED");
    });
  });

  describe("POST /api/auth/password/set", () => {
    const NEW_PASSWORD = "Fresh-Pass-1";

    it("answers 403 REAUTH_REQUIRED without a token", async () => {
      const user = await createSocialOnlyUser();

      const res = await http()
        .post("/api/auth/password/set")
        .set(authHeader(user))
        .send({ newPassword: NEW_PASSWORD })
        .expect(403);
      expect(res.body.errorCode).toBe("REAUTH_REQUIRED");
    });

    it("refuses user A's token for user B", async () => {
      const a = await createUser(ctx.module);
      const b = await createSocialOnlyUser();
      const token = await reauthWithPassword(a);

      const res = await http()
        .post("/api/auth/password/set")
        .set(authHeader(b))
        .send({ newPassword: NEW_PASSWORD, reauthToken: token })
        .expect(403);
      expect(res.body.errorCode).toBe("REAUTH_REQUIRED");
    });

    it("sets the password: login works with it, the change is logged, and the token can be reused", async () => {
      const user = await createSocialOnlyUser();
      const token = await reauthWithGoogle(user);

      const res = await http()
        .post("/api/auth/password/set")
        .set(authHeader(user))
        .send({ newPassword: NEW_PASSWORD, reauthToken: token })
        .expect(200);
      expect(res.body.hasPassword).toBe(true);
      expect(res.body.providers).toHaveLength(1);

      await http()
        .post("/api/auth/login")
        .send({ email: user.email, password: NEW_PASSWORD })
        .expect(200);

      const logs = await getPrisma().securityLog.count({
        where: { userId: user.id, eventType: "password_set" },
      });
      expect(logs).toBe(1);

      // Same token, still within its TTL: the guard lets it through and the
      // service answers that a password now exists.
      await http()
        .post("/api/auth/password/set")
        .set(authHeader(user))
        .send({ newPassword: "Other-Pass-1", reauthToken: token })
        .expect(409);
    });

    it("rejects a password that breaks the shared policy (400)", async () => {
      const user = await createSocialOnlyUser();
      const token = await reauthWithGoogle(user);

      await http()
        .post("/api/auth/password/set")
        .set(authHeader(user))
        .send({ newPassword: "short", reauthToken: token })
        .expect(400);
    });

    it("sets the password once for two concurrent calls", async () => {
      const user = await createSocialOnlyUser();
      const token = await reauthWithGoogle(user);

      const send = (newPassword: string) =>
        http()
          .post("/api/auth/password/set")
          .set(authHeader(user))
          .send({ newPassword, reauthToken: token });
      const [first, second] = await Promise.all([
        send("First-Pass-1"),
        send("Second-Pass-1"),
      ]);

      expect([first.status, second.status].sort()).toEqual([200, 409]);
      const logs = await getPrisma().securityLog.count({
        where: { userId: user.id, eventType: "password_set" },
      });
      expect(logs).toBe(1);
    });
  });

  describe("POST /api/auth/social/:provider/link and unlink", () => {
    const linksOf = (userId: string) =>
      getPrisma().oAuthAccount.findMany({
        where: { userId },
        select: { provider: true, providerUserId: true },
      });

    function stubApple(sub = "apple-sub-e2e") {
      jest.spyOn(apple, "verifyIdentityToken").mockResolvedValue({
        sub,
        email: "relay@privaterelay.appleid.com",
        isPrivateEmail: true,
        audience: "com.tarodan.app",
        issuedAt: Math.floor(Date.now() / 1000),
      });
    }

    it("answers 403 REAUTH_REQUIRED without a token, and links nothing", async () => {
      const user = await createUser(ctx.module);
      stubGoogle(undefined, "new-google-sub");

      const res = await http()
        .post("/api/auth/social/google/link")
        .set(authHeader(user))
        .send({ idToken: "native-id-token" })
        .expect(403);
      expect(res.body.errorCode).toBe("REAUTH_REQUIRED");
      expect(await linksOf(user.id)).toEqual([]);

      const unlink = await http()
        .post("/api/auth/social/google/unlink")
        .set(authHeader(user))
        .send({})
        .expect(403);
      expect(unlink.body.errorCode).toBe("REAUTH_REQUIRED");
    });

    it("links Google, logs it as manual, then unlinks it again for an account with a password", async () => {
      const user = await createUser(ctx.module);
      const token = await reauthWithPassword(user);
      stubGoogle(undefined, "new-google-sub");

      const linked = await http()
        .post("/api/auth/social/google/link")
        .set(authHeader(user))
        .send({ idToken: "native-id-token", reauthToken: token })
        .expect(200);
      expect(linked.body).toEqual({
        hasPassword: true,
        providers: [
          {
            provider: "google",
            // The provider e-mail, which may differ from the account's (D3).
            email: "g@example.com",
            linkedAt: expect.any(String),
          },
        ],
      });

      const unlinked = await http()
        .post("/api/auth/social/google/unlink")
        .set(authHeader(user))
        .send({ reauthToken: token })
        .expect(200);
      expect(unlinked.body).toEqual({ hasPassword: true, providers: [] });

      const logs = await getPrisma().securityLog.findMany({
        where: { userId: user.id, eventType: { startsWith: "social_" } },
        select: { eventType: true, details: true },
        orderBy: { createdAt: "asc" },
      });
      expect(logs).toEqual([
        {
          eventType: "social_linked",
          details: expect.objectContaining({ source: "manual" }),
        },
        {
          eventType: "social_unlinked",
          details: expect.objectContaining({ source: "manual" }),
        },
      ]);
    });

    it("answers 400 PROVIDER_TOKEN_INVALID, not 401, for a refused Google token", async () => {
      const user = await createUser(ctx.module);
      const token = await reauthWithPassword(user);

      const res = await http()
        .post("/api/auth/social/google/link")
        .set(authHeader(user))
        .send({ idToken: "not-a-google-token", reauthToken: token })
        .expect(400);
      expect(res.body.errorCode).toBe("PROVIDER_TOKEN_INVALID");
    });

    it("answers 409 for an identity linked to another account and for a second Google", async () => {
      const owner = await createSocialOnlyUser();
      const user = await createUser(ctx.module);
      const token = await reauthWithPassword(user);

      stubGoogle(undefined, SUB);
      const taken = await http()
        .post("/api/auth/social/google/link")
        .set(authHeader(user))
        .send({ idToken: "native-id-token", reauthToken: token })
        .expect(409);
      expect(taken.body.errorCode).toBe("PROVIDER_LINKED_TO_OTHER_ACCOUNT");
      expect(JSON.stringify(taken.body)).not.toContain(owner.email);

      stubGoogle(undefined, "first-google-sub");
      await http()
        .post("/api/auth/social/google/link")
        .set(authHeader(user))
        .send({ idToken: "native-id-token", reauthToken: token })
        .expect(200);
      stubGoogle(undefined, "second-google-sub");
      const second = await http()
        .post("/api/auth/social/google/link")
        .set(authHeader(user))
        .send({ idToken: "native-id-token", reauthToken: token })
        .expect(409);
      expect(second.body.errorCode).toBe("PROVIDER_ALREADY_LINKED");
      expect(await linksOf(user.id)).toHaveLength(1);
    });

    it("answers 409 LAST_SIGN_IN_METHOD for the only Google link and 404 for an unlinked provider", async () => {
      const user = await createSocialOnlyUser();
      const token = await reauthWithGoogle(user);

      const last = await http()
        .post("/api/auth/social/google/unlink")
        .set(authHeader(user))
        .send({ reauthToken: token })
        .expect(409);
      expect(last.body.errorCode).toBe("LAST_SIGN_IN_METHOD");
      expect(await linksOf(user.id)).toHaveLength(1);

      const missing = await http()
        .post("/api/auth/social/apple/unlink")
        .set(authHeader(user))
        .send({ reauthToken: token })
        .expect(404);
      expect(missing.body.errorCode).toBe("PROVIDER_NOT_LINKED");

      await http()
        .post("/api/auth/social/facebook/unlink")
        .set(authHeader(user))
        .send({ reauthToken: token })
        .expect(400);
    });

    it("links Apple to a Google-only account, then an Apple unlink queues the token revocation", async () => {
      const user = await createSocialOnlyUser();
      const token = await reauthWithGoogle(user);
      stubApple();

      await http()
        .post("/api/auth/social/apple/link")
        .set(authHeader(user))
        .send({ identityToken: "apple-identity-token", reauthToken: token })
        .expect(200);
      // A stored Apple token, as a mobile sign-in or link leaves behind.
      const stored = await getPrisma().appleSignInToken.create({
        data: {
          userId: user.id,
          clientId: "com.tarodan.app",
          refreshTokenEncrypted: "encrypted",
        },
      });

      const res = await http()
        .post("/api/auth/social/apple/unlink")
        .set(authHeader(user))
        .send({ reauthToken: token })
        .expect(200);
      expect(
        res.body.providers.map((p: { provider: string }) => p.provider),
      ).toEqual(["google"]);

      const row = await getPrisma().appleSignInToken.findUnique({
        where: { id: stored.id },
      });
      expect(row?.revokeRequestedAt).not.toBeNull();
      const jobs = await getPrisma().outboxEvent.count({
        where: { type: OUTBOX_APPLE_TOKEN_REVOKE },
      });
      expect(jobs).toBe(1);
    });

    it("keeps Google when Google and Apple are unlinked at the same time", async () => {
      const user = await createSocialOnlyUser();
      await getPrisma().oAuthAccount.create({
        data: {
          provider: "apple",
          providerUserId: "apple-sub-e2e",
          email: user.email,
          userId: user.id,
        },
      });
      const token = await reauthWithGoogle(user);

      const send = (provider: string) =>
        http()
          .post(`/api/auth/social/${provider}/unlink`)
          .set(authHeader(user))
          .send({ reauthToken: token });
      const [appleRes, googleRes] = await Promise.all([
        send("apple"),
        send("google"),
      ]);

      expect(appleRes.status).toBe(200);
      expect(googleRes.status).toBe(409);
      expect(await linksOf(user.id)).toEqual([
        { provider: "google", providerUserId: SUB },
      ]);
    });

    it("stores one link when two accounts race for the same Google identity", async () => {
      const a = await createUser(ctx.module);
      const b = await createUser(ctx.module);
      const tokenA = await reauthWithPassword(a);
      const tokenB = await reauthWithPassword(b);
      stubGoogle(undefined, "contested-sub");

      const send = (user: CreatedTestUser, token: string) =>
        http()
          .post("/api/auth/social/google/link")
          .set(authHeader(user))
          .send({ idToken: "native-id-token", reauthToken: token });
      const results = await Promise.all([send(a, tokenA), send(b, tokenB)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const loser = results.find((r) => r.status === 409);
      expect(loser?.body.errorCode).toBe("PROVIDER_LINKED_TO_OTHER_ACCOUNT");
      expect(
        await getPrisma().oAuthAccount.count({
          where: { providerUserId: "contested-sub" },
        }),
      ).toBe(1);
    });
  });
});
