import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../../../prisma";
import { AuthResponseDto } from "../dto";
import { AuthTokenService } from "../auth-token.service";
import { StorageService } from "../../storage/storage.service";
import { GoogleAuthService } from "./google-auth.service";
import { AppleAuthService } from "./apple-auth.service";
import { AppleTokenService } from "./apple-token.service";
import { SocialIdentityService } from "./social-identity.service";
import { resolveAvatarUrl } from "../utils/avatar-url.util";
import { i18nMessage } from "../../i18n";
import {
  assertNotStaffAccount,
  STAFF_ACCOUNT_SELECT,
} from "../utils/staff-account";
import { stampUserLogin } from "../utils/login-stamp";

/**
 * Google and Apple sign-in.
 *
 * Both providers run the same three steps: verify the provider identity,
 * resolve it to an account (`SocialIdentityService`: existing link, link,
 * take-over or new account), then build the normal login response. The last
 * step (`buildUserAuthResponse`) lives here once: a provider login that
 * answered differently from password login, or skipped the second factor,
 * is exactly what copying this body would cause.
 */
@Injectable()
export class SocialLoginService {
  private readonly logger = new Logger(SocialLoginService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokenService,
    private readonly storageService: StorageService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly appleAuthService: AppleAuthService,
    private readonly appleTokens: AppleTokenService,
    private readonly socialIdentity: SocialIdentityService,
  ) {}

  /** The AuthResponseDto for a user id (same shape as the login response). */
  private async buildUserAuthResponse(
    userId: string,
  ): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        membership: { include: { tier: true } },
        twoFactorSecret: { select: { isEnabled: true } },
        ...STAFF_ACCOUNT_SELECT,
      },
    });
    if (!user) {
      throw new UnauthorizedException(i18nMessage("server.auth.userNotFound"));
    }
    // A staff account cannot open a web/mobile session via a provider either
    // (see login).
    assertNotStaffAccount(user);
    // No tokens for a deleted or banned row: the login would "succeed" and the
    // guard would refuse the first protected request (a confusing screen).
    if (user.deletedAt) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.accountDeleted"),
      );
    }
    if (user.isBanned) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.accountSuspended"),
      );
    }
    if (user.twoFactorSecret?.isEnabled) {
      throw new UnauthorizedException({
        ...i18nMessage("server.auth.socialTwoFactorPasswordRequired"),
        errorCode: "TWO_FACTOR_PASSWORD_REQUIRED",
      });
    }

    // Social sign-in stamps the login too; otherwise a Google/Apple-only account
    // counts as "never signed in" (admin deletion eligibility reads it).
    await stampUserLogin(this.prisma, this.logger, user.id);

    const tokens = await this.tokens.generateTokens(
      user.id,
      user.email,
      user.isSeller,
    );

    let membershipData = undefined;
    if (user.membership && user.membership.tier) {
      const tier = user.membership.tier;
      if (tier?.type && tier?.name) {
        membershipData = {
          tier: { type: String(tier.type), name: String(tier.name) },
          expiresAt: user.membership.currentPeriodEnd
            ? new Date(user.membership.currentPeriodEnd).toISOString()
            : undefined,
        };
      }
    }

    const resolvedAvatarUrl = await resolveAvatarUrl(
      this.storageService,
      user.avatarUrl,
    );

    return {
      user: {
        id: user.id,
        adminCode: user.adminCode,
        username: user.username,
        usernameClaimed: user.usernameClaimedAt != null,
        email: user.email,
        phone: user.phone ?? undefined,
        displayName: user.displayName,
        avatarUrl: resolvedAvatarUrl,
        isVerified: user.isVerified,
        isPhoneVerified: user.isPhoneVerified,
        isSeller: user.isSeller,
        sellerType: user.sellerType ?? undefined,
        createdAt: user.createdAt,
        membership: membershipData,
      },
      tokens,
    };
  }

  /**
   * Google sign-in: verify the id_token, resolve the identity to an account
   * (`SocialIdentityService`), then build the normal login response.
   */
  async loginWithGoogle(
    input: string | { idToken?: string; code?: string },
  ): Promise<AuthResponseDto> {
    // Backward compatible: mobile/native sends the id_token string; web sends
    // { code }, which the backend exchanges with Google for an id_token.
    const opts = typeof input === "string" ? { idToken: input } : input;
    const idToken = opts.code
      ? await this.googleAuthService.exchangeCodeForIdToken(opts.code)
      : opts.idToken;
    if (!idToken) {
      throw new UnauthorizedException(
        i18nMessage("server.auth.googleSessionInvalid"),
      );
    }
    const profile = await this.googleAuthService.verifyIdToken(idToken);
    const { userId } = await this.socialIdentity.resolveUser(
      { provider: "google", providerUserId: profile.sub, email: profile.email },
      { displayName: profile.name, avatarUrl: profile.picture },
    );
    return this.buildUserAuthResponse(userId);
  }

  /**
   * Apple sign-in: verify the identity token, resolve the identity to an
   * account, then build the normal login response. A relay e-mail is stored
   * as it is; the identity key is `sub`. `fullName` only arrives on the first
   * authorization (a new account).
   *
   * When `authorizationCode` (mobile 1.1.0+) is present, it is exchanged for a
   * refresh token IN THE BACKGROUND after the login response is built and
   * stored encrypted; it is revoked at Apple on account deletion (App Store
   * 5.1.1(v)). Login does not wait for it and this step never fails the login;
   * older clients that do not send the code keep working unchanged.
   */
  async loginWithApple(
    identityToken: string,
    fullName?: string,
    authorizationCode?: string,
  ): Promise<AuthResponseDto> {
    const profile =
      await this.appleAuthService.verifyIdentityToken(identityToken);
    const { userId } = await this.socialIdentity.resolveUser(
      { provider: "apple", providerUserId: profile.sub, email: profile.email },
      { displayName: fullName },
    );
    const response = await this.buildUserAuthResponse(userId);
    if (authorizationCode) {
      // Not awaited: a slow Apple exchange must not hold the login. The
      // service does not throw; the catch keeps a rejection from going unhandled.
      void this.appleTokens
        .storeFromAuthorizationCode({
          userId,
          appleUserId: profile.sub,
          // The code is exchanged with the client id the sign-in used.
          clientId: profile.audience,
          authorizationCode,
        })
        .catch((error: unknown) =>
          this.logger.warn(
            `Apple token store failed after login (user=${userId}): ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    }
    return response;
  }
}
