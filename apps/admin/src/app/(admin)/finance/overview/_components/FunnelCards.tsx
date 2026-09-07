/** @format */

"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import {
  ArrowsRightLeftIcon,
  BanknotesIcon,
  ChartPieIcon,
  CreditCardIcon,
  LockClosedIcon,
  MegaphoneIcon,
} from "@heroicons/react/24/outline";
import { MetricCard, type MetricTone } from "@/components/MetricCard";
import { fmtTry } from "@/lib/format";
import { useTranslations } from "next-intl";
import type { FinanceOverview } from "../_lib/types";

type Funnel = FinanceOverview["funnel"];

type FunnelCard = {
  /** i18n etiket anahtarının son parçası (`admin.finance.overview.funnel.*`). */
  key:
    | "collected"
    | "escrowHeld"
    | "transferred"
    | "platformRevenue"
    | "tradeFee"
    | "boost"
    | "pspFee"
    | "netAfterPsp";
  icon: ComponentType<{ className?: string }>;
  tone: MetricTone;
  /** Kartın götürdüğü liste; yoksa kart tıklanmaz. */
  href?: string;
  /** Yüklenmeden önce undefined → "—". */
  value: number | undefined;
  hint: string;
  /** Akış kartları tüm zaman birikimli, stok kartları (escrow) anlık. */
  scope: "allTime" | "instant";
};

/**
 * Huni kartları tek tablodan üretilir; yeni kart = yeni satır. `scope` her
 * kartın altında yazar (akış = tüm zaman, stok = anlık).
 */
export function FunnelCards({
  funnel,
  loading,
}: {
  funnel: Funnel | undefined;
  loading: boolean;
}) {
  const t = useTranslations();

  const cards: FunnelCard[] = [
    {
      key: "collected",
      icon: CreditCardIcon,
      tone: "info",
      href: "/finance/payments",
      value: funnel?.collectedTotal,
      hint: t("admin.finance.overview.funnel.collectedHint", {
        count: funnel?.collectedCount ?? 0,
      }),
      scope: "allTime",
    },
    {
      key: "escrowHeld",
      icon: LockClosedIcon,
      tone: "warning",
      href: "/finance/payouts?tab=escrow",
      value: funnel?.escrowHeldTotal,
      hint: t("admin.finance.overview.funnel.escrowHeldHint", {
        count: funnel?.escrowHeldCount ?? 0,
      }),
      scope: "instant",
    },
    {
      key: "transferred",
      icon: BanknotesIcon,
      tone: "success",
      href: "/finance/payouts?tab=transfers",
      value: funnel?.transferredTotal,
      hint: t("admin.finance.overview.funnel.transferredHint", {
        count: funnel?.transferredCount ?? 0,
      }),
      scope: "allTime",
    },
    {
      key: "platformRevenue",
      icon: ChartPieIcon,
      tone: "primary",
      href: "/finance/commission",
      value: funnel?.platformRevenueNet,
      hint: t("admin.finance.overview.funnel.platformRevenueHint"),
      scope: "allTime",
    },
    // Takas geliri komisyon defterinde GÖRÜNMEZ (o tablo sipariş bazlıdır);
    // platform gelirinin içindeki payı ayrıca gösterilir.
    {
      key: "tradeFee",
      icon: ArrowsRightLeftIcon,
      tone: "primary",
      href: "/operations/trades",
      value: funnel?.tradeFeeRevenueNet,
      hint: t("admin.finance.overview.funnel.tradeFeeHint", {
        collected: fmtTry(funnel?.tradeFeeCollected) ?? "—",
      }),
      scope: "allTime",
    },
    // Boost (BST-) siparişleri de komisyon defterinde yoktur; brüt tahsilat
    // ayrıca gösterilir (platform gelirine dahil DEĞİL — %100 platform cirosu).
    {
      key: "boost",
      icon: MegaphoneIcon,
      tone: "info",
      href: "/marketing/boost-purchases",
      value: funnel?.boostRevenueCollected,
      hint: t("admin.finance.overview.funnel.boostHint", {
        count: funnel?.boostRevenueCount ?? 0,
      }),
      scope: "allTime",
    },
    // Komisyon geliri hak edişin KENDİSİ değil: PSP kesintisi içinden çıkar.
    // İki kart, "kalan" ile "hak ediş" farkını görünür kılar.
    {
      key: "pspFee",
      icon: CreditCardIcon,
      tone: "warning",
      value: funnel?.pspFeeTotal,
      hint: t("admin.finance.overview.funnel.pspFeeHint"),
      scope: "allTime",
    },
    {
      key: "netAfterPsp",
      icon: BanknotesIcon,
      tone: "success",
      value: funnel?.platformNetAfterPsp,
      hint: t("admin.finance.overview.funnel.netAfterPspHint"),
      scope: "allTime",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const metric = (
          <MetricCard
            key={card.key}
            icon={card.icon}
            tone={card.tone}
            label={t(`admin.finance.overview.funnel.${card.key}`)}
            value={fmtTry(card.value) ?? "—"}
            loading={loading}
            footer={
              <span className="text-muted">
                {card.hint} · {t(`admin.finance.overview.scope.${card.scope}`)}
              </span>
            }
          />
        );
        return card.href ? (
          <Link key={card.key} href={card.href} className="block">
            {metric}
          </Link>
        ) : (
          metric
        );
      })}
    </div>
  );
}
