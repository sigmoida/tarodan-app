"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import {
  MagnifyingGlassIcon,
  ArrowPathIcon,
  BanknotesIcon,
  EyeIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { Button, Input } from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";

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

export default function RefundsPage() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadRefunds();
  }, [page]);

  const loadRefunds = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getRefundHistory({
        search: search || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        page,
        limit: 20,
      });
      setRefunds(res.data.data || []);
      setTotal(res.data.meta?.total || 0);
    } catch (e: any) {
      toast.error("İade geçmişi yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const columns: ColumnDef<Refund, any>[] = [
    {
      header: "ID",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.id.slice(0, 8)}...</span>
      ),
    },
    {
      header: "Tutar",
      cell: ({ row }) => (
        <span className="font-medium text-danger-600">
          ₺{row.original.amount.toLocaleString("tr-TR")}
        </span>
      ),
    },
    {
      header: "Alıcı",
      cell: ({ row }) =>
        row.original.order?.buyer ? (
          <Link
            href={`/users/${row.original.order.buyer.id}`}
            className="text-heading hover:text-primary-400"
          >
            {row.original.order.buyer.displayName}
          </Link>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    {
      header: "Satıcı",
      cell: ({ row }) =>
        row.original.order?.seller ? (
          <Link
            href={`/users/${row.original.order.seller.id}`}
            className="text-heading hover:text-primary-400"
          >
            {row.original.order.seller.displayName}
          </Link>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    {
      header: "Ürün",
      cell: ({ row }) => (
        <span className="block max-w-[200px] truncate">
          {row.original.order?.product?.title || "-"}
        </span>
      ),
    },
    {
      header: "İade Tarihi",
      cell: ({ row }) =>
        new Date(row.original.refundedAt).toLocaleDateString("tr-TR"),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) =>
        row.original.order ? (
          <Link
            href={`/orders/${row.original.order.id}`}
            className="inline-block p-2 text-muted hover:text-heading"
          >
            <EyeIcon className="h-5 w-5" />
          </Link>
        ) : null,
    },
  ];

  const handleSearch = () => {
    setPage(1);
    loadRefunds();
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-heading">İade Geçmişi</h1>
            <p className="text-muted">Tamamlanmış iadeler</p>
          </div>
          <Button
            variant="secondary"
            onClick={loadRefunds}
            className="p-2 text-muted hover:text-heading"
          >
            <ArrowPathIcon className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
            <Input
              type="text"
              placeholder="Alıcı veya satıcı ara..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-10"
            />
          </div>
          <Input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <Input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <Button onClick={handleSearch}>Filtrele</Button>
        </div>

        <DataTable
          columns={columns}
          data={refunds}
          loading={loading}
          emptyText="İade bulunamadı"
          getRowId={(r) => r.id}
        />

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">Toplam {total} iade</p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Önceki
            </Button>
            <Button
              variant="secondary"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / 20)}
            >
              Sonraki
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
