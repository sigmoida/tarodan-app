"use client";

import { useState, useEffect } from "react";
import { adminApi } from "@/lib/api";
import {
  Button,
  Checkbox,
  Input,
  Select,
  Spinner,
  StatusBadge,
  Textarea,
} from "@tarodan/ui";
import type { StatusConfig } from "@tarodan/ui";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  TagIcon,
  CheckIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";

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

const SCOPE_LABELS: Record<string, string> = {
  global: "Tüm Site",
  category: "Kategori",
  product: "Ürün",
  seller: "Satıcı",
};

const TYPE_LABELS: Record<string, string> = {
  percentage: "Yüzde (%)",
  fixed_amount: "Sabit Tutar (TL)",
  bogo: "Alana Bedava (BOGO)",
  bulk_quantity: "Çoklu Alım",
};

export default function DiscountsPage() {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<Discount | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterScope, setFilterScope] = useState<string>("");
  const [filterActive, setFilterActive] = useState<string>("");

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

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  useEffect(() => {
    loadDiscounts();
    loadCategories();
  }, [pagination.page, searchQuery, filterScope, filterActive]);

  const loadDiscounts = async () => {
    setLoading(true);
    try {
      const response = await adminApi.get("/admin/discounts", {
        params: {
          page: pagination.page,
          limit: pagination.limit,
          search: searchQuery || undefined,
          scope: filterScope || undefined,
          isActive: filterActive === "" ? undefined : filterActive === "true",
        },
      });

      const data = response.data;
      setDiscounts(data.items || []);
      setPagination((prev) => ({
        ...prev,
        total: data.total || 0,
        totalPages: data.totalPages || 1,
      }));
    } catch (error) {
      console.error("Failed to load discounts:", error);
      toast.error("İndirimler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await adminApi.getCategories();
      setCategories(response.data.data || response.data || []);
    } catch (error) {
      console.error("Failed to load categories:", error);
    }
  };

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
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const data = {
        // Otomatik kodsuz indirim için code null gönderilmeli (boş string değil)
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
      loadDiscounts();
    } catch (error: any) {
      console.error("Failed to save discount:", error);
      toast.error(
        error.response?.data?.message || "İndirim kaydedilirken hata oluştu",
      );
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.delete(`/admin/discounts/${id}`);
      toast.success("İndirim silindi");
      setDeleteConfirm(null);
      loadDiscounts();
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
        discount.isActive
          ? "İndirim devre dışı bırakıldı"
          : "İndirim aktif edildi",
      );
      loadDiscounts();
    } catch (error) {
      console.error("Failed to toggle discount status:", error);
      toast.error("Durum güncellenirken hata oluştu");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
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

  return (
    <>
      <div className="p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
              <TagIcon className="w-7 h-7 text-primary" />
              İndirim Yönetimi
            </h1>
            <p className="text-muted mt-1">
              Kupon kodları ve otomatik kampanyaları yönetin
            </p>
          </div>
          <Button onClick={openCreateModal} className="flex gap-2">
            <PlusIcon className="w-5 h-5" />
            Yeni İndirim
          </Button>
        </div>

        {/* Filters */}
        <div className="admin-card p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted" />
              <Input
                type="text"
                placeholder="İsim veya kod ile ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="admin-input-with-icon-left"
              />
            </div>
            <div className="flex gap-3">
              <Select
                value={filterScope}
                onChange={(e) => setFilterScope(e.target.value)}
                className="w-auto"
              >
                <option value="">Tüm Kapsamlar</option>
                <option value="global">Tüm Site</option>
                <option value="category">Kategori</option>
                <option value="product">Ürün</option>
                <option value="seller">Satıcı</option>
              </Select>
              <Select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="w-auto"
              >
                <option value="">Tüm Durumlar</option>
                <option value="true">Aktif</option>
                <option value="false">Pasif</option>
              </Select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div className="admin-card p-4">
            <p className="text-sm text-muted">Toplam İndirim</p>
            <p className="text-2xl font-bold text-heading">
              {pagination.total}
            </p>
          </div>
          <div className="admin-card p-4">
            <p className="text-sm text-muted">Aktif</p>
            <p className="text-2xl font-bold text-success-700">
              {discounts.filter((d) => d.isCurrentlyValid).length}
            </p>
          </div>
          <div className="admin-card p-4">
            <p className="text-sm text-muted">Kupon Kodları</p>
            <p className="text-2xl font-bold text-info-700">
              {discounts.filter((d) => d.code).length}
            </p>
          </div>
          <div className="admin-card p-4">
            <p className="text-sm text-muted">Otomatik Kampanyalar</p>
            <p className="text-2xl font-bold text-primary-700">
              {discounts.filter((d) => !d.code).length}
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="admin-card p-0 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <Spinner
                size="lg"
                color="border-primary border-t-transparent"
                className="mx-auto"
              />
              <p className="mt-2 text-muted">Yükleniyor...</p>
            </div>
          ) : discounts.length === 0 ? (
            <div className="p-8 text-center">
              <TagIcon className="w-12 h-12 text-muted/50 mx-auto mb-3" />
              <p className="text-muted">Henüz indirim tanımlanmamış</p>
              <Button onClick={openCreateModal} className="mt-4">
                İlk İndirimi Oluştur
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>İndirim</th>
                    <th>Kod</th>
                    <th>Değer</th>
                    <th>Kapsam</th>
                    <th>Kullanım</th>
                    <th>Tarih</th>
                    <th>Durum</th>
                    <th className="text-right">İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {discounts.map((discount) => (
                    <tr key={discount.id}>
                      <td>
                        <div>
                          <p className="font-medium text-heading">
                            {discount.name}
                          </p>
                          {discount.description && (
                            <p className="text-xs text-muted truncate max-w-xs">
                              {discount.description}
                            </p>
                          )}
                        </div>
                      </td>
                      <td>
                        {discount.code ? (
                          <code className="px-2 py-1 bg-gray-100 rounded text-sm font-mono text-heading">
                            {discount.code}
                          </code>
                        ) : (
                          <span className="text-xs text-muted italic">
                            Otomatik
                          </span>
                        )}
                        {discount.isFlashSale && (
                          <span className="ml-2 px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-xs font-medium border border-primary-200">
                            ⚡ Flash
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="font-semibold text-primary">
                          {discount.type === "percentage" &&
                            `%${discount.value}`}
                          {discount.type === "fixed_amount" &&
                            `${discount.value} TL`}
                          {discount.type === "bogo" &&
                            `BOGO (${discount.buyQuantity} Ver ${discount.getQuantity} Al ${discount.value === 100 ? "Bedava" : `%${discount.value} İndirim`})`}
                          {discount.type === "bulk_quantity" &&
                            `${discount.minQuantity} adet alımda %${discount.value}`}
                        </span>
                      </td>
                      <td>
                        <span className="badge badge-info">
                          {SCOPE_LABELS[discount.scope]}
                        </span>
                        {discount.categoryName && (
                          <p className="text-xs text-muted mt-1">
                            {discount.categoryName}
                          </p>
                        )}
                      </td>
                      <td className="text-muted">
                        {discount.usedCount}
                        {discount.usageLimitTotal &&
                          ` / ${discount.usageLimitTotal}`}
                      </td>
                      <td>
                        <p className="text-xs text-muted">
                          {formatDate(discount.startDate)} -{" "}
                          {formatDate(discount.endDate)}
                        </p>
                      </td>
                      <td>
                        <StatusBadge
                          status={getDiscountStatus(discount)}
                          config={discountStatusConfig}
                        />
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="secondary"
                            onClick={() => toggleDiscountStatus(discount)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              discount.isActive
                                ? "text-muted hover:bg-gray-100"
                                : "text-success-700 hover:bg-success-50"
                            }`}
                            title={
                              discount.isActive
                                ? "Devre dışı bırak"
                                : "Aktif et"
                            }
                          >
                            {discount.isActive ? (
                              <XMarkIcon className="w-4 h-4" />
                            ) : (
                              <CheckIcon className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => openEditModal(discount)}
                            className="p-1.5 text-info-700 hover:bg-info-50 rounded-lg transition-colors"
                            title="Düzenle"
                          >
                            <PencilIcon className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => setDeleteConfirm(discount.id)}
                            className="p-1.5 text-danger-600 hover:bg-danger-50 rounded-lg transition-colors"
                            title="Sil"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <p className="text-sm text-muted">
                Toplam {pagination.total} kayıt
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                  disabled={pagination.page === 1}
                  className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 text-heading"
                >
                  Önceki
                </Button>
                <span className="px-3 py-1 text-muted">
                  {pagination.page} / {pagination.totalPages}
                </span>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                  disabled={pagination.page === pagination.totalPages}
                  className="px-3 py-1 border border-gray-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 text-heading"
                >
                  Sonraki
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-heading">
                  {editingDiscount
                    ? "İndirimi Düzenle"
                    : "Yeni İndirim Oluştur"}
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
                        setFormData((prev) => ({
                          ...prev,
                          name: e.target.value,
                        }))
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
                      Kodsuz (otomatik) kampanyalar devre dışı; indirim için
                      kupon kodu girin.
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
                          type: e.target.value as any,
                        }))
                      }
                    >
                      <option value="percentage">Yüzde (%)</option>
                      <option value="fixed_amount">Sabit Tutar (TL)</option>
                      <option value="bogo">Alana Bedava (BOGO)</option>
                      <option value="bulk_quantity">
                        Çoklu Alım (Adet İndirimi)
                      </option>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-heading mb-1">
                      {formData.type === "bogo"
                        ? "İndirim Oranı (2. Üründe)"
                        : "Değer *"}
                    </label>
                    <Input
                      type="number"
                      required
                      min="0"
                      max={
                        formData.type === "percentage" ||
                        formData.type === "bogo"
                          ? 100
                          : 10000
                      }
                      step={
                        formData.type === "percentage" ||
                        formData.type === "bogo"
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
                      placeholder={
                        formData.type === "bogo" ? "100 = Bedava" : ""
                      }
                    />
                    {formData.type === "bogo" && (
                      <p className="text-xs text-muted mt-1">
                        100 = Tamamen bedava, 50 = %50 indirimli
                      </p>
                    )}
                  </div>
                </div>

                {/* Type Specific Fields */}
                {formData.type === "bogo" && (
                  <div className="grid grid-cols-2 gap-4 bg-gray-50/60 p-4 rounded-lg border border-gray-200">
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

                {formData.type === "bulk_quantity" && (
                  <div className="bg-gray-50/60 p-4 rounded-lg border border-gray-200">
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
                          scope: e.target.value as any,
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
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
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
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200">
              <h3 className="text-lg font-bold text-heading mb-2">
                İndirimi Sil
              </h3>
              <p className="text-muted mb-6">
                Bu indirimi silmek istediğinizden emin misiniz? Bu işlem geri
                alınamaz.
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
      </div>
    </>
  );
}
