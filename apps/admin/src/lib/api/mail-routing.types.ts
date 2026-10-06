import type { MailSenderAccountInput } from "@tarodan/types";

/**
 * Request/response shapes for the mail-routing domain module (`./mail-routing`).
 * Tek kaynak `@tarodan/types` (API ile paylaşılan sözleşme); burada yalnız
 * ekranın kullandığı adlarla yeniden dışa aktarılır.
 */
export type {
  MailAccountTestResult,
  MailAreaId,
  MailAreaState,
  MailAreaUpdate,
  MailDeliveryMode,
  MailInternalEventId,
  MailInternalEventState,
  MailRoutingState,
  MailSenderAccountInput,
  MailSenderAccountView,
} from "@tarodan/types";

/** Güncellemede her alan isteğe bağlıdır; parola yoksa saklı olan korunur. */
export type MailSenderAccountPatch = Partial<MailSenderAccountInput>;
