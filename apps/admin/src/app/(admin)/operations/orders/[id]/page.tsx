"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { PrinterIcon, TruckIcon } from "@heroicons/react/24/outline";
import { useTranslations } from "next-intl";
import { Button } from "@tarodan/ui";
import { adminApi } from "@/lib/api";
import { DetailPage } from "@/components/detail/DetailPage";
import { PartyCard } from "@/components/detail/PartyCard";
import { Timeline } from "@/components/detail/Timeline";
import { EscrowStatusCard } from "./_sections/EscrowStatusCard";
import type { OrderDetail } from "./types";
import {
  canManuallyUpdateOrderStatus,
  getOrderStatusInfo,
} from "./_lib/status";
import { printOrderInvoice } from "./_lib/printInvoice";
import { OrderBanners } from "./_sections/OrderBanners";
import { OrderInfoSection } from "./_sections/OrderInfoSection";
import { ProductSection } from "./_sections/ProductSection";
import { PackagesSection } from "./_sections/PackagesSection";
import { PaymentSection } from "./_sections/PaymentSection";
import { ShippingSection } from "./_sections/ShippingSection";
import { AddressSection } from "./_sections/AddressSection";
import { StatusUpdateModal } from "./_modals/StatusUpdateModal";
import { AddTrackingModal } from "./_modals/AddTrackingModal";
import { useSession } from "@/context/SessionContext";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations();
  const { user } = useSession();
  const [statusOpen, setStatusOpen] = useState(false);
  const [trackingOpen, setTrackingOpen] = useState(false);
  const canManageOrder = user.role === "super_admin" || user.role === "admin";

  return (
    <DetailPage<OrderDetail>
      resource="orders"
      id={id}
      fetcher={(oid) => adminApi.getOrder(oid).then((r) => r.data)}
      backHref="/operations/orders"
      emptyTitle={t("admin.operations.orders.notFound")}
      title={(order) =>
        t("admin.operations.orders.detailTitle", {
          number: order.group?.groupNumber ?? order.orderNumber,
        })
      }
      subtitle={(order) => new Date(order.createdAt).toLocaleString("tr-TR")}
      badge={(order) => {
        const status = getOrderStatusInfo(order, t);
        return (
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${status.color} ${status.bg}`}
          >
            {status.label}
          </span>
        );
      }}
      actions={(order) => (
        <>
          {canManageOrder && canManuallyUpdateOrderStatus(order.status) && (
            <Button variant="primary" onClick={() => setStatusOpen(true)}>
              {t("admin.operations.orders.updateStatus")}
            </Button>
          )}
          {canManageOrder && order.status === "preparing" && (
            <Button
              variant="primary"
              leftIcon={<TruckIcon className="h-5 w-5" />}
              onClick={() => setTrackingOpen(true)}
            >
              {t("admin.operations.orders.addTracking")}
            </Button>
          )}
          <Button
            variant="secondary"
            leftIcon={<PrinterIcon className="h-5 w-5" />}
            onClick={() => printOrderInvoice(order.id, t)}
          >
            {t("admin.operations.orders.printInvoice")}
          </Button>
        </>
      )}
    >
      {(order) => {
        const status = getOrderStatusInfo(order, t);
        return (
          <>
            <OrderBanners order={order} status={status} />

            {order.status !== "pending_payment" && (
              <EscrowStatusCard
                status={order.status}
                deliveredAt={order.deliveredAt ?? null}
                completedAt={order.completedAt ?? null}
                cancellationType={order.cancellationType ?? null}
                hasOpenRefund={status.hasActiveRefund}
              />
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <OrderInfoSection order={order} status={status} />
                {order.group ? (
                  <PackagesSection group={order.group} />
                ) : (
                  <ProductSection order={order} />
                )}
                {order.payment && <PaymentSection payment={order.payment} />}
                <ShippingSection
                  order={order}
                  isCancelledOrder={status.isCancelledOrder}
                />
                <AddressSection address={order.shippingAddress} />
              </div>

              <div className="space-y-6">
                <PartyCard
                  title={t("admin.operations.orders.buyer")}
                  name={order.buyer.displayName}
                  userHref={`/accounts/users/${order.buyer.id}`}
                  email={order.buyer.email}
                  phone={order.buyer.phone}
                />
                <PartyCard
                  title={t("admin.operations.orders.seller")}
                  name={order.seller.displayName}
                  userHref={`/accounts/users/${order.seller.id}`}
                  email={order.seller.email}
                />
                <Timeline
                  items={[
                    {
                      label: t("admin.operations.common.createdAt"),
                      at: order.createdAt,
                    },
                    {
                      label: t("admin.operations.orders.lastUpdated"),
                      at: order.updatedAt,
                    },
                  ]}
                />
              </div>
            </div>

            <StatusUpdateModal
              open={statusOpen}
              onClose={() => setStatusOpen(false)}
              orderId={order.id}
              currentStatus={order.status}
            />
            <AddTrackingModal
              open={trackingOpen}
              onClose={() => setTrackingOpen(false)}
              orderId={order.id}
            />
          </>
        );
      }}
    </DetailPage>
  );
}
