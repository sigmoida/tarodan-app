/**
 * Tanıtım turlarının istemci tarafı kaydı — API'deki ONBOARDING_TOURS ile AYNI
 * anahtar/sürüm/kolon üçlüsünü taşır. İkisi ayrışırsa tur ya hiç açılmaz ya da
 * her girişte tekrar açılır, o yüzden sürüm artırılırken iki taraf birlikte
 * güncellenmelidir.
 */
export const ONBOARDING_TOURS = {
  home: { field: "homeTourVersion", version: 1 },
  listing: { field: "listingTourVersion", version: 1 },
};

export const HOME_TOUR_VERSION = ONBOARDING_TOURS.home.version;

/**
 * Tur açılmalı mı? Yalnız giriş yapmış, oturumu yüklenmiş ve bu turun güncel
 * sürümünü henüz görmemiş kullanıcıya gösterilir.
 */
export function shouldStartTour({
  isAuthenticated,
  isLoading,
  completedVersion,
  tour,
}) {
  const config = ONBOARDING_TOURS[tour];
  if (!config) return false;
  return (
    isAuthenticated && !isLoading && Number(completedVersion ?? 0) < config.version
  );
}

export function shouldStartHomeTour({
  isAuthenticated,
  isLoading,
  completedVersion,
}) {
  return shouldStartTour({
    isAuthenticated,
    isLoading,
    completedVersion,
    tour: "home",
  });
}

export function resolvePreferredLocale(preferredLanguage, currentLocale) {
  if (
    !["tr", "en"].includes(preferredLanguage) ||
    preferredLanguage === currentLocale
  ) {
    return null;
  }
  return preferredLanguage;
}
