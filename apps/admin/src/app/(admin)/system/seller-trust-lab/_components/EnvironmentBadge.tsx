"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import type { SellerTrustLabEnvironment } from "@tarodan/types";

/** PROD, STAGING or the environment name; production reads as a danger. */
export function EnvironmentBadge({
  environment,
}: {
  environment: SellerTrustLabEnvironment;
}) {
  const t = useTranslations();
  const label = environment.isProd
    ? t("admin.system.sellerTrustLab.env.production")
    : environment.env === "staging"
      ? t("admin.system.sellerTrustLab.env.staging")
      : t("admin.system.sellerTrustLab.env.other", { env: environment.env });
  return (
    <Badge variant={environment.isProd ? "danger" : "outline"}>{label}</Badge>
  );
}
