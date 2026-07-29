export const HOME_TOUR_VERSION = 1;

export function shouldStartHomeTour({
  isAuthenticated,
  isLoading,
  completedVersion,
}) {
  return (
    isAuthenticated &&
    !isLoading &&
    Number(completedVersion ?? 0) < HOME_TOUR_VERSION
  );
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
