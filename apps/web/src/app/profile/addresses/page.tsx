'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { PlusIcon, PencilIcon, TrashIcon, CheckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { addressesApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import AuthLoadingScreen from '@/components/AuthLoadingScreen';
import CityDistrictSelector from '@/components/CityDistrictSelector';
import { useTranslation } from '@/i18n/LanguageContext';
import { Button, Checkbox, Input, Textarea } from '@tarodan/ui';

interface Address {
  id: string;
  title?: string;
  fullName: string;
  phone: string;
  city: string;
  district: string;
  address: string;
  zipCode?: string;
  isDefault: boolean;
}

export default function AddressesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { t, locale } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    fullName: '',
    phone: '',
    city: '',
    district: '',
    address: '',
    zipCode: '',
    isDefault: false,
  });

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.push('/login?redirect=/profile/addresses');
      return;
    }
  }, [authLoading, isAuthenticated, router]);

  const addressesQuery = useQuery({
    queryKey: ['profile-addresses'],
    queryFn: async (): Promise<Address[]> => {
      const response = await addressesApi.getAll();
      return response.data.data || response.data || [];
    },
    enabled: !authLoading && isAuthenticated,
    meta: { page: 'profile-addresses' },
  });
  const addresses = addressesQuery.data ?? [];
  const isLoading = addressesQuery.isLoading;

  const invalidateAddresses = () => queryClient.invalidateQueries({ queryKey: ['profile-addresses'] });

  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.fullName.trim()) {
      toast.error(locale === 'en' ? 'Full name is required' : 'Ad soyad zorunludur');
      return;
    }
    if (!formData.phone || formData.phone.replace(/\D/g, '').length < 12) {
      toast.error(locale === 'en' ? 'Valid phone number is required' : 'Geçerli bir telefon numarası giriniz');
      return;
    }
    if (!formData.city) {
      toast.error(locale === 'en' ? 'Please select a city' : 'Lütfen şehir seçiniz');
      return;
    }
    if (!formData.district) {
      toast.error(locale === 'en' ? 'Please select a district' : 'Lütfen ilçe seçiniz');
      return;
    }
    if (!formData.address.trim() || formData.address.trim().length < 10) {
      toast.error(locale === 'en' ? 'Address must be at least 10 characters' : 'Adres en az 10 karakter olmalıdır');
      return;
    }

    const dataToSend = {
      ...formData,
      title: formData.title.trim() || (locale === 'en' ? 'Home' : 'Ev'),
    };

    setIsSaving(true);
    try {
      if (editingId) {
        await addressesApi.update(editingId, dataToSend);
        toast.success(t('address.updated'));
      } else {
        await addressesApi.create(dataToSend);
        toast.success(t('address.added'));
      }
      setShowForm(false);
      setEditingId(null);
      resetForm();
      await invalidateAddresses();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to save address:', error);
      const msg = error.response?.data?.message || error.message || t('address.saveFailed');
      toast.error(Array.isArray(msg) ? msg[0] : msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (address: Address) => {
    setFormData({
      title: address.title || '',
      fullName: address.fullName,
      phone: address.phone,
      city: address.city,
      district: address.district,
      address: address.address,
      zipCode: address.zipCode || '',
      isDefault: address.isDefault,
    });
    setEditingId(address.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('address.deleteConfirm'))) return;
    try {
      await addressesApi.delete(id);
      toast.success(t('address.deleted'));
      await invalidateAddresses();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to delete address:', error);
      toast.error(t('address.deleteFailed'));
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await addressesApi.setDefault(id);
      toast.success(t('address.defaultUpdated'));
      await invalidateAddresses();
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') console.error('Failed to set default address:', error);
      toast.error(t('address.defaultFailed'));
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      fullName: '',
      phone: '',
      city: '',
      district: '',
      address: '',
      zipCode: '',
      isDefault: false,
    });
  };

  if (authLoading) {
    return <AuthLoadingScreen />;
  }
  if (!isAuthenticated) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-border-subtle rounded w-1/3" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-border-subtle rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">{t('address.myAddresses')}</h1>
            <p className="text-muted">{t('address.manageAddresses')}</p>
          </div>
          {addresses.length >= 10 ? (
            <div className="text-right">
              <p className="text-sm text-primary-600 font-medium mb-1">
                {locale === 'en' ? 'Address limit reached (10/10)' : 'Adres limiti doldu (10/10)'}
              </p>
              <p className="text-xs text-muted">
                {locale === 'en' 
                  ? 'Delete an address to add a new one' 
                  : 'Yeni adres eklemek için bir adres silin'}
              </p>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => {
                resetForm();
                setEditingId(null);
                setShowForm(true);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-inverted rounded hover:bg-primary-600">
              <PlusIcon className="w-5 h-5" />
              {t('address.newAddress')}
              <span className="text-xs bg-surface-elevated/20 px-2 py-0.5 rounded-sm">
                {addresses.length}/3
              </span>
            </Button>
          )}
        </div>

        {/* Address Limit Warning */}
        {addresses.length >= 10 && !showForm && (
          <div className="bg-primary-50 border border-primary-200 rounded p-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📍</span>
              <div>
                <p className="font-medium text-primary-800">
                  {locale === 'en' 
                    ? 'You have reached the maximum address limit' 
                    : 'Maksimum adres limitine ulaştınız'}
                </p>
                <p className="text-sm text-primary-700">
                  {locale === 'en' 
                    ? 'You can save up to 3 addresses. To add a new address, please delete one of your existing addresses first.'
                    : '3 adet adres kaydedebilirsiniz. Yeni bir adres eklemek için mevcut adreslerinizden birini silmeniz gerekmektedir.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {showForm && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-elevated rounded shadow-sm p-6 mb-6"
          >
            <h2 className="text-xl font-semibold mb-4">
              {editingId ? t('address.editAddress') : t('address.addNewAddress')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-body mb-1">
                  {t('address.addressTitle')}
                </label>
                <Input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="rounded"
                  placeholder={locale === 'en' ? 'Home, Work, etc.' : 'Ev, İş, vb.'}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    {t('checkout.fullName')} <span className="text-danger-500">*</span>
                  </label>
                  <Input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="rounded"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-body mb-1">
                    {t('checkout.phone')} <span className="text-danger-500">*</span>
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center bg-surface-alt border-r-0 rounded-l text-muted font-medium">
                      +90
                    </span>
                    <Input
                      type="tel"
                      value={formData.phone.replace('+90', '').replace(/\s/g, '').slice(0, 10).replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4').trim()}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                        const formatted = '+90' + digits;
                        setFormData({ ...formData, phone: formatted });
                      }}
                      placeholder="5XX XXX XX XX"
                      maxLength={14}
                      className="rounded-r rounded-l-none"
                      required
                    />
                  </div>
                  <p className="text-xs text-muted mt-1">
                    {locale === 'en' ? '10 digits without country code' : '10 rakam (ülke kodu olmadan)'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-1">
                  {t('address.cityDistrict')} <span className="text-danger-500">*</span>
                </label>
                <CityDistrictSelector
                  city={formData.city}
                  district={formData.district}
                  onCityChange={(city) => setFormData(prev => ({ ...prev, city, district: '' }))}
                  onDistrictChange={(district) => setFormData(prev => ({ ...prev, district }))}
                  cityPlaceholder={t('common.selectCity')}
                  districtPlaceholder={t('common.selectDistrict')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-1">
                  {t('common.address')} <span className="text-danger-500">*</span>
                </label>
                <Textarea value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="px-4 rounded"
                  rows={3}
                  required />
              </div>

              <div>
                <label className="block text-sm font-medium text-body mb-1">
                  {t('checkout.zipCode')}
                </label>
                <Input
                  type="text"
                  value={formData.zipCode}
                  onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                  className="rounded"
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="isDefault"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  label={t('address.setAsDefault')}
                />
              </div>

              <div className="flex gap-3">
                <Button variant="secondary" type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    resetForm();
                  }}
                  className="flex-1 px-4 rounded hover:bg-surface">
                  {t('common.cancel')}
                </Button>
                <Button variant="secondary" type="submit"
                  disabled={isSaving}
                  className="flex-1 px-4 py-2 bg-primary-500 text-inverted rounded hover:bg-primary-600 disabled:opacity-60">
                  {isSaving
                    ? (locale === 'en' ? 'Saving...' : 'Kaydediliyor...')
                    : editingId ? t('common.update') : t('common.save')}
                </Button>
              </div>
            </form>
          </motion.div>
        )}

        {addresses.length === 0 && !showForm ? (
          <div className="text-center py-16 bg-surface-elevated rounded">
            <p className="text-muted text-lg mb-4">{t('address.noAddresses')}</p>
            <Button variant="secondary" onClick={() => setShowForm(true)}
              className="px-6 py-3 bg-primary-500 text-inverted rounded hover:bg-primary-600">
              {t('address.addFirstAddress')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {addresses.map((address) => (
              <motion.div
                key={address.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-surface-elevated rounded shadow-sm p-6"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {address.isDefault && (
                      <span className="inline-block px-2 py-1 bg-primary-100 text-primary-700 text-xs rounded mb-2">
                        {t('common.default')}
                      </span>
                    )}
                    {address.title && (
                      <h3 className="font-semibold text-lg mb-2">{address.title}</h3>
                    )}
                    <p className="text-heading font-medium">{address.fullName}</p>
                    <p className="text-muted">{address.phone}</p>
                    <p className="text-muted mt-2">
                      {address.address}, {address.district}, {address.city}
                      {address.zipCode && ` ${address.zipCode}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!address.isDefault && (
                      <Button variant="secondary" onClick={() => handleSetDefault(address.id)}
                        className="p-2 text-primary-500 hover:bg-primary-50 rounded"
                        title={t('address.makeDefault')}>
                        <CheckIcon className="w-5 h-5" />
                      </Button>
                    )}
                    <Button variant="secondary" onClick={() => handleEdit(address)}
                      className="p-2 text-muted hover:bg-surface-alt rounded"
                      title={t('common.edit')}>
                      <PencilIcon className="w-5 h-5" />
                    </Button>
                    <Button variant="secondary" onClick={() => handleDelete(address.id)}
                      className="p-2 text-danger-500 hover:bg-danger-50 rounded"
                      title={t('common.delete')}>
                      <TrashIcon className="w-5 h-5" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
