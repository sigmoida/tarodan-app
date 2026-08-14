import Link from "next/link";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Button, EmptyState, StatusBadge } from "@tarodan/ui";
import { useTranslations } from "next-intl";
import { SectionCard } from "@/components/detail/SectionCard";
import { fmtTry } from "@/lib/format";
import {
  type RecentOrder,
  dashboardOrderStatusConfig,
  formatRelativeDate,
} from "../_lib/types";

export function RecentOrders({ orders }: { orders: RecentOrder[] }) {
  const t = useTranslations();
  return (
    <SectionCard
      title={t("admin.dashboard.recentOrders.title")}
      className="lg:col-span-2"
      actions={
        <Button asChild variant="ghost" size="sm">
          <Link href="/operations/orders">
            {t("common.seeAll")}
            <ChevronRightIcon className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      }
    >
      <div className="space-y-3">
        {orders.length > 0 ? (
          orders.map((order) => (
            <Link
              key={order.id}
              href={`/operations/orders/${order.id}`}
              className="flex flex-col gap-2 border-b border-border py-3 transition-colors last:border-0 hover:bg-surface-alt sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-1 items-center">
                <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100">
                  <span className="text-sm font-medium text-primary-600">
                    {order.buyerName?.charAt(0) || "?"}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm text-heading">
                    <span className="font-medium">{order.orderNumber}</span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {order.buyerName} - {order.productTitle}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:ml-3">
                <span className="whitespace-nowrap text-sm font-semibold text-heading">
                  {fmtTry(order.amount)}
                </span>
                <StatusBadge
                  status={order.status}
                  config={dashboardOrderStatusConfig(t)}
                />
                <span className="whitespace-nowrap text-xs text-muted">
                  {formatRelativeDate(order.createdAt, t)}
                </span>
              </div>
            </Link>
          ))
        ) : (
          <EmptyState
            size="compact"
            title={t("admin.dashboard.recentOrders.empty")}
          />
        )}
      </div>
    </SectionCard>
  );
}
