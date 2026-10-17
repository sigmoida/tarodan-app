"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowPathIcon,
  PauseIcon,
  PlayIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Input } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { DetailPage } from "@/components/detail/DetailPage";
import { DataList, Field } from "@/components/detail/DataList";
import { Panel } from "@/components/detail/Panel";
import { SectionTitle } from "@/components/detail/SectionTitle";
import { MetricCard } from "@/components/MetricCard";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  purchaseStatusConfig,
  type BoostMetricValues,
  type BoostPurchase,
} from "../_lib/types";

export default function BoostPurchaseDetailPage() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const statuses = purchaseStatusConfig(t);
  const [extensionDays, setExtensionDays] = useState(7);
  const formatRemaining = (seconds: number) => {
    if (seconds <= 0) return "—";
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    return days > 0
      ? t("admin.marketing.boostPurchases.remainingDaysHours", { days, hours })
      : t("admin.marketing.boostPurchases.remainingHours", { hours });
  };
  const metricLabels = {
    views: t("admin.marketing.boostPurchases.views"),
    likes: t("admin.marketing.boostPurchases.favorites"),
    clicks: t("admin.marketing.boostPurchases.clicks"),
  };

  const pause = useAdminMutation(
    () =>
      adminApi
        .post(`/admin/ad-packages/purchases/${id}/pause`)
        .then((response) => response.data),
    {
      invalidates: ["boost-purchases"],
      successMessage: t("admin.marketing.boostPurchases.paused"),
    },
  );
  const resume = useAdminMutation(
    () =>
      adminApi
        .post(`/admin/ad-packages/purchases/${id}/resume`)
        .then((response) => response.data),
    {
      invalidates: ["boost-purchases"],
      successMessage: t("admin.marketing.boostPurchases.resumed"),
    },
  );
  const extend = useAdminMutation(
    (days: number) =>
      adminApi
        .post(`/admin/ad-packages/purchases/${id}/extend`, { days })
        .then((response) => response.data),
    {
      invalidates: ["boost-purchases"],
      successMessage: t("admin.marketing.boostPurchases.extended"),
    },
  );

  return (
    <DetailPage<BoostPurchase>
      resource="boost-purchases"
      id={id}
      fetcher={(purchaseId) =>
        adminApi
          .get(`/admin/ad-packages/purchases/${purchaseId}`)
          .then((response) => response.data)
      }
      backHref="/marketing/boost-purchases"
      emptyTitle={t("admin.marketing.boostPurchases.notFound")}
      title={(purchase) => purchase.packageName ?? "—"}
      subtitle={(purchase) =>
        `${purchase.buyer?.adminCode ?? "—"} · ${purchase.product?.title ?? "—"}`
      }
      badge={(purchase) => (
        <span className="flex items-center gap-2">
          <Badge status={purchase.status} config={statuses} />
          {purchase.isBestForBuyer && (
            <Badge variant="default">
              <TrophyIcon className="mr-1 h-4 w-4" />
              {t("admin.marketing.boostPurchases.bestBoost")}
            </Badge>
          )}
        </span>
      )}
      actions={(purchase) =>
        purchase.status === "active" ? (
          <Button
            variant="secondary"
            leftIcon={<PauseIcon className="h-4 w-4" />}
            onClick={() => pause.mutate()}
            isLoading={pause.isPending}
          >
            {t("admin.marketing.boostPurchases.pause")}
          </Button>
        ) : purchase.status === "paused" ? (
          <Button
            variant="primary"
            leftIcon={<PlayIcon className="h-4 w-4" />}
            onClick={() => resume.mutate()}
            isLoading={resume.isPending}
          >
            {t("admin.marketing.boostPurchases.resume")}
          </Button>
        ) : null
      }
    >
      {(purchase) => (
        <div className="space-y-6">
          <Panel>
            <DataList>
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
            </DataList>
          </Panel>

          <section>
            <div className="mb-3">
              <SectionTitle as="h2">
                {t("admin.marketing.boostPurchases.performanceTitle")}
              </SectionTitle>
              <p className="mt-1 text-sm text-muted">
                {t("admin.marketing.boostPurchases.performanceHelper")}
              </p>
            </div>
            <div className="space-y-4">
              <MetricGroup
                title={t("admin.marketing.boostPurchases.before")}
                values={purchase.metrics.before}
                empty={t("admin.marketing.boostPurchases.metricsPending")}
                labels={metricLabels}
              />
              <MetricGroup
                title={t("admin.marketing.boostPurchases.current")}
                values={purchase.metrics.current}
                labels={metricLabels}
              />
              <MetricGroup
                title={t("admin.marketing.boostPurchases.gain")}
                values={purchase.metrics.gain}
                gain
                empty={t("admin.marketing.boostPurchases.metricsPending")}
                labels={metricLabels}
              />
            </div>
          </section>

          {(purchase.status === "active" || purchase.status === "paused") && (
            <Panel className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <SectionTitle as="h2">
                  {t("admin.marketing.boostPurchases.extendTitle")}
                </SectionTitle>
                <p className="mt-1 text-sm text-muted">
                  {t("admin.marketing.boostPurchases.extendHelper")}
                </p>
              </div>
              <div className="flex items-end gap-2">
                <div className="w-24">
                  <Input
                    label={t("admin.marketing.boostPurchases.days")}
                    type="number"
                    min={1}
                    max={365}
                    value={extensionDays}
                    placeholder="7"
                    onChange={(event) =>
                      setExtensionDays(
                        Math.min(365, Math.max(1, Number(event.target.value))),
                      )
                    }
                  />
                </div>
                <Button
                  variant="primary"
                  leftIcon={<ArrowPathIcon className="h-4 w-4" />}
                  onClick={() => extend.mutate(extensionDays)}
                  isLoading={extend.isPending}
                >
                  {t("admin.marketing.boostPurchases.extend")}
                </Button>
              </div>
            </Panel>
          )}
        </div>
      )}
    </DetailPage>
  );
}

/** One before/current/gain row: a titled group of the three boost metrics. */
function MetricGroup({
  title,
  values,
  gain = false,
  empty = "—",
  labels,
}: {
  title: string;
  values: BoostMetricValues | null;
  gain?: boolean;
  empty?: string;
  labels: Record<keyof BoostMetricValues, string>;
}) {
  const metricValue = (value: number) => (
    <span className={gain && value > 0 ? "text-success" : undefined}>
      {gain && value > 0 ? "+" : ""}
      {fmtNumber(value)}
    </span>
  );
  return (
    <div className="space-y-2">
      <SectionTitle as="h3" size="sm">
        {title}
      </SectionTitle>
      {values ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricCard label={labels.views} value={metricValue(values.views)} />
          <MetricCard label={labels.likes} value={metricValue(values.likes)} />
          <MetricCard
            label={labels.clicks}
            value={metricValue(values.clicks)}
          />
        </div>
      ) : (
        <p className="text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}
