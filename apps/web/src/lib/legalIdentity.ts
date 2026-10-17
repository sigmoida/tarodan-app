import { z } from "zod";
import { legalName, tckn } from "@tarodan/ui/form";
import {
  LEGAL_IDENTITY_FIELDS,
  normalizeLegalName,
  normalizeTckn,
  type LegalIdentityField,
  type SubmitLegalIdentityRequest,
} from "@tarodan/types";

/**
 * Yasal kimlik formlarının (kayıt formu, kimlik kapısı) ortak parçaları.
 * Kural `@tarodan/types`'ta, zod sarmalayıcıları `@tarodan/ui/form`'da; burası
 * yalnız web'in iki formunu aynı şekilde kurar.
 */

export interface LegalIdentityMessages {
  nameInvalid: string;
  nationalIdInvalid: string;
}

/** Üç alanın zorunlu kuralları — kayıt formu şemasına yayılır. */
export const legalIdentityFields = (messages: LegalIdentityMessages) => ({
  legalFirstName: legalName(messages.nameInvalid),
  legalLastName: legalName(messages.nameInvalid),
  nationalId: tckn(messages.nationalIdInvalid),
});

/**
 * Kimlik kapısının şeması: yalnız EKSİK alanlar zorunludur; dolu alanlar
 * formda salt-okunur durur ve gönderilmez.
 */
export const legalIdentityGateSchema = (
  missing: readonly LegalIdentityField[],
  messages: LegalIdentityMessages,
) => {
  const rules = legalIdentityFields(messages);
  const pick = <F extends LegalIdentityField>(field: F) =>
    missing.includes(field) ? rules[field] : z.string();
  return z.object({
    legalFirstName: pick("legalFirstName"),
    legalLastName: pick("legalLastName"),
    nationalId: pick("nationalId"),
  });
};
export type LegalIdentityFormValues = Record<LegalIdentityField, string>;

/**
 * Sunucuya giden gövde: yalnız eksik alanlar, normalize edilmiş hâlde (TCKN
 * yalnız rakam, ad boşlukları teklenmiş). Dolu bir alanı göndermek sunucuda
 * "değiştirme girişimi" sayılırdı.
 */
export function legalIdentitySubmission(
  values: LegalIdentityFormValues,
  missing: readonly LegalIdentityField[],
): SubmitLegalIdentityRequest {
  const body: SubmitLegalIdentityRequest = {};
  for (const field of LEGAL_IDENTITY_FIELDS) {
    if (!missing.includes(field)) continue;
    body[field] =
      field === "nationalId"
        ? normalizeTckn(values[field])
        : normalizeLegalName(values[field]);
  }
  return body;
}
