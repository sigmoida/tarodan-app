/**
 * Resolves the Sentry `environment` tag. An explicit
 * `NEXT_PUBLIC_SENTRY_ENVIRONMENT` always wins. Without it the tag is derived
 * from the deployment's public app URL, so a build that lost the variable
 * still lands in the right environment instead of an empty or mixed one.
 *
 * Never derived from `NODE_ENV`: the Dockerfile sets it to `production` on
 * staging too. An unrecognised host reads as "unknown" on purpose, so a
 * misconfigured build is visible in Sentry instead of posing as production.
 */
export function resolveSentryEnvironment(
  explicit: string | undefined,
  appUrl: string | undefined,
): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;

  let host: string;
  try {
    host = new URL(appUrl?.trim() ?? "").hostname.toLowerCase();
  } catch {
    return "unknown";
  }

  if (host === "localhost" || host === "127.0.0.1") return "development";
  if (host.split(".").some((part) => part.includes("staging")))
    return "staging";
  if (host === "tarodan.com.tr" || host.endsWith(".tarodan.com.tr")) {
    return "production";
  }
  return "unknown";
}
