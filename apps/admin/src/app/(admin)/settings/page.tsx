"use client";

import { useState, useEffect } from "react";
import { adminApi } from "@/lib/api";
import toast from "react-hot-toast";
import { Button, Input, Spinner } from "@tarodan/ui";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { AdminTabs } from "@/components/AdminTabs";

interface Settings {
  freeListingLimit: number;
  basicListingLimit: number;
  premiumListingLimit: number;
  businessListingLimit: number;
  tradeResponseHours: number;
  tradePaymentHours: number;
  tradeShippingDays: number;
  tradeConfirmationDays: number;
  minProductPrice: number;
  maxProductPrice: number;
  maxMessageLength: number;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    freeListingLimit: 10,
    basicListingLimit: 50,
    premiumListingLimit: -1,
    businessListingLimit: -1,
    tradeResponseHours: 72,
    tradePaymentHours: 48,
    tradeShippingDays: 7,
    tradeConfirmationDays: 3,
    minProductPrice: 10,
    maxProductPrice: 100000,
    maxMessageLength: 1000,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"listing" | "trade" | "message">(
    "listing",
  );

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const settingsResponse = await adminApi.getSettings();
      const settingsData =
        settingsResponse.data?.data || settingsResponse.data || [];
      const settingsObj: Record<string, any> = {};

      if (Array.isArray(settingsData)) {
        settingsData.forEach((s: any) => {
          const key = s.settingKey || s.key;
          const value = s.settingValue || s.value;
          if (key) {
            settingsObj[key] = value;
          }
        });
      } else if (typeof settingsData === "object") {
        Object.keys(settingsData).forEach((key) => {
          settingsObj[key] = settingsData[key];
        });
      }

      setSettings({
        freeListingLimit: settingsObj.free_listing_limit
          ? Number(settingsObj.free_listing_limit)
          : 10,
        basicListingLimit: settingsObj.basic_listing_limit
          ? Number(settingsObj.basic_listing_limit)
          : 50,
        premiumListingLimit: settingsObj.premium_listing_limit
          ? Number(settingsObj.premium_listing_limit)
          : -1,
        businessListingLimit: settingsObj.business_listing_limit
          ? Number(settingsObj.business_listing_limit)
          : -1,
        minProductPrice: settingsObj.min_product_price
          ? Number(settingsObj.min_product_price)
          : 10,
        maxProductPrice: settingsObj.max_product_price
          ? Number(settingsObj.max_product_price)
          : 100000,
        tradeResponseHours: settingsObj.trade_response_deadline_hours
          ? Number(settingsObj.trade_response_deadline_hours)
          : 72,
        tradePaymentHours: settingsObj.trade_payment_deadline_hours
          ? Number(settingsObj.trade_payment_deadline_hours)
          : 48,
        tradeShippingDays: settingsObj.trade_shipping_deadline_days
          ? Number(settingsObj.trade_shipping_deadline_days)
          : 7,
        tradeConfirmationDays: settingsObj.trade_confirmation_deadline_days
          ? Number(settingsObj.trade_confirmation_deadline_days)
          : 3,
        maxMessageLength: settingsObj.max_message_length
          ? Number(settingsObj.max_message_length)
          : 1000,
      });
    } catch (error) {
      setLoadError(true);
      toast.error("Ayarlar yüklenemedi", { id: "settings-load" });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const settingsToSave = [];

      if (activeTab === "listing") {
        settingsToSave.push(
          adminApi.updateSetting(
            "free_listing_limit",
            settings.freeListingLimit.toString(),
          ),
          adminApi.updateSetting(
            "basic_listing_limit",
            settings.basicListingLimit.toString(),
          ),
          adminApi.updateSetting(
            "premium_listing_limit",
            settings.premiumListingLimit.toString(),
          ),
          adminApi.updateSetting(
            "business_listing_limit",
            settings.businessListingLimit.toString(),
          ),
          adminApi.updateSetting(
            "min_product_price",
            settings.minProductPrice.toString(),
          ),
          adminApi.updateSetting(
            "max_product_price",
            settings.maxProductPrice.toString(),
          ),
        );
      } else if (activeTab === "trade") {
        settingsToSave.push(
          adminApi.updateSetting(
            "trade_response_deadline_hours",
            settings.tradeResponseHours.toString(),
          ),
          adminApi.updateSetting(
            "trade_payment_deadline_hours",
            settings.tradePaymentHours.toString(),
          ),
          adminApi.updateSetting(
            "trade_shipping_deadline_days",
            settings.tradeShippingDays.toString(),
          ),
          adminApi.updateSetting(
            "trade_confirmation_deadline_days",
            settings.tradeConfirmationDays.toString(),
          ),
        );
      } else if (activeTab === "message") {
        settingsToSave.push(
          adminApi.updateSetting(
            "max_message_length",
            settings.maxMessageLength.toString(),
          ),
        );
      }

      await Promise.all(settingsToSave);
      toast.success("Ayarlar kaydedildi");
      await loadSettings();
    } catch (error) {
      toast.error("Ayarlar kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="xl" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="admin-card flex flex-col items-center justify-center gap-4 py-16 text-center">
        <ExclamationTriangleIcon className="h-12 w-12 shrink-0 text-danger-500" />
        <div className="min-w-0">
          <p className="text-lg font-semibold text-heading">Ayarlar yüklenemedi</p>
          <p className="mt-1 text-sm text-muted">
            Oturumun sona ermiş olabilir. Tekrar dene; sürerse çıkış yapıp
            yeniden giriş yap.
          </p>
        </div>
        <Button onClick={() => loadSettings()}>Tekrar Dene</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Sistem Ayarları</h1>
        <p className="text-muted mt-1">Sistem yapılandırmasını yönetin</p>
      </div>

      <AdminTabs
        tabs={[
          { key: "listing", label: "İlan" },
          { key: "trade", label: "Takas" },
          { key: "message", label: "Mesaj" },
        ]}
        value={activeTab}
        onChange={(k) => setActiveTab(k as "listing" | "trade" | "message")}
      />

      {activeTab === "listing" && (
        <div className="admin-card">
          <h2 className="text-lg font-semibold text-heading mb-4">
            İlan Ayarları
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-muted mb-2">
                Ücretsiz İlan Limiti
              </label>
              <Input
                type="number"
                min="0"
                value={settings.freeListingLimit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    freeListingLimit: Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted mt-1">
                Ücretsiz üyelerin ilan limiti
              </p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-2">
                Temel İlan Limiti
              </label>
              <Input
                type="number"
                min="-1"
                value={settings.basicListingLimit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    basicListingLimit: Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted mt-1">
                Temel üyelerin ilan limiti (-1 = sınırsız)
              </p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-2">
                Premium İlan Limiti
              </label>
              <Input
                type="number"
                min="-1"
                value={settings.premiumListingLimit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    premiumListingLimit: Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted mt-1">
                Premium üyelerin ilan limiti (-1 = sınırsız)
              </p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-2">
                Business İlan Limiti
              </label>
              <Input
                type="number"
                min="-1"
                value={settings.businessListingLimit}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    businessListingLimit: Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted mt-1">
                Business üyelerin ilan limiti (-1 = sınırsız)
              </p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-2">
                Minimum Ürün Fiyatı (₺)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={settings.minProductPrice}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    minProductPrice: Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted mt-1">
                Yeni ilanlar için minimum fiyat (mevcut ilanlar etkilenmez)
              </p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-2">
                Maksimum Ürün Fiyatı (₺)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={settings.maxProductPrice}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maxProductPrice: Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted mt-1">
                Yeni ilanlar için maksimum fiyat (mevcut ilanlar etkilenmez)
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "trade" && (
        <div className="admin-card">
          <h2 className="text-lg font-semibold text-heading mb-4">
            Takas Ayarları
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-muted mb-2">
                Yanıt Süresi (Saat)
              </label>
              <Input
                type="number"
                value={settings.tradeResponseHours}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    tradeResponseHours: Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted mt-1">
                Takas teklifine yanıt süresi
              </p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-2">
                Ödeme Süresi (Saat)
              </label>
              <Input
                type="number"
                value={settings.tradePaymentHours}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    tradePaymentHours: Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted mt-1">
                Kabul sonrası ödeme süresi (nakit takaslar için)
              </p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-2">
                Kargo Süresi (Gün)
              </label>
              <Input
                type="number"
                value={settings.tradeShippingDays}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    tradeShippingDays: Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted mt-1">
                Kabul sonrası kargo gönderim süresi
              </p>
            </div>
            <div>
              <label className="block text-sm text-muted mb-2">
                Onay Süresi (Gün)
              </label>
              <Input
                type="number"
                value={settings.tradeConfirmationDays}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    tradeConfirmationDays: Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted mt-1">
                Teslim sonrası onay süresi
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === "message" && (
        <div className="admin-card">
          <h2 className="text-lg font-semibold text-heading mb-4">
            Mesaj Ayarları
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-muted mb-2">
                Maksimum Mesaj Uzunluğu
              </label>
              <Input
                type="number"
                min="1"
                value={settings.maxMessageLength}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    maxMessageLength: Number(e.target.value),
                  })
                }
              />
              <p className="text-xs text-muted mt-1">
                Bir mesajın maksimum karakter uzunluğu
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSaveSettings} disabled={saving} className="px-6">
          {saving ? "Kaydediliyor..." : "Ayarları Kaydet"}
        </Button>
      </div>
    </div>
  );
}
