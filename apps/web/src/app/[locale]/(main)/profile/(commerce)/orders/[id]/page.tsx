/** @format */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Badge, Spinner, StatusBadge, orderStatusConfig } from "@tarodan/ui";
import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { queryKeys } from "@/lib/query/keys";
import { formatDate } from "@/lib/format";
import RefundRequestModal from "./_modals/RefundRequestModal";
import { useRequireAuth } from "../../../_hooks/useRequireAuth";
import { useLocale, useTranslations } from "next-intl";
import { useOrderGroupQuery } from "./_hooks/useOrderDetail";
import {
  inferRefundPhase,
  getOrderStatusLabel,
  isOrderReturnable,
} from "./_lib/types";
import type { OrderDetail } from "./_lib/types";
import { isGroupCancellable, visibleCargoCode } from "../_lib/types";
import OrderItemBlock, {
  type OrderItemBlockHandlers,
} from "./_sections/OrderItemBlock";
import PaymentSection from "./_sections/PaymentSection";
import ShippingInfoCard from "./_sections/ShippingInfoCard";
import ShippingAddressCard from "./_sections/ShippingAddressCard";
import GroupPaymentCard from "./_sections/GroupPaymentCard";
import PartyCard from "./_sections/PartyCard";
import HelpCard from "./_sections/HelpCard";
import ReviewModal from "./_modals/ReviewModal";
import CancelOrderModal, {
  type CancelTarget,
} from "../_modals/CancelOrderModal";
import GroupCancelSection from "./_sections/GroupCancelSection";
import BulkRefundSection from "./_sections/BulkRefundSection";
import BulkRefundModal from "./_modals/BulkRefundModal";
import { publicNameOf } from "@/lib/public-name";
import { statusConfig } from "@/lib/statusLabels";

/**
 * Sipariş GRUP ekranı — tek satın alım bile grup çatısı altında gösterilir.
 * URL order id taşır (eski linkler/e-postalar kırılmaz); sunucu gruba çözer.
 * Ayrı bir sipariş detay ekranı yoktur: her siparişin tam dosyası
 * (OrderItemBlock) bu ekranın içinde, paketi altında yaşar.
 */
export default function OrderGroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const queryClient = useQueryClient();
  const { ready } = useRequireAuth();
  const t = useTranslations();
  const locale = useLocale();
  const orderId = params?.id as string;

  const [reviewingOrder, setReviewingOrder] = useState<OrderDetail | null>(
    null,
  );
  const [refundOrder, setRefundOrder] = useState<OrderDetail | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CancelTarget | null>(null);
  const [bulkRefundOpen, setBulkRefundOpen] = useState(false);

  const groupQuery = useOrderGroupQuery(orderId, ready);
  const group = groupQuery.data ?? null;
  const loading = groupQuery.isLoading;

  useEffect(() => {
    if (groupQuery.isError && orderId) {
      toast.error(t("order.loadFailed"));
      router.push("/profile/orders");
    }
  }, [groupQuery.isError, orderId, t, router]);

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Spinner size="xl" />
      </div>
    );
  }

  if (!group || group.orders.length === 0) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-muted">{t("order.orderNotFound")}</p>
      </div>
    );
  }

  const orders = group.orders as unknown as OrderDetail[];
  const isMulti = orders.length > 1;
  const multiPackage = group.packages.length > 1;
  const firstOrder = orders[0];

  // Tek siparişte başlık rozeti o siparişin durumudur; çoklu sepette durumlar
  // sipariş bloklarında ayrı ayrı gösterilir, başlıkta yalnız adet rozeti olur.
  const single = !isMulti ? firstOrder : null;
  const singleStatus = single
    ? single.activeRefundRequest
      ? "refund_requested"
      : single.cancellationType === "iptal"
        ? "cancelled"
        : single.status
    : null;

  // Grup iptali kapalıyken (karışık sepet ya da etiketi kesilmiş tekil sipariş)
  // kargoya devredilmemiş kalemler tek tek iptal edilebilir.
  const groupCancellable = isGroupCancellable(group);
  const allowLineCancel = isMulti || !groupCancellable;
  const returnableOrders = orders.filter(isOrderReturnable);

  const handlers: OrderItemBlockHandlers = {
    onReview: setReviewingOrder,
    onRequestRefund: (order) => {
      if (order.status === "pending_payment") {
        toast(t("order.notPaidCancelInstead"));
        return;
      }
      setRefundOrder(order);
    },
    onCancelOrder: (order) =>
      setCancelTarget({
        kind: "line",
        orderId: order.id,
        orderNumber: order.orderNumber,
      }),
  };

  return (
    <PageShell className="pb-16">
      <PageHeader
        backHref="/profile/orders"
        title={t("order.orderGroupTitle", { number: group.groupNumber })}
        description={formatDate(group.createdAt)}
        actions={
          single && singleStatus ? (
            <StatusBadge
              status={singleStatus}
              config={statusConfig(orderStatusConfig, t)}
              label={
                single.activeRefundRequest
                  ? t("order.refundInProgress")
                  : getOrderStatusLabel(singleStatus, locale)
              }
            />
          ) : (
            <Badge variant="outline">
              {orders.length} {t("collection.items")}
            </Badge>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main: paket çatıları → her paketin altında sipariş dosyaları */}
        <div className="lg:col-span-2 space-y-8">
          {/* Ödeme bekleyen grup TEK çekimle ödenir: form grup seviyesinde bir
              kez gösterilir; tutar grubun toplamıdır (backend tekil isteği de
              gruba yönlendirir — ürünler ayrı ayrı ödenemez). */}
          {(() => {
            const pendingOrder = orders.find(
              (o) => o.isBuyer && o.status === "pending_payment",
            );
            if (!pendingOrder) return null;
            return (
              <PaymentSection
                order={pendingOrder}
                groupTotal={
                  group.kind === "group" ? group.totalAmount : undefined
                }
              />
            );
          })()}
          {group.packages.map((pkg) => {
            const pkgOrders = pkg.orders as unknown as OrderDetail[];
            const shippedOrder = pkgOrders.find((o) => o.shipment);
            const cargoCode = visibleCargoCode(pkg.cargo);
            return (
              <section
                key={pkg.id}
                className={
                  multiPackage
                    ? "ml-3 border-l-2 border-primary-300 pl-4 space-y-6"
                    : "space-y-6"
                }
              >
                {/* Koli başlığı: tek satıcılı sepette de gösterilir — koli
                    numarası (PKG-…) sepet ve sipariş numaralarından bağımsız
                    üçüncü seviyedir ve kargo etiketinde bu yazar. */}
                {(multiPackage || pkg.packageNumber) && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-heading">
                      {multiPackage && pkg.seller
                        ? t("order.sellerPackage", {
                            name: publicNameOf(pkg.seller),
                          })
                        : t("order.packageNumber")}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-4 text-xs text-muted">
                      {pkg.packageNumber && (
                        <p>
                          <span className="font-mono">{pkg.packageNumber}</span>
                        </p>
                      )}
                      {cargoCode && (
                        <p>
                          {t("order.trackingNumber")}:{" "}
                          <span className="font-mono">{cargoCode}</span>
                        </p>
                      )}
                    </div>
                  </div>
                )}
                {pkgOrders.map((order, orderIndex) => (
                  <OrderItemBlock
                    key={order.id}
                    order={order}
                    showHeading={isMulti}
                    showCargoRef={orderIndex === 0}
                    allowLineCancel={allowLineCancel}
                    handlers={handlers}
                  />
                ))}
                {/* Paket başına TEK kargo kartı: paketin tüm siparişleri aynı
                    gönderiyi paylaşır — sipariş başına tekrarlanmaz. */}
                {shippedOrder && <ShippingInfoCard order={shippedOrder} />}
              </section>
            );
          })}
        </div>

        {/* Sidebar: grup seviyesi bilgiler — tek ödeme, adres, taraf, yardım */}
        <div className="space-y-6">
          <GroupPaymentCard group={group} />
          <GroupCancelSection
            group={group}
            onCancel={() => setCancelTarget({ kind: "group", group })}
          />
          <BulkRefundSection
            count={returnableOrders.length}
            onOpen={() => setBulkRefundOpen(true)}
          />
          <ShippingAddressCard order={firstOrder} />
          {!multiPackage && <PartyCard order={firstOrder} />}
          <HelpCard orderId={firstOrder.id} />
        </div>
      </div>

      <ReviewModal
        order={reviewingOrder}
        orderId={reviewingOrder?.id ?? ""}
        onClose={() => setReviewingOrder(null)}
      />

      <RefundRequestModal
        isOpen={!!refundOrder}
        onClose={() => setRefundOrder(null)}
        orderId={refundOrder?.id ?? ""}
        orderNumber={refundOrder?.orderNumber ?? ""}
        phase={refundOrder ? inferRefundPhase(refundOrder) : "preparing"}
        quantity={refundOrder?.items?.[0]?.quantity ?? 1}
        onSuccess={() => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.orders.detail(),
          });
        }}
      />
      <CancelOrderModal
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
      />
      <BulkRefundModal
        isOpen={bulkRefundOpen}
        onClose={() => setBulkRefundOpen(false)}
        orders={returnableOrders}
        onSuccess={() => {
          queryClient.invalidateQueries({
            queryKey: queryKeys.orders.detail(),
          });
        }}
      />
    </PageShell>
  );
}
