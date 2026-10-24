import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  SIGN_IN_METHODS_ERROR_CODES,
  type SignInMethods,
  type SignInProvider,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { errorMessage } from "../../../common/helpers/error-message";
import { i18nMessage, isLocalizedMessage } from "../../i18n";
import type { MessageKey } from "@tarodan/i18n";
import { SentryService } from "../../sentry/sentry.service";
import { AuthPasswordService } from "../auth-password.service";
import { AUTH_FLOW_TAG } from "../reauth/reauth.service";
import { AppleAuthService } from "../social/apple-auth.service";
import { AppleTokenService } from "../social/apple-token.service";
import { GoogleAuthService } from "../social/google-auth.service";
import {
  SocialIdentityService,
  type ProviderIdentity,
} from "../social/social-identity.service";
import type { AppleLinkDto, GoogleLinkDto } from "./dto/link-provider.dto";
import {
  SIGN_IN_METHODS_SELECT,
  toSignInMethods,
} from "./sign-in-methods.mapper";

/**
 * The provider services answer a bad token with 401, which both clients read
 * as an expired session. On a link the session is fine and only the provider
 * token is wrong, so it becomes a 400 with the same localized message.
 */
async function verifiedProviderToken<T>(
  verify: () => Promise<T>,
  fallback: MessageKey,
): Promise<T> {
  try {
    return await verify();
  } catch (error) {
    if (!(error instanceof UnauthorizedException)) throw error;
    const response = error.getResponse();
    throw new BadRequestException({
      ...(isLocalizedMessage(response) ? response : i18nMessage(fallback)),
      errorCode: SIGN_IN_METHODS_ERROR_CODES.providerTokenInvalid,
    });
  }
}

/**
 * A signed-in user's sign-in methods: the read model, plus the orchestration
 * of the writes on them. The writes live with their owners (passwords in
 * `AuthPasswordService`, provider links in `SocialIdentityService`); every
 * write answers the fresh read model so clients need no second request.
 */
@Injectable()
export class SignInMethodsService {
  private readonly logger = new Logger(SignInMethodsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: AuthPasswordService,
    private readonly sentry: SentryService,
    private readonly socialIdentity: SocialIdentityService,
    private readonly google: GoogleAuthService,
    private readonly apple: AppleAuthService,
    private readonly appleTokens: AppleTokenService,
  ) {}

  async getSignInMethods(userId: string): Promise<SignInMethods> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: SIGN_IN_METHODS_SELECT,
    });
    if (!row) {
      throw new NotFoundException(i18nMessage("server.auth.userNotFound"));
    }
    return toSignInMethods(row);
  }

  async setPassword(
    userId: string,
    newPassword: string,
  ): Promise<SignInMethods> {
    this.sentry.setTag(AUTH_FLOW_TAG, "password_set");
    try {
      await this.passwords.setPassword(userId, newPassword);
    } catch (error) {
      // An existing password or a lost race with a concurrent call: an
      // expected answer, kept as context rather than reported as an error.
      this.breadcrumbOnRefusal(error, "password_set");
      throw error;
    }
    return this.getSignInMethods(userId);
  }

  /** Links a Google account (web `code`, native `idToken`). */
  async linkGoogle(
    userId: string,
    proof: GoogleLinkDto,
  ): Promise<SignInMethods> {
    this.sentry.setTag(AUTH_FLOW_TAG, "provider_link");
    const profile = await verifiedProviderToken(
      () => this.google.verifyProof(proof),
      "server.auth.googleSessionVerifyFailed",
    );
    await this.link(userId, {
      provider: "google",
      providerUserId: profile.sub,
      email: profile.email,
    });
    return this.getSignInMethods(userId);
  }

  /**
   * Links an Apple account. A mobile link also sends `authorizationCode`; it
   * is stored after commit the same way login stores it, so an unlink or an
   * account deletion can revoke it at Apple.
   */
  async linkApple(userId: string, proof: AppleLinkDto): Promise<SignInMethods> {
    this.sentry.setTag(AUTH_FLOW_TAG, "provider_link");
    const profile = await verifiedProviderToken(
      () => this.apple.verifyIdentityToken(proof.identityToken),
      "server.auth.appleSessionVerifyFailed",
    );
    await this.link(userId, {
      provider: "apple",
      providerUserId: profile.sub,
      email: profile.email,
    });
    if (proof.authorizationCode) {
      // Not awaited: a slow Apple exchange must not hold the answer. The
      // service does not throw; the catch keeps a rejection from going unhandled.
      void this.appleTokens
        .storeFromAuthorizationCode({
          userId,
          appleUserId: profile.sub,
          clientId: profile.audience,
          authorizationCode: proof.authorizationCode,
        })
        .catch((error: unknown) =>
          this.logger.warn(
            `Apple token store failed after link (user=${userId}): ${errorMessage(error)}`,
          ),
        );
    }
    return this.getSignInMethods(userId);
  }

  async unlink(
    userId: string,
    provider: SignInProvider,
  ): Promise<SignInMethods> {
    this.sentry.setTag(AUTH_FLOW_TAG, "provider_unlink");
    try {
      await this.socialIdentity.unlinkFromUser(userId, provider);
    } catch (error) {
      // The last method kept, or a stale list: expected answers.
      this.breadcrumbOnRefusal(error, "provider_unlink");
      throw error;
    }
    return this.getSignInMethods(userId);
  }

  private async link(
    userId: string,
    identity: ProviderIdentity,
  ): Promise<void> {
    try {
      await this.socialIdentity.linkToUser(userId, identity);
    } catch (error) {
      // Already linked here or elsewhere, also a lost race: expected answers.
      this.breadcrumbOnRefusal(error, "provider_link");
      throw error;
    }
  }

  /** A 404 or 409 refusal is context, not an error; ids and codes only. */
  private breadcrumbOnRefusal(error: unknown, flow: string): void {
    if (
      !(error instanceof ConflictException) &&
      !(error instanceof NotFoundException)
    ) {
      return;
    }
    const response = (error as HttpException).getResponse();
    const errorCode =
      typeof response === "object" && response !== null
        ? (response as { errorCode?: unknown }).errorCode
        : undefined;
    this.sentry.addBreadcrumb({
      category: AUTH_FLOW_TAG,
      message: `${flow} refused${typeof errorCode === "string" ? `: ${errorCode}` : ""}`,
      level: "info",
    });
  }
}
