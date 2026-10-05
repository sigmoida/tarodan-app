import { z } from "zod";
import { useTranslations } from "next-intl";
import { legalNameOptional, tcknOptional } from "@tarodan/ui/form";
import {
  LEGAL_IDENTITY_FIELDS,
  normalizeLegalName,
  normalizeTckn,
  type AdminCorrectLegalIdentityRequest,
  type LegalIdentityValues,
} from "@tarodan/types";

type T = ReturnType<typeof useTranslations<never>>;

/** Gerekçe tabanı — API DTO'su ile aynı (`AdminCorrectLegalIdentityDto`). */
export const CORRECTION_REASON_MIN = 5;
export const CORRECTION_REASON_MAX = 500;

/**
 * Admin düzeltme formu. Alanlar mevcut değerle dolu gelir; boş bırakılan alan
 * "değiştirme" demektir (sunucu da boş alanı gönderilmemiş sayar). Kural
 * `@tarodan/types`'tan — üyenin kimlik kapısıyla birebir aynı.
 */
export const legalIdentityCorrectionSchema = (t: T) =>
  z.object({
    legalFirstName: legalNameOptional(t("identity.validation.nameInvalid")),
    legalLastName: legalNameOptional(t("identity.validation.nameInvalid")),
    nationalId: tcknOptional(t("identity.validation.nationalIdInvalid")),
    reason: z
      .string()
      .trim()
      .min(CORRECTION_REASON_MIN, t("admin.users.legalIdentity.reasonRequired"))
      .max(
        CORRECTION_REASON_MAX,
        t("admin.catalog.common.maxChars", { max: CORRECTION_REASON_MAX }),
      ),
  });
export type LegalIdentityCorrectionValues = z.infer<
  ReturnType<typeof legalIdentityCorrectionSchema>
>;

/**
 * İstek gövdesi: yalnız GERÇEKTEN değişen alanlar (normalize edilmiş), artı
 * gerekçe. Değişmeyen alanı göndermek zararsız olurdu ama denetim kaydının
 * "değişen alanlar" listesini okunur tutmak için ayıklanır.
 */
export function correctionPayload(
  values: LegalIdentityCorrectionValues,
  current: LegalIdentityValues,
): AdminCorrectLegalIdentityRequest {
  const body: AdminCorrectLegalIdentityRequest = {
    reason: values.reason.trim(),
  };
  for (const field of LEGAL_IDENTITY_FIELDS) {
    const raw = values[field];
    if (!raw.trim()) continue;
    const next =
      field === "nationalId" ? normalizeTckn(raw) : normalizeLegalName(raw);
    if (next !== current[field]) body[field] = next;
  }
  return body;
}
