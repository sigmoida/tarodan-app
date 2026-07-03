"use client";

import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import { AdminPage } from "@/components/page/AdminPage";
import { PageHeader } from "@/components/AdminList";
import { ResourceList } from "@/components/list";
import { col } from "@/components/table";

interface Refund {
  id: string;
  amount: number;
  status: string;
  refundedAt: string;
  order: {
    id: string;
    buyer: { id: string; displayName: string; email: string };
    seller: { id: string; displayName: string; email: string };
    product: { id: string; title: string };
  } | null;
}

const columns = [
  col.code<Refund>("ID", (r) => `${r.id.slice(0, 8)}…`, { grow: 1 }),
  col.money<Refund>("Tutar", (r) => r.amount, { tone: "negative" }),
  col.user<Refund>("Alıcı", (r) =>
    r.order?.buyer ? { name: r.order.buyer.displayName, href: `/accounts/users/${r.order.buyer.id}` } : null,
  ),
  col.user<Refund>("Satıcı", (r) =>
    r.order?.seller ? { name: r.order.seller.displayName, href: `/accounts/users/${r.order.seller.id}` } : null,
  ),
  col.text<Refund>("Ürün", (r) => r.order?.product?.title, { grow: 2 }),
  col.date<Refund>("İade Tarihi", (r) => r.refundedAt),
];

export default function RefundsPage() {
  const router = useRouter();
  return (
    <AdminPage>
      <PageHeader title="İade Geçmişi" description="Tamamlanmış iadeler" />

      <ResourceList<Refund>
        resource="refunds"
        fetcher={(p) =>
          adminApi.getRefundHistory({
            search: p.search,
            startDate: p.startDate || undefined,
            endDate: p.endDate || undefined,
            page: p.page,
            limit: p.limit,
          })
        }
        getRowId={(r) => r.id}
        initialFilters={{ startDate: "", endDate: "" }}
        errorMessage="İade geçmişi yüklenemedi"
      >
        <ResourceList.Toolbar>
          <ResourceList.Search />
          <ResourceList.DateRange />
        </ResourceList.Toolbar>
        <ResourceList.Table
          columns={columns}
          emptyText="İade bulunamadı"
          onRowClick={(r) => r.order && router.push(`/operations/orders/${r.order.id}`)}
        />
        <ResourceList.Pagination />
      </ResourceList>
    </AdminPage>
  );
}
