'use client';

import { useState, useEffect } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi } from '@/lib/api';
import toast from 'react-hot-toast';

interface Settings {
  freeListingLimit: number;
  premiumListingLimit: number;
  businessListingLimit: number;
  tradeResponseHours: number;
  tradeShippingDays: number;
  tradeConfirmationDays: number;
  minProductPrice: number;
  maxProductPrice: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    freeListingLimit: 10,
    premiumListingLimit: -1, // -1 means unlimited
    businessListingLimit: -1, // -1 means unlimited
    tradeResponseHours: 72,
    tradeShippingDays: 7,
    tradeConfirmationDays: 3,
    minProductPrice: 10,
    maxProductPrice: 100000,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'listing' | 'trade'>('listing');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settingsResponse = await adminApi.getSettings();
      // API response format: { data: { data: [...] } } or { data: [...] }
      const settingsData = settingsResponse.data?.data || settingsResponse.data || [];
      const settingsObj: Record<string, any> = {};
      
      // Handle both array and object formats
      // Backend returns Prisma model with settingKey and settingValue fields
      if (Array.isArray(settingsData)) {
        settingsData.forEach((s: any) => {
          const key = s.settingKey || s.key;
          const value = s.settingValue || s.value;
          if (key) {
            settingsObj[key] = value;
          }
        });
      } else if (typeof settingsData === 'object') {
        Object.keys(settingsData).forEach((key) => {
          settingsObj[key] = settingsData[key];
        });
      }
      
      console.log('Loaded settings:', settingsObj); // Debug log
      
      // Map platform setting keys to local settings
      setSettings({
        freeListingLimit: settingsObj.free_listing_limit ? Number(settingsObj.free_listing_limit) : 10,
        premiumListingLimit: settingsObj.premium_listing_limit ? Number(settingsObj.premium_listing_limit) : -1,
        businessListingLimit: settingsObj.business_listing_limit ? Number(settingsObj.business_listing_limit) : -1,
        minProductPrice: settingsObj.min_product_price ? Number(settingsObj.min_product_price) : 10,
        maxProductPrice: settingsObj.max_product_price ? Number(settingsObj.max_product_price) : 100000,
        tradeResponseHours: settingsObj.trade_response_deadline_hours ? Number(settingsObj.trade_response_deadline_hours) : 72,
        tradeShippingDays: settingsObj.trade_shipping_deadline_days ? Number(settingsObj.trade_shipping_deadline_days) : 7,
        tradeConfirmationDays: settingsObj.trade_confirmation_deadline_days ? Number(settingsObj.trade_confirmation_deadline_days) : 3,
      });
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
      // Save each setting individually with correct keys
      const settingsToSave = [];
      
      if (activeTab === 'listing') {
        settingsToSave.push(
          adminApi.updateSetting('free_listing_limit', settings.freeListingLimit.toString()),
          adminApi.updateSetting('premium_listing_limit', settings.premiumListingLimit.toString()),
          adminApi.updateSetting('business_listing_limit', settings.businessListingLimit.toString()),
          adminApi.updateSetting('min_product_price', settings.minProductPrice.toString()),
          adminApi.updateSetting('max_product_price', settings.maxProductPrice.toString())
        );
      } else if (activeTab === 'trade') {
        settingsToSave.push(
          adminApi.updateSetting('trade_response_deadline_hours', settings.tradeResponseHours.toString()),
          adminApi.updateSetting('trade_shipping_deadline_days', settings.tradeShippingDays.toString()),
          adminApi.updateSetting('trade_confirmation_deadline_days', settings.tradeConfirmationDays.toString())
        );
      }
      
      await Promise.all(settingsToSave);
      toast.success('Ayarlar kaydedildi');
      // Reload settings after save to reflect changes
      await loadSettings();
    } catch (error) {
      console.error('Settings save error:', error);
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
            { id: 'listing', label: 'İlan' },
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

        {/* Listing Settings */}
        {activeTab === 'listing' && (
          <div className="admin-card">
            <h2 className="text-lg font-semibold text-white mb-4">İlan Ayarları</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Ücretsiz İlan Limiti
                </label>
                <input
                  type="number"
                  min="0"
                  value={settings.freeListingLimit}
                  onChange={(e) =>
                    setSettings({ ...settings, freeListingLimit: Number(e.target.value) })
                  }
                  className="admin-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Ücretsiz üyelerin ilan limiti
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Premium İlan Limiti
                </label>
                <input
                  type="number"
                  min="-1"
                  value={settings.premiumListingLimit}
                  onChange={(e) =>
                    setSettings({ ...settings, premiumListingLimit: Number(e.target.value) })
                  }
                  className="admin-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Premium üyelerin ilan limiti (-1 = sınırsız)
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Business İlan Limiti
                </label>
                <input
                  type="number"
                  min="-1"
                  value={settings.businessListingLimit}
                  onChange={(e) =>
                    setSettings({ ...settings, businessListingLimit: Number(e.target.value) })
                  }
                  className="admin-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Business üyelerin ilan limiti (-1 = sınırsız)
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Minimum Ürün Fiyatı (₺)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.minProductPrice}
                  onChange={(e) =>
                    setSettings({ ...settings, minProductPrice: Number(e.target.value) })
                  }
                  className="admin-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Yeni ilanlar için minimum fiyat (mevcut ilanlar etkilenmez)
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Maksimum Ürün Fiyatı (₺)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={settings.maxProductPrice}
                  onChange={(e) =>
                    setSettings({ ...settings, maxProductPrice: Number(e.target.value) })
                  }
                  className="admin-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Yeni ilanlar için maksimum fiyat (mevcut ilanlar etkilenmez)
                </p>
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
