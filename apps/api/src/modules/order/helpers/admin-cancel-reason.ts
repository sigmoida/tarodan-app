import { defaultLocale, type Locale } from "@tarodan/i18n";
import {
  ADMIN_CANCEL_REASON_I18N_KEYS,
  type AdminCancelReasonCode,
} from "@tarodan/types";
import { translateMessage } from "../../i18n/translate";
import { offerAdminCancelReason } from "../../trade/helpers/trade-cancel-reasons";

/**
 * Yönetici (platform) iptalinin TARAFLARA görünen nedeni — TEK tanım. Alıcıya
 * ve satıcıya yalnız katalog kodunun etiketi söylenir; yöneticinin iç notu
 * hiçbir zaman bu yardımcılardan geçmez (yalnız denetim kaydına yazılır).
 */

/** Nedenin etiketi, verilen dilde (`adminCancel.reasons.*`). */
export function adminCancelReasonLabel(
  code: AdminCancelReasonCode,
  locale: Locale = defaultLocale,
): string {
  return translateMessage(ADMIN_CANCEL_REASON_I18N_KEYS[code], locale);
}

/**
 * `Order.cancelReason` / `Offer.cancelReason` / iade talebi açıklamasına
 * yazılan metin: teklif iptalinin yerleşik "Yönetici tarafından iptal
 * edildi: …" öneki + etiket. Önek panelde (`cancelReasonLabel`) ve
 * `cancellation_actor` göçünün aktör kuralında tanınır.
 */
export function adminCancelReasonText(code: AdminCancelReasonCode): string {
  return offerAdminCancelReason(adminCancelReasonLabel(code));
}
