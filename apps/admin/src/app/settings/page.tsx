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
  tradePaymentHours: number;
  tradeShippingDays: number;
  tradeConfirmationDays: number;
  minProductPrice: number;
  maxProductPrice: number;
  maxMessageLength: number;
  premiumMonthlyPrice: number;
  businessMonthlyPrice: number;
  yearlyDiscountPercentage: number;
  siteName: string;
  logoUrl: string;
  supportEmail: string;
  timezone: string;
  currency: string;
  language: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    freeListingLimit: 10,
    premiumListingLimit: -1, // -1 means unlimited
    businessListingLimit: -1, // -1 means unlimited
    tradeResponseHours: 72,
    tradePaymentHours: 48,
    tradeShippingDays: 7,
    tradeConfirmationDays: 3,
    minProductPrice: 10,
    maxProductPrice: 100000,
    maxMessageLength: 1000,
    premiumMonthlyPrice: 99,
    businessMonthlyPrice: 499,
    yearlyDiscountPercentage: 20,
    siteName: 'Tarotaro',
    logoUrl: '',
    supportEmail: 'support@tarotaro.com',
    timezone: 'Europe/Istanbul',
    currency: 'TRY',
    language: 'tr',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'listing' | 'trade' | 'message' | 'membership'>('general');

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

      if (process.env.NODE_ENV === 'development') console.log('Loaded settings:', settingsObj);

      // Load membership tier prices if not in platform settings
      let premiumMonthlyPrice = settingsObj.premium_monthly_price ? Number(settingsObj.premium_monthly_price) : null;
      let businessMonthlyPrice = settingsObj.business_monthly_price ? Number(settingsObj.business_monthly_price) : null;
      let yearlyDiscountPercentage = settingsObj.yearly_discount_percentage ? Number(settingsObj.yearly_discount_percentage) : null;

      if (premiumMonthlyPrice === null || businessMonthlyPrice === null || yearlyDiscountPercentage === null) {
        try {
          const tiersResponse = await adminApi.getMembershipTiers();
          const tiers = tiersResponse.data?.tiers || tiersResponse.data || [];

          const premiumTier = tiers.find((t: any) => t.type === 'premium');
          const businessTier = tiers.find((t: any) => t.type === 'business');

          if (premiumMonthlyPrice === null && premiumTier) {
            premiumMonthlyPrice = Number(premiumTier.monthlyPrice) || 99;
          }
          if (businessMonthlyPrice === null && businessTier) {
            businessMonthlyPrice = Number(businessTier.monthlyPrice) || 499;
          }
          // Calculate discount percentage from existing prices if available
          if (yearlyDiscountPercentage === null && premiumTier) {
            const monthly = Number(premiumTier.monthlyPrice) || 99;
            const yearly = Number(premiumTier.yearlyPrice) || 960;
            if (monthly > 0 && yearly > 0) {
              // Calculate: yearly = monthly * 12 * (1 - discount/100)
              // discount = (1 - yearly/(monthly*12)) * 100
              yearlyDiscountPercentage = Math.round((1 - yearly / (monthly * 12)) * 100);
            } else {
              yearlyDiscountPercentage = 20; // Default
            }
          }
        } catch (error) {
          if (process.env.NODE_ENV === 'development') console.error('Failed to load membership tiers:', error);
        }
      }

      // Map platform setting keys to local settings
      setSettings({
        freeListingLimit: settingsObj.free_listing_limit ? Number(settingsObj.free_listing_limit) : 10,
        premiumListingLimit: settingsObj.premium_listing_limit ? Number(settingsObj.premium_listing_limit) : -1,
        businessListingLimit: settingsObj.business_listing_limit ? Number(settingsObj.business_listing_limit) : -1,
        minProductPrice: settingsObj.min_product_price ? Number(settingsObj.min_product_price) : 10,
        maxProductPrice: settingsObj.max_product_price ? Number(settingsObj.max_product_price) : 100000,
        tradeResponseHours: settingsObj.trade_response_deadline_hours ? Number(settingsObj.trade_response_deadline_hours) : 72,
        tradePaymentHours: settingsObj.trade_payment_deadline_hours ? Number(settingsObj.trade_payment_deadline_hours) : 48,
        tradeShippingDays: settingsObj.trade_shipping_deadline_days ? Number(settingsObj.trade_shipping_deadline_days) : 7,
        tradeConfirmationDays: settingsObj.trade_confirmation_deadline_days ? Number(settingsObj.trade_confirmation_deadline_days) : 3,
        maxMessageLength: settingsObj.max_message_length ? Number(settingsObj.max_message_length) : 1000,
        premiumMonthlyPrice: premiumMonthlyPrice ?? 99,
        businessMonthlyPrice: businessMonthlyPrice ?? 499,
        yearlyDiscountPercentage: yearlyDiscountPercentage ?? 20,
        siteName: settingsObj.site_name || 'Tarotaro',
        logoUrl: settingsObj.logo_url || '',
        supportEmail: settingsObj.support_email || 'support@tarotaro.com',
        timezone: settingsObj.timezone || 'Europe/Istanbul',
        currency: settingsObj.currency || 'TRY',
        language: settingsObj.language || 'tr',
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Settings load error:', error);
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
      } else if (activeTab === 'general') {
        settingsToSave.push(
          adminApi.updateSetting('site_name', settings.siteName),
          adminApi.updateSetting('logo_url', settings.logoUrl),
          adminApi.updateSetting('support_email', settings.supportEmail),
          adminApi.updateSetting('timezone', settings.timezone),
          adminApi.updateSetting('currency', settings.currency),
          adminApi.updateSetting('language', settings.language)
        );
      } else if (activeTab === 'trade') {
        settingsToSave.push(
          adminApi.updateSetting('trade_response_deadline_hours', settings.tradeResponseHours.toString()),
          adminApi.updateSetting('trade_payment_deadline_hours', settings.tradePaymentHours.toString()),
          adminApi.updateSetting('trade_shipping_deadline_days', settings.tradeShippingDays.toString()),
          adminApi.updateSetting('trade_confirmation_deadline_days', settings.tradeConfirmationDays.toString())
        );
      } else if (activeTab === 'message') {
        settingsToSave.push(
          adminApi.updateSetting('max_message_length', settings.maxMessageLength.toString())
        );
      } else if (activeTab === 'membership') {
        settingsToSave.push(
          adminApi.updateSetting('premium_monthly_price', settings.premiumMonthlyPrice.toString()),
          adminApi.updateSetting('business_monthly_price', settings.businessMonthlyPrice.toString()),
          adminApi.updateSetting('yearly_discount_percentage', settings.yearlyDiscountPercentage.toString())
        );
      }

      await Promise.all(settingsToSave);
      toast.success('Ayarlar kaydedildi');
      // Reload settings after save to reflect changes
      await loadSettings();
    } catch (error) {
      if (process.env.NODE_ENV === 'development') console.error('Settings save error:', error);
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
            { id: 'listing', label: 'İlan' },
            { id: 'trade', label: 'Takas' },

            { id: 'message', label: 'Mesaj' },
            { id: 'membership', label: 'Üyelik' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-t-lg transition-colors ${activeTab === tab.id
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
                <label className="block text-sm text-gray-400 mb-2">Site Adı</label>
                <input
                  type="text"
                  value={settings.siteName}
                  onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Destek E-posta</label>
                <input
                  type="email"
                  value={settings.supportEmail}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Logo URL</label>
                <input
                  type="text"
                  value={settings.logoUrl}
                  onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                  className="admin-input"
                  placeholder="https://..."
                />
                <p className="text-xs text-gray-500 mt-1">Logo görseli için doğrudan URL</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Saat Dilimi</label>
                <select
                  value={settings.timezone}
                  onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                  className="admin-input"
                >
                  <option value="Europe/Istanbul">Europe/Istanbul (GMT+3)</option>
                  <option value="UTC">UTC (GMT+0)</option>
                  <option value="Europe/London">Europe/London (GMT+0/+1)</option>
                  <option value="America/New_York">America/New_York (GMT-5/-4)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Para Birimi</label>
                <select
                  value={settings.currency}
                  onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                  className="admin-input"
                >
                  <option value="TRY">Türk Lirası (₺)</option>
                  <option value="USD">Amerikan Doları ($)</option>
                  <option value="EUR">Euro (€)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Dil</label>
                <select
                  value={settings.language}
                  onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                  className="admin-input"
                >
                  <option value="tr">Türkçe</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
          </div>
        )}

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
                  Ödeme Süresi (Saat)
                </label>
                <input
                  type="number"
                  value={settings.tradePaymentHours}
                  onChange={(e) =>
                    setSettings({ ...settings, tradePaymentHours: Number(e.target.value) })
                  }
                  className="admin-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Kabul sonrası ödeme süresi (nakit takaslar için)
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

        {/* Message Settings */}
        {activeTab === 'message' && (
          <div className="admin-card">
            <h2 className="text-lg font-semibold text-white mb-4">Mesaj Ayarları</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Maksimum Mesaj Uzunluğu
                </label>
                <input
                  type="number"
                  min="1"
                  value={settings.maxMessageLength}
                  onChange={(e) =>
                    setSettings({ ...settings, maxMessageLength: Number(e.target.value) })
                  }
                  className="admin-input"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Bir mesajın maksimum karakter uzunluğu
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Membership Settings */}
        {activeTab === 'membership' && (
          <div className="admin-card">
            <h2 className="text-lg font-semibold text-white mb-4">Üyelik Fiyatları</h2>
            <div className="space-y-6">
              {/* Discount Percentage */}
              <div className="border border-gray-700 rounded-lg p-4">
                <h3 className="text-md font-semibold text-white mb-4">Yıllık İndirim Oranı</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      İndirim Yüzdesi (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={settings.yearlyDiscountPercentage}
                      onChange={(e) =>
                        setSettings({ ...settings, yearlyDiscountPercentage: Number(e.target.value) })
                      }
                      className="admin-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Yıllık üyelik için uygulanacak indirim yüzdesi
                    </p>
                    <p className="text-xs text-blue-400 mt-2">
                      Yıllık fiyat = (Aylık Fiyat × 12) × (1 - İndirim%)
                    </p>
                  </div>
                </div>
              </div>

              {/* Premium Tier */}
              <div className="border border-gray-700 rounded-lg p-4">
                <h3 className="text-md font-semibold text-white mb-4">Premium Üyelik</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Aylık Fiyat (₺)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={settings.premiumMonthlyPrice}
                      onChange={(e) =>
                        setSettings({ ...settings, premiumMonthlyPrice: Number(e.target.value) })
                      }
                      className="admin-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Premium üyeliğin aylık fiyatı
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Yıllık Fiyat (₺) <span className="text-xs text-gray-500">(Otomatik Hesaplanır)</span>
                    </label>
                    <div className="admin-input bg-gray-800 text-gray-400 cursor-not-allowed">
                      {Math.round((settings.premiumMonthlyPrice * 12 * (1 - settings.yearlyDiscountPercentage / 100)) * 100) / 100}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Yıllık fiyat otomatik hesaplanır: {settings.premiumMonthlyPrice} × 12 × (1 - {settings.yearlyDiscountPercentage}%)
                    </p>
                  </div>
                </div>
              </div>

              {/* Business Tier */}
              <div className="border border-gray-700 rounded-lg p-4">
                <h3 className="text-md font-semibold text-white mb-4">Business Üyelik</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Aylık Fiyat (₺)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={settings.businessMonthlyPrice}
                      onChange={(e) =>
                        setSettings({ ...settings, businessMonthlyPrice: Number(e.target.value) })
                      }
                      className="admin-input"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Business üyeliğin aylık fiyatı
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">
                      Yıllık Fiyat (₺) <span className="text-xs text-gray-500">(Otomatik Hesaplanır)</span>
                    </label>
                    <div className="admin-input bg-gray-800 text-gray-400 cursor-not-allowed">
                      {Math.round((settings.businessMonthlyPrice * 12 * (1 - settings.yearlyDiscountPercentage / 100)) * 100) / 100}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Yıllık fiyat otomatik hesaplanır: {settings.businessMonthlyPrice} × 12 × (1 - {settings.yearlyDiscountPercentage}%)
                    </p>
                  </div>
                </div>
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
