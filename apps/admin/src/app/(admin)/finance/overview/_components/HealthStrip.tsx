/** @format */

"use client";

import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtTry } from "@/lib/format";
import { useTranslations } from "next-intl";
import type { FinanceOverview } from "../_lib/types";

/**
 * "Dikkat gerektirenler" şeridi: müdahale isteyen finansal kayıtların sayaçları.
 * Bu sayılar zaten üretiliyordu ama yalnız cron log'larına düşüyordu — her
 * sayaç ilgili listeye tıklanır bağlantıdır (kaçak değil, görünürlük).
 */
export function HealthStrip({ health }: { health: FinanceOverview["health"] }) {
  const t = useTranslations();

  const items: Array<{
    key: string;
    label: string;
    count: number;
    href: string;
    extra?: string;
  }> = [
    {
      key: "failedTransfers",
      label: t("admin.finance.overview.health.failedTransfers"),
      count: health.failedTransfers,
      href: "/finance/payouts?tab=transfers&status=failed",
    },
    {
      key: "overdueHolds",
      label: t("admin.finance.overview.health.overdueHolds"),
      count: health.overdueHolds,
      href: "/finance/payouts?tab=escrow&status=held",
    },
    {
      key: "uninvoicedDelivered",
      label: t("admin.finance.overview.health.uninvoicedDelivered"),
      count: health.uninvoicedDelivered,
      href: "/operations/orders?status=delivered",
    },
    {
      key: "exhaustedInvoices",
      label: t("admin.finance.overview.health.exhaustedInvoices"),
      count: health.exhaustedInvoices,
      href: "/finance/invoices?status=failed",
    },
    {
      key: "openAdjustments",
      label: t("admin.finance.overview.health.openAdjustments"),
      count: health.openAdjustmentsCount,
      href: "/finance/payouts?tab=adjustments&status=open",
      extra:
        health.openAdjustmentsTotal > 0
          ? fmtTry(health.openAdjustmentsTotal)
          : undefined,
    },
  ];
  const attention = items.filter((i) => i.count > 0);

  return (
    <SectionCard title={t("admin.finance.overview.health.title")}>
      {attention.length === 0 ? (
        <p className="text-sm text-muted">
          {t("admin.finance.overview.health.allClear")}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {attention.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 transition-colors hover:border-warning-300"
              >
                <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-warning-600" />
                <span className="min-w-0 flex-1 truncate text-sm text-body">
                  {item.label}
                </span>
                <span className="flex-shrink-0 text-sm font-semibold text-warning-700">
                  {item.count}
                  {item.extra ? ` · ${item.extra}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
