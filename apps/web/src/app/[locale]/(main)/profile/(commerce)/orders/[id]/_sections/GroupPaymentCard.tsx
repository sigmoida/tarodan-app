/** @format */

"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { formatDate, formatPrice } from "@/lib/format";
import type { ServerOrderGroup } from "../../_lib/types";

/**
 * Grubun TEK ödemesi (sepetin tamamı tek çekimdir) — alıcı görünümünde
 * kart ekstresiyle mutabakatın yapıldığı yer. Satıcı dilimi ödeme görmez.
 */
export default function GroupPaymentCard({
  group,
}: {
  group: ServerOrderGroup;
}) {
  const t = useTranslations();
  if (group.viewerRole !== "buyer" || !group.payment) return null;
  const { payment } = group;
  if (payment.status !== "completed") return null;

  return (
    <div className="rounded-lg border border-border bg-surface-elevated p-5">
      <h3 className="mb-3 font-semibold text-heading">
        {t("order.groupPaymentTitle")}
      </h3>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">{t("common.total")}</span>
          <span className="font-semibold text-heading">
            {formatPrice(payment.amount)}
          </span>
        </div>
        {payment.paidAt && (
          <div className="flex justify-between">
            <span className="text-muted">{t("order.paidAtLabel")}</span>
            <span>{formatDate(payment.paidAt)}</span>
          </div>
        )}
        {group.orders.length > 1 && (
          <p className="pt-1 text-xs text-subtle">
            {t("order.groupPaymentCovers", { count: group.orders.length })}
          </p>
        )}
      </div>
      <Link
        href="/profile/payments"
        className="mt-3 inline-block text-sm font-medium text-primary-600 transition-colors hover:text-primary-700"
      >
        {t("order.groupPaymentLink")}
      </Link>
    </div>
  );
}
