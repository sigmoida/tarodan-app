"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  ArrowPathIcon,
  PauseIcon,
  PlayIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import { Badge, Button, Input } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { DetailPage } from "@/components/detail/DetailPage";
import { useAdminMutation } from "@/hooks/useAdminMutation";
import {
  purchaseStatusConfig,
  type BoostMetricValues,
  type BoostPurchase,
} from "../_lib/types";

function formatDate(value: string | null, locale: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BoostPurchaseDetailPage() {
  const t = useTranslations();
  const locale = useLocale();
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
            <Badge variant="primary">
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
          <section className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-surface p-4 lg:grid-cols-4">
            <Info
              label={t("admin.marketing.boostPurchases.purchasedAt")}
              value={formatDate(
                purchase.purchasedAt ?? purchase.createdAt,
                locale,
              )}
            />
            <Info
              label={t("admin.marketing.boostPurchases.period")}
              value={`${formatDate(purchase.startsAt, locale)} - ${formatDate(purchase.endsAt, locale)}`}
            />
            <Info
              label={t("admin.marketing.boostPurchases.remaining")}
              value={formatRemaining(purchase.remainingSeconds)}
            />
            <Info
              label={t("admin.marketing.boostPurchases.totalDuration")}
              value={t("admin.marketing.boostPurchases.totalDaysValue", {
                days: purchase.durationDays + purchase.extendedDays,
                extended: purchase.extendedDays,
              })}
            />
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-base font-semibold text-heading">
                {t("admin.marketing.boostPurchases.performanceTitle")}
              </h2>
              <p className="mt-1 text-sm text-muted">
                {t("admin.marketing.boostPurchases.performanceHelper")}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <MetricPanel
                title={t("admin.marketing.boostPurchases.before")}
                values={purchase.metrics.before}
                empty={t("admin.marketing.boostPurchases.metricsPending")}
                labels={metricLabels}
                locale={locale}
              />
              <MetricPanel
                title={t("admin.marketing.boostPurchases.current")}
                values={purchase.metrics.current}
                labels={metricLabels}
                locale={locale}
              />
              <MetricPanel
                title={t("admin.marketing.boostPurchases.gain")}
                values={purchase.metrics.gain}
                gain
                empty={t("admin.marketing.boostPurchases.metricsPending")}
                labels={metricLabels}
                locale={locale}
              />
            </div>
          </section>

          {(purchase.status === "active" || purchase.status === "paused") && (
            <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-heading">
                  {t("admin.marketing.boostPurchases.extendTitle")}
                </h2>
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
            </section>
          )}
        </div>
      )}
    </DetailPage>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase text-muted">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-heading">
        {value}
      </p>
    </div>
  );
}

function MetricPanel({
  title,
  values,
  gain = false,
  empty = "—",
  labels,
  locale,
}: {
  title: string;
  values: BoostMetricValues | null;
  gain?: boolean;
  empty?: string;
  labels: Record<keyof BoostMetricValues, string>;
  locale: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="text-sm font-semibold text-heading">{title}</h3>
      {values ? (
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric
            label={labels.views}
            value={values.views}
            gain={gain}
            locale={locale}
          />
          <Metric
            label={labels.likes}
            value={values.likes}
            gain={gain}
            locale={locale}
          />
          <Metric
            label={labels.clicks}
            value={values.clicks}
            gain={gain}
            locale={locale}
          />
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted">{empty}</p>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  gain,
  locale,
}: {
  label: string;
  value: number;
  gain: boolean;
  locale: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={`mt-1 text-xl font-bold ${gain && value > 0 ? "text-success" : "text-heading"}`}
      >
        {gain && value > 0 ? "+" : ""}
        {value.toLocaleString(locale)}
      </dd>
    </div>
  );
}
