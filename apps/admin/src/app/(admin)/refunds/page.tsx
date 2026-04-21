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
import { Button, Input, Spinner } from "@tarodan/ui";

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

  const handleSearch = () => {
    setPage(1);
    loadRefunds();
  };

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">İade Geçmişi</h1>
            <p className="text-gray-500">Tamamlanmış iadeler</p>
          </div>
          <Button
            variant="secondary"
            onClick={loadRefunds}
            className="p-2 text-gray-500 hover:text-gray-900"
          >
            <ArrowPathIcon className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500" />
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

        <div className="admin-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tutar</th>
                  <th>Alıcı</th>
                  <th>Satıcı</th>
                  <th>Ürün</th>
                  <th>İade Tarihi</th>
                  <th>İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8">
                      <Spinner size="lg" className="mx-auto" />
                    </td>
                  </tr>
                ) : refunds.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-500">
                      İade bulunamadı
                    </td>
                  </tr>
                ) : (
                  refunds.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-sm">
                        {r.id.slice(0, 8)}...
                      </td>
                      <td className="font-medium text-danger-600">
                        ₺{r.amount.toLocaleString("tr-TR")}
                      </td>
                      <td>
                        {r.order?.buyer ? (
                          <Link
                            href={`/users/${r.order.buyer.id}`}
                            className="text-gray-900 hover:text-primary-400"
                          >
                            {r.order.buyer.displayName}
                          </Link>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td>
                        {r.order?.seller ? (
                          <Link
                            href={`/users/${r.order.seller.id}`}
                            className="text-gray-900 hover:text-primary-400"
                          >
                            {r.order.seller.displayName}
                          </Link>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="max-w-[200px] truncate">
                        {r.order?.product?.title || "-"}
                      </td>
                      <td>
                        {new Date(r.refundedAt).toLocaleDateString("tr-TR")}
                      </td>
                      <td>
                        {r.order && (
                          <Link
                            href={`/orders/${r.order.id}`}
                            className="p-2 text-gray-500 hover:text-gray-900 inline-block"
                          >
                            <EyeIcon className="h-5 w-5" />
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Toplam {total} iade</p>
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
