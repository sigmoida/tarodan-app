'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { Button } from '@tarodan/ui';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  ChartBarIcon,
  MapPinIcon,
  CalculatorIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

type TabId = 'regions' | 'rates' | 'rules' | 'report';

interface TaxRegion {
  id: string;
  name: string;
  countryCode: string;
  regionCode: string | null;
  isDefault: boolean;
  sortOrder: number;
  isActive: boolean;
  ratesCount: number;
  rulesCount: number;
  createdAt: string;
  updatedAt: string;
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

const SCOPE_LABELS: Record<string, string> = {
  default_rate: 'Varsayılan oran',
  category: 'Kategori',
  product: 'Ürün',
};

export default function TaxSettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('regions');
  const [regions, setRegions] = useState<TaxRegion[]>([]);
  const [rates, setRates] = useState<TaxRate[]>([]);
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<{
    summary: { fromDate: string; toDate: string; totalTaxCollected: number; totalRevenue: number; invoiceCount: number };
    breakdown: Array<{ period: string; taxCollected: number; revenue: number; count: number }>;
  } | null>(null);

  const [showRegionModal, setShowRegionModal] = useState(false);
  const [showRateModal, setShowRateModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRegion, setEditingRegion] = useState<TaxRegion | null>(null);
  const [editingRate, setEditingRate] = useState<TaxRate | null>(null);
  const [editingRule, setEditingRule] = useState<TaxRule | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: string; id: string } | null>(null);

  const [regionForm, setRegionForm] = useState({
    name: '',
    countryCode: 'TR',
    regionCode: '',
    isDefault: false,
    sortOrder: 0,
    isActive: true,
  });
  const [rateForm, setRateForm] = useState({
    taxRegionId: '',
    name: '',
    rate: '18',
    isDefault: false,
    effectiveFrom: '',
    effectiveTo: '',
    sortOrder: 0,
    isActive: true,
  });
  const [ruleForm, setRuleForm] = useState({
    taxRegionId: '',
    taxRateId: '',
    scope: 'default_rate' as string,
    categoryId: '',
    priority: 0,
    isActive: true,
  });

  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportGroupBy, setReportGroupBy] = useState<'day' | 'month' | 'year'>('month');

  useEffect(() => {
    loadRegions();
    loadRates();
    loadRules();
    loadCategories();
  }, []);

  useEffect(() => {
    if (activeTab === 'report') loadReport();
  }, [activeTab, reportFrom, reportTo, reportGroupBy]);

  const loadRegions = async () => {
    try {
      const res = await adminApi.getTaxRegions();
      setRegions(res.data?.data || []);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.error('Vergi bölgeleri yüklenemedi');
    }
  };

  const loadRates = async () => {
    try {
      const res = await adminApi.getTaxRates();
      setRates(res.data?.data || []);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.error('Vergi oranları yüklenemedi');
    }
  };

  const loadRules = async () => {
    try {
      const res = await adminApi.getTaxRules();
      setRules(res.data?.data || []);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.error('Vergi kuralları yüklenemedi');
    }
  };

  const loadCategories = async () => {
    try {
      const res = await adminApi.getCategories();
      const list = res.data?.data || res.data || [];
      setCategories(Array.isArray(list) ? list : []);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.error(e);
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
      if (process.env.NODE_ENV === 'development') console.error(e);
      toast.error('Vergi raporu yüklenemedi');
      setReport(null);
    }
  };

  useEffect(() => {
    setLoading(false);
  }, [regions, rates, rules]);

  const openCreateRegion = () => {
    setEditingRegion(null);
    setRegionForm({
      name: '',
      countryCode: 'TR',
      regionCode: '',
      isDefault: regions.length === 0,
      sortOrder: regions.length,
      isActive: true,
    });
    setShowRegionModal(true);
  };

  const openEditRegion = (r: TaxRegion) => {
    setEditingRegion(r);
    setRegionForm({
      name: r.name,
      countryCode: r.countryCode,
      regionCode: r.regionCode || '',
      isDefault: r.isDefault,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    });
    setShowRegionModal(true);
  };

  const saveRegion = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: regionForm.name.trim(),
        countryCode: regionForm.countryCode.trim().toUpperCase(),
        regionCode: regionForm.regionCode.trim() || undefined,
        isDefault: regionForm.isDefault,
        sortOrder: regionForm.sortOrder,
        isActive: regionForm.isActive,
      };
      if (editingRegion) {
        await adminApi.updateTaxRegion(editingRegion.id, payload);
        toast.success('Vergi bölgesi güncellendi');
      } else {
        await adminApi.createTaxRegion(payload);
        toast.success('Vergi bölgesi oluşturuldu');
      }
      setShowRegionModal(false);
      loadRegions();
      loadRates();
      loadRules();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Kaydetme başarısız');
    }
  };

  const openCreateRate = () => {
    setEditingRate(null);
    setRateForm({
      taxRegionId: regions[0]?.id || '',
      name: 'KDV Standart',
      rate: '18',
      isDefault: true,
      effectiveFrom: '',
      effectiveTo: '',
      sortOrder: 0,
      isActive: true,
    });
    setShowRateModal(true);
  };

  const openEditRate = (r: TaxRate) => {
    setEditingRate(r);
    setRateForm({
      taxRegionId: r.taxRegionId,
      name: r.name,
      rate: String(r.rate),
      isDefault: r.isDefault,
      effectiveFrom: r.effectiveFrom ? r.effectiveFrom.toString().slice(0, 10) : '',
      effectiveTo: r.effectiveTo ? r.effectiveTo.toString().slice(0, 10) : '',
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    });
    setShowRateModal(true);
  };

  const saveRate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        taxRegionId: rateForm.taxRegionId,
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
        toast.success('Vergi oranı güncellendi');
      } else {
        await adminApi.createTaxRate(payload);
        toast.success('Vergi oranı oluşturuldu');
      }
      setShowRateModal(false);
      loadRates();
      loadRules();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Kaydetme başarısız');
    }
  };

  const openCreateRule = () => {
    setEditingRule(null);
    setRuleForm({
      taxRegionId: regions[0]?.id || '',
      taxRateId: rates[0]?.id || '',
      scope: 'default_rate',
      categoryId: '',
      priority: 0,
      isActive: true,
    });
    setShowRuleModal(true);
  };

  const openEditRule = (r: TaxRule) => {
    setEditingRule(r);
    setRuleForm({
      taxRegionId: r.taxRegionId,
      taxRateId: r.taxRateId,
      scope: r.scope,
      categoryId: r.categoryId || '',
      priority: r.priority,
      isActive: r.isActive,
    });
    setShowRuleModal(true);
  };

  const saveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        taxRegionId: ruleForm.taxRegionId,
        taxRateId: ruleForm.taxRateId,
        scope: ruleForm.scope,
        categoryId: ruleForm.scope === 'category' ? ruleForm.categoryId || undefined : undefined,
        priority: ruleForm.priority,
        isActive: ruleForm.isActive,
      };
      if (editingRule) {
        await adminApi.updateTaxRule(editingRule.id, payload);
        toast.success('Vergi kuralı güncellendi');
      } else {
        await adminApi.createTaxRule(payload);
        toast.success('Vergi kuralı oluşturuldu');
      }
      setShowRuleModal(false);
      loadRules();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Kaydetme başarısız');
    }
  };

  const handleDelete = async (type: string, id: string) => {
    try {
      if (type === 'region') await adminApi.deleteTaxRegion(id);
      else if (type === 'rate') await adminApi.deleteTaxRate(id);
      else if (type === 'rule') await adminApi.deleteTaxRule(id);
      toast.success('Silindi');
      setDeleteConfirm(null);
      loadRegions();
      loadRates();
      loadRules();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Silme başarısız');
    }
  };

  const tabs = [
    { id: 'regions' as TabId, label: 'Vergi Bölgeleri', icon: MapPinIcon },
    { id: 'rates' as TabId, label: 'Vergi Oranları', icon: CalculatorIcon },
    { id: 'rules' as TabId, label: 'Vergi Kuralları', icon: DocumentTextIcon },
    { id: 'report' as TabId, label: 'Vergi Raporu', icon: ChartBarIcon },
  ];

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vergi Ayarları</h1>
          <p className="text-gray-500 mt-1">Bölge bazlı vergi oranları, kurallar ve raporlama</p>
        </div>

        <div className="border-b border-gray-200">
          <nav className="flex gap-6">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-600 hover:border-gray-600'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {activeTab === 'regions' && (
          <div className="admin-card overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Vergi Bölgeleri</h2>
              <button type="button" onClick={openCreateRegion} className="btn-primary flex items-center gap-2">
                <PlusIcon className="h-5 w-5" />
                Yeni Bölge
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bölge</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ülke / Bölge Kodu</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Varsayılan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Oran / Kural</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Durum</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {regions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        Henüz vergi bölgesi yok. &quot;Yeni Bölge&quot; ile ekleyin.
                      </td>
                    </tr>
                  ) : (
                    regions.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{r.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.countryCode}{r.regionCode ? ` / ${r.regionCode}` : ''}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.isDefault ? 'Evet' : 'Hayır'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.ratesCount} oran, {r.rulesCount} kural</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex px-2 py-1 text-xs rounded-full ${r.isActive ? 'bg-green-50 text-green-700' : 'bg-gray-700 text-gray-500'}`}>
                            {r.isActive ? 'Aktif' : 'Pasif'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <button onClick={() => openEditRegion(r)} className="text-primary-600 hover:text-primary-400 mr-3">Düzenle</button>
                          {r.ratesCount === 0 && (
                            <button
                              onClick={() => setDeleteConfirm({ type: 'region', id: r.id })}
                              className="text-red-600 hover:text-red-300"
                            >
                              Sil
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'rates' && (
          <div className="admin-card overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Vergi Oranları</h2>
              <button type="button" onClick={openCreateRate} className="btn-primary flex items-center gap-2" disabled={regions.length === 0}>
                <PlusIcon className="h-5 w-5" />
                Yeni Oran
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bölge</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Oran Adı</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Oran %</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Varsayılan</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Geçerlilik</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rates.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        Henüz vergi oranı yok. Önce bölge ekleyin, sonra &quot;Yeni Oran&quot; ile ekleyin.
                      </td>
                    </tr>
                  ) : (
                    rates.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{r.taxRegionName} ({r.countryCode})</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{r.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">%{r.rate}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.isDefault ? 'Evet' : 'Hayır'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {r.effectiveFrom || r.effectiveTo
                            ? `${r.effectiveFrom ? new Date(r.effectiveFrom).toLocaleDateString('tr-TR') : '–'} / ${r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString('tr-TR') : '–'}`
                            : '–'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <button onClick={() => openEditRate(r)} className="text-primary-600 hover:text-primary-400 mr-3">Düzenle</button>
                          <button onClick={() => setDeleteConfirm({ type: 'rate', id: r.id })} className="text-red-600 hover:text-red-300">Sil</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="admin-card overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Vergi Kuralları</h2>
              <button type="button" onClick={openCreateRule} className="btn-primary flex items-center gap-2" disabled={regions.length === 0 || rates.length === 0}>
                <PlusIcon className="h-5 w-5" />
                Yeni Kural
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bölge</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Oran</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kapsam</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kategori</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Öncelik</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">İşlem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rules.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        Henüz vergi kuralı yok. Önce bölge ve oran ekleyin, sonra &quot;Yeni Kural&quot; ile ekleyin.
                      </td>
                    </tr>
                  ) : (
                    rules.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50/50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{r.taxRegionName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.taxRateName} (%{r.taxRateValue})</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{SCOPE_LABELS[r.scope] || r.scope}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.categoryName || '–'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.priority}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <button onClick={() => openEditRule(r)} className="text-primary-600 hover:text-primary-400 mr-3">Düzenle</button>
                          <button onClick={() => setDeleteConfirm({ type: 'rule', id: r.id })} className="text-red-600 hover:text-red-300">Sil</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'report' && (
          <div className="space-y-6">
            <div className="admin-card p-4 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Başlangıç</label>
                <input
                  type="date"
                  value={reportFrom}
                  onChange={(e) => setReportFrom(e.target.value)}
                  className="input-dark rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Bitiş</label>
                <input
                  type="date"
                  value={reportTo}
                  onChange={(e) => setReportTo(e.target.value)}
                  className="input-dark rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Grupla</label>
                <select
                  value={reportGroupBy}
                  onChange={(e) => setReportGroupBy(e.target.value as 'day' | 'month' | 'year')}
                  className="input-dark rounded-lg px-3 py-2 text-sm"
                >
                  <option value="day">Günlük</option>
                  <option value="month">Aylık</option>
                  <option value="year">Yıllık</option>
                </select>
              </div>
              <button type="button" onClick={loadReport} className="btn-primary py-2 px-4">
                Raporu Yükle
              </button>
            </div>

            {report && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="admin-card p-5">
                    <p className="text-sm text-gray-500">Toplam Tahsil Edilen Vergi</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">₺{report.summary.totalTaxCollected.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="admin-card p-5">
                    <p className="text-sm text-gray-500">Toplam Ciro</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">₺{report.summary.totalRevenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="admin-card p-5">
                    <p className="text-sm text-gray-500">Fatura Sayısı</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{report.summary.invoiceCount}</p>
                  </div>
                </div>
                <div className="admin-card overflow-hidden">
                  <div className="p-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Dönem Bazlı Vergi</h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dönem</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Vergi (₺)</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ciro (₺)</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Adet</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {report.breakdown.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-6 py-8 text-center text-gray-500">Bu dönemde fatura yok.</td>
                          </tr>
                        ) : (
                          report.breakdown.map((row) => (
                            <tr key={row.period} className="hover:bg-gray-50/50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.period}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{row.taxCollected.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{row.revenue.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-right">{row.count}</td>
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

        {/* Region modal */}
        {showRegionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowRegionModal(false)}>
            <div className="bg-white rounded-xl shadow-xl border border-gray-300 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{editingRegion ? 'Vergi Bölgesi Düzenle' : 'Yeni Vergi Bölgesi'}</h3>
                <button type="button" onClick={() => setShowRegionModal(false)} className="text-gray-500 hover:text-gray-900">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={saveRegion} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Bölge Adı *</label>
                  <input
                    type="text"
                    value={regionForm.name}
                    onChange={(e) => setRegionForm((f) => ({ ...f, name: e.target.value }))}
                    className="input-dark w-full rounded-lg px-3 py-2"
                    placeholder="Örn: Türkiye"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Ülke Kodu *</label>
                    <input
                      type="text"
                      value={regionForm.countryCode}
                      onChange={(e) => setRegionForm((f) => ({ ...f, countryCode: e.target.value.toUpperCase() }))}
                      className="input-dark w-full rounded-lg px-3 py-2"
                      placeholder="TR"
                      maxLength={2}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Bölge Kodu (opsiyonel)</label>
                    <input
                      type="text"
                      value={regionForm.regionCode}
                      onChange={(e) => setRegionForm((f) => ({ ...f, regionCode: e.target.value }))}
                      className="input-dark w-full rounded-lg px-3 py-2"
                      placeholder="34"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="regionDefault"
                    checked={regionForm.isDefault}
                    onChange={(e) => setRegionForm((f) => ({ ...f, isDefault: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="regionDefault" className="text-sm text-gray-500">Varsayılan bölge</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="regionActive"
                    checked={regionForm.isActive}
                    onChange={(e) => setRegionForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="regionActive" className="text-sm text-gray-500">Aktif</label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowRegionModal(false)} className="btn-secondary">
                    İptal
                  </button>
                  <button type="submit" className="btn-primary">Kaydet</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Rate modal */}
        {showRateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowRateModal(false)}>
            <div className="bg-white rounded-xl shadow-xl border border-gray-300 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{editingRate ? 'Vergi Oranı Düzenle' : 'Yeni Vergi Oranı'}</h3>
                <button type="button" onClick={() => setShowRateModal(false)} className="text-gray-500 hover:text-gray-900">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={saveRate} className="p-4 space-y-4">
                {!editingRate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Vergi Bölgesi *</label>
                    <select
                      value={rateForm.taxRegionId}
                      onChange={(e) => setRateForm((f) => ({ ...f, taxRegionId: e.target.value }))}
                      className="input-dark w-full rounded-lg px-3 py-2"
                      required
                    >
                      {regions.map((r) => (
                        <option key={r.id} value={r.id}>{r.name} ({r.countryCode})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Oran Adı *</label>
                  <input
                    type="text"
                    value={rateForm.name}
                    onChange={(e) => setRateForm((f) => ({ ...f, name: e.target.value }))}
                    className="input-dark w-full rounded-lg px-3 py-2"
                    placeholder="KDV Standart"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Oran (%) *</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    value={rateForm.rate}
                    onChange={(e) => setRateForm((f) => ({ ...f, rate: e.target.value }))}
                    className="input-dark w-full rounded-lg px-3 py-2"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Geçerlilik Başlangıç</label>
                    <input
                      type="date"
                      value={rateForm.effectiveFrom}
                      onChange={(e) => setRateForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
                      className="input-dark w-full rounded-lg px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Geçerlilik Bitiş</label>
                    <input
                      type="date"
                      value={rateForm.effectiveTo}
                      onChange={(e) => setRateForm((f) => ({ ...f, effectiveTo: e.target.value }))}
                      className="input-dark w-full rounded-lg px-3 py-2"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="rateDefault"
                    checked={rateForm.isDefault}
                    onChange={(e) => setRateForm((f) => ({ ...f, isDefault: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="rateDefault" className="text-sm text-gray-500">Varsayılan oran (bu bölge için)</label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="rateActive"
                    checked={rateForm.isActive}
                    onChange={(e) => setRateForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="rateActive" className="text-sm text-gray-500">Aktif</label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowRateModal(false)} className="btn-secondary">İptal</button>
                  <button type="submit" className="btn-primary">Kaydet</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Rule modal */}
        {showRuleModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setShowRuleModal(false)}>
            <div className="bg-white rounded-xl shadow-xl border border-gray-300 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">{editingRule ? 'Vergi Kuralı Düzenle' : 'Yeni Vergi Kuralı'}</h3>
                <button type="button" onClick={() => setShowRuleModal(false)} className="text-gray-500 hover:text-gray-900">
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={saveRule} className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Vergi Bölgesi *</label>
                  <select
                    value={ruleForm.taxRegionId}
                    onChange={(e) => setRuleForm((f) => ({ ...f, taxRegionId: e.target.value }))}
                    className="input-dark w-full rounded-lg px-3 py-2"
                    required
                  >
                    {regions.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Vergi Oranı *</label>
                  <select
                    value={ruleForm.taxRateId}
                    onChange={(e) => setRuleForm((f) => ({ ...f, taxRateId: e.target.value }))}
                    className="input-dark w-full rounded-lg px-3 py-2"
                    required
                  >
                    {rates.filter((r) => r.taxRegionId === ruleForm.taxRegionId).map((r) => (
                      <option key={r.id} value={r.id}>{r.name} (%{r.rate})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Kapsam *</label>
                  <select
                    value={ruleForm.scope}
                    onChange={(e) => setRuleForm((f) => ({ ...f, scope: e.target.value }))}
                    className="input-dark w-full rounded-lg px-3 py-2"
                  >
                    {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                {ruleForm.scope === 'category' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Kategori *</label>
                    <select
                      value={ruleForm.categoryId}
                      onChange={(e) => setRuleForm((f) => ({ ...f, categoryId: e.target.value }))}
                      className="input-dark w-full rounded-lg px-3 py-2"
                      required
                    >
                      <option value="">Seçin</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Öncelik</label>
                  <input
                    type="number"
                    min={0}
                    value={ruleForm.priority}
                    onChange={(e) => setRuleForm((f) => ({ ...f, priority: parseInt(e.target.value, 10) || 0 }))}
                    className="input-dark w-full rounded-lg px-3 py-2"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="ruleActive"
                    checked={ruleForm.isActive}
                    onChange={(e) => setRuleForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="ruleActive" className="text-sm text-gray-500">Aktif</label>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setShowRuleModal(false)} className="btn-secondary">İptal</button>
                  <button type="submit" className="btn-primary">Kaydet</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete confirmation */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setDeleteConfirm(null)}>
            <div className="bg-white rounded-xl shadow-xl border border-gray-300 p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <p className="text-gray-900 font-medium">Bu kaydı silmek istediğinize emin misiniz?</p>
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" onClick={() => setDeleteConfirm(null)} className="btn-secondary">Vazgeç</button>
                <Button variant="danger" size="md" type="button" onClick={() => handleDelete(deleteConfirm.type, deleteConfirm.id)}>
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
