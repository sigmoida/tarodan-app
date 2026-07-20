import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  Badge,
  enumLabel,
  refundReasonConfig,
  refundRequestStatusConfig,
} from "@tarodan/ui";
import { col, TruncatedText } from "@/components/table";

type T = ReturnType<typeof useTranslations<never>>;

export interface RefundRequestRow {
  id: string;
  refundNumber: string;
  status: string;
  amount: number | string;
  reason: string;
  createdAt: string;
  requester: { id: string; displayName: string; email: string };
  order: {
    id: string;
    orderNumber: string;
    totalAmount: number | string;
    seller: { id: string; displayName: string; email: string };
    product: { id: string; title: string; images?: { url: string }[] };
  };
}

export const refundRequestColumns = (t: T) => [
  col.link<RefundRequestRow>(
    t("admin.operations.common.refundNumber"),
    (r) => ({
      href: `/operations/refund-requests/${r.id}`,
      label: r.refundNumber,
    }),
    { sortKey: "refundNumber", sortType: "text" },
  ),
  col.link<RefundRequestRow>(
    t("admin.operations.common.order"),
    (r) => ({
      href: `/operations/orders/${r.order.id}`,
      label: r.order.orderNumber,
    }),
    { sortKey: "order.orderNumber" },
  ),
  col.custom<RefundRequestRow>(
    t("admin.catalog.common.product"),
    (r) => {
      const img = r.order.product.images?.[0]?.url;
      return (
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-alt">
            {img ? (
              <Image
                src={img}
                alt={r.order.product.title}
                width={40}
                height={40}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-base">📦</span>
            )}
          </div>
          <TruncatedText className="text-body">
            {r.order.product.title}
          </TruncatedText>
        </div>
      );
    },
    { grow: 3, minWidth: 180, sortKey: "order.product.title" },
  ),
  col.user<RefundRequestRow>(
    t("admin.operations.common.buyer"),
    (r) => ({
      name: r.requester?.displayName,
      secondary: r.requester?.email,
    }),
    { sortKey: "requester.displayName" },
  ),
  col.user<RefundRequestRow>(
    t("admin.operations.common.seller"),
    (r) => ({
      name: r.order?.seller?.displayName,
      secondary: r.order?.seller?.email,
    }),
    { sortKey: "order.seller.displayName" },
  ),
  col.money<RefundRequestRow>(t("common.amount"), "amount"),
  col.text<RefundRequestRow>(
    t("admin.operations.refundRequests.reason"),
    (r) => enumLabel(refundReasonConfig, r.reason, r.reason),
    {
      grow: 2,
      sortKey: "reason",
      sortType: "text",
    },
  ),
  col.badge<RefundRequestRow>(
    t("common.status"),
    (r) => <Badge status={r.status} config={refundRequestStatusConfig} />,
    { sortKey: "status", sortType: "text" },
  ),
  col.date<RefundRequestRow>(
    t("admin.operations.common.createdAt"),
    "createdAt",
  ),
];
