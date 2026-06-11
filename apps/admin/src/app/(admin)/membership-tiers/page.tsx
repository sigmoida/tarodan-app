'use client';

import { useState, useEffect } from 'react';
import { adminApi } from '@/lib/api';
import { PencilIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { Button, Checkbox, Input, Spinner, Textarea, enumLabel, membershipTierConfig } from '@tarodan/ui';

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
  createdAt: string;
}

interface TierFormData {
  name: string;
  description: string;
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
}

export default function MembershipTiersPage() {
  const [tiers, setTiers] = useState<MembershipTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTier, setEditingTier] = useState<MembershipTier | null>(null);
  const [formData, setFormData] = useState<TierFormData>({
    name: '',
    description: '',
    monthlyPrice: 0,
    yearlyPrice: 0,
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

  useEffect(() => {
    loadTiers();
  }, []);

  const loadTiers = async () => {
    setLoading(true);
    try {
      const response = await adminApi.getMembershipTiers();
      setTiers(response.data.data || response.data || []);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to load membership tiers:', error);
      toast.error(error.response?.data?.message || 'Üyelik seviyeleri yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (tier: MembershipTier) => {
    setEditingTier(tier);
    setFormData({
      name: tier.name,
      description: tier.description || '',
      monthlyPrice: tier.monthlyPrice,
      yearlyPrice: tier.yearlyPrice,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTier) return;

    try {
      await adminApi.updateMembershipTier(editingTier.id, formData);
      toast.success('Üyelik seviyesi güncellendi');
      setShowModal(false);
      loadTiers();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Güncelleme başarısız');
    }
  };

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-heading">Üyelik Seviyeleri</h1>
          <p className="text-muted mt-1">Üyelik seviyelerini yönetin</p>
        </div>

        {/* Tiers List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full text-center py-12">
              <Spinner size="lg" className="mx-auto" />
              <p className="text-muted mt-4">Yükleniyor...</p>
            </div>
          ) : tiers.length === 0 ? (
            <div className="col-span-full text-center py-12 text-muted">
              Henüz üyelik seviyesi yok
            </div>
          ) : (
            tiers.map((tier) => (
              <div key={tier.id} className="admin-card">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-heading">{tier.name}</h3>
                    <p className="text-sm text-muted">{enumLabel(membershipTierConfig, tier.type)}</p>
                  </div>
                  <Button variant="secondary" onClick={() => openEditModal(tier)}
                    className="p-2 text-muted hover:text-heading hover:bg-surface-alt rounded-lg"
                    title="Düzenle">
                    <PencilIcon className="h-5 w-5" />
                  </Button>
                </div>
                {tier.description && (
                  <p className="text-sm text-muted mb-4">{tier.description}</p>
                )}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">Aylık:</span>
                    <span className="text-heading font-medium">
                      ₺{tier.monthlyPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Yıllık:</span>
                    <span className="text-heading font-medium">
                      ₺{tier.yearlyPrice.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Ücretsiz İlan:</span>
                    <span className="text-heading">{tier.maxFreeListings}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Toplam İlan:</span>
                    <span className="text-heading">{tier.maxTotalListings}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Görsel/İlan:</span>
                    <span className="text-heading">{tier.maxImagesPerListing}</span>
                  </div>
                  <div className="pt-2 border-t border-border">
                    <div className="flex justify-between">
                      <span className="text-muted">Kullanıcı Sayısı:</span>
                      <span className="text-heading font-medium">{tier.userCount}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-border">
                  <div className="flex flex-wrap gap-2">
                    {tier.canCreateCollections && (
                      <span className="px-2 py-1 text-xs bg-success-50 text-success-700 rounded">
                        Koleksiyon
                      </span>
                    )}
                    {tier.canTrade && (
                      <span className="px-2 py-1 text-xs bg-info-50 text-info-700 rounded">
                        Takas
                      </span>
                    )}
                    {tier.isAdFree && (
                      <span className="px-2 py-1 text-xs bg-primary-50 text-primary-700 rounded">
                        Reklamsız
                      </span>
                    )}
                    {!tier.isActive && (
                      <span className="px-2 py-1 text-xs bg-body text-muted rounded">
                        Pasif
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {showModal && editingTier && (
        <div className="fixed inset-0 bg-heading bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-surface-elevated rounded-xl p-6 max-w-2xl w-full mx-4 border border-border max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold text-heading mb-4">Üyelik Seviyesi Düzenle</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Ad *
                  </label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Sıralama
                  </label>
                  <Input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  Açıklama
                </label>
                <Textarea value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Aylık Fiyat (₺)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.monthlyPrice}
                    onChange={(e) => setFormData({ ...formData, monthlyPrice: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Yıllık Fiyat (₺)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.yearlyPrice}
                    onChange={(e) => setFormData({ ...formData, yearlyPrice: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Ücretsiz İlan
                  </label>
                  <Input
                    type="number"
                    value={formData.maxFreeListings}
                    onChange={(e) => setFormData({ ...formData, maxFreeListings: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Toplam İlan
                  </label>
                  <Input
                    type="number"
                    value={formData.maxTotalListings}
                    onChange={(e) => setFormData({ ...formData, maxTotalListings: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Görsel/İlan
                  </label>
                  <Input
                    type="number"
                    value={formData.maxImagesPerListing}
                    onChange={(e) => setFormData({ ...formData, maxImagesPerListing: parseInt(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Öne Çıkan İlan Slotları
                  </label>
                  <Input
                    type="number"
                    value={formData.featuredListingSlots}
                    onChange={(e) => setFormData({ ...formData, featuredListingSlots: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    Komisyon İndirimi (%)
                  </label>
                  <Input
                    type="number"
                    step="0.0001"
                    value={formData.commissionDiscount}
                    onChange={(e) => setFormData({ ...formData, commissionDiscount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
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
              <div className="flex gap-3 pt-4">
                <Button variant="secondary" type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 text-muted hover:bg-surface-alt">
                  İptal
                </Button>
                <Button variant="secondary" type="submit"
                  className="flex-1 px-4 py-2 bg-primary-600 text-heading rounded-lg hover:bg-primary-700 transition-colors">
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
