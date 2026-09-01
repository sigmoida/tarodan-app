import type { MessageKey } from "@tarodan/i18n";
import type { UserAccountAction } from "./bulkEligibility";

export interface BulkResultMessage {
  key: MessageKey;
  values: { ok: number; failed: number };
  tone: "success" | "warning" | "error";
}

/**
 * Toplu işlem sonucunun hangi metinle bildirileceği.
 *
 * "resend" ayrı duruyor çünkü o yol maili KUYRUĞA alıyor: "50 başarılı" demek
 * "50 mail gitti" anlamına gelirdi, oysa gönderim arka planda ve sonradan
 * başarısız olabilir. Diğer aksiyonlar (engelle/engeli kaldır/manuel aktive
 * et) senkron tamamlandığı için eski metni kullanır.
 */
export function bulkResultMessage(
  action: UserAccountAction,
  ok: number,
  failed: number,
): BulkResultMessage {
  const values = { ok, failed };
  if (ok === 0) {
    return { key: "admin.users.bulkFailedAll", values, tone: "error" };
  }
  if (action === "resend") {
    return failed === 0
      ? { key: "admin.users.bulkResendQueued", values, tone: "success" }
      : {
          key: "admin.users.bulkResendQueuedPartial",
          values,
          tone: "warning",
        };
  }
  return {
    key: "admin.users.bulkResult",
    values,
    tone: failed === 0 ? "success" : "warning",
  };
}

/** Toplu onay diyaloğunun açıklaması — kuyruklanan yol farklı söz veriyor. */
export function bulkConfirmDescriptionKey(
  action: UserAccountAction,
): MessageKey {
  return action === "resend"
    ? "admin.users.bulkResendConfirmDesc"
    : "admin.users.bulkConfirmDesc";
}
