"use client";

import { useState, useEffect } from "react";
import { adminApi } from "@/lib/api";
import {
  Button,
  Spinner,
  Checkbox,
  RadioGroup,
  Select,
  Input,
} from "@tarodan/ui";
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";

interface Category {
  id: string;
  name: string;
}

interface CommissionRule {
  id: string;
  name: string;
  categoryId: string | null;
  categoryName: string | null;
  sellerType: "FREE" | "PREMIUM" | "BUSINESS" | "ALL" | null;
  appliesTo: "SELLER" | "BUYER" | "BOTH";
  sellerRate: number | null;
  buyerRate: number | null;
  sellerMin: number | null;
  sellerMax: number | null;
  buyerMin: number | null;
  buyerMax: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Legacy fields
  percentage?: number;
  type?: string;
  minAmount?: number | null;
}

interface RuleFormData {
  name: string;
  categoryId: string;
  sellerType: "FREE" | "PREMIUM" | "BUSINESS" | "ALL";
  appliesTo: "SELLER" | "BUYER" | "BOTH";
  sellerRate: string;
  buyerRate: string;
  sellerMin: string;
  sellerMax: string;
  buyerMin: string;
  buyerMax: string;
  priority: number;
  isActive: boolean;
}

const SELLER_TYPES = [
  { value: "FREE", label: "Ücretsiz" },
  { value: "PREMIUM", label: "Premium" },
  { value: "BUSINESS", label: "İşletme" },
  { value: "ALL", label: "Tümü" },
];

const APPLIES_TO_OPTIONS = [
  { value: "SELLER", label: "Satıcı" },
  { value: "BUYER", label: "Alıcı" },
  { value: "BOTH", label: "Her İkisi" },
];

export default function CommissionPage() {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [formData, setFormData] = useState<RuleFormData>({
    name: "",
    categoryId: "",
    sellerType: "ALL",
    appliesTo: "SELLER",
    sellerRate: "5",
    buyerRate: "0",
    sellerMin: "",
    sellerMax: "",
    buyerMin: "",
    buyerMax: "",
    priority: 0,
    isActive: true,
  });
  const [previewPrice, setPreviewPrice] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [revenue, setRevenue] = useState<{
    totalCommission: number;
    totalBuyerFee: number;
    totalSellerFee: number;
    byMonth: Array<{ period: string; commission: number; orderCount: number }>;
  } | null>(null);

  useEffect(() => {
    loadData();
    loadRevenue();
  }, []);

  const loadRevenue = async () => {
    try {
      const res = await adminApi.getCommissionRevenue();
      setRevenue(res.data);
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
    }
  };

  const loadData = async () => {
    try {
      const [rulesResponse, categoriesResponse] = await Promise.all([
        adminApi.getCommissionRules(),
        adminApi.getCategories(),
      ]);
      setRules(rulesResponse.data.data || rulesResponse.data || []);
      setCategories(
        categoriesResponse.data.data || categoriesResponse.data || [],
      );
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to load data:", error);
      toast.error("Veriler yüklenirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingRule(null);
    setFormData({
      name: "",
      categoryId: "",
      sellerType: "ALL",
      appliesTo: "SELLER",
      sellerRate: "5",
      buyerRate: "0",
      sellerMin: "",
      sellerMax: "",
      buyerMin: "",
      buyerMax: "",
      priority: 0,
      isActive: true,
    });
    setPreviewPrice("");
    setShowModal(true);
  };

  const openEditModal = (rule: CommissionRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      categoryId: rule.categoryId || "",
      sellerType: rule.sellerType || "ALL",
      appliesTo: rule.appliesTo || "SELLER",
      sellerRate: rule.sellerRate?.toString() || "0",
      buyerRate: rule.buyerRate?.toString() || "0",
      sellerMin: rule.sellerMin?.toString() || "",
      sellerMax: rule.sellerMax?.toString() || "",
      buyerMin: rule.buyerMin?.toString() || "",
      buyerMax: rule.buyerMax?.toString() || "",
      priority: (rule as any).priority || 0,
      isActive: rule.isActive,
    });
    setPreviewPrice("");
    setShowModal(true);
  };

  const calculatePreview = () => {
    if (!previewPrice) return null;
    const price = parseFloat(previewPrice);
    if (isNaN(price) || price <= 0) return null;

    const sellerRate = parseFloat(formData.sellerRate) || 0;
    const buyerRate = parseFloat(formData.buyerRate) || 0;

    let rawSeller = price * (sellerRate / 100);
    let rawBuyer = price * (buyerRate / 100);

    // Apply min/max
    if (formData.sellerMin) {
      rawSeller = Math.max(rawSeller, parseFloat(formData.sellerMin));
    }
    if (formData.sellerMax) {
      rawSeller = Math.min(rawSeller, parseFloat(formData.sellerMax));
    }
    if (formData.buyerMin) {
      rawBuyer = Math.max(rawBuyer, parseFloat(formData.buyerMin));
    }
    if (formData.buyerMax) {
      rawBuyer = Math.min(rawBuyer, parseFloat(formData.buyerMax));
    }

    // Apply appliesTo
    if (formData.appliesTo === "SELLER") rawBuyer = 0;
    if (formData.appliesTo === "BUYER") rawSeller = 0;

    return {
      sellerFee: Math.round(rawSeller * 100) / 100,
      buyerFee: Math.round(rawBuyer * 100) / 100,
      total: Math.round((rawSeller + rawBuyer) * 100) / 100,
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (formData.appliesTo === "SELLER" && !formData.sellerRate) {
      toast.error("Satıcı oranı gereklidir");
      return;
    }
    if (formData.appliesTo === "BUYER" && !formData.buyerRate) {
      toast.error("Alıcı oranı gereklidir");
      return;
    }
    if (
      formData.appliesTo === "BOTH" &&
      (!formData.sellerRate || !formData.buyerRate)
    ) {
      toast.error("Hem satıcı hem alıcı oranı gereklidir");
      return;
    }

    if (
      formData.sellerMin &&
      formData.sellerMax &&
      parseFloat(formData.sellerMin) > parseFloat(formData.sellerMax)
    ) {
      toast.error("Satıcı minimum değeri maksimum değerden büyük olamaz");
      return;
    }
    if (
      formData.buyerMin &&
      formData.buyerMax &&
      parseFloat(formData.buyerMin) > parseFloat(formData.buyerMax)
    ) {
      toast.error("Alıcı minimum değeri maksimum değerden büyük olamaz");
      return;
    }

    try {
      const data: any = {
        name: formData.name,
        categoryId: formData.categoryId || null,
        sellerType: formData.sellerType,
        appliesTo: formData.appliesTo,
        sellerRate: formData.sellerRate
          ? parseFloat(formData.sellerRate)
          : null,
        buyerRate: formData.buyerRate ? parseFloat(formData.buyerRate) : null,
        sellerMin: formData.sellerMin ? parseFloat(formData.sellerMin) : null,
        sellerMax: formData.sellerMax ? parseFloat(formData.sellerMax) : null,
        buyerMin: formData.buyerMin ? parseFloat(formData.buyerMin) : null,
        buyerMax: formData.buyerMax ? parseFloat(formData.buyerMax) : null,
        priority: formData.priority,
        isActive: formData.isActive,
      };

      if (editingRule) {
        await adminApi.updateCommissionRule(editingRule.id, data);
        toast.success("Komisyon kuralı güncellendi");
      } else {
        await adminApi.createCommissionRule(data);
        toast.success("Komisyon kuralı oluşturuldu");
      }

      setShowModal(false);
      loadData();
    } catch (error: any) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to save commission rule:", error);
      toast.error(
        error.response?.data?.message ||
          "Komisyon kuralı kaydedilirken hata oluştu",
      );
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await adminApi.deleteCommissionRule(id);
      toast.success("Komisyon kuralı silindi");
      setDeleteConfirm(null);
      loadData();
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to delete commission rule:", error);
      toast.error("Komisyon kuralı silinirken hata oluştu");
    }
  };

  const toggleRuleStatus = async (rule: CommissionRule) => {
    try {
      await adminApi.updateCommissionRule(rule.id, {
        isActive: !rule.isActive,
      });
      toast.success(
        `Kural ${rule.isActive ? "devre dışı bırakıldı" : "aktifleştirildi"}`,
      );
      loadData();
    } catch (error) {
      if (process.env.NODE_ENV === "development")
        console.error("Failed to toggle rule status:", error);
      toast.error("Kural durumu güncellenirken hata oluştu");
    }
  };

  const preview = calculatePreview();

  // Default rule = categoryId null, sellerType ALL, isActive true (used when no other rule matches)
  const hasDefaultRule = rules.some(
    (r) => !r.categoryId && r.sellerType === "ALL" && r.isActive,
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-heading truncate">
            Komisyon Yönetimi
          </h1>
          <p className="text-muted mt-1">
            Platform komisyon oranlarını yönetin
          </p>
        </div>
        <Button onClick={openCreateModal} className="flex gap-2 shrink-0">
          <PlusIcon className="h-5 w-5 shrink-0" />
          Yeni Kural Ekle
        </Button>
      </div>

      {/* Revenue Summary Cards */}
      {revenue && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="admin-card p-5">
            <p className="text-sm text-muted">Toplam Tahsil Edilen Komisyon</p>
            <p className="text-2xl font-bold text-heading mt-1">
              ₺{revenue.totalCommission.toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted mt-1">Tamamlanan siparişler</p>
          </div>
          <div className="admin-card p-5">
            <p className="text-sm text-muted">Alıcı Hizmet Bedeli</p>
            <p className="text-2xl font-bold text-heading mt-1">
              ₺{(revenue.totalBuyerFee ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div className="admin-card p-5">
            <p className="text-sm text-muted">Satıcı Komisyonu</p>
            <p className="text-2xl font-bold text-heading mt-1">
              ₺{(revenue.totalSellerFee ?? 0).toLocaleString("tr-TR", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-info-900/20 border border-info-700 rounded-lg p-4">
        <div className="flex gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-info-700 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h4 className="text-info-700 font-medium">Komisyon Hesaplama</h4>
            <p className="text-muted text-sm mt-1">
              Komisyon kuralları eşleşme sırasına göre değerlendirilir. Bir
              sipariş için ilk eşleşen kural uygulanır. Eşleşme sırası: Kategori
              + Satıcı Tipi &gt; Kategori + Tümü &gt; Satıcı Tipi &gt;
              Varsayılan (Tümü + Tümü) Aynı kombinasyon (kategori + satıcı tipi)
              için sadece bir kural oluşturulabilir.
            </p>
          </div>
        </div>
      </div>

      {/* No default rule warning (informational only; checkout/order flow is not blocked) */}
      {!hasDefaultRule && (
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-4">
          <div className="flex gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-warning-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h4 className="text-warning-800 font-medium">
                Varsayılan komisyon kuralı tanımlı değil
              </h4>
              <p className="text-warning-700 text-sm mt-1">
                Eşleşen kural olmayan siparişler 0 komisyon ile
                oluşturulacaktır. Checkout ve ödeme akışı etkilenmez. İsterseniz
                &quot;Kategori: Tümü&quot; ve &quot;Satıcı Tipi: Tümü&quot; ile
                bir varsayılan kural ekleyebilirsiniz.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Rules Table */}
      <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Kural Adı
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Kategori
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Satıcı Tipi
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Uygulanan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Satıcı Oranı
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Alıcı Oranı
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                  Durum
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                  İşlemler
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-12 text-center text-muted"
                  >
                    Henüz komisyon kuralı eklenmemiş
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-surface-alt/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-heading font-medium">
                        {rule.name}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-muted">
                        {rule.categoryName || "Tümü"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-muted">
                        {SELLER_TYPES.find((t) => t.value === rule.sellerType)
                          ?.label ||
                          rule.sellerType ||
                          "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-muted">
                        {APPLIES_TO_OPTIONS.find(
                          (t) => t.value === rule.appliesTo,
                        )?.label || rule.appliesTo}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-primary-400 font-semibold">
                        {rule.sellerRate !== null
                          ? `%${rule.sellerRate.toFixed(2)}`
                          : "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-primary-400 font-semibold">
                        {rule.buyerRate !== null
                          ? `%${rule.buyerRate.toFixed(2)}`
                          : "-"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Button
                        variant="secondary"
                        onClick={() => toggleRuleStatus(rule)}
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          rule.isActive
                            ? "bg-success-50 text-success-700 border border-success-700"
                            : "bg-surface/50 text-muted border border-border"
                        }`}
                      >
                        {rule.isActive ? "Aktif" : "Pasif"}
                      </Button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Button
                        variant="secondary"
                        onClick={() => openEditModal(rule)}
                        className="text-muted hover:text-heading p-2"
                        title="Düzenle"
                      >
                        <PencilIcon className="h-5 w-5" />
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setDeleteConfirm(rule.id)}
                        className="text-muted hover:text-danger-600 p-2"
                        title="Sil"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-surface-elevated rounded-lg w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-6 pb-6 pt-5 border-b border-border">
              <h2 className="text-lg font-semibold text-heading leading-tight">
                {editingRule ? "Kuralı Düzenle" : "Yeni Kural Ekle"}
              </h2>
              <Button
                variant="secondary"
                onClick={() => setShowModal(false)}
                className="text-muted hover:text-heading"
              >
                <XMarkIcon className="h-6 w-6" />
              </Button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-6 space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto"
            >
              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Kural Adı *
                </label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="bg-surface-alt px-4 text-heading"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    Kategori
                  </label>
                  <Select
                    value={formData.categoryId}
                    onChange={(e) =>
                      setFormData({ ...formData, categoryId: e.target.value })
                    }
                    className="bg-surface-alt"
                  >
                    <option value="">Tüm Kategoriler</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    Satıcı Tipi *
                  </label>
                  <Select
                    value={formData.sellerType}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sellerType: e.target.value as any,
                      })
                    }
                    className="bg-surface-alt"
                    required
                  >
                    {SELLER_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-muted mb-1">
                  Komisyon Uygulanan *
                </label>
                <RadioGroup
                  name="appliesTo"
                  value={formData.appliesTo}
                  onChange={(v) =>
                    setFormData({ ...formData, appliesTo: v as any })
                  }
                  options={APPLIES_TO_OPTIONS}
                  orientation="horizontal"
                />
              </div>

              {/* Seller Fields */}
              {(formData.appliesTo === "SELLER" ||
                formData.appliesTo === "BOTH") && (
                <div className="p-4 space-y-4">
                  <h3 className="text-sm font-medium text-muted">
                    Satıcı Komisyonu
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">
                        Satıcı Oranı (%) *
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={formData.sellerRate}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            sellerRate: e.target.value,
                          })
                        }
                        className="bg-surface-alt px-4 text-heading"
                        required={
                          formData.appliesTo === "SELLER" ||
                          formData.appliesTo === "BOTH"
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">
                        Satıcı Minimum (₺)
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.sellerMin}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            sellerMin: e.target.value,
                          })
                        }
                        className="bg-surface-alt px-4 text-heading"
                        placeholder="Opsiyonel"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">
                        Satıcı Maksimum (₺)
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.sellerMax}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            sellerMax: e.target.value,
                          })
                        }
                        className="bg-surface-alt px-4 text-heading"
                        placeholder="Opsiyonel"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Buyer Fields */}
              {(formData.appliesTo === "BUYER" ||
                formData.appliesTo === "BOTH") && (
                <div className="p-4 space-y-4">
                  <h3 className="text-sm font-medium text-muted">
                    Alıcı Komisyonu
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">
                      Alıcı Oranı (%) *
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.buyerRate}
                      onChange={(e) =>
                        setFormData({ ...formData, buyerRate: e.target.value })
                      }
                      className="bg-surface-alt px-4 text-heading"
                      required={
                        formData.appliesTo === "BUYER" ||
                        formData.appliesTo === "BOTH"
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">
                        Alıcı Minimum (₺)
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.buyerMin}
                        onChange={(e) =>
                          setFormData({ ...formData, buyerMin: e.target.value })
                        }
                        className="bg-surface-alt px-4 text-heading"
                        placeholder="Opsiyonel"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-muted mb-1">
                        Alıcı Maksimum (₺)
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.buyerMax}
                        onChange={(e) =>
                          setFormData({ ...formData, buyerMax: e.target.value })
                        }
                        className="bg-surface-alt px-4 text-heading"
                        placeholder="Opsiyonel"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Preview Calculator */}
              <div className="p-4 space-y-4">
                <h3 className="text-sm font-medium text-muted">
                  Önizleme Hesaplayıcı
                </h3>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    Örnek Ürün Fiyatı (₺)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={previewPrice}
                    onChange={(e) => setPreviewPrice(e.target.value)}
                    className="bg-surface-alt px-4 text-heading"
                    placeholder="1000"
                  />
                </div>
                {preview && (
                  <div className="bg-surface-alt rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Satıcı Komisyonu:</span>
                      <span className="text-heading font-medium">
                        ₺{preview.sellerFee.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Alıcı Komisyonu:</span>
                      <span className="text-heading font-medium">
                        ₺{preview.buyerFee.toFixed(2)}
                      </span>
                    </div>
                    <div className="border-t pt-2 justify-between">
                      <span className="text-muted font-medium">
                        Toplam Komisyon:
                      </span>
                      <span className="text-primary-400 font-bold">
                        ₺{preview.total.toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData({ ...formData, isActive: e.target.checked })
                  }
                />
                <label htmlFor="isActive" className="text-sm text-muted">
                  Kural aktif
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setShowModal(false)}
                >
                  İptal
                </Button>
                <Button type="submit">
                  {editingRule ? "Güncelle" : "Oluştur"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-heading/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-elevated rounded-lg w-full max-w-sm px-6 pb-6 pt-5">
            <div className="flex items-center gap-3 text-danger-600 mb-4">
              <ExclamationTriangleIcon className="h-6 w-6" />
              <h3 className="text-lg font-semibold leading-tight">Kuralı Sil</h3>
            </div>
            <p className="text-muted mb-6">
              Bu komisyon kuralını silmek istediğinizden emin misiniz? Bu işlem
              geri alınamaz.
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
                size="md"
                onClick={() => handleDelete(deleteConfirm)}
              >
                Sil
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
