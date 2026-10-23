import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConsentSource, Prisma } from "@prisma/client";
import {
  canUnlinkProvider,
  LEGAL_IDENTITY_FIELDS,
  SIGN_IN_METHOD_EVENT_FLOWS,
  SIGN_IN_METHOD_EVENT_SOURCES,
  SIGN_IN_METHOD_EVENTS,
  SIGN_IN_METHODS_ERROR_CODES,
  type LegalIdentityField,
  type SignInMethodEventType,
  type SignInProvider,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { getRequestClientInfo } from "../../../common/context/request-context";
import { ConsentService } from "../../consent/consent.service";
import { i18nMessage } from "../../i18n";
import { NewsletterService } from "../../marketing/newsletter.service";
import { NotificationService } from "../../notification/notification.service";
import { SecurityService } from "../../security/security.service";
import { SentryService } from "../../sentry/sentry.service";
import {
  SIGN_IN_METHODS_SELECT,
  toSignInMethods,
} from "../sign-in-methods/sign-in-methods.mapper";
import {
  isStaffAccount,
  STAFF_ACCOUNT_SELECT,
  staffAccountCustomerLoginError,
} from "../utils/staff-account";
import { allocateUsernameFromEmail } from "../utils/username.util";
import { AppleTokenService } from "./apple-token.service";

/** Alias kept for the sign-in paths; the one list is `SignInProvider`. */
export type SocialProvider = SignInProvider;

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
 *   (for a legacy link, only the unproven password)
 * - `created`: a new account was opened for the identity
 * - `emailMatch`: signed in by the verified e-mail match without a link,
 *   because the account already has another identity of this provider
 *   (at most one link per provider; nothing written)
 */
export type SocialIdentityOutcome =
  "existing" | "linked" | "tookOver" | "created" | "emailMatch";

export interface SocialIdentityResolution {
  userId: string;
  outcome: SocialIdentityOutcome;
}

// Security log rows written here (`SIGN_IN_METHOD_EVENTS`) carry the user id
// and `details.provider`, `details.flow` and `details.source`; admin labels
// them in the system logs and the user history.
const FLOW_TAG = SIGN_IN_METHOD_EVENT_FLOWS.socialLogin;

function providerAlreadyLinkedError(): ConflictException {
  return new ConflictException({
    ...i18nMessage("server.auth.providerAlreadyLinked"),
    errorCode: SIGN_IN_METHODS_ERROR_CODES.providerAlreadyLinked,
  });
}

/** Never says which account holds the link. */
function providerLinkedToOtherAccountError(): ConflictException {
  return new ConflictException({
    ...i18nMessage("server.auth.providerLinkedToOtherAccount"),
    errorCode: SIGN_IN_METHODS_ERROR_CODES.providerLinkedToOtherAccount,
  });
}

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

/** A lost unique race is retried once: the next pass sees the winner's rows. */
const MAX_RESOLVE_ATTEMPTS = 2;

const CLEARED_LEGAL_IDENTITY = Object.fromEntries(
  LEGAL_IDENTITY_FIELDS.map((field) => [field, null]),
) as Record<LegalIdentityField, null>;

/**
 * What a take-over clears on the user row: everything the unverified
 * registrant entered or could have set without proving the inbox. Kept: the
 * row id, `username` and `displayName` (not credentials; `usernameClaimedAt`
 * is cleared so the owner can change the registrant's username once), the
 * test-lane flag (a property of the row) and the consent history
 * (append-only; withdrawn separately so the gate asks again).
 */
const TAKE_OVER_USER_DATA = {
  passwordHash: null,
  isEmailVerified: true,
  usernameClaimedAt: null,
  isSeller: false,
  sellerType: null,
  phone: null,
  isPhoneVerified: false,
  birthDate: null,
  ...CLEARED_LEGAL_IDENTITY,
  acceptsMarketingEmails: false,
  fcmToken: null,
} as const satisfies Prisma.UserUpdateManyMutationInput;

/**
 * The legacy-link heal clears only the credential nobody proved. The rest of
 * such a row may already be the owner's: the old Apple path gave the owner
 * sessions on it, so their sessions and data stay.
 */
const HEAL_USER_DATA = {
  passwordHash: null,
  isEmailVerified: true,
} as const satisfies Prisma.UserUpdateManyMutationInput;

/** `link`: create the link, then link or take over; `heal`: the link exists. */
type ResolveMode = "link" | "heal";

type Resolved = { result: SocialIdentityResolution; unsubscribe?: string };

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
 * sign-in that loses a unique race resolves to the link the winner wrote, or
 * is retried once (the winner wrote the same e-mail or username).
 *
 * An account has at most one link per provider (one Google, one Apple). Every
 * writer checks it under the user row lock: when the matched account already
 * has another identity of the provider, a sign-in still opens it by the
 * verified e-mail (or takes it over) but adds no second link.
 *
 * The owner can also link and unlink providers by hand from account settings
 * (`linkToUser`, `unlinkFromUser`, behind the step-up).
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
    private readonly notifications: NotificationService,
    private readonly appleTokens: AppleTokenService,
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
  ): Promise<Resolved> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.resolveOnce(identity, newUser);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        // A concurrent writer won a unique race: the same identity (its link
        // is now there), or the same e-mail or username (the next pass
        // matches or avoids the winner's row).
        const winner = await this.findLink(identity);
        if (winner)
          return { result: { userId: winner.userId, outcome: "existing" } };
        if (attempt >= MAX_RESOLVE_ATTEMPTS) throw error;
      }
    }
  }

  private async resolveOnce(
    identity: ProviderIdentity,
    newUser: NewSocialUserProfile,
  ): Promise<Resolved> {
    const linked = await this.findLink(identity);
    if (linked) return this.resolveExistingLink(identity, linked);

    const match = pickCandidate(
      await this.findByEmail(identity.email),
      identity.email,
    );
    if (match) {
      assertCanOpenSession(match);
      return this.linkOrTakeOver(identity, match.id, "link");
    }
    return {
      result: {
        userId: await this.create(identity, newUser),
        outcome: "created",
      },
    };
  }

  /**
   * Non-deleted accounts with this address, ignoring case. `lower() = lower()`
   * and not Prisma's `mode: "insensitive"`, which is an unescaped ILIKE where
   * `_` and `%` in a provider address would match other people's rows.
   */
  private async findByEmail(email: string): Promise<MatchedUser[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users
      WHERE lower(email) = lower(${email.trim()}) AND deleted_at IS NULL
      LIMIT ${MAX_EMAIL_CANDIDATES}
    `;
    if (rows.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: rows.map((row) => row.id) }, deletedAt: null },
      select: MATCH_SELECT,
    });
    // Defence in depth: never act on a row whose address is not this one.
    return users.filter((user) => sameAddress(user.email, email));
  }

  /**
   * An existing link is used as it is. One exception heals rows the old
   * Apple auto-link left behind: a link to an account whose e-mail is still
   * unverified, where the provider now proves that same address. Its
   * unproven password goes and the e-mail is verified; the sessions and data
   * stay, because the owner may have been using the account through that
   * link. Accounts that cannot open a session are left to the login response
   * check, which refuses them.
   */
  private async resolveExistingLink(
    identity: ProviderIdentity,
    link: { userId: string; user: MatchedUser },
  ): Promise<Resolved> {
    const { userId, user } = link;
    const existing = { result: { userId, outcome: "existing" as const } };
    if (
      user.isEmailVerified ||
      !sameAddress(user.email, identity.email) ||
      isStaffAccount(user) ||
      user.deletedAt ||
      user.isBanned
    ) {
      return existing;
    }
    const healed = await this.linkOrTakeOver(identity, userId, "heal");
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
    mode: ResolveMode,
  ): Promise<Resolved> {
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

      // At most one link per provider: an account that already has another
      // identity of this provider gets no second link (decided on the
      // locked row, so a concurrent link or sign-in is seen).
      const sameProvider =
        mode === "link"
          ? await tx.oAuthAccount.findFirst({
              where: { userId, provider: identity.provider },
              select: { id: true },
            })
          : null;
      const createLink = mode === "link" && !sameProvider;
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

      const securityLog = (
        eventType: SignInMethodEventType,
        severity: "low" | "high",
      ) =>
        tx.securityLog.create({
          data: {
            eventType,
            severity,
            userId,
            ipAddress,
            userAgent,
            details: {
              provider: identity.provider,
              flow: FLOW_TAG,
              mode,
              source: SIGN_IN_METHOD_EVENT_SOURCES.login,
              // Whether this sign-in added the link (a heal finds it, and a
              // second identity of the provider is never linked).
              linked: createLink,
            },
          },
        });

      if (user.isEmailVerified) {
        if (createLink) {
          await securityLog(SIGN_IN_METHOD_EVENTS.socialLinkedAuto, "low");
          return { result: { userId, outcome: "linked" } };
        }
        // Nothing linked, so no `social_linked_auto` row and no notice mail.
        return {
          result: { userId, outcome: sameProvider ? "emailMatch" : "existing" },
        };
      }

      // Pending codes and links were issued for the unproven registration.
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      await tx.emailVerificationToken.deleteMany({ where: { userId } });
      await tx.emailChangeToken.deleteMany({ where: { userId } });
      if (mode === "heal") {
        await tx.user.update({ where: { id: userId }, data: HEAL_USER_DATA });
        await securityLog(SIGN_IN_METHOD_EVENTS.socialLinkReset, "high");
        return { result: { userId, outcome: "tookOver" } };
      }

      await tx.user.update({
        where: { id: userId },
        data: TAKE_OVER_USER_DATA,
      });
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
      await securityLog(SIGN_IN_METHOD_EVENTS.socialLinkReset, "high");
      return {
        result: { userId, outcome: "tookOver" },
        unsubscribe: user.acceptsMarketingEmails ? user.email : undefined,
      };
    });
  }

  /**
   * Links a provider identity to the signed-in owner by hand (account
   * settings, behind the step-up). The identity key is the provider `sub`;
   * the provider e-mail may differ from the account e-mail (plan D3).
   *
   * Decided and written in one transaction under the user row lock, so two
   * concurrent links for one provider store one. 409 `providerAlreadyLinked`
   * when this account already has the identity or another identity of the
   * provider; 409 `providerLinkedToOtherAccount` when another account holds
   * it, also for a lost unique race. Staff, banned and deleted accounts get
   * the sign-in refusals and nothing is written. An account whose e-mail is
   * unverified gets 403 `EMAIL_NOT_VERIFIED`: a take-over at sign-in clears
   * the registrant's credentials but not its links, so a link made by an
   * unproven registrant would outlive it. Sessions stay; the notice mail
   * goes out after commit and never fails the request.
   */
  async linkToUser(userId: string, identity: ProviderIdentity): Promise<void> {
    const { ipAddress, userAgent } = getRequestClientInfo();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: MATCH_SELECT,
        });
        if (!user) {
          throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
        }
        assertCanOpenSession(user);
        if (!user.isEmailVerified) {
          // Same key and code as login (`auth-login.service.ts`), but 403:
          // the session is not the problem, the unproven address is.
          throw new ForbiddenException({
            ...i18nMessage("server.auth.emailNotVerifiedLogin"),
            errorCode: "EMAIL_NOT_VERIFIED",
          });
        }

        const holder = await tx.oAuthAccount.findUnique({
          where: {
            provider_providerUserId: {
              provider: identity.provider,
              providerUserId: identity.providerUserId,
            },
          },
          select: { userId: true },
        });
        if (holder) {
          throw holder.userId === userId
            ? providerAlreadyLinkedError()
            : providerLinkedToOtherAccountError();
        }
        const sameProvider = await tx.oAuthAccount.findFirst({
          where: { userId, provider: identity.provider },
          select: { id: true },
        });
        if (sameProvider) throw providerAlreadyLinkedError();

        await tx.oAuthAccount.create({
          data: {
            provider: identity.provider,
            providerUserId: identity.providerUserId,
            email: identity.email,
            userId,
          },
        });
        await tx.securityLog.create({
          data: {
            eventType: SIGN_IN_METHOD_EVENTS.socialLinked,
            severity: "low",
            userId,
            ipAddress,
            userAgent,
            details: {
              provider: identity.provider,
              flow: SIGN_IN_METHOD_EVENT_FLOWS.providerLink,
              source: SIGN_IN_METHOD_EVENT_SOURCES.manual,
            },
          },
        });
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // A concurrent writer stored the identity first: another account's
      // link or sign-in, or this owner's own sign-in with it.
      const winner = await this.findLink(identity);
      throw winner?.userId === userId
        ? providerAlreadyLinkedError()
        : providerLinkedToOtherAccountError();
    }

    // Fire and forget: the notifier queues the mail and never throws.
    void this.notifications.sendAccountSecurityNotice(
      userId,
      "providerLinked",
      { provider: identity.provider },
    );
  }

  /**
   * Removes the owner's links of `provider` (account settings, behind the
   * step-up). The last-method rule (`canUnlinkProvider`, plan D1) is checked
   * on the locked row in the same transaction as the delete, so two
   * concurrent unlinks cannot leave the account without a usable method.
   *
   * 404 `providerNotLinked` for a provider that is not linked; 409
   * `lastSignInMethod` when the rule refuses. An Apple unlink also queues the
   * revocation of the stored Apple tokens in the same transaction (outbox),
   * as account deletion does. A later sign-in with the provider can link it
   * again through the verified e-mail rule (plan D2).
   */
  async unlinkFromUser(
    userId: string,
    provider: SignInProvider,
  ): Promise<void> {
    const { ipAddress, userAgent } = getRequestClientInfo();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { ...MATCH_SELECT, ...SIGN_IN_METHODS_SELECT },
      });
      if (!user) {
        throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
      }
      assertCanOpenSession(user);

      const methods = toSignInMethods(user);
      if (!methods.providers.some((linked) => linked.provider === provider)) {
        throw new NotFoundException({
          ...i18nMessage("server.auth.providerNotLinked"),
          errorCode: SIGN_IN_METHODS_ERROR_CODES.providerNotLinked,
        });
      }
      if (!canUnlinkProvider(methods, provider)) {
        throw new ConflictException({
          ...i18nMessage("server.auth.lastSignInMethod"),
          errorCode: SIGN_IN_METHODS_ERROR_CODES.lastSignInMethod,
        });
      }

      // One link per provider is the rule; `deleteMany` stays so legacy rows
      // from before it go together (canUnlinkProvider judges them so).
      await tx.oAuthAccount.deleteMany({ where: { userId, provider } });
      if (provider === "apple") {
        await this.appleTokens.requestRevocation(tx, userId);
      }
      await tx.securityLog.create({
        data: {
          eventType: SIGN_IN_METHOD_EVENTS.socialUnlinked,
          severity: "medium",
          userId,
          ipAddress,
          userAgent,
          details: {
            provider,
            flow: SIGN_IN_METHOD_EVENT_FLOWS.providerUnlink,
            source: SIGN_IN_METHOD_EVENT_SOURCES.manual,
          },
        },
      });
    });

    // Fire and forget: the notifier queues the mail and never throws.
    void this.notifications.sendAccountSecurityNotice(
      userId,
      "providerUnlinked",
      { provider },
    );
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
      select: { userId: true, user: { select: MATCH_SELECT } },
    });
  }

  /**
   * Side effects after the transaction committed; none of them may fail the
   * sign-in.
   *
   * Notice mail: `linked` tells the owner a provider was added to their
   * verified account. `tookOver` sends none: the provider just proved the
   * inbox, so the person signing in is the inbox owner, and the only party
   * a mail could reach is the unverified registrant, who never owned it.
   */
  private async afterResolved(
    identity: ProviderIdentity,
    resolution: Resolved,
  ): Promise<void> {
    const { userId, outcome } = resolution.result;
    if (outcome === "emailMatch") {
      // Context only: the sign-in opened the account by its verified e-mail
      // and wrote nothing. Ids only, no e-mail.
      this.sentry.addBreadcrumb({
        category: FLOW_TAG,
        message: `signed in by e-mail match, not linked: the account already has a ${identity.provider} link`,
        level: "info",
      });
      return;
    }
    if (outcome === "linked") {
      // Fire and forget: the notifier queues the mail and never throws.
      void this.notifications.sendAccountSecurityNotice(
        userId,
        "providerLinked",
        { provider: identity.provider },
      );
      return;
    }
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
      message: SIGN_IN_METHOD_EVENTS.socialLinkReset,
      level: "warning",
      tags: { provider: identity.provider, flow: FLOW_TAG },
      user: { id: userId },
    });
  }
}
