"use client";

import { useState, useEffect } from "react";
import { adminApi } from "@/lib/api";
import {
  EyeIcon,
  NoSymbolIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { Button, Select, membershipTierConfig, enumLabel } from "@tarodan/ui";
import { DataTable, type ColumnDef } from "@/components/DataTable";
import {
  PageHeader,
  FilterToolbar,
  ActionButtons,
  ActionIconButton,
} from "@/components/admin-list";

interface User {
  id: string;
  email: string;
  displayName: string;
  phone?: string;
  isSeller: boolean;
  isVerified: boolean;
  isBanned: boolean;
  createdAt: string;
  lastLoginAt?: string;
  membershipTier?: string;
  ordersCount: number;
  productsCount: number;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadUsers();
  }, [page, filter]);

  const loadUsers = async (pageOverride?: number) => {
    const currentPage = pageOverride ?? page;
    setLoading(true);
    try {
      const response = await adminApi.getUsers({
        page: currentPage,
        limit: 20,
        search: search || undefined,
        isSeller:
          filter === "sellers" ? true : filter === "buyers" ? false : undefined,
        isBanned: filter === "banned" ? true : undefined,
      });
      const data = response.data.data || response.data.users || [];
      const meta = response.data.meta || {};
      setUsers(
        data.map((u: any) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName ?? u.email?.split("@")[0] ?? "-",
          phone: u.phone,
          isSeller: u.isSeller,
          isVerified: u.isVerified,
          isBanned: Boolean(u.isBanned),
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt,
          membershipTier: u.membershipTier?.name ?? "basic",
          ordersCount: u._count?.buyerOrders ?? u._count?.sellerOrders ?? 0,
          productsCount: u._count?.products ?? 0,
        })),
      );
      setTotal(meta.total || data.length);
      if (pageOverride !== undefined) setPage(pageOverride);
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Users load error:", error);
      toast.error("Kullanıcılar yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async (userId: string, isBanned: boolean) => {
    try {
      if (isBanned) {
        await adminApi.unbanUser(userId);
        toast.success("Kullanıcı engeli kaldırıldı");
      } else {
        const reason =
          window.prompt("Engelleme sebebi (isteğe bağlı):") ??
          "Admin tarafından engellendi";
        await adminApi.banUser(userId, reason);
        toast.success("Kullanıcı engellendi");
      }
      loadUsers();
    } catch (error: any) {
      toast.error(error.response?.data?.message ?? "İşlem başarısız");
    }
  };

  const filteredUsers = users.filter((user) => {
    if (search) {
      const searchLower = search.toLowerCase();
      if (
        !user.email.toLowerCase().includes(searchLower) &&
        !user.displayName.toLowerCase().includes(searchLower)
      ) {
        return false;
      }
    }
    if (filter === "sellers" && !user.isSeller) return false;
    if (filter === "buyers" && user.isSeller) return false;
    if (filter === "banned" && !user.isBanned) return false;
    return true;
  });

  const columns: ColumnDef<User, any>[] = [
    {
      header: "Kullanıcı",
      cell: ({ row }) => (
        <div className="flex items-center">
          <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center mr-3">
            <span className="text-primary-600 font-medium">
              {row.original.displayName?.charAt(0) ?? "?"}
            </span>
          </div>
          <div>
            <p className="font-medium text-heading">
              {row.original.displayName}
            </p>
            <p className="text-sm text-muted">{row.original.email}</p>
          </div>
        </div>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          {row.original.isSeller && (
            <span className="badge badge-info">Satıcı</span>
          )}
          {row.original.isVerified && (
            <span className="badge badge-success">
              Doğrulanmış
            </span>
          )}
          {row.original.isBanned && (
            <span className="badge badge-danger">Engelli</span>
          )}
        </div>
      ),
    },
    {
      header: "Üyelik",
      cell: ({ row }) => (
        <span
          className={`badge ${
            row.original.membershipTier === "premium"
              ? "badge-warning"
              : "badge-gray"
          }`}
        >
          {enumLabel(
            membershipTierConfig,
            (row.original.membershipTier || "").toLowerCase(),
            row.original.membershipTier || "Ücretsiz",
          )}
        </span>
      ),
    },
    {
      header: "Sipariş",
      cell: ({ row }) => row.original.ordersCount,
    },
    {
      header: "Ürün",
      cell: ({ row }) => row.original.productsCount,
    },
    {
      header: "Kayıt Tarihi",
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {new Date(row.original.createdAt).toLocaleDateString("tr-TR")}
        </span>
      ),
    },
    {
      header: "Son Giriş",
      cell: ({ row }) =>
        row.original.lastLoginAt ? (
          <span className="text-muted whitespace-nowrap">
            {new Date(row.original.lastLoginAt).toLocaleDateString(
              "tr-TR",
              {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              },
            )}
          </span>
        ) : (
          <span className="text-muted whitespace-nowrap">Hiç giriş yapmadı</span>
        ),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) => (
        <ActionButtons>
          <ActionIconButton
            icon={EyeIcon}
            href={`/users/${row.original.id}`}
            title="Detay"
          />
          <ActionIconButton
            icon={row.original.isBanned ? CheckCircleIcon : NoSymbolIcon}
            onClick={() => handleBanUser(row.original.id, row.original.isBanned)}
            title={row.original.isBanned ? "Engeli Kaldır" : "Engelle"}
            variant={row.original.isBanned ? "success" : "danger"}
          />
        </ActionButtons>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Kullanıcılar" description={`Toplam ${total} kullanıcı`} />

      <FilterToolbar
        search={search}
        onSearchChange={setSearch}
        onSearchSubmit={() => loadUsers(1)}
        searchPlaceholder="E-posta veya isim ara..."
      >
        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="sm:w-48"
        >
          <option value="all">Tüm Kullanıcılar</option>
          <option value="sellers">Satıcılar</option>
          <option value="buyers">Alıcılar</option>
          <option value="banned">Engelliler</option>
        </Select>
      </FilterToolbar>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredUsers}
        loading={loading}
        emptyText="Kullanıcı bulunamadı"
        getRowId={(u) => u.id}
      />

      {/* Pagination */}
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
  );
}
