import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  isSignInProvider,
  type LinkedSignInProvider,
  type SignInMethods,
} from "@tarodan/types";
import { PrismaService } from "../../../prisma";
import { i18nMessage } from "../../i18n";
import { SentryService } from "../../sentry/sentry.service";
import { AuthPasswordService } from "../auth-password.service";
import { AUTH_FLOW_TAG } from "../reauth/reauth.service";

export interface SignInMethodsRow {
  passwordHash: string | null;
  oauthAccounts: { provider: string; email: string | null; createdAt: Date }[];
}

/**
 * The read model: whether the account has a password and which providers
 * are linked. The hash itself never leaves this function. Provider rows of
 * an unknown provider are not sign-in methods and are left out.
 */
export function toSignInMethods(row: SignInMethodsRow): SignInMethods {
  const providers: LinkedSignInProvider[] = [];
  for (const account of row.oauthAccounts) {
    if (!isSignInProvider(account.provider)) continue;
    providers.push({
      provider: account.provider,
      email: account.email,
      linkedAt: account.createdAt.toISOString(),
    });
  }
  // Truthy, as login, check-email, reauth and setPassword read it: a few
  // system and anonymised rows store an empty hash, which is no password.
  return { hasPassword: Boolean(row.passwordHash), providers };
}

/**
 * A signed-in user's sign-in methods: the read model, plus the orchestration
 * of the writes on them. The writes live with their owners (passwords in
 * `AuthPasswordService`, provider links in `SocialIdentityService`); every
 * write answers the fresh read model so clients need no second request.
 */
@Injectable()
export class SignInMethodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: AuthPasswordService,
    private readonly sentry: SentryService,
  ) {}

  async getSignInMethods(userId: string): Promise<SignInMethods> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        passwordHash: true,
        oauthAccounts: {
          select: { provider: true, email: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
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
      if (error instanceof ConflictException) {
        this.sentry.addBreadcrumb({
          category: AUTH_FLOW_TAG,
          message: "password_set refused: the account already has a password",
          level: "info",
        });
      }
      throw error;
    }
    return this.getSignInMethods(userId);
  }
}
