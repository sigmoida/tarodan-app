"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Pagination, Spinner, Tabs, TabsList, TabsTrigger } from "@tarodan/ui";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { EmptyStateCard } from "@/components/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/stores/authStore";
import { useRequireAuth } from "../../_hooks/useRequireAuth";
import { useTranslations } from "next-intl";
import {
  useOrderGroups,
  useOrderCounts,
  useInvoiceDownload,
  useReorder,
} from "./_hooks/useOrders";
import {
  type Order,
  type OrderRole,
  type OrderStatusFilter,
  type ServerOrderGroup,
} from "./_lib/types";
import { type OrderActionHandlers } from "./_components/OrderActions";
import OrderGroupCard from "./_components/OrderGroupCard";
import ReviewModal from "./_modals/ReviewModal";
import CancelOrderModal from "./_modals/CancelOrderModal";

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const t = useTranslations();
  const { ready } = useRequireAuth();
  const user = useAuthStore((s) => s.user);

  const initialRole = (
    searchParams.get("filter") === "seller" ? "seller" : "buyer"
  ) as OrderRole;
  const [role, setRole] = useState<OrderRole>(initialRole);
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("active");
  const [page, setPage] = useState(1);

  const [reviewingOrder, setReviewingOrder] = useState<Order | null>(null);
  const [cancelGroup, setCancelGroup] = useState<ServerOrderGroup | null>(null);

  const enabled = ready;
  const { groups, meta, isLoading } = useOrderGroups(
    role,
    statusFilter,
    page,
    enabled,
  );
  const counts = useOrderCounts(enabled);
  const { downloadingId, download } = useInvoiceDownload();
  const reorder = useReorder();

  const roleTabs: { value: OrderRole; label: string }[] = [
    {
      value: "buyer",
      label: `${t("profile.totalPurchases")} (${counts.buyer})`,
    },
    { value: "seller", label: `${t("profile.totalSales")} (${counts.seller})` },
  ];
  const statusTabs: { value: OrderStatusFilter; label: string }[] = [
    { value: "active", label: t("product.statusActive") },
    { value: "cancelled", label: t("order.filterCancelled") },
    { value: "refunds", label: t("order.filterRefunds") },
  ];

  const emptyTitle =
    statusFilter === "cancelled"
      ? t("order.emptyCancelled")
      : statusFilter === "refunds"
        ? t("order.emptyRefunds")
        : role === "seller"
          ? t("order.emptySales")
          : t("order.noOrders");

  const actions: OrderActionHandlers = {
    role,
    userEmail: user?.email,
    downloadingId,
    onInvoice: download,
    onReorder: reorder,
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
        <Tabs
          value={role}
          onValueChange={(v) => {
            setRole(v as OrderRole);
            setPage(1);
          }}
        >
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
          onValueChange={(v) => {
            setStatusFilter(v as OrderStatusFilter);
            setPage(1);
          }}
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
      ) : groups.length === 0 ? (
        <EmptyStateCard
          title={emptyTitle}
          action={
            role === "buyer" && statusFilter === "active" ? (
              <ButtonLink href="/listings">
                {t("cart.browseListings")}
              </ButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="space-y-4">
            {groups.map((group) => (
              <OrderGroupCard
                key={group.id}
                group={group}
                actions={actions}
                onCancelGroup={setCancelGroup}
              />
            ))}
          </div>
          <Pagination
            page={meta.page}
            pageSize={meta.limit}
            total={meta.total}
            onPageChange={setPage}
            className="mt-6"
          />
        </>
      )}

      <ReviewModal
        order={reviewingOrder}
        onClose={() => setReviewingOrder(null)}
      />
      <CancelOrderModal
        target={cancelGroup ? { kind: "group", group: cancelGroup } : null}
        onClose={() => setCancelGroup(null)}
      />
    </PageShell>
  );
}
