"use client";

import { Badge } from "@tarodan/ui";
import { useTranslations } from "next-intl";

export default function StatusCard({ isEnabled }: { isEnabled: boolean }) {
  const t = useTranslations();
  return (
    <div className="rounded-xl bg-surface-elevated p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <div>
            <h2 className="text-lg font-semibold text-heading">
              {t("settings.twoFactorTitle")}
            </h2>
            <p className="text-sm text-muted">
              {isEnabled
                ? t("settings.twoFactorEnabledDesc")
                : t("settings.twoFactorDisabledDesc")}
            </p>
          </div>
        </div>
        <Badge variant={isEnabled ? "success" : "secondary"}>
          {isEnabled ? t("common.active") : t("common.inactive")}
        </Badge>
      </div>
    </div>
  );
}
