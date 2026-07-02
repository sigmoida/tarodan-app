"use client";

import { useState, useEffect } from "react";
import { adminApi } from "@/lib/api";
import { Button, Select, Checkbox, Input, Modal } from "@tarodan/ui";
import {
  PlusIcon,
  ChartBarIcon,
  CalculatorIcon,
  DocumentTextIcon,
  ReceiptPercentIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { AdminTabs } from "@/components/AdminTabs";
import { useConfirm } from "@/components/ConfirmProvider";

// TR-only platform: "Vergi Bölgeleri" sekmesi kaldırıldı — API, oran/kural
// oluştururken varsayılan TR bölgesini otomatik çözer/yaratır.
type TabId = "rates" | "rules" | "report" | "withholding";

interface WithholdingReport {
  period: string;
  summary: {
    totalWithholding: number;
    sellerCount: number;
    transferCount: number;
    pendingWithholding: number;
    pendingTransferCount: number;
  };
  rows: Array<{
    sellerId: string;
    sellerName: string;
    taxId: string | null;
    email: string | null;
    transferCount: number;
    grossAmount: number;
    withholdingTax: number;
  }>;
}

interface TaxRate {
  id: string;
  taxRegionId: string;
  taxRegionName: string;
  countryCode: string;
  name: string;
  rate: number;
  isDefault: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TaxRule {
  id: string;
  taxRegionId: string;
  taxRegionName: string;
  taxRateId: string;
  taxRateName: string;
  taxRateValue: number;
  scope: string;
  categoryId: string | null;
  categoryName: string | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Category {
  id: string;
  name: string;
}

// "product" kapsamı bilinçli olarak yok: TaxRule'da ürün alanı yok ve
// TaxService ürün bazlı çözümleme yapmıyor — seçilebilir olması ölü kural üretiyordu.
const SCOPE_LABELS: Record<string, string> = {
  default_rate: "Varsayılan oran",
  category: "Kategori",
};

export default function TaxSettingsPage() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<TabId>("rates");
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<{
    summary: {
      fromDate: string;
      toDate: string;
      totalTaxCollected: number;
      totalRevenue: number;
      invoiceCount: number;
    };
    breakdown: Array<{
      period: string;
      taxCollected: number;
      revenue: number;
      count: number;
    }>;
  } | null>(null);

  const [showRateModal, setShowRateModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
  const [editingRule, setEditingRule] = useState<TaxRule | null>(null);

  const [rateForm, setRateForm] = useState({
    name: "",
    rate: "20",
    isDefault: false,
    effectiveFrom: "",
    effectiveTo: "",
    sortOrder: 0,
    isActive: true,
  });
  const [ruleForm, setRuleForm] = useState({
    taxRateId: "",
    scope: "default_rate" as string,
    categoryId: "",
    priority: 0,
    isActive: true,
  });

  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [reportTo, setReportTo] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [reportGroupBy, setReportGroupBy] = useState<"day" | "month" | "year">(
    "month",
  );

  // Stopaj (e-ticaret tevkifatı, GVK 94/19)
  const [whRate, setWhRate] = useState("1");
  const [whSaving, setWhSaving] = useState(false);
  const [whReport, setWhReport] = useState<WithholdingReport | null>(null);
  const [whYear, setWhYear] = useState(() => new Date().getFullYear());
  const [whMonth, setWhMonth] = useState(() => new Date().getMonth() + 1);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadRates(), loadRules(), loadCategories()]).finally(() =>
      setLoading(false),
    );
  }, []);

  useEffect(() => {
    if (activeTab === "report") loadReport();
  }, [activeTab, reportFrom, reportTo, reportGroupBy]);

  useEffect(() => {
    if (activeTab !== "withholding") return;
    loadWithholdingRate();
    loadWithholdingReport();
  }, [activeTab, whYear, whMonth]);

  const loadRates = async () => {
    try {
      const res = await adminApi.getTaxRates();
      setRates(res.data?.data || []);
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
      toast.error("Vergi oranları yüklenemedi");
    }
  };

  const loadRules = async () => {
    try {
      const res = await adminApi.getTaxRules();
      setRules(res.data?.data || []);
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
      toast.error("Vergi kuralları yüklenemedi");
    }
  };

  const loadCategories = async () => {
    try {
      const res = await adminApi.getCategories();
      const list = res.data?.data || res.data || [];
      setCategories(Array.isArray(list) ? list : []);
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
    }
  };

  const loadReport = async () => {
    try {
      const res = await adminApi.getTaxReport({
        fromDate: reportFrom,
        toDate: reportTo,
        groupBy: reportGroupBy,
      });
      setReport(res.data);
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
      toast.error("Vergi raporu yüklenemedi");
      setReport(null);
    }
  };

  const loadWithholdingRate = async () => {
    try {
      const res = await adminApi.getWithholdingRate();
      const rate = res.data?.rate;
      if (rate != null) setWhRate(String(rate));
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
      toast.error("Stopaj oranı yüklenemedi");
    }
  };

  const loadWithholdingReport = async () => {
    try {
      const res = await adminApi.getWithholdingReport({
        year: whYear,
        month: whMonth,
      });
      setWhReport(res.data ?? null);
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
      toast.error("Stopaj raporu yüklenemedi");
      setWhReport(null);
    }
  };

  const saveWithholdingRate = async (e: React.FormEvent) => {
    e.preventDefault();
    const rate = parseFloat(whRate);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      toast.error("Oran 0 ile 100 arasında olmalı");
      return;
    }
    setWhSaving(true);
    try {
      await adminApi.setWithholdingRate(rate);
      toast.success("Stopaj oranı güncellendi");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Kaydetme başarısız");
    } finally {
      setWhSaving(false);
    }
  };

  const exportWithholdingCsv = () => {
    if (!whReport) return;
    const header = "Satıcı;VKN/TCKN;E-posta;Transfer Adedi;Brüt Tutar (TL);Kesilen Stopaj (TL)";
    const lines = whReport.rows.map((r) =>
      [
        `"${(r.sellerName || "").replace(/"/g, '""')}"`,
        r.taxId ?? "",
        r.email ?? "",
        r.transferCount,
        r.grossAmount.toFixed(2).replace(".", ","),
        r.withholdingTax.toFixed(2).replace(".", ","),
      ].join(";"),
    );
    const total = `"TOPLAM";;;${whReport.summary.transferCount};;${whReport.summary.totalWithholding.toFixed(2).replace(".", ",")}`;
    // Excel'in Türkçe karakterleri doğru açması için UTF-8 BOM
    const csv = "\uFEFF" + [header, ...lines, total].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stopaj-muhtasar-${whReport.period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openCreateRate = () => {
    setEditingRate(null);
    setRateForm({
      name: "KDV Standart",
      rate: "20",
      isDefault: true,
      effectiveFrom: "",
      effectiveTo: "",
      sortOrder: 0,
      isActive: true,
    });
    setShowRateModal(true);
  };

  const openEditRate = (r: TaxRate) => {
    setEditingRate(r);
    setRateForm({
      name: r.name,
      rate: String(r.rate),
      isDefault: r.isDefault,
      effectiveFrom: r.effectiveFrom
        ? r.effectiveFrom.toString().slice(0, 10)
        : "",
      effectiveTo: r.effectiveTo ? r.effectiveTo.toString().slice(0, 10) : "",
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    });
    setShowRateModal(true);
  };

  const saveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        // taxRegionId gönderilmez — API varsayılan TR bölgesini çözer/yaratır.
        name: rateForm.name.trim(),
        rate: parseFloat(rateForm.rate) || 0,
        isDefault: rateForm.isDefault,
        effectiveFrom: rateForm.effectiveFrom || undefined,
        effectiveTo: rateForm.effectiveTo || undefined,
        sortOrder: rateForm.sortOrder,
        isActive: rateForm.isActive,
      };
      if (editingRate) {
        await adminApi.updateTaxRate(editingRate.id, payload);
        toast.success("Vergi oranı güncellendi");
      } else {
        await adminApi.createTaxRate(payload);
        toast.success("Vergi oranı oluşturuldu");
      }
      setShowRateModal(false);
      loadRates();
      loadRules();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Kaydetme başarısız");
    }
  };

  const openCreateRule = () => {
    setEditingRule(null);
    setRuleForm({
      taxRateId: rates[0]?.id || "",
      scope: "default_rate",
      categoryId: "",
      priority: 0,
      isActive: true,
    });
    setShowRuleModal(true);
  };

  const openEditRule = (r: TaxRule) => {
    setEditingRule(r);
    setRuleForm({
      taxRateId: r.taxRateId,
      scope: r.scope,
      categoryId: r.categoryId || "",
      priority: r.priority,
      isActive: r.isActive,
    });
    setShowRuleModal(true);
  };

  const saveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        // taxRegionId gönderilmez — API kuralı oranın bölgesine bağlar.
        taxRateId: ruleForm.taxRateId,
        scope: ruleForm.scope,
        categoryId:
          ruleForm.scope === "category"
            ? ruleForm.categoryId || undefined
            : undefined,
        priority: ruleForm.priority,
        isActive: ruleForm.isActive,
      };
      if (editingRule) {
        await adminApi.updateTaxRule(editingRule.id, payload);
        toast.success("Vergi kuralı güncellendi");
      } else {
        await adminApi.createTaxRule(payload);
        toast.success("Vergi kuralı oluşturuldu");
      }
      setShowRuleModal(false);
      loadRules();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Kaydetme başarısız");
    }
  };

  const handleDelete = async (type: string, id: string) => {
    const labels: Record<string, string> = {
      rate: "Vergi Oranı",
      rule: "Vergi Kuralı",
    };
    if (
      !(await confirm({
        title: `${labels[type] ?? "Kayıt"} silinsin mi?`,
        description: "Bu işlem geri alınamaz.",
        confirmLabel: "Sil",
        destructive: true,
      }))
    )
      return;
    try {
      if (type === "rate") await adminApi.deleteTaxRate(id);
      else if (type === "rule") await adminApi.deleteTaxRule(id);
      toast.success("Silindi");
      loadRates();
      loadRules();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Silme başarısız");
    }
  };

  const tabs = [
    { key: "rates", label: "Vergi Oranları", icon: CalculatorIcon },
    { key: "rules", label: "Vergi Kuralları", icon: DocumentTextIcon },
    { key: "report", label: "Vergi Raporu", icon: ChartBarIcon },
    { key: "withholding", label: "Stopaj", icon: ReceiptPercentIcon },
  ];

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Vergi Ayarları</h1>
          <p className="text-muted mt-1">
            KDV oranları, kurallar, stopaj ve raporlama
          </p>
        </div>

        <AdminTabs
          tabs={tabs}
          value={activeTab}
          onChange={(k) => setActiveTab(k as TabId)}
        />


        {activeTab === "rates" && (
          <div className="admin-card overflow-hidden">
            <div className="flex justify-between items-center gap-3 p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-heading truncate min-w-0">
                Vergi Oranları
              </h2>
              <Button
                type="button"
                onClick={openCreateRate}
                className="flex gap-2 shrink-0"
              >
                <PlusIcon className="h-5 w-5 shrink-0" />
                Yeni Oran
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-alt">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Oran Adı
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Oran %
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Varsayılan
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Geçerlilik
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                      İşlem
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rates.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-muted"
                      >
                        Henüz vergi oranı yok. &quot;Yeni Oran&quot; ile
                        ekleyin.
                      </td>
                    </tr>
                  ) : (
                    rates.map((r) => (
                      <tr key={r.id} className="hover:bg-surface/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-heading">
                          {r.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                          %{r.rate}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                          {r.isDefault ? "Evet" : "Hayır"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                          {r.effectiveFrom || r.effectiveTo
                            ? `${r.effectiveFrom ? new Date(r.effectiveFrom).toLocaleDateString("tr-TR") : "–"} / ${r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString("tr-TR") : "–"}`
                            : "–"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <Button
                            variant="secondary"
                            onClick={() => openEditRate(r)}
                            className="text-primary-600 hover:text-primary-400 mr-3"
                          >
                            Düzenle
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => handleDelete("rate", r.id)}
                            className="text-danger-600 hover:text-danger-300"
                          >
                            Sil
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "rules" && (
          <div className="admin-card overflow-hidden">
            <div className="flex justify-between items-center gap-3 p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-heading truncate min-w-0">
                Vergi Kuralları
              </h2>
              <Button
                type="button"
                onClick={openCreateRule}
                className="flex gap-2 shrink-0"
                disabled={rates.length === 0}
              >
                <PlusIcon className="h-5 w-5 shrink-0" />
                Yeni Kural
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-alt">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Oran
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Kapsam
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Kategori
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                      Öncelik
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                      İşlem
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rules.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-8 text-center text-muted"
                      >
                        Henüz vergi kuralı yok. Önce oran ekleyin, sonra
                        &quot;Yeni Kural&quot; ile ekleyin.
                      </td>
                    </tr>
                  ) : (
                    rules.map((r) => (
                      <tr key={r.id} className="hover:bg-surface/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                          {r.taxRateName} (%{r.taxRateValue})
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                          {SCOPE_LABELS[r.scope] || r.scope}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                          {r.categoryName || "–"}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                          {r.priority}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <Button
                            variant="secondary"
                            onClick={() => openEditRule(r)}
                            className="text-primary-600 hover:text-primary-400 mr-3"
                          >
                            Düzenle
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => handleDelete("rule", r.id)}
                            className="text-danger-600 hover:text-danger-300"
                          >
                            Sil
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === "report" && (
          <div className="space-y-6">
            <div className="admin-card p-4 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Başlangıç
                </label>
                <Input
                  type="date"
                  value={reportFrom}
                  onChange={(e) => setReportFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Bitiş
                </label>
                <Input
                  type="date"
                  value={reportTo}
                  onChange={(e) => setReportTo(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Grupla
                </label>
                <Select
                  value={reportGroupBy}
                  onChange={(e) =>
                    setReportGroupBy(e.target.value as "day" | "month" | "year")
                  }
                  className="w-auto"
                >
                  <option value="day">Günlük</option>
                  <option value="month">Aylık</option>
                  <option value="year">Yıllık</option>
                </Select>
              </div>
              <Button type="button" onClick={loadReport}>
                Raporu Yükle
              </Button>
            </div>

            {report && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="admin-card p-5">
                    <p className="text-sm text-muted">
                      Toplam Tahsil Edilen Vergi
                    </p>
                    <p className="text-2xl font-bold text-heading mt-1">
                      ₺
                      {report.summary.totalTaxCollected.toLocaleString(
                        "tr-TR",
                        { minimumFractionDigits: 2 },
                      )}
                    </p>
                  </div>
                  <div className="admin-card p-5">
                    <p className="text-sm text-muted">Toplam Ciro</p>
                    <p className="text-2xl font-bold text-heading mt-1">
                      ₺
                      {report.summary.totalRevenue.toLocaleString("tr-TR", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                  <div className="admin-card p-5">
                    <p className="text-sm text-muted">Fatura Sayısı</p>
                    <p className="text-2xl font-bold text-heading mt-1">
                      {report.summary.invoiceCount}
                    </p>
                  </div>
                </div>
                <div className="admin-card overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-heading">
                      Dönem Bazlı Vergi
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-surface-alt">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                            Dönem
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                            Vergi (₺)
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                            Ciro (₺)
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                            Adet
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {report.breakdown.length === 0 ? (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-6 py-8 text-center text-muted"
                            >
                              Bu dönemde fatura yok.
                            </td>
                          </tr>
                        ) : (
                          report.breakdown.map((row) => (
                            <tr
                              key={row.period}
                              className="hover:bg-surface/50"
                            >
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-heading">
                                {row.period}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted text-right">
                                {row.taxCollected.toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted text-right">
                                {row.revenue.toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted text-right">
                                {row.count}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "withholding" && (
          <div className="space-y-6">
            <div className="admin-card p-5">
              <h2 className="text-lg font-semibold text-heading">
                E-Ticaret Stopajı (Tevkifat)
              </h2>
              <p className="text-sm text-muted mt-1">
                GVK 94/19 kapsamında, vergi mükellefi (kurumsal onaylı) satıcılara
                yapılan ödemelerden KDV hariç ürün bedeli üzerinden kesilir ve
                muhtasar beyanname ile ödenir. Bireysel satıcılar kapsam dışıdır
                (330 Seri No&apos;lu GV Genel Tebliği).
              </p>
              <form
                onSubmit={saveWithholdingRate}
                className="mt-4 flex flex-wrap items-end gap-3"
              >
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Stopaj Oranı (%)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={whRate}
                    onChange={(e) => setWhRate(e.target.value)}
                    className="w-32"
                  />
                </div>
                <Button type="submit" disabled={whSaving}>
                  {whSaving ? "Kaydediliyor…" : "Kaydet"}
                </Button>
                <p className="text-xs text-muted">
                  Yeni oran yalnızca bundan sonra oluşturulan siparişlere uygulanır.
                </p>
              </form>
            </div>

            <div className="admin-card p-4 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Yıl
                </label>
                <Select
                  value={String(whYear)}
                  onChange={(e) => setWhYear(parseInt(e.target.value, 10))}
                  className="w-auto"
                >
                  {Array.from({ length: 4 }, (_, i) => {
                    const y = new Date().getFullYear() - i;
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Ay
                </label>
                <Select
                  value={String(whMonth)}
                  onChange={(e) => setWhMonth(parseInt(e.target.value, 10))}
                  className="w-auto"
                >
                  {[
                    "Ocak",
                    "Şubat",
                    "Mart",
                    "Nisan",
                    "Mayıs",
                    "Haziran",
                    "Temmuz",
                    "Ağustos",
                    "Eylül",
                    "Ekim",
                    "Kasım",
                    "Aralık",
                  ].map((name, i) => (
                    <option key={i + 1} value={i + 1}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="button" onClick={loadWithholdingReport}>
                Raporu Yükle
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={exportWithholdingCsv}
                disabled={!whReport || whReport.rows.length === 0}
                className="flex gap-2"
              >
                <ArrowDownTrayIcon className="h-5 w-5 shrink-0" />
                CSV İndir
              </Button>
            </div>

            {whReport && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="admin-card p-5">
                    <p className="text-sm text-muted">
                      Dönem Kesilen Stopaj
                    </p>
                    <p className="text-2xl font-bold text-heading mt-1">
                      ₺
                      {whReport.summary.totalWithholding.toLocaleString(
                        "tr-TR",
                        { minimumFractionDigits: 2 },
                      )}
                    </p>
                  </div>
                  <div className="admin-card p-5">
                    <p className="text-sm text-muted">Satıcı Sayısı</p>
                    <p className="text-2xl font-bold text-heading mt-1">
                      {whReport.summary.sellerCount}
                    </p>
                  </div>
                  <div className="admin-card p-5">
                    <p className="text-sm text-muted">Transfer Sayısı</p>
                    <p className="text-2xl font-bold text-heading mt-1">
                      {whReport.summary.transferCount}
                    </p>
                  </div>
                  <div className="admin-card p-5">
                    <p className="text-sm text-muted">
                      Bekleyen Stopaj (henüz ödenmemiş)
                    </p>
                    <p className="text-2xl font-bold text-heading mt-1">
                      ₺
                      {whReport.summary.pendingWithholding.toLocaleString(
                        "tr-TR",
                        { minimumFractionDigits: 2 },
                      )}
                    </p>
                  </div>
                </div>
                <div className="admin-card overflow-hidden">
                  <div className="p-4 border-b border-border">
                    <h2 className="text-lg font-semibold text-heading">
                      Satıcı Bazlı Stopaj — {whReport.period}
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-surface-alt">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                            Satıcı
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                            VKN / TCKN
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                            E-posta
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                            Transfer
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                            Brüt (₺)
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                            Stopaj (₺)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {whReport.rows.length === 0 ? (
                          <tr>
                            <td
                              colSpan={6}
                              className="px-6 py-8 text-center text-muted"
                            >
                              Bu dönemde stopaj kesilen ödeme yok. (Stopaj
                              yalnızca kurumsal satıcılara yapılan tamamlanmış
                              transferlerde kesilir.)
                            </td>
                          </tr>
                        ) : (
                          whReport.rows.map((row) => (
                            <tr
                              key={row.sellerId}
                              className="hover:bg-surface/50"
                            >
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-heading">
                                {row.sellerName}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                                {row.taxId || "–"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                                {row.email || "–"}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted text-right">
                                {row.transferCount}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-muted text-right">
                                {row.grossAmount.toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-heading text-right">
                                {row.withholdingTax.toLocaleString("tr-TR", {
                                  minimumFractionDigits: 2,
                                })}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}


        {/* Rate modal */}
        {showRateModal && (
          <Modal
            isOpen={showRateModal}
            onClose={() => setShowRateModal(false)}
            title={editingRate ? "Vergi Oranı Düzenle" : "Yeni Vergi Oranı"}
            maxWidth="max-w-md"
          >
            <form onSubmit={saveRate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    Oran Adı *
                  </label>
                  <Input
                    type="text"
                    value={rateForm.name}
                    onChange={(e) =>
                      setRateForm((f) => ({ ...f, name: e.target.value }))
                    }
                    placeholder="KDV Standart"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    Oran (%) *
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={rateForm.rate}
                    onChange={(e) =>
                      setRateForm((f) => ({ ...f, rate: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">
                      Geçerlilik Başlangıç
                    </label>
                    <Input
                      type="date"
                      value={rateForm.effectiveFrom}
                      onChange={(e) =>
                        setRateForm((f) => ({
                          ...f,
                          effectiveFrom: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">
                      Geçerlilik Bitiş
                    </label>
                    <Input
                      type="date"
                      value={rateForm.effectiveTo}
                      onChange={(e) =>
                        setRateForm((f) => ({
                          ...f,
                          effectiveTo: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Checkbox
                    id="rateDefault"
                    checked={rateForm.isDefault}
                    onChange={(e) =>
                      setRateForm((f) => ({
                        ...f,
                        isDefault: e.target.checked,
                      }))
                    }
                    label="Varsayılan oran"
                  />
                </div>
                <div>
                  <Checkbox
                    id="rateActive"
                    checked={rateForm.isActive}
                    onChange={(e) =>
                      setRateForm((f) => ({ ...f, isActive: e.target.checked }))
                    }
                    label="Aktif"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t border-border">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setShowRateModal(false)}
                  >
                    İptal
                  </Button>
                  <Button type="submit">Kaydet</Button>
                </div>
              </form>
          </Modal>
        )}

        {/* Rule modal */}
        {showRuleModal && (
          <Modal
            isOpen={showRuleModal}
            onClose={() => setShowRuleModal(false)}
            title={editingRule ? "Vergi Kuralı Düzenle" : "Yeni Vergi Kuralı"}
            maxWidth="max-w-md"
          >
            <form onSubmit={saveRule} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    Vergi Oranı *
                  </label>
                  <Select
                    value={ruleForm.taxRateId}
                    onChange={(e) =>
                      setRuleForm((f) => ({ ...f, taxRateId: e.target.value }))
                    }
                    required
                  >
                    {rates.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} (%{r.rate})
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    Kapsam *
                  </label>
                  <Select
                    value={ruleForm.scope}
                    onChange={(e) =>
                      setRuleForm((f) => ({ ...f, scope: e.target.value }))
                    }
                  >
                    {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                {ruleForm.scope === "category" && (
                  <div>
                    <label className="block text-sm font-medium text-muted mb-1">
                      Kategori *
                    </label>
                    <Select
                      value={ruleForm.categoryId}
                      onChange={(e) =>
                        setRuleForm((f) => ({
                          ...f,
                          categoryId: e.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">Seçin</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-muted mb-1">
                    Öncelik
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={ruleForm.priority}
                    onChange={(e) =>
                      setRuleForm((f) => ({
                        ...f,
                        priority: parseInt(e.target.value, 10) || 0,
                      }))
                    }
                  />
                </div>
                <div>
                  <Checkbox
                    id="ruleActive"
                    checked={ruleForm.isActive}
                    onChange={(e) =>
                      setRuleForm((f) => ({ ...f, isActive: e.target.checked }))
                    }
                    label="Aktif"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-4 border-t border-border">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setShowRuleModal(false)}
                  >
                    İptal
                  </Button>
                  <Button type="submit">Kaydet</Button>
                </div>
              </form>
          </Modal>
        )}

      </div>
    </>
  );
}
