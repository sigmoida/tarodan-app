"use client";

import { useRouter } from "next/navigation";
import {
  StatusBadge,
  enumLabel,
  refundReasonConfig,
  refundRequestStatusConfig,
} from "@tarodan/ui";
import { ResourceList } from "@/components/list";
import { col, TruncatedText } from "@/components/table";
import { fetchRefundRequests, REFUND_STATUS_OPTIONS } from "@/lib/refundRequestQuery";

interface RefundRequestRow {
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

const columns = [
  col.code<RefundRequestRow>("İade No", (r) => r.refundNumber),
  col.link<RefundRequestRow>("Sipariş", (r) => ({
    href: `/operations/orders/${r.order.id}`,
    label: r.order.orderNumber,
  })),
  col.custom<RefundRequestRow>(
    "Ürün",
    (r) => {
      const img = r.order.product.images?.[0]?.url;
      return (
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-alt">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img} alt={r.order.product.title} className="h-full w-full object-cover" />
            ) : (
              <span className="text-base">📦</span>
            )}
          </div>
          <TruncatedText className="text-body">{r.order.product.title}</TruncatedText>
        </div>
      );
    },
    { grow: 3, minWidth: 180 },
  ),
  col.user<RefundRequestRow>("Alıcı", (r) => ({
    name: r.requester?.displayName,
    secondary: r.requester?.email,
  })),
  col.user<RefundRequestRow>("Satıcı", (r) => ({
    name: r.order?.seller?.displayName,
    secondary: r.order?.seller?.email,
  })),
  col.money<RefundRequestRow>("Tutar", (r) => r.amount),
  col.text<RefundRequestRow>(
    "Sebep",
    (r) => enumLabel(refundReasonConfig, r.reason, r.reason),
    { grow: 2 },
  ),
  col.badge<RefundRequestRow>("Durum", (r) => (
    <StatusBadge status={r.status} config={refundRequestStatusConfig} />
  )),
  col.date<RefundRequestRow>("Oluşturma", (r) => r.createdAt),
];

export default function RefundRequestsPage() {
  const router = useRouter();
  return (
    <ResourceList<RefundRequestRow>
      resource="refund-requests"
      fetcher={fetchRefundRequests}
      getRowId={(rr) => rr.id}
      initialFilters={{ status: "all", from: "", to: "" }}
      errorMessage="İade talepleri yüklenemedi"
    >
      <ResourceList.Header
        title="İade Takibi"
        description="Devam eden iadeler — otomatik akış izlenir; yalnız istisnai durumlarda admin müdahalesi gerekir"
      />
      <ResourceList.Toolbar>
        <ResourceList.Search />
        <ResourceList.FilterSelect name="status" options={REFUND_STATUS_OPTIONS} className="sm:w-56" />
        <ResourceList.DateRange fromName="from" toName="to" />
      </ResourceList.Toolbar>
      <ResourceList.Table
        columns={columns}
        emptyText="Bu filtrelerle eşleşen iade talebi yok."
        onRowClick={(rr) => router.push(`/operations/refund-requests/${rr.id}`)}
      />
      <ResourceList.Pagination />
    </ResourceList>
  );
}
