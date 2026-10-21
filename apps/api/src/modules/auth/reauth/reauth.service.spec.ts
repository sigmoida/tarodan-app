import { HttpException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import {
  REAUTH_FAILURE_WINDOW_SECONDS,
  REAUTH_MAX_FAILURES,
  REAUTH_PROVIDER_MAX_AGE_SECONDS,
  REAUTH_TOKEN_TTL_SECONDS,
  ReauthService,
} from "./reauth.service";
import type { ReauthDto } from "./dto/reauth.dto";

const USER = "user-a";
const OTHER_USER = "user-b";
const PASSWORD = "Correct-Pass-1";
const SUB = "provider-sub-1";

/** In-memory stand-in for the CacheService calls the step-up makes. */
function createFakeCache() {
  const values = new Map<string, string>();
  const ttls = new Map<string, number>();
  let down = false;
  return {
    values,
    ttls,
    setDown(value: boolean) {
      down = value;
    },
    get: jest.fn(async (key: string) => {
      if (down) return null;
      const raw = values.get(key);
      return raw === undefined ? null : JSON.parse(raw);
    }),
    setIfAbsent: jest.fn(
      async (key: string, ttl: number, value: unknown = 1) => {
        if (down || values.has(key)) return false;
        values.set(key, JSON.stringify(value));
        ttls.set(key, ttl);
        return true;
      },
    ),
    incr: jest.fn(async (key: string) => {
      if (down) return 0;
      const next = Number(values.get(key) ?? "0") + 1;
      values.set(key, String(next));
      if (!ttls.has(key)) ttls.set(key, -1);
      return next;
    }),
    ttl: jest.fn(async (key: string) =>
      values.has(key) ? (ttls.get(key) ?? -1) : -2,
    ),
    expire: jest.fn(async (key: string, seconds: number) => {
      ttls.set(key, seconds);
      return true;
    }),
    del: jest.fn(async (key: string) => {
      values.delete(key);
      ttls.delete(key);
    }),
  };
}

const tokenKey = (token: string) =>
  `reauth:${crypto.createHash("sha256").update(token).digest("hex")}`;
const nowSeconds = () => Math.floor(Date.now() / 1000);

describe("ReauthService", () => {
  let cache: ReturnType<typeof createFakeCache>;
  let user: { passwordHash: string | null; deletedAt: Date | null } | null;
  let links: Array<{
    provider: string;
    providerUserId: string;
    userId: string;
  }>;
  let prisma: {
    user: { findUnique: jest.Mock };
    oAuthAccount: { findUnique: jest.Mock };
    securityLog: { create: jest.Mock };
    platformSetting: { findUnique: jest.Mock };
  };
  const google = {
    exchangeCodeForIdToken: jest.fn(),
    verifyIdToken: jest.fn(),
  };
  const apple = { verifyIdentityToken: jest.fn() };
  const sentry = { setTag: jest.fn(), captureEvent: jest.fn() };
  let service: ReauthService;
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    cache = createFakeCache();
    user = { passwordHash, deletedAt: null };
    links = [];
    prisma = {
      user: { findUnique: jest.fn(async () => user) },
      oAuthAccount: {
        findUnique: jest.fn(async ({ where }) => {
          const key = where.provider_providerUserId;
          const link = links.find(
            (l) =>
              l.provider === key.provider &&
              l.providerUserId === key.providerUserId,
          );
          return link ? { userId: link.userId } : null;
        }),
      },
      securityLog: { create: jest.fn().mockResolvedValue({}) },
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    service = new ReauthService(
      prisma as never,
      cache as never,
      google as never,
      apple as never,
      sentry as never,
    );
  });

  const socialOnly = (provider: "google" | "apple", owner = USER) => {
    user = { passwordHash: null, deletedAt: null };
    links.push({ provider, providerUserId: SUB, userId: owner });
  };

  const googleIdentity = (issuedAt: number | undefined = nowSeconds()) =>
    google.verifyIdToken.mockResolvedValue({
      sub: SUB,
      email: "a@example.com",
      issuedAt,
    });

  /** The thrown error, so its status and payload can be asserted. */
  const failure = async (proof: Partial<ReauthDto>) => {
    try {
      await service.reauthenticate(USER, proof as ReauthDto);
    } catch (error) {
      return error as HttpException;
    }
    throw new Error("expected the step-up to fail");
  };

  const expectFailed = (error: HttpException) => {
    expect(error.getStatus()).toBe(403);
    expect(error.getResponse()).toMatchObject({
      i18nKey: "server.auth.reauthFailed",
      errorCode: "REAUTH_FAILED",
    });
  };

  describe("password proof", () => {
    it("issues an opaque token bound to the user for 5 minutes", async () => {
      const before = Date.now();
      const result = await service.reauthenticate(USER, {
        password: PASSWORD,
      } as ReauthDto);

      expect(result.reauthToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const expiresAt = new Date(result.expiresAt).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(
        before + REAUTH_TOKEN_TTL_SECONDS * 1000,
      );
      expect(expiresAt).toBeLessThanOrEqual(
        Date.now() + REAUTH_TOKEN_TTL_SECONDS * 1000,
      );

      // Stored by its hash only, with the TTL, bound to the user.
      const key = tokenKey(result.reauthToken);
      expect(cache.values.get(key)).toBe(JSON.stringify({ userId: USER }));
      expect(cache.ttls.get(key)).toBe(REAUTH_TOKEN_TTL_SECONDS);
      expect([...cache.values.keys()].join()).not.toContain(result.reauthToken);
      expect(sentry.setTag).toHaveBeenCalledWith("auth.flow", "reauth");
    });

    it("answers 403 REAUTH_FAILED for a wrong password and logs it without the password", async () => {
      const error = await failure({ password: "Wrong-Pass-1" });

      expectFailed(error);
      expect(cache.setIfAbsent).not.toHaveBeenCalled();
      expect(prisma.securityLog.create).toHaveBeenCalledTimes(1);
      const logged = prisma.securityLog.create.mock.calls[0][0].data;
      expect(logged).toMatchObject({
        eventType: "reauth_failed",
        userId: USER,
        details: { method: "password", flow: "reauth" },
      });
      expect(JSON.stringify(logged)).not.toContain("Wrong-Pass-1");
    });

    it("treats a password proof from an account without a password as a failure", async () => {
      socialOnly("google");
      expectFailed(await failure({ password: PASSWORD }));
    });

    it("refuses a deleted account", async () => {
      user = { passwordHash, deletedAt: new Date() };
      expectFailed(await failure({ password: PASSWORD }));
    });

    it("refuses a provider proof from an account with a password (400, not counted)", async () => {
      links.push({ provider: "google", providerUserId: SUB, userId: USER });
      googleIdentity();

      const error = await failure({ provider: "google", idToken: "id" });

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toMatchObject({
        i18nKey: "server.auth.reauthMethodNotAllowed",
        errorCode: "REAUTH_METHOD_NOT_ALLOWED",
      });
      expect(google.verifyIdToken).not.toHaveBeenCalled();
      expect(cache.incr).not.toHaveBeenCalled();
    });
  });

  describe("lockout", () => {
    it("locks after 5 failures in the window: the 6th attempt is 429 even with the right password", async () => {
      for (let i = 1; i <= REAUTH_MAX_FAILURES; i++) {
        expectFailed(await failure({ password: "Wrong-Pass-1" }));
      }
      // The window starts with the first failure.
      expect(cache.expire).toHaveBeenCalledWith(
        `reauth:failures:${USER}`,
        REAUTH_FAILURE_WINDOW_SECONDS,
      );

      const locked = await failure({ password: PASSWORD });
      expect(locked.getStatus()).toBe(429);
      expect(locked.getResponse()).toMatchObject({
        i18nKey: "server.auth.reauthLocked",
        errorCode: "REAUTH_LOCKED",
      });
      expect(cache.setIfAbsent).not.toHaveBeenCalled();
    });

    it("keeps a fixed window: later attempts, also while locked, do not extend it", async () => {
      for (let i = 1; i <= REAUTH_MAX_FAILURES; i++) {
        await failure({ password: "Wrong-Pass-1" });
      }
      expect((await failure({ password: PASSWORD })).getStatus()).toBe(429);
      expect((await failure({ password: PASSWORD })).getStatus()).toBe(429);

      // A sliding window (expire on every attempt) would keep a user who
      // keeps retrying locked for good.
      expect(cache.expire).toHaveBeenCalledTimes(1);
    });

    it("lets the user prove itself again once the window has passed", async () => {
      for (let i = 1; i <= REAUTH_MAX_FAILURES; i++) {
        await failure({ password: "Wrong-Pass-1" });
      }
      expect((await failure({ password: PASSWORD })).getStatus()).toBe(429);

      // Redis drops the counter when its TTL runs out.
      cache.values.delete(`reauth:failures:${USER}`);
      cache.ttls.delete(`reauth:failures:${USER}`);

      const result = await service.reauthenticate(USER, {
        password: PASSWORD,
      } as ReauthDto);
      expect(await service.isValidToken(USER, result.reauthToken)).toBe(true);
    });

    it("counts the failures per user: one user's lockout does not lock another", async () => {
      for (let i = 1; i <= REAUTH_MAX_FAILURES; i++) {
        await failure({ password: "Wrong-Pass-1" });
      }

      const result = await service.reauthenticate(OTHER_USER, {
        password: PASSWORD,
      } as ReauthDto);
      expect(result.reauthToken).toBeTruthy();
    });

    it("lets only 5 of many parallel attempts reach the comparison", async () => {
      const compare = jest.spyOn(bcrypt, "compare");

      const results = await Promise.allSettled(
        Array.from({ length: 12 }, () =>
          service.reauthenticate(USER, {
            password: "Wrong-Pass-1",
          } as ReauthDto),
        ),
      );

      const statuses = results.map((r) =>
        ((r as PromiseRejectedResult).reason as HttpException).getStatus(),
      );
      expect(statuses.filter((s) => s === 403)).toHaveLength(
        REAUTH_MAX_FAILURES,
      );
      expect(statuses.filter((s) => s === 429)).toHaveLength(
        12 - REAUTH_MAX_FAILURES,
      );
      expect(compare).toHaveBeenCalledTimes(REAUTH_MAX_FAILURES);
      compare.mockRestore();
    });

    it("checks no proof with Redis down (503), so a right guess reads like a wrong one", async () => {
      const compare = jest.spyOn(bcrypt, "compare");
      cache.setDown(true);

      const wrong = await failure({ password: "Wrong-Pass-1" });
      const right = await failure({ password: PASSWORD });

      for (const error of [wrong, right]) {
        expect(error.getStatus()).toBe(503);
        expect(error.getResponse()).toMatchObject({
          errorCode: "REAUTH_UNAVAILABLE",
        });
      }
      expect(compare).not.toHaveBeenCalled();
      compare.mockRestore();
    });

    it("logs reauth_locked and warns Sentry once, when the limit is reached", async () => {
      for (let i = 1; i <= REAUTH_MAX_FAILURES; i++) {
        await failure({ password: "Wrong-Pass-1" });
      }

      const events = prisma.securityLog.create.mock.calls.map(
        ([arg]) => arg.data.eventType,
      );
      expect(events.filter((e) => e === "reauth_failed")).toHaveLength(5);
      expect(events.filter((e) => e === "reauth_locked")).toHaveLength(1);
      expect(sentry.captureEvent).toHaveBeenCalledTimes(1);
      expect(sentry.captureEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "reauth_locked",
          level: "warning",
          user: { id: USER },
        }),
      );
    });

    it("repairs a failure counter left without a TTL", async () => {
      cache.values.set(`reauth:failures:${USER}`, "2");
      cache.ttls.set(`reauth:failures:${USER}`, -1);

      await failure({ password: "Wrong-Pass-1" });

      expect(cache.ttls.get(`reauth:failures:${USER}`)).toBe(
        REAUTH_FAILURE_WINDOW_SECONDS,
      );
    });

    it("clears the failures after a successful proof", async () => {
      await failure({ password: "Wrong-Pass-1" });
      await service.reauthenticate(USER, { password: PASSWORD } as ReauthDto);

      expect(cache.values.has(`reauth:failures:${USER}`)).toBe(false);
    });
  });

  describe("provider proof (account without a password)", () => {
    it("accepts a fresh Google id_token of the linked identity", async () => {
      socialOnly("google");
      googleIdentity();

      const result = await service.reauthenticate(USER, {
        provider: "google",
        idToken: "id",
      } as ReauthDto);

      expect(await service.isValidToken(USER, result.reauthToken)).toBe(true);
      expect(google.verifyIdToken).toHaveBeenCalledWith("id");
    });

    it("exchanges a Google web auth code first", async () => {
      socialOnly("google");
      google.exchangeCodeForIdToken.mockResolvedValue("exchanged-id");
      googleIdentity();

      await service.reauthenticate(USER, {
        provider: "google",
        code: "web-code",
      } as ReauthDto);

      expect(google.exchangeCodeForIdToken).toHaveBeenCalledWith("web-code");
      expect(google.verifyIdToken).toHaveBeenCalledWith("exchanged-id");
    });

    it("accepts a fresh Apple identity token of the linked identity", async () => {
      socialOnly("apple");
      apple.verifyIdentityToken.mockResolvedValue({
        sub: SUB,
        email: "a@privaterelay.appleid.com",
        isPrivateEmail: true,
        audience: "com.tarodan.app",
        issuedAt: nowSeconds(),
      });

      const result = await service.reauthenticate(USER, {
        provider: "apple",
        identityToken: "apple-id",
      } as ReauthDto);

      expect(result.reauthToken).toBeTruthy();
    });

    it("refuses an identity linked to another account", async () => {
      socialOnly("google", OTHER_USER);
      googleIdentity();
      expectFailed(await failure({ provider: "google", idToken: "id" }));
    });

    it("refuses an identity that is not linked at all", async () => {
      user = { passwordHash: null, deletedAt: null };
      googleIdentity();
      expectFailed(await failure({ provider: "google", idToken: "id" }));
    });

    it("refuses a linked identity of the other provider", async () => {
      socialOnly("apple");
      googleIdentity();
      expectFailed(await failure({ provider: "google", idToken: "id" }));
    });

    it("refuses a sign-in older than 5 minutes", async () => {
      socialOnly("google");
      googleIdentity(nowSeconds() - REAUTH_PROVIDER_MAX_AGE_SECONDS - 5);
      expectFailed(await failure({ provider: "google", idToken: "id" }));
    });

    it("refuses a token without an issue time", async () => {
      socialOnly("google");
      google.verifyIdToken.mockResolvedValue({ sub: SUB, email: "a@x.y" });
      expectFailed(await failure({ provider: "google", idToken: "id" }));
    });

    it("turns a provider 401 into 403 REAUTH_FAILED and counts it", async () => {
      socialOnly("google");
      google.verifyIdToken.mockRejectedValue(new UnauthorizedException());

      const error = await failure({ provider: "google", idToken: "bad" });

      expectFailed(error);
      expect(cache.incr).toHaveBeenCalledTimes(1);
    });
  });

  describe("token check", () => {
    const issue = async () =>
      (
        await service.reauthenticate(USER, {
          password: PASSWORD,
        } as ReauthDto)
      ).reauthToken;

    it("refuses user A's token for user B", async () => {
      const token = await issue();
      expect(await service.isValidToken(OTHER_USER, token)).toBe(false);
      expect(await service.isValidToken(USER, token)).toBe(true);
    });

    it("refuses an expired, unknown, empty, oversized or non-string token", async () => {
      const token = await issue();
      cache.values.delete(tokenKey(token)); // the TTL ran out

      expect(await service.isValidToken(USER, token)).toBe(false);
      expect(await service.isValidToken(USER, "unknown")).toBe(false);
      expect(await service.isValidToken(USER, "")).toBe(false);
      expect(await service.isValidToken(USER, "x".repeat(129))).toBe(false);
      expect(await service.isValidToken(USER, undefined)).toBe(false);
      expect(await service.isValidToken(USER, 42)).toBe(false);
    });

    it("can be used several times within the TTL", async () => {
      const token = await issue();
      expect(await service.isValidToken(USER, token)).toBe(true);
      expect(await service.isValidToken(USER, token)).toBe(true);
    });

    it("fails closed with Redis down", async () => {
      const token = await issue();
      cache.setDown(true);
      expect(await service.isValidToken(USER, token)).toBe(false);
    });

    it("issues no token when it cannot be stored (503, not a token that never works)", async () => {
      cache.setIfAbsent.mockResolvedValueOnce(false);

      const error = await failure({ password: PASSWORD });

      expect(error.getStatus()).toBe(503);
      expect(error.getResponse()).toMatchObject({
        i18nKey: "server.auth.reauthUnavailable",
        errorCode: "REAUTH_UNAVAILABLE",
      });
    });
  });

  describe("requirement setting for account deletion and e-mail change", () => {
    const withSetting = (settingValue: string | null) =>
      prisma.platformSetting.findUnique.mockResolvedValue(
        settingValue === null ? null : { settingValue },
      );

    it("is off without a row (the default, mobile 1.0.5 sends no token)", async () => {
      withSetting(null);

      expect(await service.isRequiredForSensitiveActions()).toBe(false);
      expect(prisma.platformSetting.findUnique).toHaveBeenCalledWith({
        where: { settingKey: "auth_require_reauth_for_sensitive_actions" },
        select: { settingValue: true },
      });
    });

    it.each(["true", " TRUE ", "True"])("is on for %p", async (value) => {
      withSetting(value);
      expect(await service.isRequiredForSensitiveActions()).toBe(true);
    });

    it.each(["false", "", "1", "yes", "on"])("is off for %p", async (value) => {
      withSetting(value);
      expect(await service.isRequiredForSensitiveActions()).toBe(false);
    });

    it("reads the setting on every call, so switching it on applies at once", async () => {
      withSetting("false");
      expect(await service.isRequiredForSensitiveActions()).toBe(false);
      withSetting("true");
      expect(await service.isRequiredForSensitiveActions()).toBe(true);
    });

    it("throws when the setting cannot be read (never an implicit off)", async () => {
      prisma.platformSetting.findUnique.mockRejectedValue(new Error("db down"));

      await expect(service.isRequiredForSensitiveActions()).rejects.toThrow(
        "db down",
      );
    });
  });
});
