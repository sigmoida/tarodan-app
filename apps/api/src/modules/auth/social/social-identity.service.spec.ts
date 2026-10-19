// Social sign-in -> account resolution (W2: pre-account-takeover).
//
// Runs the real AuthService, SocialLoginService, SocialIdentityService,
// SecurityService and ConsentService against a small in-memory database, so
// the assertions are about the resulting state (rows, tokens, consents) and
// the attacker's password login afterwards, not about which Prisma call ran.
import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bull";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { ACCOUNT_REQUIRED_CONSENTS, CONSENT_DOCUMENTS } from "@tarodan/types";
import { QUEUE_NAMES } from "../../../workers/constants";
import { PrismaService } from "../../../prisma";
import { AuthService } from "../auth.service";
import { AuthTokenService } from "../auth-token.service";
import { AuthRegistrationService } from "../auth-registration.service";
import { AuthPasswordService } from "../auth-password.service";
import { AuthLoginService } from "../auth-login.service";
import { SocialLoginService } from "./social-login.service";
import {
  SocialIdentityService,
  type SocialProvider,
} from "./social-identity.service";
import { GoogleAuthService } from "./google-auth.service";
import { AppleAuthService } from "./apple-auth.service";
import { AppleTokenService } from "./apple-token.service";
import { NotificationService } from "../../notification/notification.service";
import { PushTokenRevocationService } from "../../notification/push-token/push-token-revocation.service";
import { CacheService } from "../../cache/cache.service";
import { StorageService } from "../../storage/storage.service";
import { SecurityService } from "../../security/security.service";
import { NewsletterService } from "../../marketing/newsletter.service";
import { ConsentService } from "../../consent/consent.service";
import { LegalIdentityService } from "../../legal-identity/legal-identity.service";
import { SentryService } from "../../sentry/sentry.service";

type Row = Record<string, any>;

interface State {
  users: Row[];
  links: Row[];
  refreshTokens: Row[];
  pushTokens: Row[];
  twoFactor: Row[];
  resetTokens: Row[];
  verifyTokens: Row[];
  changeTokens: Row[];
  phoneTokens: Row[];
  consents: Row[];
  securityLogs: Row[];
  /** User ids that have an AdminUser row (staff). */
  staff: string[];
}

const emptyState = (): State => ({
  users: [],
  links: [],
  refreshTokens: [],
  pushTokens: [],
  twoFactor: [],
  resetTokens: [],
  verifyTokens: [],
  changeTokens: [],
  phoneTokens: [],
  consents: [],
  securityLogs: [],
  staff: [],
});

function uniqueViolation(target: string[]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target },
  });
}

/** The Prisma surface the sign-in paths use, over `State`. */
function createFakeDb() {
  let state = emptyState();
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}${++seq}`;

  const byUser = (rows: Row[], userId: string) =>
    rows.filter((r) => r.userId === userId);
  const deleteByUser = (key: keyof State) =>
    jest.fn(async ({ where }: any) => {
      const before = (state[key] as Row[]).length;
      (state as any)[key] = (state[key] as Row[]).filter(
        (r) => r.userId !== where.userId,
      );
      return { count: before - (state[key] as Row[]).length };
    });
  const decorate = (user: Row | undefined) =>
    user
      ? {
          ...user,
          membership: null,
          twoFactorSecret:
            state.twoFactor.find((t) => t.userId === user.id) ?? null,
          adminUser: state.staff.includes(user.id) ? { id: "admin" } : null,
        }
      : null;

  const db: any = {
    // Row lock (no rows needed) and the case-insensitive e-mail lookup.
    $queryRaw: jest.fn(
      async (strings: TemplateStringsArray, ...values: any[]) => {
        if (!strings.join("?").includes("lower(email)")) return [];
        const [email, limit] = values;
        return state.users
          .filter(
            (u) =>
              u.email.toLowerCase() === email.toLowerCase() &&
              u.deletedAt === null,
          )
          .slice(0, limit)
          .map((u) => ({ id: u.id }));
      },
    ),
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone(state);
      try {
        return await fn(db);
      } catch (error) {
        state = snapshot; // rollback
        throw error;
      }
    }),
    oAuthAccount: {
      findUnique: jest.fn(async ({ where }: any) => {
        const key = where.provider_providerUserId;
        const link = state.links.find(
          (l) =>
            l.provider === key.provider &&
            l.providerUserId === key.providerUserId,
        );
        if (!link) return null;
        return {
          ...link,
          user: decorate(state.users.find((u) => u.id === link.userId)),
        };
      }),
      create: jest.fn(async ({ data }: any) => {
        if (
          state.links.some(
            (l) =>
              l.provider === data.provider &&
              l.providerUserId === data.providerUserId,
          )
        ) {
          throw uniqueViolation(["provider", "provider_user_id"]);
        }
        const row = { id: nextId("oa"), createdAt: new Date(), ...data };
        state.links.push(row);
        return row;
      }),
    },
    user: {
      findUnique: jest.fn(async ({ where }: any) => {
        const user = state.users.find((u) =>
          where.id
            ? u.id === where.id
            : where.email
              ? u.email === where.email
              : u.username === where.username,
        );
        return decorate(user);
      }),
      findMany: jest.fn(async ({ where }: any) =>
        state.users
          .filter((u) => where.id.in.includes(u.id) && u.deletedAt === null)
          .map(decorate),
      ),
      create: jest.fn(async ({ data }: any) => {
        if (state.users.some((u) => u.email === data.email)) {
          throw uniqueViolation(["email"]);
        }
        const row = { ...baseUserRow(nextId("created-u")), ...data };
        state.users.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) => {
        const user = state.users.find((u) => u.id === where.id);
        if (!user) throw new Error("not found");
        Object.assign(user, data);
        return user;
      }),
    },
    refreshToken: {
      create: jest.fn(async ({ data }: any) => {
        const row = { id: nextId("rt"), revokedAt: null, ...data };
        state.refreshTokens.push(row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = byUser(state.refreshTokens, where.userId).filter(
          (r) => r.revokedAt === null,
        );
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
    },
    pushToken: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const rows = byUser(state.pushTokens, where.userId).filter(
          (r) => r.isActive,
        );
        rows.forEach((r) => Object.assign(r, data));
        return { count: rows.length };
      }),
    },
    twoFactorSecret: { deleteMany: deleteByUser("twoFactor") },
    passwordResetToken: { deleteMany: deleteByUser("resetTokens") },
    emailVerificationToken: { deleteMany: deleteByUser("verifyTokens") },
    emailChangeToken: { deleteMany: deleteByUser("changeTokens") },
    phoneVerificationToken: { deleteMany: deleteByUser("phoneTokens") },
    consentRecord: {
      findMany: jest.fn(async ({ where }: any) =>
        byUser(state.consents, where.userId).filter((c) =>
          where.document.in.includes(c.document),
        ),
      ),
      createMany: jest.fn(async ({ data }: any) => {
        data.forEach((row: Row, i: number) =>
          state.consents.push({
            ...row,
            // Strictly later than every earlier row (same-ms writes).
            createdAt: new Date(Date.now() + 1000 + i),
          }),
        );
        return { count: data.length };
      }),
    },
    securityLog: {
      create: jest.fn(async ({ data }: any) => {
        state.securityLogs.push(data);
        return data;
      }),
    },
  };

  return {
    db,
    get state() {
      return state;
    },
  };
}

function baseUserRow(id: string): Row {
  return {
    id,
    adminCode: `B-${id}`,
    username: `user_${id}`,
    usernameClaimedAt: null,
    email: `${id}@example.com`,
    phone: null,
    passwordHash: null,
    displayName: "Member",
    legalFirstName: null,
    legalLastName: null,
    nationalId: null,
    avatarUrl: null,
    isVerified: false,
    isEmailVerified: true,
    isPhoneVerified: false,
    isSeller: false,
    isTestAccount: false,
    sellerType: null,
    birthDate: null,
    isBanned: false,
    acceptsMarketingEmails: false,
    fcmToken: null,
    deletedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

const VICTIM_EMAIL = "victim@example.com";
const ATTACKER_PASSWORD = "Attacker-Pass-1";
const SUB = "provider-sub-1";

describe.each<SocialProvider>(["google", "apple"])(
  "social sign-in account resolution (%s)",
  (provider) => {
    let auth: AuthService;
    let consents: ConsentService;
    let fake: ReturnType<typeof createFakeDb>;
    const google = { verifyIdToken: jest.fn() };
    const apple = { verifyIdentityToken: jest.fn() };
    const newsletter = { syncUserConsent: jest.fn() };
    const sentry = { captureEvent: jest.fn() };

    /** Sign in with the provider, as the provider reports `email`. */
    const signIn = (email = VICTIM_EMAIL) => {
      if (provider === "google") {
        google.verifyIdToken.mockResolvedValue({
          sub: SUB,
          email,
          name: "Provider Name",
        });
        return auth.loginWithGoogle("id-token");
      }
      apple.verifyIdentityToken.mockResolvedValue({
        sub: SUB,
        email,
        isPrivateEmail: false,
        audience: "com.tarodan.app",
      });
      return auth.loginWithApple("identity-token", "Provider Name");
    };

    const addUser = (overrides: Row): Row => {
      const row = {
        ...baseUserRow(`u${fake.state.users.length + 1}`),
        ...overrides,
      };
      fake.state.users.push(row);
      return row;
    };

    /** An attacker's registration of the victim's address, never verified. */
    const addUnverifiedRegistration = async (): Promise<Row> => {
      const user = addUser({
        id: "attacker-row",
        email: VICTIM_EMAIL,
        username: "attacker",
        usernameClaimedAt: new Date("2026-01-01T00:00:00Z"),
        displayName: "Attacker",
        isSeller: true,
        sellerType: "individual",
        passwordHash: await bcrypt.hash(ATTACKER_PASSWORD, 4),
        isEmailVerified: false,
        phone: "+905551112233",
        isPhoneVerified: true,
        birthDate: new Date("1990-01-01"),
        legalFirstName: "Mallory",
        legalLastName: "Attacker",
        nationalId: "10000000146",
        acceptsMarketingEmails: true,
        fcmToken: "legacy-fcm",
      });
      const s = fake.state;
      s.refreshTokens.push({ userId: user.id, revokedAt: null });
      s.pushTokens.push({ userId: user.id, isActive: true });
      s.twoFactor.push({ userId: user.id, isEnabled: false, secret: "x" });
      s.resetTokens.push({ userId: user.id });
      s.verifyTokens.push({ userId: user.id });
      s.changeTokens.push({ userId: user.id });
      s.phoneTokens.push({ userId: user.id });
      for (const document of ACCOUNT_REQUIRED_CONSENTS) {
        s.consents.push({
          userId: user.id,
          document,
          version: CONSENT_DOCUMENTS[document].version,
          action: "granted",
          source: "registration",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        });
      }
      return user;
    };

    const linksOf = (userId: string) =>
      fake.state.links.filter((l) => l.userId === userId);

    beforeEach(async () => {
      jest.clearAllMocks();
      fake = createFakeDb();
      const moduleRef = await Test.createTestingModule({
        providers: [
          AuthService,
          AuthTokenService,
          AuthRegistrationService,
          AuthPasswordService,
          AuthLoginService,
          SocialLoginService,
          SocialIdentityService,
          SecurityService,
          PushTokenRevocationService,
          ConsentService,
          { provide: PrismaService, useValue: fake.db },
          {
            provide: JwtService,
            useValue: {
              signAsync: jest.fn().mockResolvedValue("tok"),
              decode: jest
                .fn()
                .mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
            },
          },
          {
            provide: ConfigService,
            useValue: {
              get: (k: string) => (k.includes("SECRET") ? "secret" : "15m"),
            },
          },
          { provide: NotificationService, useValue: {} },
          {
            provide: CacheService,
            useValue: { del: jest.fn(), set: jest.fn(), get: jest.fn() },
          },
          {
            provide: StorageService,
            useValue: { getPublicAssetUrl: jest.fn().mockReturnValue(null) },
          },
          { provide: GoogleAuthService, useValue: google },
          { provide: AppleAuthService, useValue: apple },
          {
            provide: AppleTokenService,
            useValue: {
              storeFromAuthorizationCode: jest
                .fn()
                .mockResolvedValue(undefined),
            },
          },
          { provide: NewsletterService, useValue: newsletter },
          { provide: SentryService, useValue: sentry },
          { provide: LegalIdentityService, useValue: {} },
          {
            provide: getQueueToken(QUEUE_NAMES.EMAIL),
            useValue: { add: jest.fn().mockResolvedValue({ id: "job" }) },
          },
        ],
      }).compile();
      auth = moduleRef.get(AuthService);
      consents = moduleRef.get(ConsentService);
    });

    it("an existing link signs in to the linked account and writes nothing", async () => {
      const user = addUser({ email: "other@example.com" });
      fake.state.links.push({ provider, providerUserId: SUB, userId: user.id });

      const res = await signIn();

      expect(res.user.id).toBe(user.id);
      expect(fake.state.links).toHaveLength(1);
      expect(fake.state.securityLogs).toEqual([]);
      expect(fake.db.user.findMany).not.toHaveBeenCalled();
    });

    it("a verified match is linked; its password and sessions stay", async () => {
      const passwordHash = await bcrypt.hash("Owner-Pass-1", 4);
      const owner = addUser({
        email: VICTIM_EMAIL,
        passwordHash,
        phone: "+905550000000",
      });
      fake.state.refreshTokens.push({ userId: owner.id, revokedAt: null });

      const res = await signIn();

      expect(res.user.id).toBe(owner.id);
      expect(linksOf(owner.id)).toEqual([
        expect.objectContaining({
          provider,
          providerUserId: SUB,
          email: VICTIM_EMAIL,
        }),
      ]);
      expect(fake.state.users[0]).toMatchObject({
        passwordHash,
        phone: "+905550000000",
      });
      expect(fake.state.refreshTokens[0].revokedAt).toBeNull();
      expect(fake.state.securityLogs).toEqual([
        expect.objectContaining({
          eventType: "social_linked",
          severity: "low",
          userId: owner.id,
          details: { provider, flow: "social_login", mode: "link" },
        }),
      ]);
      expect(sentry.captureEvent).not.toHaveBeenCalled();
      // The owner's password still works.
      await expect(
        auth.login({ email: VICTIM_EMAIL, password: "Owner-Pass-1" }),
      ).resolves.toHaveProperty("tokens");
    });

    it("an unverified match is taken over: every unproven credential and datum is cleared", async () => {
      const attacker = await addUnverifiedRegistration();
      // Before: the attacker cannot sign in (unverified).
      await expect(
        auth.login({ email: VICTIM_EMAIL, password: ATTACKER_PASSWORD }),
      ).rejects.toMatchObject({
        response: { errorCode: "EMAIL_NOT_VERIFIED" },
      });

      const res = await signIn();

      expect(res.user.id).toBe(attacker.id);
      expect(res.tokens.accessToken).toBe("tok");
      const row = fake.state.users[0];
      expect(row).toMatchObject({
        id: attacker.id,
        passwordHash: null,
        isEmailVerified: true,
        phone: null,
        isPhoneVerified: false,
        birthDate: null,
        legalFirstName: null,
        legalLastName: null,
        nationalId: null,
        acceptsMarketingEmails: false,
        fcmToken: null,
        usernameClaimedAt: null,
        isSeller: false,
        sellerType: null,
        // Kept: the row identity and the public names.
        username: "attacker",
        displayName: "Attacker",
        email: VICTIM_EMAIL,
      });
      const s = fake.state;
      // The attacker's tokens are revoked; only the new session is live.
      expect(
        s.refreshTokens.filter((t) => t.userId === attacker.id && !t.revokedAt),
      ).toHaveLength(1);
      expect(s.pushTokens.every((t) => !t.isActive)).toBe(true);
      expect(s.twoFactor).toEqual([]);
      expect(s.resetTokens).toEqual([]);
      expect(s.verifyTokens).toEqual([]);
      expect(s.changeTokens).toEqual([]);
      expect(s.phoneTokens).toEqual([]);
      expect(linksOf(attacker.id)).toHaveLength(1);
      // Consents: the history stays, each grant is followed by a withdrawal,
      // so the re-consent gate asks the new owner.
      const withdrawals = s.consents.filter((c) => c.action === "withdrawn");
      expect(withdrawals.map((c) => c.document).sort()).toEqual(
        [...ACCOUNT_REQUIRED_CONSENTS, "marketing"].sort(),
      );
      expect(withdrawals.every((c) => c.source === "social_link_reset")).toBe(
        true,
      );
      expect(s.consents.filter((c) => c.action === "granted")).toHaveLength(
        ACCOUNT_REQUIRED_CONSENTS.length,
      );
      expect(
        (await consents.getPending(attacker.id)).map((p) => p.document).sort(),
      ).toEqual([...ACCOUNT_REQUIRED_CONSENTS].sort());
      expect(newsletter.syncUserConsent).toHaveBeenCalledWith(
        VICTIM_EMAIL,
        false,
      );
      expect(s.securityLogs).toEqual([
        expect.objectContaining({
          eventType: "social_link_reset",
          severity: "high",
          userId: attacker.id,
        }),
      ]);
      expect(sentry.captureEvent).toHaveBeenCalledWith({
        message: "social_link_reset",
        level: "warning",
        tags: { provider, flow: "social_login" },
        user: { id: attacker.id },
      });

      // After: the attacker's password no longer opens the account, even
      // though the e-mail is now verified.
      await expect(
        auth.login({ email: VICTIM_EMAIL, password: ATTACKER_PASSWORD }),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.auth.invalidCredentials" },
      });
    });

    it("heals a legacy link to a still-unverified account: only the unproven password goes", async () => {
      // The old Apple path linked without verifying and gave the owner
      // sessions on this row, so what is on it now may be the owner's.
      const row = await addUnverifiedRegistration();
      fake.state.links.push({ provider, providerUserId: SUB, userId: row.id });

      await signIn();

      expect(fake.state.users[0]).toMatchObject({
        passwordHash: null,
        isEmailVerified: true,
        phone: "+905551112233",
        nationalId: "10000000146",
        acceptsMarketingEmails: true,
      });
      const s = fake.state;
      expect(s.refreshTokens.filter((t) => !t.revokedAt)).toHaveLength(2);
      expect(s.pushTokens.every((t) => t.isActive)).toBe(true);
      expect(s.consents.some((c) => c.action === "withdrawn")).toBe(false);
      expect(s.resetTokens).toEqual([]);
      expect(s.verifyTokens).toEqual([]);
      expect(s.links).toHaveLength(1);
      expect(s.securityLogs).toEqual([
        expect.objectContaining({
          eventType: "social_link_reset",
          details: { provider, flow: "social_login", mode: "heal" },
        }),
      ]);
      expect(newsletter.syncUserConsent).not.toHaveBeenCalled();
      await expect(
        auth.login({ email: VICTIM_EMAIL, password: ATTACKER_PASSWORD }),
      ).rejects.toMatchObject({
        response: { i18nKey: "server.auth.invalidCredentials" },
      });
    });

    it.each([
      [
        "staff",
        (user: Row) => fake.state.staff.push(user.id),
        {
          i18nKey: "server.auth.staffAccountCustomerLogin",
          errorCode: "STAFF_ACCOUNT",
        },
      ],
      [
        "banned",
        (user: Row) => Object.assign(user, { isBanned: true }),
        { i18nKey: "server.auth.accountSuspended" },
      ],
    ])(
      "a %s match gets no link and nothing is reset",
      async (_kind, mark, response) => {
        const attacker = await addUnverifiedRegistration();
        mark(attacker);
        const before = structuredClone(fake.state);

        await expect(signIn()).rejects.toMatchObject({ response });

        expect(fake.state.links).toEqual([]);
        expect(fake.state.users).toEqual(before.users);
        expect(fake.state.refreshTokens).toEqual(before.refreshTokens);
        expect(fake.state.consents).toEqual(before.consents);
        expect(fake.state.securityLogs).toEqual([]);
      },
    );

    it("a deleted row is never matched: a new account is created instead", async () => {
      addUser({ id: "deleted", email: VICTIM_EMAIL, deletedAt: new Date() });
      // The deleted row keeps its address in this fixture; creation must not
      // collide on the case-sensitive unique, so the provider spells it differently.
      const res = await signIn("Victim@example.com");

      expect(res.user.id).not.toBe("deleted");
      expect(linksOf("deleted")).toEqual([]);
      expect(fake.state.users.find((u) => u.id === res.user.id)).toMatchObject({
        email: "Victim@example.com",
        passwordHash: null,
        isEmailVerified: true,
      });
    });

    it("a concurrent first sign-in that loses the unique race resolves to the winner's link", async () => {
      const owner = addUser({ email: VICTIM_EMAIL });
      // The winner committed its link between this request's lookup and write.
      fake.db.oAuthAccount.findUnique.mockImplementationOnce(async () => {
        fake.state.links.push({
          provider,
          providerUserId: SUB,
          userId: owner.id,
        });
        return null;
      });

      const res = await signIn();

      expect(res.user.id).toBe(owner.id);
      expect(fake.state.links).toHaveLength(1);
      // The losing transaction rolled back: no second "linked" log.
      expect(fake.state.securityLogs).toEqual([]);
    });

    it("a concurrent first sign-in for a brand-new address does not 500", async () => {
      fake.db.oAuthAccount.findUnique.mockImplementationOnce(async () => {
        const winner = addUser({ id: "winner", email: VICTIM_EMAIL });
        fake.state.links.push({
          provider,
          providerUserId: SUB,
          userId: winner.id,
        });
        // No e-mail match was visible to the loser yet.
        fake.db.$queryRaw.mockResolvedValueOnce([]);
        return null;
      });

      const res = await signIn();

      expect(res.user.id).toBe("winner");
      expect(fake.state.users).toHaveLength(1);
      expect(fake.state.links).toHaveLength(1);
    });

    it("a lost e-mail race with another writer is retried and links to the winner", async () => {
      // A password registration (or the other provider) created the address
      // between this request's e-mail lookup and its account creation.
      const winner = addUser({ id: "winner", email: VICTIM_EMAIL });
      fake.db.$queryRaw.mockResolvedValueOnce([]);

      const res = await signIn();

      expect(res.user.id).toBe(winner.id);
      expect(fake.state.users).toHaveLength(1);
      expect(linksOf(winner.id)).toHaveLength(1);
    });

    it("never treats LIKE wildcards in the provider address as a match", async () => {
      const owner = addUser({ email: "john.smith@example.com" });

      const res = await signIn("john_smith@example.com");

      expect(res.user.id).not.toBe(owner.id);
      expect(linksOf(owner.id)).toEqual([]);
      const lookup = fake.db.$queryRaw.mock.calls.find(([sql]: any) =>
        sql.join("?").includes("lower(email)"),
      );
      expect(lookup[0].join("?")).toMatch(/lower\(email\) = lower\(\?\)/);
    });

    it("matches the e-mail case-insensitively", async () => {
      const owner = addUser({ email: "Victim@Example.com" });

      const res = await signIn("victim@example.com");

      expect(res.user.id).toBe(owner.id);
      expect(fake.state.users).toHaveLength(1);
      expect(linksOf(owner.id)).toHaveLength(1);
    });

    it("prefers the verified row when two spellings of the address exist", async () => {
      await addUnverifiedRegistration(); // victim@example.com, unverified
      const owner = addUser({ id: "owner", email: "Victim@example.com" });

      const res = await signIn(VICTIM_EMAIL);

      expect(res.user.id).toBe(owner.id);
      expect(
        fake.state.users.find((u) => u.id === "attacker-row"),
      ).toMatchObject({
        passwordHash: expect.any(String),
      });
      expect(fake.state.securityLogs).toEqual([
        expect.objectContaining({ eventType: "social_linked" }),
      ]);
    });

    it("a brand-new address creates a verified account with the link", async () => {
      const res = await signIn("new@example.com");

      expect(fake.state.users).toEqual([
        expect.objectContaining({
          id: res.user.id,
          email: "new@example.com",
          passwordHash: null,
          isEmailVerified: true,
          displayName: "Provider Name",
        }),
      ]);
      expect(linksOf(res.user.id)).toHaveLength(1);
    });

    it("2FA on a verified match: linked, then the existing TWO_FACTOR_PASSWORD_REQUIRED", async () => {
      const owner = addUser({ email: VICTIM_EMAIL, passwordHash: "hash" });
      fake.state.twoFactor.push({ userId: owner.id, isEnabled: true });

      await expect(signIn()).rejects.toMatchObject({
        response: { errorCode: "TWO_FACTOR_PASSWORD_REQUIRED" },
      });
      expect(linksOf(owner.id)).toHaveLength(1);
      expect(fake.state.twoFactor).toHaveLength(1);
    });
  },
);
