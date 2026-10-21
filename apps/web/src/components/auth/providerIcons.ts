import type { SignInProvider } from "@tarodan/types";
import { AppleIcon } from "./AppleIcon";
import { GoogleIcon } from "./GoogleIcon";

/** The brand icon of each sign-in provider (names: `SIGN_IN_PROVIDER_NAMES`). */
export const SIGN_IN_PROVIDER_ICONS: Record<SignInProvider, typeof GoogleIcon> =
  {
    google: GoogleIcon,
    apple: AppleIcon,
  };
