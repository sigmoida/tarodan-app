"use client";

import { useState } from "react";
import { adminApi } from "@/lib/api";
import { type ColumnDef } from "@/components/DataTable";
import {
  Button,
  Checkbox,
  Input,
  Select,
  StatusBadge,
  Textarea,
} from "@tarodan/ui";
import type { StatusConfig } from "@tarodan/ui";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { ActionButtons, ActionIconButton } from "@/components/admin-list";
import { ResourceListPage } from "@/components/ResourceListPage";
import { useAdminResource } from "@/hooks/useAdminResource";

// ─── Tipler ────────────────────────────────────────────────────────────────

interface Discount {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  type: "percentage" | "fixed_amount" | "bogo" | "bulk_quantity";
  value: number;
  scope: "global" | "category" | "product" | "seller";
  sellerId: string | null;
  sellerName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  targetProductIds: string[];
  minCartValue: number | null;
  minQuantity: number | null;
  buyQuantity: number | null;
  getQuantity: number | null;
  maxDiscountAmount: number | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number;
  usedCount: number;
  isStackable: boolean;
  priority: number;
  isActive: boolean;
  isFlashSale: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  isCurrentlyValid: boolean;
  remainingUsage: number | null;
}

interface Category {
  id: string;
  name: string;
}

interface DiscountFormData {
  code: string;
  name: string;
  description: string;
  type: "percentage" | "fixed_amount" | "bogo" | "bulk_quantity";
  value: number;
  scope: "global" | "category" | "product" | "seller";
  categoryId: string;
  minCartValue: string;
  minQuantity: string;
  buyQuantity: string;
  getQuantity: string;
  maxDiscountAmount: string;
  usageLimitTotal: string;
  usageLimitPerUser: string;
  isStackable: boolean;
  priority: number;
  isActive: boolean;
  isFlashSale: boolean;
  startDate: string;
  endDate: string;
}

// ─── Sabitler ──────────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<string, string> = {
  global: "Tüm Site",
  category: "Kategori",
  product: "Ürün",
  seller: "Satıcı",
};

const discountStatusConfig: Record<string, StatusConfig> = {
  inactive: { label: "Pasif", variant: "secondary" },
  active: { label: "Aktif", variant: "success" },
  pending: { label: "Bekliyor", variant: "warning" },
  expired: { label: "Süresi Doldu", variant: "danger" },
  unknown: { label: "Belirsiz", variant: "secondary" },
};

const getDiscountStatus = (discount: Discount): string => {
  if (!discount.isActive) return "inactive";
  if (discount.isCurrentlyValid) return "active";
  const now = new Date();
  const start = new Date(discount.startDate);
  const end = new Date(discount.endDate);
  if (now < start) return "pending";
  if (now > end) return "expired";
  return "unknown";
};

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

// ─── Sayfa ─────────────────────────────────────────────────────────────────

export default function DiscountsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [formData, setFormData] = useState<DiscountFormData>({
    code: "",
    name: "",
    description: "",
    type: "percentage",
    value: 10,
    scope: "global",
    categoryId: "",
    minCartValue: "",
    minQuantity: "",
    buyQuantity: "",
    getQuantity: "",
    maxDiscountAmount: "",
    usageLimitTotal: "",
    usageLimitPerUser: "1",
    isStackable: false,
    priority: 0,
    isActive: true,
    isFlashSale: false,
    startDate: new Date().toISOString().split("T")[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
  });

  // ── Veri çekme (useAdminResource) ──────────────────────────────────────────
  // Backend /admin/discounts: search, scope, isActive, page, limit destekleniyor
  const {
    rows,
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
  } = useAdminResource<Discount>({
    queryKey: "discounts",
    fetcher: (params) =>
      adminApi.get("/admin/discounts", {
        params: {
          page: params.page,
          limit: params.limit,
          search: params.search || undefined,
          scope: params.scope || undefined,
          isActive:
            params.isActive === undefined || params.isActive === "all"
              ? undefined
              : params.isActive === "true",
        },
      }),
    limit: 20,
    syncUrl: true,
    initialFilters: { scope: "all", isActive: "all" },
    errorMessage: "İndirimler yüklenemedi",
  });

  // ── Kategorileri yükle (modal açılınca) ────────────────────────────────────

  const loadCategories = async () => {
    if (categories.length > 0) return;
    try {
      const response = await adminApi.getCategories();
      setCategories(response.data.data || response.data || []);
    } catch (error) {
      console.error("Failed to load categories:", error);
    }
  };

  // ── Modal yardımcıları ─────────────────────────────────────────────────────

  const openCreateModal = () => {
    setEditingDiscount(null);
    setFormData({
      code: "",
      name: "",
      description: "",
      type: "percentage",
      value: 10,
      scope: "global",
      categoryId: "",
      minCartValue: "",
      minQuantity: "",
      buyQuantity: "",
      getQuantity: "",
      maxDiscountAmount: "",
      usageLimitTotal: "",
      usageLimitPerUser: "1",
      isStackable: false,
      priority: 0,
      isActive: true,
      isFlashSale: false,
      startDate: new Date().toISOString().split("T")[0],
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0],
    });
    loadCategories();
    setShowModal(true);
  };

  const openEditModal = (discount: Discount) => {
    setEditingDiscount(discount);
    setFormData({
      code: discount.code || "",
      name: discount.name,
      description: discount.description || "",
      type: discount.type,
      value: discount.value,
      scope: discount.scope,
      categoryId: discount.categoryId || "",
      minCartValue: discount.minCartValue?.toString() || "",
      minQuantity: discount.minQuantity?.toString() || "",
      buyQuantity: discount.buyQuantity?.toString() || "",
      getQuantity: discount.getQuantity?.toString() || "",
      maxDiscountAmount: discount.maxDiscountAmount?.toString() || "",
      usageLimitTotal: discount.usageLimitTotal?.toString() || "",
      usageLimitPerUser: discount.usageLimitPerUser.toString(),
      isStackable: discount.isStackable,
      priority: discount.priority,
      isActive: discount.isActive,
      isFlashSale: discount.isFlashSale,
      startDate: discount.startDate.split("T")[0],
      endDate: discount.endDate.split("T")[0],
    });
    loadCategories();
    setShowModal(true);
  };

  // ── Mutasyonlar ────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        code: formData.code.trim() ? formData.code.trim().toUpperCase() : null,
        name: formData.name,
        description: formData.description || undefined,
        type: formData.type,
        value: formData.value,
        scope: formData.scope,
        categoryId:
          formData.scope === "category" ? formData.categoryId : undefined,
        minCartValue: formData.minCartValue
          ? parseFloat(formData.minCartValue)
          : undefined,
        minQuantity: formData.minQuantity
          ? parseInt(formData.minQuantity)
          : undefined,
        buyQuantity: formData.buyQuantity
          ? parseInt(formData.buyQuantity)
          : undefined,
        getQuantity: formData.getQuantity
          ? parseInt(formData.getQuantity)
          : undefined,
        maxDiscountAmount: formData.maxDiscountAmount
          ? parseFloat(formData.maxDiscountAmount)
          : undefined,
        usageLimitTotal: formData.usageLimitTotal
          ? parseInt(formData.usageLimitTotal)
          : undefined,
        usageLimitPerUser: parseInt(formData.usageLimitPerUser) || 1,
        isStackable: formData.isStackable,
        priority: formData.priority,
        isActive: formData.isActive,
        isFlashSale: formData.isFlashSale,
        startDate: new Date(formData.startDate).toISOString(),
        endDate: new Date(formData.endDate + "T23:59:59").toISOString(),
      };

      if (editingDiscount) {
        await adminApi.patch(`/admin/discounts/${editingDiscount.id}`, data);
        toast.success("İndirim güncellendi");
      } else {
        await adminApi.post("/admin/discounts", data);
        toast.success("İndirim oluşturuldu");
      }

      setShowModal(false);
      refetch();
    } catch (error: any) {
      console.error("Failed to save discount:", error);
      toast.error(
        error.response?.data?.message || "İndirim kaydedilirken hata oluştu"
      );
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.delete(`/admin/discounts/${id}`);
      toast.success("İndirim silindi");
      setDeleteConfirm(null);
      refetch();
    } catch (error) {
      console.error("Failed to delete discount:", error);
      toast.error("İndirim silinirken hata oluştu");
    }
  };

  const toggleDiscountStatus = async (discount: Discount) => {
    try {
      await adminApi.patch(`/admin/discounts/${discount.id}`, {
        isActive: !discount.isActive,
      });
      toast.success(
        discount.isActive ? "İndirim devre dışı bırakıldı" : "İndirim aktif edildi"
      );
      refetch();
    } catch (error) {
      console.error("Failed to toggle discount status:", error);
      toast.error("Durum güncellenirken hata oluştu");
    }
  };

  // ── Kolon tanımları ────────────────────────────────────────────────────────

  const columns: ColumnDef<Discount, any>[] = [
    {
      header: "İndirim",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-heading">{row.original.name}</p>
          {row.original.description && (
            <p className="text-xs text-muted truncate max-w-xs">
              {row.original.description}
            </p>
          )}
        </div>
      ),
    },
    {
      header: "Kod",
      cell: ({ row }) => (
        <>
          {row.original.code ? (
            <code className="px-2 py-1 bg-surface-alt rounded text-sm font-mono text-heading">
              {row.original.code}
            </code>
          ) : (
            <span className="text-xs text-muted italic">Otomatik</span>
          )}
          {row.original.isFlashSale && (
            <span className="ml-2 px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-xs font-medium border border-primary-200">
              ⚡ Flash
            </span>
          )}
        </>
      ),
    },
    {
      header: "Değer",
      cell: ({ row }) => (
        <span className="font-semibold text-primary">
          {row.original.type === "percentage" && `%${row.original.value}`}
          {row.original.type === "fixed_amount" && `${row.original.value} TL`}
          {row.original.type === "bogo" &&
            `BOGO (${row.original.buyQuantity} Ver ${row.original.getQuantity} Al ${
              row.original.value === 100 ? "Bedava" : `%${row.original.value} İndirim`
            })`}
          {row.original.type === "bulk_quantity" &&
            `${row.original.minQuantity} adet alımda %${row.original.value}`}
        </span>
      ),
    },
    {
      header: "Kapsam",
      cell: ({ row }) => (
        <>
          <span className="badge badge-info">
            {SCOPE_LABELS[row.original.scope]}
          </span>
          {row.original.categoryName && (
            <p className="text-xs text-muted mt-1">{row.original.categoryName}</p>
          )}
        </>
      ),
    },
    {
      header: "Kullanım",
      cell: ({ row }) => (
        <span className="text-muted">
          {row.original.usedCount}
          {row.original.usageLimitTotal && ` / ${row.original.usageLimitTotal}`}
        </span>
      ),
    },
    {
      header: "Tarih",
      cell: ({ row }) => (
        <p className="text-xs text-muted">
          {formatDate(row.original.startDate)} – {formatDate(row.original.endDate)}
        </p>
      ),
    },
    {
      header: "Durum",
      cell: ({ row }) => (
        <StatusBadge
          status={getDiscountStatus(row.original)}
          config={discountStatusConfig}
        />
      ),
    },
    {
      id: "actions",
      header: "İşlemler",
      cell: ({ row }) => (
        <ActionButtons>
          <ActionIconButton
            icon={row.original.isActive ? XMarkIcon : CheckIcon}
            onClick={() => toggleDiscountStatus(row.original)}
            title={row.original.isActive ? "Devre dışı bırak" : "Aktif et"}
            variant={row.original.isActive ? "default" : "success"}
          />
          <ActionIconButton
            icon={PencilIcon}
            onClick={() => openEditModal(row.original)}
            title="Düzenle"
          />
          <ActionIconButton
            icon={TrashIcon}
            onClick={() => setDeleteConfirm(row.original.id)}
            title="Sil"
            variant="danger"
          />
        </ActionButtons>
      ),
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <ResourceListPage<Discount>
        title="İndirim Yönetimi"
        description="Kupon kodları ve otomatik kampanyaları yönetin"
        headerActions={
          <Button onClick={openCreateModal} className="flex gap-2">
            <PlusIcon className="w-5 h-5" />
            Yeni İndirim
          </Button>
        }
        search={{ placeholder: "İsim veya kod ile ara..." }}
        searchValue={search}
        onSearchChange={setSearch}
        onSearchSubmit={onSearchSubmit}
        filters={
          <>
            <Select
              value={filters.scope ?? "all"}
              onChange={(e) => setFilter("scope", e.target.value)}
              className="w-auto"
            >
              <option value="all">Tüm Kapsamlar</option>
              <option value="global">Tüm Site</option>
              <option value="category">Kategori</option>
              <option value="product">Ürün</option>
              <option value="seller">Satıcı</option>
            </Select>
            <Select
              value={filters.isActive ?? "all"}
              onChange={(e) => setFilter("isActive", e.target.value)}
              className="w-auto"
            >
              <option value="all">Tüm Durumlar</option>
              <option value="true">Aktif</option>
              <option value="false">Pasif</option>
            </Select>
          </>
        }
        columns={columns}
        data={rows}
        loading={isLoading}
        emptyText="Henüz indirim tanımlanmamış"
        getRowId={(d) => d.id}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-6">
        <div className="admin-card p-4">
          <p className="text-sm text-muted truncate">Toplam İndirim</p>
          <p className="text-2xl font-bold text-heading truncate">{total}</p>
        </div>
        <div className="admin-card p-4">
          <p className="text-sm text-muted truncate">Aktif</p>
          <p className="text-2xl font-bold text-success-700 truncate">
            {rows.filter((d) => d.isCurrentlyValid).length}
          </p>
        </div>
        <div className="admin-card p-4">
          <p className="text-sm text-muted truncate">Kupon Kodları</p>
          <p className="text-2xl font-bold text-info-700 truncate">
            {rows.filter((d) => d.code).length}
          </p>
        </div>
        <div className="admin-card p-4">
          <p className="text-sm text-muted truncate">Otomatik Kampanyalar</p>
          <p className="text-2xl font-bold text-primary-700 truncate">
            {rows.filter((d) => !d.code).length}
          </p>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-heading/70 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-elevated rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-border">
            <div className="px-6 pb-6 pt-5 border-b border-border">
              <h2 className="text-xl font-bold text-heading leading-tight">
                {editingDiscount ? "İndirimi Düzenle" : "Yeni İndirim Oluştur"}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-heading mb-1">
                    İndirim Adı *
                  </label>
                  <Input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, name: e.target.value }))
                    }
                    placeholder="Örn: Yılbaşı İndirimi"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-sm font-medium text-heading mb-1">
                    Kupon Kodu (Opsiyonel)
                  </label>
                  <Input
                    type="text"
                    value={formData.code}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        code: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="Örn: YILBASI2026"
                    className="font-mono uppercase"
                  />
                  <p className="text-xs text-muted mt-1">
                    Kodsuz (otomatik) kampanyalar devre dışı; indirim için kupon
                    kodu girin.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-heading mb-1">
                  Açıklama
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="İndirim açıklaması..."
                  rows={2}
                />
              </div>

              {/* Type & Value */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-heading mb-1">
                    İndirim Türü *
                  </label>
                  <Select
                    value={formData.type}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        type: e.target.value as DiscountFormData["type"],
                      }))
                    }
                  >
                    <option value="percentage">Yüzde (%)</option>
                    <option value="fixed_amount">Sabit Tutar (TL)</option>
                    <option value="bogo">Alana Bedava (BOGO)</option>
                    <option value="bulk_quantity">Çoklu Alım (Adet İndirimi)</option>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-heading mb-1">
                    {formData.type === "bogo" ? "İndirim Oranı (2. Üründe)" : "Değer *"}
                  </label>
                  <Input
                    type="number"
                    required
                    min="0"
                    max={
                      formData.type === "percentage" || formData.type === "bogo"
                        ? 100
                        : 10000
                    }
                    step={
                      formData.type === "percentage" || formData.type === "bogo"
                        ? 1
                        : 0.01
                    }
                    value={formData.value}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        value: parseFloat(e.target.value) || 0,
                      }))
                    }
                    placeholder={formData.type === "bogo" ? "100 = Bedava" : ""}
                  />
                  {formData.type === "bogo" && (
                    <p className="text-xs text-muted mt-1">
                      100 = Tamamen bedava, 50 = %50 indirimli
                    </p>
                  )}
                </div>
              </div>

              {/* BOGO Fields */}
              {formData.type === "bogo" && (
                <div className="grid grid-cols-2 gap-4 bg-surface/60 p-4 rounded-lg border border-border">
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-primary mb-2">
                      BOGO Ayarları (Buy X Get Y)
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-heading mb-1">
                      Kaç Adet Alınca? (Buy)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.buyQuantity}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          buyQuantity: e.target.value,
                        }))
                      }
                      placeholder="Örn: 1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-heading mb-1">
                      Kaç Adet İndirimli? (Get)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.getQuantity}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          getQuantity: e.target.value,
                        }))
                      }
                      placeholder="Örn: 1"
                    />
                  </div>
                </div>
              )}

              {/* Bulk Quantity Fields */}
              {formData.type === "bulk_quantity" && (
                <div className="bg-surface/60 p-4 rounded-lg border border-border">
                  <p className="text-sm font-medium text-primary mb-2">
                    Çoklu Alım Ayarları
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-heading mb-1">
                      Min. Adet Sayısı
                    </label>
                    <Input
                      type="number"
                      min="2"
                      value={formData.minQuantity}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          minQuantity: e.target.value,
                        }))
                      }
                      placeholder="Örn: 3 adet alımda"
                    />
                  </div>
                </div>
              )}

              {/* Scope */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-heading mb-1">
                    Kapsam *
                  </label>
                  <Select
                    value={formData.scope}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        scope: e.target.value as DiscountFormData["scope"],
                      }))
                    }
                  >
                    <option value="global">Tüm Site</option>
                    <option value="category">Kategori</option>
                  </Select>
                </div>
                {formData.scope === "category" && (
                  <div>
                    <label className="block text-sm font-medium text-heading mb-1">
                      Kategori *
                    </label>
                    <Select
                      required={formData.scope === "category"}
                      value={formData.categoryId}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          categoryId: e.target.value,
                        }))
                      }
                    >
                      <option value="">Kategori seçin</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
              </div>

              {/* Limits */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-heading mb-1">
                    Min. Sepet Tutarı (TL)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.minCartValue}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        minCartValue: e.target.value,
                      }))
                    }
                    placeholder="Örn: 100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-heading mb-1">
                    Max. İndirim Tutarı (TL)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.maxDiscountAmount}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        maxDiscountAmount: e.target.value,
                      }))
                    }
                    placeholder="Örn: 500"
                  />
                </div>
              </div>

              {/* Usage Limits */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-heading mb-1">
                    Toplam Kullanım Limiti
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.usageLimitTotal}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        usageLimitTotal: e.target.value,
                      }))
                    }
                    placeholder="Sınırsız"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-heading mb-1">
                    Kullanıcı Başı Limit
                  </label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.usageLimitPerUser}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        usageLimitPerUser: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-heading mb-1">
                    Başlangıç Tarihi *
                  </label>
                  <Input
                    type="date"
                    required
                    value={formData.startDate}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        startDate: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-heading mb-1">
                    Bitiş Tarihi *
                  </label>
                  <Input
                    type="date"
                    required
                    value={formData.endDate}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        endDate: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center gap-6 flex-wrap">
                <Checkbox
                  checked={formData.isFlashSale}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      isFlashSale: e.target.checked,
                    }))
                  }
                  label="⚡ Flash Sale (Flaş İndirim)"
                />
                <Checkbox
                  checked={formData.isStackable}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      isStackable: e.target.checked,
                    }))
                  }
                  label="Diğer indirimlerle kombine edilebilir"
                />
                <span className="text-xs text-muted hidden sm:inline">
                  (diğer kupon/kampanyalarla; ürün indirimi her zaman geçerli)
                </span>
                <Checkbox
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      isActive: e.target.checked,
                    }))
                  }
                  label="Aktif"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setShowModal(false)}
                >
                  İptal
                </Button>
                <Button type="submit">
                  {editingDiscount ? "Güncelle" : "Oluştur"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-heading/70 flex items-center justify-center p-4 z-50">
          <div className="bg-surface-elevated rounded-xl shadow-xl max-w-md w-full px-6 pb-6 pt-5 border border-border">
            <h3 className="text-lg font-bold text-heading mb-2 leading-tight">
              İndirimi Sil
            </h3>
            <p className="text-muted mb-6">
              Bu indirimi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                onClick={() => setDeleteConfirm(null)}
              >
                İptal
              </Button>
              <Button
                variant="danger"
                onClick={() => handleDelete(deleteConfirm)}
              >
                Sil
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
