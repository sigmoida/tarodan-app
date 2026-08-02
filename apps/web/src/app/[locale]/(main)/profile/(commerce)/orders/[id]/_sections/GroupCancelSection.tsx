/** @format */

"use client";

import { XCircleIcon } from "@heroicons/react/24/outline";
import { Button } from "@tarodan/ui";
import { SectionCard } from "@/components/ui";
import { useTranslations } from "next-intl";
import { isGroupCancellable, type ServerOrderGroup } from "../../_lib/types";

/**
 * Grup iptali (R4): iptal SEPET bazındadır — buton grup ekranında TEK yerde.
 * Herhangi bir üye kargoya verildiyse bölüm hiç görünmez (kısmi iptal yok;
 * kalan kalemler teslim sonrası iade akışını kullanır).
 */
export default function GroupCancelSection({
  group,
  onCancel,
}: {
  group: ServerOrderGroup;
  onCancel: () => void;
}) {
  const t = useTranslations();
  if (!isGroupCancellable(group)) return null;
  const isMulti = group.orders.length > 1;

  return (
    <SectionCard
      title={isMulti ? t("order.cancelGroupTitle") : t("order.cancelOrder")}
    >
      <p className="mb-4 text-sm text-muted">
        {isMulti
          ? t("order.cancelGroupAllNotice", { count: group.orders.length })
          : t("order.cancelRefundNotice")}
      </p>
      <Button variant="danger" size="sm" className="gap-1" onClick={onCancel}>
        <XCircleIcon className="h-4 w-4" />
        {isMulti ? t("order.cancelGroupTitle") : t("order.cancelOrder")}
      </Button>
    </SectionCard>
  );
}
