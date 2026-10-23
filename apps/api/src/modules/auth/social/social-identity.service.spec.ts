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
  type ProviderIdentity,
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
          oauthAccounts: state.links
            .filter((l) => l.userId === user.id)
            .map((l) => ({
              provider: l.provider,
              email: l.email ?? null,
              createdAt: l.createdAt ?? new Date("2026-01-01T00:00:00Z"),
            })),
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
      findFirst: jest.fn(
        async ({ where }: any) =>
          state.links.find(
            (l) => l.userId === where.userId && l.provider === where.provider,
          ) ?? null,
      ),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = state.links.length;
        state.links = state.links.filter(
          (l) => !(l.userId === where.userId && l.provider === where.provider),
        );
        return { count: before - state.links.length };
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
    const sentry = { captureEvent: jest.fn(), addBreadcrumb: jest.fn() };
    const notifications = {
      sendAccountSecurityNotice: jest.fn().mockResolvedValue(undefined),
    };

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
          { provide: NotificationService, useValue: notifications },
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
          eventType: "social_linked_auto",
          severity: "low",
          userId: owner.id,
          details: {
            provider,
            flow: "social_login",
            mode: "link",
            source: "login",
            linked: true,
          },
        }),
      ]);
      expect(sentry.captureEvent).not.toHaveBeenCalled();
      // The owner is told which provider was added; nothing else is sent.
      expect(notifications.sendAccountSecurityNotice).toHaveBeenCalledTimes(1);
      expect(notifications.sendAccountSecurityNotice).toHaveBeenCalledWith(
        owner.id,
        "providerLinked",
        { provider },
      );
      // The owner's password still works.
      await expect(
        auth.login({ email: VICTIM_EMAIL, password: "Owner-Pass-1" }),
      ).resolves.toHaveProperty("tokens");
    });

    it("sends no security notice for a take-over, a new account or an existing link", async () => {
      await addUnverifiedRegistration();
      await signIn();
      await signIn();
      expect(notifications.sendAccountSecurityNotice).not.toHaveBeenCalled();
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
          // Exact: the admin user history reads provider, source and flow.
          // A take-over runs in the "link" mode (only a heal is "heal").
          details: {
            provider,
            flow: "social_login",
            mode: "link",
            source: "login",
            linked: true,
          },
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
          details: {
            provider,
            flow: "social_login",
            mode: "heal",
            source: "login",
            linked: false,
          },
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
        expect.objectContaining({ eventType: "social_linked_auto" }),
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

    it("2FA on an unverified match goes with the take-over: the provider user signs in", async () => {
      const attacker = await addUnverifiedRegistration();
      fake.state.twoFactor = [
        { userId: attacker.id, isEnabled: true, secret: "x" },
      ];

      const res = await signIn();

      expect(res.user.id).toBe(attacker.id);
      expect(res.tokens.accessToken).toBe("tok");
      expect(fake.state.twoFactor).toEqual([]);
    });

    it("an existing link wins over an unverified registration of the provider address", async () => {
      // The linked member changed their account e-mail; someone then
      // registered the old (provider) address without verifying it.
      const member = addUser({ email: "changed@example.com" });
      fake.state.links.push({
        provider,
        providerUserId: SUB,
        userId: member.id,
      });
      const attacker = await addUnverifiedRegistration();
      const before = structuredClone(
        fake.state.users.find((u) => u.id === attacker.id),
      );

      const res = await signIn();

      expect(res.user.id).toBe(member.id);
      expect(fake.state.users.find((u) => u.id === attacker.id)).toEqual(
        before,
      );
      expect(linksOf(attacker.id)).toEqual([]);
      expect(fake.state.securityLogs).toEqual([]);
    });

    /** Runs `change` on the matched row when the take-over takes its lock. */
    const onRowLock = (change: (user: Row) => void) => {
      const lookup = fake.db.$queryRaw.getMockImplementation();
      fake.db.$queryRaw.mockImplementation(
        async (strings: TemplateStringsArray, ...values: any[]) => {
          if (strings.join("?").includes("FOR UPDATE")) {
            change(fake.state.users.find((u) => u.id === values[0])!);
          }
          return lookup(strings, ...values);
        },
      );
    };

    it("decides on the locked row: verified meanwhile, it is linked and keeps its password", async () => {
      // The inbox owner clicked the verification link between the e-mail
      // lookup and the lock: the row is theirs now, so nothing is reset.
      const row = await addUnverifiedRegistration();
      onRowLock((user) => Object.assign(user, { isEmailVerified: true }));

      const res = await signIn();

      expect(res.user.id).toBe(row.id);
      expect(fake.state.users[0].passwordHash).toBe(row.passwordHash);
      expect(fake.state.refreshTokens[0].revokedAt).toBeNull();
      expect(fake.state.securityLogs).toEqual([
        expect.objectContaining({ eventType: "social_linked_auto" }),
      ]);
    });

    it("decides on the locked row: banned meanwhile, nothing is linked or reset", async () => {
      await addUnverifiedRegistration();
      onRowLock((user) => Object.assign(user, { isBanned: true }));

      await expect(signIn()).rejects.toMatchObject({
        response: { i18nKey: "server.auth.accountSuspended" },
      });

      expect(fake.state.links).toEqual([]);
      expect(fake.state.users[0]).toMatchObject({
        passwordHash: expect.any(String),
        nationalId: "10000000146",
        isEmailVerified: false,
      });
      expect(fake.state.securityLogs).toEqual([]);
    });

    if (provider === "apple") {
      it("an Apple private relay address follows the same take-over rule", async () => {
        const relay = "abc123xyz@privaterelay.appleid.com";
        const attacker = await addUnverifiedRegistration();
        Object.assign(attacker, { email: relay.toUpperCase() });

        const res = await signIn(relay);

        expect(res.user.id).toBe(attacker.id);
        expect(fake.state.users[0]).toMatchObject({
          passwordHash: null,
          isEmailVerified: true,
          nationalId: null,
        });
        await expect(
          auth.login({
            email: relay.toUpperCase(),
            password: ATTACKER_PASSWORD,
          }),
        ).rejects.toMatchObject({
          response: { i18nKey: "server.auth.invalidCredentials" },
        });
      });
    }

    // At most one link per provider (user decision, sign-in methods T9).
    it("a verified match that already has another identity of the provider signs in without a second link", async () => {
      const owner = addUser({ email: VICTIM_EMAIL, passwordHash: "hash" });
      fake.state.links.push({
        provider,
        providerUserId: "owner-other-sub",
        email: "work@corp.example",
        userId: owner.id,
      });

      const res = await signIn();

      expect(res.user.id).toBe(owner.id);
      expect(linksOf(owner.id)).toEqual([
        expect.objectContaining({ providerUserId: "owner-other-sub" }),
      ]);
      // Nothing linked: no social_linked_auto row and no "linked" notice.
      expect(fake.state.securityLogs).toEqual([]);
      expect(notifications.sendAccountSecurityNotice).not.toHaveBeenCalled();
      expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
        expect.objectContaining({ category: "social_login", level: "info" }),
      );
      expect(sentry.captureEvent).not.toHaveBeenCalled();

      // The next sign-in does the same; still one link.
      await signIn();
      expect(linksOf(owner.id)).toHaveLength(1);
    });

    it("an account linked to the other provider still gets this provider's link", async () => {
      const other = provider === "google" ? "apple" : "google";
      const owner = addUser({ email: VICTIM_EMAIL, passwordHash: "hash" });
      fake.state.links.push({
        provider: other,
        providerUserId: "other-provider-sub",
        userId: owner.id,
      });

      await signIn();

      expect(
        linksOf(owner.id)
          .map((l) => l.provider)
          .sort(),
      ).toEqual([provider, other].sort());
    });

    it("a take-over of an account that has another identity of the provider adds no second link", async () => {
      const attacker = await addUnverifiedRegistration();
      fake.state.links.push({
        provider,
        providerUserId: "legacy-sub",
        userId: attacker.id,
      });

      const res = await signIn();

      expect(res.user.id).toBe(attacker.id);
      expect(fake.state.users[0]).toMatchObject({
        passwordHash: null,
        isEmailVerified: true,
      });
      expect(linksOf(attacker.id)).toEqual([
        expect.objectContaining({ providerUserId: "legacy-sub" }),
      ]);
      expect(fake.state.securityLogs).toEqual([
        expect.objectContaining({
          eventType: "social_link_reset",
          severity: "high",
          userId: attacker.id,
          details: {
            provider,
            flow: "social_login",
            mode: "link",
            source: "login",
            linked: false,
          },
        }),
      ]);
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

// Manual link and unlink from account settings (sign-in methods plan, T9).
// The route guards (session, step-up) are pinned elsewhere; this is the
// decision and the writes on the locked row.
describe("SocialIdentityService manual link and unlink", () => {
  let identities: SocialIdentityService;
  let fake: ReturnType<typeof createFakeDb>;
  const sentry = { captureEvent: jest.fn(), addBreadcrumb: jest.fn() };
  const notifications = {
    sendAccountSecurityNotice: jest.fn().mockResolvedValue(undefined),
  };
  const appleTokens = { requestRevocation: jest.fn().mockResolvedValue(1) };

  const OWNER = "owner";
  const GOOGLE: ProviderIdentity = {
    provider: "google",
    providerUserId: "google-sub",
    email: "someone.else@gmail.com",
  };

  const addUser = (overrides: Row): Row => {
    const row = { ...baseUserRow(OWNER), ...overrides };
    fake.state.users.push(row);
    return row;
  };
  const link = (
    userId: string,
    provider: SocialProvider,
    sub = `${provider}-sub`,
  ) =>
    fake.state.links.push({
      id: `oa-${provider}-${userId}-${sub}`,
      provider,
      providerUserId: sub,
      email: `${userId}@${provider}.example`,
      userId,
      createdAt: new Date("2026-02-01T00:00:00Z"),
    });
  const linksOf = (userId: string) =>
    fake.state.links.filter((l) => l.userId === userId);

  /**
   * The fake has no row locks: serialise its transactions the way Postgres
   * serialises transactions that lock the same user row.
   */
  const serialiseTransactions = () => {
    const run = fake.db.$transaction.getMockImplementation();
    let queue: Promise<unknown> = Promise.resolve();
    fake.db.$transaction.mockImplementation((fn: never) => {
      const result = queue.then(() => run(fn));
      queue = result.catch(() => undefined);
      return result;
    });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    appleTokens.requestRevocation.mockReset().mockResolvedValue(1);
    fake = createFakeDb();
    const moduleRef = await Test.createTestingModule({
      providers: [
        SocialIdentityService,
        { provide: PrismaService, useValue: fake.db },
        { provide: SecurityService, useValue: {} },
        { provide: ConsentService, useValue: {} },
        { provide: NewsletterService, useValue: {} },
        { provide: SentryService, useValue: sentry },
        { provide: NotificationService, useValue: notifications },
        { provide: AppleTokenService, useValue: appleTokens },
      ],
    }).compile();
    identities = moduleRef.get(SocialIdentityService);
  });

  describe("linkToUser", () => {
    it("links a provider account with another e-mail, logs it as manual and sends the notice", async () => {
      addUser({ passwordHash: "hash" });
      fake.state.refreshTokens.push({ userId: OWNER, revokedAt: null });

      await identities.linkToUser(OWNER, GOOGLE);

      expect(linksOf(OWNER)).toEqual([
        expect.objectContaining({
          provider: "google",
          providerUserId: "google-sub",
          email: "someone.else@gmail.com",
        }),
      ]);
      expect(fake.state.securityLogs).toEqual([
        expect.objectContaining({
          eventType: "social_linked",
          severity: "low",
          userId: OWNER,
          details: {
            provider: "google",
            flow: "provider_link",
            source: "manual",
          },
        }),
      ]);
      // Sessions stay.
      expect(fake.state.refreshTokens[0].revokedAt).toBeNull();
      expect(notifications.sendAccountSecurityNotice).toHaveBeenCalledWith(
        OWNER,
        "providerLinked",
        { provider: "google" },
      );
    });

    it("decides on the locked row", async () => {
      addUser({});

      await identities.linkToUser(OWNER, GOOGLE);

      const [first] = fake.db.$queryRaw.mock.calls[0];
      expect(first.join("?")).toContain("FOR UPDATE");
    });

    it("answers 409 providerLinkedToOtherAccount when another account holds the identity, and writes nothing", async () => {
      addUser({});
      fake.state.users.push(baseUserRow("other"));
      link("other", "google", GOOGLE.providerUserId);

      await expect(identities.linkToUser(OWNER, GOOGLE)).rejects.toMatchObject({
        status: 409,
        response: {
          i18nKey: "server.auth.providerLinkedToOtherAccount",
          errorCode: "PROVIDER_LINKED_TO_OTHER_ACCOUNT",
        },
      });
      expect(linksOf(OWNER)).toEqual([]);
      expect(fake.state.securityLogs).toEqual([]);
      expect(notifications.sendAccountSecurityNotice).not.toHaveBeenCalled();
    });

    it("answers 409 providerAlreadyLinked for the same identity on this account", async () => {
      addUser({});
      link(OWNER, "google", GOOGLE.providerUserId);

      await expect(identities.linkToUser(OWNER, GOOGLE)).rejects.toMatchObject({
        status: 409,
        response: { errorCode: "PROVIDER_ALREADY_LINKED" },
      });
      expect(linksOf(OWNER)).toHaveLength(1);
    });

    it.each<SocialProvider>(["google", "apple"])(
      "answers 409 providerAlreadyLinked when this account already has another %s identity",
      async (provider) => {
        addUser({});
        link(OWNER, provider, `an-older-${provider}-sub`);

        await expect(
          identities.linkToUser(OWNER, {
            provider,
            providerUserId: `new-${provider}-sub`,
            email: "x@example.com",
          }),
        ).rejects.toMatchObject({
          status: 409,
          response: { errorCode: "PROVIDER_ALREADY_LINKED" },
        });
        expect(linksOf(OWNER)).toHaveLength(1);
        expect(fake.state.securityLogs).toEqual([]);
      },
    );

    it("links Apple next to Google: one link of each provider is fine", async () => {
      addUser({});
      link(OWNER, "google");

      await identities.linkToUser(OWNER, {
        provider: "apple",
        providerUserId: "apple-sub",
        email: "relay@privaterelay.appleid.com",
      });

      expect(
        linksOf(OWNER)
          .map((l) => l.provider)
          .sort(),
      ).toEqual(["apple", "google"]);
    });

    /**
     * Another transaction commits the identity between our check and our
     * insert: the insert fails with P2002 (rolled back), and the winner's
     * committed link is what the follow-up read sees.
     */
    const loseTheRaceTo = (winnerId: string) => {
      fake.db.oAuthAccount.create.mockRejectedValueOnce(
        uniqueViolation(["provider", "provider_user_id"]),
      );
      fake.db.oAuthAccount.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ userId: winnerId, user: {} });
    };

    it("maps a lost unique race to providerLinkedToOtherAccount, without naming the winner", async () => {
      addUser({});
      loseTheRaceTo("winner");

      const error = await identities
        .linkToUser(OWNER, GOOGLE)
        .catch((e: unknown) => e);

      expect(error).toMatchObject({
        status: 409,
        response: { errorCode: "PROVIDER_LINKED_TO_OTHER_ACCOUNT" },
      });
      expect(
        JSON.stringify((error as { response: unknown }).response),
      ).not.toContain("winner");
      expect(linksOf(OWNER)).toEqual([]);
      expect(fake.state.securityLogs).toEqual([]);
      expect(notifications.sendAccountSecurityNotice).not.toHaveBeenCalled();
    });

    it("maps a lost race with the owner's own sign-in to providerAlreadyLinked", async () => {
      addUser({});
      loseTheRaceTo(OWNER);

      await expect(identities.linkToUser(OWNER, GOOGLE)).rejects.toMatchObject({
        status: 409,
        response: { errorCode: "PROVIDER_ALREADY_LINKED" },
      });
    });

    it.each<SocialProvider>(["google", "apple"])(
      "stores one %s link for two concurrent links of that provider",
      async (provider) => {
        addUser({});
        serialiseTransactions();

        const results = await Promise.allSettled(
          ["first-sub", "second-sub"].map((sub) =>
            identities.linkToUser(OWNER, {
              provider,
              providerUserId: sub,
              email: "x@example.com",
            }),
          ),
        );

        expect(results.map((r) => r.status).sort()).toEqual([
          "fulfilled",
          "rejected",
        ]);
        const refused = results.find((r) => r.status === "rejected");
        expect((refused as PromiseRejectedResult).reason).toMatchObject({
          status: 409,
          response: { errorCode: "PROVIDER_ALREADY_LINKED" },
        });
        expect(linksOf(OWNER)).toHaveLength(1);
        expect(fake.state.securityLogs).toHaveLength(1);
        expect(notifications.sendAccountSecurityNotice).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it.each<SocialProvider>(["google", "apple"])(
      "a sign-in racing a manual %s link with another identity leaves one link (the link locks first)",
      async (provider) => {
        addUser({ email: "owner@example.com" });
        serialiseTransactions();

        const [, signIn] = await Promise.all([
          identities.linkToUser(OWNER, {
            provider,
            providerUserId: "manual-sub",
            email: "work@corp.example",
          }),
          identities.resolveUser({
            provider,
            providerUserId: "login-sub",
            email: "owner@example.com",
          }),
        ]);

        expect(signIn).toEqual({ userId: OWNER, outcome: "emailMatch" });
        expect(linksOf(OWNER)).toEqual([
          expect.objectContaining({ providerUserId: "manual-sub" }),
        ]);
        // Only the manual link is logged and mailed; the sign-in that added
        // nothing writes no row and sends no notice.
        expect(fake.state.securityLogs).toEqual([
          expect.objectContaining({
            eventType: "social_linked",
            userId: OWNER,
          }),
        ]);
        expect(notifications.sendAccountSecurityNotice).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it.each<SocialProvider>(["google", "apple"])(
      "a manual %s link racing a sign-in with another identity leaves one link (the sign-in locks first)",
      async (provider) => {
        addUser({ email: "owner@example.com" });
        serialiseTransactions();

        const signIn = identities.resolveUser({
          provider,
          providerUserId: "login-sub",
          email: "owner@example.com",
        });
        // Let the sign-in reach its transaction (and so the lock) first.
        while (fake.db.$transaction.mock.calls.length === 0) {
          await new Promise((resolve) => setImmediate(resolve));
        }
        const manual = identities.linkToUser(OWNER, {
          provider,
          providerUserId: "manual-sub",
          email: "work@corp.example",
        });

        await expect(signIn).resolves.toEqual({
          userId: OWNER,
          outcome: "linked",
        });
        await expect(manual).rejects.toMatchObject({
          status: 409,
          response: { errorCode: "PROVIDER_ALREADY_LINKED" },
        });
        expect(linksOf(OWNER)).toEqual([
          expect.objectContaining({ providerUserId: "login-sub" }),
        ]);
        expect(fake.state.securityLogs).toEqual([
          expect.objectContaining({
            eventType: "social_linked_auto",
            userId: OWNER,
          }),
        ]);
      },
    );

    it.each([
      ["banned", { isBanned: true }, "server.auth.accountSuspended"],
      ["deleted", { deletedAt: new Date() }, "server.auth.accountDeleted"],
    ])(
      "refuses a %s account as sign-in does, and writes nothing",
      async (_label, overrides, key) => {
        addUser(overrides);

        await expect(
          identities.linkToUser(OWNER, GOOGLE),
        ).rejects.toMatchObject({
          status: 401,
          response: { i18nKey: key },
        });
        expect(fake.state.links).toEqual([]);
      },
    );

    it("refuses an account whose e-mail is unverified with 403, and writes nothing", async () => {
      addUser({ isEmailVerified: false });

      await expect(identities.linkToUser(OWNER, GOOGLE)).rejects.toMatchObject({
        status: 403,
        response: { errorCode: "EMAIL_NOT_VERIFIED" },
      });
      expect(fake.state.links).toEqual([]);
      expect(fake.state.securityLogs).toEqual([]);
    });

    it("refuses a staff account and writes nothing", async () => {
      addUser({});
      fake.state.staff.push(OWNER);

      await expect(identities.linkToUser(OWNER, GOOGLE)).rejects.toMatchObject({
        status: 401,
        response: { i18nKey: "server.auth.staffAccountCustomerLogin" },
      });
      expect(fake.state.links).toEqual([]);
    });
  });

  describe("unlinkFromUser", () => {
    it("decides on the locked row", async () => {
      addUser({ passwordHash: "hash" });
      link(OWNER, "google");

      await identities.unlinkFromUser(OWNER, "google");

      const [first] = fake.db.$queryRaw.mock.calls[0];
      expect(first.join("?")).toContain("FOR UPDATE");
    });

    // D1: a password or a Google link must remain; Apple alone does not count.
    it.each<[string, SocialProvider[], SocialProvider, SocialProvider[]]>([
      ["password + Apple: Apple", ["apple"], "apple", []],
      [
        "password + Google + Apple: Google",
        ["google", "apple"],
        "google",
        ["apple"],
      ],
      [
        "password + Google + Apple: Apple",
        ["google", "apple"],
        "apple",
        ["google"],
      ],
    ])(
      "lets %s go while the password remains",
      async (_label, providers, provider, remaining) => {
        addUser({ passwordHash: "hash" });
        providers.forEach((p) => link(OWNER, p));

        await identities.unlinkFromUser(OWNER, provider);

        expect(linksOf(OWNER).map((l) => l.provider)).toEqual(remaining);
        expect(fake.state.securityLogs).toEqual([
          expect.objectContaining({
            eventType: "social_unlinked",
            userId: OWNER,
            details: expect.objectContaining({ provider }),
          }),
        ]);
      },
    );

    it("removes the provider, logs it and sends the notice; sessions stay", async () => {
      addUser({ passwordHash: "hash" });
      link(OWNER, "google");
      fake.state.refreshTokens.push({ userId: OWNER, revokedAt: null });

      await identities.unlinkFromUser(OWNER, "google");

      expect(linksOf(OWNER)).toEqual([]);
      expect(fake.state.securityLogs).toEqual([
        expect.objectContaining({
          eventType: "social_unlinked",
          userId: OWNER,
          details: {
            provider: "google",
            flow: "provider_unlink",
            source: "manual",
          },
        }),
      ]);
      expect(fake.state.refreshTokens[0].revokedAt).toBeNull();
      expect(appleTokens.requestRevocation).not.toHaveBeenCalled();
      expect(notifications.sendAccountSecurityNotice).toHaveBeenCalledWith(
        OWNER,
        "providerUnlinked",
        { provider: "google" },
      );
    });

    it("queues the Apple token revocation inside the unlink transaction", async () => {
      addUser({});
      link(OWNER, "google");
      link(OWNER, "apple");
      let inTransaction = false;
      const run = fake.db.$transaction.getMockImplementation();
      fake.db.$transaction.mockImplementation(async (fn: never) => {
        inTransaction = true;
        try {
          return await run(fn);
        } finally {
          inTransaction = false;
        }
      });
      appleTokens.requestRevocation.mockImplementation(async () => {
        expect(inTransaction).toBe(true);
        return 1;
      });

      await identities.unlinkFromUser(OWNER, "apple");

      expect(appleTokens.requestRevocation).toHaveBeenCalledWith(
        fake.db,
        OWNER,
      );
      expect(linksOf(OWNER).map((l) => l.provider)).toEqual(["google"]);
    });

    it("rolls the unlink back when the revocation cannot be queued", async () => {
      addUser({ passwordHash: "hash" });
      link(OWNER, "apple");
      appleTokens.requestRevocation.mockRejectedValueOnce(new Error("db"));

      await expect(identities.unlinkFromUser(OWNER, "apple")).rejects.toThrow(
        "db",
      );
      expect(linksOf(OWNER)).toHaveLength(1);
      expect(fake.state.securityLogs).toEqual([]);
      expect(notifications.sendAccountSecurityNotice).not.toHaveBeenCalled();
    });

    it.each<[string, Row, SocialProvider[], SocialProvider]>([
      ["the only Google link", {}, ["google"], "google"],
      [
        "Google when only Apple would remain",
        {},
        ["google", "apple"],
        "google",
      ],
      ["the only Apple link", {}, ["apple"], "apple"],
      [
        "an empty hash does not count as a password",
        { passwordHash: "" },
        ["google"],
        "google",
      ],
    ])(
      "answers 409 LAST_SIGN_IN_METHOD for %s, and writes nothing",
      async (_label, overrides, providers, provider) => {
        addUser(overrides);
        providers.forEach((p) => link(OWNER, p));

        await expect(
          identities.unlinkFromUser(OWNER, provider),
        ).rejects.toMatchObject({
          status: 409,
          response: {
            i18nKey: "server.auth.lastSignInMethod",
            errorCode: "LAST_SIGN_IN_METHOD",
          },
        });
        expect(linksOf(OWNER)).toHaveLength(providers.length);
        expect(fake.state.securityLogs).toEqual([]);
        expect(appleTokens.requestRevocation).not.toHaveBeenCalled();
        expect(notifications.sendAccountSecurityNotice).not.toHaveBeenCalled();
      },
    );

    it("lets Apple go when Google remains, without a password", async () => {
      addUser({});
      link(OWNER, "google");
      link(OWNER, "apple");

      await identities.unlinkFromUser(OWNER, "apple");

      expect(linksOf(OWNER).map((l) => l.provider)).toEqual(["google"]);
    });

    it("answers 404 providerNotLinked for a provider that is not linked", async () => {
      addUser({ passwordHash: "hash" });
      link(OWNER, "google");

      await expect(
        identities.unlinkFromUser(OWNER, "apple"),
      ).rejects.toMatchObject({
        status: 404,
        response: { errorCode: "PROVIDER_NOT_LINKED" },
      });
      expect(linksOf(OWNER)).toHaveLength(1);
    });

    it("never touches another account's link of the provider", async () => {
      addUser({ passwordHash: "hash" });
      fake.state.users.push(baseUserRow("other"));
      link(OWNER, "google");
      link("other", "google", "other-sub");

      await identities.unlinkFromUser(OWNER, "google");

      expect(linksOf("other")).toHaveLength(1);
    });

    it("serialises two unlinks on the locked row and keeps a usable method", async () => {
      addUser({});
      link(OWNER, "google");
      link(OWNER, "apple");
      serialiseTransactions();

      const results = await Promise.allSettled([
        identities.unlinkFromUser(OWNER, "apple"),
        identities.unlinkFromUser(OWNER, "google"),
      ]);

      // Apple goes first (Google remains); then Google is the last method.
      expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
      expect(linksOf(OWNER).map((l) => l.provider)).toEqual(["google"]);
    });

    it.each<[string, Row, boolean, string]>([
      ["banned", { isBanned: true }, false, "server.auth.accountSuspended"],
      [
        "deleted",
        { deletedAt: new Date() },
        false,
        "server.auth.accountDeleted",
      ],
      ["staff", {}, true, "server.auth.staffAccountCustomerLogin"],
    ])(
      "refuses a %s account as sign-in does, and writes nothing",
      async (_label, overrides, staff, key) => {
        addUser({ passwordHash: "hash", ...overrides });
        if (staff) fake.state.staff.push(OWNER);
        link(OWNER, "google");
        link(OWNER, "apple");

        await expect(
          identities.unlinkFromUser(OWNER, "apple"),
        ).rejects.toMatchObject({ status: 401, response: { i18nKey: key } });
        expect(linksOf(OWNER)).toHaveLength(2);
        expect(fake.state.securityLogs).toEqual([]);
        expect(appleTokens.requestRevocation).not.toHaveBeenCalled();
        expect(notifications.sendAccountSecurityNotice).not.toHaveBeenCalled();
      },
    );
  });
});
