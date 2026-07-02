"use client";

import { useState, useEffect } from "react";
import { adminApi } from "@/lib/api";
import { Button, Select, Input } from "@tarodan/ui";
import {
  ChartBarIcon,
  CalculatorIcon,
  ReceiptPercentIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";
import toast from "react-hot-toast";
import { AdminTabs } from "@/components/AdminTabs";
import { useConfirm } from "@/components/ConfirmProvider";

// Tek "KDV" sekmesi: varsayılan oran + kategori istisnaları. Eski Bölgeler/
// Oranlar/Kurallar sekmeleri kaldırıldı — TR-only platformda değişen tek şey
// KDV yüzdesi ve stopaj yüzdesi; model (TaxRate/TaxRule) backend'de aynen durur.
type TabId = "kdv" | "withholding" | "report";

interface VatOverride {
  ruleId: string;
  categoryId: string;
  categoryName: string;
  rate: number;
}

interface Category {
  id: string;
  name: string;
}

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

export default function TaxSettingsPage() {
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<TabId>("kdv");
  const [loading, setLoading] = useState(true);

  // KDV: varsayılan oran + kategori istisnaları
  const [vatDefault, setVatDefault] = useState("20");
  const [vatSaving, setVatSaving] = useState(false);
  const [overrides, setOverrides] = useState<VatOverride[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ovCategoryId, setOvCategoryId] = useState("");
  const [ovRate, setOvRate] = useState("0");
  const [ovSaving, setOvSaving] = useState(false);

  // Vergi raporu (dönem bazlı, faturalardan)
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
    Promise.all([loadVatConfig(), loadCategories()]).finally(() =>
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

  const loadVatConfig = async () => {
    try {
      const res = await adminApi.getVatConfig();
      const cfg = res.data;
      if (cfg?.defaultRate != null) setVatDefault(String(cfg.defaultRate));
      setOverrides(cfg?.overrides || []);
    } catch (e) {
      if (process.env.NODE_ENV === "development") console.error(e);
      toast.error("KDV ayarları yüklenemedi");
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

  const saveDefaultVat = async (e: React.FormEvent) => {
    e.preventDefault();
    const rate = parseFloat(vatDefault);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      toast.error("Oran 0 ile 100 arasında olmalı");
      return;
    }
    setVatSaving(true);
    try {
      await adminApi.setDefaultVat(rate);
      toast.success("Varsayılan KDV oranı güncellendi");
      loadVatConfig();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Kaydetme başarısız");
    } finally {
      setVatSaving(false);
    }
  };

  const addOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    const rate = parseFloat(ovRate);
    if (!ovCategoryId) {
      toast.error("Kategori seçin");
      return;
    }
    if (Number.isNaN(rate) || rate < 0 || rate > 100) {
      toast.error("Oran 0 ile 100 arasında olmalı");
      return;
    }
    setOvSaving(true);
    try {
      await adminApi.setVatOverride(ovCategoryId, rate);
      toast.success("Kategori istisnası kaydedildi");
      setOvCategoryId("");
      setOvRate("0");
      loadVatConfig();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Kaydetme başarısız");
    } finally {
      setOvSaving(false);
    }
  };

  const deleteOverride = async (o: VatOverride) => {
    if (
      !(await confirm({
        title: `"${o.categoryName}" KDV istisnası silinsin mi?`,
        description: "Bu kategori tekrar varsayılan KDV oranına döner.",
        confirmLabel: "Sil",
        destructive: true,
      }))
    )
      return;
    try {
      await adminApi.deleteVatOverride(o.ruleId);
      toast.success("Silindi");
      loadVatConfig();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Silme başarısız");
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

  const tabs = [
    { key: "kdv", label: "KDV", icon: CalculatorIcon },
    { key: "withholding", label: "Stopaj", icon: ReceiptPercentIcon },
    { key: "report", label: "Vergi Raporu", icon: ChartBarIcon },
  ];

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Vergi Ayarları</h1>
          <p className="text-muted mt-1">
            KDV oranı, stopaj ve dönem raporu
          </p>
        </div>

        <AdminTabs
          tabs={tabs}
          value={activeTab}
          onChange={(k) => setActiveTab(k as TabId)}
        />

        {activeTab === "kdv" && !loading && (
          <div className="space-y-6">
            <div className="admin-card p-5">
              <h2 className="text-lg font-semibold text-heading">
                Varsayılan KDV Oranı
              </h2>
              <p className="text-sm text-muted mt-1">
                Tarodan&apos;ın kestiği komisyon/hizmet bedeli e-belgeleri ve
                kurumsal satıcı siparişlerindeki KDV bu oranla hesaplanır.
                Bireysel satıcı satışlarında KDV uygulanmaz.
              </p>
              <form
                onSubmit={saveDefaultVat}
                className="mt-4 flex flex-wrap items-end gap-3"
              >
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    KDV Oranı (%)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={vatDefault}
                    onChange={(e) => setVatDefault(e.target.value)}
                    className="w-32"
                  />
                </div>
                <Button type="submit" disabled={vatSaving}>
                  {vatSaving ? "Kaydediliyor…" : "Kaydet"}
                </Button>
                <p className="text-xs text-muted">
                  Yeni oran yalnızca bundan sonra kesilen belgelerde ve yeni
                  siparişlerde geçerlidir.
                </p>
              </form>
            </div>

            <div className="admin-card overflow-hidden">
              <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-heading">
                  Kategori Bazlı İstisnalar
                </h2>
                <p className="text-sm text-muted mt-1">
                  Belirli kategorilerde farklı KDV oranı gerekiyorsa (örn.
                  kitap %0) buradan tanımlayın. Tanımsız kategoriler varsayılan
                  oranı kullanır.
                </p>
              </div>
              <form
                onSubmit={addOverride}
                className="p-4 flex flex-wrap items-end gap-3 border-b border-border"
              >
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    Kategori
                  </label>
                  <Select
                    value={ovCategoryId}
                    onChange={(e) => setOvCategoryId(e.target.value)}
                    className="w-auto min-w-48"
                  >
                    <option value="">Seçin</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">
                    KDV Oranı (%)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={ovRate}
                    onChange={(e) => setOvRate(e.target.value)}
                    className="w-32"
                  />
                </div>
                <Button type="submit" disabled={ovSaving}>
                  {ovSaving ? "Kaydediliyor…" : "Ekle / Güncelle"}
                </Button>
              </form>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-surface-alt">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        Kategori
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                        KDV %
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                        İşlem
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {overrides.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-6 py-8 text-center text-muted"
                        >
                          Kategori istisnası yok — tüm kategoriler varsayılan
                          oranı kullanıyor.
                        </td>
                      </tr>
                    ) : (
                      overrides.map((o) => (
                        <tr key={o.ruleId} className="hover:bg-surface/50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-heading">
                            {o.categoryName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                            %{o.rate}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                            <Button
                              variant="secondary"
                              onClick={() => deleteOverride(o)}
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
      </div>
    </>
  );
}
