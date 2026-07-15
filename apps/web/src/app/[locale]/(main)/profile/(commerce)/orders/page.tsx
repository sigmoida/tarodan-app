"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Spinner, Tabs, TabsList, TabsTrigger } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyStateCard } from "@/components/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/stores/authStore";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import { useTranslations } from "next-intl";
import {
  useOrders,
  useOrderCounts,
  useInvoiceDownload,
  useReorder,
} from "./_hooks/useOrders";
import {
  groupOrders,
  type Order,
  type OrderRole,
  type OrderStatusFilter,
} from "./_lib/types";
import { type OrderActionHandlers } from "./_components/OrderActions";
import OrderCard from "./_components/OrderCard";
import OrderGroupAccordion from "./_components/OrderGroupAccordion";
import ReviewModal from "./_modals/ReviewModal";
import ShippingModal from "./_modals/ShippingModal";
import CancelOrderModal from "./_modals/CancelOrderModal";

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const t = useTranslations();
  const { ready } = useRequireAuth();
  const user = useAuthStore((s) => s.user);

  const initialRole = (
    ["buyer", "seller", "all"].includes(searchParams.get("filter") || "")
      ? searchParams.get("filter")
      : "buyer"
  ) as OrderRole;
  const [role, setRole] = useState<OrderRole>(initialRole);
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("active");

  const [reviewingOrder, setReviewingOrder] = useState<Order | null>(null);
  const [shippingOrderId, setShippingOrderId] = useState<string | null>(null);
  const [cancelModalOrder, setCancelModalOrder] = useState<Order | null>(null);

  const enabled = ready;
  const { orders, isLoading } = useOrders(role, statusFilter, enabled);
  const counts = useOrderCounts(enabled);
  const { downloadingId, download } = useInvoiceDownload();
  const reorder = useReorder();

  const groups = groupOrders(orders);

  const roleTabs: { value: OrderRole; label: string }[] = [
    {
      value: "buyer",
      label: `${t("profile.totalPurchases")} (${counts.buyer})`,
    },
    { value: "seller", label: `${t("profile.totalSales")} (${counts.seller})` },
    {
      value: "all",
      label: `${t("common.all")} (${counts.buyer + counts.seller})`,
    },
  ];
  const statusTabs: { value: OrderStatusFilter; label: string }[] = [
    { value: "active", label: t("product.statusActive") },
    { value: "cancelled", label: t("order.filterCancelled") },
    { value: "refunds", label: t("order.filterRefunds") },
  ];

  const actions: OrderActionHandlers = {
    role,
    userEmail: user?.email,
    downloadingId,
    cancellingId: null,
    onInvoice: download,
    onReorder: reorder,
    onCancel: setCancelModalOrder,
    onShip: (order) => setShippingOrderId(order.id),
    onReview: setReviewingOrder,
  };

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <PageShell className="pb-16">
      <PageHeader
        title={t("order.myOrders")}
        description={t("order.trackManageDescription")}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={role} onValueChange={(v) => setRole(v as OrderRole)}>
          <TabsList className="flex flex-wrap">
            {roleTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as OrderStatusFilter)}
        >
          <TabsList className="flex flex-wrap">
            {statusTabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner size="xl" />
        </div>
      ) : orders.length === 0 ? (
        <EmptyStateCard
          title={t("order.noOrders")}
          action={
            <ButtonLink href="/listings">{t("cart.browseListings")}</ButtonLink>
          }
        />
      ) : (
        <div className="space-y-4">
          {groups.map((group) =>
            group.orders.length === 1 ? (
              <OrderCard
                key={group.key}
                order={group.orders[0]}
                actions={actions}
              />
            ) : (
              <OrderGroupAccordion
                key={group.key}
                group={group}
                actions={actions}
              />
            ),
          )}
        </div>
      )}

      <ReviewModal
        order={reviewingOrder}
        onClose={() => setReviewingOrder(null)}
      />
      <ShippingModal
        orderId={shippingOrderId}
        onClose={() => setShippingOrderId(null)}
      />
      <CancelOrderModal
        order={cancelModalOrder}
        onClose={() => setCancelModalOrder(null)}
      />
    </PageShell>
  );
}
