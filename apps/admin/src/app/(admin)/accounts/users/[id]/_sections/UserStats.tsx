import {
  ShoppingBagIcon,
  CubeIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  StarIcon,
} from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { MetricCard, type MetricTone } from "@/components/MetricCard";
import { type UserDetail } from "../types";

/** The six summary stat cards above the detail body. */
export function UserStats({
  stats,
}: {
  stats: NonNullable<UserDetail["stats"]>;
}) {
  const t = useTranslations();
  const cards: {
    icon: typeof ShoppingBagIcon;
    tone: MetricTone;
    value: number;
    label: string;
    sub?: string;
  }[] = [
    {
      icon: ShoppingBagIcon,
      tone: "info",
      value: stats.ordersCount,
      label: t("admin.users.detail.totalOrders"),
      sub: t("admin.users.detail.ordersSub", {
        buyer: stats.buyerOrdersCount,
        seller: stats.sellerOrdersCount,
      }),
    },
    {
      icon: CubeIcon,
      tone: "success",
      value: stats.productsCount,
      label: t("admin.catalog.common.product"),
    },
    {
      icon: ArrowPathIcon,
      tone: "primary",
      value: stats.tradesCount,
      label: t("admin.users.detail.trades"),
      sub: t("admin.users.detail.tradesSub", {
        initiated: stats.initiatedTradesCount,
        received: stats.receivedTradesCount,
      }),
    },
    {
      icon: ChatBubbleLeftRightIcon,
      tone: "primary",
      value: stats.messagesCount,
      label: t("common.message"),
      sub: t("admin.users.detail.messagesSub", {
        sent: stats.sentMessagesCount,
        received: stats.receivedMessagesCount,
      }),
    },
    {
      icon: StarIcon,
      tone: "warning",
      value: stats.receivedRatingsCount,
      label: t("admin.users.detail.receivedRatings"),
    },
    {
      icon: StarIcon,
      tone: "info",
      value: stats.givenRatingsCount,
      label: t("admin.users.detail.givenRatings"),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-3">
      {cards.map((c, i) => (
        <MetricCard
          key={i}
          icon={c.icon}
          tone={c.tone}
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
