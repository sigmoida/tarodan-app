'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Settings {
  commissionRate: number;
  freeListingLimit: number;
  tradeResponseHours: number;
  tradeShippingDays: number;
  tradeConfirmationDays: number;
  minProductPrice: number;
  maxProductPrice: number;
  requireProductApproval: boolean;
  requireMessageApproval: boolean;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    commissionRate: 5,
    freeListingLimit: 10,
    tradeResponseHours: 72,
    tradeShippingDays: 7,
    tradeConfirmationDays: 3,
    minProductPrice: 10,
    maxProductPrice: 100000,
    requireProductApproval: true,
    requireMessageApproval: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'trade'>('general');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settingsResponse = await adminApi.getSettings();
      const settingsData = settingsResponse.data.data || settingsResponse.data || [];
      const settingsObj: Record<string, any> = {};
      settingsData.forEach((s: any) => {
        settingsObj[s.key] = s.value;
      });
      setSettings(settingsObj);
    } catch (error) {
      console.error('Settings load error:', error);
      toast.error('Ayarlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await adminApi.updateSettings(settings);
      toast.success('Ayarlar kaydedildi');
    } catch (error) {
      toast.error('Ayarlar kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };


  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Ayarları</h1>
          <p className="text-gray-400 mt-1">Sistem yapılandırmasını yönetin</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-dark-700 pb-2">
          {[
            { id: 'general', label: 'Genel' },
            { id: 'trade', label: 'Takas' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-dark-700 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* General Settings */}
        {activeTab === 'general' && (
          <div className="admin-card">
            <h2 className="text-lg font-semibold text-white mb-4">Genel Ayarlar</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Ücretsiz İlan Limiti
                </label>
                <input
                  type="number"
                  value={settings.freeListingLimit}
                  onChange={(e) =>
                    setSettings({ ...settings, freeListingLimit: Number(e.target.value) })
                  }
                  className="admin-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Ücretsiz üyelerin aylık ilan limiti
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Minimum Ürün Fiyatı (₺)
                </label>
                <input
                  type="number"
                  value={settings.minProductPrice}
                  onChange={(e) =>
                    setSettings({ ...settings, minProductPrice: Number(e.target.value) })
                  }
                  className="admin-input"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Maksimum Ürün Fiyatı (₺)
                </label>
                <input
                  type="number"
                  value={settings.maxProductPrice}
                  onChange={(e) =>
                    setSettings({ ...settings, maxProductPrice: Number(e.target.value) })
                  }
                  className="admin-input"
                />
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="requireProductApproval"
                  checked={settings.requireProductApproval}
                  onChange={(e) =>
                    setSettings({ ...settings, requireProductApproval: e.target.checked })
                  }
                  className="w-5 h-5 rounded"
                />
                <label htmlFor="requireProductApproval" className="text-gray-300">
                  Ürün onayı gerekli
                </label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="requireMessageApproval"
                  checked={settings.requireMessageApproval}
                  onChange={(e) =>
                    setSettings({ ...settings, requireMessageApproval: e.target.checked })
                  }
                  className="w-5 h-5 rounded"
                />
                <label htmlFor="requireMessageApproval" className="text-gray-300">
                  Şüpheli mesajları onayla
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Trade Settings */}
        {activeTab === 'trade' && (
          <div className="admin-card">
            <h2 className="text-lg font-semibold text-white mb-4">Takas Ayarları</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Yanıt Süresi (Saat)
                </label>
                <input
                  type="number"
                  value={settings.tradeResponseHours}
                  onChange={(e) =>
                    setSettings({ ...settings, tradeResponseHours: Number(e.target.value) })
                  }
                  className="admin-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Takas teklifine yanıt süresi
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Kargo Süresi (Gün)
                </label>
                <input
                  type="number"
                  value={settings.tradeShippingDays}
                  onChange={(e) =>
                    setSettings({ ...settings, tradeShippingDays: Number(e.target.value) })
                  }
                  className="admin-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Kabul sonrası kargo gönderim süresi
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Onay Süresi (Gün)
                </label>
                <input
                  type="number"
                  value={settings.tradeConfirmationDays}
                  onChange={(e) =>
                    setSettings({ ...settings, tradeConfirmationDays: Number(e.target.value) })
                  }
                  className="admin-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Teslim sonrası onay süresi
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="btn-primary px-6"
          >
            {saving ? 'Kaydediliyor...' : 'Ayarları Kaydet'}
          </button>
        </div>
      </div>
    </AdminLayout>
  );
}
