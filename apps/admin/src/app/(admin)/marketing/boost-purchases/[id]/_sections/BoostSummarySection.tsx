"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@tarodan/ui";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { TextLink } from "@/components/TextLink";
import { fmtDateTime, fmtTry } from "@/lib/format";
import { purchaseSourceConfig, type BoostPurchase } from "../../_lib/types";

/** Seconds left as "3 days 4 hours" or "4 hours"; nothing left is a dash. */
function useFormatRemaining() {
  const t = useTranslations();
  return (seconds: number) => {
    if (seconds <= 0) return "—";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return days > 0
      ? t("admin.marketing.boostPurchases.remainingDaysHours", { days, hours })
      : t("admin.marketing.boostPurchases.remainingHours", { hours });
  };
}

/**
 * When and how long the boost runs, where it came from (purchase with its
 * order and payment, or a free grant with who and why) and, once stopped,
 * who stopped it, why, and what was refunded.
 */
export function BoostSummarySection({ purchase }: { purchase: BoostPurchase }) {
  const t = useTranslations();
  const formatRemaining = useFormatRemaining();
  const isGrant = purchase.source === "admin_grant";
  const stopped = purchase.cancelledAt || purchase.cancelledBy;

  return (
    <div className="space-y-6">
      <Panel>
        <DataList>
          <Field
            layout="stacked"
            label={t("admin.marketing.boostPurchases.sourceLabel")}
          >
            <Badge status={purchase.source} config={purchaseSourceConfig(t)} />
          </Field>
          <Field
            layout="stacked"
            label={t("admin.marketing.boostPurchases.purchasedAt")}
          >
            {fmtDateTime(purchase.purchasedAt ?? purchase.createdAt) ?? "—"}
          </Field>
          <Field
            layout="stacked"
            label={t("admin.marketing.boostPurchases.period")}
          >
            {`${fmtDateTime(purchase.startsAt) ?? "—"} - ${fmtDateTime(purchase.endsAt) ?? "—"}`}
          </Field>
          <Field
            layout="stacked"
            label={t("admin.marketing.boostPurchases.remaining")}
          >
            {formatRemaining(purchase.remainingSeconds)}
          </Field>
          <Field
            layout="stacked"
            label={t("admin.marketing.boostPurchases.totalDuration")}
          >
            {t("admin.marketing.boostPurchases.totalDaysValue", {
              days: purchase.durationDays + purchase.extendedDays,
              extended: purchase.extendedDays,
            })}
          </Field>
          {purchase.showcaseOnHome && (
            <Field
              layout="stacked"
              label={t("admin.marketing.boostPurchases.detail.showcaseEndsAt")}
            >
              {fmtDateTime(purchase.showcaseEndsAt) ?? "—"}
            </Field>
          )}
        </DataList>
      </Panel>

      <Panel>
        <DataList>
          {isGrant ? (
            <>
              <Field
                layout="stacked"
                label={t("admin.marketing.boostPurchases.detail.grantedBy")}
              >
                {purchase.grantedBy?.name ?? "—"}
              </Field>
              <Field
                layout="stacked"
                label={t("admin.marketing.boostPurchases.detail.grantReason")}
              >
                {purchase.grantReason ?? "—"}
              </Field>
            </>
          ) : (
            <>
              <Field
                layout="stacked"
                label={t("admin.marketing.boostPurchases.price")}
              >
                {fmtTry(purchase.price)}
              </Field>
              <Field
                layout="stacked"
                label={t(
                  "admin.marketing.boostPurchases.detail.refundedAmount",
                )}
              >
                {fmtTry(purchase.refundedAmount)}
              </Field>
              <Field
                layout="stacked"
                label={t("admin.finance.common.orderNumber")}
              >
                {purchase.orderId && purchase.orderNumber ? (
                  <TextLink href={`/operations/orders/${purchase.orderId}`}>
                    {purchase.orderNumber}
                  </TextLink>
                ) : (
                  "—"
                )}
              </Field>
              <Field
                layout="stacked"
                label={t("admin.finance.payments.paymentId")}
              >
                {purchase.paymentId ? (
                  <TextLink href={`/finance/payments/${purchase.paymentId}`}>
                    {purchase.paymentId}
                  </TextLink>
                ) : (
                  "—"
                )}
              </Field>
            </>
          )}
          {stopped && (
            <>
              <Field
                layout="stacked"
                label={t("admin.marketing.boostPurchases.detail.cancelledAt")}
              >
                {fmtDateTime(purchase.cancelledAt) ?? "—"}
              </Field>
              <Field
                layout="stacked"
                label={t("admin.marketing.boostPurchases.detail.cancelledBy")}
              >
                {purchase.cancelledBy?.name ?? "—"}
              </Field>
              <Field
                layout="stacked"
                label={t("admin.marketing.boostPurchases.detail.cancelReason")}
              >
                {purchase.cancelReason ?? "—"}
              </Field>
            </>
          )}
        </DataList>
      </Panel>
    </div>
  );
}
