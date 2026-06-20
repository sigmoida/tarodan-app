"use client";

import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  NoSymbolIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { Button, Select, membershipTierConfig, enumLabel } from "@tarodan/ui";
import { type ColumnDef } from "@/components/DataTable";
import { ActionButtons, ActionIconButton } from "@/components/admin-list";
import { ResourceListPage } from "@/components/ResourceListPage";
import { ModerationEventsPanel } from "@/components/ModerationEventsPanel";
import { useAdminResource } from "@/hooks/useAdminResource";
import { usePrompt } from "@/components/PromptProvider";
import { adminApi } from "@/lib/api";

// Kullanıcılar ↔ AI Denetim sekmeleri (ortak AdminTabs yapısı)
const USER_TABS = [
  { key: "list", label: "Kullanıcılar" },
  { key: "ai", label: "AI Denetim" },
];

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

function mapUsers(raw: any[]): User[] {
  return raw.map((u: any) => ({
    id: u.id,
    email: u.email,
    displayName: u.displayName ?? u.email?.split("@")[0] ?? "-",
    phone: u.phone,
    isSeller: u.isSeller,
    isVerified: u.isVerified,
    isBanned: Boolean(u.isBanned),
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    membershipTier: u.membership?.tier?.type ?? "free",
    ordersCount: u._count?.buyerOrders ?? u._count?.sellerOrders ?? 0,
    productsCount: u._count?.products ?? 0,
  }));
}

export default function UsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Tab URL'den türetilir
  const tab = searchParams.get("tab") === "ai" ? "ai" : "list";
  const {
    rows: rawRows,
    total,
    page,
    setPage,
    totalPages,
    search,
    setSearch,
    onSearchSubmit,
    filters,
    setFilter,
    isLoading,
    refetch,
    setTabUrl,
  } = useAdminResource<any>({
    queryKey: "users",
    fetcher: (params) => {
      const { filter: _filter, ...rest } = params;
      const filterVal = params.filter as string | undefined;
      return adminApi.getUsers({
        ...rest,
        isSeller:
          filterVal === "sellers"
            ? true
            : filterVal === "buyers"
              ? false
              : undefined,
        isBanned: filterVal === "banned" ? true : undefined,
      });
    },
    limit: 20,
    syncUrl: true,
    initialFilters: { filter: "all" },
    errorMessage: "Kullanıcılar yüklenemedi",
  });

  const handleTabChange = (key: string) => {
    setTabUrl(key, { defaultTab: "list" });
  };

  const users: User[] = useMemo(() => mapUsers(rawRows), [rawRows]);

  const prompt = usePrompt();

  const handleBanUser = async (userId: string, isBanned: boolean) => {
    if (isBanned) {
      try {
        await adminApi.unbanUser(userId);
        toast.success("Kullanıcı engeli kaldırıldı");
        refetch();
      } catch (error: any) {
        toast.error(error.response?.data?.message ?? "İşlem başarısız");
      }
      return;
    }

    const reason = await prompt({
      title: "Kullanıcıyı Engelle",
      label: "Engelleme sebebi (isteğe bağlı)",
      defaultValue: "Admin tarafından engellendi",
      confirmLabel: "Engelle",
      destructive: true,
      required: false,
    });
    if (reason === null) return;
    try {
      await adminApi.banUser(userId, reason || "Admin tarafından engellendi");
      toast.success("Kullanıcı engellendi");
      refetch();
    } catch (error: any) {
      toast.error(error.response?.data?.message ?? "İşlem başarısız");
    }
  };

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
            <span className="badge badge-success">Doğrulanmış</span>
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
            {new Date(row.original.lastLoginAt).toLocaleDateString("tr-TR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : (
          <span className="text-muted whitespace-nowrap">
            Hiç giriş yapmadı
          </span>
        ),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) => (
        <ActionButtons>
          <ActionIconButton
            icon={row.original.isBanned ? CheckCircleIcon : NoSymbolIcon}
            onClick={() =>
              handleBanUser(row.original.id, row.original.isBanned)
            }
            title={row.original.isBanned ? "Engeli Kaldır" : "Engelle"}
            variant={row.original.isBanned ? "success" : "danger"}
          />
        </ActionButtons>
      ),
    },
  ];

  // AI Denetim sekmesi → ortak ModerationEventsPanel (kullanıcı olayları: avatar/bio/ad)
  if (tab === "ai") {
    return (
      <ModerationEventsPanel
        entityType="user"
        title="Kullanıcılar"
        tabs={USER_TABS}
        activeTab={tab}
        onTabChange={handleTabChange}
      />
    );
  }

  return (
    <ResourceListPage<User>
      title="Kullanıcılar"
      description={`Toplam ${total} kullanıcı`}
      tabs={USER_TABS}
      activeTab={tab}
      onTabChange={handleTabChange}
      search={{ placeholder: "E-posta veya isim ara..." }}
      searchValue={search}
      onSearchChange={setSearch}
      onSearchSubmit={onSearchSubmit}
      filters={
        <Select
          value={filters.filter ?? "all"}
          onChange={(e) => setFilter("filter", e.target.value)}
          className="sm:w-48"
        >
          <option value="all">Tüm Kullanıcılar</option>
          <option value="sellers">Satıcılar</option>
          <option value="buyers">Alıcılar</option>
          <option value="banned">Engelliler</option>
        </Select>
      }
      columns={columns}
      data={users}
      loading={isLoading}
      emptyText="Kullanıcı bulunamadı"
      getRowId={(u) => u.id}
      onRowClick={(u) => router.push(`/users/${u.id}`)}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}
