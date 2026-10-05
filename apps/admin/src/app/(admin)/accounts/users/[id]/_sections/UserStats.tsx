import { useTranslations } from "next-intl";
import { MetricCard } from "@/components/MetricCard";
import { type UserDetail } from "../types";

/** The six summary stat cards above the detail body. */
export function UserStats({
  stats,
}: {
  stats: NonNullable<UserDetail["stats"]>;
}) {
  const t = useTranslations();
  const cards: {
    value: number;
    label: string;
    sub?: string;
  }[] = [
    {
      value: stats.ordersCount,
      label: t("admin.users.detail.totalOrders"),
      sub: t("admin.users.detail.ordersSub", {
        buyer: stats.buyerOrdersCount,
        seller: stats.sellerOrdersCount,
      }),
    },
    {
      value: stats.productsCount,
      label: t("admin.catalog.common.product"),
    },
    {
      value: stats.tradesCount,
      label: t("admin.users.detail.trades"),
      sub: t("admin.users.detail.tradesSub", {
        initiated: stats.initiatedTradesCount,
        received: stats.receivedTradesCount,
      }),
    },
    {
      value: stats.messagesCount,
      label: t("common.message"),
      sub: t("admin.users.detail.messagesSub", {
        sent: stats.sentMessagesCount,
        received: stats.receivedMessagesCount,
      }),
    },
    {
      value: stats.receivedRatingsCount,
      label: t("admin.users.detail.receivedRatings"),
    },
    {
      value: stats.givenRatingsCount,
      label: t("admin.users.detail.givenRatings"),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-3">
      {cards.map((c, i) => (
        <MetricCard
          key={i}
          label={c.label}
          value={c.value}
          footer={
            c.sub ? <span className="text-muted">{c.sub}</span> : undefined
          }
        />
      ))}
    </div>
  );
}
