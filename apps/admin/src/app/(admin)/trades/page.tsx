"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { adminApi } from "@/lib/api";
import { cancelReasonLabel } from "@/lib/utils";
import {
  Button,
  Input,
  Select,
  StatusBadge,
  tradeStatusConfig,
} from "@tarodan/ui";
import type { StatusConfig } from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import {
  MagnifyingGlassIcon,
  EyeIcon,
  ExclamationTriangleIcon,
  UserIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";

interface Trade {
  id: string;
  tradeNumber: string;
  status: string;
  initiator: { id: string; displayName: string };
  receiver: { id: string; displayName: string };
  initiatorItemsCount: number;
  receiverItemsCount: number;
  cashAmount?: number;
  hasDispute: boolean;
  createdAt: string;
  cancelReason?: string;
}

interface User {
  id: string;
  displayName: string;
  email: string;
}

const statusOptions = [
  { value: "all", label: "Tümü" },
  { value: "pending", label: "Bekliyor" },
  { value: "accepted", label: "Kabul Edildi" },
  { value: "awaiting_payment", label: "Ödeme Bekleniyor" },
  { value: "shipping_to_warehouse", label: "Depoya Gönderim" },
  { value: "at_warehouse", label: "Tarodan Deposunda (İnceleme)" },
  { value: "admin_reviewing", label: "İnceleniyor" },
  { value: "shipping_to_recipients", label: "Alıcılara Gönderim" },
  { value: "returning", label: "İade Yolda" },
  { value: "both_shipped", label: "Gönderildi" },
  { value: "completed", label: "Tamamlandı" },
  { value: "disputed", label: "İtirazlı" },
  { value: "cancelled", label: "İptal" },
];

export default function TradesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlUserId = useMemo(
    () => searchParams.get("userId") || "",
    [searchParams],
  );

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [reviewQueueCount, setReviewQueueCount] = useState(0);

  // User filtering
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(urlUserId);
  const [userSearch, setUserSearch] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Load users for dropdown
  const loadUsers = useCallback(async (searchTerm: string) => {
    if (!searchTerm || searchTerm.length < 2) {
      setUsers([]);
      return;
    }
    setLoadingUsers(true);
    try {
      const response = await adminApi.getUsers({
        search: searchTerm,
        limit: 10,
      });
      const data = response.data.data || response.data.users || [];
      setUsers(
        data.map((u: any) => ({
          id: u.id,
          displayName: u.displayName,
          email: u.email,
        })),
      );
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Load users error:", error);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  // Debounce user search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (userSearch) loadUsers(userSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, loadUsers]);

  // Sync URL userId with state
  useEffect(() => {
    setSelectedUserId(urlUserId);
  }, [urlUserId]);

  const handleSelectUser = (user: User) => {
    setSelectedUserId(user.id);
    setUserSearch(user.displayName);
    setShowUserDropdown(false);
    router.push(`/trades?userId=${user.id}`);
  };

  const clearUserFilter = () => {
    setSelectedUserId("");
    setUserSearch("");
    router.push("/trades");
  };

  useEffect(() => {
    loadTrades();
  }, [page, status, selectedUserId]);

  // Load the admin-review queue count (at_warehouse) regardless of current filter
  useEffect(() => {
    const loadReviewQueueCount = async () => {
      try {
        const response = await adminApi.getTrades({
          page: 1,
          limit: 1,
          status: "at_warehouse",
        });
        const meta = response.data.meta || {};
        const data = response.data.data || response.data.trades || [];
        setReviewQueueCount(meta.total ?? data.length ?? 0);
      } catch (error) {
        if (process.env.NODE_ENV === "development")
          console.error("Review queue count error:", error);
      }
    };
    loadReviewQueueCount();
  }, [status]);

  const loadTrades = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getTrades({
        page,
        limit: 20,
        status: status === "all" ? undefined : status,
        userId: selectedUserId || undefined,
      });
      const data = response.data.data || response.data.trades || [];
      const meta = response.data.meta || {};
      setTrades(
        data.map((t: any) => ({
          id: t.id,
          tradeNumber: t.tradeNumber || `TRD-${t.id.slice(0, 8)}`,
          status: t.status,
          initiator: t.initiator || { id: "", displayName: "Başlatan" },
          receiver: t.receiver || { id: "", displayName: "Alıcı" },
          initiatorItemsCount: t.initiatorItems?.length || 0,
          receiverItemsCount: t.receiverItems?.length || 0,
          cashAmount: Number(t.cashAmount || 0),
          hasDispute: !!t.dispute,
          createdAt: t.createdAt,
          cancelReason: t.cancelReason ?? undefined,
        })),
      );
      setTotal(meta.total || data.length);
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Trades load error:", error);
      toast.error("Takaslar yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  // Local dispute config entry
  const disputeConfig: Record<string, StatusConfig> = {
    disputed_override: { label: "İtirazlı", variant: "destructive" },
  };

  const disputedCount = trades.filter((t) => t.hasDispute).length;

  const columns: ColumnDef<Trade, any>[] = [
    {
      header: "Takas No",
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.tradeNumber}</span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) =>
        row.original.hasDispute ? (
          <StatusBadge
            status="disputed_override"
            config={disputeConfig}
            label="⚠️ İtirazlı"
          />
        ) : (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={row.original.status} config={tradeStatusConfig} />
            {row.original.status === "cancelled" &&
              cancelReasonLabel(row.original.cancelReason) && (
                <span className="text-xs text-muted">
                  {cancelReasonLabel(row.original.cancelReason)}
                </span>
              )}
          </div>
        ),
    },
    {
      header: "Başlatan",
      cell: ({ row }) => (
        <Link
          href={`/users/${row.original.initiator.id}`}
          className="text-heading hover:text-primary-600"
        >
          {row.original.initiator.displayName}
        </Link>
      ),
    },
    {
      header: "Alan",
      cell: ({ row }) => (
        <Link
          href={`/users/${row.original.receiver.id}`}
          className="text-heading hover:text-primary-600"
        >
          {row.original.receiver.displayName}
        </Link>
      ),
    },
    {
      header: "Ürünler",
      cell: ({ row }) => (
        <>
          {row.original.initiatorItemsCount} ↔️ {row.original.receiverItemsCount}
        </>
      ),
    },
    {
      header: "Nakit",
      cell: ({ row }) =>
        row.original.cashAmount ? (
          <span className="text-primary-400">
            +₺{row.original.cashAmount.toLocaleString()}
          </span>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    {
      header: "Tarih",
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {new Date(row.original.createdAt).toLocaleDateString("tr-TR")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) => (
        <div className="flex gap-1 whitespace-nowrap">
          <Link
            href={`/trades/${row.original.id}`}
            className="p-2 text-muted hover:text-heading hover:bg-surface-alt rounded-lg"
            title="Detay"
          >
            <EyeIcon className="h-5 w-5" />
          </Link>
          {row.original.hasDispute && (
            <Button
              variant="secondary"
              className="p-2 text-danger-600 hover:bg-danger-500/10 rounded-lg"
              title="İtirazı Çöz"
            >
              <ExclamationTriangleIcon className="h-5 w-5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-heading">Takaslar</h1>
            <p className="text-muted mt-1">
              Toplam {total} takas
              {selectedUserId && (
                <span className="ml-2">
                  — Kullanıcıya göre filtreleniyor
                  <Button
                    variant="secondary"
                    onClick={clearUserFilter}
                    className="ml-2 text-primary-600 hover:underline"
                  >
                    Filtreyi kaldır
                  </Button>
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-2 items-end">
            {reviewQueueCount > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  setStatus("at_warehouse");
                  setPage(1);
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-medium transition-colors ${
                  status === "at_warehouse"
                    ? "bg-warning-500 text-inverted border-warning-600"
                    : "bg-warning-100 text-warning-900 border-warning-400 hover:bg-warning-200"
                }`}
                title="İnceleme kuyruğunu filtrele"
              >
                <ExclamationTriangleIcon className="h-5 w-5" />
                <span>{reviewQueueCount} takas inceleme bekliyor</span>
              </Button>
            )}
            {disputedCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2 bg-danger-900/20 border border-danger-700 rounded-lg">
                <ExclamationTriangleIcon className="h-5 w-5 text-danger-600" />
                <span className="text-danger-600">
                  {disputedCount} itirazlı takas
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          {/* User Filter */}
          <div className="relative w-full sm:w-64">
            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
            <Input
              type="text"
              placeholder="Kullanıcı ara..."
              value={userSearch}
              onChange={(e) => {
                setUserSearch(e.target.value);
                setShowUserDropdown(true);
              }}
              onFocus={() => setShowUserDropdown(true)}
              className="pl-10 pr-10"
            />
            {selectedUserId && (
              <Button
                variant="secondary"
                onClick={clearUserFilter}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-heading"
              >
                <XCircleIcon className="h-5 w-5" />
              </Button>
            )}

            {showUserDropdown && userSearch.length >= 2 && (
              <div className="absolute z-50 mt-1 bg-surface-alt shadow-lg max-h-60 overflow-y-auto">
                {loadingUsers ? (
                  <div className="p-3 text-center text-muted">
                    Aranıyor...
                  </div>
                ) : users.length > 0 ? (
                  users.map((user) => (
                    <Button
                      variant="secondary"
                      key={user.id}
                      onClick={() => handleSelectUser(user)}
                      className="w-full px-4 py-2 text-left hover:bg-surface-alt text-heading"
                    >
                      <div className="font-medium">{user.displayName}</div>
                      <div className="text-xs text-muted">{user.email}</div>
                    </Button>
                  ))
                ) : (
                  <div className="p-3 text-center text-muted">
                    Kullanıcı bulunamadı
                  </div>
                )}
              </div>
            )}
          </div>

          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="sm:w-48"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>

        <DataTable
          columns={columns}
          data={trades}
          loading={loading}
          emptyText="Takas bulunamadı"
          getRowId={(t) => t.id}
        />

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted">
            Sayfa {page} / {Math.ceil(total / 20)}
          </p>
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
