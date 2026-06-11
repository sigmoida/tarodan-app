"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
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
import { DataTable, type ColumnDef } from "@/components/DataTable";
import {
  MagnifyingGlassIcon,
  CheckIcon,
  XMarkIcon,
  EyeIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { useConfirm } from "@/components/ConfirmProvider";

interface Product {
  id: string;
  title: string;
  price: number;
  originalPrice?: number | null;
  salePrice?: number | null;
  isOnSale?: boolean;
  status: "pending" | "active" | "rejected" | "sold" | "inactive";
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

interface User {
  id: string;
  displayName: string;
  email: string;
}

export default function ProductsPage() {
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlSellerId = useMemo(
    () => searchParams.get("sellerId") || "",
    [searchParams],
  );

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Seller filtering
  const [users, setUsers] = useState<User[]>([]);
  const [selectedSellerId, setSelectedSellerId] = useState<string>(urlSellerId);
  const [sellerSearch, setSellerSearch] = useState("");
  const [showSellerDropdown, setShowSellerDropdown] = useState(false);
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

  // Debounce seller search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (sellerSearch) loadUsers(sellerSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [sellerSearch, loadUsers]);

  // Sync URL sellerId with state
  useEffect(() => {
    setSelectedSellerId(urlSellerId);
  }, [urlSellerId]);

  const handleSelectSeller = (user: User) => {
    setSelectedSellerId(user.id);
    setSellerSearch(user.displayName);
    setShowSellerDropdown(false);
    router.push(`/products?sellerId=${user.id}`);
  };

  const clearSellerFilter = () => {
    setSelectedSellerId("");
    setSellerSearch("");
    router.push("/products");
  };

  useEffect(() => {
    loadProducts();
  }, [page, filter, selectedSellerId]);

  const loadProducts = async (pageOverride?: number) => {
    const currentPage = pageOverride ?? page;
    setLoading(true);
    try {
      const response = await adminApi.getProducts({
        page: currentPage,
        limit: 20,
        status: filter === "all" ? undefined : filter,
        search: search || undefined,
        sellerId: selectedSellerId || undefined,
      });
      const data = response.data.data || response.data.products || [];
      const meta = response.data.meta || {};
      if (pageOverride !== undefined) setPage(pageOverride);
      const mappedProducts = data.map((p: any) => ({
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
      setProducts(mappedProducts);
      setTotal(meta.total || data.length);
      setPendingCount(
        mappedProducts.filter((p: Product) => p.status === "pending").length,
      );
      setSelectedIds(new Set()); // Clear selection on page change
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Products load error:", error);
      toast.error("Ürünler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (productId: string) => {
    try {
      const response = await adminApi.approveProduct(productId);
      toast.success("Ürün onaylandı");
      loadProducts();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Approve error:", error);

      // Better error handling
      let errorMessage = "İşlem başarısız";

      if (error.response) {
        // Server responded with error
        errorMessage =
          error.response.data?.message ||
          error.response.data?.error ||
          `Sunucu hatası: ${error.response.status}`;
      } else if (error.request) {
        // Request made but no response
        errorMessage =
          "Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.";
      } else {
        // Error in request setup
        errorMessage = error.message || "Bir hata oluştu";
      }

      toast.error(errorMessage);
    }
  };

  const handleReject = async (productId: string) => {
    const reason = prompt("Reddetme sebebi:");
    if (!reason) return;

    try {
      await adminApi.rejectProduct(productId, reason);
      toast.success("Ürün reddedildi");
      loadProducts();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Reject error:", error);
      const errorMessage =
        error?.response?.data?.message || error?.message || "İşlem başarısız";
      toast.error(errorMessage);
    }
  };

  const handleDelete = async (productId: string) => {
    if (!(await confirm({ description: "Bu ürünü silmek istediğinize emin misiniz?", destructive: true }))) return;

    try {
      await adminApi.deleteProduct(productId);
      toast.success("Ürün silindi");
      loadProducts();
    } catch (error) {
      toast.error("İşlem başarısız");
    }
  };

  // Selection handlers
  const toggleSelect = (productId: string) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(productId)) {
        newSet.delete(productId);
      } else {
        newSet.add(productId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = (_ids?: string[]) => {
    const pendingProducts = filteredProducts.filter(
      (p) => p.status === "pending",
    );
    if (
      pendingProducts.length > 0 &&
      selectedIds.size === pendingProducts.length
    ) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingProducts.map((p) => p.id)));
    }
  };

  const handleBulkApprove = async () => {
    if (selectedIds.size === 0) {
      toast.error("En az bir ürün seçin");
      return;
    }

    setBulkProcessing(true);
    try {
      const result = await adminApi.bulkApproveProducts(
        Array.from(selectedIds),
      );
      toast.success(
        result.data.message || `${selectedIds.size} ürün onaylandı`,
      );
      setSelectedIds(new Set());
      loadProducts();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Bulk approve error:", error);
      toast.error(error.response?.data?.message || "Toplu onaylama başarısız");
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkReject = async () => {
    if (selectedIds.size === 0) {
      toast.error("En az bir ürün seçin");
      return;
    }

    const reason = prompt("Toplu reddetme sebebi:");
    if (!reason) return;

    setBulkProcessing(true);
    try {
      const result = await adminApi.bulkRejectProducts(
        Array.from(selectedIds),
        reason,
      );
      toast.success(
        result.data.message || `${selectedIds.size} ürün reddedildi`,
      );
      setSelectedIds(new Set());
      loadProducts();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Bulk reject error:", error);
      toast.error(error.response?.data?.message || "Toplu reddetme başarısız");
    } finally {
      setBulkProcessing(false);
    }
  };

  // Merkezi ProductCondition etiketleri (new/like_new/very_good/good/fair).
  const getConditionLabel = (condition: string) =>
    enumLabel(productConditionConfig, condition);

  const filteredProducts = products.filter((product) => {
    if (search && !product.title.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (filter !== "all" && product.status !== filter) return false;
    return true;
  });

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
              {getProductOriginalPriceForDisplay(row.original).toLocaleString(
                "tr-TR",
              )}
            </span>
          )}
          ₺
          {getProductEffectivePrice(row.original).toLocaleString("tr-TR")}
        </span>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          config={productStatusConfig}
        />
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
        <div className="flex items-center gap-1 whitespace-nowrap">
          <Link
            href={`/products/${row.original.id}`}
            className="p-2 text-muted hover:text-heading hover:bg-surface-alt rounded-lg"
            title="Detay"
          >
            <EyeIcon className="h-5 w-5" />
          </Link>
          {row.original.status === "pending" && (
            <>
              <Button
                variant="secondary"
                onClick={() => handleApprove(row.original.id)}
                className="p-2 text-success-700 hover:bg-success-500/10 rounded-lg"
                title="Onayla"
              >
                <CheckIcon className="h-5 w-5" />
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleReject(row.original.id)}
                className="p-2 text-danger-600 hover:bg-danger-500/10 rounded-lg"
                title="Reddet"
              >
                <XMarkIcon className="h-5 w-5" />
              </Button>
            </>
          )}
          <Button
            variant="secondary"
            onClick={() => handleDelete(row.original.id)}
            className="p-2 text-danger-600 hover:bg-danger-500/10 rounded-lg"
            title="Sil"
          >
            <TrashIcon className="h-5 w-5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold text-heading">Ürünler</h1>
            <p className="text-muted mt-1">
              {filter === "pending"
                ? `${products.filter((p) => p.status === "pending").length} ürün onay bekliyor`
                : `Toplam ${total} ürün`}
              {selectedSellerId && (
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
            </p>
          </div>
          {pendingCount > 0 && (
            <span className="px-3 py-1 bg-warning-500/20 text-warning-700 rounded-full text-sm font-medium">
              {pendingCount} Bekleyen
            </span>
          )}
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">
              {selectedIds.size} ürün seçili
            </span>
            <Button
              variant="success"
              size="sm"
              onClick={handleBulkApprove}
              disabled={bulkProcessing}
              isLoading={bulkProcessing}
            >
              <CheckCircleIcon className="h-4 w-4" />
              Seçilenleri Onayla
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleBulkReject}
              disabled={bulkProcessing}
              isLoading={bulkProcessing}
            >
              <XCircleIcon className="h-4 w-4" />
              Seçilenleri Reddet
            </Button>
          </div>
        )}
        <Button
          variant="secondary"
          onClick={async () => {
            try {
              const res = await adminApi.exportProducts({
                status: filter === "all" ? undefined : filter,
                sellerId: selectedSellerId || undefined,
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
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 flex gap-2">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted pointer-events-none" />
          <Input
            type="text"
            placeholder="Ürün ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadProducts(1)}
            className="admin-input-with-icon-left flex-1"
          />
          <Button
            type="button"
            onClick={() => loadProducts(1)}
            className="whitespace-nowrap"
          >
            Ara
          </Button>
        </div>

        {/* Seller Filter */}
        <div className="relative w-full sm:w-64">
          <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" />
          <Input
            type="text"
            placeholder="Satıcı ara..."
            value={sellerSearch}
            onChange={(e) => {
              setSellerSearch(e.target.value);
              setShowSellerDropdown(true);
            }}
            onFocus={() => setShowSellerDropdown(true)}
            className="admin-input-with-icon-left pr-10"
          />
          {selectedSellerId && (
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
                <div className="p-3 text-center text-muted">
                  Satıcı bulunamadı
                </div>
              )}
            </div>
          )}
        </div>

        <Select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="sm:w-48"
        >
          <option value="all">Tüm Ürünler</option>
          <option value="pending">Onay Bekleyenler</option>
          <option value="active">Aktif</option>
          <option value="rejected">Reddedilenler</option>
          <option value="sold">Satılanlar</option>
          <option value="inactive">Silindi</option>
        </Select>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={filteredProducts}
        loading={loading}
        emptyText="Ürün bulunamadı"
        getRowId={(p) => p.id}
        selectable
        selectedIds={Array.from(selectedIds)}
        onToggleRow={(id) => toggleSelect(id)}
        onToggleAll={(ids) => toggleSelectAll(ids)}
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
