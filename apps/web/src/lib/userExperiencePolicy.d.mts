/**
 * `userExperiencePolicy.mjs` düz ESM olarak kalıyor ki `node --test` onu derleme
 * olmadan içe alabilsin (scripts/user-experience-policy.test.mjs). Tipler burada
 * bildirilir — değerlerin tek kaynağı yine .mjs dosyasıdır.
 */

export type OnboardingTourKey = "home" | "listing";

export interface OnboardingTourConfig {
  /** Kullanıcı üzerindeki sürüm alanı (API ile aynı ad). */
  field: "homeTourVersion" | "listingTourVersion";
  version: number;
}

export const ONBOARDING_TOURS: Record<
  OnboardingTourKey,
  OnboardingTourConfig
>;

export const HOME_TOUR_VERSION: number;

export function shouldStartTour(input: {
  isAuthenticated: boolean;
  isLoading: boolean;
  completedVersion: number | undefined;
  tour: OnboardingTourKey;
}): boolean;

export function shouldStartHomeTour(input: {
  isAuthenticated: boolean;
  isLoading: boolean;
  completedVersion: number | undefined;
}): boolean;

export function resolvePreferredLocale(
  preferredLanguage: string | undefined,
  currentLocale: string,
): string | null;
