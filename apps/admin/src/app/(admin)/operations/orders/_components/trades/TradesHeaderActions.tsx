"use client";

import { Badge } from "@tarodan/ui";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { useResourceList } from "@/components/list";

/**
 * Header badge: the disputed-trade count. The review queue is reachable via the
 * status filter select in the toolbar, so no separate header button is needed —
 * this only surfaces disputes, and only when there are any.
 */
export function TradesHeaderActions() {
  const t = useTranslations();
  const { rows } = useResourceList<any>();

  const disputedCount = rows.filter((trade: any) => !!trade.dispute).length;
  if (disputedCount === 0) return null;

  return (
    <Badge
      variant="danger"
      size="lg"
      icon={<ExclamationTriangleIcon className="h-5 w-5 shrink-0" />}
    >
      {t("admin.operations.trades.disputedCount", { count: disputedCount })}
    </Badge>
  );
}
