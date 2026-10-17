import {
  ADMIN_CANCEL_NOTE_MAX,
  isAdminCancelReasonCode,
  type AdminCancelReasonCode,
  type AdminCancelRequest,
} from "./admin-cancellation";

/**
 * `AdminCancelRequest`'in geçerlilik kuralı — TEK kaynak. API (her admin
 * iptal ucu) ve admin paneli (iptal diyaloğunun onay düğmesi) aynı kuralı
 * okur: neden katalogdan bir kod olmalı; "Diğer" seçildiyse iç not zorunlu;
 * not üst sınırı aşamaz. Not yalnız denetim kaydına gider, taraflara asla.
 */
export type AdminCancelRequestProblem =
  "reason_missing" | "note_required" | "note_too_long";

/** Notun saklanan hâli: kırpılmış metin, boşsa null. */
export function normalizeAdminCancelNote(
  note: string | null | undefined,
): string | null {
  const trimmed = typeof note === "string" ? note.trim() : "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * "Diğer" seçilince iç not zorunludur (taraflara yalnız kodun etiketi gider;
 * "Diğer" tek başına admin denetimi için yetersiz bir açıklamadır). Sipariş ve
 * takas iptali aynı kuralı okur.
 */
export function isAdminCancelNoteRequired(
  reasonCode: AdminCancelReasonCode,
): boolean {
  return reasonCode === "other";
}

/** İsteğin ilk sorunu; geçerliyse null. */
export function adminCancelRequestProblem(
  request: Partial<AdminCancelRequest> | null | undefined,
): AdminCancelRequestProblem | null {
  if (!request || !isAdminCancelReasonCode(request.reasonCode)) {
    return "reason_missing";
  }
  const note = normalizeAdminCancelNote(request.note);
  if (note && note.length > ADMIN_CANCEL_NOTE_MAX) return "note_too_long";
  if (isAdminCancelNoteRequired(request.reasonCode) && !note) {
    return "note_required";
  }
  return null;
}
