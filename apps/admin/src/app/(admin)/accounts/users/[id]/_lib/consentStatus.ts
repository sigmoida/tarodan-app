import type { ConsentDocumentStatus } from "@tarodan/types";

/**
 * Kullanıcı dosyasındaki onay satırının durumu — saf türetim.
 *
 *   pending   : zorunlu belge, üye bir sonraki girişte yeniden onaya çağrılacak
 *               (hiç kaydı yok, eski sürüm ya da geri çekilmiş).
 *   granted   : en son kayıt onay.
 *   withdrawn : en son kayıt geri çekme (pazarlama, çerez).
 *   none      : zorunlu olmayan ve hiç kaydı olmayan belge.
 */
export type ConsentStatusTone = "pending" | "granted" | "withdrawn" | "none";

export function consentStatusTone(
  status: ConsentDocumentStatus,
): ConsentStatusTone {
  if (status.pending) return "pending";
  if (!status.latest) return "none";
  return status.latest.action === "withdrawn" ? "withdrawn" : "granted";
}

export const CONSENT_STATUS_BADGE = {
  pending: {
    variant: "warning",
    labelKey: "admin.consents.userSection.pending",
  },
  granted: { variant: "success", labelKey: "admin.consents.actions.granted" },
  withdrawn: {
    variant: "danger",
    labelKey: "admin.consents.actions.withdrawn",
  },
  none: { variant: "outline", labelKey: "admin.consents.userSection.none" },
} as const satisfies Record<
  ConsentStatusTone,
  { variant: string; labelKey: string }
>;
