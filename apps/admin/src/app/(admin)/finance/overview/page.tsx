/** @format */

"use client";

import { Fragment, type ComponentType } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowsRightLeftIcon,
  BanknotesIcon,
  ChartPieIcon,
  CreditCardIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { adminApi } from "@/lib/api";
import { adminKeys } from "@/lib/query/keys";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { MetricCard, type MetricTone } from "@/components/MetricCard";
import { QueryErrorCard } from "@/components/page/QueryErrorCard";
import { fmtTry } from "@/lib/format";
import { useTranslations } from "next-intl";
import { HealthStrip } from "./_components/HealthStrip";
import type { FinanceOverview } from "./_lib/types";

type FunnelCard = {
  /** i18n etiket anahtarının son parçası (`admin.finance.overview.funnel.*`). */
  key:
    | "collected"
    | "escrowHeld"
    | "transferred"
    | "platformRevenue"
    | "tradeFee"
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
 * Finans Özeti — "para nerede?" sorusuna tek bakışta cevap.
 *
 * Huni, para AKIŞININ sırasını takip eder: Tahsilat (alıcıdan giren ciro) →
 * Escrow'da bekleyen (satıcı payı rezerve) → Satıcıya ödenen (tamamlanan banka
 * transferi, net) → Platform geliri (ledger'dan, iadeler düşülmüş). Her kart
 * ilgili listeye götürür; sağlık şeridi müdahale isteyenleri gösterir.
 *
 * Zaman kapsamı her kartın altında yazar: akış kartları TÜM ZAMAN birikimli,
 * stok kartları (escrow) ANLIK. Aylık kırılım ve trend bu ekranın işi değil,
 * dashboard/analiz ekranlarında yapılır.
 */
export default function FinanceOverviewPage() {
  const t = useTranslations();
  const { data, isLoading, isError, isFetching, refetch } =
    useQuery<FinanceOverview>({
      queryKey: adminKeys.all("finance-overview"),
      queryFn: async () => (await adminApi.getFinanceOverview()).data,
    });

  const funnel = data?.funnel;

  /**
   * Huni kartları tek tablodan üretilir: her satır ikon/ton/bağlantı/etiket/
   * değer/ipucu/zaman kapsamını taşır; render tek bir map'tir. Yeni kart = yeni
   * satır. `scope` her kartın altında yazar (akış = tüm zaman, stok = anlık).
   */
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
        collected: funnel ? fmtTry(funnel.tradeFeeCollected) : "—",
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
    <AdminPage>
      <PageHeader
        title={t("admin.finance.overview.title")}
        description={t("admin.finance.overview.subtitle")}
      />

      {isError ? (
        <QueryErrorCard
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => {
              const metric = (
                <MetricCard
                  icon={card.icon}
                  tone={card.tone}
                  label={t(`admin.finance.overview.funnel.${card.key}`)}
                  value={card.value === undefined ? "—" : fmtTry(card.value)}
                  loading={isLoading}
                  footer={
                    <span className="text-muted">
                      {card.hint} ·{" "}
                      {t(`admin.finance.overview.scope.${card.scope}`)}
                    </span>
                  }
                />
              );
              return card.href ? (
                <Link key={card.key} href={card.href} className="block">
                  {metric}
                </Link>
              ) : (
                <Fragment key={card.key}>{metric}</Fragment>
              );
            })}
          </div>

          {data && <HealthStrip health={data.health} />}
        </>
      )}
    </AdminPage>
  );
}
