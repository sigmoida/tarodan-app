import { frontendUrlForEnvironment } from "../../config/app-urls";

/**
 * Aktivasyon (e-posta doğrulama) mailinin ortak tanımı.
 *
 * Aynı mail iki yoldan gidiyor: tekil gönderim senkron (admin SMTP hatasını
 * anında görsün), toplu gönderim BullMQ kuyruğundan. İkisi de buradaki yükü
 * kullanır — aksi halde link, süre metni ve şablon anahtarı iki yerde tanımlı
 * olur ve sessizce ayrışır.
 *
 * Token ömrü ile maildeki "24 saat" cümlesi bilinçli olarak yan yana duruyor:
 * biri değişirse diğeri de değişmeli.
 */
export const EMAIL_VERIFICATION_TEMPLATE = "email-verification";
export const EMAIL_VERIFICATION_TTL_MS = 24 * 3600_000;
export const EMAIL_VERIFICATION_EXPIRES_IN_LABEL = "24 saat";

export interface EmailVerificationTemplateData {
  /** Şablonun {{name}} değişkeni. */
  name: string;
  /** {{displayName}} — eski admin şablonları bu adı kullanıyor. */
  displayName: string;
  verificationUrl: string;
  expiresIn: string;
  [key: string]: unknown;
}

/**
 * Linkin host'u `frontendUrlForEnvironment()`'tan gelir, `frontendUrl(LOCAL_…)`
 * değil: ikincisi `FRONTEND_URL` tanımsızsa PRODUCTION'da bile localhost linki
 * üretiyordu. Worker'ın marka bağlamı da aynı fonksiyonu kullanıyor, böylece
 * senkron ve kuyruklu mail aynı adrese işaret eder.
 */
export function buildEmailVerificationTemplateData(
  displayName: string | null | undefined,
  verificationToken: string,
): EmailVerificationTemplateData {
  const name = displayName || "";
  return {
    name,
    displayName: name,
    verificationUrl: `${frontendUrlForEnvironment()}/verify-email?token=${verificationToken}`,
    expiresIn: EMAIL_VERIFICATION_EXPIRES_IN_LABEL,
  };
}
