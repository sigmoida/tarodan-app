import {
  ADMIN_CANCEL_REASON_CODES,
  ADMIN_CANCEL_REASON_I18N_KEYS,
  isAdminCancelReasonCode,
  type AdminCancelReasonCode,
  type CancellationActorValue,
} from "@tarodan/types";
import type { useTranslations } from "next-intl";

type T = ReturnType<typeof useTranslations<never>>;

/**
 * Platform (admin) iptal nedenleri — panelin tek okuma noktası. Seçenekler ve
 * etiketler `@tarodan/types` kataloğundan gelir; taraflara giden etiketle aynı
 * anahtarlar (`adminCancel.reasons.*`).
 */

/** İptal formundaki nedenler (katalog sırası). */
export function adminCancelReasonOptions(
  t: T,
): { value: AdminCancelReasonCode; label: string }[] {
  return ADMIN_CANCEL_REASON_CODES.map((code) => ({
    value: code,
    label: t(ADMIN_CANCEL_REASON_I18N_KEYS[code]),
  }));
}

/** Liste filtresi: "Tümü" + nedenler. */
export function adminCancelReasonFilterOptions(
  t: T,
): { value: string; label: string }[] {
  return [
    { value: "all", label: t("common.all") },
    ...adminCancelReasonOptions(t),
  ];
}

/**
 * Kayıt bir PLATFORM iptaliyse katalog kodu; değilse (ya da kod tanınmıyorsa)
 * `null`. Liste satırı da takas dosyası da bu yüklemle karar verir.
 */
export function platformCancelReasonCode(record: {
  cancelledBy?: CancellationActorValue | null;
  adminCancelReasonCode?: string | null;
}): AdminCancelReasonCode | null {
  return record.cancelledBy === "platform" &&
    isAdminCancelReasonCode(record.adminCancelReasonCode)
    ? record.adminCancelReasonCode
    : null;
}

/** Kodun etiketi, admin'in dilinde. */
export function adminCancelReasonLabel(
  code: AdminCancelReasonCode,
  t: T,
): string {
  return t(ADMIN_CANCEL_REASON_I18N_KEYS[code]);
}
