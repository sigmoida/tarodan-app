import { guestApi } from "./client";

export type AppPlatform = "ios" | "android";

export interface AppConfigResponse {
  minSupportedVersion: { ios: string; android: string };
  latestVersion: { ios: string; android: string };
  /** true = client below minimum (must update); null when platform/version omitted. */
  updateRequired: boolean | null;
  /** true = a newer non-forced version exists; null when platform/version omitted. */
  updateAvailable: boolean | null;
}

/**
 * Public mobile bootstrap config (#232 / #233). Uses the unauthenticated guest
 * instance — it runs at launch before auth. Passing platform + appVersion lets
 * the server compute updateRequired / updateAvailable for this build.
 */
export const appConfigApi = {
  getAppConfig: (platform: AppPlatform, appVersion: string) =>
    guestApi.get<AppConfigResponse>("/app-config", {
      params: { platform, appVersion },
    }),
};
