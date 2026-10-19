import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConsentSource, Prisma } from "@prisma/client";
import { LEGAL_IDENTITY_FIELDS, type LegalIdentityField } from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { getRequestClientInfo } from "../../../common/context/request-context";
import { ConsentService } from "../../consent/consent.service";
import { i18nMessage } from "../../i18n";
import { NewsletterService } from "../../marketing/newsletter.service";
import { SecurityService } from "../../security/security.service";
import { SentryService } from "../../sentry/sentry.service";
import {
  isStaffAccount,
  STAFF_ACCOUNT_SELECT,
  staffAccountCustomerLoginError,
} from "../utils/staff-account";
import { allocateUsernameFromEmail } from "../utils/username.util";

export type SocialProvider = "google" | "apple";

/** A provider identity whose e-mail the provider has verified. */
export interface ProviderIdentity {
  provider: SocialProvider;
  /** The provider's stable subject (`sub`); the link key. */
  providerUserId: string;
  email: string;
}

/** Profile fields used only when a brand-new account is created. */
export interface NewSocialUserProfile {
  displayName?: string | null;
  avatarUrl?: string | null;
}

/**
 * How the provider identity was resolved to an account:
 * - `existing`: the identity was already linked (nothing written)
 * - `linked`: linked to an account whose e-mail was already verified
 * - `tookOver`: linked to an account whose e-mail was never verified; the
 *   unproven credentials and data of that registration were cleared first
 * - `created`: a new account was opened for the identity
 */
export type SocialIdentityOutcome =
  "existing" | "linked" | "tookOver" | "created";

export interface SocialIdentityResolution {
  userId: string;
  outcome: SocialIdentityOutcome;
}

/** Security log event types written here (admin system logs label them). */
export const SOCIAL_SECURITY_EVENTS = {
  linked: "social_linked",
  linkReset: "social_link_reset",
} as const;

const FLOW_TAG = "social_login";

/** Enough of a matched account to decide between link and take-over. */
const MATCH_SELECT = {
  id: true,
  email: true,
  isEmailVerified: true,
  isBanned: true,
  deletedAt: true,
  acceptsMarketingEmails: true,
  createdAt: true,
  ...STAFF_ACCOUNT_SELECT,
} as const satisfies Prisma.UserSelect;

type MatchedUser = Prisma.UserGetPayload<{ select: typeof MATCH_SELECT }>;

/** Same-address rows that differ only in case; more than a few is not real. */
const MAX_EMAIL_CANDIDATES = 5;

const CLEARED_LEGAL_IDENTITY = Object.fromEntries(
  LEGAL_IDENTITY_FIELDS.map((field) => [field, null]),
) as Record<LegalIdentityField, null>;

/**
 * What a take-over clears on the user row: everything the unverified
 * registrant entered or could have set without proving the inbox. Kept: the
 * row id, `username` and `displayName` (not credentials, and the owner can
 * change them), the test-lane flag (a property of the row) and the consent
 * history (append-only; withdrawn separately so the gate asks again).
 */
const TAKE_OVER_USER_DATA = {
  passwordHash: null,
  isEmailVerified: true,
  phone: null,
  isPhoneVerified: false,
  birthDate: null,
  ...CLEARED_LEGAL_IDENTITY,
  acceptsMarketingEmails: false,
  fcmToken: null,
} as const satisfies Prisma.UserUpdateManyMutationInput;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Prefers a verified row, then the exact spelling, then the oldest. The
 * account unique index is case-sensitive, so `A@x` and `a@x` can both exist.
 */
function pickCandidate(
  candidates: readonly MatchedUser[],
  email: string,
): MatchedUser | undefined {
  const rank = (user: MatchedUser) =>
    (user.isEmailVerified ? 0 : 2) + (user.email === email ? 0 : 1);
  return [...candidates].sort(
    (a, b) =>
      rank(a) - rank(b) || a.createdAt.getTime() - b.createdAt.getTime(),
  )[0];
}

/**
 * Refuses an account that can never get a customer session, before anything
 * is written for it. Same keys and order as the login response check.
 */
function assertCanOpenSession(user: MatchedUser): void {
  if (isStaffAccount(user)) throw staffAccountCustomerLoginError();
  if (user.deletedAt) {
    throw new UnauthorizedException(i18nMessage("server.auth.accountDeleted"));
  }
  if (user.isBanned) {
    throw new UnauthorizedException(
      i18nMessage("server.auth.accountSuspended"),
    );
  }
}

/**
 * The single owner of every OAuthAccount write for Google and Apple sign-in:
 * provider identity -> account.
 *
 * 1. An existing link wins.
 * 2. Otherwise a non-deleted account with the same e-mail (case-insensitive):
 *    - verified e-mail: link it (password and sessions stay);
 *    - unverified e-mail: take it over. The provider proved the inbox; the
 *      registrant proved nothing, so their password, tokens, 2FA, phone,
 *      birth date, legal identity, marketing opt-in and consents go, in one
 *      transaction with the link. This closes the pre-account-takeover where
 *      an attacker registers the victim's address and keeps access after the
 *      victim signs in with a provider.
 * 3. Otherwise a new account.
 *
 * Staff, banned and deleted accounts get nothing written. A concurrent first
 * sign-in that loses the unique race resolves to the link the winner wrote.
 */
@Injectable()
export class SocialIdentityService {
  private readonly logger = new Logger(SocialIdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly security: SecurityService,
    private readonly consents: ConsentService,
    private readonly newsletter: NewsletterService,
    private readonly sentry: SentryService,
  ) {}

  async resolveUser(
    identity: ProviderIdentity,
    newUser: NewSocialUserProfile = {},
  ): Promise<SocialIdentityResolution> {
    const resolution = await this.resolve(identity, newUser);
    await this.afterResolved(identity, resolution);
    return resolution.result;
  }

  private async resolve(
    identity: ProviderIdentity,
    newUser: NewSocialUserProfile,
  ): Promise<{ result: SocialIdentityResolution; unsubscribe?: string }> {
    const linked = await this.findLink(identity);
    if (linked) return this.resolveExistingLink(identity, linked.userId);

    try {
      const candidates = await this.prisma.user.findMany({
        where: {
          email: { equals: identity.email.trim(), mode: "insensitive" },
          deletedAt: null,
        },
        select: MATCH_SELECT,
        take: MAX_EMAIL_CANDIDATES,
      });
      const match = pickCandidate(candidates, identity.email);
      if (match) {
        assertCanOpenSession(match);
        return await this.linkOrTakeOver(identity, match.id, true);
      }
      return {
        result: {
          userId: await this.create(identity, newUser),
          outcome: "created",
        },
      };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // A concurrent first sign-in with the same identity won the race.
      const winner = await this.findLink(identity);
      if (!winner) throw error;
      return { result: { userId: winner.userId, outcome: "existing" } };
    }
  }

  /**
   * An existing link is used as it is. One exception heals rows the old
   * Apple auto-link left behind: a link to an account whose e-mail is still
   * unverified, where the provider now proves that same address, is a
   * take-over that never happened. Accounts that cannot open a session are
   * left to the login response check, which refuses them.
   */
  private async resolveExistingLink(
    identity: ProviderIdentity,
    userId: string,
  ): Promise<{ result: SocialIdentityResolution; unsubscribe?: string }> {
    const existing = { result: { userId, outcome: "existing" as const } };
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: MATCH_SELECT,
    });
    if (
      !user ||
      user.isEmailVerified ||
      !sameAddress(user.email, identity.email) ||
      isStaffAccount(user) ||
      user.deletedAt ||
      user.isBanned
    ) {
      return existing;
    }
    const healed = await this.linkOrTakeOver(identity, userId, false);
    return healed.result.outcome === "tookOver" ? healed : existing;
  }

  /**
   * One transaction under a row lock, so the verified/unverified decision is
   * made on the row as it is now and a concurrent verification or ban cannot
   * slip between the read and the writes.
   */
  private async linkOrTakeOver(
    identity: ProviderIdentity,
    userId: string,
    createLink: boolean,
  ): Promise<{ result: SocialIdentityResolution; unsubscribe?: string }> {
    const { ipAddress, userAgent } = getRequestClientInfo();
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: MATCH_SELECT,
      });
      if (!user) {
        throw new UnauthorizedException(
          i18nMessage("server.auth.userNotFound"),
        );
      }
      assertCanOpenSession(user);

      // First write: a concurrent sign-in with the same identity fails here
      // (P2002) and rolls back before anything else changes.
      if (createLink) {
        await tx.oAuthAccount.create({
          data: {
            provider: identity.provider,
            providerUserId: identity.providerUserId,
            email: identity.email,
            userId,
          },
        });
      }

      const securityLog = (eventType: string, severity: "low" | "high") =>
        tx.securityLog.create({
          data: {
            eventType,
            severity,
            userId,
            ipAddress,
            userAgent,
            details: { provider: identity.provider, flow: FLOW_TAG },
          },
        });

      if (user.isEmailVerified) {
        if (createLink) await securityLog(SOCIAL_SECURITY_EVENTS.linked, "low");
        return {
          result: { userId, outcome: createLink ? "linked" : "existing" },
        };
      }

      await tx.user.update({
        where: { id: userId },
        data: TAKE_OVER_USER_DATA,
      });
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.emailVerificationToken.deleteMany({ where: { userId } });
      await tx.emailChangeToken.deleteMany({ where: { userId } });
      await tx.phoneVerificationToken.deleteMany({ where: { userId } });
      await this.security.revokeAllUserTokens(userId, tx);
      await this.security.removeTwoFactorSecret(userId, tx);
      await this.consents.withdrawAccountConsents(
        userId,
        ConsentSource.social_link_reset,
        tx,
      );
      if (user.acceptsMarketingEmails) {
        await this.consents.recordMarketingChange(
          { userId, granted: false, source: ConsentSource.social_link_reset },
          tx,
        );
      }
      await securityLog(SOCIAL_SECURITY_EVENTS.linkReset, "high");
      return {
        result: { userId, outcome: "tookOver" },
        unsubscribe: user.acceptsMarketingEmails ? user.email : undefined,
      };
    });
  }

  /** New account and its link in one transaction (no half-created account). */
  private async create(
    identity: ProviderIdentity,
    profile: NewSocialUserProfile,
  ): Promise<string> {
    // Social sign-in does not ask for a username: it is derived from the
    // e-mail. `usernameClaimedAt` stays empty, so the member may change it once.
    const username = await allocateUsernameFromEmail(
      this.prisma,
      identity.email,
    );
    const displayName =
      profile.displayName?.trim() || identity.email.split("@")[0];
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: identity.email,
          passwordHash: null,
          username,
          displayName,
          avatarUrl: profile.avatarUrl ?? null,
          isEmailVerified: true,
          isSeller: false,
        },
        select: { id: true },
      });
      await tx.oAuthAccount.create({
        data: {
          provider: identity.provider,
          providerUserId: identity.providerUserId,
          email: identity.email,
          userId: created.id,
        },
      });
      return created.id;
    });
  }

  private findLink(identity: ProviderIdentity) {
    return this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: identity.provider,
          providerUserId: identity.providerUserId,
        },
      },
      select: { userId: true },
    });
  }

  /**
   * Side effects after the transaction committed; none of them may fail the
   * sign-in. The account notice mail for a new link belongs here as well.
   */
  private async afterResolved(
    identity: ProviderIdentity,
    resolution: { result: SocialIdentityResolution; unsubscribe?: string },
  ): Promise<void> {
    const { userId, outcome } = resolution.result;
    if (outcome !== "tookOver") return;
    // The registrant's opt-in also put the address on the newsletter list.
    if (resolution.unsubscribe) {
      await this.newsletter.syncUserConsent(resolution.unsubscribe, false);
    }
    // Rare and security-relevant: visible in Sentry. Ids only, no e-mail.
    this.logger.warn(
      `Social sign-in took over an unverified account (user=${userId}, provider=${identity.provider})`,
    );
    this.sentry.captureEvent({
      message: SOCIAL_SECURITY_EVENTS.linkReset,
      level: "warning",
      tags: { provider: identity.provider, flow: FLOW_TAG },
      user: { id: userId },
    });
  }
}
