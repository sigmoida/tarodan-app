import type { Prisma } from "@prisma/client";
import {
  isSignInProvider,
  type LinkedSignInProvider,
  type SignInMethods,
} from "@tarodan/types";

/** The user columns the read model needs; the hash never leaves the mapper. */
export const SIGN_IN_METHODS_SELECT = {
  passwordHash: true,
  oauthAccounts: {
    select: { provider: true, email: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  },
} as const satisfies Prisma.UserSelect;

export interface SignInMethodsRow {
  passwordHash: string | null;
  oauthAccounts: { provider: string; email: string | null; createdAt: Date }[];
}

/**
 * The read model: whether the account has a password and which providers
 * are linked. The hash itself never leaves this function. Provider rows of
 * an unknown provider are not sign-in methods and are left out.
 *
 * The one mapping for the read (`SignInMethodsService`) and for the
 * last-method decision of an unlink (`SocialIdentityService`), so both judge
 * the same view of the account.
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
