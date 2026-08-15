/** @format */

import { CheckBadgeIcon } from "@heroicons/react/24/solid";
import { Badge } from "@tarodan/ui";
import UserAvatar from "@/components/UserAvatar";
import type { BusinessStats } from "../_lib/types";
import { getTranslations } from "next-intl/server";

export default async function BusinessHeader({
  company,
}: {
  company: BusinessStats["company"];
}) {
  const t = await getTranslations();
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface-elevated p-6">
      <UserAvatar
        displayName={company.displayName}
        companyName={company.name}
        avatarUrl={company.avatarUrl}
        size="lg"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-xl font-bold text-heading">
            {company.name || company.displayName}
          </h2>
          {company.isVerified && (
            <Badge
              variant="success"
              size="sm"
              icon={<CheckBadgeIcon className="h-4 w-4" />}
            >
              {t("page.business.businessheader.onayli")}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted">
          {t("page.business.businessheader.isletmeHesabi")}
        </p>
      </div>
    </div>
  );
}
