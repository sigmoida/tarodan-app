import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import {
  isPlatformSettingOn,
  REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING,
  SIGN_IN_METHODS_ERROR_CODES,
  type ReauthResponse,
  type SignInProvider,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { getRequestClientInfo } from "../../../common/context/request-context";
import { errorMessage } from "../../../common/helpers/error-message";
import { CacheService } from "../../cache/cache.service";
import { i18nMessage } from "../../i18n";
import { SentryService } from "../../sentry/sentry.service";
import { AppleAuthService } from "../social/apple-auth.service";
import { GoogleAuthService } from "../social/google-auth.service";
import type { ReauthDto } from "./dto/reauth.dto";

/** How long a step-up token is accepted (plan D4: 5 minutes). */
export const REAUTH_TOKEN_TTL_SECONDS = 300;
/** Failed proofs per user before the step-up locks (plan D4). */
export const REAUTH_MAX_FAILURES = 5;
/** The window the failures are counted in (plan D4: 15 minutes). */
export const REAUTH_FAILURE_WINDOW_SECONDS = 900;
/** A provider proof must come from a sign-in at most this old (plan D4). */
export const REAUTH_PROVIDER_MAX_AGE_SECONDS = 300;
/** A real token is 43 characters (32 bytes, base64url); longer is not ours. */
export const REAUTH_TOKEN_MAX_LENGTH = 128;

const REAUTH_TOKEN_BYTES = 32;

/** Sentry tag that names the sign-in methods flow of a request. */
export const AUTH_FLOW_TAG = "auth.flow";

/** Security log event types written here (admin system logs label them). */
export const REAUTH_SECURITY_EVENTS = {
  failed: "reauth_failed",
  locked: "reauth_locked",
} as const;

export type ReauthMethod = "password" | SignInProvider;

interface StoredReauth {
  userId: string;
}

/**
 * Redis keys. The token is stored by its SHA-256 only, so neither Redis nor a
 * key listing reveals a usable token.
 */
const tokenKey = (token: string) =>
  `reauth:${crypto.createHash("sha256").update(token).digest("hex")}`;
const failuresKey = (userId: string) => `reauth:failures:${userId}`;

/** 403, never 401: both clients treat 401 as an expired session. */
export function reauthRequiredError(): ForbiddenException {
  return new ForbiddenException({
    ...i18nMessage("server.auth.reauthRequired"),
    errorCode: SIGN_IN_METHODS_ERROR_CODES.reauthRequired,
  });
}

function reauthFailedError(): ForbiddenException {
  return new ForbiddenException({
    ...i18nMessage("server.auth.reauthFailed"),
    errorCode: SIGN_IN_METHODS_ERROR_CODES.reauthFailed,
  });
}

function reauthUnavailableError(): ServiceUnavailableException {
  return new ServiceUnavailableException({
    ...i18nMessage("server.auth.reauthUnavailable"),
    errorCode: SIGN_IN_METHODS_ERROR_CODES.reauthUnavailable,
  });
}

/**
 * Step-up: a signed-in user proves it is them again before a sensitive write
 * and gets a short-lived opaque token for it (`ReauthGuard` checks it).
 *
 * - The proof is the password when the account has one; a provider proof is
 *   then refused (a password is the stronger proof, and every 2FA account has
 *   one). An account without a password proves itself with a fresh sign-in of
 *   a provider linked to it.
 * - The token lives in Redis only, bound to the user, for
 *   `REAUTH_TOKEN_TTL_SECONDS`, and may be used several times in that time.
 *   With Redis down no token is issued and none is accepted (fails closed).
 * - Attempts are counted per user before the proof is checked; after
 *   `REAUTH_MAX_FAILURES` failures within the window the step-up answers 429
 *   until the window ends. With Redis down no proof is checked (503).
 *
 * Not a JWT on purpose: `JwtStrategy` checks no token type, so a step-up JWT
 * signed with `JWT_SECRET` would also pass as an access token.
 */
@Injectable()
export class ReauthService {
  private readonly logger = new Logger(ReauthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly google: GoogleAuthService,
    private readonly apple: AppleAuthService,
    private readonly sentry: SentryService,
  ) {}

  async reauthenticate(
    userId: string,
    proof: ReauthDto,
  ): Promise<ReauthResponse> {
    this.sentry.setTag(AUTH_FLOW_TAG, "reauth");

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, deletedAt: true },
    });
    if (!user || user.deletedAt) throw reauthFailedError();

    const method: ReauthMethod = proof.provider ?? "password";
    if (method !== "password" && user.passwordHash) {
      throw new BadRequestException({
        ...i18nMessage("server.auth.reauthMethodNotAllowed"),
        errorCode: SIGN_IN_METHODS_ERROR_CODES.reauthMethodNotAllowed,
      });
    }

    const attempt = await this.reserveAttempt(userId);
    const proven =
      method === "password"
        ? await this.isPasswordProof(user.passwordHash, proof.password)
        : await this.isProviderProof(userId, method, proof);
    if (!proven) {
      await this.recordFailure(userId, method, attempt);
      throw reauthFailedError();
    }

    await this.cache.del(failuresKey(userId));
    return this.issueToken(userId);
  }

  /** True only for a live token issued to this user. Redis down: false. */
  async isValidToken(userId: string, token: unknown): Promise<boolean> {
    if (
      typeof token !== "string" ||
      token.length === 0 ||
      token.length > REAUTH_TOKEN_MAX_LENGTH
    ) {
      return false;
    }
    const stored = await this.cache.get<StoredReauth>(tokenKey(token));
    return stored?.userId === userId;
  }

  /**
   * Whether account deletion and the e-mail change request need a token even
   * when none is sent (`REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING`, off
   * by default). Read on every such request, uncached: both routes are rare,
   * and switching the setting on takes effect at once. A failed read throws,
   * so the request fails instead of passing without a step-up.
   */
  async isRequiredForSensitiveActions(): Promise<boolean> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { settingKey: REAUTH_REQUIRED_FOR_SENSITIVE_ACTIONS_SETTING },
      select: { settingValue: true },
    });
    return isPlatformSettingOn(row?.settingValue);
  }

  /**
   * Counts the attempt BEFORE the proof is checked: `incr` is atomic, so
   * parallel requests get distinct numbers and only the first
   * `REAUTH_MAX_FAILURES` of a window reach the (slow) comparison. A success
   * clears the counter, so it holds the failures of the window.
   *
   * Fails closed: `incr` answers 0 when Redis is down, and then no proof is
   * checked at all. Otherwise the lockout would be off and a right guess
   * (503 at issuance) would read differently from a wrong one (403).
   */
  private async reserveAttempt(userId: string): Promise<number> {
    const key = failuresKey(userId);
    const attempt = await this.cache.incr(key);
    if (attempt === 0) throw reauthUnavailableError();
    // The window starts with the first attempt. A key left without a TTL (an
    // expire lost after the incr) would lock the user for good, so it is
    // repaired on the next attempt.
    if (attempt === 1 || (await this.cache.ttl(key)) === -1) {
      await this.cache.expire(key, REAUTH_FAILURE_WINDOW_SECONDS);
    }
    if (attempt > REAUTH_MAX_FAILURES) {
      throw new HttpException(
        {
          ...i18nMessage("server.auth.reauthLocked"),
          errorCode: SIGN_IN_METHODS_ERROR_CODES.reauthLocked,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return attempt;
  }

  private async isPasswordProof(
    passwordHash: string | null,
    password: string | undefined,
  ): Promise<boolean> {
    // An account without a password has nothing to compare against: a failed
    // proof, the same answer as a wrong password.
    if (!passwordHash || !password) return false;
    return bcrypt.compare(password, passwordHash);
  }

  /**
   * A fresh sign-in of a provider identity linked to this user. The provider
   * services verify signature, audience, expiry and the verified e-mail; any
   * rejection there is a failed proof here (never their 401).
   */
  private async isProviderProof(
    userId: string,
    provider: SignInProvider,
    proof: ReauthDto,
  ): Promise<boolean> {
    let identity: { sub: string; issuedAt?: number } | null;
    try {
      identity = await this.verifyProvider(provider, proof);
    } catch (error) {
      this.logger.warn(
        `Reauth provider proof rejected (user=${userId}, provider=${provider}): ${errorMessage(error)}`,
      );
      return false;
    }
    if (!identity || !isFresh(identity.issuedAt)) return false;

    const link = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerUserId: { provider, providerUserId: identity.sub },
      },
      select: { userId: true },
    });
    return link?.userId === userId;
  }

  private async verifyProvider(
    provider: SignInProvider,
    proof: ReauthDto,
  ): Promise<{ sub: string; issuedAt?: number } | null> {
    if (provider === "google") {
      const idToken = proof.code
        ? await this.google.exchangeCodeForIdToken(proof.code)
        : proof.idToken;
      if (!idToken) return null;
      return this.google.verifyIdToken(idToken);
    }
    if (!proof.identityToken) return null;
    return this.apple.verifyIdentityToken(proof.identityToken);
  }

  /** `attempt` is the reserved number; the failure keeps it counted. */
  private async recordFailure(
    userId: string,
    method: ReauthMethod,
    attempt: number,
  ): Promise<void> {
    await this.writeSecurityLog(REAUTH_SECURITY_EVENTS.failed, "medium", {
      userId,
      method,
    });
    // Attempt numbers are unique, so exactly one failure reaches the limit.
    if (attempt === REAUTH_MAX_FAILURES) {
      await this.writeSecurityLog(REAUTH_SECURITY_EVENTS.locked, "high", {
        userId,
        method,
      });
      this.logger.warn(`Reauth locked (user=${userId}, method=${method})`);
      this.sentry.captureEvent({
        message: REAUTH_SECURITY_EVENTS.locked,
        level: "warning",
        tags: { [AUTH_FLOW_TAG]: "reauth", method },
        user: { id: userId },
      });
    }
  }

  private async issueToken(userId: string): Promise<ReauthResponse> {
    const reauthToken = crypto
      .randomBytes(REAUTH_TOKEN_BYTES)
      .toString("base64url");
    const expiresAt = new Date(Date.now() + REAUTH_TOKEN_TTL_SECONDS * 1000);
    const stored = await this.cache.setIfAbsent(
      tokenKey(reauthToken),
      REAUTH_TOKEN_TTL_SECONDS,
      { userId } satisfies StoredReauth,
    );
    // A token that was not stored would be refused by every guarded route.
    if (!stored) {
      this.logger.error(`Reauth token could not be stored (user=${userId})`);
      throw reauthUnavailableError();
    }
    return { reauthToken, expiresAt: expiresAt.toISOString() };
  }

  /** Ids and the method only: never a token, a password or its hash. */
  private async writeSecurityLog(
    eventType: string,
    severity: "medium" | "high",
    details: { userId: string; method: ReauthMethod },
  ): Promise<void> {
    const { ipAddress, userAgent } = getRequestClientInfo();
    try {
      await this.prisma.securityLog.create({
        data: {
          eventType,
          severity,
          userId: details.userId,
          ipAddress,
          userAgent,
          details: { method: details.method, flow: "reauth" },
        },
      });
    } catch (error) {
      // A logging failure must not change the answer of the step-up.
      this.logger.warn(
        `Failed to write ${eventType} security log: ${errorMessage(error)}`,
      );
    }
  }
}

function isFresh(issuedAt: number | undefined): boolean {
  if (issuedAt === undefined) return false;
  const ageSeconds = Date.now() / 1000 - issuedAt;
  return ageSeconds <= REAUTH_PROVIDER_MAX_AGE_SECONDS;
}
