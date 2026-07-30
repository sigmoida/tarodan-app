/**
 * Tanıtım turları — TEK kaynak.
 *
 * Her tur kullanıcıda kendi sürüm kolonunu taşır; sürüm artırıldığında tur o
 * kullanıcıya bir kez daha gösterilir. Yeni tur eklemek için buraya bir satır
 * (+ kolon migration'ı) yeterli: uç, DTO ve servis bu haritadan türetildiği için
 * ayrıca dokunmak gerekmez.
 */
export const ONBOARDING_TOURS = {
  home: { field: "homeTourVersion", version: 1 },
  listing: { field: "listingTourVersion", version: 1 },
} as const;

export type OnboardingTourKey = keyof typeof ONBOARDING_TOURS;

export const ONBOARDING_TOUR_KEYS = Object.keys(
  ONBOARDING_TOURS,
) as OnboardingTourKey[];

/** En yüksek tur sürümü — DTO üst sınırı (tur bazlı doğrulama servistedir). */
export const MAX_ONBOARDING_TOUR_VERSION = Math.max(
  ...Object.values(ONBOARDING_TOURS).map((tour) => tour.version),
);
