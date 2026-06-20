'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { PencilIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Button, Checkbox, Input, Spinner, Textarea, enumLabel, membershipTierConfig } from '@tarodan/ui';

// ─── Tipler ────────────────────────────────────────────────────────────────

interface MembershipTier {
  id: string;
  type: string;
  name: string;
  description?: string;
  monthlyPrice: number;
  yearlyPrice: number;
  maxFreeListings: number;
  maxTotalListings: number;
  maxImagesPerListing: number;
  canCreateCollections: boolean;
  canTrade: boolean;
  isAdFree: boolean;
  featuredListingSlots: number;
  commissionDiscount: number;
  isActive: boolean;
  sortOrder: number;
  userCount: number;
}

interface TierFormData {
  name: string;
  description: string;
  monthlyPrice: number;
  maxFreeListings: number;
  maxTotalListings: number;
  maxImagesPerListing: number;
  canCreateCollections: boolean;
  canTrade: boolean;
  isAdFree: boolean;
  featuredListingSlots: number;
  commissionDiscount: number;
  isActive: boolean;
  sortOrder: number;
}

// platform_settings'deki fiyat anahtarı — sadece basic/premium/business için var
const PRICE_KEY: Record<string, string> = {
  basic: 'basic_monthly_price',
  premium: 'premium_monthly_price',
  business: 'business_monthly_price',
};

// ─── Sayfa ─────────────────────────────────────────────────────────────────

export default function MembershipTiersPage() {
  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearlyDiscount, setYearlyDiscount] = useState<number>(20);
  const [discountSaving, setDiscountSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingTier, setEditingTier] = useState<MembershipTier | null>(null);
  const [formData, setFormData] = useState<TierFormData>({
    name: '',
    description: '',
    monthlyPrice: 0,
    maxFreeListings: 0,
    maxTotalListings: 0,
    maxImagesPerListing: 0,
    canCreateCollections: false,
    canTrade: false,
    isAdFree: false,
    featuredListingSlots: 0,
    commissionDiscount: 0,
    isActive: true,
    sortOrder: 0,
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tiersRes, settingsRes] = await Promise.all([
        adminApi.getMembershipTiers(),
        adminApi.getSettings(),
      ]);

      setTiers(tiersRes.data.data || tiersRes.data || []);

      // getSettings döndürdüğü format: { data: [{settingKey, settingValue}] } veya düz array
      const raw = settingsRes.data?.data ?? settingsRes.data ?? [];
      if (Array.isArray(raw)) {
        const entry = raw.find((s: any) => (s.settingKey ?? s.key) === 'yearly_discount_percentage');
        if (entry) {
          const val = parseFloat(entry.settingValue ?? entry.value);
          if (!isNaN(val)) setYearlyDiscount(val);
        }
      } else if (raw && typeof raw === 'object' && raw.yearly_discount_percentage != null) {
        setYearlyDiscount(Number(raw.yearly_discount_percentage));
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Yıllık fiyatı aylık fiyat + indirim oranından hesapla
  const computedYearly = (monthly: number) =>
    Math.round(monthly * 12 * (1 - yearlyDiscount / 100) * 100) / 100;

  // ── Yıllık indirim kaydet ────────────────────────────────────────────────
  const handleSaveDiscount = async () => {
    setDiscountSaving(true);
    try {
      // Backend hem platform_settings'i hem de tüm katmanların yearlyPrice'ını günceller
      await adminApi.updateSetting('yearly_discount_percentage', yearlyDiscount.toString());
      toast.success('Yıllık indirim oranı güncellendi');
      await loadData();
    } catch {
      toast.error('Güncelleme başarısız');
    } finally {
      setDiscountSaving(false);
    }
  };

  // ── Modal aç ────────────────────────────────────────────────────────────
  const openEditModal = (tier: MembershipTier) => {
    setEditingTier(tier);
    setFormData({
      name: tier.name,
      description: tier.description || '',
      monthlyPrice: tier.monthlyPrice,
      maxFreeListings: tier.maxFreeListings,
      maxTotalListings: tier.maxTotalListings,
      maxImagesPerListing: tier.maxImagesPerListing,
      canCreateCollections: tier.canCreateCollections,
      canTrade: tier.canTrade,
      isAdFree: tier.isAdFree,
      featuredListingSlots: tier.featuredListingSlots,
      commissionDiscount: tier.commissionDiscount,
      isActive: tier.isActive,
      sortOrder: tier.sortOrder,
    });
    setShowModal(true);
  };

  // ── Kaydet ──────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTier) return;

    try {
      const yearlyPrice = computedYearly(formData.monthlyPrice);

      // 1. MembershipTier tablosunu güncelle (tüm alanlar + hesaplanan yıllık fiyat)
      await adminApi.updateMembershipTier(editingTier.id, { ...formData, yearlyPrice });

      // 2. platform_settings'i güncelle — backend bu çağrıda MembershipTier'ı da senkronize eder
      //    free tier için platform_settings'te karşılık gelen anahtar yoktur
      const priceKey = PRICE_KEY[editingTier.type];
      if (priceKey) {
        await adminApi.updateSetting(priceKey, formData.monthlyPrice.toString());
      }

      toast.success('Üyelik katmanı güncellendi');
      setShowModal(false);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Güncelleme başarısız');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      <div className="space-y-6">
        {/* Başlık */}
        <div>
          <h1 className="text-2xl font-bold text-heading">Üyelik Katmanları</h1>
          <p className="text-muted mt-1">Üyelik katmanlarını ve fiyatlarını yönetin</p>
        </div>

        {/* Yıllık İndirim — global ayar */}
        <div className="admin-card">
          <h2 className="text-base font-semibold text-heading mb-4">Yıllık İndirim Oranı</h2>
          <div className="flex items-end gap-4">
            <div className="w-48">
              <label className="block text-sm font-medium text-muted mb-2">
                İndirim Yüzdesi (%)
              </label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={yearlyDiscount}
                onChange={(e) => setYearlyDiscount(Number(e.target.value))}
              />
            </div>
            <Button onClick={handleSaveDiscount} disabled={discountSaving} className="px-4">
              {discountSaving ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </div>
          <p className="text-xs text-muted mt-3">
            Yıllık fiyat = Aylık Fiyat × 12 × (1 − İndirim%) · Değiştirildiğinde tüm katmanların yıllık fiyatı otomatik güncellenir.
          </p>
        </div>

        {/* Katman kartları */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full text-center py-12">
              <Spinner size="lg" className="mx-auto" />
              <p className="text-muted mt-4">Yükleniyor…</p>
            </div>
          ) : tiers.length === 0 ? (
            <div className="col-span-full text-center py-12 text-muted">
              Henüz üyelik katmanı yok
            </div>
          ) : (
            tiers.map((tier) => (
              <div key={tier.id} className="admin-card">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-heading truncate">{tier.name}</h3>
                    <p className="text-sm text-muted truncate">{enumLabel(membershipTierConfig, tier.type)}</p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => openEditModal(tier)}
                    className="p-2 text-muted hover:text-heading hover:bg-surface-alt rounded-lg shrink-0"
                    title="Düzenle"
                  >
                    <PencilIcon className="h-5 w-5 shrink-0" />
                  </Button>
                </div>

                {tier.description && (
                  <p className="text-sm text-muted mb-4">{tier.description}</p>
                )}

                <div className="space-y-2 text-sm">
                  {tier.type !== 'free' && (
                    <>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted truncate min-w-0">Aylık:</span>
                        <span className="text-heading font-medium shrink-0 whitespace-nowrap">
                          ₺{Number(tier.monthlyPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between gap-2">
                        <span className="text-muted truncate min-w-0">Yıllık:</span>
                        <span className="text-heading font-medium shrink-0 whitespace-nowrap">
                          ₺{computedYearly(Number(tier.monthlyPrice)).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-muted truncate min-w-0">Ücretsiz İlan:</span>
                    <span className="text-heading shrink-0 whitespace-nowrap">{tier.maxFreeListings}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted truncate min-w-0">Toplam İlan:</span>
                    <span className="text-heading shrink-0 whitespace-nowrap">
                      {tier.maxTotalListings === -1 ? 'Sınırsız' : tier.maxTotalListings}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted truncate min-w-0">Görsel/İlan:</span>
                    <span className="text-heading shrink-0 whitespace-nowrap">{tier.maxImagesPerListing}</span>
                  </div>
                  <div className="pt-2 border-t border-border flex justify-between gap-2">
                    <span className="text-muted truncate min-w-0">Kullanıcı Sayısı:</span>
                    <span className="text-heading font-medium shrink-0 whitespace-nowrap">{tier.userCount}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-border flex flex-wrap gap-2">
                  {tier.canCreateCollections && (
                    <span className="px-2 py-1 text-xs bg-success-50 text-success-700 rounded">Koleksiyon</span>
                  )}
                  {tier.canTrade && (
                    <span className="px-2 py-1 text-xs bg-info-50 text-info-700 rounded">Takas</span>
                  )}
                  {tier.isAdFree && (
                    <span className="px-2 py-1 text-xs bg-primary-50 text-primary-700 rounded">Reklamsız</span>
                  )}
                  {!tier.isActive && (
                    <span className="px-2 py-1 text-xs bg-body text-muted rounded">Pasif</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Düzenleme Modal */}
      {showModal && editingTier && (
        <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-elevated rounded-xl px-6 pb-6 pt-5 max-w-2xl w-full mx-4 border border-border max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-heading mb-4 leading-tight">
              Üyelik Katmanı Düzenle — {editingTier.name}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Ad / Sıralama */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">Ad *</label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">Sıralama</label>
                  <Input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              {/* Açıklama */}
              <div>
                <label className="block text-sm font-medium text-muted mb-2">Açıklama</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                />
              </div>

              {/* Fiyat — sadece free dışı katmanlar için */}
              {editingTier.type !== 'free' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-muted mb-2">Aylık Fiyat (₺)</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.monthlyPrice}
                      onChange={(e) => setFormData({ ...formData, monthlyPrice: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-muted mb-2">
                      Yıllık Fiyat (₺) <span className="text-xs text-subtle">(Otomatik)</span>
                    </label>
                    <div className="px-3 py-2 bg-surface-alt border border-border rounded-lg text-sm text-muted">
                      ₺{computedYearly(formData.monthlyPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </div>
                    <p className="text-xs text-subtle mt-1">
                      {formData.monthlyPrice} × 12 × (1 − {yearlyDiscount}%) = {computedYearly(formData.monthlyPrice).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                    </p>
                  </div>
                </div>
              )}

              {/* İlan limitleri */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">Ücretsiz İlan</label>
                  <Input
                    type="number"
                    value={formData.maxFreeListings}
                    onChange={(e) => setFormData({ ...formData, maxFreeListings: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">Toplam İlan</label>
                  <Input
                    type="number"
                    min="-1"
                    value={formData.maxTotalListings}
                    onChange={(e) => setFormData({ ...formData, maxTotalListings: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-subtle mt-1">-1 = sınırsız</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">Görsel/İlan</label>
                  <Input
                    type="number"
                    value={formData.maxImagesPerListing}
                    onChange={(e) => setFormData({ ...formData, maxImagesPerListing: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>

              {/* Öne çıkan / komisyon */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">Öne Çıkan İlan Slotları</label>
                  <Input
                    type="number"
                    value={formData.featuredListingSlots}
                    onChange={(e) => setFormData({ ...formData, featuredListingSlots: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">Komisyon İndirimi (%)</label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={formData.commissionDiscount}
                    onChange={(e) => setFormData({ ...formData, commissionDiscount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              {/* Özellikler */}
              <div className="space-y-2">
                <Checkbox
                  checked={formData.canCreateCollections}
                  onChange={(e) => setFormData({ ...formData, canCreateCollections: e.target.checked })}
                  label="Koleksiyon Oluşturabilir"
                />
                <Checkbox
                  checked={formData.canTrade}
                  onChange={(e) => setFormData({ ...formData, canTrade: e.target.checked })}
                  label="Takas Yapabilir"
                />
                <Checkbox
                  checked={formData.isAdFree}
                  onChange={(e) => setFormData({ ...formData, isAdFree: e.target.checked })}
                  label="Reklamsız"
                />
                <Checkbox
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  label="Aktif"
                />
              </div>

              {/* Butonlar */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 text-muted hover:bg-surface-alt"
                >
                  İptal
                </Button>
                <Button
                  variant="secondary"
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-heading rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Güncelle
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
