import * as request from "supertest";
import * as bcrypt from "bcrypt";
import { ACCOUNT_REQUIRED_CONSENTS, CONSENT_DOCUMENTS } from "@tarodan/types";
import { createE2ETestApp, E2ETestApp } from "../test-utils/create-app";
import { truncateAll, getPrisma, disconnectPrisma } from "../test-utils/db";
import {
  SocialIdentityService,
  type ProviderIdentity,
} from "../../src/modules/auth/social/social-identity.service";

/**
 * Social sign-in account resolution on a real Postgres (W2,
 * pre-account-takeover). The unit spec runs the same rules on an in-memory
 * fake; this suite proves what only the database can: the raw
 * `lower(email) = lower($1)` lookup, the `FOR UPDATE` lock inside the
 * interactive transaction, the P2002 race handling, and that the
 * `social_link_reset` consent source exists (migration
 * 20261019100000_consent_source_social_link_reset).
 *
 * The provider token check (GoogleAuthService/AppleAuthService) cannot run
 * here, so the suite calls SocialIdentityService directly with an identity
 * the provider would have verified, and uses the HTTP password login to
 * prove the attacker is locked out.
 */
describe("Social identity resolution (E2E, real DB)", () => {
  let ctx: E2ETestApp;
  let identities: SocialIdentityService;
  const prisma = getPrisma();

  const ATTACKER_PASSWORD = "Attacker-Pass-1";
  const identity = (email: string, sub = "sub-1"): ProviderIdentity => ({
    provider: "google",
    providerUserId: sub,
    email,
  });

  beforeAll(async () => {
    ctx = await createE2ETestApp();
    identities = ctx.app.get(SocialIdentityService);
  });

  afterAll(async () => {
    await ctx.close();
    await disconnectPrisma();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  /** An attacker's never-verified registration of the victim's address. */
  async function seedUnverifiedRegistration(email: string) {
    const user = await prisma.user.create({
      data: {
        email,
        displayName: "Attacker",
        passwordHash: await bcrypt.hash(ATTACKER_PASSWORD, 4),
        isEmailVerified: false,
        phone: "+905551112233",
        isPhoneVerified: true,
        legalFirstName: "Mallory",
        legalLastName: "Attacker",
        nationalId: "10000000146",
        acceptsMarketingEmails: true,
      },
    });
    const future = new Date(Date.now() + 86_400_000);
    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash: `rt-${user.id}`, expiresAt: future },
    });
    await prisma.passwordResetToken.create({
      data: { userId: user.id, token: `reset-${user.id}`, expiresAt: future },
    });
    await prisma.consentRecord.createMany({
      data: ACCOUNT_REQUIRED_CONSENTS.map((document) => ({
        document,
        version: CONSENT_DOCUMENTS[document].version,
        action: "granted" as const,
        source: "registration" as const,
        userId: user.id,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      })),
    });
    return user;
  }

  const passwordLogin = (email: string) =>
    request(ctx.app.getHttpServer())
      .post("/api/auth/login")
      .send({ email, password: ATTACKER_PASSWORD });

  it("takes over an unverified registration matched case-insensitively; the attacker's password is dead", async () => {
    const attacker = await seedUnverifiedRegistration("Victim@Example.com");

    const result = await identities.resolveUser(identity("victim@example.com"));

    expect(result).toEqual({ userId: attacker.id, outcome: "tookOver" });
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: attacker.id },
    });
    expect(row).toMatchObject({
      passwordHash: null,
      isEmailVerified: true,
      phone: null,
      nationalId: null,
      acceptsMarketingEmails: false,
    });
    expect(
      await prisma.refreshToken.count({
        where: { userId: attacker.id, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.passwordResetToken.count({ where: { userId: attacker.id } }),
    ).toBe(0);
    // The new enum value is writable (the migration ran).
    expect(
      await prisma.consentRecord.count({
        where: { userId: attacker.id, source: "social_link_reset" },
      }),
    ).toBe(ACCOUNT_REQUIRED_CONSENTS.length + 1); // + marketing
    expect(
      await prisma.oAuthAccount.count({ where: { userId: attacker.id } }),
    ).toBe(1);

    await passwordLogin("Victim@Example.com").expect(401);
    // Refused because the row has no password any more (not "not found").
    const refusal = await prisma.securityLog.findFirst({
      where: { eventType: "failed_login", userId: attacker.id },
    });
    expect(refusal?.details).toMatchObject({ reason: "oauth_only_account" });
  });

  it("two concurrent first sign-ins take over once and both get the same account", async () => {
    const attacker = await seedUnverifiedRegistration("victim@example.com");

    const results = await Promise.all([
      identities.resolveUser(identity("victim@example.com")),
      identities.resolveUser(identity("victim@example.com")),
    ]);

    expect(results.map((r) => r.userId)).toEqual([attacker.id, attacker.id]);
    expect(results.map((r) => r.outcome).sort()).toEqual([
      "existing",
      "tookOver",
    ]);
    expect(await prisma.oAuthAccount.count()).toBe(1);
    expect(
      await prisma.securityLog.count({
        where: { eventType: "social_link_reset" },
      }),
    ).toBe(1);
  });

  it("a password login racing the take-over never gets in", async () => {
    await seedUnverifiedRegistration("victim@example.com");

    const [, login] = await Promise.all([
      identities.resolveUser(identity("victim@example.com")),
      passwordLogin("victim@example.com"),
    ]);

    expect(login.status).toBe(401);
    await passwordLogin("victim@example.com").expect(401);
  });

  it("two concurrent first sign-ins for a new address create one account and one link", async () => {
    const results = await Promise.all([
      identities.resolveUser(identity("new@example.com")),
      identities.resolveUser(identity("new@example.com")),
    ]);

    expect(new Set(results.map((r) => r.userId)).size).toBe(1);
    expect(results.map((r) => r.outcome).sort()).toEqual([
      "created",
      "existing",
    ]);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.oAuthAccount.count()).toBe(1);
  });

  it("never matches LIKE wildcards or a deleted row", async () => {
    const lookalike = await seedUnverifiedRegistration(
      "john.smith@example.com",
    );
    const deleted = await prisma.user.create({
      data: {
        email: "gone@example.com",
        displayName: "Gone",
        deletedAt: new Date(),
      },
    });

    const wildcard = await identities.resolveUser(
      identity("john_smith@example.com", "sub-wild"),
    );
    const afterDeleted = await identities.resolveUser(
      identity("Gone@example.com", "sub-gone"),
    );

    expect(wildcard.outcome).toBe("created");
    expect(wildcard.userId).not.toBe(lookalike.id);
    expect(afterDeleted.outcome).toBe("created");
    expect(afterDeleted.userId).not.toBe(deleted.id);
    expect(
      await prisma.user.findUniqueOrThrow({ where: { id: lookalike.id } }),
    ).toMatchObject({ isEmailVerified: false, nationalId: "10000000146" });
  });

  it("keeps one Google link when two different Google identities of one address sign in at once", async () => {
    const owner = await prisma.user.create({
      data: {
        email: "owner@example.com",
        displayName: "Owner",
        isEmailVerified: true,
      },
    });

    const results = await Promise.all([
      identities.resolveUser(identity("owner@example.com", "sub-a")),
      identities.resolveUser(identity("owner@example.com", "sub-b")),
    ]);

    expect(results.map((r) => r.userId)).toEqual([owner.id, owner.id]);
    expect(results.map((r) => r.outcome).sort()).toEqual([
      "emailMatch",
      "linked",
    ]);
    expect(
      await prisma.oAuthAccount.count({
        where: { userId: owner.id, provider: "google" },
      }),
    ).toBe(1);
    expect(
      await prisma.securityLog.count({
        where: { userId: owner.id, eventType: "social_linked_auto" },
      }),
    ).toBe(1);
  });

  // At most one link per provider on the manual write path too (T9). Only
  // the real row lock can prove these: there is no unique (user, provider)
  // index, so without the lock both writers would insert.
  it("keeps one Google link when two manual links of different identities run at once", async () => {
    const owner = await prisma.user.create({
      data: {
        email: "owner@example.com",
        displayName: "Owner",
        isEmailVerified: true,
      },
    });

    const results = await Promise.allSettled([
      identities.linkToUser(owner.id, identity("work@corp.example", "sub-a")),
      identities.linkToUser(owner.id, identity("home@mail.example", "sub-b")),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    const refused = results.find((r) => r.status === "rejected");
    expect((refused as PromiseRejectedResult).reason).toMatchObject({
      status: 409,
      response: { errorCode: "PROVIDER_ALREADY_LINKED" },
    });
    expect(
      await prisma.oAuthAccount.count({
        where: { userId: owner.id, provider: "google" },
      }),
    ).toBe(1);
    expect(
      await prisma.securityLog.count({
        where: { userId: owner.id, eventType: "social_linked" },
      }),
    ).toBe(1);
  });

  it("keeps one Google link when a sign-in races a manual link of another identity", async () => {
    const owner = await prisma.user.create({
      data: {
        email: "owner@example.com",
        displayName: "Owner",
        isEmailVerified: true,
      },
    });

    const [manual, signIn] = await Promise.allSettled([
      identities.linkToUser(
        owner.id,
        identity("work@corp.example", "sub-manual"),
      ),
      identities.resolveUser(identity("owner@example.com", "sub-login")),
    ]);

    // The sign-in always opens the account; whichever writer locked the row
    // first holds the one link, and the other adds none.
    expect(signIn).toMatchObject({
      status: "fulfilled",
      value: { userId: owner.id },
    });
    const links = await prisma.oAuthAccount.findMany({
      where: { userId: owner.id, provider: "google" },
      select: { providerUserId: true },
    });
    expect(links).toHaveLength(1);
    if (links[0].providerUserId === "sub-manual") {
      expect(manual.status).toBe("fulfilled");
      expect(signIn).toMatchObject({ value: { outcome: "emailMatch" } });
    } else {
      expect(manual).toMatchObject({
        status: "rejected",
        reason: { response: { errorCode: "PROVIDER_ALREADY_LINKED" } },
      });
      expect(signIn).toMatchObject({ value: { outcome: "linked" } });
    }
    // One row for the one link, whoever wrote it.
    expect(
      await prisma.securityLog.count({
        where: {
          userId: owner.id,
          eventType: { in: ["social_linked", "social_linked_auto"] },
        },
      }),
    ).toBe(1);
  });
});
