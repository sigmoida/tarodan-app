/** @format */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Spinner, StatusBadge, orderStatusConfig } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { queryKeys } from "@/lib/query/keys";
import RefundRequestModal from "./_modals/RefundRequestModal";
import { useRequireAuth } from "../../../_hooks/useRequireAuth";
import { useLocale, useTranslations } from "next-intl";
import { useOrderQuery } from "./_hooks/useOrderDetail";
import { inferRefundPhase, getOrderStatusLabel } from "./_lib/types";
import OrderBanners from "./_sections/OrderBanners";
import ProductInfoCard from "./_sections/ProductInfoCard";
import RefundRequestBanner from "./_sections/RefundRequestBanner";
import ShippingInfoCard from "./_sections/ShippingInfoCard";
import ShippingAddressCard from "./_sections/ShippingAddressCard";
import SellerActions from "./_sections/SellerActions";
import PaymentSection from "./_sections/PaymentSection";
import EscrowInfoCard from "./_sections/EscrowInfoCard";
import ReviewCta from "./_sections/ReviewCta";
import ReviewSummary from "./_sections/ReviewSummary";
import RefundActions from "./_sections/RefundActions";
import OrderSummaryCard from "./_sections/OrderSummaryCard";
import PartyCard from "./_sections/PartyCard";
import InvoicesSection from "./_sections/InvoicesSection";
import HelpCard from "./_sections/HelpCard";
import ReviewModal from "./_modals/ReviewModal";

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const { ready } = useRequireAuth();
  const t = useTranslations();
  const locale = useLocale();
  const orderId = params?.id as string;

  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);

  const orderQuery = useOrderQuery(orderId, ready);
  const rawOrder = orderQuery.data;
  const order =
    rawOrder && typeof rawOrder === "object" && rawOrder.status !== undefined
      ? rawOrder
      : null;
  const loading = orderQuery.isLoading;

  useEffect(() => {
    if (orderQuery.isError && orderId) {
      toast.error(t("order.loadFailed"));
      router.push("/profile/orders");
    }
  }, [orderQuery.isError, orderId, t, router]);

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-muted">{t("order.orderNotFound")}</p>
      </div>
    );
  }

  // Status shown in the header badge. A pre-shipment cancel can leave the raw
  // status as 'refunded' (money flow) — show "İptal Edildi" not "İade Edildi";
  // an open refund request shows "İade Sürecinde".
  const hasActiveRefund = !!order.activeRefundRequest;
  const displayStatus = hasActiveRefund
    ? "refund_requested"
    : order.cancellationType === "iptal"
      ? "cancelled"
      : order.status;
  const statusLabel = hasActiveRefund
    ? t("order.refundInProgress")
    : getOrderStatusLabel(displayStatus, locale);

  const orderDate = new Date(order.createdAt).toLocaleDateString("tr-TR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const handleRefund = () => {
    if (order.status === "pending_payment") {
      toast(t("order.notPaidCancelInstead"));
      return;
    }
    setShowRefundModal(true);
  };

  return (
    <PageShell className="pb-16">
      <PageHeader
        backHref="/profile/orders"
        title={`Sipariş #${order.orderNumber}`}
        description={orderDate}
        actions={
          <StatusBadge
            status={displayStatus}
            config={orderStatusConfig}
            label={statusLabel}
          />
        }
      />

      <OrderBanners order={order} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <ProductInfoCard order={order} />
          <RefundRequestBanner order={order} />
          <ShippingInfoCard order={order} />
          <ShippingAddressCard order={order} />
          <SellerActions order={order} />
          <PaymentSection order={order} />
          <EscrowInfoCard order={order} />
          <ReviewCta order={order} onReview={() => setShowReviewModal(true)} />
          <ReviewSummary order={order} />
          <RefundActions order={order} onRequestRefund={handleRefund} />
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <OrderSummaryCard order={order} />
          <PartyCard order={order} />
          <InvoicesSection order={order} />
          <HelpCard orderId={orderId} />
        </div>
      </div>

      <ReviewModal
        order={showReviewModal ? order : null}
        orderId={orderId}
        onClose={() => setShowReviewModal(false)}
      />

      <RefundRequestModal
        isOpen={showRefundModal}
        onClose={() => setShowRefundModal(false)}
        orderId={order.id}
        orderNumber={order.orderNumber}
        phase={inferRefundPhase(order)}
        quantity={order.items?.[0]?.quantity ?? 1}
        onSuccess={() => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.orders.detail(),
          });
        }}
      />
    </PageShell>
  );
}
