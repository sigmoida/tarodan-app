import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma";
import { compareVersions, isBelowMinimum } from "./app-config.util";

/**
 * PlatformSetting keys backing the mobile force-update gate (#232). Operators
 * tune these via the existing generic `PATCH /admin/settings/:key` — no redeploy.
 */
export const APP_CONFIG_SETTING_KEYS = {
  minIos: "min_supported_app_version_ios",
  minAndroid: "min_supported_app_version_android",
  latestIos: "latest_app_version_ios",
  latestAndroid: "latest_app_version_android",
} as const;

/** Fallback when a key has never been set (never blocks a client). */
const DEFAULT_VERSION = "1.0.0";

export interface PlatformVersions {
  ios: string;
  android: string;
}

export interface AppConfigResponse {
  minSupportedVersion: PlatformVersions;
  latestVersion: PlatformVersions;
  /** true = client below minimum (must update). null when platform/appVersion not supplied. */
  updateRequired: boolean | null;
  /** true = a newer (non-forced) version exists. null when platform/appVersion not supplied. */
  updateAvailable: boolean | null;
}

@Injectable()
export class AppConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getAppConfig(
    platform?: "ios" | "android",
    appVersion?: string,
  ): Promise<AppConfigResponse> {
    const keys = Object.values(APP_CONFIG_SETTING_KEYS);
    const rows = await this.prisma.platformSetting.findMany({
      where: { settingKey: { in: keys } },
      select: { settingKey: true, settingValue: true },
    });
    const map = new Map(rows.map((r) => [r.settingKey, r.settingValue]));

    const minSupportedVersion: PlatformVersions = {
      ios: map.get(APP_CONFIG_SETTING_KEYS.minIos) || DEFAULT_VERSION,
      android: map.get(APP_CONFIG_SETTING_KEYS.minAndroid) || DEFAULT_VERSION,
    };
    // latest defaults to the minimum, so `updateAvailable` is false until an
    // operator explicitly advertises a newer non-forced release.
    const latestVersion: PlatformVersions = {
      ios:
        map.get(APP_CONFIG_SETTING_KEYS.latestIos) || minSupportedVersion.ios,
      android:
        map.get(APP_CONFIG_SETTING_KEYS.latestAndroid) ||
        minSupportedVersion.android,
    };

    let updateRequired: boolean | null = null;
    let updateAvailable: boolean | null = null;
    if (platform && appVersion) {
      updateRequired = isBelowMinimum(
        appVersion,
        minSupportedVersion[platform],
      );
      updateAvailable =
        compareVersions(appVersion, latestVersion[platform]) < 0;
    }

    return {
      minSupportedVersion,
      latestVersion,
      updateRequired,
      updateAvailable,
    };
  }
}
