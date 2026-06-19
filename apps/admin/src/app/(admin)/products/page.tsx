"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import {
  getProductEffectivePrice,
  isProductOnSaleDisplay,
  getProductOriginalPriceForDisplay,
} from "@/lib/productPrice";
import Image from "next/image";
import {
  Button,
  Input,
  Select,
  StatusBadge,
  productStatusConfig,
  productConditionConfig,
  enumLabel,
} from "@tarodan/ui";
import { type ColumnDef } from "@/components/DataTable";
import {
  CheckIcon,
  XMarkIcon,
  EyeIcon,
  TrashIcon,
  XCircleIcon,
  UserIcon,
  ArrowUturnLeftIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useConfirm } from "@/components/ConfirmProvider";
import { ActionButtons, ActionIconButton } from "@/components/admin-list";
import { ResourceListPage } from "@/components/ResourceListPage";
import { useAdminResource } from "@/hooks/useAdminResource";
import { statusFilterOptions } from "@/lib/utils";

// ─── Tipler ────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  status: "pending" | "active" | "rejected" | "sold" | "inactive" | "reserved" | "deleted";
  condition: string;
  seller: {
    id: string;
    displayName: string;
  };
  category: {
    name: string;
  };
  imageUrl?: string;
  createdAt: string;
}

interface UserOption {
  id: string;
  displayName: string;
  email: string;
}

// ─── Mapper ────────────────────────────────────────────────────────────────

function mapProducts(raw: any[]): Product[] {
  return raw.map((p: any) => ({
    id: p.id,
    title: p.title,
    price: Number(p.price),
    originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
    salePrice: p.salePrice != null ? Number(p.salePrice) : null,
    isOnSale: p.isOnSale,
    status: p.status,
    condition: p.condition,
    seller: p.seller || { id: p.sellerId, displayName: "Satıcı" },
    category: p.category || { name: "Kategori" },
    imageUrl: (() => {
      let url = p.imageUrl || p.images?.[0]?.url || p.images?.[0] || "";
      if (url && !url.startsWith("/") && !url.startsWith("http"))
        url = "/" + url;
      return url || "https://placehold.co/100x100/f3f4f6/666?text=Ürün";
    })(),
    createdAt: p.createdAt,
  }));
}

// Filtre seçenekleri productStatusConfig'ten türetilir → badge'lerle birebir tutarlı, ProductStatus enum'undan sapmaz.
const statusOptions = statusFilterOptions(productStatusConfig, { allLabel: "Tüm Ürünler" });

// ─── Sayfa ─────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const confirm = useConfirm();

  // Satıcı autocomplete UI state. Seçilen sellerId artık hook filtresi (filters.sellerId)
  // — queryKey'in parçası olduğu için değişince doğru yeniden fetch eder ve "Filtreyi kaldır" çalışır.
  const [users, setUsers] = useState<UserOption[]>([]);
  const [sellerSearch, setSellerSearch] = useState("");
  const [showSellerDropdown, setShowSellerDropdown] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

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
        isSeller: true,
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

  // Debounce seller search — manual because this is a custom UI not tied to hook search
  const handleSellerSearchChange = (value: string) => {
    setSellerSearch(value);
    setShowSellerDropdown(true);
    const timer = setTimeout(() => {
      if (value) loadUsers(value);
    }, 300);
    // Note: timer cleanup is best-effort here; this is a simple pattern used in the original
    return () => clearTimeout(timer);
  };

  // ── useAdminResource ────────────────────────────────────────────────────────
  // Server-side filtreler: search, status, sellerId — hepsi backend getProducts(AdminProductQueryDto)
  // tarafından desteklenir ve hook filters'ı (queryKey'in parçası) ile yönetilir.
  // sellerId, ?sellerId= deep-link'i ile gelir; syncUrl URL'i yönetir.
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
  } = useAdminResource<any>({
    queryKey: "products",
    fetcher: (params) => adminApi.getProducts(params),
    limit: 20,
    syncUrl: true,
    initialFilters: { status: "all", sellerId: "" },
    errorMessage: "Ürünler yüklenemedi",
  });

  const handleSelectSeller = (user: UserOption) => {
    setFilter("sellerId", user.id);
    setSellerSearch(user.displayName);
    setShowSellerDropdown(false);
  };

  const clearSellerFilter = () => {
    setFilter("sellerId", "");
    setSellerSearch("");
  };

  const products: Product[] = useMemo(() => mapProducts(rawRows), [rawRows]);

  // Pending count for header badge
  const pendingCount = products.filter((p) => p.status === "pending").length;

  // ── Row mutations ────────────────────────────────────────────────────────────

  const getConditionLabel = (condition: string) =>
    enumLabel(productConditionConfig, condition);

  const handleApprove = async (productId: string) => {
    try {
      await adminApi.approveProduct(productId);
      toast.success("Ürün onaylandı");
      refetch();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Approve error:", error);
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        (error.response ? `Sunucu hatası: ${error.response.status}` : null) ||
        (error.request ? "Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin." : null) ||
        error.message ||
        "İşlem başarısız";
      toast.error(errorMessage);
    }
  };

  const handleReject = async (productId: string) => {
    const reason = prompt("Reddetme sebebi:");
    if (!reason) return;
    try {
      await adminApi.rejectProduct(productId, reason);
      toast.success("Ürün reddedildi");
      refetch();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Reject error:", error);
      toast.error(error?.response?.data?.message || error?.message || "İşlem başarısız");
    }
  };

  const handleDelete = async (productId: string) => {
    if (
      !(await confirm({
        title: "Ürünü kaldır",
        description:
          "Ürün listelerden kaldırılacak (Kaldırıldı durumuna alınır). İstediğinde Geri Yükle ile geri getirebilirsin.",
        confirmLabel: "Kaldır",
        destructive: true,
      }))
    )
      return;
    try {
      await adminApi.deleteProduct(productId);
      toast.success("Ürün kaldırıldı");
      refetch();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Delete error:", error);
      toast.error(
        error.response?.data?.message ||
          error.response?.data?.error ||
          error.message ||
          "İşlem başarısız",
      );
    }
  };

  const handleRestore = async (productId: string) => {
    if (
      !(await confirm({
        title: "Ürünü geri yükle",
        description:
          "Ürün yeniden onaya (Beklemede) düşecek ve onaylandıktan sonra yayınlanacak.",
        confirmLabel: "Geri Yükle",
      }))
    )
      return;
    try {
      await adminApi.restoreProduct(productId);
      toast.success("Ürün geri yüklendi (onay bekliyor)");
      refetch();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Restore error:", error);
      toast.error(
        error.response?.data?.message ||
          error.response?.data?.error ||
          error.message ||
          "İşlem başarısız",
      );
    }
  };

  // ── Kolon tanımları ─────────────────────────────────────────────────────────

  const columns: ColumnDef<Product, any>[] = [
    {
      header: "Ürün",
      cell: ({ row }) => (
        <div className="flex items-center">
          <div className="w-12 h-12 bg-surface-alt rounded-lg overflow-hidden mr-3 flex-shrink-0">
            <Image
              src={
                row.original.imageUrl ||
                "https://placehold.co/100x100/f3f4f6/666?text=Ürün"
              }
              alt={row.original.title}
              width={48}
              height={48}
              className="object-cover w-full h-full"
              unoptimized
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "https://placehold.co/100x100/f3f4f6/666?text=Ürün";
              }}
            />
          </div>
          <span className="font-medium text-heading line-clamp-2">
            {row.original.title}
          </span>
        </div>
      ),
    },
    {
      header: "Fiyat",
      cell: ({ row }) => (
        <span className="font-medium text-primary-400">
          {isProductOnSaleDisplay(row.original) && (
            <span className="text-muted line-through text-sm block">
              ₺
              {getProductOriginalPriceForDisplay(row.original).toLocaleString("tr-TR")}
            </span>
          )}
          ₺{getProductEffectivePrice(row.original).toLocaleString("tr-TR")}
        </span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} config={productStatusConfig} />
      ),
    },
    {
      header: "Kondisyon",
      cell: ({ row }) => (
        <span className="text-muted">
          {getConditionLabel(row.original.condition)}
        </span>
      ),
    },
    {
      header: "Satıcı",
      cell: ({ row }) => (
        <Link
          href={`/users/${row.original.seller.id}`}
          className="text-heading hover:text-primary-600"
        >
          {row.original.seller.displayName}
        </Link>
      ),
    },
    {
      header: "Kategori",
      cell: ({ row }) => row.original.category.name,
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
        <ActionButtons>
          <ActionIconButton
            icon={EyeIcon}
            href={`/products/${row.original.id}`}
            title="Detay"
          />
          {row.original.status === "pending" && (
            <>
              <ActionIconButton
                icon={CheckIcon}
                onClick={() => handleApprove(row.original.id)}
                title="Onayla"
                variant="success"
              />
              <ActionIconButton
                icon={XMarkIcon}
                onClick={() => handleReject(row.original.id)}
                title="Reddet"
                variant="danger"
              />
            </>
          )}
          {row.original.status === "deleted" ? (
            <ActionIconButton
              icon={ArrowUturnLeftIcon}
              onClick={() => handleRestore(row.original.id)}
              title="Geri Yükle"
              variant="success"
            />
          ) : (
            row.original.status !== "sold" &&
            row.original.status !== "reserved" && (
              <ActionIconButton
                icon={TrashIcon}
                onClick={() => handleDelete(row.original.id)}
                title="Kaldır"
                variant="danger"
              />
            )
          )}
        </ActionButtons>
      ),
    },
  ];

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ResourceListPage<Product>
      title="Ürünler"
      description={
        <>
          {filters.status === "pending"
            ? `${products.filter((p) => p.status === "pending").length} ürün onay bekliyor`
            : `Toplam ${total} ürün`}
          {pendingCount > 0 && (
            <span className="ml-2 px-3 py-1 bg-warning-500/20 text-warning-700 rounded-full text-sm font-medium shrink-0 whitespace-nowrap">
              {pendingCount} Bekleyen
            </span>
          )}
          {filters.sellerId && (
            <span className="ml-2">
              — Satıcıya göre filtreleniyor
              <Button
                variant="secondary"
                onClick={clearSellerFilter}
                className="ml-2 text-primary-600 hover:underline"
              >
                Filtreyi kaldır
              </Button>
            </span>
          )}
        </>
      }
      headerActions={
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              const res = await adminApi.exportProducts({
                status: filters.status === "all" ? undefined : filters.status,
                sellerId: filters.sellerId || undefined,
              });
              const blob = new Blob([res.data], { type: "text/csv" });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `products_${new Date().toISOString().split("T")[0]}.csv`;
              a.click();
              window.URL.revokeObjectURL(url);
            } catch (e) {
              console.error(e);
            }
          }}
          className="px-3 py-2 bg-surface-alt hover:bg-surface-alt text-heading rounded-lg text-sm"
        >
          CSV İndir
        </Button>
      }
      search={{ placeholder: "Ürün ara..." }}
      searchValue={search}
      onSearchChange={setSearch}
      onSearchSubmit={onSearchSubmit}
      filters={
        <>
          {/* Seller Filter — custom autocomplete (client-side UI, server-side filter) */}
          <div className="relative w-full sm:w-64">
            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
            <Input
              type="text"
              placeholder="Satıcı ara..."
              value={sellerSearch}
              onChange={(e) => handleSellerSearchChange(e.target.value)}
              onFocus={() => setShowSellerDropdown(true)}
              className="admin-input-with-icon-left pr-10"
            />
            {filters.sellerId && (
              <Button
                variant="secondary"
                onClick={clearSellerFilter}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-heading"
              >
                <XCircleIcon className="h-5 w-5" />
              </Button>
            )}

            {showSellerDropdown && sellerSearch.length >= 2 && (
              <div className="absolute z-50 mt-1 bg-surface-alt shadow-lg max-h-60 overflow-y-auto">
                {loadingUsers ? (
                  <div className="p-3 text-center text-muted">Aranıyor...</div>
                ) : users.length > 0 ? (
                  users.map((user) => (
                    <Button
                      variant="secondary"
                      key={user.id}
                      onClick={() => handleSelectSeller(user)}
                      className="w-full px-4 py-2 text-left hover:bg-surface-alt text-heading"
                    >
                      <div className="font-medium">{user.displayName}</div>
                      <div className="text-xs text-muted">{user.email}</div>
                    </Button>
                  ))
                ) : (
                  <div className="p-3 text-center text-muted">Satıcı bulunamadı</div>
                )}
              </div>
            )}
          </div>

          {/* Status Filter — server-side */}
          <Select
            value={filters.status ?? "all"}
            onChange={(e) => setFilter("status", e.target.value)}
            className="sm:w-48"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </>
      }
      columns={columns}
      data={products}
      loading={isLoading}
      emptyText="Ürün bulunamadı"
      getRowId={(p) => p.id}
      page={page}
      totalPages={totalPages}
      onPageChange={setPage}
    />
  );
}
