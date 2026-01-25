'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { PlusIcon, PencilIcon, TrashIcon, CheckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { addressesApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import CityDistrictSelector from '@/components/CityDistrictSelector';
import { useTranslation } from '@/i18n/LanguageContext';

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
  const { isAuthenticated } = useAuthStore();
  const { t, locale } = useTranslation();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
    if (!isAuthenticated) {
      router.push('/login?redirect=/profile/addresses');
      return;
    }
    fetchAddresses();
  }, [isAuthenticated]);

  const fetchAddresses = async () => {
    setIsLoading(true);
    try {
      const response = await addressesApi.getAll();
      setAddresses(response.data.data || response.data || []);
    } catch (error) {
      console.error('Failed to fetch addresses:', error);
      toast.error(t('address.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await addressesApi.update(editingId, formData);
        toast.success(t('address.updated'));
      } else {
        await addressesApi.create(formData);
        toast.success(t('address.added'));
      }
      setShowForm(false);
      setEditingId(null);
      resetForm();
      fetchAddresses();
    } catch (error: any) {
      console.error('Failed to save address:', error);
      toast.error(error.response?.data?.message || t('address.saveFailed'));
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
    if (!confirm(t('address.deleteConfirm'))) {
      return;
    }
    try {
      await addressesApi.delete(id);
      toast.success(t('address.deleted'));
      fetchAddresses();
    } catch (error: any) {
      console.error('Failed to delete address:', error);
      toast.error(t('address.deleteFailed'));
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await addressesApi.setDefault(id);
      toast.success(t('address.defaultUpdated'));
      fetchAddresses();
    } catch (error: any) {
      console.error('Failed to set default address:', error);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">{t('address.myAddresses')}</h1>
            <p className="text-gray-600">{t('address.manageAddresses')}</p>
          </div>
          {addresses.length >= 3 ? (
            <div className="text-right">
              <p className="text-sm text-orange-600 font-medium mb-1">
                {locale === 'en' ? 'Address limit reached (3/3)' : 'Adres limiti doldu (3/3)'}
              </p>
              <p className="text-xs text-gray-500">
                {locale === 'en' 
                  ? 'Delete an address to add a new one' 
                  : 'Yeni adres eklemek için bir adres silin'}
              </p>
            </div>
          ) : (
            <button
              onClick={() => {
                resetForm();
                setEditingId(null);
                setShowForm(true);
              }}
              className="flex items-center gap-2 px-6 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600"
            >
              <PlusIcon className="w-5 h-5" />
              {t('address.newAddress')}
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                {addresses.length}/3
              </span>
            </button>
          )}
        </div>

        {/* Address Limit Warning */}
        {addresses.length >= 3 && !showForm && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-2xl">📍</span>
              <div>
                <p className="font-medium text-orange-800">
                  {locale === 'en' 
                    ? 'You have reached the maximum address limit' 
                    : 'Maksimum adres limitine ulaştınız'}
                </p>
                <p className="text-sm text-orange-700">
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
            className="bg-white rounded-xl shadow-sm p-6 mb-6"
          >
            <h2 className="text-xl font-semibold mb-4">
              {editingId ? t('address.editAddress') : t('address.addNewAddress')}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('address.addressTitle')}
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder={locale === 'en' ? 'Home, Work, etc.' : 'Ev, İş, vb.'}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('checkout.fullName')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('checkout.phone')} <span className="text-red-500">*</span>
                  </label>
                  <div className="flex">
                    <span className="inline-flex items-center px-3 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-gray-500 text-sm font-medium">
                      +90
                    </span>
                    <input
                      type="tel"
                      value={formData.phone.replace('+90', '').replace(/\s/g, '').slice(0, 10).replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4').trim()}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                        const formatted = '+90' + digits;
                        setFormData({ ...formData, phone: formatted });
                      }}
                      placeholder="5XX XXX XX XX"
                      maxLength={14}
                      className="w-full px-4 py-2 border border-gray-300 rounded-r-lg"
                      required
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {locale === 'en' ? '10 digits without country code' : '10 rakam (ülke kodu olmadan)'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('address.cityDistrict')} <span className="text-red-500">*</span>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('common.address')} <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  rows={3}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('checkout.zipCode')}
                </label>
                <input
                  type="text"
                  value={formData.zipCode}
                  onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="isDefault" className="text-sm text-gray-700">
                  {t('address.setAsDefault')}
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    resetForm();
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
                >
                  {editingId ? t('common.update') : t('common.save')}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {addresses.length === 0 && !showForm ? (
          <div className="text-center py-16 bg-white rounded-xl">
            <p className="text-gray-600 text-lg mb-4">{t('address.noAddresses')}</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-6 py-3 bg-primary-500 text-white rounded-xl hover:bg-primary-600"
            >
              {t('address.addFirstAddress')}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {addresses.map((address) => (
              <motion.div
                key={address.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-xl shadow-sm p-6"
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
                    <p className="text-gray-900 font-medium">{address.fullName}</p>
                    <p className="text-gray-600">{address.phone}</p>
                    <p className="text-gray-600 mt-2">
                      {address.address}, {address.district}, {address.city}
                      {address.zipCode && ` ${address.zipCode}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!address.isDefault && (
                      <button
                        onClick={() => handleSetDefault(address.id)}
                        className="p-2 text-primary-500 hover:bg-primary-50 rounded-lg"
                        title={t('address.makeDefault')}
                      >
                        <CheckIcon className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(address)}
                      className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                      title={t('common.edit')}
                    >
                      <PencilIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(address.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      title={t('common.delete')}
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
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
