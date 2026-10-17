import type {
  ConsentDocumentKey,
  OptionalCookieCategory,
  PendingConsentsResponse,
} from "@tarodan/types";
import { api } from "./client";

/**
 * Hukuki onay uçları. Sürüm ve kanıt (IP, kullanıcı ajanı) sunucuda
 * damgalanır; istemci yalnız "kabul ettim" der (bkz. docs/CONSENTS.md).
 */
export const consentsApi = {
  /** Yeniden-onay kapısı: üyenin onaylaması gereken belgeler (boş = açık). */
  getPending: () => api.get<PendingConsentsResponse>("/consents/me/pending"),
  accept: (documents: ConsentDocumentKey[]) =>
    api.post<PendingConsentsResponse>("/consents/me/accept", { documents }),
  /** Çerez bandı kaydı — giriş yapmamış ziyaretçide de çalışır. */
  recordCookiePreferences: (body: {
    visitorId: string;
    preferences: Record<OptionalCookieCategory, boolean>;
  }) => api.post<{ success: true }>("/consents/cookies", body),
};
