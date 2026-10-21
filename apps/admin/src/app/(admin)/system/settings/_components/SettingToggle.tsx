"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { Toggle } from "@tarodan/ui";
import { platformSettingOnOffValue } from "@tarodan/types";
import { adminApi } from "@/lib/api";
import { readSettingOn } from "@/lib/settings";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface SettingToggleProps {
  /** An on/off platform setting key (`isPlatformSettingOn` in `@tarodan/types`). */
  settingKey: string;
  label: string;
  helper: string;
  /**
   * Reads the raw settings response, for a setting with its own on/off rule
   * (`readBoostEnabled`: missing is on). Default `readSettingOn` (missing is
   * off). Must be a module-level function (it is the query's `select`).
   */
  read?: (raw: unknown) => boolean;
}

/**
 * One on/off platform setting as a labelled toggle. The API reads the
 * setting on each request, so a change applies without a deploy.
 */
export function SettingToggle({
  settingKey,
  label,
  helper,
  read,
}: SettingToggleProps) {
  const t = useTranslations();
  // `select` must be stable (see usePlatformSettings).
  const select = useCallback(
    (raw: unknown) => (read ? read(raw) : readSettingOn(raw, settingKey)),
    [read, settingKey],
  );
  const { data: on = false, isLoading } = usePlatformSettings(select);

  const save = useAdminMutation(
    (next: boolean) =>
      adminApi.updateSetting(settingKey, platformSettingOnOffValue(next)),
    {
      invalidates: ["platform-settings"],
      successMessage: t("admin.settings.saved"),
    },
  );

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="font-medium text-heading">{label}</p>
        <p className="mt-1 text-sm text-muted">{helper}</p>
      </div>
      <Toggle
        checked={on}
        onChange={(next) => save.mutate(next)}
        disabled={isLoading || save.isPending}
        label={label}
      />
    </div>
  );
}
