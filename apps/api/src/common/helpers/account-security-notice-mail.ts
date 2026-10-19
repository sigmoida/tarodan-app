import { frontendUrlForEnvironment } from "../../config/app-urls";
import { TR_TIME_ZONE } from "./tr-calendar";

/**
 * The account security notice mail: one managed template, one event
 * parameter. W2 (auto-link) and W3 (manual link, unlink, set password) build
 * the same payload here, so the copy and the links live in one place.
 */
export const ACCOUNT_SECURITY_NOTICE_TEMPLATE = "account-security-notice";

export const ACCOUNT_SECURITY_NOTICE_EVENTS = [
  "providerLinked",
  "providerUnlinked",
  "passwordSet",
] as const;

export type AccountSecurityNoticeEvent =
  (typeof ACCOUNT_SECURITY_NOTICE_EVENTS)[number];

export type AccountSecurityNoticeProvider = "google" | "apple";

const PROVIDER_LABELS: Record<AccountSecurityNoticeProvider, string> = {
  google: "Google",
  apple: "Apple",
};

/** Mails are Turkish only today (see the notification module guide). */
const NOTICE_COPY: Record<
  AccountSecurityNoticeEvent,
  { title: string; message: string }
> = {
  providerLinked: {
    title: "Hesabınıza {provider} ile giriş eklendi",
    message:
      "{date} tarihinde hesabınıza {provider} ile giriş bağlandı. Bu işlemi siz yaptıysanız bir şey yapmanıza gerek yok.",
  },
  providerUnlinked: {
    title: "Hesabınızdan {provider} ile giriş kaldırıldı",
    message:
      "{date} tarihinde hesabınızdan {provider} ile giriş kaldırıldı. Bu işlemi siz yaptıysanız bir şey yapmanıza gerek yok.",
  },
  passwordSet: {
    title: "Hesabınıza şifre eklendi",
    message:
      "{date} tarihinde hesabınız için bir şifre belirlendi. Bu işlemi siz yaptıysanız bir şey yapmanıza gerek yok.",
  },
};

const NOTICE_WARNING =
  "Siz yapmadıysanız hemen şifrenizi sıfırlayın ve destek ekibimize yazın.";

export interface AccountSecurityNoticeDetails {
  /** Required for the provider events; ignored for `passwordSet`. */
  provider?: AccountSecurityNoticeProvider;
  at?: Date;
}

export interface AccountSecurityNoticeInput extends AccountSecurityNoticeDetails {
  event: AccountSecurityNoticeEvent;
  name?: string | null;
}

export interface AccountSecurityNoticeTemplateData {
  name: string;
  /** Alias of `name`; admin-edited templates may use {{displayName}}. */
  displayName: string;
  event: AccountSecurityNoticeEvent;
  title: string;
  message: string;
  warning: string;
  resetUrl: string;
  supportUrl: string;
  [key: string]: unknown;
}

/** The member's calendar day: the server runs in UTC (see tr-calendar). */
function noticeDate(at: Date): string {
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: TR_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(at);
}

/**
 * Template payload for the notice. It carries a first name and links only:
 * no token, no e-mail address, no provider subject.
 */
export function buildAccountSecurityNoticeData(
  input: AccountSecurityNoticeInput,
): AccountSecurityNoticeTemplateData {
  const name = input.name || "";
  const frontendUrl = frontendUrlForEnvironment();
  const provider = input.provider ? PROVIDER_LABELS[input.provider] : "";
  const fill = (text: string) =>
    text
      .replace("{provider}", provider)
      .replace("{date}", noticeDate(input.at ?? new Date()));
  const copy = NOTICE_COPY[input.event];
  return {
    name,
    displayName: name,
    event: input.event,
    title: fill(copy.title),
    message: fill(copy.message),
    warning: NOTICE_WARNING,
    resetUrl: `${frontendUrl}/forgot-password`,
    supportUrl: `${frontendUrl}/support`,
  };
}
