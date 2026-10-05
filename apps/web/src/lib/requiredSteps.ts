import { isConsentGateExempt } from "./consentGate";

/**
 * Girişten sonra üyenin siteyi kullanmadan önce tamamlaması gereken adımlar —
 * kapatılamaz pencerelerin TEK sırası ve TEK montaj noktası
 * (`RequiredStepsGate`). Aynı anda yalnız BİR adım gösterilir: iki kapı üst
 * üste binmez. Yeni bir zorunlu adım (ör. telefon doğrulama) buraya bir sıra
 * olarak eklenir — üçüncü bir üst üste modal olarak değil.
 *
 * Sıra hukuki önceliktir: önce sözleşme onayları (kimlik verisini işlemenin
 * dayanağı KVKK metnidir), sonra yasal kimlik.
 */
export const REQUIRED_STEPS = ["consents", "legalIdentity"] as const;
export type RequiredStep = (typeof REQUIRED_STEPS)[number];

/**
 * - `pending`: üye bu adımı tamamlamalı;
 * - `done`: tamam, muaf ya da istek başarısız (kapı açık kalır — sunucu zaten
 *   zorlamıyor, ağ hatası üyeyi kilitlememeli);
 * - `unknown`: durum henüz yükleniyor.
 */
export type RequiredStepState = "pending" | "done" | "unknown";

/** Bir sorgunun durumu → adım durumu (her adımın hook'u bunu kullanır). */
export function requiredStepState(input: {
  /** Sorgu çalışıyor mu (giriş yapmış üye). */
  enabled: boolean;
  /** İlk veri henüz gelmedi. */
  isPending: boolean;
  /** Veri geldi ve üyenin yapacağı bir şey var. */
  needed: boolean;
}): RequiredStepState {
  if (!input.enabled) return "done";
  if (input.isPending) return "unknown";
  return input.needed ? "pending" : "done";
}

/**
 * Gösterilecek adım: sıradaki İLK `pending`. Önceki bir adım hâlâ `unknown`
 * ise sonraki gösterilmez (beklenir) — aksi hâlde kimlik penceresi açılır,
 * onay sorgusu gelince onun yerini alır ve pencereler göz kırpar.
 */
export function activeRequiredStep(
  states: Record<RequiredStep, RequiredStepState>,
): RequiredStep | null {
  for (const step of REQUIRED_STEPS) {
    const state = states[step];
    if (state === "unknown") return null;
    if (state === "pending") return step;
  }
  return null;
}

/**
 * Hiçbir zorunlu adımın gösterilmediği yollar: onaylanacak yasal metinlerin
 * sayfaları (üye metni aynı sekmede okuyabilmeli). Liste onay kapısının
 * belge kataloğundan türetilir — tek kaynak.
 */
export function isRequiredStepExemptPath(pathname: string): boolean {
  return isConsentGateExempt(pathname);
}
