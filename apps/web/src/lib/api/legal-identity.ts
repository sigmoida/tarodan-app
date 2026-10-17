import type {
  LegalIdentityStatus,
  SubmitLegalIdentityRequest,
} from "@tarodan/types";
import { api } from "./client";

/**
 * Üyenin yasal kimliği (ad, soyad, TCKN). Sunucu yalnız eksik alanları ve
 * maskeli numarayı döner; tam numara bir kez gönderilir, bir daha okunmaz.
 */
export const legalIdentityApi = {
  /** Kimlik kapısı: eksik alanlar (boş `missing` = kapı kapalı). */
  getStatus: () => api.get<LegalIdentityStatus>("/legal-identity/me"),
  /** Yalnız eksik alanlar gönderilir; dolu alan değiştirilemez. */
  submit: (body: SubmitLegalIdentityRequest) =>
    api.post<LegalIdentityStatus>("/legal-identity/me", body),
};
