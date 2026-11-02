import type { Locale, MessageKey, MessageValues } from "@tarodan/i18n";
import { frontendUrlForEnvironment } from "../../config/app-urls";
import { translateMessage } from "../../modules/i18n/translate";

/**
 * The "guest orders added to your account" mail. Sent after a guest order
 * claim moved at least one order onto an account (guest claim plan,
 * 2026-11-02, security follow-up to D1): whoever clicked the verification
 * link proved the inbox, but the password was set by whoever registered, so
 * the inbox owner is told and pointed at the password reset (which revokes
 * every session).
 *
 * Unlike the older Turkish-only mails, every line comes from the catalog
 * (`server.order.guestOrdersClaimedMail.*`) in the recipient's language; the
 * template only lays them out. It carries the count and links only: no order
 * number, address, name or e-mail.
 */
export const GUEST_ORDERS_CLAIMED_TEMPLATE = "guest-orders-claimed";

const KEY = "server.order.guestOrdersClaimedMail";

export interface GuestOrdersClaimedTemplateData {
  subject: string;
  title: string;
  greeting: string;
  message: string;
  warning: string;
  resetLabel: string;
  resetUrl: string;
  help: string;
  [key: string]: unknown;
}

export function buildGuestOrdersClaimedMailData(
  locale: Locale,
  orderCount: number,
): GuestOrdersClaimedTemplateData {
  const t = (part: string, values?: MessageValues) =>
    translateMessage(`${KEY}.${part}` as MessageKey, locale, values);
  const subject = t("subject");
  return {
    subject,
    title: subject,
    greeting: t("greeting"),
    message: t("message", { count: orderCount }),
    warning: t("warning"),
    resetLabel: t("resetButton"),
    resetUrl: `${frontendUrlForEnvironment()}/forgot-password`,
    help: t("help"),
  };
}
